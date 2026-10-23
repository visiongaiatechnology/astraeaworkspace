// STATUS: DIAMANT VGT SUPREME
// Astraea Grid conditional-format preview leaf.
//
// The dialog must show what a rule does *before* it is stored. The preview never
// re-implements rule evaluation: it feeds the draft through the same
// `conditionalVisualForCell` the canvas and the DOM table use.

import type { GridCell, GridConditionalFormattingRule } from '../../../shared/contracts/workspace';
import { parseCoord } from '../core/gridCoordinate';
import { parseGridRange } from '../ranges/gridRange';
import { toA1 } from '../formulas/formula';
import { conditionalVisualForCell, type GridConditionalVisual } from './gridFormattingEngine';
import { GRID_FORMAT_MAX_PREVIEW_CELLS } from './gridFormatValidation';

export interface GridConditionalPreviewCell {
  readonly coord: string;
  readonly value: GridCell['value'] | undefined;
  /** Rendered value of the sample cell, using the sheet's own number-format renderer. */
  readonly visual: GridConditionalVisual;
  readonly matched: boolean;
}

export interface GridConditionalPreview {
  readonly cells: readonly GridConditionalPreviewCell[];
  /** True when the rule is valid enough to be previewed at all. */
  readonly available: boolean;
  /** True when at least one sampled cell is affected by the rule. */
  readonly anyMatch: boolean;
}

const UNAVAILABLE_PREVIEW: GridConditionalPreview = { cells: [], available: false, anyMatch: false };

export interface GridConditionalPreviewInput {
  readonly rule: GridConditionalFormattingRule | null;
  readonly cells: Record<string, GridCell>;
  readonly fallbackValue?: GridCell['value'];
  readonly maxCells?: number;
}

/**
 * Samples up to `maxCells` cells of the rule range in row-major order and reports the
 * visual the rule produces for each one. An empty sheet still yields samples carrying the
 * current cell value, so a rule can be judged before any data exists.
 */
export function buildGridConditionalPreview({
  rule,
  cells,
  fallbackValue,
  maxCells = GRID_FORMAT_MAX_PREVIEW_CELLS,
}: GridConditionalPreviewInput): GridConditionalPreview {
  if (!rule) return UNAVAILABLE_PREVIEW;
  const bounds = parseGridRange(rule.range);
  if (!bounds) return UNAVAILABLE_PREVIEW;

  const limit = Math.max(1, Math.min(GRID_FORMAT_MAX_PREVIEW_CELLS, Math.floor(maxCells)));
  const coords: string[] = [];
  for (let row = bounds.startRow; row <= bounds.endRow && coords.length < limit; row++) {
    for (let col = bounds.startCol; col <= bounds.endCol && coords.length < limit; col++) {
      coords.push(toA1(col, row));
    }
  }
  if (coords.length === 0) return UNAVAILABLE_PREVIEW;

  const previewCells = coords.map((coord): GridConditionalPreviewCell => {
    const stored = cells[coord];
    const cell: GridCell | undefined = stored ?? (fallbackValue === undefined ? undefined : { value: fallbackValue });
    const visual = conditionalVisualForCell(coord, cell, [rule], cells);
    return {
      coord,
      value: cell?.value,
      visual,
      matched: hasVisualEffect(visual),
    };
  });

  return {
    cells: previewCells,
    available: true,
    anyMatch: previewCells.some((cell) => cell.matched),
  };
}

/** A visual is a match when a rule fired for the cell, or when it changes the rendering. */
export function hasVisualEffect(visual: GridConditionalVisual): boolean {
  if (visual.matched === true) return true;
  if (visual.dataBarPercent !== undefined) return true;
  if (visual.icon !== undefined && visual.icon !== '') return true;
  if (visual.bold === true) return true;
  return visual.background !== undefined || visual.textColor !== undefined;
}

/** Suggests the range a new rule should default to when nothing is selected. */
export function defaultGridConditionalRange(selectedRange: string, coord: string): string {
  const trimmed = selectedRange.trim();
  if (trimmed !== '' && parseGridRange(trimmed)) return trimmed.toUpperCase();
  const parsed = parseCoord(coord);
  return parsed.rowIdx >= 0 && parsed.colIdx >= 0 ? toA1(parsed.colIdx, parsed.rowIdx) : 'A1';
}
