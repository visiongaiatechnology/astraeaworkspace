// STATUS: DIAMANT VGT SUPREME — local task capture, templates and shell quick-add bridge
import type { TaskCaptureState, TaskCaptureTemplate, TaskItem, TaskRecurrenceSpec } from '../../../shared/contracts/work-management/workspaceWork';
import { applyTaskPatch, createStableTaskId, createTaskItem, type TaskMutationContext } from '../model/taskModel';

export const DEFAULT_TASK_CAPTURE_STATE: TaskCaptureState = { templates: [], naturalLanguageDatesEnabled: true };
export const TASK_CAPTURE_MAX_TEXT = 8_192;
export const TASK_CAPTURE_MAX_TEMPLATES = 100;

export interface TaskQuickAddDraft {
  title?: string;
  sourceKind?: 'Writer' | 'Notes' | 'PdfStudio' | 'Clipboard' | 'Shell';
  sourceUri?: string;
}

let pendingQuickAddDraft: TaskQuickAddDraft | undefined;

export function queueTaskQuickAddDraft(draft: TaskQuickAddDraft): void {
  pendingQuickAddDraft = {
    title: sanitizeCaptureText(draft.title ?? '', TASK_CAPTURE_MAX_TEXT) || undefined,
    sourceKind: draft.sourceKind,
    sourceUri: isWorkspaceCaptureUri(draft.sourceUri) ? draft.sourceUri : undefined,
  };
}

export function consumeTaskQuickAddDraft(): TaskQuickAddDraft | undefined {
  const value = pendingQuickAddDraft;
  pendingQuickAddDraft = undefined;
  return value;
}

export function sanitizeCaptureText(value: string, max = TASK_CAPTURE_MAX_TEXT): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function isWorkspaceCaptureUri(value?: string): value is string {
  return Boolean(value && /^vgt:\/\/workspace\/[A-Za-z0-9._~:/-]{1,700}$/.test(value));
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function plusDays(now: Date, days: number): string { const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days); return localDate(next); }
const weekdayNames: Record<string, number> = { sunday: 0, sonntag: 0, monday: 1, montag: 1, tuesday: 2, dienstag: 2, wednesday: 3, mittwoch: 3, thursday: 4, donnerstag: 4, friday: 5, freitag: 5, saturday: 6, samstag: 6 };

export interface ParsedTaskCaptureText { title: string; dueDate?: string; matchedDateText?: string; }

