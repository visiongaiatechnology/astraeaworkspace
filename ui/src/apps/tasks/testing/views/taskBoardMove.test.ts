// AST-0951 … AST-0955 — Kanban board move core.
//
// Measured before this change: the board rendered columns via `boardTaskColumns` but the card row
// exposed only a completion toggle, a selection checkbox and an open handler. `grep -E
// "draggable|onDragStart|onDrop|onDragOver"` over `src/apps/tasks/**` returned no match, and
// `boardTaskColumns` even dropped empty columns, so there was no drop target and no keyboard
// path at all. These tests pin the decision that both the pointer and the keyboard path share.
import { describe, expect, it } from 'vitest';
import type { TaskItem, TaskStatusDefinition } from '../../../../shared/contracts/workspace';
import { TASK_SYSTEM_STATUS_DEFINITIONS, applyTaskPatch } from '../../model/taskModel';
import { applyTaskBoardMove, taskBoardColumnIds, taskBoardGroupId, taskBoardKeyboardTargets, taskBoardMovePatch, isTaskBoardGroupBy } from '../../views/taskBoardMove';

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return { id, title, completed: false, priority: 'medium', ...rest };
}

const apply = (input: TaskItem, patch: Partial<TaskItem>) => applyTaskPatch(input, patch, { now: 1_000 });

describe('board column model', () => {
  it('lists the legal targets of each board axis', () => {
    const tasks = [task({ id: 'a', title: 'A', status: 'not_started', projectId: 'p1', tags: ['x'] })];
    expect(taskBoardColumnIds(tasks, 'priority')).toEqual(['priority:high', 'priority:medium', 'priority:low']);
    expect(taskBoardColumnIds(tasks, 'status')).toEqual(TASK_SYSTEM_STATUS_DEFINITIONS.map((definition) => `status:${definition.id}`));
    expect(taskBoardColumnIds(tasks, 'project')).toEqual(['project:p1']);
    expect(taskBoardColumnIds(tasks, 'tag')).toEqual(['tag:x']);
  });

  it('reports the group a task currently sits in', () => {
    expect(taskBoardGroupId(task({ id: 'a', title: 'A', priority: 'high' }), 'priority')).toBe('priority:high');
    expect(taskBoardGroupId(task({ id: 'a', title: 'A', status: 'waiting' }), 'status')).toBe('status:waiting');
    expect(taskBoardGroupId(task({ id: 'a', title: 'A' }), 'project')).toBe('project:none');
    expect(taskBoardGroupId(task({ id: 'a', title: 'A' }), 'tag')).toBe('tag:untagged');
  });

  it('falls back to a real column when a stored status is not in the definition set', () => {
    const groups = taskBoardGroupId(task({ id: 'a', title: 'A', status: 'legacy_status' }), 'status');
    expect(TASK_SYSTEM_STATUS_DEFINITIONS.map((definition) => `status:${definition.id}`)).toContain(groups);
  });

  it('only accepts the four known board axes', () => {
    expect(isTaskBoardGroupBy('status')).toBe(true);
    expect(isTaskBoardGroupBy('assignee')).toBe(false);
  });
});

describe('board move patch', () => {
  it('maps a status drop onto the canonical status and completion flag', () => {
    const resolved = taskBoardMovePatch(task({ id: 'a', title: 'A', status: 'not_started' }), 'status:done');
    expect(resolved).toEqual({ patch: { status: 'done', completed: true, progress: 100 } });
  });

  it('clears completion when a card is moved out of the done column', () => {
    const resolved = taskBoardMovePatch(task({ id: 'a', title: 'A', status: 'done', completed: true }), 'status:active');
    expect(resolved).toEqual({ patch: { status: 'active', completed: false } });
  });

  it('never leaves completion contradicting a done-mapped custom status', () => {
    const custom: TaskStatusDefinition[] = [
      ...TASK_SYSTEM_STATUS_DEFINITIONS,
      { id: 'shipped', label: 'Shipped', mapsTo: 'done', order: 9 },
    ];
    const resolved = taskBoardMovePatch(task({ id: 'a', title: 'A', status: 'active' }), 'status:shipped', 'status', custom);
    expect(resolved).toEqual({ patch: { status: 'shipped', completed: true, progress: 100 } });
  });

  it('rejects unknown statuses, foreign axes and non-live axes', () => {
    const subject = task({ id: 'a', title: 'A' });
    expect(taskBoardMovePatch(subject, 'status:invented', 'status')).toEqual({ error: 'Unknown board status "invented".' });
    expect(taskBoardMovePatch(subject, 'priority:high', 'status')).toEqual({ error: 'Drop target belongs to a different board grouping.' });
    expect(taskBoardMovePatch(subject, 'not-a-column', 'status')).toEqual({ error: 'Drop target is not a board column.' });
    expect('error' in taskBoardMovePatch(subject, 'tag:x', 'tag')).toBe(true);
    expect('error' in taskBoardMovePatch(subject, 'project:p1', 'project')).toBe(true);
  });

  it('maps a priority drop and reports a no-op inside the same column', () => {
    expect(taskBoardMovePatch(task({ id: 'a', title: 'A', priority: 'low' }), 'priority:high', 'priority')).toEqual({ patch: { priority: 'high' } });
    expect(taskBoardMovePatch(task({ id: 'a', title: 'A', priority: 'low' }), 'priority:low', 'priority')).toEqual({ patch: {} });
  });

  it('rejects an unknown grouping instead of guessing one', () => {
    // Protects the defaulted parameter: an undefined axis must fail closed, not fall through.
    expect(taskBoardMovePatch(task({ id: 'a', title: 'A' }), 'invented:x', 'status')).toEqual({ error: 'Unknown board grouping "invented".' });
  });
});

