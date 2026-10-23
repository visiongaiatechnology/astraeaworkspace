// STATUS: DIAMANT VGT SUPREME — personal task organization core
import type {
  TaskBuiltInView,
  TaskFilterDefinition,
  TaskItem,
  TaskListFolder,
  TaskOrganizationState,
  TaskSavedFilter,
  TaskSmartList,
  TaskStatusDefinition,
  TaskUserList,
} from '../../../shared/contracts/work-management/workspaceWork';
import { createStableTaskId, resolveCanonicalTaskStatus, TASK_SYSTEM_STATUS_DEFINITIONS } from '../model/taskModel';

export type TaskOrganizationSelection =
  | `builtin:${TaskBuiltInView}`
  | `list:${string}`
  | `smart:${string}`
  | `saved:${string}`;

export const DEFAULT_TASK_ORGANIZATION: TaskOrganizationState = {
  localIdentity: 'Local User',
  lists: [],
  folders: [],
  smartLists: [],
  savedFilters: [],
};

function cleanName(value: string, fallback: string): string {
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  return (clean || fallback).slice(0, 128);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function normalizeTaskOrganization(state?: Partial<TaskOrganizationState>): TaskOrganizationState {
  const folders = uniqueById((state?.folders ?? []).map((folder) => ({ ...folder, name: cleanName(folder.name, 'Folder') })));
  const folderIds = new Set(folders.map((folder) => folder.id));
  return {
    localIdentity: cleanName(state?.localIdentity ?? DEFAULT_TASK_ORGANIZATION.localIdentity, 'Local User'),
    folders,
    lists: uniqueById((state?.lists ?? []).map((list) => ({
      ...list,
      name: cleanName(list.name, 'List'),
      folderId: list.folderId && folderIds.has(list.folderId) ? list.folderId : undefined,
    }))),
    smartLists: uniqueById((state?.smartLists ?? []).map((list) => ({ ...list, name: cleanName(list.name, 'Smart list') }))),
    savedFilters: uniqueById((state?.savedFilters ?? []).map((filter) => ({ ...filter, name: cleanName(filter.name, 'Saved filter') }))),
  };
}

export function todayLocalDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function taskDate(value?: string): string | undefined {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
}

function lower(value: string): string { return value.trim().toLocaleLowerCase(); }

function includesIdentity(values: string[] | undefined, identity: string): boolean {
  const key = lower(identity);
  return Boolean(key) && (values ?? []).some((value) => lower(value) === key);
}

export function matchesTaskFilter(
  task: TaskItem,
  filter: TaskFilterDefinition,
  today = todayLocalDate(),
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): boolean {
  const due = taskDate(task.dueAt ?? task.dueDate);
  const canonical = resolveCanonicalTaskStatus(task, definitions);
  if (filter.text) {
    const needle = lower(filter.text);
    const haystack = [task.title, task.description ?? '', ...(task.tags ?? []), ...(task.comments ?? []).map((comment) => comment.text)].join('\n').toLocaleLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (filter.statuses?.length && !filter.statuses.includes(task.status ?? canonical)) return false;
  if (filter.priorities?.length && !filter.priorities.includes(task.priority)) return false;
  if (filter.tags?.length && !filter.tags.every((tag) => (task.tags ?? []).some((candidate) => lower(candidate) === lower(tag)))) return false;
  if (filter.assignees?.length && !filter.assignees.some((identity) => includesIdentity(task.assignees ?? (task.assignee ? [task.assignee] : []), identity))) return false;
  if (filter.projectIds?.length && (!task.projectId || !filter.projectIds.includes(task.projectId))) return false;
  if (filter.listIds?.length && (!task.listId || !filter.listIds.includes(task.listId))) return false;
  if (filter.completed !== undefined && task.completed !== filter.completed) return false;
  if (filter.important !== undefined && Boolean(task.important) !== filter.important) return false;
  if (filter.due === 'none' && due) return false;
  if (filter.due === 'overdue' && (!due || due >= today || task.completed)) return false;
  if (filter.due === 'today' && due !== today) return false;
  if (filter.due === 'future' && (!due || due <= today)) return false;
  return true;
}

export function matchesBuiltInView(
  task: TaskItem,
  view: TaskBuiltInView,
  organization: TaskOrganizationState,
  today = todayLocalDate(),
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): boolean {
  const due = taskDate(task.dueAt ?? task.dueDate);
  const start = taskDate(task.startAt ?? task.startDate);
  const canonical = resolveCanonicalTaskStatus(task, definitions);
  switch (view) {
    case 'my_day': return task.myDayDate === today;
    case 'inbox': return Boolean(task.inbox);
    case 'all': return true;
    case 'important': return Boolean(task.important);
    case 'planned': return Boolean(due || start);
    case 'upcoming': return Boolean(due && due > today && !task.completed);
    case 'overdue': return Boolean(due && due < today && !task.completed);
    case 'completed': return canonical === 'done' || task.completed;
    case 'assigned_to_me': return includesIdentity(task.assignees ?? (task.assignee ? [task.assignee] : []), organization.localIdentity);
    case 'created_by_me': return lower(task.createdBy ?? '') === lower(organization.localIdentity);
    case 'waiting_blocked': return canonical === 'waiting' || canonical === 'blocked';
  }
}

export function filterTasksForSelection(
  tasks: TaskItem[],
  selection: TaskOrganizationSelection,
  organization: TaskOrganizationState,
  today = todayLocalDate(),
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): TaskItem[] {
  if (selection.startsWith('builtin:')) {
    const view = selection.slice('builtin:'.length) as TaskBuiltInView;
    return tasks.filter((task) => matchesBuiltInView(task, view, organization, today, definitions));
  }
  if (selection.startsWith('list:')) {
    const id = selection.slice('list:'.length);
    return tasks.filter((task) => task.listId === id);
  }
  if (selection.startsWith('smart:')) {
    const id = selection.slice('smart:'.length);
    const smart = organization.smartLists.find((item) => item.id === id);
    return smart ? tasks.filter((task) => matchesTaskFilter(task, smart.filter, today, definitions)) : [];
  }
  const id = selection.slice('saved:'.length);
  const saved = organization.savedFilters.find((item) => item.id === id);
  return saved ? tasks.filter((task) => matchesTaskFilter(task, saved.filter, today, definitions)) : [];
}

export function createTaskFolder(name: string, now = Date.now()): TaskListFolder {
  return { id: createStableTaskId('task-folder'), name: cleanName(name, 'Folder'), createdAt: now };
}

export function createTaskList(name: string, folderId?: string, now = Date.now()): TaskUserList {
  return { id: createStableTaskId('task-list'), name: cleanName(name, 'List'), folderId, createdAt: now };
}

export function createSmartList(name: string, filter: TaskFilterDefinition, now = Date.now()): TaskSmartList {
  return { id: createStableTaskId('task-smart'), name: cleanName(name, 'Smart list'), filter, createdAt: now };
}

export function createSavedFilter(name: string, filter: TaskFilterDefinition, now = Date.now()): TaskSavedFilter {
  return { id: createStableTaskId('task-filter'), name: cleanName(name, 'Saved filter'), filter, createdAt: now };
}

export function organizationPatchForSelection(selection: TaskOrganizationSelection, today = todayLocalDate()): Partial<TaskItem> {
  if (selection === 'builtin:my_day') return { myDayDate: today, inbox: true };
  if (selection === 'builtin:important') return { important: true, inbox: true };
  if (selection === 'builtin:inbox' || selection === 'builtin:all') return { inbox: true };
  if (selection.startsWith('list:')) return { listId: selection.slice('list:'.length), inbox: false };
  return { inbox: true };
}
