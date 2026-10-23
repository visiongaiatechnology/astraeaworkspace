// STATUS: DIAMANT VGT SUPREME
// Astraea Tasks — bounded universal task interchange engine (CSV + JSON)

import type { TaskItem } from '../../../shared/contracts/work-management/workspaceWork';
import { parseTaskAttachmentDataUrl } from '../collaboration/taskAttachments';
import { createStableTaskId, isValidTaskId, normalizeTaskItem, TASK_ATTACHMENT_MAX_BYTES, TASK_ATTACHMENTS_TOTAL_MAX_BYTES } from '../model/taskModel';

export const TASK_IMPORT_MAX_BYTES = 32 * 1024 * 1024;
export const TASK_IMPORT_MAX_TASKS = 20_000;
export const TASK_IMPORT_MAX_CELLS = 500_000;
export const TASK_IMPORT_MAX_CELL_CHARS = 65_536;
export const TASK_IMPORT_MAX_TITLE_CHARS = 500;
export const TASK_IMPORT_MAX_ARRAY_ITEMS = 2_000;

export interface TaskImportResult {
  tasks: TaskItem[];
  importedCount: number;
  skippedCount: number;
  warnings: string[];
}

function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function boundedString(value: unknown, max = TASK_IMPORT_MAX_CELL_CHARS): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : undefined;
}
function boundedStringArray(value: unknown, maxItems = TASK_IMPORT_MAX_ARRAY_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, maxItems)) {
    const clean = boundedString(entry, 1_024);
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}
function finiteNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}
function validDateLike(value: unknown): string | undefined {
  const clean = boundedString(value, 64);
  if (!clean || !/^\d{4}-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-][0-2]\d:[0-5]\d)?)?$/.test(clean)) return undefined;
  return clean;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedRecords(value: unknown, maxItems: number): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, maxItems).filter(isRecord) : [];
}

function sanitizeChecklist(value: unknown): TaskItem['checklist'] {
  return boundedRecords(value, TASK_IMPORT_MAX_ARRAY_ITEMS).map((item) => ({
    id: boundedString(item.id, 192) ?? createStableTaskId('check'),
    title: boundedString(item.title, TASK_IMPORT_MAX_TITLE_CHARS) ?? 'Untitled checklist item',
    completed: item.completed === true,
  }));
}

