// Regression contract for applyTaskPatch status/completion precedence.
//
// Measured at repo HEAD 4d5ee24 before this fix:
//   applyTaskPatch({status:'not_started'}, {status:'active', completed:false}) -> status 'not_started'
//   applyTaskPatch({status:'waiting'},     {completed:false})                 -> status 'not_started'
// `applyTaskPatch` re-derived `status` from the `completed` flag *after* the explicit status had
// been merged in, so a patch that named a status was silently overruled. The board move in
// views/taskBoardMove.ts sends exactly that patch shape (status + completed), which is how the
// defect surfaced.
import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/workspace';
import { applyTaskPatch } from '../../model/taskModel';

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return { id, title, completed: false, priority: 'medium', ...rest };
}

const apply = (input: TaskItem, patch: Partial<TaskItem>) => applyTaskPatch(input, patch, { now: 1_000 });

describe('applyTaskPatch status and completion precedence', () => {
  it('keeps an explicit status that arrives together with completed:false', () => {
    const patched = apply(task({ id: 'a', title: 'A', status: 'not_started' }), { status: 'active', completed: false });
    expect(patched.status).toBe('active');
    expect(patched.completed).toBe(false);
  });

  it('keeps an explicit blocked status that arrives together with completed:false', () => {
    const patched = apply(task({ id: 'a', title: 'A', status: 'not_started' }), { status: 'blocked', completed: false });
    expect(patched.status).toBe('blocked');
    expect(patched.blocked).toBe(true);
  });

  it('keeps an explicit done status that arrives together with completed:true', () => {
    const patched = apply(task({ id: 'a', title: 'A', status: 'active' }), { status: 'done', completed: true });
    expect(patched.status).toBe('done');
    expect(patched.completed).toBe(true);
    expect(patched.progress).toBe(100);
    expect(patched.completionDate).toBeDefined();
  });

  it('still derives the status from completed when no status is given', () => {
    // Explicitly marking a task done/un-done without naming a status keeps the documented
    // completion-derived result. A task that was completed is treated as having been in
    // progress, so un-completing it lands on "active" rather than "not_started" — this is the
    // pre-existing rule and was deliberately left unchanged.
    expect(apply(task({ id: 'a', title: 'A', status: 'waiting' }), { completed: true }).status).toBe('done');
    expect(apply(task({ id: 'a', title: 'A', status: 'done', completed: true }), { completed: false }).status).toBe('active');
    expect(apply(task({ id: 'a', title: 'A', status: 'done', completed: true, progress: 40 }), { completed: false }).status).toBe('active');
  });

  it('does not silently drop a custom status when completion is toggled off', () => {
    // A status the user chose deliberately is not "done", so un-completing must leave it alone
    // instead of rewriting it to not_started.
    for (const status of ['waiting', 'blocked', 'active', 'not_started'] as const) {
      const patched = apply(task({ id: 'a', title: 'A', status }), { completed: false });
      expect(patched.status, status).toBe(status);
    }
  });

  it('treats completed:true without an explicit status as done and clears it again', () => {
    const done = apply(task({ id: 'a', title: 'A', status: 'waiting' }), { completed: true });
    expect(done.completed).toBe(true);
    expect(done.completionDate).toBeDefined();
    const reopened = apply(done, { completed: false });
    expect(reopened.completed).toBe(false);
    expect(reopened.completionDate).toBeUndefined();
  });
});
