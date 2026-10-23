// STATUS: DIAMANT VGT SUPREME — bounded canonical WorkspaceDocument history for Tasks/Planner/Projects
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';

export const MAX_TASK_DOCUMENT_HISTORY_ENTRIES = 64;

export interface TaskDocumentHistoryState {
  past: WorkspaceDocument[];
  future: WorkspaceDocument[];
}

export interface TaskDocumentHistoryRefusal {
  code: 'cross-document' | 'empty';
  message: string;
}

export interface TaskDocumentHistoryStep {
  state: TaskDocumentHistoryState;
  document?: WorkspaceDocument;
  /**
   * Set when a step was refused. A refusal is a decision the caller can display; it is never an
   * exception, because this runs inside a global keydown handler where a throw is uncaught and
   * leaves the user with a silent no-op and no recovery path (W-407).
   */
  refusal?: TaskDocumentHistoryRefusal;
}

export function createTaskDocumentHistory(): TaskDocumentHistoryState {
  return { past: [], future: [] };
}

/** Depth of each stack — the values the undo/redo controls render their disabled state from. */
export function taskHistoryAvailability(state: TaskDocumentHistoryState): { canUndo: boolean; canRedo: boolean } {
  return { canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

export type TaskHistoryDirection = 'undo' | 'redo';

/**
 * Maps a keydown to a history direction, or undefined when the event is not a history shortcut.
 * Extracted so the binding can be tested without a DOM: the hook decided this inline before, where
 * no test in headless Node could reach it.
 */
export function taskHistoryShortcutDirection(input: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): TaskHistoryDirection | undefined {
  if (!input.ctrlKey && !input.metaKey) return undefined;
  const key = input.key.toLowerCase();
  if (key === 'y') return 'redo';
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo';
  return undefined;
}

export function recordTaskDocumentHistory(
  state: TaskDocumentHistoryState,
  before: WorkspaceDocument,
  after: WorkspaceDocument,
): TaskDocumentHistoryState {
  if (before.id !== after.id || before === after) return state;
  return {
    past: [...state.past, before].slice(-MAX_TASK_DOCUMENT_HISTORY_ENTRIES),
    future: [],
  };
}

function restoreSnapshot(snapshot: WorkspaceDocument, current: WorkspaceDocument, now: number): WorkspaceDocument {
  return {
    ...snapshot,
    id: current.id,
    version: Math.max(current.version, snapshot.version) + 1,
    modified_at: now,
  };
}

const CROSS_DOCUMENT = (direction: 'undo' | 'redo'): TaskDocumentHistoryRefusal => ({
  code: 'cross-document',
  message: `${direction === 'undo' ? 'Undo' : 'Redo'} was refused: that history entry belongs to a different document, so restoring it could overwrite the document that is open now.`,
});

export function stepTaskDocumentHistory(
  state: TaskDocumentHistoryState,
  current: WorkspaceDocument,
  direction: 'undo' | 'redo',
  now = Date.now(),
): TaskDocumentHistoryStep {
  if (direction === 'undo') {
    const snapshot = state.past.at(-1);
    if (!snapshot) return { state, refusal: { code: 'empty', message: 'There is nothing to undo.' } };
    // History belongs to exactly one document identity. Refuse rather than throw.
    if (snapshot.id !== current.id) return { state, refusal: CROSS_DOCUMENT('undo') };
    return {
      state: {
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, MAX_TASK_DOCUMENT_HISTORY_ENTRIES),
      },
      document: restoreSnapshot(snapshot, current, now),
    };
  }
  const snapshot = state.future[0];
  if (!snapshot) return { state, refusal: { code: 'empty', message: 'There is nothing to redo.' } };
  if (snapshot.id !== current.id) return { state, refusal: CROSS_DOCUMENT('redo') };
  return {
    state: {
      past: [...state.past, current].slice(-MAX_TASK_DOCUMENT_HISTORY_ENTRIES),
      future: state.future.slice(1),
    },
    document: restoreSnapshot(snapshot, current, now),
  };
}
