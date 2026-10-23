// STATUS: DIAMANT VGT SUPREME
// Astraea Grid axis sizing, freeze-pane geometry and merged-cell layout tests.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import {
  buildGridAxisScale,
  GRID_AXIS_BOUNDS,
  GRID_DEFAULT_COL_WIDTH,
  GRID_DEFAULT_ROW_HEIGHT,
  resolveGridAxisResize,
  resolveGridAxisSize,
  resolveGridVisibleAxisRange,
} from '../../canvas/gridAxisSizing';
import { computeGridFreezeLayout, GRID_MAX_FROZEN_AXES, resolveGridPointerTarget } from '../../canvas/gridFreezeGeometry';
import { buildGridMergeIndex, planGridMerge, planGridUnmerge, resolveGridMergeCell } from '../../canvas/gridMergeLayout';
import { calculateGridAutoFit } from '../../formatting/gridFormattingEngine';

const HEADER_W = 48;
const HEADER_H = 26;

const scale = (axis: 'row' | 'col', count: number, overrides: Record<number, number> = {}) =>
  buildGridAxisScale(axis, count, overrides, axis === 'col' ? GRID_DEFAULT_COL_WIDTH : GRID_DEFAULT_ROW_HEIGHT, 1);

describe('Grid axis sizing', () => {
  it('is uniform for an empty override record', () => {
    const cols = scale('col', 5);
    expect(cols.total).toBe(500);
    expect(cols.offset(3)).toBe(300);
    expect(cols.indexAt(250)).toBe(2);
    expect(cols.indexAt(-5)).toBe(0);
    expect(cols.indexAt(10_000)).toBe(4);
  });

  it('applies sparse overrides to size, offset and total', () => {
    const cols = scale('col', 10, { 2: 200 });
    expect(cols.size(2)).toBe(200);
    expect(cols.total).toBe(1100);
    expect(cols.offset(2)).toBe(200);
    expect(cols.offset(3)).toBe(400);
    expect(cols.indexAt(250)).toBe(2);
    expect(cols.indexAt(399)).toBe(2);
    expect(cols.indexAt(400)).toBe(3);
  });

  it('ignores out of range and non numeric overrides', () => {
    const cols = buildGridAxisScale('col', 3, { 7: 200, 1: Number.NaN }, GRID_DEFAULT_COL_WIDTH, 1);
    expect(cols.total).toBe(300);
    expect(cols.offset(3)).toBe(300);
  });

  it('resolves the visible window from the scale instead of a uniform guess', () => {
    const cols = scale('col', 100, { 0: 48 });
    const range = resolveGridVisibleAxisRange(cols, 0, 300, 0);
    // offsets: 0, 48, 148, 248, 348 - so 300px cover the columns 0..3
    expect(range.start).toBe(0);
    expect(range.end).toBe(3);
  });

  it('clamps interactive resizing to the shared axis bounds', () => {
    expect(resolveGridAxisResize('col', 100, 10_000, 1)).toBe(GRID_AXIS_BOUNDS.col.max);
    expect(resolveGridAxisResize('col', 100, -10_000, 1)).toBe(GRID_AXIS_BOUNDS.col.min);
    expect(resolveGridAxisResize('row', 100, 5, 1)).toBe(105);
    expect(resolveGridAxisSize('col', { 4: 120 }, 4, 1)).toBe(120);
    expect(resolveGridAxisSize('row', undefined, 4, 1)).toBe(GRID_DEFAULT_ROW_HEIGHT);
  });

  it('keeps the interactive bounds identical to the AutoFit engine bounds', () => {
    const wide = calculateGridAutoFit({ A1: { value: 'x'.repeat(200) } }, [0], [0]);
    const narrow = calculateGridAutoFit({ A1: { value: '.' } }, [0], [0]);
    expect(wide.colWidths[0]).toBeLessThanOrEqual(GRID_AXIS_BOUNDS.col.max);
    expect(narrow.colWidths[0]).toBeGreaterThanOrEqual(GRID_AXIS_BOUNDS.col.min);
    expect(wide.rowHeights[0]).toBeLessThanOrEqual(GRID_AXIS_BOUNDS.row.max);
    expect(narrow.rowHeights[0]).toBeGreaterThanOrEqual(GRID_AXIS_BOUNDS.row.min);
  });
});

