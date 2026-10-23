import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { GridCell, GridSheetModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseCoord } from '../compat/gridUtils';
import { gridRangeCoordinates } from '../editing/gridSelection';
import { parseGridRange } from '../compat/gridProfessional';
import {
  applyFlashFill,
  goToSpecialCoordinates,
  transferGridRange,
  uniqueGridRangeCoordinates,
  type FlashFillTransform,
  type GridGoToSpecialKind,
  type GridTransferMode,
} from '../editing/gridAdvancedEditing';
import { resolveGridNameBoxInput } from '../editing/gridNameBox';
import { applyGridStructureEdit, describeGridStructureEditRisk, type GridStructureEdit } from '../workbook/gridWorkbookStructure';
import { groupGridAxis, patchGridWorkbook, setGridAxisHidden } from '../workbook/gridWorkbookViews';

function sameGridStructureEdit(a: GridStructureEdit, b: GridStructureEdit): boolean {
  if (a.kind !== b.kind) return false;
  const indexA = 'index' in a ? a.index : undefined;
  const indexB = 'index' in b ? b.index : undefined;
  const fromA = 'from' in a ? a.from : undefined;
  const fromB = 'from' in b ? b.from : undefined;
  const toA = 'to' in a ? a.to : undefined;
  const toB = 'to' in b ? b.to : undefined;
  return indexA === indexB && fromA === fromB && toA === toB && (a.count ?? 1) === (b.count ?? 1);
}

interface AdvancedControllerArgs {
  document: WorkspaceDocument;
  activeSheetModel?: GridSheetModel;
  cells: Record<string, GridCell>;
  rowCount: number;
  colCount: number;
  selectionRanges: readonly string[];
  selectedRange: string;
  hasActiveTable: boolean;
  setSelectedCell: Dispatch<SetStateAction<string>>;
  setSelectionAnchor: Dispatch<SetStateAction<string>>;
  setSelectionFocus: Dispatch<SetStateAction<string>>;
  setDisjointRanges: Dispatch<SetStateAction<string[]>>;
  setValidationError: Dispatch<SetStateAction<string | null>>;
  onSelectSelectionType: (type: 'text' | 'cell' | 'shape' | 'chart') => void;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  updateActiveSheet: (patch: Partial<GridSheetModel>) => void;
  canEditCoordinates: (coords: readonly string[]) => boolean;
  pushUndo: (cells: Record<string, GridCell>) => void;
  persistCellChanges: (cells: Record<string, GridCell>, coords: readonly string[], patch?: Partial<GridSheetModel>) => boolean;
  resizeActiveTable: (rows: number, cols: number) => void;
}

