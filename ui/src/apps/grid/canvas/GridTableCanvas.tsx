// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative high-performance table canvas.
// Axis sizes, merged spans and frozen panes all come from the shared pure
// geometry modules; this component only wires them into the DOM.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GridCell, GridFilterRule, GridSheetModel } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { formatCellValue } from '../compat/gridUtils';
import { coordInGridRange, conditionalStyleForCell } from '../compat/gridProfessional';
import { gridBorderStyleProperties } from '../formatting/gridFormatValidation';
import {
  applyDropdownKey,
  buildDropdownModel,
  type DropdownKey,
  type DropdownState,
} from '../data/gridInputValidation';
import { structuredTableVisualForCell } from '../formatting/gridFormattingEngine';
import { Plus } from 'lucide-react';
import { GridSparkline } from './GridSparkline';
import { GridAutoFilterDropdown } from '../filters/GridAutoFilterDropdown';
import { isGridAxisIndexVisible } from '../workbook/gridWorkbookViews';
import { GridCellContextMenu } from '../interactions/GridCellContextMenu';
import { buildGridAxisScale, GRID_DEFAULT_COL_WIDTH, GRID_DEFAULT_ROW_HEIGHT, resolveGridAxisResize, type GridAxis } from './gridAxisSizing';
import { computeGridFreezeLayout } from './gridFreezeGeometry';
import { buildGridMergeIndex, resolveGridMergeCell } from './gridMergeLayout';
import { parseGridRange } from '../ranges/gridRange';

interface GridTableCanvasProps {
  sheet: GridSheetModel;
  cells: Record<string, GridCell>;
  colCount: number;
  rowCount: number;
  visibleRowIndices: number[];
  selectedCell: string;
  selectedRange: string;
  selectedRanges?: string[];
  isEditing: boolean;
  formulaInput: string;
  dragOverCoord: string | null;
  inlineInputRef: React.RefObject<HTMLInputElement | null>;
  invalidCoords?: Set<string>;
  isCirclingInvalid?: boolean;
  onChangeFormulaInput: (val: string) => void;
  onCellClick: (coord: string, extend?: boolean, additive?: boolean) => void;
  onCellDoubleClick: (coord: string) => void;
  onCellMouseDown: (e: React.MouseEvent, coord: string) => void;
  onCellMouseEnter: (coord: string) => void;
  onDragStartCell: (e: React.DragEvent, coord: string, fill?: boolean) => void;
  onDragOverCell: (e: React.DragEvent, coord: string) => void;
  onDropCell: (e: React.DragEvent, coord: string) => void;
  onSelectColumn: (cIdx: number, additive?: boolean) => void;
  onSelectRow: (rIdx: number, additive?: boolean) => void;
  onSelectAll: () => void;
  onResizeTable: (rows: number, cols: number) => void;
  /**
   * Active filter rules of the sheet (named view aware) and the writer for them.
   *
   * Both are **required** on purpose (AST-0391): a visible control whose writer is optional would render a
   * button that does nothing as soon as a caller forgets the prop — an attract, not an entry. Requiring them
   * makes that state unrepresentable instead of merely unlikely.
   */
  filterRules: readonly GridFilterRule[];
  onUpdateFilters: (rules: readonly GridFilterRule[]) => void;
  onAxisResize?: (axis: GridAxis, index: number, size: number) => void;
  onAxisAutoFit?: (axis: GridAxis, index: number) => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onOpenPasteSpecial?: () => void;
  onOpenGoalSeek?: () => void;
  onMergeCells?: () => void;
  onUnmergeCells?: () => void;
  onClearContents?: () => void;
  onCommitValue?: (coord: string, val: string) => void;
  onOpenComments?: () => void;
  onOpenFindReplace?: () => void;
}

const HEADER_ROW_PX = 28;
const HEADER_COL_PX = 48;

