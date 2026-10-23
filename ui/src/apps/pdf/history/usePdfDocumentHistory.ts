// STATUS: DIAMANT VGT SUPREME
// React orchestration for bounded canonical PDF Studio document history.

import { useEffect, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { createPdfDocumentHistory, recordPdfDocumentHistory, stepPdfDocumentHistory } from './pdfDocumentHistory';

export function usePdfDocumentHistory(
  document: WorkspaceDocument,
  onUpdateDocument: (document: WorkspaceDocument) => void,
) {
  const [history, setHistory] = useState(() => createPdfDocumentHistory(document.id));

  useEffect(() => {
    setHistory((current) => current.documentId === document.id ? current : createPdfDocumentHistory(document.id));
  }, [document.id]);

  const recordTransition = (updatedDocument: WorkspaceDocument) => {
    setHistory((current) => recordPdfDocumentHistory(current, document, updatedDocument));
  };

  const stepHistory = (direction: 'undo' | 'redo') => {
    setHistory((current) => {
      const step = stepPdfDocumentHistory(current, document, direction);
      if (step.document) onUpdateDocument(step.document);
      return step.state;
    });
  };

  return {
    recordTransition,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo: () => stepHistory('undo'),
    redo: () => stepHistory('redo'),
  };
}
