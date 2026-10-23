// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative high-performance Canvas Virtualization Engine.
// Rendering up to 1,048,576 rows and 16,384 columns in O(1) memory.
// Axis sizes, merged spans, freeze panes and pointer mapping come from the shared
// pure geometry modules so DOM and canvas renderer cannot diverge.

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { GridCell, GridFilterRule, GridSheetModel } from '../../../shared/contracts/workspace';
import { formatCellValue } from '../compat/gridUtils';
import { buildGridAccessibilityTree, resolveFont, selectDenseSurfaceBackend } from '../../../platform/rendering/index';
import { toA1, parseA1 } from '../formulas/formula';
import { GridAutoFilterDropdown } from '../filters/GridAutoFilterDropdown';
import {
  buildGridAxisScale,
  GRID_DEFAULT_COL_WIDTH,
  GRID_DEFAULT_ROW_HEIGHT,
  resolveGridVisibleAxisRange,
} from './gridAxisSizing';
import { computeGridFreezeLayout, resolveGridPointerTarget } from './gridFreezeGeometry';
import { buildGridMergeIndex } from './gridMergeLayout';
import { drawGridVirtualCanvas, HEADER_COL_WIDTH, HEADER_ROW_HEIGHT } from './gridVirtualCanvasRenderer';

export interface GridVirtualCanvasProps {
  sheet: GridSheetModel;
  cells: Record<string, GridCell>;
  colCount: number;
  rowCount: number;
  rowProjection?: number[] | null;
  selectedCell: string;
  selectedRange: string;
  selectedRanges?: string[];
  isEditing: boolean;
  formulaInput: string;
  dragOverCoord: string | null;
  invalidCoords?: Set<string>;
  isCirclingInvalid?: boolean;
  onChangeFormulaInput: (val: string) => void;
  onCellClick: (coord: string, extend?: boolean, additive?: boolean) => void;
  onCellDoubleClick: (coord: string) => void;
  onSelectColumn?: (cIdx: number, additive?: boolean) => void;
  onSelectRow?: (rIdx: number, additive?: boolean) => void;
  onSelectAll?: () => void;
  /**
   * AST-0391: this renderer draws its column headers onto a real `<canvas>`, so a DOM entry cannot live *in*
   * them — it is overlaid. Required for the same reason as in `GridTableCanvas`: an entry whose writer can be
   * omitted is an attract, not an entry.
   */
  filterRules: readonly GridFilterRule[];
  onUpdateFilters: (rules: readonly GridFilterRule[]) => void;
  onContextMenu?: (e: React.MouseEvent, coord: string) => void;
}

const OVERSCAN_ROWS = 5;
const OVERSCAN_COLS = 3;

