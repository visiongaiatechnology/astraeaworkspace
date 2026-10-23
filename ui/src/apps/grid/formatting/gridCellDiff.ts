// STATUS: DIAMANT VGT SUPREME
// Astraea Grid cell-diff leaf.
//
// The document history and every undo/redo stack are driven by "which coordinates really
// changed". Formatting edits write the same `value`/`formula` as before, so a diff that
// only compares those two fields silently drops them. This module is the single definition
// of "a cell changed", used by the state hook and the editing controller.

import type { GridCell } from '../../../shared/contracts/workspace';

/**
 * Every persisted `GridCell` field except the ones that describe layout of a *range*.
 * Kept as an explicit list so adding a persisted field is a deliberate act.
 */
const PERSISTED_CELL_KEYS: readonly (keyof GridCell)[] = [
  'value', 'formula', 'dataType', 'richTextRuns',
  'format', 'numberFormatCode',
  'bold', 'italic', 'underline', 'strikethrough', 'fontSize', 'fontFamily',
  'alignment', 'verticalAlignment', 'indent', 'orientation', 'wrap', 'shrinkToFit',
  'locked', 'background', 'text_color', 'border',
  'sparkline', 'sparklineSourceRange', 'sparklineType', 'sparklineColor',
  'commentId', 'stableId',
];

function stableValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => stableValue(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${stableValue(record[key])}`)
      .join(',')}}`;
  }
  return `${typeof value}:${String(value)}`;
}

/**
 * Deterministic identity of a cell's persisted content. Two cells with the same signature
 * render and reopen identically; a different signature must be recorded in the history.
 */
export function gridCellSignature(cell: GridCell | undefined): string {
  if (!cell) return '';
  return PERSISTED_CELL_KEYS.map((key) => `${key}=${stableValue(cell[key])}`).join('|');
}

/** True when the two cells differ in any persisted field. */
export function gridCellsDiffer(before: GridCell | undefined, after: GridCell | undefined): boolean {
  if (before === after) return false;
  return gridCellSignature(before) !== gridCellSignature(after);
}

/**
 * Coordinates present in either map whose persisted content differs. Order is: all
 * coordinates of the previous map first (stable, insertion-ordered), then the new ones.
 */
export function collectChangedGridCoordinates(
  before: Record<string, GridCell>,
  after: Record<string, GridCell>,
): string[] {
  const changed: string[] = [];
  for (const coord of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (gridCellsDiffer(before[coord], after[coord])) changed.push(coord);
  }
  return changed;
}

/**
 * The previous definition of "changed", kept as the documented counter-example that makes
 * the regression observable: it compares only content, so a formatting edit yields `[]`.
 * Product code must not use this; it exists so a test can prove the difference.
 */
export function collectContentOnlyChangedGridCoordinates(
  before: Record<string, GridCell>,
  after: Record<string, GridCell>,
): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((coord) => before[coord]?.value !== after[coord]?.value || before[coord]?.formula !== after[coord]?.formula);
}
