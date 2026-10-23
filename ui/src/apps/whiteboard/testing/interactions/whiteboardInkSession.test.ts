import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardItem } from '../../types';
import {
  applyWhiteboardInkHistoryEntry,
  createWhiteboardInkHistoryEntry,
} from '../../model/whiteboardInkEngine';
import {
  beginWhiteboardInkGesture,
  canRedoWhiteboardInk,
  canUndoWhiteboardInk,
  commitWhiteboardInkMutation,
  completeWhiteboardInkRedo,
  completeWhiteboardInkUndo,
  createWhiteboardInkSession,
  finishWhiteboardInkGesture,
  getWhiteboardInkGestureTool,
  peekWhiteboardInkRedo,
  peekWhiteboardInkUndo,
  recordWhiteboardInkHistory,
  resetWhiteboardInkSessionForDocument,
} from '../../interactions/whiteboardInkSession';

function inkItem(id: string, x: number): WhiteboardItem {
  return {
    id,
    type: 'ink',
    x,
    y: 10,
    width: 20,
    height: 20,
    text: '',
    ink: {
      preset: 'pen',
      inputType: 'pen',
      points: [
        { x: 0, y: 0, t: 0, pressure: 0.5, tiltX: 0, tiltY: 0 },
        { x: 10, y: 10, t: 1, pressure: 0.5, tiltX: 0, tiltY: 0 },
      ],
      color: '#60a5fa',
      width: 3,
      opacity: 1,
    },
  };
}

describe('Whiteboard ink document session', () => {
  it('clears document A history and active pointer ownership when switching to document B', () => {
    const session = createWhiteboardInkSession('document-a');
    const entry = createWhiteboardInkHistoryEntry('document-a', [], [inkItem('stroke-a', 0)]);
    expect(entry).not.toBeNull();
    expect(recordWhiteboardInkHistory(session, 'document-a', entry!)).toBe(true);
    expect(beginWhiteboardInkGesture(session, 'document-a', 42, 'ink-pen')).toBe(true);

    expect(resetWhiteboardInkSessionForDocument(session, 'document-a')).toBe(false);
    expect(resetWhiteboardInkSessionForDocument(session, 'document-b')).toBe(true);
    expect(session).toMatchObject({ documentId: 'document-b', past: [], future: [], activePointerId: null, activeTool: null });
    expect(canUndoWhiteboardInk(session, 'document-b')).toBe(false);
    expect(recordWhiteboardInkHistory(session, 'document-b', entry!)).toBe(false);
    expect(finishWhiteboardInkGesture(session, 'document-b', 42)).toBeNull();
  });

  it('keeps a gesture bound to its starting tool and rejects stale pointer events', () => {
    const session = createWhiteboardInkSession('document-a');
    expect(beginWhiteboardInkGesture(session, 'document-a', 9, 'ink-eraser')).toBe(true);
    expect(getWhiteboardInkGestureTool(session, 'document-a', 9)).toBe('ink-eraser');
    expect(getWhiteboardInkGestureTool(session, 'document-a', 10)).toBeNull();
    expect(resetWhiteboardInkSessionForDocument(session, 'document-b')).toBe(true);
    expect(getWhiteboardInkGestureTool(session, 'document-b', 9)).toBeNull();
    expect(beginWhiteboardInkGesture(session, 'document-b', 9, 'ink-lasso')).toBe(true);
    expect(finishWhiteboardInkGesture(session, 'document-b', 9)).toBe('ink-lasso');
    expect(finishWhiteboardInkGesture(session, 'document-b', 9)).toBeNull();
  });

  it('rejects stale history entries and preserves an equal-ID stroke from another document', () => {
    const before = [inkItem('shared-stroke-id', 0)];
    const after = [inkItem('shared-stroke-id', 100)];
    const entry = createWhiteboardInkHistoryEntry('document-a', before, after);
    const documentBItems = [inkItem('shared-stroke-id', 400)];
    expect(entry).not.toBeNull();
    expect(applyWhiteboardInkHistoryEntry(documentBItems, 'document-b', entry!, 'undo')).toEqual(documentBItems);
    expect(applyWhiteboardInkHistoryEntry(after, 'document-a', entry!, 'undo')).toEqual(before);
  });

  it('does not advance ink history when the authoritative item update is denied', () => {
    const session = createWhiteboardInkSession('document-a');
    const entry = createWhiteboardInkHistoryEntry('document-a', [], [inkItem('stroke-a', 0)]);
    expect(entry).not.toBeNull();
    const commit = vi.fn(() => false);
    expect(commitWhiteboardInkMutation(session, 'document-a', entry!, commit)).toBe(false);
    expect(commit).toHaveBeenCalledOnce();
    expect(canUndoWhiteboardInk(session, 'document-a')).toBe(false);
  });

  it('moves history between undo and redo only after the matching operation succeeds', () => {
    const session = createWhiteboardInkSession('document-a');
    const entry = createWhiteboardInkHistoryEntry('document-a', [], [inkItem('stroke-a', 0)]);
    expect(entry).not.toBeNull();
    expect(recordWhiteboardInkHistory(session, 'document-a', entry!)).toBe(true);
    expect(canUndoWhiteboardInk(session, 'document-a')).toBe(true);
    expect(completeWhiteboardInkUndo(session, 'document-a', entry!)).toBe(true);
    expect(peekWhiteboardInkUndo(session, 'document-a')).toBeNull();
    expect(peekWhiteboardInkRedo(session, 'document-a')).toBe(entry);
    expect(canRedoWhiteboardInk(session, 'document-a')).toBe(true);
    expect(completeWhiteboardInkRedo(session, 'document-a', entry!)).toBe(true);
    expect(canUndoWhiteboardInk(session, 'document-a')).toBe(true);
    expect(canRedoWhiteboardInk(session, 'document-a')).toBe(false);
  });
});
