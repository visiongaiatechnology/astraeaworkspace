// STATUS: DIAMANT VGT SUPREME
// Astraea Tasks — RFC 5545 iCalendar VTODO Bi-directional Serializer & Parser
// Schicht 2: Deep Core Engine (Line 1153, 1178)

import { TaskItem, TaskRecurrenceSpec, TaskReminderRule } from '../../../shared/contracts/work-management/workspaceWork';
import { createStableTaskId, isValidTaskId } from '../model/taskModel';
import { isValidIanaTimeZone, localTaskTimeZone } from '../recurrence/taskRecurrence';

export const VTASK_ICS_MAX_BYTES = 8 * 1024 * 1024;
export const VTASK_ICS_MAX_LINES = 250_000;
export const VTASK_ICS_MAX_TASKS = 20_000;
export const VTASK_ICS_MAX_LINE_CHARS = 65_536;
export const VTASK_ICS_MAX_ALARMS_PER_TASK = 32;
/** Bounded relative-reminder window: one year either side of the due instant. */
export const VTASK_ICS_MAX_TRIGGER_MINUTES = 525_600;

export interface VtodoParseResult {
  tasks: TaskItem[];
  unsupportedPropertiesCount: number;
  warnings: string[];
  calendarProdId?: string;
}

const ICS_WEEKDAY_TOKENS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const ICS_WEEKDAY_NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const ICS_FREQUENCIES: ReadonlyArray<TaskItem['recurrence']> = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

function pad2(value: number): string { return value.toString().padStart(2, '0'); }

/**
 * Formats a Date or ISO string into an iCalendar DATE / DATE-TIME string (YYYYMMDDTHHmmssZ).
 */
export function formatIcsDateTime(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function localDateTime(timestamp: number, withSeconds: boolean): string {
  const d = new Date(timestamp);
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad2(d.getSeconds())}` : base;
}

/**
 * Parses a full RFC 5545 DATE / DATE-TIME value, preserving the time of day.
 *
 * - trailing `Z` means UTC and is converted into the host-local wall clock so that the value
 *   round-trips through `formatIcsDateTime`;
 * - a floating (no-`Z`) value, and a value whose `TZID` parameter cannot be resolved locally,
 *   keeps its wall-clock reading verbatim;
 * - a date-only value stays a date.
 */
export function parseIcsCalendarDateTime(icsStr?: string): string | undefined {
  if (!icsStr) return undefined;
  const clean = icsStr.trim().replace(/^"|"$/g, '');
  const match = clean.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2}):?(\d{2})(?::?(\d{2}))?)?(Z)?$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, zulu] = match;
  if (hour === undefined) return `${year}-${month}-${day}`;
  const withSeconds = second !== undefined && second !== '00';
  if (zulu) {
    const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? '0'));
    if (!Number.isFinite(utc)) return undefined;
    return localDateTime(utc, withSeconds);
  }
  return withSeconds ? `${year}-${month}-${day}T${hour}:${minute}:${second}` : `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Parses an iCalendar DATE or DATE-TIME string into a standard YYYY-MM-DD string.
 * Date-only projection; use `parseIcsCalendarDateTime` when the time of day matters.
 */
export function parseIcsDateTime(icsStr?: string): string | undefined {
  const full = parseIcsCalendarDateTime(icsStr);
  return full?.slice(0, 10);
}

/**
 * True when the character at `index` terminates the RFC 5545 property name.
 * A colon inside a quoted parameter value (e.g. `X-A;CN="a:b":value`) does not terminate it.
 */
export function isIcsPropertyNameBoundary(line: string, index: number): boolean {
  if (line[index] !== ':') return false;
  let quoted = false;
  for (let i = 0; i < index; i += 1) {
    if (line[i] === '"') quoted = !quoted;
  }
  return !quoted;
}

interface IcsPropertyLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Splits an unfolded content line into name, parameters and value (RFC 5545 3.1). */
export function splitIcsPropertyLine(line: string): IcsPropertyLine | undefined {
  let separator = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (isIcsPropertyNameBoundary(line, i)) { separator = i; break; }
  }
  if (separator <= 0) return undefined;
  const header = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const segments: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of header) {
    if (ch === '"') { quoted = !quoted; current += ch; continue; }
    if (ch === ';' && !quoted) { segments.push(current); current = ''; continue; }
    current += ch;
  }
  segments.push(current);
  const name = segments[0].trim().toUpperCase();
  if (!name) return undefined;
  const params: Record<string, string> = {};
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    params[segment.slice(0, eq).trim().toUpperCase()] = segment.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