describe('Grid freeze geometry', () => {
  const layout = (freezeRows: number, freezeCols: number, rowCount = 10_000, colCount = 40) => computeGridFreezeLayout({
    freezeRows,
    freezeCols,
    rowCount,
    colCount,
    rowScale: scale('row', rowCount),
    colScale: scale('col', colCount),
    headerHeight: HEADER_H,
    headerWidth: HEADER_W,
  });

  it('clamps the frozen band so a body always remains and stays bounded', () => {
    expect(layout(0, 0).frozenRows).toBe(0);
    // A freeze is capped at GRID_MAX_FROZEN_AXES so rendering stays a bounded loop.
    expect(layout(10_000, 40).frozenRows).toBe(GRID_MAX_FROZEN_AXES);
    expect(layout(500, 500).frozenRows).toBe(GRID_MAX_FROZEN_AXES);
    expect(layout(300, 0).frozenRows).toBe(GRID_MAX_FROZEN_AXES);
    expect(layout(4, 3).frozenRows).toBe(4);
    expect(layout(-3, -3).frozenRows).toBe(0);
    // 24 of 25 rows frozen leaves exactly one scrolling row.
    expect(layout(24, 0, 25, 10).frozenRows).toBe(24);
  });

  it('computes frozen band sizes from the axis scale', () => {
    const freeze = computeGridFreezeLayout({
      freezeRows: 1,
      freezeCols: 2,
      rowCount: 100,
      colCount: 10,
      rowScale: buildGridAxisScale('row', 100, { 0: 60 }, GRID_DEFAULT_ROW_HEIGHT, 1),
      colScale: scale('col', 10, { 1: 150 }),
      headerHeight: HEADER_H,
      headerWidth: HEADER_W,
    });
    expect(freeze.frozenHeight).toBe(60);
    expect(freeze.frozenWidth).toBe(250);
    expect(freeze.stickyTop).toBe(HEADER_H);
    expect(freeze.stickyLeft).toBe(HEADER_W);
  });

  it('maps a click inside the frozen bands without that axis scroll', () => {
    const freeze = layout(1, 1);
    const rowScale = scale('row', 10_000);
    const colScale = scale('col', 40);
    const inFrozen = resolveGridPointerTarget({
      x: 60, y: 30, scrollLeft: 500, scrollTop: 1000, headerWidth: HEADER_W, headerHeight: HEADER_H,
      rowCount: 10_000, colCount: 40, rowScale, colScale, layout: freeze,
    });
    expect(inFrozen).toEqual({ type: 'cell', coord: 'A1', displayRow: 0 });

    const inBody = resolveGridPointerTarget({
      x: 200, y: 200, scrollLeft: 500, scrollTop: 1000, headerWidth: HEADER_W, headerHeight: HEADER_H,
      rowCount: 10_000, colCount: 40, rowScale, colScale, layout: freeze,
    });
    expect(inBody).toEqual({ type: 'cell', coord: 'G46', displayRow: 45 });
  });

  it('keeps the frozen header row correct while the body is scrolled to row 5000', () => {
    const freeze = layout(1, 0);
    const rowScale = scale('row', 10_000);
    const colScale = scale('col', 40);
    const frozen = resolveGridPointerTarget({
      x: 200, y: HEADER_H + 5, scrollLeft: 0, scrollTop: 5000 * GRID_DEFAULT_ROW_HEIGHT,
      headerWidth: HEADER_W, headerHeight: HEADER_H, rowCount: 10_000, colCount: 40, rowScale, colScale, layout: freeze,
    });
    expect(frozen.type).toBe('cell');
    if (frozen.type === 'cell') expect(frozen.coord).toBe('B1');

    const body = resolveGridPointerTarget({
      x: 200, y: HEADER_H + freeze.frozenHeight + 5, scrollLeft: 0, scrollTop: 5000 * GRID_DEFAULT_ROW_HEIGHT,
      headerWidth: HEADER_W, headerHeight: HEADER_H, rowCount: 10_000, colCount: 40, rowScale, colScale, layout: freeze,
    });
    expect(body.type).toBe('cell');
    if (body.type === 'cell') expect(body.coord).toBe('B5002');
  });

  it('still resolves headers, rows and columns', () => {
    const freeze = layout(1, 1);
    const rowScale = scale('row', 100);
    const colScale = scale('col', 10);
    const base = {
      scrollLeft: 0, scrollTop: 0, headerWidth: HEADER_W, headerHeight: HEADER_H,
      rowCount: 100, colCount: 10, rowScale, colScale, layout: freeze,
    };
    expect(resolveGridPointerTarget({ ...base, x: 10, y: 10 })).toEqual({ type: 'all' });
    expect(resolveGridPointerTarget({ ...base, x: 300, y: 10 })).toEqual({ type: 'column', index: 2 });
    expect(resolveGridPointerTarget({ ...base, x: 10, y: 200 })).toEqual({ type: 'row', index: 6 });
  });
});

