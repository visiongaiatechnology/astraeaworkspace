import { useCallback, type Dispatch, type MouseEvent, type SetStateAction } from 'react';
import { toA1 } from '../../formulas/formula';
import { parseCoord } from '../../compat/gridUtils';
import { addDisjointGridRange } from '../gridAdvancedEditing';

interface SelectionControllerArgs {
  selectedCell: string;
  setSelectedCell: Dispatch<SetStateAction<string>>;
  selectionAnchor: string;
  setSelectionAnchor: Dispatch<SetStateAction<string>>;
  selectionFocus: string;
  setSelectionFocus: Dispatch<SetStateAction<string>>;
  setDisjointRanges: Dispatch<SetStateAction<string[]>>;
  selectedRange: string;
  isEditing: boolean;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  formulaInput: string;
  handleCommitValue: (coord: string, rawInput: string) => Promise<void>;
  isRangeSelecting: boolean;
  setIsRangeSelecting: Dispatch<SetStateAction<boolean>>;
  colCount: number;
  rowCount: number;
  onSelectSelectionType: (type: 'text' | 'cell' | 'shape' | 'chart') => void;
}

export function useGridSelectionController(args: SelectionControllerArgs) {
  const moveActiveCell = useCallback((dCol: number, dRow: number) => {
    const { colIdx, rowIdx } = parseCoord(args.selectedCell);
    const nextCoord = toA1(
      Math.max(0, Math.min(args.colCount - 1, colIdx + dCol)),
      Math.max(0, Math.min(args.rowCount - 1, rowIdx + dRow)),
    );
    args.setSelectedCell(nextCoord);
    args.setSelectionAnchor(nextCoord);
    args.setSelectionFocus(nextCoord);
  }, [args.selectedCell, args.colCount, args.rowCount, args.setSelectedCell, args.setSelectionAnchor, args.setSelectionFocus]);

  const handleCellClick = useCallback((coord: string, extendSelection = false, additiveSelection = false) => {
    if (args.isEditing && args.selectedCell !== coord) {
      void args.handleCommitValue(args.selectedCell, args.formulaInput);
      args.setIsEditing(false);
    }
    if (additiveSelection) {
      args.setDisjointRanges((prev) => addDisjointGridRange(prev, args.selectedRange));
      args.setSelectionAnchor(coord);
      args.setSelectionFocus(coord);
    } else if (extendSelection) args.setSelectionFocus(coord);
    else {
      args.setDisjointRanges([]);
      args.setSelectionAnchor(coord);
      args.setSelectionFocus(coord);
    }
    args.setSelectedCell(coord);
    args.onSelectSelectionType('cell');
  }, [args]);

  const handleCellMouseDown = useCallback((event: MouseEvent, coord: string) => {
    if (event.button !== 0 || args.isEditing) return;
    if (event.ctrlKey || event.metaKey) {
      args.setDisjointRanges((prev) => addDisjointGridRange(prev, args.selectedRange));
      args.setSelectionAnchor(coord);
      args.setSelectionFocus(coord);
    } else if (event.shiftKey) args.setSelectionFocus(coord);
    else {
      args.setDisjointRanges([]);
      args.setSelectionAnchor(coord);
      args.setSelectionFocus(coord);
    }
    args.setSelectedCell(coord);
    args.setIsRangeSelecting(true);
    args.onSelectSelectionType('cell');
  }, [args]);

  const handleCellMouseEnter = useCallback((coord: string) => {
    if (!args.isRangeSelecting || args.isEditing) return;
    args.setSelectionFocus(coord);
    args.setSelectedCell(coord);
  }, [args]);

  const selectAxis = useCallback((axis: 'row' | 'col', index: number, additive = false) => {
    if (!additive) args.setDisjointRanges([]);
    const start = axis === 'col' ? toA1(index, 0) : toA1(0, index);
    const end = axis === 'col' ? toA1(index, args.rowCount - 1) : toA1(args.colCount - 1, index);
    if (additive) args.setDisjointRanges((prev) => addDisjointGridRange(prev, `${start}:${end}`));
    args.setSelectionAnchor(start);
    args.setSelectionFocus(end);
    args.setSelectedCell(start);
    args.onSelectSelectionType('cell');
  }, [args]);

  const handleSelectColumn = useCallback((index: number, additive = false) => selectAxis('col', index, additive), [selectAxis]);
  const handleSelectRow = useCallback((index: number, additive = false) => selectAxis('row', index, additive), [selectAxis]);
  const handleSelectAll = useCallback(() => {
    args.setDisjointRanges([]);
    const start = 'A1';
    const end = toA1(args.colCount - 1, args.rowCount - 1);
    args.setSelectionAnchor(start);
    args.setSelectionFocus(end);
    args.setSelectedCell(start);
    args.onSelectSelectionType('cell');
  }, [args]);

  return { moveActiveCell, handleCellClick, handleCellMouseDown, handleCellMouseEnter, handleSelectColumn, handleSelectRow, handleSelectAll };
}
