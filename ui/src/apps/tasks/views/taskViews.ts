// STATUS: DIAMANT VGT SUPREME — canonical Tasks view projection + atomic bulk edit core
import type {
  TaskBoardGroupBy,
  TaskFilterDefinition,
  TaskGroupBy,
  TaskItem,
  TaskSortBy,
  TaskStatusDefinition,
  TaskViewPreferences,
} from '../../../shared/contracts/work-management/workspaceWork';
import { applyTaskPatch, resolveCanonicalTaskStatus, TASK_SYSTEM_STATUS_DEFINITIONS, type TaskMutationContext } from '../model/taskModel';
import { matchesTaskFilter } from '../state/taskOrganization';

export const DEFAULT_TASK_VIEW_PREFERENCES: TaskViewPreferences = {
  mode: 'list',
  boardBy: 'status',
  groupBy: 'none',
  sortBy: 'manual',
  sortDirection: 'asc',
  filter: {},
  manualOrder: [],
};

export interface TaskViewGroup {
  id: string;
  label: string;
  tasks: TaskItem[];
}

export interface TaskCalendarBucket {
  date: string;
  tasks: TaskItem[];
}

export interface TaskTimelineItem {
  task: TaskItem;
  start?: string;
  end?: string;
}

const priorityRank: Record<TaskItem['priority'], number> = { high: 0, medium: 1, low: 2 };
const MAX_BULK_TASKS = 2_000;

function text(value?: string): string { return (value ?? '').trim(); }
function datePart(value?: string): string | undefined { return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]; }
function compareText(a?: string, b?: string): number { return text(a).localeCompare(text(b), undefined, { sensitivity: 'base' }); }

function compareTasks(a: TaskItem, b: TaskItem, sortBy: TaskSortBy, manualOrder: string[]): number {
  switch (sortBy) {
    case 'due': {
      const ad = datePart(a.dueAt ?? a.dueDate) ?? '9999-12-31';
      const bd = datePart(b.dueAt ?? b.dueDate) ?? '9999-12-31';
      return ad.localeCompare(bd) || compareText(a.title, b.title);
    }
    case 'priority': return priorityRank[a.priority] - priorityRank[b.priority] || compareText(a.title, b.title);
    case 'created': return (a.createdAt ?? 0) - (b.createdAt ?? 0) || compareText(a.title, b.title);
    case 'updated': return (a.updatedAt ?? 0) - (b.updatedAt ?? 0) || compareText(a.title, b.title);
    case 'manual': {
      const ai = manualOrder.indexOf(a.id);
      const bi = manualOrder.indexOf(b.id);
      const av = ai < 0 ? Number.MAX_SAFE_INTEGER : ai;
      const bv = bi < 0 ? Number.MAX_SAFE_INTEGER : bi;
      return av - bv || (a.createdAt ?? 0) - (b.createdAt ?? 0) || compareText(a.title, b.title);
    }
  }
}

export function combineTaskFilters(...filters: TaskFilterDefinition[]): TaskFilterDefinition {
  const all = <T>(selector: (filter: TaskFilterDefinition) => T[] | undefined): T[] | undefined => {
    const values = filters.flatMap((filter) => selector(filter) ?? []);
    return values.length ? Array.from(new Set(values)) : undefined;
  };
  const textFilter = filters.map((filter) => filter.text?.trim()).filter(Boolean).join(' ');
  const due = [...filters].reverse().find((filter) => filter.due && filter.due !== 'any')?.due;
  const completed = [...filters].reverse().find((filter) => filter.completed !== undefined)?.completed;
  const important = [...filters].reverse().find((filter) => filter.important !== undefined)?.important;
  return {
    text: textFilter || undefined,
    statuses: all((filter) => filter.statuses),
    priorities: all((filter) => filter.priorities),
    tags: all((filter) => filter.tags),
    assignees: all((filter) => filter.assignees),
    projectIds: all((filter) => filter.projectIds),
    listIds: all((filter) => filter.listIds),
    due,
    completed,
    important,
  };
}

