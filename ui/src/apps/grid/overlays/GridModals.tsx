// STATUS: DIAMANT VGT SUPREME — Astraea Grid Modals Orchestrator
import React from 'react';
import type { GridSheetModel, GridCell, GridCellComment, GridSlicerDefinition, ChartObject, GridChartTemplate, GridQueryDefinition, NetworkCapability, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { GridWhatIfModal } from '../what-if/GridWhatIfModal';
import { GridFindReplaceModal } from '../search/GridFindReplaceModal';
import { GridChartModal } from '../charts/GridChartModal';
import { GridCellCommentsModal } from '../collaboration/GridCellCommentsModal';
import { GridSlicerModal } from '../filters/GridSlicerModal';
import { GridDataTableModal } from '../what-if/GridDataTableModal';
import { GridAuditFormulaModal } from '../audit/GridAuditFormulaModal';
import { GridPowerQueryModal } from '../queries/GridPowerQueryModal';
import { GridSolverModal } from '../analysis/GridSolverModal';
import { commitGridSolverSolution } from '../analysis/gridSolverCommit';
import { GridMonteCarloModal } from '../analysis/GridMonteCarloModal';
import { GridRoundtripModal } from '../interchange/GridRoundtripModal';
import { GridPasteSpecialModal } from '../clipboard/GridPasteSpecialModal';
import { GridGoalSeekModal } from '../what-if/GridGoalSeekModal';
import { GridScenarioManagerModal } from '../what-if/GridScenarioManagerModal';
import { GridDataValidationModal } from '../validation/GridDataValidationModal';
import type {
  GridPasteSpecialOptions,
  GridScenario,
  GridDataValidationRule,
  GridAnalysisAuditKind,
} from '../../../shared/contracts/grid/workspaceGrid';
import type { GridPasteSpecialPreview } from '../editing/gridPasteSpecialPlan';

export interface GridModalsProps {
  cells: Record<string, GridCell>;
  selectedCell: string;
  selectedRange: string;
  colCount: number;
  rowCount: number;
  activeSheetModel: GridSheetModel | null;
  activeSheetId: string;
  workbookSheets: GridSheetModel[];
  workbookCellsBySheet: Record<string, Record<string, GridCell>>;

  whatIfModalOpen: boolean;
  onCloseWhatIf: () => void;
  onCommitValue: (coord: string, val: string) => void;
  onCommitCellBatch: (cells: Record<string, string>) => boolean | Promise<boolean>;

  findReplaceModalOpen: boolean;
  onCloseFindReplace: () => void;
  onSelectCell: (sheetId: string, coord: string) => void;
  onApplyWorkbookFindReplace: (cellsBySheet: Record<string, Record<string, GridCell>>, sheets: GridSheetModel[]) => boolean | void;

  chartModalOpen: boolean;
  onCloseChart: () => void;
  chartDocumentId: string;
  chartTableObjectId: string;
  chartTemplates: GridChartTemplate[];
  onUpdateChartTemplates: (templates: GridChartTemplate[]) => void;
  onCreateChart: (chart: ChartObject) => void;

  commentsModalOpen: boolean;
  onCloseComments: () => void;
  onAddComment: (comment: GridCellComment) => void;
  onToggleResolveComment: (id: string) => void;
  onDeleteComment: (id: string) => void;

  slicerModalOpen: boolean;
  onCloseSlicer: () => void;
  onUpdateSlicers: (slicers: GridSlicerDefinition[]) => void;

  dataTableModalOpen: boolean;
  onCloseDataTable: () => void;

  auditModalOpen: boolean;
  onCloseAudit: () => void;

  powerQueryModalOpen: boolean;
  onClosePowerQuery: () => void;
  powerQueryWorkspaceDocuments: Record<string, WorkspaceDocument>;
  powerQueryDefinitions: GridQueryDefinition[];
  powerQueryNetworkCapability: NetworkCapability;
  powerQueryKeyVaultUnlocked: boolean;
  onLoadPowerQuery: (result: { cells: Record<string, string>; query: GridQueryDefinition }) => boolean | Promise<boolean>;

  solverModalOpen: boolean;
  onCloseSolver: () => void;
  onApplySolverSolution: (cells: Record<string, string>) => boolean | Promise<boolean>;
  onAnalysisAudit: (kind: GridAnalysisAuditKind, input: unknown, result: unknown, summary: string) => void;

  monteCarloModalOpen: boolean;
  onCloseMonteCarlo: () => void;

  roundtripModalOpen: boolean;
  onCloseRoundtrip: () => void;
  onImportSpreadsheetCells: (cells: Record<string, string>, rowCount: number, colCount: number) => boolean | Promise<boolean>;

  pasteSpecialModalOpen?: boolean;
  onClosePasteSpecial?: () => void;
  onApplyPasteSpecial?: (options: GridPasteSpecialOptions) => void;
  onPreviewPasteSpecial?: (options: GridPasteSpecialOptions) => GridPasteSpecialPreview;

  goalSeekModalOpen?: boolean;
  onCloseGoalSeek?: () => void;
  onApplyGoalSeekSolution?: (coord: string, val: number) => void;

  scenarioModalOpen?: boolean;
  onCloseScenario?: () => void;
  onUpdateScenarios?: (scenarios: GridScenario[]) => void;
  onApplyScenarioCells?: (scenario: GridScenario) => boolean | void;
  onAddSummarySheet?: (newSheet: GridSheetModel, newCells: Record<string, GridCell>) => boolean | void;

  validationModalOpen?: boolean;
  onCloseValidation?: () => void;
  onUpdateValidationRules?: (rules: GridDataValidationRule[]) => void;
  onToggleCircleInvalid?: () => void;
  isCirclingInvalid?: boolean;
}

export const GridModals: React.FC<GridModalsProps> = ({
  cells,
  selectedCell,
  selectedRange,
  colCount,
  rowCount,
  activeSheetModel,
  activeSheetId,
  workbookSheets,
  workbookCellsBySheet,
  whatIfModalOpen,
  onCloseWhatIf,
  onCommitValue,
  onCommitCellBatch,
  findReplaceModalOpen,
  onCloseFindReplace,
  onSelectCell,
  onApplyWorkbookFindReplace,
  chartModalOpen,
  onCloseChart,
  chartDocumentId,
  chartTableObjectId,
  chartTemplates,
  onUpdateChartTemplates,
  onCreateChart,
  commentsModalOpen,
  onCloseComments,
  onAddComment,
  onToggleResolveComment,
  onDeleteComment,
  slicerModalOpen,
  onCloseSlicer,
  onUpdateSlicers,
  dataTableModalOpen,
  onCloseDataTable,
  auditModalOpen,
  onCloseAudit,
  powerQueryModalOpen,
  onClosePowerQuery,
  powerQueryWorkspaceDocuments,
  powerQueryDefinitions,
  powerQueryNetworkCapability,
  powerQueryKeyVaultUnlocked,
  onLoadPowerQuery,
  solverModalOpen,
  onCloseSolver,
  onApplySolverSolution,
  onAnalysisAudit,
  monteCarloModalOpen,
  onCloseMonteCarlo,
  roundtripModalOpen,
  onCloseRoundtrip,
  onImportSpreadsheetCells,
  pasteSpecialModalOpen = false,
  onClosePasteSpecial = () => {},
  onApplyPasteSpecial = () => {},
  onPreviewPasteSpecial,
  goalSeekModalOpen = false,
  onCloseGoalSeek = () => {},
  onApplyGoalSeekSolution = () => {},
  scenarioModalOpen = false,
  onCloseScenario = () => {},
  onUpdateScenarios = () => {},
  onApplyScenarioCells = () => {},
  onAddSummarySheet = () => {},
  validationModalOpen = false,
  onCloseValidation = () => {},
  onUpdateValidationRules = () => {},
  onToggleCircleInvalid = () => {},
  isCirclingInvalid = false,
}) => {
  return (
    <>
      <GridWhatIfModal
        isOpen={whatIfModalOpen}
        cells={cells}
        selectedCell={selectedCell}
        onClose={onCloseWhatIf}
        onApplyGoalSeekSolution={(changingCoord, val) => onCommitValue(changingCoord, String(val))}
        onApplyScenario={(values) => onCommitCellBatch(
          Object.fromEntries(Object.entries(values).map(([coord, value]) => [coord, String(value)])),
        )}
      />

      {activeSheetModel && (
        <GridFindReplaceModal
          isOpen={findReplaceModalOpen}
          activeSheetId={activeSheetId}
          sheets={workbookSheets}
          cellsBySheet={workbookCellsBySheet}
          selectedCell={selectedCell}
          onClose={onCloseFindReplace}
          onSelectCell={onSelectCell}
          onApplyWorkbookUpdate={onApplyWorkbookFindReplace}
        />
      )}

      {activeSheetModel && (
        <GridChartModal
          isOpen={chartModalOpen}
          selectedRange={selectedRange}
          cells={cells}
          documentId={chartDocumentId}
          tableObjectId={chartTableObjectId}
          sheet={activeSheetModel}
          templates={chartTemplates}
          onUpdateTemplates={onUpdateChartTemplates}
          onClose={onCloseChart}
          onCreateChart={onCreateChart}
        />
      )}

      <GridCellCommentsModal
        isOpen={commentsModalOpen}
        selectedCell={selectedCell}
        comments={activeSheetModel?.comments ?? []}
        onClose={onCloseComments}
        onAddComment={onAddComment}
        onToggleResolve={onToggleResolveComment}
        onDeleteComment={onDeleteComment}
      />

      <GridSlicerModal
        isOpen={slicerModalOpen}
        cells={cells}
        colCount={colCount}
        rowCount={rowCount}
        slicers={activeSheetModel?.slicers ?? []}
        onClose={onCloseSlicer}
        onUpdateSlicers={onUpdateSlicers}
      />

      <GridDataTableModal
        isOpen={dataTableModalOpen}
        cells={cells}
        selectedCell={selectedCell}
        onClose={onCloseDataTable}
        onApplyTableOutput={async ({ request, result }) => {
          const cells = Object.fromEntries(Object.entries(result.outputCells).map(([coord, value]) => [coord, String(value)]));
          const committed = await onCommitCellBatch(cells);
          if (!committed) return false;
          onAnalysisAudit('data-table', request, { headers: result.headers, rows: result.rows, evaluations: result.evaluations, outputCells: result.outputCells }, `What-if data table -> ${request.outputAnchor} (${result.evaluations} evaluations)`);
          return true;
        }}
      />

      <GridAuditFormulaModal
        isOpen={auditModalOpen}
        cells={cells}
        selectedCell={selectedCell}
        onClose={onCloseAudit}
        onSelectCell={(coord) => onSelectCell(activeSheetId, coord)}
      />

      <GridPowerQueryModal
        isOpen={powerQueryModalOpen}
        onClose={onClosePowerQuery}
        workspaceDocuments={powerQueryWorkspaceDocuments}
        savedQueries={powerQueryDefinitions}
        networkCapability={powerQueryNetworkCapability}
        keyVaultUnlocked={powerQueryKeyVaultUnlocked}
        onLoadIntoGrid={onLoadPowerQuery}
      />

      <GridSolverModal
        isOpen={solverModalOpen}
        onClose={onCloseSolver}
        cells={cells}
        selectedCell={selectedCell}
        onApplySolution={({ solution, auditInput, result }) => commitGridSolverSolution(
          solution,
          onApplySolverSolution,
          () => onAnalysisAudit('solver', auditInput, result, `Solver ${result.status}: objective=${result.objectiveValue}`),
        )}
      />

      <GridMonteCarloModal
        isOpen={monteCarloModalOpen}
        onClose={onCloseMonteCarlo}
        selectedCell={selectedCell}
        onResult={({ expression, variables, iterations, seed, result }) => onAnalysisAudit(
          'monte-carlo',
          { expression, variables, iterations, seed },
          { iterations: result.iterations, seed: result.seed, mean: result.mean, median: result.median, stdDev: result.stdDev, min: result.min, max: result.max, var95: result.var95, var99: result.var99, percentiles: result.percentiles },
          `Monte Carlo seed=${seed}, n=${result.iterations}, mean=${result.mean}`,
        )}
      />

      <GridRoundtripModal
        isOpen={roundtripModalOpen}
        onClose={onCloseRoundtrip}
        onImportCells={onImportSpreadsheetCells}
      />

      <GridPasteSpecialModal
        isOpen={pasteSpecialModalOpen}
        onClose={onClosePasteSpecial}
        onApply={onApplyPasteSpecial}
        onPreview={onPreviewPasteSpecial}
      />

      <GridGoalSeekModal
        isOpen={goalSeekModalOpen}
        onClose={onCloseGoalSeek}
        cells={cells}
        initialSetCell={selectedCell || 'C1'}
        onApplyResult={(coord, val) => { onApplyGoalSeekSolution(coord, val); onAnalysisAudit('goal-seek', { selectedCell, changingCell: coord }, { value: val }, `Goal Seek ${coord}=${val}`); }}
      />

      <GridScenarioManagerModal
        isOpen={scenarioModalOpen}
        onClose={onCloseScenario}
        scenarios={activeSheetModel?.scenarios ?? []}
        cells={cells}
        sheetId={activeSheetModel?.id ?? ''}
        onUpdateScenarios={onUpdateScenarios}
        onApplyScenario={(scenario) => {
          const committed = onApplyScenarioCells(scenario);
          if (committed === false) return false;
          const changedCells = Object.keys(scenario.values).sort();
          onAnalysisAudit('scenario', { sheetId: scenario.sheetId ?? activeSheetModel?.id ?? '', changedCells }, { values: scenario.values }, `Scenario applied (${changedCells.length} cells)`);
          return true;
        }}
        onAddSummarySheet={onAddSummarySheet}
      />

      <GridDataValidationModal
        isOpen={validationModalOpen}
        onClose={onCloseValidation}
        selectedRange={selectedRange}
        rules={activeSheetModel?.validations ?? []}
        onUpdateRules={onUpdateValidationRules}
        onToggleCircleInvalid={onToggleCircleInvalid}
        isCirclingInvalid={isCirclingInvalid}
      />
    </>
  );
};
