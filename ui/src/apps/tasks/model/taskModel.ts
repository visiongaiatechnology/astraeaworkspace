// STATUS: DIAMANT VGT SUPREME
import {
  TaskActivityEvent,
  TaskActivityKind,
  TaskAttachment,
  TaskCanonicalStatus,
  TaskComment,
  TaskItem,
  TaskStatusDefinition,
} from '../../../shared/contracts/work-management/workspaceWork';

export const TASK_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const TASK_ATTACHMENTS_TOTAL_MAX_BYTES = 16 * 1024 * 1024;
export const TASK_ACTIVITY_MAX_EVENTS = 2_000;

export const TASK_SYSTEM_STATUS_DEFINITIONS: TaskStatusDefinition[] = [
  { id: 'not_started', label: 'Not started', mapsTo: 'not_started', order: 0, system: true },
  { id: 'active', label: 'Active', mapsTo: 'active', order: 1, system: true },
  { id: 'blocked', label: 'Blocked', mapsTo: 'blocked', order: 2, system: true },
  { id: 'waiting', label: 'Waiting', mapsTo: 'waiting', order: 3, system: true },
  { id: 'done', label: 'Done', mapsTo: 'done', order: 4, system: true },
  { id: 'cancelled', label: 'Cancelled', mapsTo: 'cancelled', order: 5, system: true },
];

export interface TaskMutationContext {
  now?: number;
  actor?: string;
  source?: string;
}

export interface CreateTaskInput {
  title: string;
  priority?: TaskItem['priority'];
  status?: string;
  completed?: boolean;
  progress?: number;
  dueDate?: string;
  dueAt?: string;
  startDate?: string;
  startAt?: string;
  projectId?: string;
  phaseId?: string;
  planId?: string;
  parentTaskId?: string;
  tags?: string[];
  assignees?: string[];
  important?: boolean;
  myDayDate?: string;
  inbox?: boolean;
  listId?: string;
}

function requireCrypto(): Crypto {
  const value = globalThis.crypto;
  if (!value || typeof value.getRandomValues !== 'function') {
    throw new Error('Secure random source unavailable; stable task identifiers cannot be created safely.');
  }
  return value;
}

export function isValidTaskId(value: string): boolean {
  const clean = value.trim();
  return clean.length >= 1 && clean.length <= 192 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(clean);
}

export function createStableTaskId(prefix = 'task'): string {
  const cryptoApi = requireCrypto();
  if (typeof cryptoApi.randomUUID === 'function') return `${prefix}-${cryptoApi.randomUUID()}`;
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function localDatePart(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1];
}

