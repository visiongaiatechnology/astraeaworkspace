// AST-0986 / AST-0987 / AST-0988 — external ICS VTODO import fidelity.
//
// Measured before the fix (probe, repo HEAD 4d5ee24):
//   DUE:20261015T140000Z            -> dueAt undefined, dueDate '2026-10-15'   (time of day lost)
//   export(timed task) -> import    -> dueAt undefined, dueDate undefined     (own export unreadable)
//   RRULE:FREQ=WEEKLY;INTERVAL=3…   -> recurrence 'weekly', recurrenceSpec undefined (interval/count/until lost)
//   DUE;TZID=Europe/Berlin:2026…    -> value never parsed (parameter colon taken as separator)
//   BEGIN:VALARM / TRIGGER:-PT30M   -> reminders [] (alarms silently dropped)
import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/work-management/workspaceWork';
import {
  exportTasksToIcalendarVtodo,
  parseIcalendarVtodoToTasks,
  parseIcsCalendarDateTime,
  isIcsPropertyNameBoundary,
} from '../../interchange/taskIcalendarVtodo';

function ics(...body: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Probe//EN', ...body, 'END:VCALENDAR', ''].join('\r\n');
}

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return { id, title, completed: false, priority: 'medium', ...rest };
}

describe('ICS VTODO date-time fidelity', () => {
  it('keeps the time of day of a UTC DUE value', () => {
    const parsed = parseIcalendarVtodoToTasks(ics('BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Timed', 'DUE:20261015T140000Z', 'END:VTODO'));
    expect(parsed.tasks).toHaveLength(1);
    const due = parsed.tasks[0].dueAt ?? parsed.tasks[0].dueDate;
    expect(due).toBeDefined();
    // The exact instant is host-timezone dependent; the time of day must survive the import.
    expect(due).not.toBe('2026-10-15');
    expect(Date.parse(due!)).toBe(Date.parse('2026-10-15T14:00:00Z'));
  });

  it('keeps the time of day of a floating DUE value verbatim', () => {
    const parsed = parseIcalendarVtodoToTasks(ics('BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Floating', 'DUE:20261015T140000', 'END:VTODO'));
    expect(parsed.tasks[0].dueAt).toBe('2026-10-15T14:00');
  });

  it('reads a DUE value that carries a TZID parameter', () => {
    const parsed = parseIcalendarVtodoToTasks(ics('BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:TZ', 'DUE;TZID=Europe/Berlin:20261015T140000', 'END:VTODO'));
    expect(parsed.tasks[0].dueAt).toBe('2026-10-15T14:00');
  });

  it('keeps a date-only DUE value date-only', () => {
    const parsed = parseIcalendarVtodoToTasks(ics('BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:AllDay', 'DUE;VALUE=DATE:20261015', 'END:VTODO'));
    expect(parsed.tasks[0].dueDate).toBe('2026-10-15');
    expect(parsed.tasks[0].dueAt).toBeUndefined();
  });

  it('survives its own export roundtrip for a timed task', () => {
    const source = task({ id: 'roundtrip-1', title: 'Timed', dueAt: '2026-10-15T14:00', startAt: '2026-10-14T09:30' });
    const back = parseIcalendarVtodoToTasks(exportTasksToIcalendarVtodo([source])).tasks[0];
    expect(back.dueAt).toBe('2026-10-15T14:00');
    expect(back.startAt).toBe('2026-10-14T09:30');
  });

  it('never treats a URL scheme colon as the property separator', () => {
    const parsed = parseIcalendarVtodoToTasks(ics(
      'BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Link task',
      'URL:vgt://workspace/document/doc-1/object/obj-1',
      'DESCRIPTION:See https://example.com/plan for detail',
      'END:VTODO',
    ));
    expect(parsed.tasks[0].linkedWorkspaceUris).toEqual(['vgt://workspace/document/doc-1/object/obj-1']);
    expect(parsed.tasks[0].description).toBe('See https://example.com/plan for detail');
  });
});