describe('board move application', () => {
  const tasks = [
    task({ id: 't1', title: 'One', status: 'not_started' }),
    task({ id: 't2', title: 'Two', status: 'active' }),
    task({ id: 't3', title: 'Three', status: 'not_started' }),
  ];

  it('moves a card and returns the board order', () => {
    const result = applyTaskBoardMove(tasks, ['t1'], 'status:active', 'status', apply);
    expect(result.ok).toBe(true);
    expect(result.changedIds).toEqual(['t1']);
    // Board order follows the column order of the definition set (not_started before active),
    // and the untouched cards keep their incoming relative order inside their column.
    const order = result.tasks.map((entry) => entry.id);
    expect(order.filter((id) => id !== 't1')).toEqual(['t3', 't2']);
    expect(order.indexOf('t3')).toBeLessThan(order.indexOf('t1'));
    expect(result.tasks.find((entry) => entry.id === 't1')?.status).toBe('active');
    expect(result.tasks.find((entry) => entry.id === 't1')?.completed).toBe(false);
  });

  it('leaves the input untouched when a move is applied', () => {
    const snapshot = structuredClone(tasks);
    applyTaskBoardMove(tasks, ['t1'], 'status:active', 'status', apply);
    expect(tasks).toEqual(snapshot);
  });

  it('rejects a whole move when one id is unknown, without a partial write', () => {
    const snapshot = structuredClone(tasks);
    const result = applyTaskBoardMove(tasks, ['t1', 'missing'], 'status:done', 'status', apply);
    expect(result.ok).toBe(false);
    expect(result.tasks).toBe(tasks);
    expect(result.error).toMatch(/Unknown task/);
    expect(tasks).toEqual(snapshot);
  });

  it('rejects an illegal column without touching any task', () => {
    const result = applyTaskBoardMove(tasks, ['t1'], 'status:invented', 'status', apply);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Unknown board status "invented".');
  });

  it('reports an empty selection and an over-large selection as errors', () => {
    expect(applyTaskBoardMove(tasks, [], 'status:done', 'status', apply).error).toBe('Select at least one task.');
    const many = Array.from({ length: 501 }, (_, index) => task({ id: `bulk-${index}`, title: `Bulk ${index}` }));
    const result = applyTaskBoardMove(many, many.map((entry) => entry.id), 'status:done', 'status', apply);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/limited to 500/);
  });

  it('is a successful no-op when the card is already in the target column', () => {
    const result = applyTaskBoardMove(tasks, ['t2'], 'status:active', 'status', apply);
    expect(result).toEqual({ ok: true, tasks, changedIds: [] });
  });

  it('records the move in the task activity trail', () => {
    const result = applyTaskBoardMove(tasks, ['t1'], 'status:done', 'status', apply);
    const moved = result.tasks.find((entry) => entry.id === 't1')!;
    expect(moved.activity?.at(-1)?.kind).toBe('status_changed');
    expect(moved.completionDate).toBeDefined();
  });
});

describe('board keyboard targets', () => {
  it('exposes every other status as a keyboard-reachable target', () => {
    const targets = taskBoardKeyboardTargets(task({ id: 'a', title: 'A', status: 'active' }), 'status');
    expect(targets).not.toContain('status:active');
    expect(targets).toContain('status:done');
    expect(targets).toHaveLength(TASK_SYSTEM_STATUS_DEFINITIONS.length - 1);
  });

  it('exposes the other priorities', () => {
    expect(taskBoardKeyboardTargets(task({ id: 'a', title: 'A', priority: 'high' }), 'priority')).toEqual(['priority:medium', 'priority:low']);
  });

  it('does not pretend a tag or project board can be changed without a pointer drop', () => {
    expect(taskBoardKeyboardTargets(task({ id: 'a', title: 'A' }), 'tag')).toEqual([]);
    expect(taskBoardKeyboardTargets(task({ id: 'a', title: 'A' }), 'project')).toEqual([]);
  });
});
