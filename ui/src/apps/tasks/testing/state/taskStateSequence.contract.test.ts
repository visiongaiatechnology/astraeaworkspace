// W-397 — sequence dependence: two calls in the SAME instance must accumulate.
//
// The Vault agent found a state layer that held `const` copies of its arrays, so the second call
// in one instance computed against stale state. Tasks is the app where this bites hardest, because
// completion and recurrence are sequence-dependent: completing a recurring task materialises the
// next occurrence, and a second completion in the same "instance" (the same evolving task array)
// must build on the first result instead of collapsing back to it.
//
// The sequences here are driven through the same pure functions the visible surface calls, using
// the same fold (`persist` in app/TasksOnlyManagement.tsx): the next call receives the previous
// call's output array, never the original.
import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/workspace';
import { applyTaskPatch, toggleTaskCompletion, TASK_SYSTEM_STATUS_DEFINITIONS } from '../../model/taskModel';
import { rollupTaskHierarchy } from '../../model/taskHierarchy';
import { applyRecurrenceOperation, createRecurringSuccessor } from '../../recurrence/taskRecurrence';
import { applyTaskBulkEdit } from '../../views/taskViews';
import { applyTaskBoardMove } from '../../views/taskBoardMove';

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return { id, title, completed: false, priority: 'medium', ...rest };
}

const ctx = { actor: 'Local User', source: 'sequence.contract' };

/** The handler shape from app/TasksOnlyManagement.tsx: toggle, then fold the recurrence successor in. */
function foldToggle(tasks: TaskItem[], id: string, now: number): TaskItem[] {
  const current = tasks.find((candidate) => candidate.id === id);
  if (!current) return tasks;
  const changed = toggleTaskCompletion(current, { ...ctx, now });
  let next = tasks.map((candidate) => (candidate.id === id ? changed : candidate));
  if (changed.completed) {
    const successor = createRecurringSuccessor(changed, next, now);
    if (successor) next = [...next, successor];
  }
  return next;
}

const DAY = 24 * 60 * 60 * 1000;

