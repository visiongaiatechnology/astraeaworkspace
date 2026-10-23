// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import {
  createWhiteboardHistory,
  recordWhiteboardHistory,
  scopeWhiteboardHistoryToDocument,
  type WhiteboardHistoryEntry,
} from '../../history/whiteboardDocumentHistory';

describe('Whiteboard document history scope', () => {
  it('preserves the existing snapshot for its document', () => {
    const history = createWhiteboardHistory('document-a');

    expect(scopeWhiteboardHistoryToDocument(history, 'document-a')).toBe(history);
  });

  it('projects an empty snapshot when the active document changes', () => {
    const history = {
      ...createWhiteboardHistory('document-a'),
      past: [{ documentId: 'document-a', at: 1, itemDeltas: [] }],
    } satisfies ReturnType<typeof createWhiteboardHistory>;

    const scoped = scopeWhiteboardHistoryToDocument(history, 'document-b');

    expect(scoped).toEqual({ documentId: 'document-b', past: [], future: [] });
    expect(scoped).not.toBe(history);
    expect(history.past).toHaveLength(1);
  });

  it('rejects history entries owned by another document', () => {
    const history = createWhiteboardHistory('document-a');
    const foreignEntry: WhiteboardHistoryEntry = {
      documentId: 'document-b',
      at: 1,
      itemDeltas: [],
    };

    expect(recordWhiteboardHistory(history, foreignEntry)).toBe(history);
  });
});