export function projectTaskView(
  tasks: TaskItem[],
  preferences: TaskViewPreferences,
  additionalFilter: TaskFilterDefinition = {},
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): TaskItem[] {
  const filter = combineTaskFilters(preferences.filter, additionalFilter);
  const direction = preferences.sortDirection === 'desc' ? -1 : 1;
  return tasks
    .filter((task) => matchesTaskFilter(task, filter, undefined, definitions))
    .slice()
    .sort((a, b) => direction * compareTasks(a, b, preferences.sortBy, preferences.manualOrder));
}

function groupValue(task: TaskItem, groupBy: TaskGroupBy, definitions: TaskStatusDefinition[]): Array<{ id: string; label: string }> {
  switch (groupBy) {
    case 'project': return [{ id: task.projectId ?? 'none', label: task.projectId ?? 'No project' }];
    case 'list': return [{ id: task.listId ?? 'none', label: task.listId ?? 'No list' }];
    case 'assignee': {
      const values = task.assignees ?? (task.assignee ? [task.assignee] : []);
      return values.length ? values.map((value) => ({ id: value, label: value })) : [{ id: 'unassigned', label: 'Unassigned' }];
    }
    case 'tag': return task.tags?.length ? task.tags.map((tag) => ({ id: tag, label: tag })) : [{ id: 'untagged', label: 'Untagged' }];
    case 'status': {
      const id = task.status ?? resolveCanonicalTaskStatus(task, definitions);
      const label = definitions.find((definition) => definition.id === id)?.label ?? id;
      return [{ id, label }];
    }
    case 'none': return [{ id: 'all', label: 'All tasks' }];
  }
}

export function groupTaskView(tasks: TaskItem[], groupBy: TaskGroupBy, definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS): TaskViewGroup[] {
  const groups = new Map<string, TaskViewGroup>();
  for (const task of tasks) {
    for (const value of groupValue(task, groupBy, definitions)) {
      const key = `${groupBy}:${value.id}`;
      const group = groups.get(key) ?? { id: key, label: value.label, tasks: [] };
      group.tasks.push(task);
      groups.set(key, group);
    }
  }
  return Array.from(groups.values()).sort((a, b) => compareText(a.label, b.label));
}

export function boardTaskView(tasks: TaskItem[], boardBy: TaskBoardGroupBy, definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS): TaskViewGroup[] {
  return groupTaskView(tasks, boardBy === 'priority' ? 'none' : boardBy as TaskGroupBy, definitions)
    .flatMap((group) => boardBy !== 'priority' ? [group] : []);
}

export function boardTaskColumns(tasks: TaskItem[], boardBy: TaskBoardGroupBy, definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS): TaskViewGroup[] {
  if (boardBy === 'priority') {
    return (['high', 'medium', 'low'] as const).map((priority) => ({
      id: `priority:${priority}`,
      label: `${priority[0].toUpperCase()}${priority.slice(1)} priority`,
      tasks: tasks.filter((task) => task.priority === priority),
    }));
  }
  if (boardBy === 'status') {
    const known = definitions.slice().sort((a, b) => a.order - b.order).map((definition) => ({
      id: `status:${definition.id}`,
      label: definition.label,
      tasks: tasks.filter((task) => (task.status ?? resolveCanonicalTaskStatus(task, definitions)) === definition.id),
    }));
    return known.filter((group) => group.tasks.length > 0);
  }
  return groupTaskView(tasks, boardBy === 'tag' ? 'tag' : 'project', definitions);
}

export function calendarTaskBuckets(tasks: TaskItem[]): TaskCalendarBucket[] {
  const buckets = new Map<string, TaskItem[]>();
  for (const task of tasks) {
    const date = datePart(task.dueAt ?? task.dueDate ?? task.startAt ?? task.startDate);
    if (!date) continue;
    buckets.set(date, [...(buckets.get(date) ?? []), task]);
  }
  return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, tasks: items }));
}

