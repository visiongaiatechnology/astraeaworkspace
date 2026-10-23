import React from 'react';
import type { ChartObject, GridCell, GridChartTemplate, NetworkCapability, WorkspaceDocument } from '../../shared/contracts/workspace';
import { GridBottomBar } from './toolbar/GridBottomBar';
import { GridModals } from './overlays/GridModals';
import type { GridStateController } from './state/useGridState';
import type { GridSheetUiState } from './state/useGridSheetUiState';
import { useGridCollaboration } from './collaboration/useGridCollaboration';
import { useGridSheetDataActions } from './workbook/actions/useGridSheetDataActions';
import { addSheetToDocument } from './workbook/gridWorkbookOperations';

type CollaborationController = ReturnType<typeof useGridCollaboration>;
type DataActions = ReturnType<typeof useGridSheetDataActions>;

interface GridSheetBottomLayerProps {
  document: WorkspaceDocument;
  workspaceDocuments?: Record<string, WorkspaceDocument>;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onCreateChart: (chart: ChartObject) => void;
  networkCapability: NetworkCapability;
  keyVaultUnlocked: boolean;
  state: GridStateController;
  ui: GridSheetUiState;
  collaboration: CollaborationController;
  dataActions: DataActions;
  workbookCellsBySheet: Record<string, Record<string, GridCell>>;
  applyWorkbookFindReplace: (cellsBySheet: Record<string, Record<string, GridCell>>, sheets: NonNullable<WorkspaceDocument['gridData']>['sheets']) => boolean;
}

