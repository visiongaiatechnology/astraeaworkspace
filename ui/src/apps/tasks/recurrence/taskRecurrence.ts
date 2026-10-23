// STATUS: DIAMANT VGT SUPREME — local-first recurrence/reminder engine
import type {
  TaskItem,
  TaskRecurrenceSpec,
  TaskReminderRule,
} from '../../../shared/contracts/work-management/workspaceWork';
import {
  applyTaskPatch,
  createStableTaskId,
  createTaskItem,
  type TaskMutationContext,
} from '../model/taskModel';

export type RecurrenceScope = 'occurrence' | 'series';
export type RecurrenceOperation = 'skip' | 'complete' | 'modify';

export interface RecurrenceMutationResult {
  tasks: TaskItem[];
  createdTaskIds: string[];
  affectedTaskIds: string[];
}

const WEEKDAY_TOKENS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const MAX_SCAN_DAYS = 366 * 40;

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  hasTime: boolean;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function parseLocal(value?: string): LocalDateTimeParts | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return undefined;
  const parts: LocalDateTimeParts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4] ?? 0), minute: Number(match[5] ?? 0), second: Number(match[6] ?? 0),
    hasTime: match[4] !== undefined,
  };
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  if (probe.getUTCFullYear() !== parts.year || probe.getUTCMonth() !== parts.month - 1 || probe.getUTCDate() !== parts.day
    || probe.getUTCHours() !== parts.hour || probe.getUTCMinutes() !== parts.minute || probe.getUTCSeconds() !== parts.second) return undefined;
  return parts;
}

function formatLocal(parts: LocalDateTimeParts): string {
  const date = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
  if (!parts.hasTime) return date;
  const base = `${date}T${pad(parts.hour)}:${pad(parts.minute)}`;
  return parts.second ? `${base}:${pad(parts.second)}` : base;
}

function localDate(parts: LocalDateTimeParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
}

function partsFromDate(date: Date, template: LocalDateTimeParts): LocalDateTimeParts {
  return {
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: template.hour, minute: template.minute, second: template.second, hasTime: template.hasTime,
  };
}

function exactPartsFromDate(date: Date, hasTime: boolean): LocalDateTimeParts {
  return {
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(), hasTime,
  };
}

function addDays(parts: LocalDateTimeParts, days: number): LocalDateTimeParts {
  const date = localDate(parts);
  date.setUTCDate(date.getUTCDate() + days);
  return partsFromDate(date, parts);
}

function addMonths(parts: LocalDateTimeParts, months: number, day = parts.day): LocalDateTimeParts | undefined {
  const first = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) return undefined;
  return { ...parts, year, month, day };
}

function addYears(parts: LocalDateTimeParts, years: number): LocalDateTimeParts | undefined {
  const next = { ...parts, year: parts.year + years };
  return parseLocal(formatLocal(next)) ? next : undefined;
}

function weekday(parts: LocalDateTimeParts): number {
  return localDate(parts).getUTCDay();
}

function startOfWeek(parts: LocalDateTimeParts): Date {
  const date = localDate(parts);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date;
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  targetWeekday: number,
  ordinal: 1 | 2 | 3 | 4 | -1,
  template: LocalDateTimeParts,
): LocalDateTimeParts | undefined {
  if (ordinal === -1) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const last = { ...template, year, month, day: lastDay };
    const delta = (weekday(last) - targetWeekday + 7) % 7;
    return { ...last, day: lastDay - delta };
  }
  const first = { ...template, year, month, day: 1 };
  const firstDelta = (targetWeekday - weekday(first) + 7) % 7;
  const day = 1 + firstDelta + ((ordinal - 1) * 7);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay ? { ...template, year, month, day } : undefined;
}

function compareLocal(a: string, b: string): number {
  const aa = parseLocal(a);
  const bb = parseLocal(b);
  if (!aa || !bb) return a.localeCompare(b);
  return localDate(aa).getTime() - localDate(bb).getTime();
}

export function isValidIanaTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function localTaskTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidIanaTimeZone(zone) ? zone : 'UTC';
}

export function instantToZonedLocal(timestamp: number, timezone: string): string {
  const safeZone = isValidIanaTimeZone(timezone) ? timezone : 'UTC';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizeWeekdays(values?: number[]): number[] | undefined {
  const normalized = [...new Set((values ?? []).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))].sort((a, b) => a - b);
  return normalized.length ? normalized : undefined;
}