function normalizeIdentityList(values?: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const clean = value.trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function mutationMeta(context: TaskMutationContext): Required<TaskMutationContext> {
  return {
    now: context.now ?? Date.now(),
    actor: context.actor?.trim() || 'Local User',
    source: context.source?.trim() || 'astraea.tasks',
  };
}

export function resolveCanonicalTaskStatus(
  task: Pick<TaskItem, 'status' | 'completed' | 'blocked' | 'progress'>,
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): TaskCanonicalStatus {
  if (task.status) {
    const mapped = definitions.find((definition) => definition.id === task.status)?.mapsTo;
    if (mapped) return mapped;
    if (TASK_SYSTEM_STATUS_DEFINITIONS.some((definition) => definition.id === task.status)) {
      return task.status as TaskCanonicalStatus;
    }
  }
  if (task.completed) return 'done';
  if (task.blocked) return 'blocked';
  if ((task.progress ?? 0) > 0) return 'active';
  return 'not_started';
}

export function appendTaskActivity(
  activity: TaskActivityEvent[] | undefined,
  kind: TaskActivityKind,
  summary: string,
  context: TaskMutationContext = {},
): TaskActivityEvent[] {
  const meta = mutationMeta(context);
  const next: TaskActivityEvent = {
    id: createStableTaskId('activity'),
    kind,
    at: meta.now,
    actor: meta.actor,
    summary: summary.slice(0, 1_024),
    source: meta.source,
  };
  return [...(activity ?? []), next].slice(-TASK_ACTIVITY_MAX_EVENTS);
}

export function normalizeTaskItem(task: TaskItem, context: TaskMutationContext = {}): TaskItem {
  const meta = mutationMeta(context);
  const assignees = normalizeIdentityList(task.assignees ?? (task.assignee ? [task.assignee] : []));
  const progress = Math.max(0, Math.min(100, Math.round(task.progress ?? (task.completed ? 100 : 0))));
  const status = task.status ?? resolveCanonicalTaskStatus({ ...task, progress });
  const canonical = resolveCanonicalTaskStatus({ ...task, status, progress });
  const completed = canonical === 'done' || task.completed || progress === 100;
  const normalizedProgress = completed ? 100 : Math.min(progress, 99);
  const createdAt = Number.isFinite(task.createdAt) ? task.createdAt : meta.now;
  const createdBy = task.createdBy?.trim() || meta.actor;
  const recurrenceActive = Boolean(task.recurrenceSpec) || Boolean(task.recurrence && task.recurrence !== 'none');
  const recurrenceSeriesId = task.recurrenceSeriesId ?? (recurrenceActive ? task.id : undefined);
  const recurrenceIndex = recurrenceSeriesId ? Math.max(0, Math.floor(task.recurrenceIndex ?? 0)) : undefined;
  const recurrenceAnchor = task.dueAt ?? task.dueDate ?? task.startAt ?? task.startDate;
  const occurrenceKey = task.occurrenceKey
    ?? (recurrenceSeriesId && recurrenceAnchor ? `${recurrenceSeriesId}:${recurrenceIndex ?? 0}:${recurrenceAnchor}` : undefined);
  return {
    ...task,
    id: task.id,
    descriptionFormat: task.descriptionFormat ?? 'markdown',
    status: completed && TASK_SYSTEM_STATUS_DEFINITIONS.some((definition) => definition.id === status) ? 'done' : status,
    completed,
    blocked: canonical === 'blocked',
    progress: normalizedProgress,
    startDate: task.startDate ?? localDatePart(task.startAt),
    dueDate: task.dueDate ?? localDatePart(task.dueAt),
    assignee: assignees[0],
    assignees,
    watchers: normalizeIdentityList(task.watchers),
    important: Boolean(task.important),
    myDayDate: task.myDayDate,
    inbox: task.inbox ?? (!task.listId && !task.projectId),
    listId: task.listId,
    tags: Array.from(new Set((task.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
    createdAt,
    updatedAt: Number.isFinite(task.updatedAt) ? task.updatedAt : createdAt,
    createdBy,
    updatedBy: task.updatedBy?.trim() || createdBy,
    source: task.source?.trim() || meta.source,
    recurrence: task.recurrence ?? 'none',
    recurrenceSeriesId,
    recurrenceIndex,
    occurrenceKey,
    occurrenceState: task.occurrenceState ?? (recurrenceSeriesId ? 'scheduled' : undefined),
    reminders: task.reminders ?? [],
    activity: task.activity ?? [],
    checklist: task.checklist ?? [],
    comments: task.comments ?? [],
    attachments: task.attachments ?? [],
    linkedWorkspaceUris: task.linkedWorkspaceUris ?? [],
  };
}

export function createTaskItem(input: CreateTaskInput, context: TaskMutationContext = {}): TaskItem {
  const meta = mutationMeta(context);
  const task: TaskItem = {
    id: createStableTaskId(input.parentTaskId ? 'task-sub' : 'task'),
    title: input.title.trim(),
    completed: input.completed ?? false,
    progress: input.progress ?? (input.completed ? 100 : 0),
    status: input.status ?? (input.completed ? 'done' : 'not_started'),
    priority: input.priority ?? 'medium',
    startDate: input.startDate ?? localDatePart(input.startAt),
    dueDate: input.dueDate ?? localDatePart(input.dueAt),
    startAt: input.startAt,
    dueAt: input.dueAt,
    projectId: input.projectId,
    phaseId: input.phaseId,
    planId: input.planId,
    parentTaskId: input.parentTaskId,
    tags: input.tags ?? [],
    assignees: input.assignees ?? [],
    important: Boolean(input.important),
    myDayDate: input.myDayDate,
    inbox: input.inbox ?? (!input.listId && !input.projectId),
    listId: input.listId,
    recurrence: 'none',
    reminders: [],
    checklist: [],
    comments: [],
    attachments: [],
    linkedWorkspaceUris: [],
    plannerColumn: 'todo',
    createdAt: meta.now,
    updatedAt: meta.now,
    createdBy: meta.actor,
    updatedBy: meta.actor,
    source: meta.source,
  };
  task.activity = appendTaskActivity([], 'created', 'Task created.', meta);
  return normalizeTaskItem(task, meta);
}

function patchSummary(before: TaskItem, after: TaskItem): { kind: TaskActivityKind; summary: string } | undefined {
  if (before.status !== after.status || before.completed !== after.completed) {
    return { kind: 'status_changed', summary: `Status changed from ${before.status ?? 'not_started'} to ${after.status ?? 'not_started'}.` };
  }
  if (JSON.stringify(before.assignees ?? []) !== JSON.stringify(after.assignees ?? [])) {
    return { kind: 'assignment_changed', summary: 'Assignees changed.' };
  }
  if ((after.comments?.length ?? 0) > (before.comments?.length ?? 0)) {
    return { kind: 'comment_added', summary: 'Comment added.' };
  }
  if ((after.attachments?.length ?? 0) > (before.attachments?.length ?? 0)) {
    return { kind: 'attachment_added', summary: 'Attachment added.' };
  }
  if ((after.attachments?.length ?? 0) < (before.attachments?.length ?? 0)) {
    return { kind: 'attachment_removed', summary: 'Attachment removed.' };
  }
  if (JSON.stringify(before.linkedWorkspaceUris ?? []) !== JSON.stringify(after.linkedWorkspaceUris ?? [])) {
    return { kind: 'link_changed', summary: 'Workspace object links changed.' };
  }
  if (before.recurrence !== after.recurrence || JSON.stringify(before.recurrenceSpec) !== JSON.stringify(after.recurrenceSpec)) {
    return { kind: 'recurrence_changed', summary: 'Recurrence specification changed.' };
  }
  if (JSON.stringify(before.reminders ?? []) !== JSON.stringify(after.reminders ?? [])) {
    return { kind: 'reminder_changed', summary: 'Reminder rules changed.' };
  }
  return { kind: 'updated', summary: 'Task fields updated.' };
}

export function applyTaskPatch(
  task: TaskItem,
  patch: Partial<TaskItem>,
  context: TaskMutationContext = {},
  definitions: TaskStatusDefinition[] = TASK_SYSTEM_STATUS_DEFINITIONS,
): TaskItem {
  const meta = mutationMeta(context);
  const before = normalizeTaskItem(task, meta);
  const next: TaskItem = { ...before, ...patch, id: before.id };

  if (patch.assignees !== undefined) {
    next.assignees = normalizeIdentityList(patch.assignees);
    next.assignee = next.assignees[0];
  } else if (patch.assignee !== undefined) {
    next.assignees = normalizeIdentityList(patch.assignee ? [patch.assignee, ...(before.assignees ?? []).slice(1)] : (before.assignees ?? []).slice(1));
    next.assignee = next.assignees[0];
  }
  if (patch.startAt !== undefined) next.startDate = localDatePart(patch.startAt);
  if (patch.dueAt !== undefined) next.dueDate = localDatePart(patch.dueAt);

  if (patch.progress !== undefined) {
    next.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
    if (next.progress === 100) next.status = 'done';
    else if (resolveCanonicalTaskStatus(next, definitions) === 'done') next.status = next.progress > 0 ? 'active' : 'not_started';
  }
  if (patch.completed !== undefined) {
    next.completed = patch.completed;
    // Precedence: an explicit `status` in the same patch wins, a task that only carried a
    // completion flag falls back to the completion-derived status, and a status the user chose
    // deliberately (waiting, blocked, a custom status) is never silently rewritten to
    // "not_started". Before this guard, `{ completed: false }` on its own discarded the status.
    if (patch.status === undefined) {
      if (patch.completed) next.status = 'done';
      else if (before.status === 'done' || next.status === 'done') {
        next.status = (next.progress ?? 0) > 0 ? 'active' : 'not_started';
      }
    }
  }

  const canonical = resolveCanonicalTaskStatus(next, definitions);
  next.completed = canonical === 'done';
  next.blocked = canonical === 'blocked';
  if (canonical === 'done') {
    next.progress = 100;
    next.completionDate = next.completionDate ?? new Date(meta.now).toISOString();
    next.plannerColumn = 'done';
  } else {
    next.progress = Math.min(next.progress ?? 0, 99);
    if (before.completed) next.completionDate = undefined;
    if (next.plannerColumn === 'done') next.plannerColumn = 'todo';
  }

  next.updatedAt = meta.now;
  next.updatedBy = meta.actor;
  next.source = meta.source;
  const change = patchSummary(before, next);
  if (change) next.activity = appendTaskActivity(before.activity, change.kind, change.summary, meta);
  return normalizeTaskItem(next, meta);
}

export function toggleTaskCompletion(task: TaskItem, context: TaskMutationContext = {}): TaskItem {
  return applyTaskPatch(task, { completed: !task.completed }, context);
}

export function createSubtaskItem(parent: TaskItem, title: string, context: TaskMutationContext = {}): TaskItem {
  return createTaskItem({
    title,
    priority: parent.priority,
    projectId: parent.projectId,
    phaseId: parent.phaseId,
    planId: parent.planId,
    parentTaskId: parent.id,
    tags: parent.tags,
  }, context);
}

export function normalizeWatcher(value: string): string {
  return value.trim();
}

export function addTaskWatcher(watchers: string[] | undefined, value: string): string[] {
  return normalizeIdentityList([...(watchers ?? []), value]);
}

export function removeTaskWatcher(watchers: string[] | undefined, value: string): string[] {
  const key = value.trim().toLocaleLowerCase();
  return (watchers ?? []).filter((watcher) => watcher.toLocaleLowerCase() !== key);
}

export function extractTaskMentions(text: string): string[] {
  const mentions: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/(^|\s)@([A-Za-z0-9][A-Za-z0-9._-]{0,63})/g)) {
    const value = match[2];
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push(value);
  }
  return mentions;
}

export function addTaskComment(
  comments: TaskComment[] | undefined,
  author: string,
  text: string,
  now = Date.now(),
  parentCommentId?: string,
): TaskComment[] {
  const clean = text.trim();
  if (!clean) return comments ?? [];
  const existing = comments ?? [];
  const parent = parentCommentId && existing.some((comment) => comment.id === parentCommentId) ? parentCommentId : undefined;
  return [...existing, {
    id: createStableTaskId('comment'),
    author: author.trim() || 'Local User',
    text: clean,
    createdAt: now,
    parentCommentId: parent,
    mentions: extractTaskMentions(clean),
  }];
}

/**
 * Canonical workspace deep-link grammar. ONE definition, used by both the validator and the kind
 * reader below.
 *
 * The previous grammar accepted only `document/<id>` and a single `<kind>/<id>` segment whose kind
 * was drawn from a fixed list. The rest of the workspace emits more than that, and the Tasks side
 * was therefore rejecting URIs the system itself had already written — silently, because
 * `addWorkspaceDeepLink` drops what it cannot parse:
 *
 *   vgt://workspace/document/<doc>                                  (plain document)
 *   vgt://workspace/document/<doc>/object/<id>                      (any workspace object)
 *   vgt://workspace/document/<doc>/task/<taskId>                    (notesWorkspaceActions.ts:108)
 *   vgt://workspace/document/<doc>/notes/page/<pageId>              (notesWorkspaceActions.ts:9)
 *   vgt://workspace/document/<doc>/page/<pageId>                     (notesTagsTasks.ts:143)
 *
 * Still fail-closed: the scheme and workspace authority are mandatory, the path is bounded, and an
 * external URL such as `https://evil.example/` can never match.
 */
const WORKSPACE_DEEP_LINK_BODY = 'vgt:\\/\\/workspace\\/document\\/[A-Za-z0-9._:%-]+(?:\\/[A-Za-z0-9._:%-]+)*';
const WORKSPACE_DEEP_LINK_PATTERN = `^${WORKSPACE_DEEP_LINK_BODY}$`;
/** Maximum number of path segments after the document id, so a link cannot grow without bound. */
export const WORKSPACE_DEEP_LINK_MAX_SEGMENTS = 12;

export function isWorkspaceDeepLink(value: string): boolean {
  const clean = value.trim();
  if (!clean.match(new RegExp(WORKSPACE_DEEP_LINK_PATTERN))) return false;
  const segments = clean.slice('vgt://workspace/document/'.length).split('/');
  if (segments.length > WORKSPACE_DEEP_LINK_MAX_SEGMENTS) return false;
  // '.' and '..' are legal characters inside an id but are NOT legal path segments: without this
  // guard `vgt://workspace/document/doc-1/../../etc/passwd` parses as a valid workspace link.
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function addWorkspaceDeepLink(links: string[] | undefined, value: string): string[] {
  const link = value.trim();
  if (!isWorkspaceDeepLink(link)) return links ?? [];
  const existing = links ?? [];
  return existing.includes(link) ? existing : [...existing, link];
}

/**
 * The workspace object kind a deep link points at. A nested container segment (`notes/page`) is
 * reported by its leaf kind so callers do not need two parsers; a link with no object segment is a
 * plain document reference.
 */
export function workspaceDeepLinkKind(value: string): 'document' | 'object' | 'range' | 'page' | 'annotation' | 'block' | 'response' | 'record' | 'task' | undefined {
  const clean = value.trim();
  if (!isWorkspaceDeepLink(clean)) return undefined;
  const segments = clean.slice('vgt://workspace/document/'.length).split('/');
  if (segments.length <= 1) return 'document';
  const leaf = segments.at(-2);
  const known = ['object', 'range', 'page', 'annotation', 'block', 'response', 'record', 'task'];
  if (leaf && known.includes(leaf)) return leaf as ReturnType<typeof workspaceDeepLinkKind>;
  // An object segment whose kind is outside the known list is still a real workspace object.
  return 'object';
}

export function validateTaskAttachment(existing: TaskAttachment[] | undefined, sizeBytes: number): string | undefined {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 'Attachment is empty or has an invalid size.';
  if (sizeBytes > TASK_ATTACHMENT_MAX_BYTES) return 'Attachment exceeds the 4 MiB per-file limit.';
  const total = (existing ?? []).reduce((sum, item) => sum + item.sizeBytes, 0) + sizeBytes;
  if (total > TASK_ATTACHMENTS_TOTAL_MAX_BYTES) return 'Task attachments exceed the 16 MiB local payload limit.';
  return undefined;
}

export function taskDescendants(tasks: TaskItem[], taskId: string): Set<string> {
  const result = new Set<string>();
  const visit = (id: string) => {
    for (const task of tasks) {
      if (task.parentTaskId === id && !result.has(task.id)) {
        result.add(task.id);
        visit(task.id);
      }
    }
  };
  visit(taskId);
  return result;
}

export function canAssignTaskParent(tasks: TaskItem[], taskId: string, parentTaskId?: string): boolean {
  if (!parentTaskId) return true;
  if (taskId === parentTaskId) return false;
  return !taskDescendants(tasks, taskId).has(parentTaskId);
}

export function nextRecurrenceDate(recurrence: TaskItem['recurrence'], fromDate?: string): string | undefined {
  if (!recurrence || recurrence === 'none') return undefined;
  const base = fromDate ? new Date(`${fromDate}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return undefined;
  const next = new Date(base.getTime());
  switch (recurrence) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekdays': {
      do { next.setDate(next.getDate() + 1); } while (next.getDay() === 0 || next.getDay() === 6);
      break;
    }
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
    default: return undefined;
  }
  return next.toISOString().slice(0, 10);
}
