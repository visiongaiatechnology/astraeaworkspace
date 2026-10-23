// STATUS: DIAMANT VGT SUPREME
// Isolated Grid Canvas2D rendering with caller-owned viewport, axis scales,
// merged spans and freeze-pane state.

import type { GridCell, GridSheetModel } from '../../../shared/contracts/workspace';
import { toA1, parseA1 } from '../formulas/formula';
import { formatCellValue } from '../compat/gridUtils';
import { conditionalStyleForCell } from '../compat/gridProfessional';
import { parseGridSelectionBounds, gridSelectionIndexAt } from './gridSelectionIndex';
import { structuredTableVisualForCell } from '../formatting/gridFormattingEngine';
import { resolveGridBorderSides } from '../formatting/gridFormatValidation';
import { buildGridAxisVisibility } from '../workbook/gridWorkbookViews';
import { drawGridCanvasSparkline } from './gridCanvasSparkline';
import { resolveGridCanvasTheme } from './gridCanvasTheme';
import { configureHighDpiCanvas, isUsableCanvas2DContext } from '../../../platform/rendering/index';
import type { GridAxisScale } from './gridAxisSizing';
import type { GridFreezeLayout } from './gridFreezeGeometry';
import type { GridMergeIndex } from './gridMergeLayout';

export const HEADER_ROW_HEIGHT = 26;
export const HEADER_COL_WIDTH = 48;

export interface GridVirtualCanvasVisibleRange {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
}

export interface GridVirtualCanvasRendererInput {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  viewportSize: { width: number; height: number };
  scrollState: { scrollLeft: number; scrollTop: number };
  visibleRange: GridVirtualCanvasVisibleRange;
  rowProjection?: number[] | null;
  colScale: GridAxisScale;
  rowScale: GridAxisScale;
  freeze: GridFreezeLayout;
  mergeIndex?: GridMergeIndex;
  cells: Record<string, GridCell>;
  selectedCell: string;
  selectedRanges: string[];
  sheet: GridSheetModel;
  invalidCoords?: Set<string>;
  isCirclingInvalid?: boolean;
  fontFamily: string;
}