export function useGridAdvancedController(args: AdvancedControllerArgs) {
  const selectGridRanges = useCallback((ranges: readonly string[]) => {
    const normalized = ranges.map((range) => range.toUpperCase()).filter((range) => !!parseGridRange(range)).slice(0, 256);
    if (!normalized.length) return;
    const primary = normalized[normalized.length - 1];
    const [start, end = start] = primary.split(':');
    args.setDisjointRanges(normalized.slice(0, -1));
    args.setSelectionAnchor(start);
    args.setSelectionFocus(end);
    args.setSelectedCell(start);
    args.onSelectSelectionType('cell');
  }, [args]);

  const handleGoTo = useCallback((target: string): boolean => {
    if (!args.activeSheetModel) return false;
    const resolution = resolveGridNameBoxInput(target, {
      namedRanges: args.document.gridData?.namedRanges ?? [],
      sheetId: args.activeSheetModel.id,
      rowCount: args.rowCount,
      colCount: args.colCount,
    });
    if (resolution.kind === 'invalid') { args.setValidationError(resolution.message); return false; }
    // A name box target outside the current table grows the sheet so the jump is real.
    if (resolution.requiredRows > args.rowCount || resolution.requiredCols > args.colCount) {
      args.resizeActiveTable(resolution.requiredRows, resolution.requiredCols);
    }
    selectGridRanges([resolution.range]);
    args.setValidationError(null);
    return true;
  }, [args, selectGridRanges]);

  const handleGoToSpecial = useCallback((kind: GridGoToSpecialKind): number => {
    if (!args.activeSheetModel) return 0;
    const coords = goToSpecialCoordinates(kind, args.cells, args.activeSheetModel, args.rowCount, args.colCount);
    if (!coords.length) { args.setValidationError(`Go To Special found no ${kind}.`); return 0; }
    selectGridRanges(coords);
    args.setValidationError(null);
    return coords.length;
  }, [args, selectGridRanges]);

  const handleTransferSelection = useCallback((targetAnchor: string, mode: GridTransferMode): boolean => {
    if (!args.hasActiveTable) return false;
    const editCoords = uniqueGridRangeCoordinates(args.selectionRanges);
    if (!args.canEditCoordinates(editCoords)) return false;
    const updatedCells = transferGridRange(args.cells, args.selectedRange, targetAnchor.toUpperCase(), mode);
    const changed = [...new Set([...Object.keys(args.cells), ...Object.keys(updatedCells)])].filter((coord) => JSON.stringify(args.cells[coord]) !== JSON.stringify(updatedCells[coord]));
    args.pushUndo(args.cells);
    const ok = args.persistCellChanges(updatedCells, changed);
    if (ok) { selectGridRanges([targetAnchor.toUpperCase()]); args.setValidationError(null); }
    return ok;
  }, [args, selectGridRanges]);

  const handleFlashFill = useCallback((targetAnchor: string, transform: FlashFillTransform): number => {
    if (!args.hasActiveTable) return 0;
    const sourceCoords = gridRangeCoordinates(args.selectedRange);
    if (!sourceCoords.length) return 0;
    const output = applyFlashFill(sourceCoords.map((coord) => String(args.cells[coord]?.value ?? '')), transform);
    const target = parseCoord(targetAnchor.toUpperCase());
    const vertical = new Set(sourceCoords.map((coord) => parseCoord(coord).colIdx)).size === 1;
    const updatedCells = { ...args.cells };
    const changed: string[] = [];
    output.forEach((value, index) => {
      const coord = vertical ? toA1(target.colIdx, target.rowIdx + index) : toA1(target.colIdx + index, target.rowIdx);
      updatedCells[coord] = { ...(updatedCells[coord] ?? { value: '' }), value, formula: undefined, dataType: 'text' };
      changed.push(coord);
    });
    if (!args.canEditCoordinates(changed)) return 0;
    args.pushUndo(args.cells);
    args.persistCellChanges(updatedCells, changed);
    if (changed.length) selectGridRanges([`${changed[0]}:${changed[changed.length - 1]}`]);
    args.setValidationError(null);
    return output.length;
  }, [args, selectGridRanges]);

  const pendingStructureEdit = useRef<GridStructureEdit | null>(null);

  const handleStructureEdit = useCallback((edit: GridStructureEdit) => {
    if (!args.activeSheetModel) return;
    const risk = describeGridStructureEditRisk(args.document, args.activeSheetModel.id, edit);
    const confirmed = pendingStructureEdit.current !== null && sameGridStructureEdit(pendingStructureEdit.current, edit);
    if (risk.dangerous && !confirmed) {
      // Fail closed: the destroying edit is announced first and only executed when repeated.
      pendingStructureEdit.current = edit;
      args.setValidationError(risk.message);
      return;
    }
    pendingStructureEdit.current = null;
    try { args.onUpdateDocument(applyGridStructureEdit(args.document, args.activeSheetModel.id, edit)); args.setValidationError(null); }
    catch (error) {
      const protectedStructure = error instanceof Error && error.message === 'grid_workbook_structure_protected';
      args.setValidationError(protectedStructure ? 'Workbook structure is protected. Rows and columns cannot be changed.' : error instanceof Error ? error.message : 'Structure edit failed.');
    }
  }, [args]);

  const handleSetAxisHidden = useCallback((axis: 'row'|'col', hidden: boolean) => {
    if (!args.activeSheetModel) return;
    const bounds = parseGridRange(args.selectedRange); if (!bounds) return;
    const indices: number[] = [];
    const start = axis === 'row' ? bounds.startRow : bounds.startCol;
    const end = axis === 'row' ? bounds.endRow : bounds.endCol;
    for (let index = start; index <= end && indices.length < 10_000; index += 1) indices.push(index);
    args.updateActiveSheet(setGridAxisHidden(args.activeSheetModel, axis, indices, hidden));
  }, [args]);

  const handleGroupAxis = useCallback((axis: 'row'|'col', collapsed = false) => {
    if (!args.activeSheetModel) return;
    const bounds = parseGridRange(args.selectedRange); if (!bounds) return;
    args.updateActiveSheet(groupGridAxis(args.activeSheetModel, axis, axis === 'row' ? bounds.startRow : bounds.startCol, axis === 'row' ? bounds.endRow : bounds.endCol, collapsed));
  }, [args]);

  const handlePatchWorkbook = useCallback((patch: Parameters<typeof patchGridWorkbook>[1]) => args.onUpdateDocument(patchGridWorkbook(args.document, patch)), [args]);
  const setViewMode = useCallback((viewMode: NonNullable<GridSheetModel['viewMode']>) => args.updateActiveSheet({ viewMode }), [args]);
  const setZoom = useCallback((zoom: number) => args.updateActiveSheet({ zoom: Math.max(25, Math.min(400, Math.round(zoom))) }), [args]);

  return { selectGridRanges, handleGoTo, handleGoToSpecial, handleTransferSelection, handleFlashFill, handleStructureEdit, handleSetAxisHidden, handleGroupAxis, handlePatchWorkbook, setViewMode, setZoom };
}