export function normalizeRecurrenceSpec(spec: TaskRecurrenceSpec, fallbackTimezone = localTaskTimeZone()): TaskRecurrenceSpec {
  const frequency = spec.frequency;
  const interval = Math.max(1, Math.min(999, Math.floor(Number.isFinite(spec.interval) ? spec.interval : 1)));
  const weekdays = frequency === 'weekly' ? normalizeWeekdays(spec.weekdays) : undefined;
  const monthDay = frequency === 'monthly' && Number.isInteger(spec.monthDay) && (spec.monthDay ?? 0) >= 1 && (spec.monthDay ?? 0) <= 31
    ? spec.monthDay : undefined;
  const nthWeekday = frequency === 'monthly' && spec.nthWeekday
    && [1, 2, 3, 4, -1].includes(spec.nthWeekday.ordinal)
    && Number.isInteger(spec.nthWeekday.weekday) && spec.nthWeekday.weekday >= 0 && spec.nthWeekday.weekday <= 6
    ? { ...spec.nthWeekday } : undefined;
  let end = spec.end ?? { mode: 'never' as const };
  if (end.mode === 'count') end = { mode: 'count', count: Math.max(1, Math.min(100_000, Math.floor(end.count))) };
  if (end.mode === 'until' && !parseLocal(end.until)) end = { mode: 'never' };
  const timezone = isValidIanaTimeZone(spec.timezone ?? '') ? spec.timezone : fallbackTimezone;
  const normalized: TaskRecurrenceSpec = { frequency, interval, end, timezone };
  if (weekdays) normalized.weekdays = weekdays;
  if (monthDay) normalized.monthDay = monthDay;
  if (nthWeekday) normalized.nthWeekday = nthWeekday;
  normalized.rrule = recurrenceSpecToRRule(normalized);
  return normalized;
}

export function recurrenceSpecFromLegacy(recurrence: TaskItem['recurrence'], timezone = localTaskTimeZone()): TaskRecurrenceSpec | undefined {
  switch (recurrence) {
    case 'daily': return normalizeRecurrenceSpec({ frequency: 'daily', interval: 1, end: { mode: 'never' }, timezone });
    case 'weekdays': return normalizeRecurrenceSpec({ frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], end: { mode: 'never' }, timezone });
    case 'weekly': return normalizeRecurrenceSpec({ frequency: 'weekly', interval: 1, end: { mode: 'never' }, timezone });
    case 'monthly': return normalizeRecurrenceSpec({ frequency: 'monthly', interval: 1, end: { mode: 'never' }, timezone });
    case 'yearly': return normalizeRecurrenceSpec({ frequency: 'yearly', interval: 1, end: { mode: 'never' }, timezone });
    default: return undefined;
  }
}

export function legacyRecurrenceFromSpec(spec?: TaskRecurrenceSpec): TaskItem['recurrence'] {
  if (!spec) return 'none';
  const normalized = normalizeRecurrenceSpec(spec);
  if (normalized.frequency === 'weekly' && normalized.interval === 1 && JSON.stringify(normalized.weekdays) === JSON.stringify([1, 2, 3, 4, 5])) return 'weekdays';
  if (normalized.interval !== 1 || normalized.nthWeekday || normalized.monthDay || (normalized.weekdays?.length ?? 0) > 0) {
    return normalized.frequency;
  }
  return normalized.frequency;
}

function rruleDate(value: string): string {
  const parsed = parseLocal(value);
  if (!parsed) return value.replace(/[-:]/g, '');
  const date = `${pad(parsed.year, 4)}${pad(parsed.month)}${pad(parsed.day)}`;
  return parsed.hasTime ? `${date}T${pad(parsed.hour)}${pad(parsed.minute)}${pad(parsed.second)}` : date;
}

export function recurrenceSpecToRRule(spec: TaskRecurrenceSpec): string {
  const normalizedFrequency = spec.frequency.toUpperCase();
  const parts = [`FREQ=${normalizedFrequency}`, `INTERVAL=${Math.max(1, Math.floor(spec.interval || 1))}`];
  const weekdays = normalizeWeekdays(spec.weekdays);
  if (spec.nthWeekday) parts.push(`BYDAY=${spec.nthWeekday.ordinal}${WEEKDAY_TOKENS[spec.nthWeekday.weekday]}`);
  else if (weekdays?.length) parts.push(`BYDAY=${weekdays.map((value) => WEEKDAY_TOKENS[value]).join(',')}`);
  if (spec.monthDay && !spec.nthWeekday) parts.push(`BYMONTHDAY=${spec.monthDay}`);
  if (spec.end?.mode === 'count') parts.push(`COUNT=${Math.max(1, Math.floor(spec.end.count))}`);
  if (spec.end?.mode === 'until') parts.push(`UNTIL=${rruleDate(spec.end.until)}`);
  return parts.join(';');
}

