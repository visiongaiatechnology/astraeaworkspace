import { describe, expect, it } from 'vitest';
import type { WhiteboardItem } from '../../types';
import {
  isCurrentWhiteboardManipulationDocument,
  scopeWhiteboardManipulationSelection,
} from '../../interactions/whiteboardManipulationScope';

function item(id: string, hidden = false): WhiteboardItem {
  return { id, type: 'sticky', x: 0, y: 0, width: 120, height: 80, text: id, color: 'yellow', hidden };
}

describe('Whiteboard manipulation document scope', () => {
  it('masks old selection before the new document layout reset, even when IDs repeat', () => {
    const visibleSameId = item('shared-id');
    expect(scopeWhiteboardManipulationSelection({
      documentId: 'document-b',
      selectionDocumentId: 'document-a',
      selectedItemIds: ['shared-id'],
      selectedItemId: 'shared-id',
      items: [visibleSameId],
    })).toEqual([]);
  });

  it('accepts only unique, visible objects from the active document', () => {
    expect(scopeWhiteboardManipulationSelection({
      documentId: 'document-a',
      selectionDocumentId: 'document-a',
      selectedItemIds: ['visible', 'hidden', 'missing', 'visible'],
      selectedItemId: null,
      items: [item('visible'), item('hidden', true)],
    })).toEqual(['visible']);
  });

  it('uses the primary selection only when the multi-selection is empty and scoped', () => {
    const items = [item('primary')];
    expect(scopeWhiteboardManipulationSelection({
      documentId: 'document-a',
      selectionDocumentId: 'document-a',
      selectedItemIds: [],
      selectedItemId: 'primary',
      items,
    })).toEqual(['primary']);
    expect(scopeWhiteboardManipulationSelection({
      documentId: 'document-b',
      selectionDocumentId: 'document-a',
      selectedItemIds: [],
      selectedItemId: 'primary',
      items,
    })).toEqual([]);
  });

  it('rejects callbacks retained from a previous Whiteboard document', () => {
    expect(isCurrentWhiteboardManipulationDocument('document-b', 'document-a')).toBe(false);
    expect(isCurrentWhiteboardManipulationDocument('document-b', 'document-b')).toBe(true);
  });
});
