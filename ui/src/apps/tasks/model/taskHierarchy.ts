// STATUS: DIAMANT VGT SUPREME — canonical Tasks hierarchy/checklist operations
import type { TaskChecklistItem, TaskItem } from '../../../shared/contracts/work-management/workspaceWork';
import {
  applyTaskPatch,
  canAssignTaskParent,
  createStableTaskId,
  createTaskItem,
  type TaskMutationContext,
} from './taskModel';

export interface SubtaskInheritance {
  project: boolean;
  phase: boolean;
  plan: boolean;
}

export const DEFAULT_SUBTASK_INHERITANCE: SubtaskInheritance = {
  project: true,
  phase: true,
  plan: true,
};

export function createChecklistItem(title: string, completed = false): TaskChecklistItem {
  return {
    id: createStableTaskId('check'),
    title: title.trim().slice(0, 4_096),
    completed,
  };
}

export function createChildTask(
  parent: TaskItem,
  title: string,
  inheritance: SubtaskInheritance = DEFAULT_SUBTASK_INHERITANCE,
  context: TaskMutationContext = {},
): TaskItem {
  return createTaskItem({
    title,
    priority: parent.priority,
    parentTaskId: parent.id,
    projectId: inheritance.project ? parent.projectId : undefined,
    phaseId: inheritance.phase ? parent.phaseId : undefined,
    planId: inheritance.plan ? parent.planId : undefined,
    tags: parent.tags,
    assignees: parent.assignees,
    listId: parent.listId,
    inbox: false,
  }, context);
}

export function checklistItemToSubtask(
  parent: TaskItem,
  item: TaskChecklistItem,
  inheritance: SubtaskInheritance = DEFAULT_SUBTASK_INHERITANCE,
  context: TaskMutationContext = {},
): TaskItem {
  const child = createChildTask(parent, item.title, inheritance, context);
  return item.completed
    ? applyTaskPatch(child, { completed: true }, context)
    : child;
}

export function subtaskToChecklistItem(child: TaskItem): TaskChecklistItem {
  return createChecklistItem(child.title, child.completed);
}

function depthOf(task: TaskItem, byId: Map<string, TaskItem>): number {
  let depth = 0;
  let current = task;
  const seen = new Set<string>([task.id]);
  while (current.parentTaskId) {
    if (seen.has(current.parentTaskId)) return Number.MAX_SAFE_INTEGER;
    seen.add(current.parentTaskId);
    const parent = byId.get(current.parentTaskId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

export function rollupTaskHierarchy(tasks: TaskItem[], context: TaskMutationContext = {}): TaskItem[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const parents = tasks
    .filter((task) => tasks.some((candidate) => candidate.parentTaskId === task.id))
    .sort((a, b) => depthOf(b, byId) - depthOf(a, byId));

  let result = tasks;
  for (const parent of parents) {
    const children = result.filter((task) => task.parentTaskId === parent.id);
    if (!children.length) continue;
    const progress = Math.round(children.reduce((sum, child) => sum + (child.progress ?? (child.completed ? 100 : 0)), 0) / children.length);
    result = result.map((task) => task.id === parent.id
      ? applyTaskPatch(task, { progress }, { ...context, source: context.source ?? 'astraea.tasks.rollup' })
      : task);
  }
  return result;
}

export function reparentTaskBatch(
  tasks: TaskItem[],
  taskIds: string[],
  parentTaskId: string | undefined,
  context: TaskMutationContext = {},
): { ok: true; tasks: TaskItem[] } | { ok: false; error: string } {
  const uniqueIds = [...new Set(taskIds)];
  if (!uniqueIds.length) return { ok: false, error: 'Select at least one task to move.' };
  const known = new Set(tasks.map((task) => task.id));
  if (uniqueIds.some((id) => !known.has(id))) return { ok: false, error: 'One or more selected tasks no longer exist.' };
  if (parentTaskId && !known.has(parentTaskId)) return { ok: false, error: 'Target parent no longer exists.' };
  if (parentTaskId && uniqueIds.includes(parentTaskId)) return { ok: false, error: 'A task cannot be moved under itself.' };
  for (const id of uniqueIds) {
    if (!canAssignTaskParent(tasks, id, parentTaskId)) return { ok: false, error: 'Move rejected because it would create a parent cycle.' };
  }
  const moved = tasks.map((task) => uniqueIds.includes(task.id)
    ? applyTaskPatch(task, { parentTaskId }, { ...context, source: context.source ?? 'astraea.tasks.reparent' })
    : task);
  return { ok: true, tasks: rollupTaskHierarchy(moved, context) };
}