function clampTriggerMinutes(value: number): number {
  return Math.max(-VTASK_ICS_MAX_TRIGGER_MINUTES, Math.min(VTASK_ICS_MAX_TRIGGER_MINUTES, Math.round(value)));
}

/** Parses an RFC 5545 DURATION (e.g. `-P1DT2H15M`) into signed minutes. */
export function parseIcsDurationMinutes(value: string): number | undefined {
  const match = value.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return undefined;
  const [, sign, weeks, days, hours, minutes, seconds] = match;
  if (weeks === undefined && days === undefined && hours === undefined && minutes === undefined && seconds === undefined) return undefined;
  const total = Number(weeks ?? 0) * 7 * 1440
    + Number(days ?? 0) * 1440
    + Number(hours ?? 0) * 60
    + Number(minutes ?? 0)
    + Number(seconds ?? 0) / 60;
  return clampTriggerMinutes(sign === '-' ? -total : total);
}

/** Maps an RFC 5545 VTODO duration TRIGGER (relative to DUE) onto the canonical reminder rule. */
export function reminderFromIcsTrigger(trigger: IcsPropertyLine): TaskReminderRule | undefined {
  const raw = trigger.value.trim();
  if (!raw) return undefined;
  const isDateTime = trigger.params.VALUE === 'DATE-TIME' || /^\d{4}-?\d{2}-?\d{2}T/.test(raw);
  if (isDateTime) {
    const at = parseIcsCalendarDateTime(raw);
    if (!at) return undefined;
    return { id: createStableTaskId('reminder'), at, enabled: true };
  }
  const minutes = parseIcsDurationMinutes(raw);
  if (minutes === undefined) return undefined;
  return { id: createStableTaskId('reminder'), offsetMinutes: clampTriggerMinutes(-minutes), enabled: true };
}

/** Normalizes an ICS RRULE property value into the canonical recurrence spec. */
export function parseIcsRecurrenceSpec(rruleValue: string, timezone = localTaskTimeZone()): TaskRecurrenceSpec | undefined {
  const parts = new Map<string, string>();
  for (const segment of rruleValue.split(';')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    parts.set(segment.slice(0, eq).trim().toUpperCase(), segment.slice(eq + 1).trim());
  }
  const freq = (parts.get('FREQ') ?? '').trim().toUpperCase();
  const byDay = parts.get('BYDAY');
  const isWeekdayPreset = freq === 'WEEKLY' && /^MO,TU,WE,TH,FR$/i.test((byDay ?? '').trim());
  const frequency: TaskRecurrenceSpec['frequency'] = isWeekdayPreset
    ? 'weekly'
    : freq === 'DAILY' ? 'daily'
      : freq === 'WEEKLY' ? 'weekly'
        : freq === 'MONTHLY' ? 'monthly'
          : freq === 'YEARLY' ? 'yearly'
            : (undefined as never);
  if (!frequency) return undefined;

  const intervalRaw = Number(parts.get('INTERVAL') ?? 1);
  const interval = Number.isFinite(intervalRaw) ? Math.max(1, Math.min(999, Math.floor(intervalRaw))) : 1;

  const weekdays = isWeekdayPreset
    ? [1, 2, 3, 4, 5]
    : (byDay ?? '').split(',')
      .map((token) => ICS_WEEKDAY_TOKENS[token.trim().toUpperCase()])
      .filter((day): day is number => Number.isInteger(day))
      .sort((a, b) => a - b);

  let end: TaskRecurrenceSpec['end'] = { mode: 'never' };
  const count = Number(parts.get('COUNT'));
  if (Number.isFinite(count) && count >= 1) end = { mode: 'count', count: Math.min(100_000, Math.floor(count)) };
  else {
    const untilRaw = parts.get('UNTIL');
    const until = untilRaw ? parseIcsCalendarDateTime(untilRaw) : undefined;
    if (until) end = { mode: 'until', until };
  }

  const monthDay = Number(parts.get('BYMONTHDAY'));

  return {
    frequency,
    interval,
    ...(weekdays.length ? { weekdays } : {}),
    ...(frequency === 'monthly' && Number.isInteger(monthDay) && monthDay >= 1 && monthDay <= 31 ? { monthDay } : {}),
    end,
    timezone,
    rrule: rruleValue.trim().toUpperCase(),
  };
}

