// STATUS: DIAMANT VGT SUPREME — local-only task notification engine
import type {
  ProjectDependency,
  TaskItem,
  TaskNotificationItem,
  TaskNotificationKind,
  TaskNotificationPolicy,
  TaskNotificationState,
  TaskQuietHours,
} from '../../../shared/contracts/work-management/workspaceWork';

export const DEFAULT_TASK_QUIET_HOURS: TaskQuietHours = { enabled: false, startMinutes: 22 * 60, endMinutes: 7 * 60 };
export const DEFAULT_TASK_NOTIFICATION_STATE: TaskNotificationState = { quietHours: DEFAULT_TASK_QUIET_HOURS, policies: [], items: [] };
export const TASK_NOTIFICATION_MAX_ITEMS = 1_000;

function clean(value: string, max = 512): string { return value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max); }
function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function datePart(value?: string): string | undefined { return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]; }
function minuteOfDay(now: Date): number { return now.getHours() * 60 + now.getMinutes(); }
function lower(value?: string): string { return (value ?? '').trim().toLocaleLowerCase(); }

export function isTaskQuietHours(quiet: TaskQuietHours, now: Date): boolean {
  if (!quiet.enabled) return false;
  const minute = minuteOfDay(now);
  const start = Math.max(0, Math.min(1439, Math.floor(quiet.startMinutes)));
  const end = Math.max(0, Math.min(1439, Math.floor(quiet.endMinutes)));
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function taskNotificationPolicyAllows(task: TaskItem, kind: TaskNotificationKind, policies: TaskNotificationPolicy[]): boolean {
  const relevant = policies.filter((policy) =>
    (policy.scope === 'list' && task.listId === policy.scopeId) || (policy.scope === 'project' && task.projectId === policy.scopeId));
  if (!relevant.length) return true;
  return relevant.every((policy) => policy.enabled && !(policy.mutedKinds ?? []).includes(kind));
}

function notificationId(kind: TaskNotificationKind, taskId: string, discriminator: string): string {
  const safe = discriminator.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 180);
  return `task-notify:${kind}:${taskId}:${safe}`;
}

function createNotification(kind: TaskNotificationKind, task: TaskItem, discriminator: string, title: string, body: string, createdAt: number): TaskNotificationItem {
  return { id: notificationId(kind, task.id, discriminator), kind, taskId: task.id, createdAt, title: clean(title, 180), body: clean(body), read: false, source: 'local' };
}

function reminderTime(task: TaskItem, rule: NonNullable<TaskItem['reminders']>[number]): number | undefined {
  if (!rule.enabled) return undefined;
  const snooze = rule.snoozedUntil ? Date.parse(rule.snoozedUntil) : NaN;
  if (Number.isFinite(snooze)) return snooze;
  const absolute = rule.at ? Date.parse(rule.at) : NaN;
  if (Number.isFinite(absolute)) return absolute;
  if (rule.offsetMinutes !== undefined) {
    const base = Date.parse(task.dueAt ?? task.dueDate ?? '');
    // Single definition of TaskReminderRule.offsetMinutes: minutes BEFORE the due instant
    // (the Tasks UI labels the field "minutesBeforeDue" and never produces a negative value).
    // `effectiveReminderAt` in recurrence/taskRecurrence.ts subtracts the same field; adding it
    // here fired every relative reminder after its own due date.
    if (Number.isFinite(base)) return base - rule.offsetMinutes * 60_000;
  }
  return undefined;
}

function dependencyUnblocked(taskId: string, tasks: Map<string, TaskItem>, dependencies: ProjectDependency[]): boolean {
  const incoming = dependencies.filter((dependency) => dependency.successorTaskId === taskId);
  return incoming.length > 0 && incoming.every((dependency) => tasks.get(dependency.predecessorTaskId)?.completed);
}

