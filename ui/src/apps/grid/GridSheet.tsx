// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative sheet coordinator

import React, { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import './theme/GridThemeChrome.css';
import {
  WorkspaceDocument,
  ChartObject,
  GridFilterRule,
  NetworkCapability,
} from '../../shared/contracts/workspace';
import { GridProfessionalPanel } from './panels/GridProfessionalPanel';
import { GridFormulaBar } from './toolbar/GridFormulaBar';
import { GridSheetViewport } from './canvas/GridSheetViewport';
import { coordInGridRange } from './compat/gridProfessional';
import type { GridDataModelTableInput } from './pivots/gridDataModel';
import { buildGridRowProjection } from './tables/gridDataOperations';
import { useGridState } from './state/useGridState';
import { resolveValidationListOptions } from './validation/gridValidation';
import { refreshLiveGridChartsInDocument } from './charts/gridChartEngine';
import { refreshGridSparklinesInDocument } from './visualization/gridSparklineEngine';
import { listGridChartPublishTargets } from './integrations/gridChartPublish';
import { listGridWorkspacePublishTargets, refreshGridPublishObjectsInDocument } from './integrations/gridWorkspacePublish';
import { useGridCollaboration } from './collaboration/useGridCollaboration';
import { useGridDocumentHistory } from './history/useGridDocumentHistory';
import { useGridSheetDataActions } from './workbook/actions/useGridSheetDataActions';
import { useGridSheetIntegrationActions } from './integrations/useGridSheetIntegrationActions';
import { useGridSheetUiState } from './state/useGridSheetUiState';
import { GridSheetBottomLayer } from './GridSheetBottomLayer';
import { appendGridHistory, buildGridHistoryEntries } from './collaboration/gridReviewCollaboration';
import { authorizeGridWorkbookFindReplace } from './search/gridWorkbookFindReplaceAccess';
import { resolveGridFillDrop } from './editing/gridFillDrag';
import { planGridFormulaInsertion } from './formulas/gridFormulaAssist';
import { evaluateFormula } from './formulas/formula';
import type { GridToolbarFormatActions } from './formatting/gridToolbarFormatContract';
import { useWorkspaceLocale } from '../../shell/localization/workspaceLocale';
import { GRID_TOOLBAR_COPY } from './locale/gridToolbarLocale';
import { GRID_SELECTION_SUMMARY_COPY } from './locale/gridSelectionSummaryLocale';
import { buildGridSelectionSummary } from './toolbar/gridSelectionSummary';
interface GridSheetProps {
  document: WorkspaceDocument;
  workspaceDocuments?: Record<string, WorkspaceDocument>;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onUpdateWorkspaceDocument?: (doc: WorkspaceDocument) => void;
  onSelectSelectionType: (type: 'text' | 'cell' | 'shape' | 'chart') => void;
  onCreateChart: (chart: ChartObject) => void;
  onFormatCellFromToolbar?: (format: 'currency' | 'percent' | 'number') => void;
  /** Legacy quick-format handle (currency/percent/number); kept for existing shell consumers. */
  gridFormatActionRef?: MutableRefObject<((format: 'currency' | 'percent' | 'number') => void) | null>;
  /**
   * Versioned shell toolbar handle: four quick formats plus the full canonical preset
   * catalogue. Optional, so consumers that only use the legacy ref (e.g. the Present shell
   * envelope test) stay source-compatible.
   */
  gridToolbarFormatActionsRef?: MutableRefObject<GridToolbarFormatActions | null>;
  networkCapability: NetworkCapability;
  keyVaultUnlocked: boolean;
}

export const GridSheet: React.FC<GridSheetProps> = ({
  document,
  workspaceDocuments,
  onUpdateDocument: persistDocument,
  onUpdateWorkspaceDocument,
  onSelectSelectionType,
  onCreateChart,
  gridFormatActionRef,
  gridToolbarFormatActionsRef,
  networkCapability,
  keyVaultUnlocked,
}) => {
  const persistWorkspaceDocument = onUpdateWorkspaceDocument ?? persistDocument;
  const { locale } = useWorkspaceLocale();
  const toolbarCopy = GRID_TOOLBAR_COPY[locale];
  const selectionCopy = GRID_SELECTION_SUMMARY_COPY[locale];
  const ui = useGridSheetUiState();
  const {
    professionalPanelOpen, setProfessionalPanelOpen, setWhatIfModalOpen, setFindReplaceModalOpen,
    setChartModalOpen, setCommentsModalOpen, setSlicerModalOpen, setDataTableModalOpen,
    setAuditModalOpen, setPowerQueryModalOpen, setSolverModalOpen, setMonteCarloModalOpen,
    setRoundtripModalOpen, setPasteSpecialModalOpen, setGoalSeekModalOpen, setValidationModalOpen,
    exportNotice, setExportNotice,
  } = ui;
  const documentRef = useRef(document);
  documentRef.current = document;

  const handleRemoteDocument = useCallback((nextDocument: WorkspaceDocument) => {
    const refreshed = refreshGridPublishObjectsInDocument(refreshLiveGridChartsInDocument(refreshGridSparklinesInDocument(nextDocument)));
    documentRef.current = refreshed;
    persistDocument(refreshed);
  }, [persistDocument]);

  const collaboration = useGridCollaboration(document, handleRemoteDocument);

  const publishLocalDocument = useCallback((nextDocument: WorkspaceDocument) => {
    const refreshed = refreshGridPublishObjectsInDocument(refreshLiveGridChartsInDocument(refreshGridSparklinesInDocument(nextDocument)));
    collaboration.handleLocalDocumentUpdate(refreshed);
    documentRef.current = refreshed;
    persistDocument(refreshed);
  }, [collaboration.handleLocalDocumentUpdate, persistDocument]);

  const documentHistory = useGridDocumentHistory(document, publishLocalDocument);
  const onUpdateDocument = documentHistory.commit;

  const state = useGridState({
    document,
    workspaceDocuments,
    onUpdateDocument,
    onSelectSelectionType,
    reviewUserId: collaboration.actorId,
    reviewRoles: ['editor'],
    reviewAuthor: `Grid ${collaboration.actorId.slice(-6)}`,
    onGlobalUndo: documentHistory.undo,
    onGlobalRedo: documentHistory.redo,
  });

  const {
    workbookSheets,
    activeSheetId,
    setActiveSheetId,
    activeSheetModel,
    primaryTableId,
    tableObj,
    cells,
    rowCount,
    colCount,
    selectedCell,
    setSelectedCell,
    setSelectionAnchor,
    setSelectionFocus,
    selectedRange,
    selectionRanges,
    formulaInput,
    setFormulaInput,
    isEditing,
    setIsEditing,
    inlineInputRef,
    validationError,
    setValidationError,
    draggedCoord,
    setDraggedCoord,
    draggedAsFill,
    setDraggedAsFill,
    dragOverCoord,
    setDragOverCoord,
    updateActiveSheet,
    resizeActiveTable,
    handleCommitValue,
    applyFormatToSelection,
    applyNumberFormatToSelection,
    applyTableStyleToSelection,
    handleCellClick,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleFillSelection,
    copySelection,
    cutSelection,
    pasteSelection,
    clearSelection,
    handleMergeSelection,
    handleUnmergeSelection,
    toggleCircleInvalid,
    isCirclingInvalid,
    invalidCoords,
    handleGoTo,
    handleGoToSpecial,
    handleTransferSelection,
    handleFlashFill,
    handleSetRichTextCell,
    handleStructureEdit,
    handleSetAxisHidden,
    handleGroupAxis,
    handlePatchWorkbook,
    addCurrentSelectionToDisjoint,
    clearDisjointSelections,
    handleKeyDownGrid,
    formatPainterSource,
    handleApplyCellStyle,
    handleToggleFormatPainter,
    handleApplyFormatPainter,
    handleAutoFitSelection,
    prepareFormulaForEvaluation,
    formulaEvaluationContext,
  } = state;

  /**
   * Bounded on-demand output check for the formula assistant: evaluates the pending formula through
   * the *same* engine the commit path uses, then plans the dynamic-array footprint and the formula
   * cycles. Only runs when the user presses the check button, so no keystroke pays for it.
   */
  const handleCheckFormulaOutput = useCallback(async (pendingFormula: string) => {
    const trimmed = pendingFormula.trim();
    if (!trimmed.startsWith('=') || trimmed === '=') return null;
    try {
      const resolved = prepareFormulaForEvaluation(trimmed, selectedCell);
      const result = await evaluateFormula(resolved, cells, formulaEvaluationContext(selectedCell));
      return planGridFormulaInsertion({ coord: selectedCell, formula: trimmed, cells, result });
    } catch {
      // A rejected evaluation is reported as "nothing to check" rather than as a fake success.
      return null;
    }
  }, [prepareFormulaForEvaluation, formulaEvaluationContext, selectedCell, cells]);

  useEffect(() => {
    if (!gridFormatActionRef) return;
    const applyToolbarFormat = (format: 'currency' | 'percent' | 'number') => applyFormatToSelection({ format });
    gridFormatActionRef.current = applyToolbarFormat;
    return () => {
      if (gridFormatActionRef.current === applyToolbarFormat) gridFormatActionRef.current = null;
    };
  }, [applyFormatToSelection, gridFormatActionRef]);

  useEffect(() => {
    if (!gridToolbarFormatActionsRef) return;
    const actions: GridToolbarFormatActions = {
      // All quick presets are complete type+code operations; the shell never assembles a patch.
      applyQuickFormat: (format) => applyNumberFormatToSelection(format),
      applyNumberFormat: (id) => applyNumberFormatToSelection(id),
    };
    gridToolbarFormatActionsRef.current = actions;
    return () => {
      if (gridToolbarFormatActionsRef.current === actions) gridToolbarFormatActionsRef.current = null;
    };
  }, [applyNumberFormatToSelection, gridToolbarFormatActionsRef]);

  useEffect(() => {
    collaboration.updatePresence(activeSheetId, selectedCell);
  }, [activeSheetId, collaboration.updatePresence, selectedCell]);

  const activeNamedView = activeSheetModel?.namedViews?.find((view) => view.id === activeSheetModel.activeNamedViewId);
  /**
   * The rules the projection actually reads. Computed once and shared with the column-header AutoFilter
   * entry (AST-0391) — the checklist must show the state that is really filtering, and two copies of this
   * expression would be able to disagree.
   */
  const activeFilterRules = useMemo<readonly GridFilterRule[]>(
    () => activeNamedView?.filters ?? activeSheetModel?.filters ?? [],
    [activeNamedView, activeSheetModel?.filters],
  );
  const rowProjection = buildGridRowProjection(cells, rowCount, {
    filters: activeFilterRules,
    sortRules: activeNamedView?.sort ?? activeSheetModel?.sort ?? [],
    slicers: activeSheetModel?.slicers ?? [],
    advancedFilter: activeSheetModel?.advancedFilter,
    conditionalFormatting: activeSheetModel?.conditionalFormatting ?? [],
  });
  const visibleRowIndices = rowProjection ?? [0];

  const selectionSummary = useMemo(
    () => buildGridSelectionSummary(selectedRange, cells, cells[selectedCell]),
    [cells, selectedCell, selectedRange],
  );
  const selectionFormatLabel = selectionSummary.formatId === 'number'
    ? toolbarCopy.numberFormat
    : selectionSummary.formatId === 'currency'
      ? toolbarCopy.currencyFormat
      : selectionSummary.formatId === 'percent'
        ? toolbarCopy.percentageFormat
        : selectionSummary.formatId === 'date'
          ? toolbarCopy.dateFormat
          : selectionSummary.formatLabel;
  const formatSummaryNumber = (value: number): string => value.toLocaleString(locale, { maximumFractionDigits: 2 });

  /**
   * Writes the AutoFilter selection back through the sheet's own access-checked patch path
   * (`useGridState.updateActiveSheet`), so a protected or read-only sheet refuses the write exactly as it
   * refuses any other structural change.
   *
   * When a named view is active the projection reads **that view's** rules, so the write has to land there.
   * Writing to `sheet.filters` instead would change stored data that is not currently filtering while the
   * checklist kept showing the view's state — a silent divergence.
   */
  const handleUpdateAutoFilterRules = useCallback((next: readonly GridFilterRule[]) => {
    if (!activeSheetModel) return;
    if (activeNamedView) {
      updateActiveSheet({
        namedViews: (activeSheetModel.namedViews ?? []).map((candidate) =>
          candidate.id === activeNamedView.id ? { ...candidate, filters: [...next] } : candidate),
      });
      return;
    }
    updateActiveSheet({ filters: [...next] });
  }, [activeNamedView, activeSheetModel, updateActiveSheet]);
  const selectedValidationRule = activeSheetModel?.validations?.find((rule) => coordInGridRange(selectedCell, rule.range));
  const selectedValidationOptions = selectedValidationRule?.kind === 'list'
    ? resolveValidationListOptions(selectedValidationRule, cells, {
        namedRanges: document.gridData?.namedRanges ?? [],
        tables: activeSheetModel?.tables ?? [],
        sheetId: activeSheetModel?.id,
      }, selectedCell)
    : [];
  const activeNamedRanges = (document.gridData?.namedRanges ?? []).filter(
    (named) => named.sheetId === activeSheetModel?.id
  );

  const availableCharts = document.root_object_ids
    .map((id) => document.objects[id])
    .filter((object): object is { type:'Chart'; data:ChartObject } => object?.type === 'Chart')
    .map((object) => object.data);
  const chartPublishTargets = listGridChartPublishTargets(workspaceDocuments ?? {}, document.id);
  const workspacePublishTargets = listGridWorkspacePublishTargets(workspaceDocuments ?? {}, document.id);
  const workbookCellsBySheet = useMemo<Record<string, Record<string, import('../../shared/contracts/workspace').GridCell>>>(() => Object.fromEntries(
    workbookSheets.map((sheet) => {
      const object = document.objects[sheet.tableObjectId];
      const sheetCells = object?.type === 'Table' ? ((object.data as { cells?: Record<string, import('../../shared/contracts/workspace').GridCell> }).cells ?? {}) : {};
      return [sheet.id, sheetCells];
    }),
  ), [document.objects, workbookSheets]);

  const applyWorkbookFindReplace = useCallback((proposedCellsBySheet: Record<string, Record<string, import('../../shared/contracts/workspace').GridCell>>, proposedSheets: typeof workbookSheets): boolean => {
    const authorization = authorizeGridWorkbookFindReplace({
      sheets: workbookSheets,
      cellsBySheet: workbookCellsBySheet,
      proposedSheets,
      proposedCellsBySheet,
      userId: collaboration.actorId,
      userRoles: ['editor'],
    });
    if (!authorization.allowed) {
      state.setValidationError('Replacement blocked because one or more target cells are protected or read-only.');
      return false;
    }
    state.setValidationError(null);
    if (authorization.changedCount === 0) return true;

    const nextObjects = { ...document.objects };
    for (const sheet of workbookSheets) {
      const object = nextObjects[sheet.tableObjectId];
      if (object?.type !== 'Table') continue;
      nextObjects[sheet.tableObjectId] = { ...object, data: { ...object.data, cells: authorization.cellsBySheet[sheet.id] ?? {} } };
    }
    const nextSheets = authorization.sheets.map((sheet) => {
      const changedCoordinates = authorization.changedCoordinatesBySheet[sheet.id] ?? [];
      if (changedCoordinates.length === 0) return sheet;
      const oldCells = workbookCellsBySheet[sheet.id] ?? {};
      const updatedCells = authorization.cellsBySheet[sheet.id] ?? {};
      const history = buildGridHistoryEntries(oldCells, updatedCells, changedCoordinates, `Grid ${collaboration.actorId.slice(-6)}`);
      return { ...sheet, history: appendGridHistory(sheet.history ?? [], history) };
    });
    onUpdateDocument({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      objects: nextObjects,
      gridData: { ...(document.gridData ?? { sheets: nextSheets }), sheets: nextSheets },
    });
    return true;
  }, [collaboration.actorId, document, onUpdateDocument, state, workbookCellsBySheet, workbookSheets]);

  const dataModelTables: GridDataModelTableInput[] = workbookSheets.flatMap((sheet) => {
    const object = document.objects[sheet.tableObjectId];
    if (!object || object.type !== 'Table') return [];
    return (sheet.tables ?? []).map((table) => ({ table, cells: object.data.cells }));
  });


  const dataActions = useGridSheetDataActions({
    document, documentRef, onUpdateDocument, workbookSheets, activeSheetId, setActiveSheetId,
    activeSheetModel, primaryTableId, tableObj, cells, persistCellChanges: state.persistCellChanges, selectedCell, selectedRange,
    setSelectedCell, setSelectionAnchor, setSelectionFocus, setValidationError, updateActiveSheet,
    onExportNotice: setExportNotice,
  });
  const integrationActions = useGridSheetIntegrationActions({
    document, workspaceDocuments, onUpdateDocument, persistWorkspaceDocument, activeSheetModel,
    workbookSheets, primaryTableId, tableObj, cells, visibleRowIndices, colCount, rowCount,
    selectedRange, setValidationError, onExportNotice: setExportNotice,
  });
  const {
    handleCreatePivot, handleUpdatePivotDefinition, handleUpdateDataModel, handleCreateNamedRange,
    handleDeleteNamedRange, handleSelectNamedRange, handleTableCreate, handleTableRename,
    handleTablePatch, handleTableToggleTotals, handleTableSetTotalFunction, handleTableSetCalculatedColumn,
    handleTableExport, handleTableImport, handleTablePublishDataset,
  } = dataActions;
  const {
    handleApplySparkline, handlePublishChart, handleCreatePublishObject, handleDeletePublishObject,
    handlePublishObject, handleProtectToVault, handlePrintSheet, handleExportCsv, handleExportPortable, handleExportPdf,
    handleExportWorkbook,
  } = integrationActions;

  const handleDragStartCell = (e: React.DragEvent, coord: string, fill = false) => {
    e.dataTransfer.setData('text/plain', coord);
    e.dataTransfer.effectAllowed = fill ? 'copy' : 'copyMove';
    setDraggedCoord(coord);
    setDraggedAsFill(fill);
  };

  const handleDragOverCell = (e: React.DragEvent, coord: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedAsFill || e.ctrlKey || e.metaKey ? 'copy' : 'move';
    if (draggedCoord && draggedCoord !== coord) setDragOverCoord(coord);
  };

  const handleDropCell = async (e: React.DragEvent, targetCoord: string) => {
    e.preventDefault();
    const resolution = resolveGridFillDrop({
      dragCoord: draggedCoord,
      dragAsFill: draggedAsFill,
      targetCoord,
      sourceRange: selectedRange,
      copyModifier: e.ctrlKey || e.metaKey,
    });
    if (resolution.kind === 'fill') {
      state.handleAutoFillCommit(resolution.targetCoord);
      state.setValidationError(null);
    } else if (resolution.kind === 'transfer') {
      handleTransferSelection(resolution.targetCoord, resolution.mode);
    } else if (draggedCoord) {
      // A drag that cannot be applied must be visible, never a silent no-op.
      state.setValidationError(resolution.reason);
    }
    setDraggedCoord(null);
    setDraggedAsFill(false);
    setDragOverCoord(null);
  };

  const handleCellDoubleClick = (coord: string) => {
    if (coord !== selectedCell) {
      setSelectedCell(coord);
      setSelectionAnchor(coord);
      setSelectionFocus(coord);
    }
    setIsEditing(true);
  };

  return (
    <div
      data-vgt-grid-root="true" aria-label="Astraea Grid workbook" role="group"
      className="flex-1 flex flex-col h-full bg-[#0a0d14] overflow-hidden outline-none select-none"
      tabIndex={0}
      onKeyDown={handleKeyDownGrid}
    >
      {/**
       * GR-044 / A11y (M1) — screen readers get a polite announcement of the selection.
       *
       * The measured ARIA contract (`gridAriaContract`) found no live region at all: moving with
       * the arrow keys changed the active cell silently for assistive technology. The grid keeps
       * its own keyboard focus, so this region is the only channel that can carry the change.
       */}
      {/* Formula Bar */}
      <GridFormulaBar
        selectedRange={selectedRange}
        selectedCell={selectedCell}
        formulaInput={formulaInput}
        namedRanges={activeNamedRanges}
        activeCell={cells[selectedCell]}
        cells={cells}
        timeZone=""
        onReplaceFormula={(next) => setFormulaInput(next)}
        onCancelEdit={() => setIsEditing(false)}
        onCheckFormulaOutput={handleCheckFormulaOutput}
        professionalPanelOpen={professionalPanelOpen}
        onChangeFormula={setFormulaInput}
        onCommitFormula={() => handleCommitValue(selectedCell, formulaInput)}
        onApplyFormat={applyFormatToSelection}
        onApplyNumberFormat={applyNumberFormatToSelection}
        onSelectNamedRange={handleSelectNamedRange}
        onGoToSelection={handleGoTo}
        onOpenChartModal={() => setChartModalOpen(true)}
        onOpenWhatIfModal={() => setWhatIfModalOpen(true)}
        onOpenFindReplaceModal={() => setFindReplaceModalOpen(true)}
        onOpenCommentsModal={() => setCommentsModalOpen(true)}
        onOpenSlicerModal={() => setSlicerModalOpen(true)}
        onOpenAuditModal={() => setAuditModalOpen(true)}
        onOpenDataTableModal={() => setDataTableModalOpen(true)}
        onOpenPowerQuery={() => setPowerQueryModalOpen(true)}
        onOpenSolver={() => setSolverModalOpen(true)}
        onOpenMonteCarlo={() => setMonteCarloModalOpen(true)}
        onOpenRoundtrip={() => setRoundtripModalOpen(true)}
        onToggleProfessionalPanel={() => setProfessionalPanelOpen((p) => !p)}
        onExportCsv={handleExportCsv}
        onExportWorkbook={handleExportWorkbook}
      />

      {/**
       * Beginner-visible selection summary. It is the single live region for selection
       * changes; the same values drive the visible strip and the screen-reader text.
       */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-grid-selection-status="true"
        data-grid-selection-summary="true"
        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(8,12,22,0.82))] px-3 py-1 text-[0.6875rem] text-slate-300 backdrop-blur-md select-none"
      >
        <span className="font-medium text-slate-200">
          {selectionCopy.label} <span className="font-mono text-blue-200">{selectionSummary.range}</span>
        </span>
        <span>{selectionCopy.rows(selectionSummary.rows)}</span>
        <span>{selectionCopy.columns(selectionSummary.columns)}</span>
        {selectionSummary.sum !== null && selectionSummary.average !== null ? (
          <>
            <span data-grid-selection-summary-sum>{selectionCopy.sum(formatSummaryNumber(selectionSummary.sum))}</span>
            <span>{selectionCopy.average(formatSummaryNumber(selectionSummary.average))}</span>
          </>
        ) : (
          <span className="text-slate-500">{selectionCopy.empty}</span>
        )}
        <span
          className="ml-auto rounded-md border border-white/10 bg-white/[0.045] px-1.5 py-0.5 font-mono text-[0.625rem] text-slate-300"
          data-grid-selection-summary-format
          title={selectionCopy.format(selectionFormatLabel)}
        >
          {selectionCopy.format(selectionFormatLabel)}
        </span>
      </div>

      {validationError && (
        <div className="px-3 py-1.5 text-[0.6875rem] bg-rose-500/10 border-b border-rose-500/25 text-rose-200 font-mono" role="alert">
          {validationError}
        </div>
      )}
      {exportNotice && (
        <div
          role="status"
          aria-live="polite"
          data-grid-export-notice="true"
          className="flex items-center gap-3 border-b border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[0.6875rem] text-emerald-100"
        >
          <span className="flex-1 break-words">{exportNotice}</span>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            aria-label="Exportstatus schließen"
            title="Exportstatus schließen"
            className="shrink-0 rounded border border-emerald-400/30 px-1.5 py-0.5 text-[0.625rem] text-emerald-200 hover:bg-emerald-400/10"
          >
            ×
          </button>
        </div>
      )}
      {selectedValidationRule && (selectedValidationRule.inputMessage || selectedValidationOptions.length > 0) && (
        <div className="px-3 py-1.5 text-[0.6875rem] bg-blue-500/10 border-b border-blue-500/20 text-blue-100 flex items-center gap-3" role="status">
          {selectedValidationRule.inputMessage && <span className="flex-1">{selectedValidationRule.inputMessage}</span>}
          {selectedValidationOptions.length > 0 && (
            <select
              value={String(cells[selectedCell]?.value ?? '')}
              onChange={(event) => handleCommitValue(selectedCell, event.target.value)}
              className="bg-slate-950 border border-blue-500/30 rounded px-2 py-1 text-[0.6875rem] text-blue-100 max-w-64"
              aria-label={`Validation options for ${selectedCell}`}
            >
              <option value="">Select…</option>
              {selectedValidationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Main Grid Viewport + Professional Panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {activeSheetModel && <GridSheetViewport
          sheet={activeSheetModel}
          cells={cells}
          colCount={colCount}
          rowCount={rowCount}
          rowProjection={rowProjection}
          visibleRowIndices={visibleRowIndices}
          selectedCell={selectedCell}
          selectedRange={selectedRange}
          selectedRanges={selectionRanges}
          isEditing={isEditing}
          formulaInput={formulaInput}
          dragOverCoord={dragOverCoord}
          inlineInputRef={inlineInputRef}
          invalidCoords={invalidCoords}
          isCirclingInvalid={isCirclingInvalid}
          onChangeFormulaInput={setFormulaInput}
          onCellClick={handleCellClick}
          onCellDoubleClick={handleCellDoubleClick}
          onCellMouseDown={handleCellMouseDown}
          onCellMouseEnter={handleCellMouseEnter}
          onDragStartCell={handleDragStartCell}
          onDragOverCell={handleDragOverCell}
          onDropCell={handleDropCell}
          onSelectColumn={state.handleSelectColumn}
          onSelectRow={state.handleSelectRow}
          onSelectAll={state.handleSelectAll}
          onResizeTable={resizeActiveTable}
          filterRules={activeFilterRules}
          onUpdateFilters={handleUpdateAutoFilterRules}
          onAxisResize={state.handleAxisResize}
          onAxisAutoFit={state.handleAxisAutoFit}
          onCopy={copySelection}
          onCut={cutSelection}
          onPaste={pasteSelection}
          onOpenPasteSpecial={() => setPasteSpecialModalOpen(true)}
          onOpenGoalSeek={() => setGoalSeekModalOpen(true)}
          onMergeCells={handleMergeSelection}
          onUnmergeCells={handleUnmergeSelection}
          onClearContents={() => clearSelection('contents')}
          onCommitValue={handleCommitValue}
          onOpenComments={() => setCommentsModalOpen(true)}
          onOpenFindReplace={() => setFindReplaceModalOpen(true)}
        />}

        {professionalPanelOpen && activeSheetModel && (
          <GridProfessionalPanel
            sheet={activeSheetModel}
            selectedCell={selectedCell}
            selectedRange={selectedRange}
            namedRanges={activeNamedRanges}
            activeCell={cells[selectedCell]}
            onUpdateSheet={updateActiveSheet}
            cells={cells}
            rowCount={rowCount}
            colCount={colCount}
            dataModel={document.gridData?.dataModel}
            dataModelTables={dataModelTables}
            onCreatePivot={handleCreatePivot}
            onUpdatePivot={handleUpdatePivotDefinition}
            onUpdateDataModel={handleUpdateDataModel}
            onCreateNamedRange={handleCreateNamedRange}
            onDeleteNamedRange={handleDeleteNamedRange}
            onSelectNamedRange={handleSelectNamedRange}
            onApplyFormat={state.applyReviewedFormatToSelection}
            onApplyNumberFormat={applyNumberFormatToSelection}
            onApplyTableStyle={applyTableStyleToSelection}
            onFillSelection={() => handleFillSelection('series')}
            formatPainterActive={!!formatPainterSource}
            onApplyCellStyle={handleApplyCellStyle}
            onToggleFormatPainter={handleToggleFormatPainter}
            onApplyFormatPainter={handleApplyFormatPainter}
            onAutoFitSelection={handleAutoFitSelection}
            onTableCreate={handleTableCreate}
            onTableRename={handleTableRename}
            onTablePatch={handleTablePatch}
            onTableToggleTotals={handleTableToggleTotals}
            onTableSetTotalFunction={handleTableSetTotalFunction}
            onTableSetCalculatedColumn={handleTableSetCalculatedColumn}
            onTableExport={handleTableExport}
            onTableImport={handleTableImport}
            onTablePublishDataset={handleTablePublishDataset}
            onOpenValidation={() => setValidationModalOpen(true)}
            onOpenSlicers={() => setSlicerModalOpen(true)}
            onToggleCircleInvalid={toggleCircleInvalid}
            isCirclingInvalid={isCirclingInvalid}
            charts={availableCharts}
            chartPublishTargets={chartPublishTargets}
            onOpenChartStudio={() => setChartModalOpen(true)}
            onApplySparkline={handleApplySparkline}
            onPublishChart={handlePublishChart}
            onPrint={handlePrintSheet}
            onExportPdf={handleExportPdf}
            onExportPortable={handleExportPortable}
            workspaceDocuments={Object.values(workspaceDocuments ?? {})}
            publishObjects={document.gridData?.publishObjects ?? []}
            publishTargets={workspacePublishTargets}
            onCreatePublishObject={handleCreatePublishObject}
            onDeletePublishObject={handleDeletePublishObject}
            onPublishObject={handlePublishObject}
            onProtectToVault={handleProtectToVault}
            selectionRanges={selectionRanges}
            workbookLocale={document.gridData?.locale ?? 'en-US'}
            workbookCalculationMode={document.gridData?.calculationMode ?? 'automatic'}
            onPatchWorkbook={handlePatchWorkbook}
            onStructureEdit={handleStructureEdit}
            onSetAxisHidden={handleSetAxisHidden}
            onGroupAxis={handleGroupAxis}
            onGoTo={handleGoTo}
            onGoToSpecial={handleGoToSpecial}
            onTransferSelection={handleTransferSelection}
            onFlashFill={handleFlashFill}
            onAddDisjoint={addCurrentSelectionToDisjoint}
            onClearDisjoint={clearDisjointSelections}
            onSetRichTextCell={handleSetRichTextCell}
            onClose={() => setProfessionalPanelOpen(false)}
          />
        )}
      </div>

      <GridSheetBottomLayer
        document={document}
        workspaceDocuments={workspaceDocuments}
        onUpdateDocument={onUpdateDocument}
        onCreateChart={onCreateChart}
        networkCapability={networkCapability}
        keyVaultUnlocked={keyVaultUnlocked}
        state={state}
        ui={ui}
        collaboration={collaboration}
        dataActions={dataActions}
        workbookCellsBySheet={workbookCellsBySheet}
        applyWorkbookFindReplace={applyWorkbookFindReplace}
      />
    </div>
  );
};
