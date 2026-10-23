// STATUS: DIAMANT VGT SUPREME — bounded document-level Notes undo/redo over canonical WOM snapshots
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';

export const MAX_NOTES_HISTORY_ENTRIES = 64;

export interface NotesDocumentHistoryState {
  past: WorkspaceDocument[];
  future: WorkspaceDocument[];
}

export interface NotesHistoryStep {
  state: NotesDocumentHistoryState;
  document?: WorkspaceDocument;
}

export function createNotesDocumentHistory(): NotesDocumentHistoryState {
  return { past: [], future: [] };
}

export function recordNotesDocumentHistory(
  state: NotesDocumentHistoryState,
  before: WorkspaceDocument,
  after: WorkspaceDocument,
): NotesDocumentHistoryState {
  if (before.id !== after.id || before === after) return state;
  return {
    past: [...state.past, before].slice(-MAX_NOTES_HISTORY_ENTRIES),
    future: [],
  };
}

function restoreSnapshot(snapshot: WorkspaceDocument, current: WorkspaceDocument, now: number): WorkspaceDocument {
  if (snapshot.id !== current.id) throw new Error('Notes history cannot cross document identities.');
  return {
    ...snapshot,
    version: Math.max(current.version, snapshot.version) + 1,
    modified_at: now,
  };
}

export function stepNotesDocumentHistory(
  state: NotesDocumentHistoryState,
  current: WorkspaceDocument,
  direction: 'undo' | 'redo',
  now = Date.now(),
): NotesHistoryStep {
  if (direction === 'undo') {
    const snapshot = state.past.at(-1);
    if (!snapshot) return { state };
    return {
      state: {
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, MAX_NOTES_HISTORY_ENTRIES),
      },
      document: restoreSnapshot(snapshot, current, now),
    };
  }
  const snapshot = state.future[0];
  if (!snapshot) return { state };
  return {
    state: {
      past: [...state.past, current].slice(-MAX_NOTES_HISTORY_ENTRIES),
      future: state.future.slice(1),
    },
    document: restoreSnapshot(snapshot, current, now),
  };
}