export const GridSheetBottomLayer: React.FC<GridSheetBottomLayerProps> = ({
  document, workspaceDocuments, onUpdateDocument, onCreateChart, networkCapability, keyVaultUnlocked,
  state, ui, collaboration, dataActions, workbookCellsBySheet, applyWorkbookFindReplace,
}) => {
  const { workbookSheets, activeSheetId, setActiveSheetId, activeSheetModel, selectedCell, selectedRange, cells, colCount, rowCount,
    primaryTableId, setSelectedCell, setSelectionAnchor, setSelectionFocus, handleCommitValue, handleImportCells,
    applyPasteSpecialOptions, updateActiveSheet, toggleCircleInvalid, isCirclingInvalid, handleAddSheet,
    handleRenameSheet, handleDuplicateSheet, handleDeleteSheet, handleReorderSheet, handleChangeTabColor,
    handleSetSheetVisibility } = state;
  const { handleAddComment, handleToggleResolveComment, handleDeleteComment, recordAnalysisAudit } = dataActions;

  return <>
    <GridBottomBar
      sheets={workbookSheets}
      activeSheetId={activeSheetModel?.id ?? ''}
      onSelectSheet={(sheetId) => {
        setActiveSheetId(sheetId);
        if (document.gridData) onUpdateDocument({ ...document, gridData: { ...document.gridData, activeSheetId: sheetId } });
      }}
      onAddSheet={() => handleAddSheet()}
      onRenameSheet={handleRenameSheet}
      onDuplicateSheet={handleDuplicateSheet}
      onDeleteSheet={handleDeleteSheet}
      onReorderSheet={handleReorderSheet}
      onChangeTabColor={handleChangeTabColor}
      onSetSheetVisibility={handleSetSheetVisibility}
      onUpdateActiveSheet={updateActiveSheet}
      collaborationAvailable={collaboration.available}
      collaborationEnabled={collaboration.enabled}
      collaborationConnecting={collaboration.connecting}
      collaborationPeerCount={collaboration.peerCount}
      collaborationConflictCount={collaboration.conflictCount}
      collaborationError={collaboration.lastError}
      onToggleCollaboration={collaboration.toggle}
    />

    <GridModals
      cells={cells}
      selectedCell={selectedCell}
      selectedRange={selectedRange}
      colCount={colCount}
      rowCount={rowCount}
      activeSheetModel={activeSheetModel}
      activeSheetId={activeSheetId}
      workbookSheets={workbookSheets}
      workbookCellsBySheet={workbookCellsBySheet}
      whatIfModalOpen={ui.whatIfModalOpen}
      onCloseWhatIf={() => ui.setWhatIfModalOpen(false)}
      onCommitValue={handleCommitValue}
      onCommitCellBatch={handleImportCells}
      findReplaceModalOpen={ui.findReplaceModalOpen}
      onCloseFindReplace={() => ui.setFindReplaceModalOpen(false)}
      onSelectCell={(sheetId, coord) => {
        if (sheetId !== activeSheetId) setActiveSheetId(sheetId);
        setSelectedCell(coord); setSelectionAnchor(coord); setSelectionFocus(coord);
      }}
      onApplyWorkbookFindReplace={applyWorkbookFindReplace}
      chartModalOpen={ui.chartModalOpen}
      onCloseChart={() => ui.setChartModalOpen(false)}
      chartDocumentId={document.id}
      chartTableObjectId={primaryTableId ?? ''}
      chartTemplates={document.gridData?.chartTemplates ?? []}
      onUpdateChartTemplates={(templates: GridChartTemplate[]) => onUpdateDocument({ ...document, gridData: { ...(document.gridData ?? { sheets: workbookSheets }), chartTemplates: templates } })}
      onCreateChart={onCreateChart}
      commentsModalOpen={ui.commentsModalOpen}
      onCloseComments={() => ui.setCommentsModalOpen(false)}
      onAddComment={handleAddComment}
      onToggleResolveComment={handleToggleResolveComment}
      onDeleteComment={handleDeleteComment}
      slicerModalOpen={ui.slicerModalOpen}
      onCloseSlicer={() => ui.setSlicerModalOpen(false)}
      onUpdateSlicers={(slicers) => updateActiveSheet({ slicers })}
      dataTableModalOpen={ui.dataTableModalOpen}
      onCloseDataTable={() => ui.setDataTableModalOpen(false)}
      auditModalOpen={ui.auditModalOpen}
      onCloseAudit={() => ui.setAuditModalOpen(false)}
      powerQueryModalOpen={ui.powerQueryModalOpen}
      onClosePowerQuery={() => ui.setPowerQueryModalOpen(false)}
      powerQueryWorkspaceDocuments={workspaceDocuments ?? {}}
      powerQueryDefinitions={document.gridData?.queries ?? []}
      powerQueryNetworkCapability={networkCapability}
      powerQueryKeyVaultUnlocked={keyVaultUnlocked}
      onLoadPowerQuery={(result) => handleImportCells(result.cells, result.query)}
      solverModalOpen={ui.solverModalOpen}
      onCloseSolver={() => ui.setSolverModalOpen(false)}
      onApplySolverSolution={handleImportCells}
      onAnalysisAudit={recordAnalysisAudit}
      monteCarloModalOpen={ui.monteCarloModalOpen}
      onCloseMonteCarlo={() => ui.setMonteCarloModalOpen(false)}
      roundtripModalOpen={ui.roundtripModalOpen}
      onCloseRoundtrip={() => ui.setRoundtripModalOpen(false)}
      onImportSpreadsheetCells={(newCells) => handleImportCells(newCells)}
      pasteSpecialModalOpen={ui.pasteSpecialModalOpen}
      onClosePasteSpecial={() => ui.setPasteSpecialModalOpen(false)}
      onApplyPasteSpecial={applyPasteSpecialOptions}
      onPreviewPasteSpecial={state.previewPasteSpecial}
      goalSeekModalOpen={ui.goalSeekModalOpen}
      onCloseGoalSeek={() => ui.setGoalSeekModalOpen(false)}
      onApplyGoalSeekSolution={(coord, value) => void handleCommitValue(coord, String(value))}
      scenarioModalOpen={ui.scenarioModalOpen}
      onCloseScenario={() => ui.setScenarioModalOpen(false)}
      onUpdateScenarios={(scenarios) => updateActiveSheet({ scenarios })}
      onApplyScenarioCells={state.handleApplyScenario}
      onAddSummarySheet={(newSheet, newCells) => {
        try {
          const { updatedDocument, newSheetId } = addSheetToDocument(document, workbookSheets, newSheet.name, {
            rows: 30,
            cols: 10,
            cells: newCells,
            ...(newSheet.tabColor ? { tabColor: newSheet.tabColor } : {}),
            ...(newSheet.colWidths ? { colWidths: newSheet.colWidths } : {}),
          });
          onUpdateDocument(updatedDocument);
          setActiveSheetId(newSheetId);
          state.setValidationError(null);
          return true;
        } catch {
          state.setValidationError('Der Bericht wurde nicht hinzugefügt. Prüfe den Arbeitsmappenschutz und versuche es erneut.');
          return false;
        }
      }}
      validationModalOpen={ui.validationModalOpen}
      onCloseValidation={() => ui.setValidationModalOpen(false)}
      onUpdateValidationRules={(rules) => updateActiveSheet({ validations: rules })}
      onToggleCircleInvalid={toggleCircleInvalid}
      isCirclingInvalid={isCirclingInvalid}
    />
  </>;
};
