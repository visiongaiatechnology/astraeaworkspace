// STATUS: DIAMANT VGT SUPREME — kanban board move core (pure)
//
// The board view rendered columns but offered no way to change a card's status: card rows only
// carried a completion toggle, a checkbox and an open handler. This module owns the whole
// decision for a board move — target validation, the patch it implies, and the ordering — so the
// drag handler and the keyboard handler cannot drift apart.
import type { TaskBoardGroupBy, TaskItem, TaskStatusDefinition } from '../../../shared/contracts/work-management/workspaceWork';
import { TASK_SYSTEM_STATUS_DEFINITIONS } from '../model/taskModel';

export const TASK_BOARD_GROUP_BYS: ReadonlyArray<TaskBoardGroupBy> = ['status', 'priority', 'tag', 'project'];
export const TASK_BOARD_PRIORITIES: ReadonlyArray<TaskItem['priority']> = ['high', 'medium', 'low'];
/** A single board move may not reorder more than this many items. */
export const TASK_BOARD_MOVE_MAX_TASKS = 500;

export interface TaskBoardMoveResult {
  ok: boolean;
  tasks: TaskItem[];
  /** Ids whose board group actually changed, in board order. */
  changedIds: string[];
  error?: string;
}

export function isTaskBoardGroupBy(value: string): value is TaskBoardGroupBy {
  return (TASK_BOARD_GROUP_BYS as ReadonlyArray<string>).includes(value);
}

/** Column ids as emitted by `boardTaskColumns`; the only ids a drop may target. */
export function taskBoardColumnIds(
  tasks: TaskItem[],
  boardBy: TaskBoardGroupBy,
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): string[] {
  if (boardBy === 'priority') return TASK_BOARD_PRIORITIES.map((priority) => `priority:${priority}`);
  if (boardBy === 'status') return definitions.slice().sort((a, b) => a.order - b.order).map((definition) => `status:${definition.id}`);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const task of tasks) {
    const id = boardBy === 'tag' ? (task.tags?.[0] ?? 'untagged') : (task.projectId ?? 'none');
    const columnId = `${boardBy}:${id}`;
    if (seen.has(columnId)) continue;
    seen.add(columnId);
    ids.push(columnId);
  }
  return ids;
}

/** The board group a task currently sits in — the value `boardTaskColumns` filters on. */
export function taskBoardGroupId(
  task: TaskItem,
  boardBy: TaskBoardGroupBy,
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): string {
  if (boardBy === 'priority') return `priority:${task.priority}`;
  if (boardBy === 'status') {
    const status = task.status ?? (task.completed ? 'done' : 'not_started');
    const known = definitions.some((definition) => definition.id === status);
    return `status:${known ? status : definitions[0]?.id ?? 'not_started'}`;
  }
  if (boardBy === 'tag') return `tag:${task.tags?.[0] ?? 'untagged'}`;
  return `project:${task.projectId ?? 'none'}`;
}

/**
 * The patch a move into `columnId` implies, or an error when the column is not a legal target.
 * `priority` and `status` are the two group axes that also exist as task fields; `tag` and
 * `project` moves are rejected because a board drop would have to invent a tag or a project.
 */
