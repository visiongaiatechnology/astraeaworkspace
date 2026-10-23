// STATUS: DIAMANT VGT SUPREME
// Astraea Grid multi-sheet workbook state hook

import { useCallback } from 'react';
import type { GridSheetModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  addSheetToDocument,
  changeTabColorInDocument,
  deleteSheetFromDocument,
  duplicateSheetInDocument,
  patchSheetInDocument,
  renameSheetInDocument,
  reorderSheetInDocument,
  setSheetVisibilityInDocument,
} from './gridWorkbookOperations';

export {
  addSheetToDocument,
  changeTabColorInDocument,
  deleteSheetFromDocument,
  duplicateSheetInDocument,
  patchSheetInDocument,
  renameSheetInDocument,
  reorderSheetInDocument,
  setSheetVisibilityInDocument,
};

interface UseGridWorkbookProps {
  document: WorkspaceDocument;
  workbookSheets: GridSheetModel[];
  activeSheetId: string;
  setActiveSheetId: (id: string) => void;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  /** Every rejected workbook operation is reported here so it can never fail silently. */
  onWorkbookError?: (message: string | null) => void;
}

const WORKBOOK_ERROR_MESSAGES: Record<string, string> = {
  sheet_name_conflict: 'Der Blattname ist bereits vergeben. Bitte einen anderen Namen wählen.',
  grid_workbook_structure_protected: 'Die Arbeitsmappenstruktur ist geschützt. Blätter können nicht geändert werden.',
  workbook_requires_visible_sheet: 'Mindestens ein Arbeitsblatt muss sichtbar bleiben.',
  grid_workbook_identity_exhausted: 'Es konnte keine eindeutige Blatt-ID mehr erzeugt werden.',
};

export function useGridWorkbook({
  document,
  workbookSheets,
  activeSheetId,
  setActiveSheetId,
  onUpdateDocument,
  onWorkbookError,
}: UseGridWorkbookProps) {
  const activeSheetModel = workbookSheets.find((s) => s.id === activeSheetId) ?? workbookSheets[0];

  const reportError = useCallback((error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : '';
    onWorkbookError?.(WORKBOOK_ERROR_MESSAGES[message] ?? (message || fallback));
  }, [onWorkbookError]);

  const clearError = useCallback(() => onWorkbookError?.(null), [onWorkbookError]);

  const updateActiveSheet = useCallback(
    (patch: Partial<GridSheetModel>) => {
      if (!activeSheetModel) return;
      const nextDoc = patchSheetInDocument(document, activeSheetModel.id, patch);
      onUpdateDocument(nextDoc);
    },
    [document, activeSheetModel, onUpdateDocument]
  );

  const handleAddSheet = useCallback(
    (name?: string) => {
      try {
        const { updatedDocument, newSheetId } = addSheetToDocument(document, workbookSheets, name);
        onUpdateDocument(updatedDocument);
        setActiveSheetId(newSheetId);
        clearError();
      } catch (error) {
        reportError(error, 'Das Arbeitsblatt konnte nicht hinzugefügt werden.');
      }
    },
    [workbookSheets, document, onUpdateDocument, setActiveSheetId, reportError, clearError]
  );

  const handleRenameSheet = useCallback(
    (sheetId: string, newName: string) => {
      try {
        const nextDoc = renameSheetInDocument(document, sheetId, newName);
        onUpdateDocument(nextDoc);
        clearError();
      } catch (error) {
        // A duplicate sheet name used to escape as an uncaught exception.
        reportError(error, `Das Blatt konnte nicht in „${newName}“ umbenannt werden.`);
      }
    },
    [document, onUpdateDocument, reportError, clearError]
  );

  const handleDuplicateSheet = useCallback(
    (sheetId: string) => {
      try {
        const res = duplicateSheetInDocument(document, workbookSheets, sheetId);
        if (!res) {
          onWorkbookError?.('Das Arbeitsblatt konnte nicht dupliziert werden.');
          return;
        }
        onUpdateDocument(res.updatedDocument);
        setActiveSheetId(res.newSheetId);
        clearError();
      } catch (error) {
        reportError(error, 'Das Arbeitsblatt konnte nicht dupliziert werden.');
      }
    },
    [workbookSheets, document, onUpdateDocument, setActiveSheetId, onWorkbookError, reportError, clearError]
  );

  const handleDeleteSheet = useCallback(
    (sheetId: string) => {
      try {
        const res = deleteSheetFromDocument(document, workbookSheets, sheetId, activeSheetId);
        if (!res) {
          onWorkbookError?.('Das letzte Arbeitsblatt kann nicht gelöscht werden.');
          return;
        }
        onUpdateDocument(res.updatedDocument);
        setActiveSheetId(res.nextActiveId);
        clearError();
      } catch (error) {
        reportError(error, 'Das Arbeitsblatt konnte nicht gelöscht werden.');
      }
    },
    [workbookSheets, activeSheetId, document, onUpdateDocument, setActiveSheetId, onWorkbookError, reportError, clearError]
  );

  const handleReorderSheet = useCallback(
    (sheetId: string, direction: 'left' | 'right') => {
      try {
        const nextDoc = reorderSheetInDocument(document, workbookSheets, sheetId, direction);
        if (nextDoc) onUpdateDocument(nextDoc);
        clearError();
      } catch (error) {
        reportError(error, 'Das Arbeitsblatt konnte nicht verschoben werden.');
      }
    },
    [workbookSheets, document, onUpdateDocument, reportError, clearError]
  );

  const handleChangeTabColor = useCallback(
    (sheetId: string, tabColor?: string) => {
      try {
        const nextDoc = changeTabColorInDocument(document, sheetId, tabColor);
        onUpdateDocument(nextDoc);
        clearError();
      } catch (error) {
        reportError(error, 'Die Registerfarbe konnte nicht gesetzt werden.');
      }
    },
    [document, onUpdateDocument, reportError, clearError]
  );


  const handleSetSheetVisibility = useCallback((sheetId: string, visibility: 'visible'|'hidden'|'very-hidden') => {
    try {
      const nextDoc = setSheetVisibilityInDocument(document, sheetId, visibility);
      onUpdateDocument(nextDoc);
      clearError();
      if (nextDoc.gridData?.activeSheetId && nextDoc.gridData.activeSheetId !== activeSheetId) setActiveSheetId(nextDoc.gridData.activeSheetId);
    } catch (error) {
      reportError(error, 'Die Sichtbarkeit des Arbeitsblatts konnte nicht geändert werden.');
    }
  }, [document, onUpdateDocument, activeSheetId, setActiveSheetId, reportError, clearError]);

  return {
    activeSheetModel,
    updateActiveSheet,
    handleAddSheet,
    handleRenameSheet,
    handleDuplicateSheet,
    handleDeleteSheet,
    handleReorderSheet,
    handleChangeTabColor,
    handleSetSheetVisibility,
  };
}