describe('Grid merged cell layout', () => {
  it('builds spans and marks every covered coordinate', () => {
    const index = buildGridMergeIndex(['A1:B2', 'D1:D3']);
    expect(index.spans.get('A1')).toEqual({ origin: 'A1', colSpan: 2, rowSpan: 2 });
    expect(index.spans.get('D1')).toEqual({ origin: 'D1', colSpan: 1, rowSpan: 3 });
    expect([...index.covered].sort()).toEqual(['A2', 'B1', 'B2', 'D2', 'D3']);
    expect(resolveGridMergeCell(index, 'B2')).toMatchObject({ role: 'covered', origin: 'A1' });
    expect(resolveGridMergeCell(index, 'A1').role).toBe('origin');
    expect(resolveGridMergeCell(index, 'C3').role).toBe('none');
  });

  it('ignores malformed merged ranges', () => {
    expect(buildGridMergeIndex(['nonsense', '']).spans.size).toBe(0);
  });

  it('merges a block, reports the cells that lose data and keeps a deterministic order', () => {
    const cells: Record<string, GridCell> = { B2: { value: 'top' }, A2: { value: 'lose me' }, C1: { value: 'x' }, A1: { value: 'origin' } };
    const plan = planGridMerge(cells, [], 'b2:a1');
    expect(plan.kind).toBe('merged');
    if (plan.kind !== 'merged') return;
    expect(plan.range).toBe('A1:B2');
    expect(plan.primaryCoord).toBe('A1');
    expect(plan.dataLossCoords).toEqual(['A2', 'B2']);
    expect(plan.mergedCells).toEqual(['A1:B2']);
    expect(plan.updatedCells.B2).toBeUndefined();
    expect(plan.updatedCells.A1?.value).toBe('origin');
  });

  it('rejects a merging range that overlaps an existing merge or repeats it', () => {
    const duplicate = planGridMerge({}, ['A1:B2'], 'A1:B2');
    expect(duplicate.kind).toBe('rejected');
    const overlap = planGridMerge({}, ['A1:B2'], 'B2:C3');
    expect(overlap.kind).toBe('rejected');
    if (overlap.kind === 'rejected') expect(overlap.reason).toContain('überschneidet');
    const single = planGridMerge({}, [], 'A1');
    expect(single.kind).toBe('rejected');
    const invalid = planGridMerge({}, [], 'not-a-range');
    expect(invalid.kind).toBe('rejected');
  });

  it('sorts persisted merges so the same operation always persists identically', () => {
    const plan = planGridMerge({}, ['D1:D3'], 'A1:B2');
    expect(plan.kind).toBe('merged');
    if (plan.kind === 'merged') expect(plan.mergedCells).toEqual(['A1:B2', 'D1:D3']);
  });

  it('unmerges every overlapping merge and pads the freed cells', () => {
    const plan = planGridUnmerge({ A1: { value: 1 } }, ['A1:B2', 'D1:D3'], 'A1:B2');
    expect(plan.kind).toBe('unmerged');
    if (plan.kind !== 'unmerged') return;
    expect(plan.mergedCells).toEqual(['D1:D3']);
    expect(plan.updatedCells.A1?.value).toBe(1);
    expect(plan.updatedCells.B2).toEqual({ value: '' });
  });

  it('rejects unmerging a range without a merge instead of reporting success', () => {
    const plan = planGridUnmerge({}, ['A1:B2'], 'D4:E5');
    expect(plan.kind).toBe('rejected');
  });
});