export const GridVirtualCanvas: React.FC<GridVirtualCanvasProps> = ({
  sheet,
  cells,
  colCount,
  rowCount,
  rowProjection,
  selectedCell,
  selectedRange,
  selectedRanges = [selectedRange],
  isEditing,
  formulaInput,
  invalidCoords,
  isCirclingInvalid,
  onChangeFormulaInput,
  onCellClick,
  onCellDoubleClick,
  onSelectColumn,
  onSelectRow,
  onSelectAll,
  filterRules,
  onUpdateFilters,
  onContextMenu,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  const [scrollState, setScrollState] = useState({ scrollLeft: 0, scrollTop: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [themeRevision, setThemeRevision] = useState(0);

  const zoomScale = Math.max(0.25, Math.min(4, (sheet.zoom ?? 100) / 100));
  const effectiveRowCount = rowProjection ? rowProjection.length : rowCount;

  const colScale = useMemo(
    () => buildGridAxisScale('col', colCount, sheet.colWidths, GRID_DEFAULT_COL_WIDTH, zoomScale),
    [colCount, sheet.colWidths, zoomScale],
  );
  const rowScale = useMemo(
    () => buildGridAxisScale('row', effectiveRowCount, sheet.rowHeights, GRID_DEFAULT_ROW_HEIGHT, zoomScale),
    [effectiveRowCount, sheet.rowHeights, zoomScale],
  );
  const freeze = useMemo(
    () => computeGridFreezeLayout({
      freezeRows: sheet.freezeRows,
      freezeCols: sheet.freezeCols,
      rowCount: effectiveRowCount,
      colCount,
      rowScale,
      colScale,
      headerHeight: HEADER_ROW_HEIGHT,
      headerWidth: HEADER_COL_WIDTH,
    }),
    [colCount, colScale, effectiveRowCount, rowScale, sheet.freezeCols, sheet.freezeRows],
  );
  const mergeIndex = useMemo(() => buildGridMergeIndex(sheet.mergedCells), [sheet.mergedCells]);
  /** Sheet protection can forbid filtering outright; the overlaid entry must then be visibly off, not silent. */
  const filterLocked = sheet.protection?.isProtected === true && sheet.protection?.allowFilter !== true;

  const totalWidth = colScale.total;
  const totalHeight = rowScale.total;

  // Track viewport resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setViewportSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setThemeRevision((revision) => revision + 1));
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-astraea-scheme', 'data-astraea-theme', 'data-vgt-accent', 'data-vgt-surface-intensity'],
    });
    return () => observer.disconnect();
  }, []);

  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollState({
      scrollLeft: target.scrollLeft,
      scrollTop: target.scrollTop,
    });
  }, []);

  // Focus inline input on edit
  useEffect(() => {
    if (isEditing && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [isEditing]);

  // Scale-aware virtual window: uniform sizing is the empty-override special case.
  const visibleRange = useMemo(() => {
    const columns = resolveGridVisibleAxisRange(colScale, scrollState.scrollLeft, viewportSize.width, OVERSCAN_COLS);
    const rows = resolveGridVisibleAxisRange(rowScale, scrollState.scrollTop, viewportSize.height, OVERSCAN_ROWS);
    return { startCol: columns.start, endCol: columns.end, startRow: rows.start, endRow: rows.end };
  }, [colScale, rowScale, scrollState, viewportSize]);

  const renderBackend = useMemo(() => selectDenseSurfaceBackend(), []);
  const gridFont = useMemo(() => resolveFont({ family: 'Cascadia Mono', generic: 'monospace' }), []);
  const accessibilityTree = useMemo(() => {
    const projected = [];
    const maxSemanticCells = 100;
    let selectedProjection: { id: string; rowIndex: number; columnIndex: number; text: string; selected: boolean } | null = null;
    for (let displayRow = visibleRange.startRow; displayRow <= visibleRange.endRow; displayRow += 1) {
      const row = rowProjection?.[displayRow] ?? displayRow;
      for (let col = visibleRange.startCol; col <= visibleRange.endCol; col += 1) {
        const coord = toA1(col, row);
        const entry = { id: `grid-cell-${coord}`, rowIndex: row, columnIndex: col, text: formatCellValue(cells[coord]), selected: selectedCell === coord };
        if (entry.selected) selectedProjection = entry;
        if (projected.length < maxSemanticCells) projected.push(entry);
      }
    }
    if (selectedProjection && !projected.some((entry) => entry.id === selectedProjection?.id)) projected[maxSemanticCells - 1] = selectedProjection;
    return buildGridAccessibilityTree(`grid-${sheet.id}`, sheet.name, rowCount, colCount, projected);
  }, [cells, colCount, rowCount, rowProjection, selectedCell, sheet.id, sheet.name, visibleRange]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    drawGridVirtualCanvas({
      canvas,
      context,
      viewportSize,
      scrollState,
      visibleRange,
      rowProjection,
      colScale,
      rowScale,
      freeze,
      mergeIndex,
      cells,
      selectedCell,
      selectedRanges,
      sheet,
      invalidCoords,
      isCirclingInvalid,
      fontFamily: gridFont.cssFamily,
    });
  }, [
    viewportSize,
    scrollState,
    visibleRange,
    colScale,
    rowScale,
    freeze,
    mergeIndex,
    cells,
    selectedCell,
    selectedRange,
    selectedRanges,
    sheet,
    invalidCoords,
    isCirclingInvalid,
    gridFont.cssFamily,
    themeRevision,
    rowProjection,
  ]);

  /** Pointer mapping is freeze aware: a click in a frozen band never uses that axis' scroll. */
  const resolveTarget = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return resolveGridPointerTarget({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      scrollLeft: scrollState.scrollLeft,
      scrollTop: scrollState.scrollTop,
      headerWidth: HEADER_COL_WIDTH,
      headerHeight: HEADER_ROW_HEIGHT,
      rowCount: effectiveRowCount,
      colCount,
      rowScale,
      colScale,
      layout: freeze,
      rowProjection,
    });
  }, [colCount, colScale, effectiveRowCount, freeze, rowProjection, rowScale, scrollState]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsMouseDown(true);
    const target = resolveTarget(e);
    if (target.type === 'cell') {
      onCellClick(target.coord, e.shiftKey, e.ctrlKey || e.metaKey);
    } else if (target.type === 'column' && onSelectColumn) {
      onSelectColumn(target.index, e.ctrlKey || e.metaKey);
    } else if (target.type === 'row' && onSelectRow) {
      onSelectRow(target.index, e.ctrlKey || e.metaKey);
    } else if (target.type === 'all' && onSelectAll) {
      onSelectAll();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDown || isEditing) return;
    const target = resolveTarget(e);
    if (target.type === 'cell') onCellClick(target.coord, true);
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = resolveTarget(e);
    if (target.type === 'cell') onCellDoubleClick(target.coord);
  };

  // Inline editing coordinates (freeze aware)
  const activeEditPos = useMemo(() => {
    if (!isEditing) return null;
    const parsed = colScale.count > 0 ? parseA1(selectedCell) : null;
    if (!parsed) return null;
    const displayRow = rowProjection ? rowProjection.indexOf(parsed.row) : parsed.row;
    if (displayRow < 0) return null;
    const x = HEADER_COL_WIDTH + colScale.offset(parsed.col) - (parsed.col < freeze.frozenCols ? 0 : scrollState.scrollLeft);
    const y = HEADER_ROW_HEIGHT + rowScale.offset(displayRow) - (displayRow < freeze.frozenRows ? 0 : scrollState.scrollTop);
    return { x, y, width: colScale.size(parsed.col), height: rowScale.size(displayRow) };
  }, [isEditing, selectedCell, colScale, rowScale, scrollState, rowProjection, freeze]);

  /**
   * AST-0391 — the overlaid AutoFilter entry.
   *
   * The column headers are **drawn** on the canvas (`gridVirtualCanvasRenderer.ts:342-361` uses
   * `x = HEADER_COL_WIDTH + colScale.offset(colIdx) − offsetX` inside the band `y ∈ [0, HEADER_ROW_HEIGHT)`),
   * so a DOM control cannot live inside them. This overlay follows **the same** arithmetic — the identical
   * expression this file already uses for the floating editor above — rather than a second position model.
   * The wrapper is `sticky` at the scrollport origin, exactly like the canvas element itself, so the two
   * coordinate frames coincide while the container scrolls.
   */
  const headerEntries = useMemo(() => {
    const entries: { readonly index: number; readonly x: number; readonly width: number }[] = [];
    const push = (colIdx: number) => {
      if (colIdx < 0 || colIdx >= colCount) return;
      const width = colScale.size(colIdx);
      const x = HEADER_COL_WIDTH + colScale.offset(colIdx) - (colIdx < freeze.frozenCols ? 0 : scrollState.scrollLeft);
      if (x + width < HEADER_COL_WIDTH || x > viewportSize.width) return;
      entries.push({ index: colIdx, x, width });
    };
    for (let col = 0; col < Math.min(freeze.frozenCols, colCount); col += 1) push(col);
    for (let col = Math.max(visibleRange.startCol, freeze.frozenCols); col <= visibleRange.endCol; col += 1) push(col);
    return entries;
  }, [colCount, colScale, freeze.frozenCols, scrollState.scrollLeft, viewportSize.width, visibleRange.endCol, visibleRange.startCol]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-[var(--vgt-module-panel-surface)] outline-none select-none"
      role="grid"
      aria-label={`Grid ${sheet.name}`}
      aria-rowcount={effectiveRowCount}
      aria-colcount={colCount}
      tabIndex={0}
      data-render-backend={renderBackend.backend}
      onScroll={handleScroll}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        const target = resolveTarget(e);
        if (target.type === 'cell' && onContextMenu) {
          onContextMenu(e, target.coord);
        }
      }}
    >
      {/* High-DPI Virtualized Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          width: viewportSize.width,
          height: viewportSize.height,
          display: 'block',
          position: 'sticky',
          top: 0,
          left: 0,
          zIndex: 1,
        }}
      />

      {/* AST-0391: the AutoFilter entry, overlaid onto the canvas header band. `sticky` at the scrollport
          origin mirrors the `<canvas>` element above it, so both share one coordinate frame while scrolling. */}
      <div
        className="sticky top-0 left-0 z-20"
        style={{ height: 0, width: 0 }}
        data-vgt-grid-autofilter-overlay={sheet.id}
      >
        {headerEntries.map((entry) => (
          <div
            key={entry.index}
            className="absolute flex items-center justify-end pointer-events-none"
            style={{ left: entry.x, top: 0, width: entry.width, height: HEADER_ROW_HEIGHT, paddingRight: 3 }}
          >
            <span className="pointer-events-auto flex">
              <GridAutoFilterDropdown
                column={toA1(entry.index, 0).replace(/\d+$/, '')}
                cells={cells}
                rowCount={rowCount}
                rules={filterRules}
                onUpdateRules={onUpdateFilters}
                disabled={filterLocked}
              />
            </span>
          </div>
        ))}
      </div>

      {/* Bounded semantic projection of the visible virtualized window for assistive technology. */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>
        {(accessibilityTree.children ?? []).map((row) => (
          <div key={row.id} role="row" aria-rowindex={row.rowIndex}>
            {(row.children ?? []).map((cell) => (
              <div key={cell.id} role="gridcell" aria-rowindex={cell.rowIndex} aria-colindex={cell.columnIndex} aria-selected={cell.selected}>
                {cell.name}
              </div>
            ))}
          </div>
        ))}
      </div>

            {/* Virtual Scroll Extender Spacer */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: totalWidth + HEADER_COL_WIDTH,
          height: totalHeight + HEADER_ROW_HEIGHT,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Floating Inline Input Overlay. Key handling is delegated to the Grid root
          resolver so Enter/Tab/Escape are resolved exactly once. */}
      {isEditing && activeEditPos && (
        <input
          ref={inlineInputRef}
          type="text"
          value={formulaInput}
          onChange={(e) => onChangeFormulaInput(e.target.value)}
          className="absolute z-30 bg-[var(--vgt-module-control-surface)] text-[var(--vgt-control-text)] border-2 border-[var(--vgt-selection-border)] font-mono text-xs px-1 outline-none shadow-lg"
          style={{
            left: activeEditPos.x,
            top: activeEditPos.y,
            width: activeEditPos.width,
            height: activeEditPos.height,
          }}
        />
      )}
    </div>
  );
};
