import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { GridCell, GridPasteSpecialOptions, GridSheetModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { evaluateFormula, type FormulaEvaluationContext } from '../../formulas/formula';
import { parseCoord } from '../../compat/gridUtils';
import {
  clearGridRangeValues,
  fillSeriesFromSource,
  gridRangeCoordinates,
} from '../gridSelection';
import { applyGridClipboardPaste, captureGridClipboard, type GridClipboardMode, type GridClipboardPayload } from '../gridClipboard';
import { buildGridPasteSpecialPreview, planGridPasteSpecial, type GridPasteSpecialPreview } from '../gridPasteSpecialPlan';
import { executeAutoFill } from '../gridAutoFill';
import { findInvalidCellCoordinates } from '../../validation/gridValidation';
import { applyFormatPainter, applyGridCellStyle, calculateGridAutoFit, patchSheetAutoFit } from '../../formatting/gridFormattingEngine';
import { collectDirtyFormulaCells, recalculateGridDeterministically } from '../../formulas/gridFormulaRecalc';
import { createGridRichTextCell, type GridRichTextRun } from '../gridCellTypes';
import { addDisjointGridRange, uniqueGridRangeCoordinates } from '../gridAdvancedEditing';
import { planGridMerge, planGridUnmerge } from '../../canvas/gridMergeLayout';
import type { GridAxis } from '../../canvas/gridAxisSizing';

interface RangeEditingArgs {
  document: WorkspaceDocument;
  activeSheetModel?: GridSheetModel;
  hasActiveTable: boolean;
  cells: Record<string, GridCell>;
  selectedCell: string;
  selectedRange: string;
  selectionRanges: readonly string[];
  setSelectedCell: Dispatch<SetStateAction<string>>;
  setDisjointRanges: Dispatch<SetStateAction<string[]>>;
  setValidationError: Dispatch<SetStateAction<string | null>>;
  canEditCoordinates: (coords: readonly string[]) => boolean;
  persistCellChanges: (cells: Record<string, GridCell>, coords: readonly string[], patch?: Partial<GridSheetModel>) => boolean;
  prepareFormulaForEvaluation: (formula: string, coord: string) => string;
  formulaEvaluationContext: (coord: string) => FormulaEvaluationContext;
  shouldRecalculateDependent: (coord: string) => boolean;
  updateActiveSheet: (patch: Partial<GridSheetModel>) => void;
}

export function useGridRangeEditingController(args: RangeEditingArgs) {
  const [clipboard, setClipboard] = useState<GridClipboardPayload | null>(null);
  const [undoStack, setUndoStack] = useState<Record<string, GridCell>[]>([]);
  const [redoStack, setRedoStack] = useState<Record<string, GridCell>[]>([]);
  const [isCirclingInvalid, setIsCirclingInvalid] = useState(false);
  const [formatPainterSource, setFormatPainterSource] = useState<GridCell | null>(null);

  const pushUndo = useCallback((currentCells: Record<string, GridCell>) => {
    setUndoStack((prev) => [...prev.slice(-30), { ...currentCells }]);
    setRedoStack([]);
  }, []);

  const copySelection = useCallback(() => {
    setClipboard(captureGridClipboard(args.cells, args.selectedRange, false, args.activeSheetModel?.colWidths));
  }, [args.activeSheetModel?.colWidths, args.cells, args.selectedRange]);

  const cutSelection = useCallback(() => {
    setClipboard(captureGridClipboard(args.cells, args.selectedRange, true, args.activeSheetModel?.colWidths));
  }, [args.activeSheetModel?.colWidths, args.cells, args.selectedRange]);

  const pasteSelection = useCallback(async (mode: GridClipboardMode = 'all'): Promise<boolean> => {
    if (!args.hasActiveTable) return false;
    if (!clipboard || Object.keys(clipboard.cells).length === 0) {
      args.setValidationError('Die Zwischenablage ist leer – zuerst Zellen kopieren oder ausschneiden.');
      return false;
    }
    const outcome = applyGridClipboardPaste({ cells: args.cells, payload: clipboard, targetAnchor: args.selectedCell, mode });
    if (outcome.changedCoords.length === 0) {
      args.setValidationError(null);
      if (clipboard.isCut) setClipboard(null);
      return true;
    }
    const committed = args.persistCellChanges(outcome.cells, outcome.changedCoords);
    if (!committed) return false;
    setClipboard(outcome.clipboardAfter);
    args.setValidationError(null);
    return true;
  }, [args, clipboard]);

  const clearSelection = useCallback((mode: 'all' | 'contents' | 'formats' = 'contents') => {
    if (!args.hasActiveTable) return;
    let updatedCells = { ...args.cells };
    const editCoords = uniqueGridRangeCoordinates(args.selectionRanges);
    if (mode === 'contents' || mode === 'all') for (const range of args.selectionRanges) updatedCells = clearGridRangeValues(updatedCells, range);
    if (mode === 'formats' || mode === 'all') {
      for (const coord of editCoords) if (updatedCells[coord]) updatedCells[coord] = {
        value: mode === 'all' ? '' : updatedCells[coord].value,
        format: undefined, bold: false, italic: false, underline: false, strikethrough: false,
        alignment: undefined, wrap: false, background: undefined, text_color: undefined, border: undefined,
      };
    }
    args.persistCellChanges(updatedCells, editCoords);
  }, [args]);

  const handleSetRichTextCell = useCallback((coord: string, runs: readonly GridRichTextRun[]) => {
    if (!args.hasActiveTable || !args.canEditCoordinates([coord])) return;
    args.persistCellChanges({ ...args.cells, [coord]: { ...(args.cells[coord] ?? { value: '' }), ...createGridRichTextCell(runs), formula: undefined } }, [coord]);
  }, [args]);

  const addCurrentSelectionToDisjoint = useCallback(() => args.setDisjointRanges((prev) => addDisjointGridRange(prev, args.selectedRange)), [args]);
  const clearDisjointSelections = useCallback(() => args.setDisjointRanges([]), [args]);

  const handleFillSelection = useCallback(async (mode: 'copy' | 'series' = 'series') => {
    if (!args.hasActiveTable) return;
    let updatedCells = fillSeriesFromSource(args.cells, args.selectedCell, args.selectedRange, mode);
    const changedCoords = gridRangeCoordinates(args.selectedRange);
    const dirty = collectDirtyFormulaCells(changedCoords, updatedCells);
    if ((args.document.gridData?.calculationMode ?? 'automatic') !== 'manual' && dirty.size > 0) {
      const recalculated = await recalculateGridDeterministically(
        updatedCells,
        async (coord, formula, snapshot) => evaluateFormula(args.prepareFormulaForEvaluation(formula, coord), snapshot, args.formulaEvaluationContext(coord)),
        (coord) => dirty.has(coord) && args.shouldRecalculateDependent(coord),
      );
      updatedCells = recalculated.cells;
      if (recalculated.cyclic.length > 0 && !args.document.gridData?.iterativeCalculation?.enabled) {
        for (const coord of recalculated.cyclic) updatedCells[coord] = { ...updatedCells[coord], value: '#CIRCULAR!' };
      }
    }
    args.persistCellChanges(updatedCells, changedCoords);
  }, [args]);

  const handleUndo = useCallback(() => {
    if (!undoStack.length || !args.hasActiveTable) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, { ...args.cells }]);
    const changed = [...new Set([...Object.keys(args.cells), ...Object.keys(previous)])].filter((coord) => args.cells[coord]?.value !== previous[coord]?.value || args.cells[coord]?.formula !== previous[coord]?.formula);
    args.persistCellChanges(previous, changed);
  }, [args, undoStack]);

  const handleRedo = useCallback(() => {
    if (!redoStack.length || !args.hasActiveTable) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, { ...args.cells }]);
    const changed = [...new Set([...Object.keys(args.cells), ...Object.keys(next)])].filter((coord) => args.cells[coord]?.value !== next[coord]?.value || args.cells[coord]?.formula !== next[coord]?.formula);
    args.persistCellChanges(next, changed);
  }, [args, redoStack]);

  const applyPasteSpecialOptions = useCallback((options: GridPasteSpecialOptions) => {
    if (!args.hasActiveTable) return;
    const plan = planGridPasteSpecial({ cells: args.cells, clipboard, targetAnchor: args.selectedCell, options });
    if (plan.kind === 'rejected') {
      args.setValidationError(plan.reason);
      return;
    }
    pushUndo(args.cells);
    if (Object.keys(plan.columnWidths).length > 0) {
      args.updateActiveSheet(patchSheetAutoFit(args.activeSheetModel?.rowHeights, args.activeSheetModel?.colWidths, { rowHeights: {}, colWidths: plan.columnWidths }));
    }
    args.setValidationError(null);
    if (plan.changedCoords.length === 0) return;
    args.persistCellChanges(plan.updatedCells, plan.changedCoords);
  }, [args, clipboard, pushUndo]);

  /** Preview is produced by the same planner that applies the paste. */
  const previewPasteSpecial = useCallback((options: GridPasteSpecialOptions): GridPasteSpecialPreview => buildGridPasteSpecialPreview({
    cells: args.cells,
    clipboard,
    targetAnchor: args.selectedCell,
    options,
  }), [args.cells, args.selectedCell, clipboard]);

  const handleAutoFillCommit = useCallback((targetCoord: string) => {
    if (!args.hasActiveTable) return;
    pushUndo(args.cells);
    const result = executeAutoFill(gridRangeCoordinates(args.selectedRange), targetCoord, args.cells, 'auto');
    const changed = [...new Set([...Object.keys(args.cells), ...Object.keys(result.updatedCells)])].filter((coord) => args.cells[coord]?.value !== result.updatedCells[coord]?.value || args.cells[coord]?.formula !== result.updatedCells[coord]?.formula);
    args.persistCellChanges(result.updatedCells, changed);
  }, [args, pushUndo]);

  const handleMergeSelection = useCallback(() => {
    if (!args.hasActiveTable) return;
    const plan = planGridMerge(args.cells, args.activeSheetModel?.mergedCells, args.selectedRange);
    if (plan.kind === 'rejected') {
      args.setValidationError(plan.reason);
      return;
    }
    pushUndo(args.cells);
    const committed = args.persistCellChanges(plan.updatedCells, gridRangeCoordinates(plan.range), { mergedCells: plan.mergedCells });
    if (!committed) return;
    args.setSelectedCell(plan.primaryCoord);
    // Overwriting the covered cells is announced instead of silently discarding data.
    args.setValidationError(plan.dataLossCoords.length > 0
      ? `Verbunden: ${plan.dataLossCoords.length} belegte Zelle(n) (${plan.dataLossCoords.slice(0, 5).join(', ')}${plan.dataLossCoords.length > 5 ? ' …' : ''}) wurden auf ${plan.primaryCoord} reduziert – Rückgängig stellt sie wieder her.`
      : null);
  }, [args, pushUndo]);

  const handleUnmergeSelection = useCallback(() => {
    if (!args.hasActiveTable) return;
    const plan = planGridUnmerge(args.cells, args.activeSheetModel?.mergedCells, args.selectedRange);
    if (plan.kind === 'rejected') {
      args.setValidationError(plan.reason);
      return;
    }
    pushUndo(args.cells);
    if (!args.persistCellChanges(plan.updatedCells, gridRangeCoordinates(args.selectedRange), { mergedCells: plan.mergedCells })) return;
    args.setValidationError(null);
  }, [args, pushUndo]);

  /** Interactive column/row resizing. Sizes are clamped by the axis bounds, not by the caller. */
  const handleAxisResize = useCallback((axis: GridAxis, index: number, size: number) => {
    if (!args.hasActiveTable || !Number.isInteger(index) || index < 0 || !Number.isFinite(size)) return;
    const fit = axis === 'col'
      ? { rowHeights: {}, colWidths: { [index]: size } }
      : { rowHeights: { [index]: size }, colWidths: {} };
    args.updateActiveSheet(patchSheetAutoFit(args.activeSheetModel?.rowHeights, args.activeSheetModel?.colWidths, fit));
  }, [args]);

  /** Double click on a header separator: AutoFit exactly one row or column. */
  const handleAxisAutoFit = useCallback((axis: GridAxis, index: number) => {
    if (!args.hasActiveTable || !Number.isInteger(index) || index < 0) return;
    const touched = Object.keys(args.cells)
      .map((coord) => parseCoord(coord))
      .filter((position) => (axis === 'row' ? position.rowIdx === index : position.colIdx === index));
    try {
      const fit = calculateGridAutoFit(
        args.cells,
        axis === 'row' ? [index] : [...new Set(touched.map((position) => position.rowIdx))].slice(0, 4096),
        axis === 'col' ? [index] : [...new Set(touched.map((position) => position.colIdx))].slice(0, 4096),
      );
      args.updateActiveSheet(patchSheetAutoFit(args.activeSheetModel?.rowHeights, args.activeSheetModel?.colWidths, fit));
      args.setValidationError(null);
    } catch {
      args.setValidationError('AutoFit für diese Zeile/Spalte überschreitet das zulässige Scan-Limit.');
    }
  }, [args]);

  const toggleCircleInvalid = useCallback(() => setIsCirclingInvalid((prev) => !prev), []);
  const invalidCoords = useMemo(() => isCirclingInvalid ? findInvalidCellCoordinates(args.cells, args.activeSheetModel?.validations ?? [], {
    namedRanges: args.document.gridData?.namedRanges ?? [], tables: args.activeSheetModel?.tables ?? [], sheetId: args.activeSheetModel?.id,
  }) : new Set<string>(), [args.activeSheetModel, args.cells, args.document.gridData?.namedRanges, isCirclingInvalid]);

  const handleApplyCellStyle = useCallback((styleName: string) => {
    if (!args.hasActiveTable) return;
    pushUndo(args.cells);
    const updatedCells = { ...args.cells };
    for (const coord of gridRangeCoordinates(args.selectedRange)) updatedCells[coord] = applyGridCellStyle(updatedCells[coord], styleName);
    args.persistCellChanges(updatedCells, gridRangeCoordinates(args.selectedRange));
  }, [args, pushUndo]);

  const handleToggleFormatPainter = useCallback(() => setFormatPainterSource((current) => current ? null : ({ ...(args.cells[args.selectedCell] ?? { value: '' }) })), [args.cells, args.selectedCell]);
  const handleApplyFormatPainter = useCallback(() => {
    if (!formatPainterSource || !args.hasActiveTable) return;
    pushUndo(args.cells);
    const updatedCells = { ...args.cells };
    for (const coord of gridRangeCoordinates(args.selectedRange)) updatedCells[coord] = applyFormatPainter(formatPainterSource, updatedCells[coord]);
    args.persistCellChanges(updatedCells, gridRangeCoordinates(args.selectedRange));
  }, [args, formatPainterSource, pushUndo]);

  const handleAutoFitSelection = useCallback(() => {
    const coords = gridRangeCoordinates(args.selectedRange);
    const fit = calculateGridAutoFit(args.cells, [...new Set(coords.map((coord) => parseCoord(coord).rowIdx))], [...new Set(coords.map((coord) => parseCoord(coord).colIdx))]);
    args.updateActiveSheet(patchSheetAutoFit(args.activeSheetModel?.rowHeights, args.activeSheetModel?.colWidths, fit));
  }, [args]);

  return {
    clipboard, pushUndo, copySelection, cutSelection, pasteSelection, clearSelection, handleSetRichTextCell,
    addCurrentSelectionToDisjoint, clearDisjointSelections, handleFillSelection, handleUndo, handleRedo,
    applyPasteSpecialOptions, handleAutoFillCommit, handleMergeSelection, handleUnmergeSelection,
    toggleCircleInvalid, isCirclingInvalid, invalidCoords, formatPainterSource,
    handleApplyCellStyle, handleToggleFormatPainter, handleApplyFormatPainter, handleAutoFitSelection,
    handleAxisResize, handleAxisAutoFit, previewPasteSpecial,
  };
}
