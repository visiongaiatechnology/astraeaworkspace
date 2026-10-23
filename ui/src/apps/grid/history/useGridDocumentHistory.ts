// STATUS: DIAMANT VGT SUPREME
// Bounded in-memory document undo/redo for all local Grid mutations.

import { useCallback, useEffect, useRef } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';

const HISTORY_LIMIT = 128;

export function useGridDocumentHistory(
  document: WorkspaceDocument,
  publishLocal: (document: WorkspaceDocument) => void,
) {
  const currentRef = useRef(document);
  const undoRef = useRef<WorkspaceDocument[]>([]);
  const redoRef = useRef<WorkspaceDocument[]>([]);

  useEffect(() => { currentRef.current = document; }, [document]);

  const commit = useCallback((next: WorkspaceDocument) => {
    const current = currentRef.current;
    if (next === current) return;
    undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), current];
    redoRef.current = [];
    currentRef.current = next;
    publishLocal(next);
  }, [publishLocal]);

  const undo = useCallback(() => {
    const previous = undoRef.current.pop();
    if (!previous) return false;
    redoRef.current = [...redoRef.current.slice(-(HISTORY_LIMIT - 1)), currentRef.current];
    currentRef.current = previous;
    publishLocal(previous);
    return true;
  }, [publishLocal]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return false;
    undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), currentRef.current];
    currentRef.current = next;
    publishLocal(next);
    return true;
  }, [publishLocal]);

  return { commit, undo, redo };
}