export function evaluateTaskNotifications(
  tasks: TaskItem[],
  dependencies: ProjectDependency[],
  state: TaskNotificationState,
  localIdentity: string,
  nowMs = Date.now(),
): TaskNotificationState {
  const now = new Date(nowMs);
  const today = localDate(now);
  const tomorrow = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const existing = new Map(state.items.map((item) => [item.id, item]));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const last = state.lastEvaluatedAt ?? 0;
  const add = (notification: TaskNotificationItem, task: TaskItem) => {
    if (!taskNotificationPolicyAllows(task, notification.kind, state.policies)) return;
    if (!existing.has(notification.id)) existing.set(notification.id, notification);
  };

  for (const task of tasks) {
    if (task.completed) continue;
    const due = datePart(task.dueAt ?? task.dueDate);
    if (due && due < today) add(createNotification('overdue', task, due, 'Task overdue', `${task.title} was due ${due}.`, nowMs), task);
    else if (due === today || due === tomorrow) add(createNotification('due_soon', task, due, 'Task due soon', `${task.title} is due ${due}.`, nowMs), task);

    for (const rule of task.reminders ?? []) {
      const when = reminderTime(task, rule);
      if (when !== undefined && when <= nowMs && when > last) add(createNotification('reminder', task, rule.id, rule.label || 'Task reminder', task.title, when), task);
    }

    for (const comment of task.comments ?? []) {
      if (comment.createdAt <= last || comment.createdAt > nowMs) continue;
      const mentioned = (comment.mentions ?? []).some((identity) => lower(identity) === lower(localIdentity));
      const watched = (task.watchers ?? []).some((identity) => lower(identity) === lower(localIdentity));
      if (mentioned) add(createNotification('mention', task, comment.id, 'You were mentioned', `${comment.author}: ${comment.text}`, comment.createdAt), task);
      else if (watched) add(createNotification('comment', task, comment.id, 'New task comment', `${comment.author}: ${comment.text}`, comment.createdAt), task);
    }

    const assignment = (task.activity ?? []).filter((event) => event.kind === 'assignment_changed' && event.at > last && event.at <= nowMs).at(-1);
    const assignedNow = (task.assignees ?? (task.assignee ? [task.assignee] : [])).some((identity) => lower(identity) === lower(localIdentity));
    if (assignment && assignedNow) add(createNotification('assignment_change', task, assignment.id, 'Task assigned to you', task.title, assignment.at), task);

    if (dependencyUnblocked(task.id, taskMap, dependencies)) {
      const signature = dependencies.filter((dependency) => dependency.successorTaskId === task.id).map((dependency) => dependency.id).sort().join('.');
      add(createNotification('dependency_unblocked', task, signature, 'Dependency unblocked', `${task.title} is ready to continue.`, nowMs), task);
    }
  }

  return normalizeTaskNotificationState({ ...state, items: Array.from(existing.values()).sort((a, b) => b.createdAt - a.createdAt), lastEvaluatedAt: nowMs });
}

function sameNumber(left: number | undefined, right: number | undefined): boolean {
  return left === right || (left === undefined && right === undefined);
}