export function timelineTaskItems(tasks: TaskItem[]): TaskTimelineItem[] {
  return tasks.map((task) => ({ task, start: datePart(task.startAt ?? task.startDate), end: datePart(task.dueAt ?? task.dueDate) }))
    .filter((item) => item.start || item.end)
    .sort((a, b) => (a.start ?? a.end ?? '').localeCompare(b.start ?? b.end ?? '') || compareText(a.task.title, b.task.title));
}

const blockedBulkKeys = new Set(['id', 'createdAt', 'createdBy', 'recurrenceSeriesId', 'occurrenceKey', 'generatedFromTaskId']);

export interface BulkEditResult {
  ok: boolean;
  tasks: TaskItem[];
  changedIds: string[];
  error?: string;
}

export function applyTaskBulkEdit(
  tasks: TaskItem[],
  taskIds: string[],
  patch: Partial<TaskItem>,
  context: TaskMutationContext,
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): BulkEditResult {
  const ids = Array.from(new Set(taskIds));
  if (!ids.length) return { ok: false, tasks, changedIds: [], error: 'Select at least one task.' };
  if (ids.length > MAX_BULK_TASKS) return { ok: false, tasks, changedIds: [], error: `Bulk edit is limited to ${MAX_BULK_TASKS} tasks.` };
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (ids.some((id) => !byId.has(id))) return { ok: false, tasks, changedIds: [], error: 'Bulk edit contains an unknown task.' };
  for (const key of Object.keys(patch)) if (blockedBulkKeys.has(key)) return { ok: false, tasks, changedIds: [], error: `${key} is immutable in bulk edit.` };
  if (patch.priority && !['low', 'medium', 'high'].includes(patch.priority)) return { ok: false, tasks, changedIds: [], error: 'Invalid priority.' };
  if (patch.progress !== undefined && (!Number.isFinite(patch.progress) || patch.progress < 0 || patch.progress > 100)) return { ok: false, tasks, changedIds: [], error: 'Progress must be between 0 and 100.' };
  if (patch.parentTaskId && ids.includes(patch.parentTaskId)) return { ok: false, tasks, changedIds: [], error: 'A bulk-edited task cannot become its own parent batch.' };

  const changed = new Map<string, TaskItem>();
  try {
    for (const id of ids) {
      const current = byId.get(id)!;
      changed.set(id, applyTaskPatch(current, patch, context, definitions));
    }
  } catch (error) {
    return { ok: false, tasks, changedIds: [], error: error instanceof Error ? error.message : 'Bulk edit validation failed.' };
  }
  return { ok: true, tasks: tasks.map((task) => changed.get(task.id) ?? task), changedIds: ids };
}

export function normalizedTaskViewPreferences(value?: Partial<TaskViewPreferences>): TaskViewPreferences {
  const mode = value?.mode && ['list', 'compact', 'board', 'calendar', 'timeline'].includes(value.mode) ? value.mode : 'list';
  const boardBy = value?.boardBy && ['status', 'priority', 'tag', 'project'].includes(value.boardBy) ? value.boardBy : 'status';
  const groupBy = value?.groupBy && ['none', 'project', 'list', 'assignee', 'tag', 'status'].includes(value.groupBy) ? value.groupBy : 'none';
  const sortBy = value?.sortBy && ['due', 'priority', 'created', 'updated', 'manual'].includes(value.sortBy) ? value.sortBy : 'manual';
  const sortDirection = value?.sortDirection === 'desc' ? 'desc' : 'asc';
  return {
    mode, boardBy, groupBy, sortBy, sortDirection,
    filter: value?.filter ?? {},
    manualOrder: Array.from(new Set((value?.manualOrder ?? []).filter(Boolean))).slice(0, 20_000),
  };
}
