// AST-0999 / W-407 — a refused history step must be a visible decision, not an uncaught throw.
//
// Measured before this change: `stepTaskDocumentHistory` called `restoreSnapshot`, which THREW
// ('Task history cannot cross WorkspaceDocument identities.') when the stored snapshot and the
// current document had different ids. That function is driven from a global `keydown` listener in
// `useTaskDocumentHistory`, so the throw was an uncaught exception in a DOM event handler: the
// user pressed Ctrl+Z, nothing happened, and nothing said why.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  createTaskDocumentHistory,
  recordTaskDocumentHistory,
  stepTaskDocumentHistory,
  MAX_TASK_DOCUMENT_HISTORY_ENTRIES,
} from '../../history/taskDocumentHistory';

function doc(id: string, version = 1, title = 'Tasks'): WorkspaceDocument {
  return {
    id,
    title,
    kind: 'Tasks',
    created_at: 100,
    modified_at: 200,
    version,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
  };
}

describe('task document history — refusals are decisions', () => {
  it('never throws when the stored snapshot belongs to another document', () => {
    const state = recordTaskDocumentHistory(createTaskDocumentHistory(), doc('doc-A', 1), doc('doc-A', 2));
    // The open document is now a different identity: the snapshot must not be applied.
    expect(() => stepTaskDocumentHistory(state, doc('doc-B', 5), 'undo')).not.toThrow();

    const result = stepTaskDocumentHistory(state, doc('doc-B', 5), 'undo');
    expect(result.document).toBeUndefined();
    expect(result.refusal?.code).toBe('cross-document');
    expect(result.refusal?.message).toMatch(/different document/);
    // The history is left intact, so the entry is not silently consumed by the refusal.
    expect(result.state).toBe(state);
  });

  it('refuses a cross-document redo the same way', () => {
    // Build a future entry by undoing once, then present a different current document.
    const recorded = recordTaskDocumentHistory(createTaskDocumentHistory(), doc('doc-A', 1), doc('doc-A', 2));
    const undone = stepTaskDocumentHistory(recorded, doc('doc-A', 2), 'undo');
    expect(undone.document).toBeDefined();

    const redone = stepTaskDocumentHistory(undone.state, doc('doc-B', 9), 'redo');
    expect(redone.document).toBeUndefined();
    expect(redone.refusal?.code).toBe('cross-document');
    expect(redone.refusal?.message).toMatch(/Redo was refused/);
  });

  it('reports an empty history instead of returning nothing at all', () => {
    const empty = createTaskDocumentHistory();
    expect(stepTaskDocumentHistory(empty, doc('doc-A'), 'undo').refusal).toEqual({ code: 'empty', message: 'There is nothing to undo.' });
    expect(stepTaskDocumentHistory(empty, doc('doc-A'), 'redo').refusal).toEqual({ code: 'empty', message: 'There is nothing to redo.' });
  });

  it('applies a same-document undo and reports no refusal', () => {
    const before = doc('doc-A', 1, 'First');
    const after = doc('doc-A', 2, 'Second');
    const state = recordTaskDocumentHistory(createTaskDocumentHistory(), before, after);
    const result = stepTaskDocumentHistory(state, after, 'undo');

    expect(result.refusal).toBeUndefined();
    expect(result.document?.title).toBe('First');
    // The restored snapshot keeps the CURRENT identity and moves the version forward.
    expect(result.document?.id).toBe('doc-A');
    expect(result.document?.version).toBe(3);
    expect(result.state.past).toHaveLength(0);
    expect(result.state.future).toHaveLength(1);
  });

  it('round-trips undo then redo on one document', () => {
    const before = doc('doc-A', 1, 'First');
    const after = doc('doc-A', 2, 'Second');
    const recorded = recordTaskDocumentHistory(createTaskDocumentHistory(), before, after);

    const undone = stepTaskDocumentHistory(recorded, after, 'undo');
    const redone = stepTaskDocumentHistory(undone.state, undone.document!, 'redo');

    expect(redone.refusal).toBeUndefined();
    expect(redone.document?.title).toBe('Second');
    expect(redone.state.future).toHaveLength(0);
  });

  it('does not record a step when the document identity changed between commit and commit', () => {
    const state = createTaskDocumentHistory();
    // A commit that crosses identities is not history this document can restore.
    expect(recordTaskDocumentHistory(state, doc('doc-A', 1), doc('doc-B', 1))).toBe(state);
  });

  it('bounds the history at 64 entries and drops the oldest', () => {
    let state = createTaskDocumentHistory();
    for (let index = 0; index < MAX_TASK_DOCUMENT_HISTORY_ENTRIES + 10; index += 1) {
      state = recordTaskDocumentHistory(state, doc('doc-A', index + 1, `v${index + 1}`), doc('doc-A', index + 2, `v${index + 2}`));
    }
    expect(state.past).toHaveLength(MAX_TASK_DOCUMENT_HISTORY_ENTRIES);
    // The oldest surviving entry is no longer the very first one.
    expect(state.past[0]?.title).toBe('v11');
  });

  it('clears the redo branch when a new edit is committed after an undo', () => {
    const recorded = recordTaskDocumentHistory(createTaskDocumentHistory(), doc('doc-A', 1, 'First'), doc('doc-A', 2, 'Second'));
    const undone = stepTaskDocumentHistory(recorded, doc('doc-A', 2, 'Second'), 'undo');
    expect(undone.state.future).toHaveLength(1);

    const branched = recordTaskDocumentHistory(undone.state, undone.document!, doc('doc-A', 3, 'Third'));
    expect(branched.future).toHaveLength(0);
  });
});