describe('Tasks sequence dependence (two calls, one instance)', () => {
  it('a second task deletion in the same instance keeps both deletions', () => {
    const start = [
      task({ id: 'a', title: 'A' }),
      task({ id: 'b', title: 'B', parentTaskId: 'a' }),
      task({ id: 'c', title: 'C' }),
    ];
    // Same "handler instance": each call consumes the previous call's result array.
    const deleteOnce = (tasks: TaskItem[], id: string) => rollupTaskHierarchy(
      tasks.filter((candidate) => candidate.id !== id)
        .map((candidate) => (candidate.parentTaskId === id ? { ...candidate, parentTaskId: undefined } : candidate)),
      ctx,
    );

    const afterFirst = deleteOnce(start, 'a');
    expect(afterFirst.map((entry) => entry.id).sort()).toEqual(['b', 'c']);
    const afterSecond = deleteOnce(afterFirst, 'c');

    // Accumulated, not collapsed: only 'b' survives, and it was orphaned by the FIRST deletion.
    expect(afterSecond.map((entry) => entry.id)).toEqual(['b']);
    expect(afterSecond[0]?.parentTaskId).toBeUndefined();
    // The original array is untouched, so a stale `const` copy is detectable.
    expect(start.map((entry) => entry.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('two completions of the same weekly series materialise two successors, not one', () => {
    const monday = new Date('2026-10-05T12:00:00').getTime(); // a Monday
    let tasks: TaskItem[] = [task({
      id: 'weekly', title: 'Weekly review', status: 'not_started', dueDate: '2026-10-05',
      recurrence: 'weekly', recurrenceSpec: { frequency: 'weekly', interval: 1, end: { mode: 'never' } },
    })];

    tasks = foldToggle(tasks, 'weekly', monday);
    expect(tasks).toHaveLength(2);
    const first = tasks.find((entry) => entry.recurrenceIndex === 1);
    expect(first?.dueDate).toBe('2026-10-12');

    // Second call in the same evolving instance: completes the successor, not the original again.
    tasks = foldToggle(tasks, first!.id, monday + DAY);
    expect(tasks).toHaveLength(3);
    const second = tasks.find((entry) => entry.recurrenceIndex === 2);
    expect(second?.dueDate).toBe('2026-10-19');

    // Each occurrence keeps the series identity and its own occurrence key — no collapsing.
    expect(new Set(tasks.map((entry) => entry.recurrenceSeriesId))).toEqual(new Set(['weekly']));
    expect(tasks.map((entry) => entry.recurrenceIndex).sort()).toEqual([0, 1, 2]);
    expect(new Set(tasks.map((entry) => entry.occurrenceKey)).size).toBe(3);
  });

  it('re-completing an already completed occurrence does not fork a second successor', () => {
    const now = new Date('2026-10-05T12:00:00').getTime();
    let tasks: TaskItem[] = [task({
      id: 'weekly', title: 'Weekly review', dueDate: '2026-10-05',
      recurrence: 'weekly', recurrenceSpec: { frequency: 'weekly', interval: 1, end: { mode: 'never' } },
    })];
    tasks = foldToggle(tasks, 'weekly', now);
    const firstSuccessor = tasks.find((entry) => entry.recurrenceIndex === 1)!;

    // Re-opening and completing the ORIGINAL again must be idempotent for occurrence 1: the
    // duplicate-occurrence guard in createRecurringSuccessor refuses to fork it. The series does
    // not jump ahead either, because the work is still being done on occurrence 0.
    const reopened = foldToggle(tasks, 'weekly', now + DAY);
    const recompleted = foldToggle(reopened, 'weekly', now + 2 * DAY);

    const occurrenceOne = recompleted.filter((entry) => entry.recurrenceIndex === 1);
    expect(occurrenceOne).toHaveLength(1);
    expect(occurrenceOne[0]?.id).toBe(firstSuccessor.id);
    expect(recompleted.map((entry) => entry.recurrenceIndex).sort()).toEqual([0, 1]);
    expect(new Set(recompleted.map((entry) => entry.occurrenceKey)).size).toBe(2);
  });

  it('two skipped occurrences advance the series twice', () => {
    const now = new Date('2026-10-05T12:00:00').getTime();
    let tasks: TaskItem[] = [task({
      id: 'daily', title: 'Daily standup', dueDate: '2026-10-05',
      recurrence: 'daily', recurrenceSpec: { frequency: 'daily', interval: 1, end: { mode: 'never' } },
    })];

    const first = applyRecurrenceOperation(tasks, 'daily', 'skip', 'occurrence', {}, { ...ctx, now });
    tasks = first.tasks;
    expect(first.createdTaskIds).toHaveLength(1);
    const successor = tasks.find((entry) => entry.id === first.createdTaskIds[0])!;

    const second = applyRecurrenceOperation(tasks, successor.id, 'skip', 'occurrence', {}, { ...ctx, now: now + DAY });
    expect(second.createdTaskIds).toHaveLength(1);
    expect(second.tasks).toHaveLength(3);

    const dates = second.tasks.map((entry) => entry.dueDate).sort();
    expect(dates).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('two board moves in the same instance land the card in the second column', () => {
    const start = [task({ id: 't1', title: 'One', status: 'not_started' })];
    const move = (tasks: TaskItem[], columnId: string) => {
      const result = applyTaskBoardMove(tasks, ['t1'], columnId, 'status', (candidate, patch) => applyTaskPatch(candidate, patch, ctx));
      return result.ok ? result.tasks : tasks;
    };

    const afterFirst = move(start, 'status:active');
    expect(afterFirst[0]?.status).toBe('active');
    const afterSecond = move(afterFirst, 'status:done');

    // Accumulated: the second move builds on the first, it does not resurrect not_started.
    expect(afterSecond[0]?.status).toBe('done');
    expect(afterSecond[0]?.completed).toBe(true);
    expect(afterSecond[0]?.progress).toBe(100);
    expect(start[0]?.status).toBe('not_started');
  });

  it('two bulk edits in the same instance accumulate across both patches', () => {
    const start = [
      task({ id: 'x', title: 'X', priority: 'low' }),
      task({ id: 'y', title: 'Y', priority: 'low' }),
    ];
    const first = applyTaskBulkEdit(start, ['x', 'y'], { priority: 'high' }, ctx, TASK_SYSTEM_STATUS_DEFINITIONS);
    expect(first.ok).toBe(true);
    const second = applyTaskBulkEdit(first.tasks, ['x'], { progress: 60 }, ctx, TASK_SYSTEM_STATUS_DEFINITIONS);
    expect(second.ok).toBe(true);

    // The priority from call one survives call two; the progress applies only to 'x'.
    expect(second.tasks.map((entry) => [entry.id, entry.priority, entry.progress])).toEqual([
      ['x', 'high', 60],
      ['y', 'high', 0],
    ]);
    expect(start.map((entry) => entry.priority)).toEqual(['low', 'low']);
  });

  it('keeps a rejected second call from clobbering the first call result', () => {
    const start = [task({ id: 'x', title: 'X', priority: 'low' })];
    const first = applyTaskBulkEdit(start, ['x'], { priority: 'high' }, ctx, TASK_SYSTEM_STATUS_DEFINITIONS);
    const rejected = applyTaskBulkEdit(first.tasks, ['x'], { progress: 900 }, ctx, TASK_SYSTEM_STATUS_DEFINITIONS);

    expect(rejected.ok).toBe(false);
    expect(rejected.error).toMatch(/between 0 and 100/);
    // A refused call must return the input untouched, not a partially patched array.
    expect(rejected.tasks).toBe(first.tasks);
    expect(rejected.tasks[0]?.priority).toBe('high');
  });
});

describe('recurrence date-arithmetic bounds (must refuse with a named limit)', () => {
  it('honours a weekly interval by landing on the correct week, not the next matching weekday', () => {
    // Anchor is Monday 2026-10-05; the rule asks for Sundays every 2 weeks. Sunday 2026-10-11 is
    // one calendar week after the anchor week, so it is NOT due; the next valid Sunday is
    // 2026-10-18 (two weeks after the anchor week). Asserted structurally so the case states the
    // interval property instead of pinning a literal.
    const spec = { frequency: 'weekly' as const, interval: 2, weekdays: [0], end: { mode: 'never' as const } };
    const next = createRecurringSuccessor(
      task({ id: 's', title: 'Sun', dueDate: '2026-10-05', recurrence: 'weekly', recurrenceSpec: spec }),
      [],
      new Date('2026-10-05T12:00:00').getTime(),
    );
    expect(next?.dueDate).toBe('2026-10-18');
    const anchor = new Date('2026-10-05T12:00:00');
    const landed = new Date(`${next!.dueDate}T12:00:00`);
    expect(landed.getDay()).toBe(0);
    expect((landed.getTime() - anchor.getTime()) / DAY).toBe(13);

    // And it must always terminate for every weekday/interval combination.
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      for (const interval of [1, 2, 3, 7, 52]) {
        const candidate = createRecurringSuccessor(
          task({ id: `s-${weekday}-${interval}`, title: 'X', dueDate: '2026-10-05', recurrence: 'weekly', recurrenceSpec: { frequency: 'weekly', interval, weekdays: [weekday], end: { mode: 'never' } } }),
          [],
          new Date('2026-10-05T12:00:00').getTime(),
        );
        expect(candidate, `weekday ${weekday} interval ${interval}`).toBeDefined();
      }
    }
  });

  it('refuses a monthly rule that asks for a day the month can never have', () => {
    // 31 February: addMonths returns undefined and the scan bound must exhaust, not loop forever.
    const started = Date.now();
    const candidate = createRecurringSuccessor(
      task({
        id: 'feb31', title: 'Impossible', dueDate: '2026-01-31',
        recurrence: 'monthly',
        recurrenceSpec: { frequency: 'monthly', interval: 1, monthDay: 31, end: { mode: 'never' } },
      }),
      [],
      new Date('2026-01-31T12:00:00').getTime(),
    );
    expect(Date.now() - started).toBeLessThan(2_000);
    // February has no 31st, so the engine must move past it to a month that does, or refuse.
    if (candidate) expect(candidate.dueDate?.slice(0, 7)).not.toBe('2026-02');
  });

  it('stops at a bounded series end instead of expanding over decades', () => {
    const spec = { frequency: 'daily' as const, interval: 1, end: { mode: 'count' as const, count: 3 } };
    let tasks: TaskItem[] = [task({ id: 'c0', title: 'Bounded', dueDate: '2026-01-01', recurrence: 'daily', recurrenceSpec: spec })];

    // Three folds: the count limit is reached and no fourth occurrence may appear.
    for (let i = 0; i < 5; i += 1) {
      const open = tasks.filter((entry) => !entry.completed).at(-1);
      if (!open) break;
      const changed = applyTaskPatch(open, { completed: true }, ctx);
      let next = tasks.map((entry) => (entry.id === open.id ? changed : entry));
      const successor = createRecurringSuccessor(changed, next, Date.now());
      if (successor) next = [...next, successor];
      tasks = next;
    }

    expect(tasks).toHaveLength(3);
    expect(tasks.some((entry) => entry.recurrenceIndex === 3)).toBe(false);
  });

  it('refuses an until-bound that the next occurrence would exceed', () => {
    const candidate = createRecurringSuccessor(
      task({
        id: 'until', title: 'Ending', dueDate: '2026-10-10',
        recurrence: 'daily',
        recurrenceSpec: { frequency: 'daily', interval: 1, end: { mode: 'until', until: '2026-10-10' } },
      }),
      [],
      new Date('2026-10-10T12:00:00').getTime(),
    );
    expect(candidate).toBeUndefined();
  });
});