function sanitizeComments(value: unknown): TaskItem['comments'] {
  return boundedRecords(value, TASK_IMPORT_MAX_ARRAY_ITEMS).map((item) => ({
    id: boundedString(item.id, 192) ?? createStableTaskId('comment'),
    author: boundedString(item.author, 256) ?? 'Unknown',
    text: boundedString(item.text, TASK_IMPORT_MAX_CELL_CHARS) ?? '',
    createdAt: finiteNumber(item.createdAt, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    updatedAt: finiteNumber(item.updatedAt, 0, Number.MAX_SAFE_INTEGER),
    parentCommentId: boundedString(item.parentCommentId, 192),
    mentions: boundedStringArray(item.mentions, 500),
  }));
}

function sanitizeAttachments(value: unknown): TaskItem['attachments'] {
  let total = 0;
  const result: NonNullable<TaskItem['attachments']> = [];
  for (const item of boundedRecords(value, 256)) {
    const sizeBytes = Math.floor(finiteNumber(item.sizeBytes, 0, TASK_ATTACHMENTS_TOTAL_MAX_BYTES) ?? 0);
    const name = boundedString(item.name, 512);
    const mimeType = boundedString(item.mimeType, 256);
    if (!name || !mimeType) continue;
    const dataUrl = typeof item.dataUrl === 'string' ? item.dataUrl : undefined;
    if (dataUrl) {
      const parsed = parseTaskAttachmentDataUrl(dataUrl);
      if (!parsed || sizeBytes > TASK_ATTACHMENT_MAX_BYTES || parsed.byteLength !== sizeBytes) continue;
    }
    if (total + sizeBytes > TASK_ATTACHMENTS_TOTAL_MAX_BYTES) break;
    total += sizeBytes;
    result.push({
      id: boundedString(item.id, 192) ?? createStableTaskId('attachment'), name, mimeType, sizeBytes,
      dataUrl,
      workspaceUri: boundedString(item.workspaceUri, 2_048), sha256: boundedString(item.sha256, 128),
      createdAt: finiteNumber(item.createdAt, 0, Number.MAX_SAFE_INTEGER), createdBy: boundedString(item.createdBy, 256),
    });
  }
  return result;
}

function sanitizeActivity(value: unknown): TaskItem['activity'] {
  const allowed = new Set(['created','updated','status_changed','assignment_changed','comment_added','attachment_added','attachment_removed','link_changed','reminder_changed','recurrence_changed']);
  return boundedRecords(value, TASK_IMPORT_MAX_ARRAY_ITEMS).flatMap((item) => {
    const kind = boundedString(item.kind, 64);
    if (!kind || !allowed.has(kind)) return [];
    return [{
      id: boundedString(item.id, 192) ?? createStableTaskId('activity'),
      kind: kind as NonNullable<TaskItem['activity']>[number]['kind'],
      at: finiteNumber(item.at, 0, Number.MAX_SAFE_INTEGER) ?? 0,
      actor: boundedString(item.actor, 256) ?? 'Unknown', summary: boundedString(item.summary, 1_024) ?? '',
      source: boundedString(item.source, 256),
    }];
  });
}

function sanitizeReminders(value: unknown): TaskItem['reminders'] {
  return boundedRecords(value, 256).map((item) => ({
    id: boundedString(item.id, 192) ?? createStableTaskId('reminder'),
    at: validDateLike(item.at), offsetMinutes: finiteNumber(item.offsetMinutes, -525_600, 525_600),
    enabled: item.enabled !== false, snoozedUntil: validDateLike(item.snoozedUntil), label: boundedString(item.label, 256),
  }));
}

function sanitizeRecurrenceSpec(value: unknown): TaskItem['recurrenceSpec'] {
  if (!isRecord(value)) return undefined;
  const frequency = boundedString(value.frequency, 32);
  if (!frequency || !['daily','weekly','monthly','yearly'].includes(frequency)) return undefined;
  const interval = Math.floor(finiteNumber(value.interval, 1, 10_000) ?? 1);
  const weekdays = Array.isArray(value.weekdays) ? value.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6).slice(0, 7) : undefined;
  const nth = isRecord(value.nthWeekday) && [1,2,3,4,-1].includes(Number(value.nthWeekday.ordinal)) && Number.isInteger(value.nthWeekday.weekday) && Number(value.nthWeekday.weekday) >= 0 && Number(value.nthWeekday.weekday) <= 6
    ? { ordinal: Number(value.nthWeekday.ordinal) as 1|2|3|4|-1, weekday: Number(value.nthWeekday.weekday) } : undefined;
  let end: NonNullable<TaskItem['recurrenceSpec']>['end'];
  if (isRecord(value.end)) {
    if (value.end.mode === 'count') end = { mode: 'count', count: Math.floor(finiteNumber(value.end.count, 1, 100_000) ?? 1) };
    else if (value.end.mode === 'until' && validDateLike(value.end.until)) end = { mode: 'until', until: validDateLike(value.end.until)! };
    else end = { mode: 'never' };
  }
  return { frequency: frequency as 'daily'|'weekly'|'monthly'|'yearly', interval, weekdays, monthDay: finiteNumber(value.monthDay, 1, 31), nthWeekday: nth, end, timezone: boundedString(value.timezone, 128), rrule: boundedString(value.rrule, 2_048) };
}

/**
 * REPAIR — priority projection record.
 *
 * The canonical contract stores exactly three priorities (`TaskItem.priority`), while interchange
 * documents routinely declare four or more (P1..P4, "urgent", bare numeric bands). Four levels do not
 * fit into three, so *some* projection is unavoidable; what is avoidable is doing it silently.
 * Three defects lived here before this block:
 *   1. `P2` and `P4` both reached the implicit `'medium'` fallback, so two declared values became one
 *      stored value with nothing recording it.
 *   2. `P4` (lowest of four) therefore ranked ABOVE `P3` (third of four), which mapped to `'low'`.
 *   3. `sanitizeNativeTaskValue` accepted only the three literal canonical strings, so the most common
 *      foreign JSON shape (`{ title, priority: "P1" }`) silently stored `'medium'` for everything.
 *
 * Every declared token that is not a canonical level is now projected explicitly and recorded in the
 * import result, which both import call sites surface to the operator. Values are never rejected.
 */
