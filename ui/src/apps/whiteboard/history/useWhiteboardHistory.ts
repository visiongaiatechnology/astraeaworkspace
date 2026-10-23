// STATUS: DIAMANT VGT SUPREME
// React orchestration for bounded Whiteboard edit history.

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  createWhiteboardHistory,
  recordWhiteboardHistory,
  scopeWhiteboardHistoryToDocument,
  stepWhiteboardHistory,
  type WhiteboardHistoryEntry,
  type WhiteboardHistoryState,
} from './whiteboardDocumentHistory';

export function useWhiteboardHistory(documentId: string) {
  const stateRef = useRef<WhiteboardHistoryState>(createWhiteboardHistory(documentId));
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const [, setRevision] = useState(0);
  const currentState = scopeWhiteboardHistoryToDocument(stateRef.current, documentId);

  useLayoutEffect(() => {
    documentIdRef.current = documentId;
    if (stateRef.current.documentId === documentId) return;
    stateRef.current = createWhiteboardHistory(documentId);
    setRevision((value) => value + 1);
  }, [documentId]);

  const record = useCallback((entry: WhiteboardHistoryEntry | null) => {
    if (documentIdRef.current !== documentId || !entry || entry.documentId !== documentId) return;
    const current = scopeWhiteboardHistoryToDocument(stateRef.current, documentId);
    stateRef.current = recordWhiteboardHistory(current, entry);
    setRevision((value) => value + 1);
  }, [documentId]);

  const step = useCallback((direction: 'undo' | 'redo'): WhiteboardHistoryEntry | undefined => {
    if (documentIdRef.current !== documentId) return undefined;
    const current = scopeWhiteboardHistoryToDocument(stateRef.current, documentId);
    const result = stepWhiteboardHistory(current, direction);
    stateRef.current = result.state;
    if (result.entry) setRevision((value) => value + 1);
    return result.entry;
  }, [documentId]);

  return {
    record,
    takeUndo: useCallback(() => step('undo'), [step]),
    takeRedo: useCallback(() => step('redo'), [step]),
    canUndo: currentState.past.length > 0,
    canRedo: currentState.future.length > 0,
    depth: currentState.past.length,
  };
}
