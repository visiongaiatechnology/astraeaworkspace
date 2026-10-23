import { describe, expect, it } from 'vitest';
import type { DrawDocumentModel } from '../../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, createEmptyDrawDocument, transactDraw } from '../../model/drawDocumentEngine';
import {
  createDrawHistory,
  pushDrawHistory,
  redoDrawHistory,
  undoDrawHistory,
  type DrawHistoryState,
} from '../../model/drawHistoryEngine';

function updatePan(model: DrawDocumentModel, panX: number): DrawDocumentModel {
  return transactDraw(model, (draft) => { draft.viewport.panX = panX; });
}

describe('Draw undo/redo history', () => {
  it('stores detached snapshots and advances content revisions during undo and redo', () => {
    const original = createEmptyDrawDocument();
    const first = updatePan(original, 12);
    const second = updatePan(first, 24);
    const initialHistory = createDrawHistory(original);
    const afterFirst = pushDrawHistory(initialHistory, first);
    const history = pushDrawHistory(afterFirst, second);

    original.viewport.panX = 500;
    first.viewport.panX = 600;
    expect(history.present.viewport.panX).toBe(24);
    expect(history.past[1].viewport.panX).toBe(12);

    const undoOnce = undoDrawHistory(history);
    expect(undoOnce.present.viewport.panX).toBe(12);
    expect(undoOnce.present.revision).toBe(4);
    const undoTwice = undoDrawHistory(undoOnce);
    expect(undoTwice.present.viewport.panX).toBe(0);
    expect(undoTwice.present.revision).toBe(5);

    const redoOnce = redoDrawHistory(undoTwice);
    expect(redoOnce.present.viewport.panX).toBe(12);
    expect(redoOnce.present.revision).toBe(6);
    const redoTwice = redoDrawHistory(redoOnce);
    expect(redoTwice.present.viewport.panX).toBe(24);
    expect(redoTwice.present.revision).toBe(7);
  });

  it('rejects stale pushes and clears redo history after a new edit', () => {
    const initial = createEmptyDrawDocument();
    const state = pushDrawHistory(createDrawHistory(initial), updatePan(initial, 10));
    const undone = undoDrawHistory(state);

    expect(undone.future).toHaveLength(1);
    const newEdit = updatePan(undone.present, 35);
    const afterEdit = pushDrawHistory(undone, newEdit);
    expect(afterEdit.future).toEqual([]);
    expect(() => pushDrawHistory(afterEdit, afterEdit.present)).toThrow('history-revision-not-forward');
  });

  it('keeps the combined past/future snapshot count within the fixed history cap', () => {
    let state = createDrawHistory(createEmptyDrawDocument());
    let current = state.present;

    for (let index = 1; index <= 70; index += 1) {
      current = updatePan(current, index);
      state = pushDrawHistory(state, current);
    }
    expect(state.past).toHaveLength(64);
    expect(state.future).toHaveLength(0);

    for (let index = 0; index < 64; index += 1) state = undoDrawHistory(state);
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(64);
    expect(undoDrawHistory(state)).toBe(state);
    expect(() => pushDrawHistory({ ...state, past: [...state.past, state.present] }, current)).toThrowError(DrawModelError);
  });

  it('rejects malformed runtime states and snapshots as DrawModelError', () => {
    const model = createEmptyDrawDocument();
    const malformedPresent = { past: [], present: null, future: [] } as unknown as DrawHistoryState;
    expect(() => undoDrawHistory(malformedPresent)).toThrowError(DrawModelError);
    expect(() => undoDrawHistory({ past: [null as unknown as DrawDocumentModel], present: model, future: [] })).toThrowError(DrawModelError);
    expect(() => redoDrawHistory({ past: [], present: model, future: [{} as DrawDocumentModel] })).toThrowError(DrawModelError);
  });

  it('rejects undo/redo when a monotonic revision cannot be represented safely', () => {
    const model = createEmptyDrawDocument();
    const exhausted = { ...model, revision: Number.MAX_SAFE_INTEGER };
    expect(() => undoDrawHistory({ past: [model], present: exhausted, future: [] })).toThrow('history-revision-exhausted');
    expect(() => redoDrawHistory({ past: [], present: exhausted, future: [model] })).toThrow('history-revision-exhausted');
  });

  it('converts structured-clone failures into a stable DrawModelError', () => {
    const model = { ...createEmptyDrawDocument(), unsupported: () => 1 } as unknown as DrawDocumentModel;
    expect(() => createDrawHistory(model)).toThrow('history-clone-failed');
  });
});