export const TASK_IMPORT_MAX_WARNINGS = 200;
export const TASK_IMPORT_MAX_PRIORITY_LOSS_DETAILS = 20;

export interface ImportedPriorityMapping {
  priority: TaskItem['priority'];
  /** Trimmed, lower-cased source token that was matched. */
  token: string;
  /** `null` when the token is a canonical level; otherwise why the value had to be projected. */
  loss: string | null;
}

/** Tokens the canonical three-level contract can store without any loss of meaning. */
const CANONICAL_PRIORITY_TOKENS: Readonly<Record<string, TaskItem['priority']>> = {
  low: 'low', medium: 'medium', high: 'high',
};

/**
 * Declared source tokens the canonical contract cannot represent. The projection is monotone: a
 * lower source rank never maps to a higher stored rank. `P4`/'4'/'urgent' were previously absent.
 */
const PROJECTED_PRIORITY_TOKENS: Readonly<Record<string, { priority: TaskItem['priority']; reason: string }>> = {
  p1: { priority: 'high', reason: 'P1 is the highest of four source levels' },
  '1': { priority: 'high', reason: 'numeric priority 1 is the highest band' },
  urgent: { priority: 'high', reason: '"urgent" is a further level above "high"' },
  p2: { priority: 'medium', reason: 'P2 is the second of four source levels' },
  '2': { priority: 'medium', reason: 'numeric priority 2 is the middle band' },
  p3: { priority: 'low', reason: 'P3 is the third of four source levels' },
  '3': { priority: 'low', reason: 'numeric priority 3 is the low band' },
  p4: { priority: 'low', reason: 'P4 is the lowest of four source levels and cannot stay distinct from P3 in a three-level contract' },
  '4': { priority: 'low', reason: 'numeric priority 4 is the lowest band' },
};

/**
 * Maps one declared source priority onto the canonical contract. A missing or blank token is the
 * documented "no priority declared" default and is deliberately not reported as a projection; it is
 * not a collision of two declared values, only the absence of one.
 */
export function mapImportedPriority(raw: unknown): ImportedPriorityMapping {
  const token = typeof raw === 'string'
    ? raw.trim().toLowerCase()
    : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '';
  if (!token) return { priority: 'medium', token, loss: null };
  const canonical = CANONICAL_PRIORITY_TOKENS[token];
  if (canonical) return { priority: canonical, token, loss: null };
  const projected = PROJECTED_PRIORITY_TOKENS[token];
  if (projected) return { priority: projected.priority, token, loss: projected.reason };
  return {
    priority: 'medium', token,
    loss: `"${token}" is not a priority value the canonical contract knows; the neutral default "medium" was stored`,
  };
}

export interface TaskPriorityLoss {
  token: string;
  stored: TaskItem['priority'];
  reason: string;
  count: number;
}

export type TaskPriorityLossTally = Map<string, TaskPriorityLoss>;

export function createTaskPriorityLossTally(): TaskPriorityLossTally { return new Map(); }

function recordTaskPriorityLoss(tally: TaskPriorityLossTally | undefined, mapping: ImportedPriorityMapping): void {
  if (!tally || !mapping.loss) return;
  const existing = tally.get(mapping.token);
  if (existing) { existing.count += 1; return; }
  tally.set(mapping.token, { token: mapping.token, stored: mapping.priority, reason: mapping.loss, count: 1 });
}

/**
 * Renders one deterministic record of every projected priority, or `undefined` when the document only
 * used priorities the canonical contract can represent. The record names each source token and the
 * value it was stored as, so a caller can never mistake a projection for a faithful conversion.
 */
