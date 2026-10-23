// STATUS: PLATIN — bounded, revision-safe Draw undo/redo snapshots
import type { DrawDocumentModel } from '../../../shared/contracts/draw/workspaceDraw';
import { assertDrawDocument, DrawModelError } from './drawDocumentEngine';

const MAX_DRAW_HISTORY = 64;

export interface DrawHistoryState {
  past: DrawDocumentModel[];
  present: DrawDocumentModel;
  future: DrawDocumentModel[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
      && Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => 'value' in descriptor);
  } catch {
    return false;
  }
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new DrawModelError('history-clone-failed');
  }
}

function assertHistoryState(value: unknown): asserts value is DrawHistoryState {
  if (!isPlainRecord(value) || !Array.isArray(value.past) || !Array.isArray(value.future)) {
    throw new DrawModelError('history-state-invalid');
  }
  if (value.past.length + value.future.length > MAX_DRAW_HISTORY) throw new DrawModelError('history-limit');
  assertDrawDocument(value.present as DrawDocumentModel);
}

function nextRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER) {
    throw new DrawModelError('history-revision-exhausted');
  }
  return revision + 1;
}

export function createDrawHistory(model: DrawDocumentModel): DrawHistoryState {
  assertDrawDocument(model);
  return { past: [], present: clone(model), future: [] };
}

export function pushDrawHistory(state: DrawHistoryState, next: DrawDocumentModel): DrawHistoryState {
  assertHistoryState(state);
  assertDrawDocument(next);
  if (next.revision <= state.present.revision) throw new DrawModelError('history-revision-not-forward');
  const past = state.past.slice(-(MAX_DRAW_HISTORY - 1));
  past.push(clone(state.present));
  return { past, present: clone(next), future: [] };
}

export function undoDrawHistory(state: DrawHistoryState): DrawHistoryState {
  assertHistoryState(state);
  if (!state.past.length) return state;

  const snapshot = state.past[state.past.length - 1];
  assertDrawDocument(snapshot);
  const present = clone(snapshot);
  present.revision = nextRevision(state.present.revision);
  assertDrawDocument(present);
  return {
    past: state.past.slice(0, -1),
    present,
    future: [clone(state.present), ...state.future].slice(0, MAX_DRAW_HISTORY),
  };
}

export function redoDrawHistory(state: DrawHistoryState): DrawHistoryState {
  assertHistoryState(state);
  if (!state.future.length) return state;

  const snapshot = state.future[0];
  assertDrawDocument(snapshot);
  const present = clone(snapshot);
  present.revision = nextRevision(state.present.revision);
  assertDrawDocument(present);
  return {
    past: [...state.past.slice(-(MAX_DRAW_HISTORY - 1)), clone(state.present)],
    present,
    future: state.future.slice(1).map(clone),
  };
}
