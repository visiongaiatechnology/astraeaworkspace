// STATUS: DIAMANT VGT SUPREME
// Astraea Grid freeze-pane geometry. One decision point for both renderers: where
// the frozen bands end and which cell a pointer lands on inside a frozen pane.

import { toA1 } from '../formulas/formula';
import type { GridAxisScale } from './gridAxisSizing';

/** Upper bound for frozen axes so rendering and hit testing stay linear and bounded. */
export const GRID_MAX_FROZEN_AXES = 200;

export interface GridFreezeLayout {
  readonly frozenRows: number;
  readonly frozenCols: number;
  readonly frozenHeight: number;
  readonly frozenWidth: number;
  /** Sticky offsets for the DOM renderer (header band + frozen band). */
  readonly stickyTop: number;
  readonly stickyLeft: number;
}

export interface GridFreezeInput {
  readonly freezeRows: number | undefined;
  readonly freezeCols: number | undefined;
  readonly rowCount: number;
  readonly colCount: number;
  readonly rowScale: GridAxisScale;
  readonly colScale: GridAxisScale;
  readonly headerHeight: number;
  readonly headerWidth: number;
}

function normalizeFreeze(value: number | undefined, count: number): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  if (floored <= 0) return 0;
  // Freezing every row/column would leave no scrolling body at all, and an
  // unbounded freeze would turn the frozen band into an unbounded paint loop.
  return Math.min(floored, Math.max(0, count - 1), GRID_MAX_FROZEN_AXES);
}

export function computeGridFreezeLayout(input: GridFreezeInput): GridFreezeLayout {
  const frozenRows = normalizeFreeze(input.freezeRows, input.rowCount);
  const frozenCols = normalizeFreeze(input.freezeCols, input.colCount);
  return {
    frozenRows,
    frozenCols,
    frozenHeight: input.rowScale.offset(frozenRows),
    frozenWidth: input.colScale.offset(frozenCols),
    stickyTop: input.headerHeight,
    stickyLeft: input.headerWidth,
  };
}

export type GridPointerTarget =
  | { readonly type: 'all' }
  | { readonly type: 'column'; readonly index: number }
  | { readonly type: 'row'; readonly index: number }
  | { readonly type: 'cell'; readonly coord: string; readonly displayRow: number }
  | { readonly type: 'none' };

export interface GridPointerInput {
  readonly x: number;
  readonly y: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly headerWidth: number;
  readonly headerHeight: number;
  readonly rowCount: number;
  readonly colCount: number;
  readonly rowScale: GridAxisScale;
  readonly colScale: GridAxisScale;
  readonly layout: GridFreezeLayout;
  /** Visible-row projection: display row -> sheet row. */
  readonly rowProjection?: readonly number[] | null;
}

/**
 * Resolves a pointer position into a grid target. Cells inside a frozen band are
 * resolved without the scroll offset of that axis, which is what makes a click in
 * a frozen column land on the frozen column and not on the scrolled one.
 */
export function resolveGridPointerTarget(input: GridPointerInput): GridPointerTarget {
  const { x, y, headerWidth, headerHeight, layout } = input;
  if (x < 0 || y < 0) return { type: 'none' };

  if (x < headerWidth && y < headerHeight) return { type: 'all' };
  if (y < headerHeight) {
    if (x < headerWidth) return { type: 'none' };
    return { type: 'column', index: input.colScale.indexAt(x - headerWidth + input.scrollLeft) };
  }
  if (x < headerWidth) {
    const displayRow = input.rowScale.indexAt(y - headerHeight + input.scrollTop);
    return { type: 'row', index: resolveSheetRow(input, displayRow) };
  }

  const inFrozenRows = y < headerHeight + layout.frozenHeight;
  const inFrozenCols = x < headerWidth + layout.frozenWidth;
  const displayRow = input.rowScale.indexAt(inFrozenRows ? y - headerHeight : y - headerHeight + input.scrollTop);
  const colIdx = input.colScale.indexAt(inFrozenCols ? x - headerWidth : x - headerWidth + input.scrollLeft);

  if (displayRow < 0 || displayRow >= input.rowCount || colIdx < 0 || colIdx >= input.colCount) return { type: 'none' };
  return { type: 'cell', coord: toA1(colIdx, resolveSheetRow(input, displayRow)), displayRow };
}

function resolveSheetRow(input: GridPointerInput, displayRow: number): number {
  const bounded = Math.max(0, Math.min(input.rowCount - 1, displayRow));
  return input.rowProjection?.[bounded] ?? bounded;
}
