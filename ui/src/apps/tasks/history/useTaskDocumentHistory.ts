import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  createTaskDocumentHistory,
  recordTaskDocumentHistory,
  stepTaskDocumentHistory,
  taskHistoryAvailability,
  taskHistoryShortcutDirection,
  type TaskDocumentHistoryState,
} from './taskDocumentHistory';

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]');
}

export function useTaskDocumentHistory(
  document: WorkspaceDocument,
  onUpdateDocument: (document: WorkspaceDocument) => void,
) {
  const currentRef = useRef(document);
  const historyRef = useRef<TaskDocumentHistoryState>(createTaskDocumentHistory());
  const [historyNotice, setHistoryNotice] = useState<string | undefined>(undefined);
  const [, renderRevision] = useState(0);
  useEffect(() => { currentRef.current = document; }, [document]);

  const refresh = useCallback(() => renderRevision((value) => value + 1), []);
  const commit = useCallback((next: WorkspaceDocument) => {
    const current = currentRef.current;
    historyRef.current = recordTaskDocumentHistory(historyRef.current, current, next);
    currentRef.current = next;
    setHistoryNotice(undefined);
    onUpdateDocument(next);
    refresh();
  }, [onUpdateDocument, refresh]);

  const step = useCallback((direction: 'undo' | 'redo') => {
    // Never throw from here: this runs from a global keydown listener, so a throw would be an
    // uncaught exception and the user would see nothing at all (W-407).
    const result = stepTaskDocumentHistory(historyRef.current, currentRef.current, direction);
    historyRef.current = result.state;
    if (result.refusal) {
      setHistoryNotice(result.refusal.message);
      refresh();
      return;
    }
    setHistoryNotice(undefined);
    if (!result.document) return;
    currentRef.current = result.document;
    onUpdateDocument(result.document);
    refresh();
  }, [onUpdateDocument, refresh]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      const direction = taskHistoryShortcutDirection(event);
      if (!direction) return;
      event.preventDefault();
      step(direction);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step]);

  const availability = taskHistoryAvailability(historyRef.current);
  return {
    commit,
    undo: () => step('undo'),
    redo: () => step('redo'),
    historyNotice,
    // `renderRevision` above forces a re-render on every commit and step, so these read the
    // current stacks rather than a value captured when the hook first ran.
    canUndo: availability.canUndo,
    canRedo: availability.canRedo,
  };
}
