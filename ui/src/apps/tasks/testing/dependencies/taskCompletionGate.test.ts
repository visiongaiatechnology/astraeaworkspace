// AST-0974 / W-406 — the dependency graph must gate completion, not only announce it.
//
// Measured before this change: `notifications/taskNotifications.ts` could produce a
// `dependency_unblocked` notification, and `dependencies/taskDependencies.ts` projected the graph
// into the detail panel — but nothing consulted the graph when a task was completed. Completing a
// task whose predecessor was still open was neither refused nor warned, so the graph only ever
// spoke in the affirmative.
import { describe, expect, it } from 'vitest';
import type { ProjectDependency, TaskItem } from '../../../../shared/contracts/workspace';
import { evaluateTaskCompletionGate, openPredecessors } from '../../dependencies/taskCompletionGate';

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return { id, title, completed: false, priority: 'medium', ...rest };
}

function edge(overrides: Partial<ProjectDependency> & Pick<ProjectDependency, 'id' | 'predecessorTaskId' | 'successorTaskId'>): ProjectDependency {
  const { id, predecessorTaskId, successorTaskId, ...rest } = overrides;
  return { id, predecessorTaskId, successorTaskId, type: 'FS', lagDays: 0, ...rest };
}

const predecessor = task({ id: 'pred', title: 'Design freeze' });
const successor = task({ id: 'succ', title: 'Ship release' });

describe('completion gate — hard edges (FS/FF/SF)', () => {
  it('refuses completion of a finish-to-start successor while its predecessor is open', () => {
    const gate = evaluateTaskCompletionGate(successor, [predecessor, successor], [edge({ id: 'e1', predecessorTaskId: 'pred', successorTaskId: 'succ' })], true);
    expect(gate.allowed).toBe(false);
    expect(gate.blockingTaskIds).toEqual(['pred']);
    expect(gate.reason).toBe('Cannot complete yet: "Design freeze" must finish first.');
  });

  it('allows completion once the predecessor is complete', () => {
    const done = { ...predecessor, completed: true };
    const gate = evaluateTaskCompletionGate(successor, [done, successor], [edge({ id: 'e1', predecessorTaskId: 'pred', successorTaskId: 'succ' })], true);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBeUndefined();
  });

  it('treats FF and SF as hard edges too, and names the type', () => {
    for (const type of ['FF', 'SF'] as const) {
      const gate = evaluateTaskCompletionGate(successor, [predecessor, successor], [edge({ id: `e-${type}`, predecessorTaskId: 'pred', successorTaskId: 'succ', type })], true);
      expect(gate.allowed, type).toBe(false);
      expect(gate.blockers[0]).toMatchObject({ id: 'pred', type, severity: 'blocking' });
    }
  });

  it('names every blocker when several predecessors are open', () => {
    const other = task({ id: 'pred2', title: 'Security review' });
    const gate = evaluateTaskCompletionGate(
      successor,
      [predecessor, other, successor],
      [
        edge({ id: 'e1', predecessorTaskId: 'pred', successorTaskId: 'succ' }),
        edge({ id: 'e2', predecessorTaskId: 'pred2', successorTaskId: 'succ' }),
      ],
      true,
    );
    expect(gate.blockingTaskIds).toEqual(['pred', 'pred2']);
    expect(gate.reason).toBe('Cannot complete yet: 2 predecessors must finish first (Design freeze, Security review).');
  });
});

describe('completion gate — advisory edges and non-gates', () => {
  it('warns but does not refuse on a start-to-start edge', () => {
    const gate = evaluateTaskCompletionGate(successor, [predecessor, successor], [edge({ id: 'e1', predecessorTaskId: 'pred', successorTaskId: 'succ', type: 'SS' })], true);
    expect(gate.allowed).toBe(true);
    expect(gate.advisory).toBe('Note: "Design freeze" has not finished; this task starts while they are still open.');
    expect(gate.blockers[0]).toMatchObject({ type: 'SS', severity: 'advisory' });
  });

  it('never blocks reopening a completed task', () => {
    const doneSuccessor = { ...successor, completed: true };
    const gate = evaluateTaskCompletionGate(doneSuccessor, [predecessor, doneSuccessor], [edge({ id: 'e1', predecessorTaskId: 'pred', successorTaskId: 'succ' })], false);
    expect(gate.allowed).toBe(true);
    expect(gate.blockers).toEqual([]);
  });

  it('ignores edges that point at another task, and a self-edge', () => {
    const unrelated = task({ id: 'other', title: 'Other' });
    const gate = evaluateTaskCompletionGate(
      successor,
      [predecessor, successor, unrelated],
      [
        edge({ id: 'e1', predecessorTaskId: 'pred', successorTaskId: 'other' }),
        edge({ id: 'e2', predecessorTaskId: 'succ', successorTaskId: 'succ' }),
      ],
      true,
    );
    expect(gate.allowed).toBe(true);
  });

  it('does not let a dangling edge block work', () => {
    // The predecessor no longer exists: an edge to a deleted task is not a gate.
    const gate = evaluateTaskCompletionGate(successor, [successor], [edge({ id: 'e1', predecessorTaskId: 'deleted', successorTaskId: 'succ' })], true);
    expect(gate.allowed).toBe(true);
  });

  it('does not double-count two edges between the same pair', () => {
    const gate = evaluateTaskCompletionGate(
      successor,
      [predecessor, successor],
      [
        edge({ id: 'e1', predecessorTaskId: 'pred', successorTaskId: 'succ' }),
        edge({ id: 'e2', predecessorTaskId: 'pred', successorTaskId: 'succ', type: 'FF' }),
      ],
      true,
    );
    expect(gate.blockingTaskIds).toEqual(['pred']);
    expect(gate.blockers).toHaveLength(1);
  });

  it('is allowed with no dependencies at all', () => {
    const gate = evaluateTaskCompletionGate(successor, [successor], [], true);
    expect(gate).toEqual({ allowed: true, blockingTaskIds: [], blockers: [] });
  });
});

describe('open predecessor projection', () => {
  it('lists unfinished predecessors with their edge type and severity', () => {
    const done = { ...predecessor, completed: true };
    const open = task({ id: 'pred2', title: 'Security review' });
    const entries = openPredecessors(
      successor,
      [done, open, successor],
      [
        edge({ id: 'e1', predecessorTaskId: 'pred', successorTaskId: 'succ' }),
        edge({ id: 'e2', predecessorTaskId: 'pred2', successorTaskId: 'succ', type: 'SS' }),
      ],
    );
    // A completed predecessor is not listed; the open one is, and it is marked advisory.
    expect(entries).toEqual([{ id: 'pred2', title: 'Security review', type: 'SS', severity: 'advisory' }]);
  });

  it('returns an empty list when nothing is open', () => {
    expect(openPredecessors(successor, [successor], [])).toEqual([]);
  });
});