/**
 * Escapes text according to RFC 5545 section 3.3.11.
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Unescapes RFC 5545 text.
 */
export function unescapeIcsText(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Folds lines to max 75 octets according to RFC 5545.
 */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    parts.push(remaining.slice(0, 75));
    remaining = ' ' + remaining.slice(75);
  }
  parts.push(remaining);
  return parts.join('\r\n');
}

/**
 * Maps task priority to RFC 5545 PRIORITY (0=undefined, 1=high, 5=medium, 9=low).
 */
export function mapPriorityToIcs(priority?: 'low' | 'medium' | 'high'): number {
  switch (priority) {
    case 'high': return 1;
    case 'medium': return 5;
    case 'low': return 9;
    default: return 0;
  }
}

/**
 * Maps RFC 5545 PRIORITY integer to task priority.
 */
export function mapPriorityFromIcs(val: number): 'low' | 'medium' | 'high' {
  if (val >= 1 && val <= 4) return 'high';
  if (val >= 5 && val <= 8) return 'medium';
  return 'low';
}

/** Canonical RRULE for a task: the stored spec wins, the legacy label is only a fallback. */
export function taskRruleValue(task: TaskItem): string | undefined {
  if (task.recurrenceSpec) {
    const spec = task.recurrenceSpec;
    const parts = [`FREQ=${spec.frequency.toUpperCase()}`, `INTERVAL=${Math.max(1, Math.floor(spec.interval || 1))}`];
    if (spec.nthWeekday) parts.push(`BYDAY=${spec.nthWeekday.ordinal === -1 ? '-1' : spec.nthWeekday.ordinal}${ICS_WEEKDAY_NAMES[spec.nthWeekday.weekday] ?? 'MO'}`);
    else if (spec.weekdays?.length) parts.push(`BYDAY=${spec.weekdays.map((day) => ICS_WEEKDAY_NAMES[day] ?? 'MO').join(',')}`);
    if (spec.monthDay && !spec.nthWeekday) parts.push(`BYMONTHDAY=${spec.monthDay}`);
    if (spec.end?.mode === 'count') parts.push(`COUNT=${Math.max(1, Math.floor(spec.end.count))}`);
    if (spec.end?.mode === 'until') {
      const until = formatIcsDateTime(spec.end.until);
      if (until) parts.push(`UNTIL=${until}`);
    }
    return parts.join(';');
  }
  switch (task.recurrence) {
    case 'daily': return 'FREQ=DAILY';
    case 'weekdays': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly': return 'FREQ=WEEKLY';
    case 'monthly': return 'FREQ=MONTHLY';
    case 'yearly': return 'FREQ=YEARLY';
    default: return undefined;
  }
}

/** Serializes one reminder rule as a VTODO VALARM block. */
function reminderToValarmLines(reminder: TaskReminderRule, anchor: string | undefined): string[] {
  if (!reminder.enabled) return [];
  let trigger: string | undefined;
  if (reminder.at) {
    trigger = `TRIGGER;VALUE=DATE-TIME:${formatIcsDateTime(reminder.at) ?? reminder.at}`;
  } else if (reminder.offsetMinutes !== undefined) {
    // Stored as "minutes before due"; RFC 5545 expresses the same instant as a negative duration.
    const magnitude = Math.abs(Math.trunc(reminder.offsetMinutes));
    const sign = reminder.offsetMinutes >= 0 ? '-' : '';
    const days = Math.floor(magnitude / 1440);
    const hours = Math.floor((magnitude % 1440) / 60);
    const minutes = magnitude % 60;
    const datePart = days ? `${days}D` : '';
    const timePart = `${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}` || '0M';
    trigger = `TRIGGER:${sign}P${datePart}T${timePart}`;
  }
  if (!trigger) return [];
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    trigger,
    `DESCRIPTION:${escapeIcsText(reminder.label || 'Task reminder')}`,
    ...(anchor ? [`X-ASTRAEA-ANCHOR:${anchor}`] : []),
    'END:VALARM',
  ];
}