export function taskRecurrenceSpec(task: TaskItem): TaskRecurrenceSpec | undefined {
  if (task.recurrenceSpec) return normalizeRecurrenceSpec(task.recurrenceSpec);
  return recurrenceSpecFromLegacy(task.recurrence);
}

function isCandidateWithinWeeklyInterval(anchor: LocalDateTimeParts, candidate: LocalDateTimeParts, interval: number): boolean {
  const weeks = Math.floor((startOfWeek(candidate).getTime() - startOfWeek(anchor).getTime()) / (7 * 86_400_000));
  return weeks >= 0 && weeks % interval === 0;
}

export function nextRecurrenceLocal(
  specInput: TaskRecurrenceSpec,
  fromLocal: string,
  seriesAnchorLocal = fromLocal,
): string | undefined {
  const spec = normalizeRecurrenceSpec(specInput);
  const current = parseLocal(fromLocal);
  const anchor = parseLocal(seriesAnchorLocal) ?? current;
  if (!current || !anchor) return undefined;

  if (spec.frequency === 'daily') return formatLocal(addDays(current, spec.interval));

  if (spec.frequency === 'weekly') {
    const selected = normalizeWeekdays(spec.weekdays);
    if (!selected?.length) return formatLocal(addDays(current, 7 * spec.interval));
    let candidate = current;
    for (let i = 0; i < MAX_SCAN_DAYS; i += 1) {
      candidate = addDays(candidate, 1);
      if (selected.includes(weekday(candidate)) && isCandidateWithinWeeklyInterval(anchor, candidate, spec.interval)) return formatLocal(candidate);
    }
    return undefined;
  }

  if (spec.frequency === 'monthly') {
    const desiredDay = spec.monthDay ?? anchor.day;
    for (let step = spec.interval; step <= 12 * 80; step += spec.interval) {
      const monthBase = addMonths(anchor, step, 1);
      if (!monthBase) continue;
      const candidate = spec.nthWeekday
        ? nthWeekdayOfMonth(monthBase.year, monthBase.month, spec.nthWeekday.weekday, spec.nthWeekday.ordinal, anchor)
        : addMonths(anchor, step, desiredDay);
      if (candidate && compareLocal(formatLocal(candidate), fromLocal) > 0) return formatLocal(candidate);
    }
    return undefined;
  }

  for (let step = spec.interval; step <= 400; step += spec.interval) {
    const candidate = addYears(anchor, step);
    if (candidate && compareLocal(formatLocal(candidate), fromLocal) > 0) return formatLocal(candidate);
  }
  return undefined;
}

function recurrenceAnchor(task: TaskItem): string | undefined {
  return task.dueAt ?? task.dueDate ?? task.startAt ?? task.startDate;
}

function seriesIdentity(task: TaskItem): string {
  return task.recurrenceSeriesId ?? task.id;
}

function occurrenceIndex(task: TaskItem): number {
  return Math.max(0, Math.floor(task.recurrenceIndex ?? 0));
}

function endAllowsNext(spec: TaskRecurrenceSpec, nextIndex: number, candidate: string): boolean {
  if (spec.end?.mode === 'count' && nextIndex >= spec.end.count) return false;
  if (spec.end?.mode === 'until') {
    const until = spec.end.until;
    const candidateComparable = parseLocal(until)?.hasTime ? candidate : candidate.slice(0, 10);
    return compareLocal(candidateComparable, until) <= 0;
  }
  return true;
}

function shiftLocalByAnchorDelta(anchor: string, nextAnchor: string, value?: string): string | undefined {
  if (!value) return undefined;
  const from = parseLocal(anchor);
  const to = parseLocal(nextAnchor);
  const source = parseLocal(value);
  if (!from || !to || !source) return undefined;
  const delta = localDate(to).getTime() - localDate(from).getTime();
  const shifted = new Date(localDate(source).getTime() + delta);
  return formatLocal(partsFromDate(shifted, source));
}

