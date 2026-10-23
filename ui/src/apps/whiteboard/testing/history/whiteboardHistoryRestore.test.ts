// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import type {
  WhiteboardCollaborationState,
  WhiteboardFacilitationState,
  WhiteboardViewConfig,
  WorkspaceDocument,
} from '../../../../shared/contracts/workspace';
import type { WhiteboardHistoryEntry } from '../../history/whiteboardDocumentHistory';
import { prepareWhiteboardHistoryRestore } from '../../history/whiteboardHistoryRestore';

describe('Whiteboard history restoration boundary', () => {
  it('rejects an entry whose document identity differs from the active document', () => {
    const result = prepareWhiteboardHistoryRestore({
      currentDocument: { id: 'document-b' } as WorkspaceDocument,
      currentItems: [],
      currentView: {} as WhiteboardViewConfig,
      currentTemplates: [],
      currentFacilitation: {} as WhiteboardFacilitationState,
      collaboration: {} as WhiteboardCollaborationState,
      entry: {
        documentId: 'document-a',
        at: 1,
        itemDeltas: [],
      } satisfies WhiteboardHistoryEntry,
      direction: 'undo',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'History entry does not belong to the current document.',
    });
  });
});
