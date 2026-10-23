// STATUS: DIAMANT VGT SUPREME — Present undo/redo orchestration
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { commitPresentHistory, createPresentHistory, replacePresentHistoryCurrent, stepPresentHistory, type PresentHistoryState } from './presentHistory';

export interface PresentCommitOptions { coalesceKey?: string; }

export function usePresentDocumentHistory(
  document: WorkspaceDocument,
  publish: (document: WorkspaceDocument) => void,
) {
  const stateRef = useRef<PresentHistoryState>(createPresentHistory(document));
  const lastPublishedRef = useRef<WorkspaceDocument>(document);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (document === lastPublishedRef.current) return;
    stateRef.current = replacePresentHistoryCurrent(stateRef.current, document);
    lastPublishedRef.current = document;
    setRevision((value) => value + 1);
  }, [document]);

  const commit = useCallback((next: WorkspaceDocument, options: PresentCommitOptions = {}) => {
    const current = stateRef.current.entries[stateRef.current.index]?.document;
    if (next === current) return;
    stateRef.current = commitPresentHistory(stateRef.current, next, options.coalesceKey);
    lastPublishedRef.current = next;
    setRevision((value) => value + 1);
    publish(next);
  }, [publish]);

  const step = useCallback((direction: 'undo' | 'redo') => {
    const result = stepPresentHistory(stateRef.current, direction);
    stateRef.current = result.state;
    if (!result.document) return false;
    const restored: WorkspaceDocument = {
      ...result.document,
      version: Math.max(document.version, result.document.version) + 1,
      modified_at: Date.now(),
    };
    stateRef.current = replacePresentHistoryCurrent(stateRef.current, restored);
    lastPublishedRef.current = restored;
    setRevision((value) => value + 1);
    publish(restored);
    return true;
  }, [document.version, publish]);

  return {
    commit,
    undo: useCallback(() => step('undo'), [step]),
    redo: useCallback(() => step('redo'), [step]),
    canUndo: stateRef.current.index > 0,
    canRedo: stateRef.current.index < stateRef.current.entries.length - 1,
    revision,
  };
}