function sameStringList(left: string[] | undefined, right: string[] | undefined): boolean {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

/** Compares only persisted notification data; evaluation time is a runtime high-water mark. */
export function hasTaskNotificationPersistenceChanges(previous: TaskNotificationState, next: TaskNotificationState): boolean {
  if (previous.quietHours.enabled !== next.quietHours.enabled
    || previous.quietHours.startMinutes !== next.quietHours.startMinutes
    || previous.quietHours.endMinutes !== next.quietHours.endMinutes
    || previous.policies.length !== next.policies.length
    || previous.items.length !== next.items.length) return true;

  for (let index = 0; index < previous.policies.length; index += 1) {
    const left = previous.policies[index];
    const right = next.policies[index];
    if (left.id !== right.id || left.scope !== right.scope || left.scopeId !== right.scopeId || left.enabled !== right.enabled
      || !sameStringList(left.mutedKinds, right.mutedKinds)) return true;
  }

  for (let index = 0; index < previous.items.length; index += 1) {
    const left = previous.items[index];
    const right = next.items[index];
    if (left.id !== right.id || left.kind !== right.kind || left.taskId !== right.taskId || left.createdAt !== right.createdAt
      || left.title !== right.title || left.body !== right.body || left.read !== right.read || left.source !== right.source
      || !sameNumber(left.desktopDeliveredAt, right.desktopDeliveredAt)) return true;
  }

  return false;
}

export function normalizeTaskNotificationState(value?: Partial<TaskNotificationState>): TaskNotificationState {
  const quiet = value?.quietHours ?? DEFAULT_TASK_QUIET_HOURS;
  const policies = (value?.policies ?? []).filter((policy) => policy.id && policy.scopeId).slice(0, 500).map((policy) => ({
    ...policy,
    scopeId: clean(policy.scopeId, 192),
    mutedKinds: Array.from(new Set(policy.mutedKinds ?? [])),
  }));
  const seen = new Set<string>();
  const items = (value?.items ?? []).filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id); return true;
  }).slice(0, TASK_NOTIFICATION_MAX_ITEMS).map((item) => ({ ...item, title: clean(item.title, 180), body: clean(item.body), source: 'local' as const }));
  return {
    quietHours: { enabled: Boolean(quiet.enabled), startMinutes: Math.max(0, Math.min(1439, Math.floor(quiet.startMinutes))), endMinutes: Math.max(0, Math.min(1439, Math.floor(quiet.endMinutes))) },
    policies,
    items,
    lastEvaluatedAt: Number.isFinite(value?.lastEvaluatedAt) ? value?.lastEvaluatedAt : undefined,
  };
}

export function markTaskNotificationRead(state: TaskNotificationState, id: string, read = true): TaskNotificationState {
  return { ...state, items: state.items.map((item) => item.id === id ? { ...item, read } : item) };
}

export function clearReadTaskNotifications(state: TaskNotificationState): TaskNotificationState {
  return { ...state, items: state.items.filter((item) => !item.read) };
}

export interface LocalDesktopNotificationApi {
  permission(): NotificationPermission | 'unsupported';
  requestPermission(): Promise<NotificationPermission | 'unsupported'>;
  show(title: string, options: NotificationOptions): void;
}

export function browserLocalNotificationApi(): LocalDesktopNotificationApi {
  return {
    permission: () => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    requestPermission: async () => typeof Notification === 'undefined' ? 'unsupported' : Notification.requestPermission(),
    show: (title, options) => { if (typeof Notification !== 'undefined') new Notification(title, options); },
  };
}

export function deliverPendingDesktopNotifications(state: TaskNotificationState, api: LocalDesktopNotificationApi, nowMs = Date.now()): TaskNotificationState {
  if (api.permission() !== 'granted' || isTaskQuietHours(state.quietHours, new Date(nowMs))) return state;
  let changed = false;
  const items = state.items.map((item) => {
    if (item.desktopDeliveredAt) return item;
    api.show(item.title, { body: item.body, tag: item.id, silent: false });
    changed = true;
    return { ...item, desktopDeliveredAt: nowMs };
  });
  return changed ? { ...state, items } : state;
}

export function evaluateAndDeliverTaskNotifications(
  tasks: TaskItem[],
  dependencies: ProjectDependency[],
  state: TaskNotificationState,
  localIdentity: string,
  api: LocalDesktopNotificationApi,
  nowMs = Date.now(),
): { state: TaskNotificationState; shouldPersist: boolean } {
  const evaluated = evaluateTaskNotifications(tasks, dependencies, state, localIdentity, nowMs);
  const next = deliverPendingDesktopNotifications(evaluated, api, nowMs);
  return { state: next, shouldPersist: hasTaskNotificationPersistenceChanges(state, next) };
}