export function summarizeTaskPriorityLosses(tally: TaskPriorityLossTally | undefined): string | undefined {
  if (!tally || tally.size === 0) return undefined;
  const entries = [...tally.values()].sort((left, right) => (left.token < right.token ? -1 : left.token > right.token ? 1 : 0));
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const shown = entries.slice(0, TASK_IMPORT_MAX_PRIORITY_LOSS_DETAILS)
    .map((entry) => `source="${entry.token}" stored="${entry.stored}" (${entry.count}x; ${entry.reason})`);
  const more = entries.length > TASK_IMPORT_MAX_PRIORITY_LOSS_DETAILS
    ? `, plus ${entries.length - TASK_IMPORT_MAX_PRIORITY_LOSS_DETAILS} further distinct source values`
    : '';
  return `Priority projection: ${total} imported task(s) carried a source priority the canonical low|medium|high contract cannot represent exactly - ${shown.join('; ')}${more}. Nothing was rejected; the stored field cannot keep these values apart, so the source tokens are recorded here instead.`;
}

/** Bounded native TaskItem sanitizer used by JSON and encrypted VTask import. */
export function sanitizeNativeTaskValue(
  value: unknown,
  seenIds = new Set<string>(),
  priorityLosses?: TaskPriorityLossTally,
): TaskItem | undefined {
  if (!isRecord(value)) return undefined;
  const title = boundedString(value.title, TASK_IMPORT_MAX_TITLE_CHARS);
  if (!title) return undefined;
  const sourceId = boundedString(value.id, 192) ?? '';
  const id = isValidTaskId(sourceId) && !seenIds.has(sourceId) ? sourceId : createStableTaskId('task-import');
  seenIds.add(id);
  const priorityMapping = mapImportedPriority(value.priority);
  recordTaskPriorityLoss(priorityLosses, priorityMapping);
  const priority = priorityMapping.priority;
  const due = validDateLike(value.dueAt ?? value.dueDate);
  const start = validDateLike(value.startAt ?? value.startDate);
  const recurrence = ['none','daily','weekdays','weekly','monthly','yearly'].includes(String(value.recurrence)) ? value.recurrence as TaskItem['recurrence'] : 'none';
  const task: TaskItem = {
    id, title, description: boundedString(value.description), descriptionFormat: 'markdown',
    status: boundedString(value.status, 128), statusReason: boundedString(value.statusReason, 1_024),
    completed: value.completed === true, progress: finiteNumber(value.progress, 0, 100), priority,
    startDate: start?.slice(0,10), startAt: start && start.length > 10 ? start : undefined,
    dueDate: due?.slice(0,10), dueAt: due && due.length > 10 ? due : undefined,
    completionDate: validDateLike(value.completionDate), estimateHours: finiteNumber(value.estimateHours,0,1_000_000), actualHours: finiteNumber(value.actualHours,0,1_000_000),
    tags: boundedStringArray(value.tags), assignee: boundedString(value.assignee,256), assignees: boundedStringArray(value.assignees), watchers: boundedStringArray(value.watchers),
    important: value.important === true, myDayDate: validDateLike(value.myDayDate)?.slice(0,10), inbox: typeof value.inbox === 'boolean' ? value.inbox : undefined,
    listId: boundedString(value.listId,192), createdAt: finiteNumber(value.createdAt,0,Number.MAX_SAFE_INTEGER), updatedAt: finiteNumber(value.updatedAt,0,Number.MAX_SAFE_INTEGER),
    createdBy: boundedString(value.createdBy,256), updatedBy: boundedString(value.updatedBy,256), source: boundedString(value.source,256),
    parentTaskId: boundedString(value.parentTaskId,192), projectId: boundedString(value.projectId,192), phaseId: boundedString(value.phaseId,192), planId: boundedString(value.planId,192), milestoneId: boundedString(value.milestoneId,192), plannerColumn: boundedString(value.plannerColumn,192),
    linkedWorkspaceUris: boundedStringArray(value.linkedWorkspaceUris,500).filter((uri)=>uri.startsWith('vgt://workspace/')),
    attachments: sanitizeAttachments(value.attachments), comments: sanitizeComments(value.comments), activity: sanitizeActivity(value.activity), checklist: sanitizeChecklist(value.checklist),
    recurrence, recurrenceSpec: sanitizeRecurrenceSpec(value.recurrenceSpec), reminders: sanitizeReminders(value.reminders),
    recurrenceSeriesId: boundedString(value.recurrenceSeriesId,192), recurrenceIndex: finiteNumber(value.recurrenceIndex,0,1_000_000), generatedFromTaskId: boundedString(value.generatedFromTaskId,192), occurrenceKey: boundedString(value.occurrenceKey,512), occurrenceState: value.occurrenceState === 'skipped' ? 'skipped' : value.occurrenceState === 'scheduled' ? 'scheduled' : undefined,
    blocked: value.blocked === true,
  };
  return normalizeTaskItem(task, { source: task.source ?? 'import.native' });
}