/**
 * Serializes TaskItem[] into a standard RFC 5545 iCalendar VTODO document.
 */
export function exportTasksToIcalendarVtodo(tasks: TaskItem[], calendarTitle = 'Astraea Sovereign Tasks'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VisionGaia Technology//Astraea Tasks VGT 2.1//EN',
    `X-WR-CALNAME:${escapeIcsText(calendarTitle)}`,
    'CALSCALE:GREGORIAN',
  ];

  const nowIcs = formatIcsDateTime(new Date().toISOString())!;

  for (const task of tasks) {
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${task.id}@astraea.vgt`);
    lines.push(`DTSTAMP:${nowIcs}`);
    lines.push(`SUMMARY:${escapeIcsText(task.title)}`);

    if (task.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(task.description)}`);
    }

    // Status mapping
    if (task.completed) {
      lines.push('STATUS:COMPLETED');
      lines.push('PERCENT-COMPLETE:100');
      if (task.completionDate) {
        const comp = formatIcsDateTime(task.completionDate);
        if (comp) lines.push(`COMPLETED:${comp}`);
      }
    } else {
      lines.push('STATUS:NEEDS-ACTION');
      if (typeof task.progress === 'number') {
        lines.push(`PERCENT-COMPLETE:${Math.min(100, Math.max(0, task.progress))}`);
      }
    }

    // Priority
    const prio = mapPriorityToIcs(task.priority);
    if (prio > 0) {
      lines.push(`PRIORITY:${prio}`);
    }

    // Dates — the full instant is written when the task stores one, so the import can keep it.
    const startValue = task.startAt ?? task.startDate;
    if (startValue) {
      const start = formatIcsDateTime(startValue);
      if (start) lines.push(`DTSTART:${start}`);
    }
    const dueValue = task.dueAt ?? task.dueDate;
    if (dueValue) {
      const due = formatIcsDateTime(dueValue);
      if (due) lines.push(`DUE:${due}`);
    }

    // Recurrence RRULE — derived from the canonical spec so INTERVAL/COUNT/UNTIL/BYDAY survive.
    const rrule = taskRruleValue(task);
    if (rrule) lines.push(`RRULE:${rrule}`);

    // Reminders as RFC 5545 alarms
    for (const reminder of task.reminders ?? []) {
      lines.push(...reminderToValarmLines(reminder, dueValue));
    }

    // Parent Task (Subtask hierarchy)
    if (task.parentTaskId) {
      lines.push(`RELATED-TO:${task.parentTaskId}@astraea.vgt`);
    }

    // Categories / Tags
    if (task.tags && task.tags.length > 0) {
      lines.push(`CATEGORIES:${task.tags.map(escapeIcsText).join(',')}`);
    }

    // Watchers / Assignees
    if (task.watchers && task.watchers.length > 0) {
      for (const w of task.watchers) {
        lines.push(`ATTENDEE;CN=${escapeIcsText(w)}:mailto:${escapeIcsText(w)}@local.vgt`);
      }
    }

    // Workspace Deep Links
    if (task.linkedWorkspaceUris && task.linkedWorkspaceUris.length > 0) {
      for (const uri of task.linkedWorkspaceUris) {
        lines.push(`URL:${uri}`);
      }
    }

    lines.push('END:VTODO');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n');
}

/**
 * Parses an RFC 5545 iCalendar VTODO document into canonical TaskItem[].
 */
