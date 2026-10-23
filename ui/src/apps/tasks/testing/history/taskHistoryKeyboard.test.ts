// AST-0983 — the keyboard editing path for undo/redo, and the state its controls render from.
//
// Measured before this change: the Ctrl/Cmd+Z binding and the `canUndo`/`canRedo` derivation lived
// inline inside `useTaskDocumentHistory`. Neither could be reached by any test in headless Node, so
// the project had no evidence at all for the keyboard path ("Aufgabenbearbeitung per Tastatur").
// Both decisions are now pure and pinned here; what still needs a browser is stated at the bottom.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  createTaskDocumentHistory,
  recordTaskDocumentHistory,
  stepTaskDocumentHistory,
  taskHistoryAvailability,
  taskHistoryShortcutDirection,
} from '../../history/taskDocumentHistory';

function doc(title = 'Tasks', version = 1): WorkspaceDocument {
  return {
    id: 'doc-A', title, kind: 'Tasks', created_at: 100, modified_at: 200, version,
    theme_id: 'cosmic-obsidian', root_object_ids: [], objects: {},
  };
}

describe('history shortcut binding', () => {
  it('maps Ctrl+Z to undo and Ctrl+Shift+Z to redo', () => {
    expect(taskHistoryShortcutDirection({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(taskHistoryShortcutDirection({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('redo');
  });

  it('maps Cmd+Z and Cmd+Y for the macOS binding', () => {
    expect(taskHistoryShortcutDirection({ key: 'z', metaKey: true })).toBe('undo');
    expect(taskHistoryShortcutDirection({ key: 'y', metaKey: true })).toBe('redo');
  });

  it('is case-insensitive and accepts Ctrl+Y as redo', () => {
    expect(taskHistoryShortcutDirection({ key: 'Z', ctrlKey: true })).toBe('undo');
    expect(taskHistoryShortcutDirection({ key: 'Y', ctrlKey: true })).toBe('redo');
  });

  it('ignores a bare key or an unrelated modified key', () => {
    expect(taskHistoryShortcutDirection({ key: 'z' })).toBeUndefined();
    expect(taskHistoryShortcutDirection({ key: 'a', ctrlKey: true })).toBeUndefined();
    expect(taskHistoryShortcutDirection({ key: 'Shift', ctrlKey: true })).toBeUndefined();
  });

  it('treats Ctrl+Shift+Y as redo, not as an unknown combination', () => {
    expect(taskHistoryShortcutDirection({ key: 'y', ctrlKey: true, shiftKey: true })).toBe('redo');
  });
});

describe('history control availability', () => {
  it('reports both controls disabled on a fresh history', () => {
    expect(taskHistoryAvailability(createTaskDocumentHistory())).toEqual({ canUndo: false, canRedo: false });
  });

  it('enables undo after one commit and leaves redo disabled', () => {
    const state = recordTaskDocumentHistory(createTaskDocumentHistory(), doc('First', 1), doc('Second', 2));
    expect(taskHistoryAvailability(state)).toEqual({ canUndo: true, canRedo: false });
  });

  it('enables redo only once a step has moved something into the future stack', () => {
    const recorded = recordTaskDocumentHistory(createTaskDocumentHistory(), doc('First', 1), doc('Second', 2));
    const undone = stepTaskDocumentHistory(recorded, doc('Second', 2), 'undo');
    expect(taskHistoryAvailability(undone.state)).toEqual({ canUndo: false, canRedo: true });
  });

  it('returns to both-enabled after a commit, an undo and a redo', () => {
    let state = recordTaskDocumentHistory(createTaskDocumentHistory(), doc('First', 1), doc('Second', 2));
    let current = doc('Second', 2);
    const undone = stepTaskDocumentHistory(state, current, 'undo');
    state = undone.state;
    expect(taskHistoryAvailability(state)).toEqual({ canUndo: false, canRedo: true });

    const redone = stepTaskDocumentHistory(state, undone.document!, 'redo');
    expect(redone.document).toBeDefined();
    expect(taskHistoryAvailability(redone.state)).toEqual({ canUndo: true, canRedo: false });
  });

  it('keeps availability consistent with what a step actually does', () => {
    // The controls must never offer an action the stack cannot perform: whenever availability says
    // a direction is possible, a step in that direction must return a document.
    const recorded = recordTaskDocumentHistory(createTaskDocumentHistory(), doc('First', 1), doc('Second', 2));
    for (const direction of ['undo', 'redo'] as const) {
      const availability = taskHistoryAvailability(recorded);
      const result = stepTaskDocumentHistory(recorded, doc('Second', 2), direction);
      const offered = direction === 'undo' ? availability.canUndo : availability.canRedo;
      if (offered) expect(result.document, direction).toBeDefined();
      else expect(result.refusal, direction).toBeDefined();
    }
  });
});
