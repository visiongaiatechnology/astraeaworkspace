// TaskReminderRule.offsetMinutes — single-source contract.
//
// The Tasks UI labels the field "minutesBeforeDue" (TaskRecurrencePanel.tsx) and clamps it to
// >= 0, so the only value a user can produce means "fire this many minutes BEFORE the due
// instant". `effectiveReminderAt` (recurrence/taskRecurrence.ts) already implements that.
// `reminderTime` (notifications/taskNotifications.ts) used to add the offset, firing the same
// rule AFTER the due instant. This test measures that both consumers agree.
import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/workspace';
import { effectiveReminderAt } from '../../recurrence/taskRecurrence';
import {
  DEFAULT_TASK_NOTIFICATION_STATE,
  evaluateTaskNotifications,
  normalizeTaskNotificationState,
} from '../../notifications/taskNotifications';

const DUE_LOCAL = '2026-10-20T10:00';
const DUE_MS = Date.parse(DUE_LOCAL);
const MINUTE = 60_000;
// Evaluation instant is chosen so the due date is neither overdue nor due-soon: the only
// notifications the engine may produce in these tests are the relative reminders themselves.
const EVALUATE_MS = Date.parse('2026-10-15T12:00');

function timedTask(offsetMinutes: number): TaskItem {
  return {
    id: 'task-reminder-contract',
    title: 'Review release plan',
    completed: false,
    priority: 'medium',
    dueAt: DUE_LOCAL,
    reminders: [{ id: 'rule-1', offsetMinutes, enabled: true }],
  };
}

function reminderFireTimes(task: TaskItem): number[] {
  const offsetMinutes = task.reminders![0].offsetMinutes!;
  // Evaluate exactly at the instant the rule is due to fire. Any implementation that fires at a
  // different instant (the old one fired offsetMinutes AFTER due) is then outside the
  // (lastEvaluatedAt, nowMs] window and produces no reminder at all.
  const evaluateAt = DUE_MS - offsetMinutes * MINUTE;
  const state = normalizeTaskNotificationState({
    ...DEFAULT_TASK_NOTIFICATION_STATE,
    lastEvaluatedAt: Math.min(EVALUATE_MS, evaluateAt) - MINUTE,
  });
  const result = evaluateTaskNotifications([task], [], state, 'Local User', evaluateAt);
  // Only relative reminders are under test; due_soon/overdue are a different generator.
  return result.items.filter((item) => item.kind === 'reminder').map((item) => item.createdAt);
}

describe('TaskReminderRule.offsetMinutes = minutes before due', () => {
  it('computes a relative reminder before the due instant in the recurrence core', () => {
    const task = timedTask(30);
    expect(effectiveReminderAt(task, task.reminders![0])).toBe('2026-10-20T09:30');
  });

  it('fires the relative reminder before the due instant in the notification engine', () => {
    expect(reminderFireTimes(timedTask(30))).toEqual([DUE_MS - 30 * MINUTE]);
  });

  it('fires a zero offset exactly at the due instant in both consumers', () => {
    const task = timedTask(0);
    expect(effectiveReminderAt(task, task.reminders![0])).toBe(DUE_LOCAL);
    expect(reminderFireTimes(task)).toEqual([DUE_MS]);
  });

  it('keeps both consumers in agreement for a three-day offset', () => {
    const task = timedTask(3 * 24 * 60);
    expect(effectiveReminderAt(task, task.reminders![0])).toBe('2026-10-17T10:00');
    expect(reminderFireTimes(task)).toEqual([DUE_MS - 3 * 24 * 60 * MINUTE]);
  });

  it('shifts a negative offset the same way in both consumers', () => {
    // Negative means "after due"; both consumers must apply the identical shift.
    const task = timedTask(-15);
    expect(effectiveReminderAt(task, task.reminders![0])).toBe('2026-10-20T10:15');
    expect(reminderFireTimes(task)).toEqual([DUE_MS + 15 * MINUTE]);
  });

  it('never fires an offset reminder whose rule is disabled', () => {
    const task = timedTask(30);
    const disabled: TaskItem = { ...task, reminders: [{ ...task.reminders![0], enabled: false }] };
    expect(effectiveReminderAt(disabled, disabled.reminders![0])).toBeUndefined();
    expect(reminderFireTimes(disabled)).toEqual([]);
  });
});