/** Neutralizes CSV formula injection (CWE-1236). */
export function sanitizeCsvCell(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  return /^[=+\-@\t\r]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

export function escapeCsvField(val: string | number | boolean | undefined): string {
  if (val === undefined || val === null) return '""';
  const sanitized = sanitizeCsvCell(String(val));
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function exportTasksToCsv(tasks: TaskItem[]): string {
  const headers = ['Task ID','Title','Completed','Priority','Due Date','Start Date','Progress','Estimate Hours','Actual Hours','Tags','Watchers','Recurrence','Parent Task ID','Description'];
  const rows: string[] = [headers.map(escapeCsvField).join(',')];
  for (const t of tasks) rows.push([
    t.id, t.title, t.completed ? 'TRUE' : 'FALSE', t.priority || 'medium', t.dueAt || t.dueDate || '',
    t.startAt || t.startDate || '', t.progress ?? 0, t.estimateHours ?? '', t.actualHours ?? '',
    (t.tags ?? []).join(';'), (t.watchers ?? []).join(';'), t.recurrence ?? 'none', t.parentTaskId ?? '', t.description ?? '',
  ].map((value) => escapeCsvField(value)).join(','));
  return rows.join('\r\n');
}

/** RFC 4180 document parser with multiline cells and hard resource caps. */
export function parseCsvDocument(csvText: string): string[][] {
  if (utf8Bytes(csvText) > TASK_IMPORT_MAX_BYTES) throw new Error(`CSV exceeds ${TASK_IMPORT_MAX_BYTES} byte import limit.`);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let cells = 0;
  const pushCell = () => {
    if (cell.length > TASK_IMPORT_MAX_CELL_CHARS) throw new Error('CSV cell exceeds bounded character limit.');
    row.push(cell); cell = ''; cells++;
    if (cells > TASK_IMPORT_MAX_CELLS) throw new Error('CSV exceeds bounded cell limit.');
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.length > 0)) rows.push(row);
    row = [];
    if (rows.length > TASK_IMPORT_MAX_TASKS + 1) throw new Error(`CSV exceeds ${TASK_IMPORT_MAX_TASKS} task rows.`);
  };
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (quoted) {
      if (ch === '"') {
        if (csvText[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ',') pushCell();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && csvText[i + 1] === '\n') i++;
      pushRow();
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (cell.length || row.length) pushRow();
  return rows;
}

export function importTasksFromCsv(csvText: string): TaskImportResult {
  const rows = parseCsvDocument(csvText);
  const tasks: TaskItem[] = [];
  const warnings: string[] = [];
  const priorityLosses = createTaskPriorityLossTally();
  let skipped = 0;
  if (rows.length < 2) return { tasks: [], importedCount: 0, skippedCount: 0, warnings: ['CSV file is empty or missing headers.'] };

  const headers = rows[0].map((h) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
  const idIdx = headers.findIndex((h) => h === 'taskid' || h === 'id');
  const titleIdx = headers.findIndex((h) => h === 'title' || h === 'tasktitle' || h === 'name' || h === 'content' || h === 'subject');
  const completedIdx = headers.findIndex((h) => h.includes('completed') || h.includes('status') || h.includes('done'));
  const priorityIdx = headers.findIndex((h) => h.includes('priority') || h.includes('prio'));
  const dueIdx = headers.findIndex((h) => h.includes('due') || h.includes('deadline'));
  const startIdx = headers.findIndex((h) => h.includes('start'));
  const descIdx = headers.findIndex((h) => h.includes('desc') || h.includes('note') || h.includes('detail'));
  const tagsIdx = headers.findIndex((h) => h.includes('tag') || h.includes('category') || h.includes('label'));
  const parentIdx = headers.findIndex((h) => h.includes('parent'));
  if (titleIdx === -1) warnings.push('No canonical title column found; first column is used as title.');

  for (const cols of rows.slice(1, TASK_IMPORT_MAX_TASKS + 1)) {
    const rawTitle = titleIdx !== -1 ? cols[titleIdx] : cols[0];
    const cleanTitle = (rawTitle || '').replace(/^'/, '').trim().slice(0, TASK_IMPORT_MAX_TITLE_CHARS);
    if (!cleanTitle) { skipped++; continue; }
    const rawCompleted = completedIdx !== -1 ? cols[completedIdx]?.toLowerCase().trim() : 'false';
    const completed = ['true','1','yes','completed','done'].includes(rawCompleted);
    const priorityMapping = mapImportedPriority(priorityIdx !== -1 ? cols[priorityIdx] : undefined);
    recordTaskPriorityLoss(priorityLosses, priorityMapping);
    const priority: TaskItem['priority'] = priorityMapping.priority;
    const sourceId = idIdx !== -1 ? (cols[idIdx] ?? '').replace(/^'/, '').trim() : '';
    const importedId = isValidTaskId(sourceId) && !tasks.some((task) => task.id === sourceId) ? sourceId : createStableTaskId('task-csv');
    const task: TaskItem = {
      id: importedId,
      title: cleanTitle,
      completed,
      priority,
      dueDate: dueIdx !== -1 ? validDateLike(cols[dueIdx])?.slice(0, 10) : undefined,
      dueAt: dueIdx !== -1 && validDateLike(cols[dueIdx])?.length! > 10 ? validDateLike(cols[dueIdx]) : undefined,
      startDate: startIdx !== -1 ? validDateLike(cols[startIdx])?.slice(0, 10) : undefined,
      startAt: startIdx !== -1 && validDateLike(cols[startIdx])?.length! > 10 ? validDateLike(cols[startIdx]) : undefined,
      description: descIdx !== -1 ? boundedString(cols[descIdx]) : undefined,
      tags: tagsIdx !== -1 ? (cols[tagsIdx] ?? '').split(/[;,]/).map((tag) => tag.trim().slice(0, 256)).filter(Boolean).slice(0, 2_000) : [],
      parentTaskId: parentIdx !== -1 && isValidTaskId(cols[parentIdx] ?? '') ? cols[parentIdx].trim() : undefined,
      watchers: [], checklist: [], comments: [], linkedWorkspaceUris: [], attachments: [],
    };
    tasks.push(normalizeTaskItem(task, { source: 'import.csv' }));
  }
  const prioritySummary = summarizeTaskPriorityLosses(priorityLosses);
  if (prioritySummary) warnings.push(prioritySummary);
  return { tasks, importedCount: tasks.length, skippedCount: skipped, warnings };
}

function normalizeJsonTask(
  value: unknown,
  seenIds: Set<string>,
  warnings: string[],
  priorityLosses: TaskPriorityLossTally,
): TaskItem | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.title === 'string') return sanitizeNativeTaskValue(value, seenIds, priorityLosses);
  const title = boundedString(value.title ?? value.name ?? value.subject ?? value.content, TASK_IMPORT_MAX_TITLE_CHARS);
  if (!title) return undefined;
  const sourceId = boundedString(value.id ?? value.taskId, 192) ?? '';
  const id = isValidTaskId(sourceId) && !seenIds.has(sourceId) ? sourceId : createStableTaskId('task-json');
  seenIds.add(id);
  const priorityMapping = mapImportedPriority(value.priority);
  recordTaskPriorityLoss(priorityLosses, priorityMapping);
  const priority: TaskItem['priority'] = priorityMapping.priority;
  const rawStatus = boundedString(value.status, 128);
  const completed = value.completed === true || ['done','completed'].includes(rawStatus?.toLowerCase() ?? '');
  const due = validDateLike(value.dueAt ?? value.dueDate ?? value.due);
  const start = validDateLike(value.startAt ?? value.startDate ?? value.start);
  const parent = boundedString(value.parentTaskId ?? value.parentId, 192);
  if (parent && !isValidTaskId(parent)) warnings.push(`Ignored invalid parent id on imported task ${id}.`);
  const task: TaskItem = {
    id, title, completed, priority,
    description: boundedString(value.description ?? value.notes),
    status: rawStatus,
    statusReason: boundedString(value.statusReason, 1_024),
    progress: finiteNumber(value.progress ?? value.percentComplete, 0, 100),
    startDate: start?.slice(0, 10), startAt: start && start.length > 10 ? start : undefined,
    dueDate: due?.slice(0, 10), dueAt: due && due.length > 10 ? due : undefined,
    completionDate: validDateLike(value.completionDate ?? value.completedAt),
    estimateHours: finiteNumber(value.estimateHours, 0, 1_000_000),
    actualHours: finiteNumber(value.actualHours, 0, 1_000_000),
    tags: boundedStringArray(value.tags ?? value.labels),
    assignees: boundedStringArray(value.assignees ?? (value.assignee ? [value.assignee] : [])),
    watchers: boundedStringArray(value.watchers),
    important: value.important === true,
    listId: boundedString(value.listId, 192),
    projectId: boundedString(value.projectId, 192), phaseId: boundedString(value.phaseId, 192), planId: boundedString(value.planId, 192),
    parentTaskId: parent && isValidTaskId(parent) ? parent : undefined,
    linkedWorkspaceUris: boundedStringArray(value.linkedWorkspaceUris, 500).filter((uri) => uri.startsWith('vgt://workspace/')),
    recurrence: ['none','daily','weekdays','weekly','monthly','yearly'].includes(String(value.recurrence)) ? value.recurrence as TaskItem['recurrence'] : 'none',
    createdAt: finiteNumber(value.createdAt, 0, Number.MAX_SAFE_INTEGER), updatedAt: finiteNumber(value.updatedAt, 0, Number.MAX_SAFE_INTEGER),
    createdBy: boundedString(value.createdBy, 256), updatedBy: boundedString(value.updatedBy, 256), source: 'import.json',
    checklist: [], comments: [], attachments: [], activity: [], reminders: [],
  };
  return normalizeTaskItem(task, { source: 'import.json' });
}

/** Safely imports Astraea or common task JSON without trusting arbitrary nested objects. */
export function importTasksFromJson(jsonText: string): TaskImportResult {
  if (utf8Bytes(jsonText) > TASK_IMPORT_MAX_BYTES) throw new Error(`JSON exceeds ${TASK_IMPORT_MAX_BYTES} byte import limit.`);
  let parsed: unknown;
  try { parsed = JSON.parse(jsonText); } catch { throw new Error('JSON is malformed.'); }
  const source = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.tasks) ? parsed.tasks : undefined;
  if (!source) throw new Error('JSON must contain a task array or a top-level { tasks: [] } object.');
  if (source.length > TASK_IMPORT_MAX_TASKS) throw new Error(`JSON exceeds ${TASK_IMPORT_MAX_TASKS} task limit.`);
  const tasks: TaskItem[] = [];
  const warnings: string[] = [];
  const priorityLosses = createTaskPriorityLossTally();
  let skipped = 0;
  const seen = new Set<string>();
  for (const value of source) {
    const task = normalizeJsonTask(value, seen, warnings, priorityLosses);
    if (task) tasks.push(task); else skipped++;
  }
  const prioritySummary = summarizeTaskPriorityLosses(priorityLosses);
  // Unshifted so the projection record survives the warning cap below even on a noisy document.
  if (prioritySummary) warnings.unshift(prioritySummary);
  return { tasks, importedCount: tasks.length, skippedCount: skipped, warnings: warnings.slice(0, TASK_IMPORT_MAX_WARNINGS) };
}

export function exportTasksToJson(tasks: TaskItem[]): string {
  return JSON.stringify({
    schema: 'https://vgt.technology/schemas/tasks-v2.json',
    systemVersion: 'VGT Astraea Tasks 2.1 DIAMANT',
    exportedAt: new Date().toISOString(),
    taskCount: tasks.length,
    tasks,
  }, null, 2);
}