export const GridTableCanvas: React.FC<GridTableCanvasProps> = ({
  sheet,
  cells,
  colCount,
  rowCount,
  visibleRowIndices,
  selectedCell,
  selectedRange,
  selectedRanges = [selectedRange],
  isEditing,
  formulaInput,
  dragOverCoord,
  inlineInputRef,
  invalidCoords,
  isCirclingInvalid,
  onChangeFormulaInput,
  onCellClick,
  onCellDoubleClick,
  onCellMouseDown,
  onCellMouseEnter,
  onDragStartCell,
  onDragOverCell,
  onDropCell,
  onSelectColumn,
  onSelectRow,
  onSelectAll,
  onResizeTable,
  filterRules,
  onUpdateFilters,
  onAxisResize,
  onAxisAutoFit,
  onCopy,
  onCut,
  onPaste,
  onOpenPasteSpecial,
  onOpenGoalSeek,
  onMergeCells,
  onUnmergeCells,
  onClearContents,
  onCommitValue,
  onOpenComments,
  onOpenFindReplace,
}) => {
  const showGridlines = sheet.showGridlines !== false;
  /** Sheet protection can forbid filtering outright; the entry must then be visibly unavailable, not silent. */
  const filterLocked = sheet.protection?.isProtected === true && sheet.protection?.allowFilter !== true;
  const zoomScale = Math.max(0.25, Math.min(4, (sheet.zoom ?? 100) / 100));
  const visibleRows = visibleRowIndices.filter((rIdx) => isGridAxisIndexVisible(sheet, 'row', rIdx));
  const visibleCols = Array.from({ length: colCount }, (_, index) => index).filter((cIdx) => isGridAxisIndexVisible(sheet, 'col', cIdx));
  /** Excel-like context: header bands highlight every row/column touched by the selection. */
  const selectionBounds = useMemo(
    () => selectedRanges.map((range) => parseGridRange(range)).filter((bounds): bounds is NonNullable<typeof bounds> => bounds !== null),
    [selectedRanges],
  );
  const isColumnSelected = (colIndex: number): boolean =>
    selectionBounds.some((bounds) => colIndex >= bounds.startCol && colIndex <= bounds.endCol);
  const isRowSelected = (rowIndex: number): boolean =>
    selectionBounds.some((bounds) => rowIndex >= bounds.startRow && rowIndex <= bounds.endRow);

  const colScale = useMemo(
    () => buildGridAxisScale('col', colCount, sheet.colWidths, GRID_DEFAULT_COL_WIDTH, zoomScale),
    [colCount, sheet.colWidths, zoomScale],
  );
  const rowScale = useMemo(
    () => buildGridAxisScale('row', rowCount, sheet.rowHeights, GRID_DEFAULT_ROW_HEIGHT, zoomScale),
    [rowCount, sheet.rowHeights, zoomScale],
  );
  const freeze = useMemo(
    () => computeGridFreezeLayout({
      freezeRows: sheet.freezeRows,
      freezeCols: sheet.freezeCols,
      rowCount,
      colCount,
      rowScale,
      colScale,
      headerHeight: HEADER_ROW_PX,
      headerWidth: HEADER_COL_PX,
    }),
    [colCount, colScale, rowCount, rowScale, sheet.freezeCols, sheet.freezeRows],
  );
  const mergeIndex = useMemo(() => buildGridMergeIndex(sheet.mergedCells), [sheet.mergedCells]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; coord: string } | null>(null);
  const [activeValidationDropdown, setActiveValidationDropdown] = useState<string | null>(null);
  /** Reiner Zustand des offenen Dropdowns (Pfeilposition, Suchtext) — vom gemeinsamen Modell geführt. */
  const [validationDropdownState, setValidationDropdownState] = useState<DropdownState>({ open: false, activeIndex: -1, query: '' });
  const [resizing, setResizing] = useState<{ axis: GridAxis; index: number; startPos: number; startSize: number } | null>(null);

  useEffect(() => {
    const handleCloseMenu = () => {
      setContextMenu(null);
      setActiveValidationDropdown(null);
    };
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const beginAxisResize = useCallback((axis: GridAxis, index: number, event: React.MouseEvent) => {
    if (!onAxisResize) return;
    event.preventDefault();
    event.stopPropagation();
    setResizing({
      axis,
      index,
      startPos: axis === 'col' ? event.clientX : event.clientY,
      startSize: axis === 'col' ? colScale.size(index) : rowScale.size(index),
    });
  }, [colScale, onAxisResize, rowScale]);

  useEffect(() => {
    if (!resizing || !onAxisResize) return undefined;
    const handleMove = (event: MouseEvent) => {
      const current = resizing.axis === 'col' ? event.clientX : event.clientY;
      onAxisResize(resizing.axis, resizing.index, resolveGridAxisResize(resizing.axis, resizing.startSize, current - resizing.startPos, zoomScale));
    };
    const handleUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [onAxisResize, resizing, zoomScale]);

  return (
    <div
      data-vgt-grid-canvas="true"
      data-vgt-grid-view-mode={sheet.viewMode}
      data-vgt-grid-freeze-rows={freeze.frozenRows || undefined}
      data-vgt-grid-freeze-cols={freeze.frozenCols || undefined}
      className={`flex-1 overflow-auto select-none ${sheet.viewMode === 'page-layout' ? 'p-5' : ''}`}
    >
      <table
        role="grid"
        aria-label={`Grid ${sheet.name}`}
        aria-rowcount={rowCount}
        aria-colcount={colCount}
        data-vgt-grid-page-plane={sheet.viewMode === 'page-layout' ? 'true' : undefined}
        className={`border-collapse table-fixed text-xs font-mono ${sheet.viewMode === 'page-layout' ? 'shadow-2xl' : ''}`}
        style={{ zoom: zoomScale }}
      >
        <colgroup>
          <col style={{ width: `${HEADER_COL_PX}px` }} />
          {visibleCols.map((cIdx) => <col key={cIdx} style={{ width: `${colScale.size(cIdx)}px` }} />)}
          <col style={{ width: '40px' }} />
        </colgroup>
        <thead>
          <tr className="bg-slate-950 text-slate-400 sticky top-0 z-20">
            {/* Top-left corner: Select All */}
            <th
              onClick={onSelectAll}
              // GAP-0052, Runde 284: die Ecke war nur mit der Maus
              // auswaehlbar. Ein `<th>` hat in einer Tabelle eine implizite
              // Rolle (`columnheader`), aber keine Tab-Position — `tabIndex`
              // und eine Tastenbehandlung muessen ausdruecklich hinzu.
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectAll();
                }
              }}
              className="w-12 h-7 border border-white/[0.08] bg-slate-950 text-[0.625rem] text-slate-500 text-center font-normal cursor-pointer hover:bg-white/10"
              scope="col"
              title="Select all cells (Ctrl+A)"
            >
              #
            </th>

            {/* Column Headers A, B, C... */}
            {visibleCols.map((cIdx) => {
              const colLetter = toA1(cIdx, 0).replace(/\d+$/, '');
              const isFrozenColumn = cIdx < freeze.frozenCols;
              return (
                <th
                  key={cIdx}
                  onClick={(event) => onSelectColumn(cIdx, event.ctrlKey || event.metaKey)}
                  // GAP-0052, Runde 284: der Spaltenkopf war nur mit der Maus
                  // auswaehlbar. `tabIndex` und eine Tastenbehandlung fehlten;
                  // die Rolle ist implizit (`columnheader`), der Zustand steht
                  // in `aria-colindex`.
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectColumn(cIdx, event.ctrlKey || event.metaKey);
                    }
                  }}
                  className={`relative h-7 border border-white/[0.08] bg-slate-950 text-center text-slate-300 text-[0.6875rem] font-semibold tracking-wider cursor-pointer hover:bg-white/10 transition-colors ${isColumnSelected(cIdx) ? 'bg-blue-500/25 text-blue-100 border-blue-400/50' : ''} ${isFrozenColumn ? 'sticky z-30' : ''}`}
                  style={isFrozenColumn ? { left: HEADER_COL_PX + colScale.offset(cIdx) } : undefined}
                  data-vgt-grid-freeze-boundary={flushWithFreeze(freeze.frozenCols - 1, cIdx) ? 'column' : undefined}
                  data-vgt-grid-frozen-column={isFrozenColumn ? 'true' : undefined}
                  data-vgt-grid-selected-header={isColumnSelected(cIdx) ? 'column' : undefined}
                  scope="col"
                  aria-colindex={cIdx + 1}
                  title={`Select column ${colLetter} · ziehen zum Ändern der Breite, Doppelklick für AutoFit`}
                >
                  {colLetter}
                  {/* AST-0391: the visible AutoFilter entry. It lives inside the `<th>` — which is already
                      `position: relative` — so this DOM renderer needs no overlay. */}
                  <GridAutoFilterDropdown
                    column={colLetter}
                    cells={cells}
                    rowCount={rowCount}
                    rules={filterRules}
                    onUpdateRules={onUpdateFilters}
                    disabled={filterLocked}
                  />
                  <span
                    data-vgt-grid-column-resizer={cIdx}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Spaltenbreite ${colLetter}`}
                    onMouseDown={(event) => beginAxisResize('col', cIdx, event)}
                    onDoubleClick={(event) => { event.stopPropagation(); onAxisAutoFit?.('col', cIdx); }}
                    onClick={(event) => event.stopPropagation()}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/60"
                  />
                </th>
              );
            })}

            {/* Add Column Button */}
            <th className="w-10 h-7 border border-white/[0.08] bg-slate-950/60 text-center">
              <button
                type="button"
                onClick={() => onResizeTable(rowCount, Math.min(256, colCount + 1))}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                aria-label="Add Column" title="Add Column"
              >
                <Plus className="w-3 h-3" />
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {visibleRows.map((rIdx, displayIndex) => {
            const rowNum = rIdx + 1;
            const isFrozenRow = displayIndex < freeze.frozenRows;
            const frozenCellStyle: React.CSSProperties | undefined = isFrozenRow
              ? { position: 'sticky', top: HEADER_ROW_PX, zIndex: 12 }
              : undefined;

            return (
              <tr
                key={rIdx}
                className={`hover:bg-white/[0.01]`}
                style={{ height: `${rowScale.size(rIdx)}px` }}
              >
                {/* Row Header Number */}
                <td
                  onClick={(event) => onSelectRow(rIdx, event.ctrlKey || event.metaKey)}
                  // GAP-0052, Runde 284: der Zeilenkopf war nur mit der Maus
                  // auswaehlbar. Dieselbe Luecke wie bei den beiden `<th>`.
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectRow(rIdx, event.ctrlKey || event.metaKey);
                    }
                  }}
                  style={{ ...frozenCellStyle }}
                  className={`w-12 h-7 border border-white/[0.08] bg-slate-950 text-center text-slate-400 text-[0.6875rem] sticky left-0 z-10 cursor-pointer hover:bg-white/10 select-none relative ${isRowSelected(rIdx) ? 'bg-blue-500/25 text-blue-100 border-blue-400/50' : ''} ${isFrozenRow ? 'bg-slate-900' : ''}`}
                  data-vgt-grid-frozen-row={isFrozenRow ? 'true' : undefined}
                  data-vgt-grid-freeze-boundary={flushWithFreeze(freeze.frozenRows - 1, displayIndex) ? 'row' : undefined}
                  data-vgt-grid-selected-header={isRowSelected(rIdx) ? 'row' : undefined}
                  scope="row"
                  aria-rowindex={rIdx + 1}
                  title={`Select row ${rowNum}`}
                >
                  {rowNum}
                  <span
                    data-vgt-grid-row-resizer={rIdx}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label={`Zeilenhöhe ${rowNum}`}
                    onMouseDown={(event) => beginAxisResize('row', rIdx, event)}
                    onDoubleClick={(event) => { event.stopPropagation(); onAxisAutoFit?.('row', rIdx); }}
                    className="absolute inset-x-0 bottom-0 h-1.5 cursor-row-resize hover:bg-blue-500/60"
                  />
                </td>

                {/* Cells */}
                {visibleCols.map((cIdx) => {
                  const coord = toA1(cIdx, rIdx);
                  const merge = resolveGridMergeCell(mergeIndex, coord);
                  // A covered cell is only rendered by its merge origin.
                  if (merge.role === 'covered') return null;
                  const cell = cells[coord];
                  const isSelected = selectedCell === coord;
                  const isInSelection = selectedRanges.some((range) => coordInGridRange(coord, range));
                  const isCellEditing = isSelected && isEditing;
                  const isDragTarget = dragOverCoord === coord;
                  const conditionalStyle = conditionalStyleForCell(
                    coord,
                    cell,
                    sheet.conditionalFormatting ?? [],
                    cells
                  );
                  const tableVisual = structuredTableVisualForCell(coord, sheet.tables ?? []);
                  // The border belongs to the selection as a whole: `outline` draws one frame
                  // around the range instead of a frame around every cell inside it.
                  const borderedRange = selectedRanges.find((range) => coordInGridRange(coord, range));
                  const borderColour = conditionalStyle.textColor ?? cell?.text_color ?? tableVisual.textColor ?? 'var(--vgt-control-text, var(--as-text-primary, #f5f7ff))';
                  const isFrozenCol = cIdx < freeze.frozenCols;
                  const hasComment = (sheet.comments ?? []).some(
                    (c) => c.coord.toUpperCase() === coord && !c.resolved
                  );
                  const matchingValidation = (sheet.validations ?? []).find((v) =>
                    coordInGridRange(coord, v.range)
                  );

                  return (
                    <td
                      key={cIdx}
                      colSpan={merge.span?.colSpan}
                      rowSpan={merge.span?.rowSpan}
                      draggable={isSelected && !isEditing}
                      onDragStart={(e) => onDragStartCell(e, coord)}
                      onDragOver={(e) => onDragOverCell(e, coord)}
                      onDrop={(e) => onDropCell(e, coord)}
                      onMouseDown={(e) => onCellMouseDown(e, coord)}
                      onMouseEnter={() => onCellMouseEnter(coord)}
                      onClick={(e) => onCellClick(coord, e.shiftKey, e.ctrlKey || e.metaKey)}
                      onDoubleClick={() => onCellDoubleClick(coord)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onCellClick(coord);
                        setContextMenu({ x: e.clientX, y: e.clientY, coord });
                      }}
                      aria-selected={isSelected || isInSelection}
                      data-vgt-app-guide-anchor={coord === 'A1' ? 'Grid:first' : coord === 'B2' ? 'Grid:second' : undefined}
                      data-vgt-grid-selection={isSelected ? 'active-cell' : isInSelection ? 'range' : undefined}
                      data-vgt-grid-merged-origin={merge.role === 'origin' ? coord : undefined}
                      data-vgt-grid-frozen-column={isFrozenCol ? 'true' : undefined}
                      data-vgt-grid-frozen-row={isFrozenRow ? 'true' : undefined}
                      className={`h-7 px-1.5 py-0 relative truncate cursor-cell transition-colors ${
                        showGridlines ? 'border border-white/[0.08]' : 'border-0'
                      } ${isFrozenCol ? 'sticky z-10' : ''} ${
                        isSelected
                          ? 'z-20 bg-blue-500/15 font-medium outline outline-2 -outline-offset-1 outline-blue-400'
                          : isInSelection
                          ? 'bg-blue-500/[0.07] outline outline-1 -outline-offset-1 outline-blue-400/45'
                          : isDragTarget
                          ? 'bg-amber-500/20 ring-2 ring-amber-400 ring-dashed z-10'
                          : 'hover:bg-white/[0.03]'
                      } ${cell?.bold || tableVisual.bold || conditionalStyle.bold ? 'font-bold' : ''}`}
                      style={{
                        ...frozenCellStyle,
                        ...gridBorderStyleProperties(cell?.border, coord, borderedRange, borderColour),
                        left: isFrozenCol ? HEADER_COL_PX + colScale.offset(cIdx) : undefined,
                        textAlign: cell?.alignment ?? (typeof cell?.value === 'number' ? 'right' : 'left'),
                        verticalAlign: cell?.verticalAlignment ?? 'middle',
                        whiteSpace: cell?.wrap ? 'normal' : 'nowrap',
                        overflowWrap: cell?.wrap ? 'anywhere' : undefined,
                        fontStyle: cell?.italic ? 'italic' : undefined,
                        textDecoration: [
                          cell?.underline ? 'underline' : '',
                          cell?.strikethrough ? 'line-through' : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined,
                        backgroundColor: conditionalStyle.background ?? cell?.background ?? tableVisual.background,
                        color: borderColour,
                        fontSize: cell?.fontSize ? `${cell.fontSize}px` : undefined,
                        fontFamily: cell?.fontFamily ?? undefined,
                        ...gridBorderStyleProperties(cell?.border, coord, borderedRange, borderColour),
                      }}
                    >
                      {/* Invalid Data Circle */}
                      {isCirclingInvalid && invalidCoords?.has(coord) && (
                        <svg
                          className="absolute inset-0 w-full h-full pointer-events-none z-20"
                          viewBox="0 0 100 30"
                          preserveAspectRatio="none"
                        >
                          <ellipse
                            cx="50"
                            cy="15"
                            rx="46"
                            ry="12"
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="2.5"
                            strokeDasharray="4 2"
                          />
                        </svg>
                      )}

                      {isCellEditing ? (
                        <input
                          ref={inlineInputRef}
                          type="text"
                          value={formulaInput}
                          onChange={(e) => onChangeFormulaInput(e.target.value)}
                          className="w-full h-full bg-slate-900 text-slate-100 font-mono text-xs px-1 outline-none border border-blue-400 rounded select-text"
                        />
                      ) : (
                        <div className="flex items-center justify-between w-full h-full">
                          <div className="relative min-w-0 flex-1 h-full flex items-center">
                            {conditionalStyle.dataBarPercent !== undefined && (
                              <span
                                className="absolute left-0 top-[20%] bottom-[20%] opacity-30 rounded-sm pointer-events-none"
                                style={{ width: `${conditionalStyle.dataBarPercent}%`, backgroundColor: conditionalStyle.dataBarColor }}
                              />
                            )}
                            <span className="relative z-10 truncate">{conditionalStyle.icon ? `${conditionalStyle.icon} ` : ''}{formatCellValue(cell)}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Validation dropdown arrow */}
                            {isSelected && matchingValidation?.kind === 'list' && matchingValidation.options && (
                              <div className="relative inline-block z-30">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const offen = activeValidationDropdown === coord;
                                    setActiveValidationDropdown(offen ? null : coord);
                                    setValidationDropdownState(offen
                                      ? { open: false, activeIndex: -1, query: '' }
                                      : { open: true, activeIndex: 0, query: '' });
                                  }}
                                  className="px-1 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[0.5rem] font-bold shadow transition-colors"
                                  title="Gültige Option wählen"
                                >
                                  ▼
                                </button>
                                {activeValidationDropdown === coord && (() => {
                                  // **Eine** Quelle für Liste, Markierung und Tastatur (W-313): das Modell begrenzt
                                  // die Zeilen auf 40, kürzt Labels und führt die Pfeilposition.
                                  const options = matchingValidation.options ?? [];
                                  const model = buildDropdownModel(options, validationDropdownState, String(cell?.value ?? ''));
                                  const keyOf = (event: React.KeyboardEvent): DropdownKey | null => {
                                    if (event.altKey && event.key === 'ArrowDown') return 'Alt+ArrowDown';
                                    switch (event.key) {
                                      case 'ArrowDown': case 'ArrowUp': case 'Home': case 'End':
                                      case 'Enter': case 'Escape': case 'Tab': return event.key;
                                      default: return null;
                                    }
                                  };
                                  return (
                                  <div
                                    role="listbox"
                                    aria-label="Gültige Option wählen"
                                    onKeyDown={(event) => {
                                      const key = keyOf(event);
                                      if (!key) return;
                                      const result = applyDropdownKey(options, validationDropdownState, key, String(cell?.value ?? ''));
                                      if (result.handled) event.preventDefault();
                                      setValidationDropdownState(result.state);
                                      if (result.commit !== undefined) {
                                        onCommitValue?.(coord, result.commit);
                                        setActiveValidationDropdown(null);
                                        setValidationDropdownState({ open: false, activeIndex: -1, query: '' });
                                      }
                                    }}
                                    className="absolute right-0 top-full mt-1 w-36 bg-slate-900 border border-white/20 rounded shadow-2xl z-50 py-1 max-h-48 overflow-y-auto"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {model.rows.map((row) => (
                                      <button
                                        key={row.value}
                                        type="button"
                                        role="option"
                                        aria-selected={row.selected}
                                        onMouseEnter={() => setValidationDropdownState((state) => ({ ...state, activeIndex: row.index }))}
                                        onClick={() => {
                                          onCommitValue?.(coord, row.value);
                                          setActiveValidationDropdown(null);
                                          setValidationDropdownState({ open: false, activeIndex: -1, query: '' });
                                        }}
                                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${row.index === model.activeVisibleIndex ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-blue-600 hover:text-white'}`}
                                      >
                                        {row.label}
                                      </button>
                                    ))}
                                  </div>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Sparkline mini-graph */}
                            {cell?.sparkline && cell.sparkline.length > 1 && (
                              <span className="ml-1 shrink-0 leading-none">
                                <GridSparkline data={cell.sparkline} type={cell.sparklineType ?? 'line'} width={48} height={14} lineColor={cell.sparklineColor ?? '#10b981'} highlightMin={false} highlightMax={false} />
                              </span>
                            )}

                            {/* Comment Marker */}
                            {hasComment && (
                              <div
                                className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-l-[6px] border-t-purple-400 border-l-transparent pointer-events-none"
                                title="Zelle hat aktiven Kommentar"
                              />
                            )}

                            {/* Fill Handle */}
                            {isSelected && !isEditing && (
                              <div
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  onDragStartCell(e, coord, true);
                                }}
                                data-vgt-grid-selection-handle="true"
                                aria-hidden="true"
                                className="w-2 h-2 absolute right-0 bottom-0 cursor-crosshair z-20 bg-blue-500 border border-white shadow-sm"
                                title="AutoFill: Ziehen zum Ausfüllen von Serien oder Kopieren"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}

                <td className="w-10 h-7 border border-white/[0.04]" />
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Add Row Button */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => onResizeTable(rowCount + 5, colCount)}
          className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded hover:bg-white/5 border border-white/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add 5 Rows</span>
        </button>
      </div>

      {contextMenu && <GridCellContextMenu x={contextMenu.x} y={contextMenu.y} onClose={()=>setContextMenu(null)} onCut={onCut} onCopy={onCopy} onPaste={onPaste} onOpenPasteSpecial={onOpenPasteSpecial} onMergeCells={onMergeCells} onUnmergeCells={onUnmergeCells} onOpenGoalSeek={onOpenGoalSeek} onClearContents={onClearContents} onOpenComments={onOpenComments} onOpenFindReplace={onOpenFindReplace}/>}
    </div>
  );
};

/** True when `index` is the last index of the frozen band, i.e. the visual boundary. */
function flushWithFreeze(frozenLastIndex: number, index: number): boolean {
  return frozenLastIndex >= 0 && index === frozenLastIndex;
}