describe('ICS VTODO recurrence fidelity', () => {
  it('keeps INTERVAL, COUNT and UNTIL from an RRULE', () => {
    const parsed = parseIcalendarVtodoToTasks(ics(
      'BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Rec',
      'DUE:20261015T140000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=3;COUNT=5', 'END:VTODO',
    ));
    const spec = parsed.tasks[0].recurrenceSpec;
    expect(spec?.frequency).toBe('weekly');
    expect(spec?.interval).toBe(3);
    expect(spec?.end).toEqual({ mode: 'count', count: 5 });
  });

  it('keeps BYDAY weekdays and UNTIL from an RRULE', () => {
    const parsed = parseIcalendarVtodoToTasks(ics(
      'BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Rec',
      'DUE:20261015T140000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231T000000Z', 'END:VTODO',
    ));
    const spec = parsed.tasks[0].recurrenceSpec;
    expect(spec?.weekdays).toEqual([1, 3, 5]);
    expect(spec?.end).toMatchObject({ mode: 'until' });
  });

  it('exports a canonical RRULE for a custom interval and reads it back', () => {
    const source = task({
      id: 'rec-1', title: 'Every third week', dueAt: '2026-10-15T14:00',
      recurrence: 'weekly', recurrenceSpec: { frequency: 'weekly', interval: 3, end: { mode: 'count', count: 5 } },
    });
    const text = exportTasksToIcalendarVtodo([source]);
    expect(text).toContain('RRULE:FREQ=WEEKLY;INTERVAL=3;COUNT=5');
    const back = parseIcalendarVtodoToTasks(text).tasks[0];
    expect(back.recurrenceSpec?.interval).toBe(3);
    expect(back.recurrenceSpec?.end).toEqual({ mode: 'count', count: 5 });
  });

  it('does not keep a legacy recurrence label that contradicts the recurrence spec', () => {
    const source = task({
      id: 'rec-2', title: 'Every third week', dueAt: '2026-10-15T14:00',
      recurrence: 'weekly', recurrenceSpec: { frequency: 'weekly', interval: 3, end: { mode: 'never' } },
    });
    const back = parseIcalendarVtodoToTasks(exportTasksToIcalendarVtodo([source])).tasks[0];
    // Whatever label the importer stores must not under-report the interval.
    if (back.recurrence === 'weekly') expect(back.recurrenceSpec?.interval).toBe(3);
    expect(back.recurrenceSpec?.interval).toBe(3);
  });
});

describe('ICS VALARM import', () => {
  it('imports a relative TRIGGER as minutes before due', () => {
    const parsed = parseIcalendarVtodoToTasks(ics(
      'BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Alarm', 'DUE:20261015T140000Z',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT30M', 'DESCRIPTION:Heads up', 'END:VALARM',
      'END:VTODO',
    ));
    const reminders = parsed.tasks[0].reminders ?? [];
    expect(reminders).toHaveLength(1);
    expect(reminders[0].offsetMinutes).toBe(30);
    expect(reminders[0].enabled).toBe(true);
    expect(reminders[0].label).toBe('Heads up');
  });

  it('imports an absolute TRIGGER as a reminder instant', () => {
    const parsed = parseIcalendarVtodoToTasks(ics(
      'BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Alarm', 'DUE:20261015T140000Z',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER;VALUE=DATE-TIME:20261014T090000Z', 'END:VALARM',
      'END:VTODO',
    ));
    const reminders = parsed.tasks[0].reminders ?? [];
    expect(reminders).toHaveLength(1);
    expect(reminders[0].at).toBeDefined();
    expect(Date.parse(reminders[0].at!)).toBe(Date.parse('2026-10-14T09:00:00Z'));
  });

  it('imports a day/hour/minute duration trigger', () => {
    const parsed = parseIcalendarVtodoToTasks(ics(
      'BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Alarm', 'DUE:20261015T140000Z',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1DT2H15M', 'END:VALARM',
      'END:VTODO',
    ));
    expect(parsed.tasks[0].reminders?.[0].offsetMinutes).toBe(26 * 60 + 15);
  });

  it('ignores a malformed TRIGGER without dropping the task', () => {
    const parsed = parseIcalendarVtodoToTasks(ics(
      'BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Alarm', 'DUE:20261015T140000Z',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:garbage', 'END:VALARM',
      'END:VTODO',
    ));
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].reminders ?? []).toHaveLength(0);
    expect(parsed.warnings.join(' ')).toMatch(/TRIGGER/i);
  });

  it('does not treat VALARM properties as VTODO properties', () => {
    const parsed = parseIcalendarVtodoToTasks(ics(
      'BEGIN:VTODO', 'UID:a@example.com', 'SUMMARY:Real title', 'DUE:20261015T140000Z',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT10M',
      // A DESCRIPTION inside VALARM must not overwrite the VTODO description.
      'DESCRIPTION:Alarm text', 'END:VALARM',
      'DESCRIPTION:Task text',
      'END:VTODO',
    ));
    expect(parsed.tasks[0].description).toBe('Task text');
    expect(parsed.tasks[0].reminders?.[0].offsetMinutes).toBe(10);
  });
});

describe('ICS property boundary helper', () => {
  it('finds the separator colon only outside quotes', () => {
    const tzidLine = 'DUE;TZID=Europe/Berlin:20261015T140000';
    expect(isIcsPropertyNameBoundary(tzidLine, tzidLine.indexOf(':2026'))).toBe(true);
    expect(isIcsPropertyNameBoundary('SUMMARY:no colon after', 'SUMMARY'.length)).toBe(true);
    const quotedLine = 'X-A;CN="a:b":value';
    const innerColon = quotedLine.indexOf(':b');
    const outerColon = quotedLine.lastIndexOf(':');
    expect(innerColon).toBeLessThan(outerColon);
    expect(isIcsPropertyNameBoundary(quotedLine, innerColon)).toBe(false);
    expect(isIcsPropertyNameBoundary(quotedLine, outerColon)).toBe(true);
  });

  it('parses both compact and extended calendar date-times', () => {
    expect(parseIcsCalendarDateTime('20261015T140000')).toBe('2026-10-15T14:00');
    expect(parseIcsCalendarDateTime('2026-10-15T14:00:00Z')).toBeDefined();
    expect(parseIcsCalendarDateTime('not-a-date')).toBeUndefined();
  });
});
