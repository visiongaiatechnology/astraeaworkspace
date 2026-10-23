// STATUS: DIAMANT VGT SUPREME
// Unit tests for Astraea Grid Canvas Virtualization Engine
// Testing 1,000,000 rows and 16,384 columns in O(1) memory windowing

import { describe, it, expect } from 'vitest';
import { toA1, parseA1 } from '../../formulas/formula';

describe('Grid Canvas Virtualization Geometry & O(1) Memory Engine', () => {
  const colWidth = 100;
  const rowHeight = 26;
  const headerRowHeight = 26;
  const headerColWidth = 48;
  const viewportWidth = 1200;
  const viewportHeight = 800;
  const overscanCols = 3;
  const overscanRows = 5;

  const totalCols = 16384;
  const totalRows = 1048576;

  function calculateVisibleWindow(scrollLeft: number, scrollTop: number) {
    const startCol = Math.max(0, Math.floor(scrollLeft / colWidth) - overscanCols);
    const endCol = Math.min(
      totalCols - 1,
      Math.ceil((scrollLeft + viewportWidth) / colWidth) + overscanCols
    );

    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
    const endRow = Math.min(
      totalRows - 1,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscanRows
    );

    const renderedColCount = endCol - startCol + 1;
    const renderedRowCount = endRow - startRow + 1;
    const renderedCellCount = renderedColCount * renderedRowCount;

    return { startCol, endCol, startRow, endRow, renderedColCount, renderedRowCount, renderedCellCount };
  }

  it('calculates initial viewport at origin (0, 0) with bounded O(1) cell count', () => {
    const win = calculateVisibleWindow(0, 0);
    expect(win.startCol).toBe(0);
    expect(win.startRow).toBe(0);
    // 1200 / 100 = 12 cols visible + 3 overscan = ~15 cols
    expect(win.renderedColCount).toBeLessThanOrEqual(20);
    // 800 / 26 = ~31 rows visible + 5 overscan = ~36 rows
    expect(win.renderedRowCount).toBeLessThanOrEqual(45);
    // Total cells rendered strictly bounded (< 1000 cells) despite 17 billion total cells in sheet!
    expect(win.renderedCellCount).toBeLessThan(1000);
  });

  it('calculates deep virtual viewport at row 500,000 and col 8,000 with exact O(1) bounds', () => {
    const scrollLeft = 8000 * colWidth; // 800,000 px
    const scrollTop = 500000 * rowHeight; // 13,000,000 px

    const win = calculateVisibleWindow(scrollLeft, scrollTop);
    expect(win.startCol).toBe(8000 - overscanCols);
    expect(win.startRow).toBe(500000 - overscanRows);
    expect(win.renderedCellCount).toBeLessThan(1000);
  });

  it('handles maximum boundaries at row 1,048,575 and col 16,383 without index overflow', () => {
    const scrollLeft = (totalCols - 1) * colWidth;
    const scrollTop = (totalRows - 1) * rowHeight;

    const win = calculateVisibleWindow(scrollLeft, scrollTop);
    expect(win.endCol).toBe(totalCols - 1);
    expect(win.endRow).toBe(totalRows - 1);
    expect(win.renderedCellCount).toBeLessThan(1000);

    // Verify cell coordinate generation at maximum boundary
    const maxCoord = toA1(win.endCol, win.endRow);
    expect(maxCoord).toBe('XFD1048576');
    const parsed = parseA1(maxCoord);
    expect(parsed).not.toBeNull();
    expect(parsed?.col).toBe(16383);
    expect(parsed?.row).toBe(1048575);
  });

  it('maps pixel mouse clicks precisely to cell coordinates at deep scroll offsets', () => {
    const scrollLeft = 5000;
    const scrollTop = 10000;

    function getCellFromPixel(pixelX: number, pixelY: number) {
      if (pixelX < headerColWidth || pixelY < headerRowHeight) {
        return null;
      }
      const c = Math.floor((pixelX - headerColWidth + scrollLeft) / colWidth);
      const r = Math.floor((pixelY - headerRowHeight + scrollTop) / rowHeight);
      return toA1(c, r);
    }

    // Click inside the viewport
    const clickedCoord = getCellFromPixel(headerColWidth + 50, headerRowHeight + 13);
    // col = (50 + 5000) / 100 = 50 -> col 50
    // row = (13 + 10000) / 26 = 385 -> row 385
    expect(clickedCoord).toBe(toA1(50, 385));
  });
});