function shiftReminder(reminder: TaskReminderRule, anchor: string, nextAnchor: string): TaskReminderRule {
  return {
    ...reminder,
    id: createStableTaskId('reminder'),
    at: shiftLocalByAnchorDelta(anchor, nextAnchor, reminder.at),
    snoozedUntil: undefined,
  };
}

export function effectiveReminderAt(task: TaskItem, reminder: TaskReminderRule): string | undefined {
  if (!reminder.enabled) return undefined;
  if (reminder.snoozedUntil) return reminder.snoozedUntil;
  if (reminder.at) return reminder.at;
  if (reminder.offsetMinutes === undefined) return undefined;
  const due = parseLocal(task.dueAt ?? task.dueDate);
  if (!due) return undefined;
  const date = localDate(due);
  date.setUTCMinutes(date.getUTCMinutes() - reminder.offsetMinutes);
  return formatLocal(exactPartsFromDate(date, due.hasTime));
}

export function snoozeReminder(reminders: TaskReminderRule[] | undefined, reminderId: string, until: string): TaskReminderRule[] {
  if (!parseLocal(until)) return reminders ?? [];
  return (reminders ?? []).map((reminder) => reminder.id === reminderId ? { ...reminder, snoozedUntil: until } : reminder);
}

export function clearReminderSnooze(reminders: TaskReminderRule[] | undefined, reminderId: string): TaskReminderRule[] {
  return (reminders ?? []).map((reminder) => reminder.id === reminderId ? { ...reminder, snoozedUntil: undefined } : reminder);
}

export function snoozeLocalDateTime(fromLocal: string, minutes: number): string | undefined {
  const parsed = parseLocal(fromLocal);
  if (!parsed) return undefined;
  const date = localDate(parsed);
  date.setUTCMinutes(date.getUTCMinutes() + Math.max(1, Math.floor(minutes)));
  return formatLocal(exactPartsFromDate(date, parsed.hasTime));
}

export function createRecurringSuccessor(task: TaskItem, tasks: TaskItem[], now = Date.now()): TaskItem | undefined {
  const spec = taskRecurrenceSpec(task);
  const anchor = recurrenceAnchor(task);
  if (!spec || !anchor || task.occurrenceState === 'skipped' && task.recurrence === 'none') return undefined;
  const currentIndex = occurrenceIndex(task);
  const nextIndex = currentIndex + 1;
  const seriesId = seriesIdentity(task);
  const seriesAnchorTask = tasks.find((candidate) => seriesIdentity(candidate) === seriesId && occurrenceIndex(candidate) === 0) ?? task;
  const seriesAnchor = recurrenceAnchor(seriesAnchorTask) ?? anchor;
  const nextAnchor = nextRecurrenceLocal(spec, anchor, seriesAnchor);
  if (!nextAnchor || !endAllowsNext(spec, nextIndex, nextAnchor)) return undefined;
  const occurrenceKey = `${seriesId}:${nextIndex}:${nextAnchor}`;
  if (tasks.some((candidate) => candidate.occurrenceKey === occurrenceKey
    || (seriesIdentity(candidate) === seriesId && occurrenceIndex(candidate) === nextIndex))) return undefined;

  const nextDueAt = shiftLocalByAnchorDelta(anchor, nextAnchor, task.dueAt);
  const nextDueDate = !task.dueAt ? shiftLocalByAnchorDelta(anchor, nextAnchor, task.dueDate) : undefined;
  const nextStartAt = shiftLocalByAnchorDelta(anchor, nextAnchor, task.startAt);
  const nextStartDate = !task.startAt ? shiftLocalByAnchorDelta(anchor, nextAnchor, task.startDate) : undefined;

  const successor = createTaskItem({
    title: task.title,
    priority: task.priority,
    dueDate: nextDueDate,
    dueAt: nextDueAt,
    startDate: nextStartDate,
    startAt: nextStartAt,
    projectId: task.projectId,
    phaseId: task.phaseId,
    planId: task.planId,
    parentTaskId: task.parentTaskId,
    tags: task.tags,
    assignees: task.assignees,
    important: task.important,
    listId: task.listId,
    inbox: task.inbox,
  }, { now, actor: task.updatedBy ?? task.createdBy ?? 'Local User', source: 'astraea.tasks.recurrence' });

  return {
    ...successor,
    description: task.description,
    descriptionFormat: task.descriptionFormat ?? 'markdown',
    estimateHours: task.estimateHours,
    schedulingMode: task.schedulingMode,
    durationHours: task.durationHours,
    workHours: task.workHours,
    units: task.units,
    constraintType: task.constraintType,
    constraintDate: shiftLocalByAnchorDelta(anchor, nextAnchor, task.constraintDate),
    deadlineDate: shiftLocalByAnchorDelta(anchor, nextAnchor, task.deadlineDate),
    taskCalendarId: task.taskCalendarId,
    resourceCalendarIds: task.resourceCalendarIds ? [...task.resourceCalendarIds] : undefined,
    splitSegments: task.splitSegments?.map((segment) => ({
      ...segment,
      id: createStableTaskId('split'),
      startDate: shiftLocalByAnchorDelta(anchor, nextAnchor, segment.startDate) ?? segment.startDate,
      endDate: shiftLocalByAnchorDelta(anchor, nextAnchor, segment.endDate) ?? segment.endDate,
    })),
    actualHours: undefined,
    actualStartDate: undefined,
    actualFinishDate: undefined,
    recurrence: legacyRecurrenceFromSpec(spec),
    recurrenceSpec: spec,
    recurrenceSeriesId: seriesId,
    recurrenceIndex: nextIndex,
    reminders: task.reminders?.map((reminder) => shiftReminder(reminder, anchor, nextAnchor)) ?? [],
    watchers: task.watchers ?? [],
    linkedWorkspaceUris: task.linkedWorkspaceUris ?? [],
    generatedFromTaskId: task.id,
    occurrenceKey,
    occurrenceState: 'scheduled',
    checklist: (task.checklist ?? []).map((item) => ({ ...item, id: createStableTaskId('check'), completed: false })),
  };
}

