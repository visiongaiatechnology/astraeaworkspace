// STATUS: DIAMANT VGT SUPREME — bounded document-level PDF Studio undo/redo over canonical WOM snapshots.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';

export const MAX_PDF_HISTORY_ENTRIES = 64;

export interface PdfDocumentHistoryState {
  documentId: string | null;
  past: WorkspaceDocument[];
  future: WorkspaceDocument[];
}

export interface PdfHistoryStep {
  state: PdfDocumentHistoryState;
  document?: WorkspaceDocument;
}

export function createPdfDocumentHistory(documentId: string | null = null): PdfDocumentHistoryState {
  return { documentId, past: [], future: [] };
}

export function recordPdfDocumentHistory(
  state: PdfDocumentHistoryState,
  before: WorkspaceDocument,
  after: WorkspaceDocument,
): PdfDocumentHistoryState {
  if (before.id !== after.id || before === after) return state;
  const base = state.documentId === before.id ? state : createPdfDocumentHistory(before.id);
  return {
    documentId: before.id,
    past: [...base.past, structuredClone(before)].slice(-MAX_PDF_HISTORY_ENTRIES),
    future: [],
  };
}

function restoreSnapshot(snapshot: WorkspaceDocument, current: WorkspaceDocument, now: number): WorkspaceDocument {
  if (snapshot.id !== current.id) throw new Error('PDF history cannot cross document identities.');
  return {
    ...structuredClone(snapshot),
    version: Math.max(current.version, snapshot.version) + 1,
    modified_at: now,
  };
}

export function stepPdfDocumentHistory(
  state: PdfDocumentHistoryState,
  current: WorkspaceDocument,
  direction: 'undo' | 'redo',
  now = Date.now(),
): PdfHistoryStep {
  if (state.documentId !== current.id) return { state: createPdfDocumentHistory(current.id) };
  if (direction === 'undo') {
    const snapshot = state.past.at(-1);
    if (!snapshot) return { state };
    return {
      state: {
        documentId: current.id,
        past: state.past.slice(0, -1),
        future: [structuredClone(current), ...state.future].slice(0, MAX_PDF_HISTORY_ENTRIES),
      },
      document: restoreSnapshot(snapshot, current, now),
    };
  }
  const snapshot = state.future[0];
  if (!snapshot) return { state };
  return {
    state: {
      documentId: current.id,
      past: [...state.past, structuredClone(current)].slice(-MAX_PDF_HISTORY_ENTRIES),
      future: state.future.slice(1),
    },
    document: restoreSnapshot(snapshot, current, now),
  };
}
