// STATUS: DIAMANT VGT SUPREME — bounded Present document history with explicit coalescing keys
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';

export const PRESENT_HISTORY_LIMIT = 128;

export interface PresentHistoryEntry {
  document: WorkspaceDocument;
  coalesceKey?: string;
}

export interface PresentHistoryState {
  entries: PresentHistoryEntry[];
  index: number;
}

export function createPresentHistory(document: WorkspaceDocument): PresentHistoryState {
  return { entries: [{ document }], index: 0 };
}

export function replacePresentHistoryCurrent(state: PresentHistoryState, document: WorkspaceDocument): PresentHistoryState {
  const entries = [...state.entries];
  entries[state.index] = { ...entries[state.index], document };
  return { entries, index: state.index };
}

export function commitPresentHistory(
  state: PresentHistoryState,
  document: WorkspaceDocument,
  coalesceKey?: string,
): PresentHistoryState {
  const current = state.entries[state.index];
  if (coalesceKey && current?.coalesceKey === coalesceKey) {
    const entries = [...state.entries];
    entries[state.index] = { document, coalesceKey };
    return { entries, index: state.index };
  }
  const entries = [...state.entries.slice(0, state.index + 1), { document, coalesceKey }].slice(-PRESENT_HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
}

export function stepPresentHistory(
  state: PresentHistoryState,
  direction: 'undo' | 'redo',
): { state: PresentHistoryState; document?: WorkspaceDocument } {
  const nextIndex = direction === 'undo' ? state.index - 1 : state.index + 1;
  if (nextIndex < 0 || nextIndex >= state.entries.length) return { state };
  return { state: { entries: state.entries, index: nextIndex }, document: state.entries[nextIndex].document };
}