function sameSeries(candidate: TaskItem, seriesId: string): boolean {
  return seriesIdentity(candidate) === seriesId;
}

function stripSeriesPatch(patch: Partial<TaskItem>): Partial<TaskItem> {
  const {
    id: _id, createdAt: _createdAt, createdBy: _createdBy, updatedAt: _updatedAt, updatedBy: _updatedBy,
    generatedFromTaskId: _generatedFromTaskId, recurrenceIndex: _recurrenceIndex, occurrenceKey: _occurrenceKey,
    recurrenceSeriesId: _recurrenceSeriesId, activity: _activity,
    ...safe
  } = patch;
  return safe;
}

export function applyRecurrenceOperation(
  tasks: TaskItem[],
  taskId: string,
  operation: RecurrenceOperation,
  scope: RecurrenceScope,
  patch: Partial<TaskItem> = {},
  context: TaskMutationContext = {},
): RecurrenceMutationResult {
  const selected = tasks.find((task) => task.id === taskId);
  if (!selected) return { tasks, createdTaskIds: [], affectedTaskIds: [] };
  const seriesId = seriesIdentity(selected);
  const targetIds = new Set(scope === 'series' ? tasks.filter((task) => sameSeries(task, seriesId)).map((task) => task.id) : [taskId]);
  const safePatch = stripSeriesPatch(patch);
  let next = tasks.map((task) => {
    if (!targetIds.has(task.id)) return task;
    if (operation === 'modify') return applyTaskPatch(task, safePatch, context);
    if (operation === 'complete') return applyTaskPatch(task, {
      completed: true,
      ...(scope === 'series' ? { recurrence: 'none', recurrenceSpec: undefined } : {}),
    }, context);
    return applyTaskPatch(task, {
      completed: false,
      status: 'cancelled',
      progress: 0,
      occurrenceState: 'skipped',
      ...(scope === 'series' ? { recurrence: 'none', recurrenceSpec: undefined } : {}),
    }, context);
  });

  const createdTaskIds: string[] = [];
  if (scope === 'occurrence' && (operation === 'complete' || operation === 'skip')) {
    const changed = next.find((task) => task.id === taskId);
    if (changed) {
      const sourceForNext = operation === 'skip' ? { ...changed, recurrence: selected.recurrence, recurrenceSpec: selected.recurrenceSpec } : changed;
      const successor = createRecurringSuccessor(sourceForNext, next, context.now ?? Date.now());
      if (successor) {
        next = [...next, successor];
        createdTaskIds.push(successor.id);
      }
    }
  }
  return { tasks: next, createdTaskIds, affectedTaskIds: [...targetIds] };
}