export const drawGridVirtualCanvas = ({
  canvas,
  context: ctx,
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
  fontFamily,
}: GridVirtualCanvasRendererInput): void => {
  const w = viewportSize.width;
  const h = viewportSize.height;
  /**
   * GR-001 — a canvas context that exists but cannot draw must skip the frame.
   *
   * Before, a partial context (WebView2 with a restricted GPU/driver shim) got past the
   * `getContext() !== null` check and threw on the first draw call inside the React effect,
   * which the recovery boundary does not catch. The grid now renders its DOM/accessibility
   * layer and simply draws no pixels instead of losing the sheet.
   */
  if (!isUsableCanvas2DContext(ctx)) return;
  configureHighDpiCanvas(canvas, ctx, w, h);
  const theme = resolveGridCanvasTheme(getComputedStyle(document.documentElement));

  // Background
  ctx.fillStyle = theme.workbench;
  ctx.fillRect(0, 0, w, h);

  const { startCol, endCol, startRow, endRow } = visibleRange;
  const offsetX = scrollState.scrollLeft;
  const offsetY = scrollState.scrollTop;

  const bodyLeft = HEADER_COL_WIDTH + freeze.frozenWidth;
  const bodyTop = HEADER_ROW_HEIGHT + freeze.frozenHeight;

  /** Freeze-aware pixel origin of one cell. Frozen cells ignore their axis scroll. */
  const cellOrigin = (colIdx: number, displayRow: number): { x: number; y: number } => ({
    x: HEADER_COL_WIDTH + colScale.offset(colIdx) - (colIdx < freeze.frozenCols ? 0 : offsetX),
    y: HEADER_ROW_HEIGHT + rowScale.offset(displayRow) - (displayRow < freeze.frozenRows ? 0 : offsetY),
  });

  // Die Auswahl ändert sich innerhalb eines Bildes nicht — deshalb genau einmal zerlegen.
  const selectionBounds = parseGridSelectionBounds(selectedRanges);
  const isColumnSelected = (colIdx: number): boolean =>
    selectionBounds.some((bounds) => colIdx >= bounds.startCol && colIdx <= bounds.endCol);
  const isRowSelected = (sheetRow: number): boolean =>
    selectionBounds.some((bounds) => sheetRow >= bounds.startRow && sheetRow <= bounds.endRow);

  // Achsensichtbarkeit und Kommentarmarker ebenfalls genau einmal je Bild. Vorher fragte jede Zelle
  // `isGridAxisIndexVisible` zweimal und durchsuchte für den Kommentarmarker die gesamte
  // Kommentarliste des Blattes — O(Zellen × Kommentare) pro Frame.
  const spanColumns: number[] = [];
  for (let colIdx = startCol; colIdx <= endCol; colIdx += 1) spanColumns.push(colIdx);
  const colVisible = buildGridAxisVisibility(sheet, 'col', spanColumns);
  const colVisibleByIndex = new Map<number, boolean>();
  spanColumns.forEach((colIdx, slot) => colVisibleByIndex.set(colIdx, colVisible[slot] ?? true));

  const spanDisplayRows: number[] = [];
  for (let displayRow = startRow; displayRow <= endRow; displayRow += 1) spanDisplayRows.push(displayRow);
  const spanSheetRows = spanDisplayRows.map((displayRow) => rowProjection?.[displayRow] ?? displayRow);
  const rowVisible = buildGridAxisVisibility(sheet, 'row', spanSheetRows);
  const rowVisibleByIndex = new Map<number, boolean>();
  spanSheetRows.forEach((sheetRow, slot) => rowVisibleByIndex.set(sheetRow, rowVisible[slot] ?? true));

  const commentCoords = new Set<string>();
  for (const comment of sheet.comments ?? []) {
    if (!comment.resolved) commentCoords.add(comment.coord.toUpperCase());
  }

  const isColumnVisible = (colIdx: number): boolean => colVisibleByIndex.get(colIdx) ?? true;
  const isRowVisible = (sheetRow: number): boolean => rowVisibleByIndex.get(sheetRow) ?? true;

  const drawCell = (colIdx: number, displayRow: number): void => {
    const sheetRow = rowProjection?.[displayRow] ?? displayRow;
    // Einmal je Bild zerlegt (`selectionBounds` oben) — vorher zerlegte jeder Zellaufruf jeden Bereich neu.
    const selectionIndex = gridSelectionIndexAt(selectionBounds, colIdx, sheetRow);
    if (!isColumnVisible(colIdx) || !isRowVisible(sheetRow)) return;
    const cellWidth = colScale.size(colIdx);
    const cellHeight = rowScale.size(displayRow);
    const { x, y } = cellOrigin(colIdx, displayRow);

    const coord = toA1(colIdx, sheetRow);
    const merge = mergeIndex;
    if (merge) {
      const role = merge.originByCovered.get(coord);
      // Covered cells belong to their merge origin and are never painted alone.
      if (role) return;
    }
    const span = merge?.spans.get(coord);
    const paintWidth = span ? colScale.offset(colIdx + span.colSpan) - colScale.offset(colIdx) : cellWidth;
    const paintHeight = span ? rowScale.offset(displayRow + span.rowSpan) - rowScale.offset(displayRow) : cellHeight;

    const cell = cells[coord];
    const isInSel = selectionIndex >= 0;
    const isSel = selectedCell === coord;

    const condStyle = conditionalStyleForCell(coord, cell, sheet.conditionalFormatting ?? [], cells);
    const tableVisual = structuredTableVisualForCell(coord, sheet.tables ?? []);
    if (condStyle.background) {
      ctx.fillStyle = condStyle.background;
      ctx.fillRect(x, y, paintWidth, paintHeight);
    } else if (cell?.background ?? tableVisual.background) {
      ctx.fillStyle = cell?.background ?? tableVisual.background ?? '#0a0d14';
      ctx.fillRect(x, y, paintWidth, paintHeight);
    } else if (isSel || isInSel) {
      ctx.fillStyle = theme.selectionSurface;
      ctx.fillRect(x, y, paintWidth, paintHeight);
    }

    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, paintWidth, paintHeight);

    // User border: painted after the gridline so an explicit border always wins. `outline`
    // only strokes the edges of the selection, which is the point of the style.
    const borderedRange = selectionIndex >= 0 ? selectedRanges[selectionIndex] : undefined;
    const borderSides = resolveGridBorderSides(cell?.border, coord, borderedRange);
    if (borderSides.top || borderSides.bottom || borderSides.left || borderSides.right) {
      const doubleBottom = cell?.border === 'double-bottom';
      ctx.save();
      ctx.strokeStyle = condStyle.textColor ?? cell?.text_color ?? tableVisual.textColor ?? theme.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (borderSides.top) { ctx.moveTo(x, y + 1); ctx.lineTo(x + paintWidth, y + 1); }
      if (borderSides.bottom) { ctx.moveTo(x, y + paintHeight - (doubleBottom ? 3 : 1)); ctx.lineTo(x + paintWidth, y + paintHeight - (doubleBottom ? 3 : 1)); }
      if (borderSides.left) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + paintHeight); }
      if (borderSides.right) { ctx.moveTo(x + paintWidth - 1, y); ctx.lineTo(x + paintWidth - 1, y + paintHeight); }
      ctx.stroke();
      if (doubleBottom) {
        ctx.beginPath();
        ctx.moveTo(x, y + paintHeight - 1);
        ctx.lineTo(x + paintWidth, y + paintHeight - 1);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (condStyle.dataBarPercent !== undefined) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = condStyle.dataBarColor ?? '#3b82f6';
      ctx.fillRect(x + 2, y + 4, Math.max(0, (paintWidth - 4) * condStyle.dataBarPercent / 100), Math.max(2, paintHeight - 8));
      ctx.restore();
    }

    const displayVal = `${condStyle.icon ? `${condStyle.icon} ` : ''}${formatCellValue(cell)}`;
    if (displayVal !== '') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 4, y, Math.max(0, paintWidth - 8), paintHeight);
      ctx.clip();

      ctx.fillStyle = condStyle.textColor ?? cell?.text_color ?? tableVisual.textColor ?? theme.text;
      const fontSize = cell?.fontSize ?? 11;
      const fontStyle = cell?.italic ? 'italic ' : '';
      const fontWeight = cell?.bold || tableVisual.bold || condStyle.bold ? 'bold ' : '';
      ctx.font = `${fontStyle}${fontWeight}${fontSize}px ${fontFamily}`;

      const align = cell?.alignment ?? (typeof cell?.value === 'number' ? 'right' : 'left');
      ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
      ctx.textBaseline = 'middle';

      const textX = align === 'center' ? x + paintWidth / 2 : align === 'right' ? x + paintWidth - 6 : x + 6;
      const textY = y + paintHeight / 2;
      ctx.fillText(displayVal, textX, textY);

      // Underline and strikethrough are drawn because Canvas2D has no text-decoration.
      const textWidth = ctx.measureText(displayVal).width;
      const underlineStart = align === 'center' ? textX - textWidth / 2 : align === 'right' ? textX - textWidth : textX;
      if (cell?.underline) {
        ctx.beginPath();
        ctx.moveTo(underlineStart, textY + fontSize * 0.5);
        ctx.lineTo(underlineStart + textWidth, textY + fontSize * 0.5);
        ctx.lineWidth = 1;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke();
      }
      if (cell?.strikethrough) {
        ctx.beginPath();
        ctx.moveTo(underlineStart, textY);
        ctx.lineTo(underlineStart + textWidth, textY);
        ctx.lineWidth = 1;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke();
      }
      ctx.restore();
    }
    if (cell?.sparkline && cell.sparkline.length > 1) drawGridCanvasSparkline(ctx, cell, x, y, paintWidth, paintHeight);

    if (isCirclingInvalid && invalidCoords?.has(coord)) {
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.ellipse(x + paintWidth / 2, y + paintHeight / 2, paintWidth * 0.45, paintHeight * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const hasComment = commentCoords.has(coord);
    if (hasComment) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(x + paintWidth - 6, y);
      ctx.lineTo(x + paintWidth, y);
      ctx.lineTo(x + paintWidth, y + 6);
      ctx.closePath();
      ctx.fill();
    }
  };

  // 1. Scrolling body. Clipped so it can never paint under the frozen bands.
  ctx.save();
  ctx.beginPath();
  ctx.rect(bodyLeft, bodyTop, Math.max(0, w - bodyLeft), Math.max(0, h - bodyTop));
  ctx.clip();
  for (let displayRow = startRow; displayRow <= endRow; displayRow++) {
    if (displayRow < freeze.frozenRows) continue;
    const y = HEADER_ROW_HEIGHT + rowScale.offset(displayRow) - offsetY;
    if (y + rowScale.size(displayRow) < bodyTop || y > h) continue;
    for (let colIdx = startCol; colIdx <= endCol; colIdx++) {
      if (colIdx < freeze.frozenCols) continue;
      const x = HEADER_COL_WIDTH + colScale.offset(colIdx) - offsetX;
      if (x + colScale.size(colIdx) < bodyLeft || x > w) continue;
      drawCell(colIdx, displayRow);
    }
  }
  ctx.restore();

  // 2. Frozen rows band (drawn on top, vertical scroll pinned).
  if (freeze.frozenRows > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(HEADER_COL_WIDTH, HEADER_ROW_HEIGHT, Math.max(0, w - HEADER_COL_WIDTH), freeze.frozenHeight);
    ctx.clip();
    for (let displayRow = 0; displayRow < freeze.frozenRows; displayRow++) {
      for (let colIdx = startCol; colIdx <= endCol; colIdx++) {
        if (colIdx < freeze.frozenCols) continue;
        const x = HEADER_COL_WIDTH + colScale.offset(colIdx) - offsetX;
        if (x + colScale.size(colIdx) < bodyLeft || x > w) continue;
        drawCell(colIdx, displayRow);
      }
    }
    ctx.restore();
  }

  // 3. Frozen columns band (drawn on top, horizontal scroll pinned).
  if (freeze.frozenCols > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(HEADER_COL_WIDTH, HEADER_ROW_HEIGHT, freeze.frozenWidth, Math.max(0, h - HEADER_ROW_HEIGHT));
    ctx.clip();
    for (let displayRow = startRow; displayRow <= endRow; displayRow++) {
      if (displayRow < freeze.frozenRows) continue;
      const y = HEADER_ROW_HEIGHT + rowScale.offset(displayRow) - offsetY;
      if (y + rowScale.size(displayRow) < bodyTop || y > h) continue;
      for (let colIdx = 0; colIdx < freeze.frozenCols; colIdx++) drawCell(colIdx, displayRow);
    }
    ctx.restore();
  }

  // 4. Frozen intersection (both axes pinned).
  if (freeze.frozenRows > 0 && freeze.frozenCols > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(HEADER_COL_WIDTH, HEADER_ROW_HEIGHT, freeze.frozenWidth, freeze.frozenHeight);
    ctx.clip();
    for (let displayRow = 0; displayRow < freeze.frozenRows; displayRow++) {
      for (let colIdx = 0; colIdx < freeze.frozenCols; colIdx++) drawCell(colIdx, displayRow);
    }
    ctx.restore();
  }

  // 5. Selection border & fill handle (freeze aware).
  const selParsed = parseA1(selectedCell);
  if (selParsed) {
    const selectedDisplayRow = rowProjection ? rowProjection.indexOf(selParsed.row) : selParsed.row;
    if (selectedDisplayRow >= 0) {
      const { x: selX, y: selY } = cellOrigin(selParsed.col, selectedDisplayRow);
      const selW = colScale.size(selParsed.col);
      const selH = rowScale.size(selectedDisplayRow);
      if (selX + selW >= HEADER_COL_WIDTH && selX <= w && selY + selH >= HEADER_ROW_HEIGHT && selY <= h) {
        ctx.strokeStyle = theme.selectionBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(selX, selY, selW, selH);

        // Fill handle dot at bottom right
        ctx.fillStyle = theme.selectionBorder;
        ctx.fillRect(selX + selW - 3, selY + selH - 3, 6, 6);
      }
    }
  }

  // 6. Pinned Column Headers (A, B, C...) - horizontal scroll applies, vertical pinned.
  ctx.fillStyle = theme.control;
  ctx.fillRect(0, 0, w, HEADER_ROW_HEIGHT);

  for (let colIdx = startCol; colIdx <= endCol; colIdx++) {
    if (!isColumnVisible(colIdx)) continue;
    const x = HEADER_COL_WIDTH + colScale.offset(colIdx) - (colIdx < freeze.frozenCols ? 0 : offsetX);
    const width = colScale.size(colIdx);
    if (x + width < HEADER_COL_WIDTH || x > w) continue;

    const columnSelected = isColumnSelected(colIdx);
    ctx.fillStyle = columnSelected ? theme.selectionSurface : theme.control;
    ctx.fillRect(x, 0, width, HEADER_ROW_HEIGHT);
    if (columnSelected) {
      ctx.fillStyle = theme.selectionBorder;
      ctx.fillRect(x, HEADER_ROW_HEIGHT - 2, width, 2);
    }
    ctx.strokeStyle = columnSelected ? theme.selectionBorder : theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, 0, width, HEADER_ROW_HEIGHT);

    const colLetter = toA1(colIdx, 0).replace(/\d+$/, '');
    ctx.fillStyle = columnSelected ? theme.text : theme.mutedText;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(colLetter, x + width / 2, HEADER_ROW_HEIGHT / 2);
  }

  // 7. Pinned Row Headers (1, 2, 3...) - vertical scroll applies, horizontal pinned.
  ctx.fillStyle = theme.control;
  ctx.fillRect(0, 0, HEADER_COL_WIDTH, h);

  for (let displayRow = startRow; displayRow <= endRow; displayRow++) {
    const sheetRow = rowProjection?.[displayRow] ?? displayRow;
    if (!isRowVisible(sheetRow)) continue;
    const y = HEADER_ROW_HEIGHT + rowScale.offset(displayRow) - (displayRow < freeze.frozenRows ? 0 : offsetY);
    const height = rowScale.size(displayRow);
    if (y + height < HEADER_ROW_HEIGHT || y > h) continue;

    const rowSelected = isRowSelected(sheetRow);
    ctx.fillStyle = rowSelected ? theme.selectionSurface : theme.control;
    ctx.fillRect(0, y, HEADER_COL_WIDTH, height);
    if (rowSelected) {
      ctx.fillStyle = theme.selectionBorder;
      ctx.fillRect(HEADER_COL_WIDTH - 2, y, 2, height);
    }
    ctx.strokeStyle = rowSelected ? theme.selectionBorder : theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, y, HEADER_COL_WIDTH, height);

    ctx.fillStyle = rowSelected ? theme.text : theme.mutedText;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(sheetRow + 1), HEADER_COL_WIDTH / 2, y + height / 2);
  }

  // 8. Top-Left Corner Box
  ctx.fillStyle = theme.control;
  ctx.fillRect(0, 0, HEADER_COL_WIDTH, HEADER_ROW_HEIGHT);
  ctx.strokeStyle = theme.border;
  ctx.strokeRect(0, 0, HEADER_COL_WIDTH, HEADER_ROW_HEIGHT);
  ctx.fillStyle = theme.mutedText;
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('#', HEADER_COL_WIDTH / 2, HEADER_ROW_HEIGHT / 2);

  // 9. Freeze boundary markers.
  if (freeze.frozenRows > 0) {
    ctx.strokeStyle = theme.selectionBorder;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(HEADER_COL_WIDTH, bodyTop);
    ctx.lineTo(w, bodyTop);
    ctx.stroke();
  }
  if (freeze.frozenCols > 0) {
    ctx.strokeStyle = theme.selectionBorder;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bodyLeft, HEADER_ROW_HEIGHT);
    ctx.lineTo(bodyLeft, h);
    ctx.stroke();
  }
};