export function parseIcalendarVtodoToTasks(icsContent: string): VtodoParseResult {
  if (new TextEncoder().encode(icsContent).byteLength > VTASK_ICS_MAX_BYTES) throw new Error(`iCalendar input exceeds ${VTASK_ICS_MAX_BYTES} byte limit.`);
  const normalized = icsContent.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');
  const rawLines = normalized.split('\n');
  if (rawLines.length > VTASK_ICS_MAX_LINES) throw new Error('iCalendar input exceeds bounded line limit.');
  if (rawLines.some((line) => line.length > VTASK_ICS_MAX_LINE_CHARS)) throw new Error('iCalendar input contains an overlong logical line.');

  const tasks: TaskItem[] = [];
  const warnings: string[] = [];
  const unsupportedNames = new Set<string>();
  let unsupportedProps = 0;
  let inCalendar = false;
  let inTodo = false;
  let currentTask: Partial<TaskItem> | null = null;
  let currentProdId: string | undefined;

  // VALARM scope: an alarm is a component inside the VTODO, so its properties (DESCRIPTION,
  // ACTION, …) must never be written onto the task itself.
  let inValarm = false;
  let alarmTrigger: IcsPropertyLine | undefined;
  let alarmLabel: string | undefined;
  let alarmCount = 0;
  let alarmDropped = 0;

  const commitAlarm = () => {
    if (alarmTrigger && currentTask) {
      const reminder = reminderFromIcsTrigger(alarmTrigger);
      if (reminder) {
        const reminders = currentTask.reminders ?? [];
        reminders.push(alarmLabel ? { ...reminder, label: alarmLabel } : reminder);
        currentTask.reminders = reminders;
      } else {
        alarmDropped += 1;
      }
    } else if (alarmTrigger) {
      alarmDropped += 1;
    }
    inValarm = false;
    alarmTrigger = undefined;
    alarmLabel = undefined;
  };

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === 'BEGIN:VCALENDAR') {
      inCalendar = true;
      continue;
    }
    if (trimmed === 'END:VCALENDAR') {
      inCalendar = false;
      continue;
    }

    if (inCalendar && !inTodo && trimmed.startsWith('PRODID:')) {
      currentProdId = trimmed.slice(7);
      continue;
    }

    if (trimmed === 'BEGIN:VALARM') {
      if (inTodo) {
        if (alarmCount >= VTASK_ICS_MAX_ALARMS_PER_TASK) {
          alarmDropped += 1;
          inValarm = false;
        } else {
          alarmCount += 1;
          inValarm = true;
          alarmTrigger = undefined;
          alarmLabel = undefined;
        }
      }
      continue;
    }
    if (trimmed === 'END:VALARM') {
      if (inValarm) commitAlarm();
      continue;
    }

    if (trimmed === 'BEGIN:VTODO') {
      if (tasks.length >= VTASK_ICS_MAX_TASKS) throw new Error(`iCalendar input exceeds ${VTASK_ICS_MAX_TASKS} VTODO items.`);
      inTodo = true;
      inValarm = false;
      alarmTrigger = undefined;
      alarmLabel = undefined;
      alarmCount = 0;
      currentTask = {
        id: createStableTaskId('task-ics'),
        title: 'Untitled VTODO Task',
        priority: 'medium',
        completed: false,
        tags: [],
        watchers: [],
        checklist: [],
        comments: [],
        linkedWorkspaceUris: [],
        attachments: [],
        reminders: [],
      };
      continue;
    }

    if (trimmed === 'END:VTODO') {
      if (inValarm) commitAlarm();
      inTodo = false;
      if (currentTask && currentTask.title) {
        tasks.push(currentTask as TaskItem);
      }
      currentTask = null;
      continue;
    }

    if (!inTodo || !currentTask) continue;

    const property = splitIcsPropertyLine(trimmed);
    if (!property) continue;
    const { name: propName, params: propParams, value: propValue } = property;

    if (inValarm) {
      if (propName === 'TRIGGER') alarmTrigger = property;
      else if (propName === 'DESCRIPTION') alarmLabel = unescapeIcsText(propValue).slice(0, 256);
      else if (propName !== 'ACTION' && propName !== 'UID' && propName !== 'SUMMARY') {
        unsupportedProps++;
        if (unsupportedNames.size < 32) unsupportedNames.add(`VALARM.${propName}`);
      }
      continue;
    }

    switch (propName) {
      case 'UID': {
        const isAstraeaUid = /@astraea\.vgt$/i.test(propValue.trim());
        const cleanId = propValue.replace(/@astraea\.vgt$/i, '').trim();
        if (isAstraeaUid && isValidTaskId(cleanId) && !tasks.some((task) => task.id === cleanId)) currentTask.id = cleanId;
        break;
      }
      case 'SUMMARY':
        currentTask.title = unescapeIcsText(propValue);
        break;
      case 'DESCRIPTION':
        currentTask.description = unescapeIcsText(propValue);
        break;
      case 'STATUS': {
        const s = propValue.toUpperCase().trim();
        currentTask.completed = s === 'COMPLETED' || s === 'DONE';
        break;
      }
      case 'PERCENT-COMPLETE': {
        const pct = parseInt(propValue, 10);
        if (!isNaN(pct)) currentTask.progress = pct;
        break;
      }
      case 'PRIORITY': {
        const prioInt = parseInt(propValue, 10);
        if (!isNaN(prioInt)) currentTask.priority = mapPriorityFromIcs(prioInt);
        break;
      }
      case 'DTSTART': {
        const value = parseIcsCalendarDateTime(propValue);
        if (!value) break;
        if (value.length > 10) currentTask.startAt = value;
        else currentTask.startDate = value;
        break;
      }
      case 'DUE': {
        const value = parseIcsCalendarDateTime(propValue);
        if (!value) break;
        if (value.length > 10) currentTask.dueAt = value;
        else currentTask.dueDate = value;
        break;
      }
      case 'COMPLETED': {
        const value = parseIcsCalendarDateTime(propValue);
        if (value) currentTask.completionDate = value;
        break;
      }
      case 'RRULE': {
        const spec = parseIcsRecurrenceSpec(propValue);
        if (spec) {
          currentTask.recurrenceSpec = spec;
          // A custom interval must not be flattened into a plain frequency label.
          const isPlainPreset = spec.interval === 1 && !spec.monthDay && !spec.nthWeekday;
          if (isPlainPreset) {
            const preset = spec.frequency === 'weekly' && spec.weekdays?.join(',') === '1,2,3,4,5' ? 'weekdays' : spec.frequency;
            currentTask.recurrence = preset;
          } else {
            currentTask.recurrence = 'none';
          }
        }
        break;
      }
      case 'RELATED-TO': {
        currentTask.parentTaskId = propValue.replace(/@astraea\.vgt$/, '').trim();
        break;
      }
      case 'CATEGORIES': {
        const cats = propValue.split(',').map((c) => unescapeIcsText(c.trim())).filter(Boolean);
        currentTask.tags = cats;
        break;
      }
      case 'ATTENDEE': {
        const match = propParams.CN ?? propValue.match(/CN=([^;:]+)/i)?.[1];
        const name = match ? unescapeIcsText(match.trim()) : propValue.replace(/^mailto:/i, '').trim();
        if (name && currentTask.watchers) {
          currentTask.watchers.push(name);
        }
        break;
      }
      case 'URL': {
        if (propValue.startsWith('vgt://') && currentTask.linkedWorkspaceUris) {
          currentTask.linkedWorkspaceUris.push(propValue.trim());
        }
        break;
      }
      case 'DTSTAMP':
        break;
      default:
        unsupportedProps++;
        if (unsupportedNames.size < 32) unsupportedNames.add(propName);
        break;
    }
  }

  if (unsupportedProps > 0) warnings.push(`Ignored ${unsupportedProps} unsupported iCalendar properties${unsupportedNames.size ? ` (${Array.from(unsupportedNames).join(', ')})` : ''}.`);
  if (alarmDropped > 0) warnings.push(`Ignored ${alarmDropped} VALARM component(s) without a usable TRIGGER.`);
  return {
    tasks,
    unsupportedPropertiesCount: unsupportedProps,
    warnings,
    calendarProdId: currentProdId,
  };
}

/** Re-exported for callers that only need to know whether a TZID can be resolved on this host. */
export { isValidIanaTimeZone };
/** Canonical frequency tokens understood by the ICS RRULE serializer. */
export { ICS_FREQUENCIES };