export function parseLocalNaturalTaskDate(raw: string, now = new Date()): ParsedTaskCaptureText {
  const input = sanitizeCaptureText(raw);
  const lower = input.toLocaleLowerCase();
  const exact = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (exact) return { title: sanitizeCaptureText(input.replace(exact[0], '')), dueDate: exact[1], matchedDateText: exact[0] };
  for (const [phrase, days] of [['tomorrow', 1], ['morgen', 1], ['today', 0], ['heute', 0]] as const) {
    const re = new RegExp(`\\b${phrase}\\b`, 'i');
    if (re.test(input)) return { title: sanitizeCaptureText(input.replace(re, '')), dueDate: plusDays(now, days), matchedDateText: phrase };
  }
  const weekday = lower.match(/\b(?:next |nächsten |naechsten )?(sunday|sonntag|monday|montag|tuesday|dienstag|wednesday|mittwoch|thursday|donnerstag|friday|freitag|saturday|samstag)\b/i);
  if (weekday) {
    const target = weekdayNames[weekday[1].toLocaleLowerCase()];
    let delta = (target - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return { title: sanitizeCaptureText(input.replace(weekday[0], '')), dueDate: plusDays(now, delta), matchedDateText: weekday[0] };
  }
  return { title: input };
}

export function createCapturedTask(
  raw: string,
  options: { naturalLanguageDates?: boolean; sourceUri?: string; priority?: TaskItem['priority']; recurrenceSpec?: TaskRecurrenceSpec; projectId?: string; listId?: string; tags?: string[] } = {},
  context: TaskMutationContext = {},
  now = new Date(context.now ?? Date.now()),
): TaskItem {
  const parsed = options.naturalLanguageDates === false ? { title: sanitizeCaptureText(raw) } : parseLocalNaturalTaskDate(raw, now);
  if (!parsed.title) throw new Error('Task capture requires non-empty text.');
  let task = createTaskItem({ title: parsed.title, priority: options.priority ?? 'medium', dueDate: parsed.dueDate, projectId: options.projectId, listId: options.listId, tags: options.tags }, context);
  const patch: Partial<TaskItem> = {};
  if (isWorkspaceCaptureUri(options.sourceUri)) patch.linkedWorkspaceUris = [options.sourceUri];
  if (options.recurrenceSpec) patch.recurrenceSpec = options.recurrenceSpec;
  if (Object.keys(patch).length) task = applyTaskPatch(task, patch, context);
  return task;
}

export function createTaskCaptureTemplate(input: Omit<TaskCaptureTemplate, 'id' | 'createdAt'>, now = Date.now()): TaskCaptureTemplate {
  const name = sanitizeCaptureText(input.name, 96);
  const titlePattern = sanitizeCaptureText(input.titlePattern, 512);
  if (!name || !titlePattern) throw new Error('Template name and title are required.');
  return { ...input, id: createStableTaskId('task-template'), name, titlePattern, tags: input.tags?.map((tag) => sanitizeCaptureText(tag, 64)).filter(Boolean).slice(0, 32), createdAt: now };
}

export function normalizeTaskCaptureState(state?: Partial<TaskCaptureState>): TaskCaptureState {
  const seen = new Set<string>();
  const templates = (state?.templates ?? []).filter((template) => {
    if (!template.id || seen.has(template.id)) return false;
    seen.add(template.id); return true;
  }).slice(0, TASK_CAPTURE_MAX_TEMPLATES).map((template) => ({ ...template, name: sanitizeCaptureText(template.name, 96), titlePattern: sanitizeCaptureText(template.titlePattern, 512) }));
  return { templates, naturalLanguageDatesEnabled: state?.naturalLanguageDatesEnabled !== false };
}

export function instantiateTaskTemplate(template: TaskCaptureTemplate, titleOverride: string | undefined, context: TaskMutationContext = {}): TaskItem {
  return createCapturedTask(titleOverride?.trim() || template.titlePattern, { naturalLanguageDates: false, priority: template.priority, tags: template.tags, listId: template.listId, projectId: template.projectId, recurrenceSpec: template.recurrenceSpec }, context);
}

export function duplicateTaskForCapture(task: TaskItem, context: TaskMutationContext = {}): TaskItem {
  const duplicate = createTaskItem({ title: `${task.title} copy`, priority: task.priority, startDate: task.startDate, dueDate: task.dueDate, projectId: task.projectId, phaseId: task.phaseId, planId: task.planId, parentTaskId: task.parentTaskId, tags: task.tags, assignees: task.assignees, important: task.important, inbox: task.inbox, listId: task.listId }, context);
  return applyTaskPatch(duplicate, {
    description: task.description, descriptionFormat: task.descriptionFormat, estimateHours: task.estimateHours,
    checklist: (task.checklist ?? []).map((item) => ({ ...item, id: createStableTaskId('check'), completed: false })),
    recurrence: task.recurrence, recurrenceSpec: task.recurrenceSpec, reminders: task.reminders?.map((rule) => ({ ...rule, id: createStableTaskId('reminder'), snoozedUntil: undefined })),
    linkedWorkspaceUris: task.linkedWorkspaceUris,
  }, context);
}

export function taskCaptureInputFromSelection(title: string, sourceKind: TaskQuickAddDraft['sourceKind'], documentId: string, objectKind = 'selection'): TaskQuickAddDraft {
  const cleanId = documentId.replace(/[^A-Za-z0-9._~-]/g, '_').slice(0, 192);
  return { title: sanitizeCaptureText(title), sourceKind, sourceUri: `vgt://workspace/document/${cleanId}/${objectKind}` };
}