export function taskBoardMovePatch(
  task: TaskItem,
  columnId: string,
  boardBy: TaskBoardGroupBy = 'status',
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): { patch: Partial<TaskItem> } | { error: string } {
  const separator = columnId.indexOf(':');
  if (separator <= 0) return { error: 'Drop target is not a board column.' };
  const axis = columnId.slice(0, separator);
  const value = columnId.slice(separator + 1);
  // A missing axis must not slip past this guard: an unknown grouping is rejected, never guessed.
  if (!isTaskBoardGroupBy(axis)) return { error: `Unknown board grouping "${axis}".` };
  if (axis !== boardBy) return { error: 'Drop target belongs to a different board grouping.' };

  if (boardBy === 'priority') {
    if (!(TASK_BOARD_PRIORITIES as ReadonlyArray<string>).includes(value)) return { error: `Unknown board priority "${value}".` };
    if (task.priority === value) return { patch: {} };
    return { patch: { priority: value as TaskItem['priority'] } };
  }

  if (boardBy === 'status') {
    const definition = definitions.find((candidate) => candidate.id === value);
    if (!definition) return { error: `Unknown board status "${value}".` };
    if (task.status === definition.id) return { patch: {} };
    const canonical = definition.mapsTo;
    return {
      patch: {
        status: definition.id,
        // Completion is derived from the mapped canonical status, never left contradicting it.
        completed: canonical === 'done',
        ...(canonical === 'done' ? { progress: 100 } : {}),
        ...(canonical === 'blocked' ? { blocked: true } : {}),
      },
    };
  }

  return { error: `A ${boardBy} board cannot be changed by dragging a card.` };
}

/** Board order: the column order of `axes`, then the incoming order inside each column. */
function orderKey(task: TaskItem, boardBy: TaskBoardGroupBy, columnIds: string[], definitions: TaskStatusDefinition[]): number {
  const columnId = taskBoardGroupId(task, boardBy, definitions);
  const index = columnIds.indexOf(columnId);
  return index === -1 ? columnIds.length : index;
}

/**
 * Applies `patch` only when the move is legal, and returns the tasks in board order so the
 * reordered board is what gets persisted.
 */
export function applyTaskBoardMove(
  tasks: TaskItem[],
  taskIds: string[],
  columnId: string,
  boardBy: TaskBoardGroupBy,
  patchFor: (task: TaskItem, patch: Partial<TaskItem>) => TaskItem,
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): TaskBoardMoveResult {
  const ids = Array.from(new Set(taskIds));
  if (!ids.length) return { ok: false, tasks, changedIds: [], error: 'Select at least one task.' };
  if (ids.length > TASK_BOARD_MOVE_MAX_TASKS) {
    return { ok: false, tasks, changedIds: [], error: `A board move is limited to ${TASK_BOARD_MOVE_MAX_TASKS} tasks.` };
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const unknown = ids.find((id) => !byId.has(id));
  if (unknown) return { ok: false, tasks, changedIds: [], error: `Unknown task "${unknown}".` };

  const changedIds: string[] = [];
  const next = new Map<string, TaskItem>();
  for (const id of ids) {
    const task = byId.get(id)!;
    const resolved = taskBoardMovePatch(task, columnId, boardBy, definitions);
    if ('error' in resolved) return { ok: false, tasks, changedIds: [], error: resolved.error };
    if (Object.keys(resolved.patch).length === 0) continue;
    next.set(id, patchFor(task, resolved.patch));
    changedIds.push(id);
  }
  if (!changedIds.length) return { ok: true, tasks, changedIds: [] };

  const columnIds = taskBoardColumnIds(tasks, boardBy, definitions);
  const moved = tasks.map((task) => next.get(task.id) ?? task);
  const stable = moved
    .map((task, index) => ({ task, index }))
    .sort((a, b) => orderKey(a.task, boardBy, columnIds, definitions) - orderKey(b.task, boardBy, columnIds, definitions) || a.index - b.index)
    .map((entry) => entry.task);
  return { ok: true, tasks: stable, changedIds };
}

/**
 * Keyboard equivalent of a card drop: the board axes with a real task field expose their
 * alternatives so a move can be performed without a pointer.
 */
export function taskBoardKeyboardTargets(
  task: TaskItem,
  boardBy: TaskBoardGroupBy,
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): string[] {
  if (boardBy === 'priority') return TASK_BOARD_PRIORITIES.filter((priority) => priority !== task.priority).map((priority) => `priority:${priority}`);
  if (boardBy === 'status') {
    const current = taskBoardGroupId(task, boardBy, definitions);
    return definitions.slice().sort((a, b) => a.order - b.order).map((definition) => `status:${definition.id}`).filter((id) => id !== current);
  }
  return [];
}
