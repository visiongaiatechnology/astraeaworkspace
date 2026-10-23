// STATUS: DIAMANT — bounded, pure selection summary for the visible Grid status strip.
//
// The status must describe exactly the state the Grid already holds: the normalized
// `selectedRange`, the document's cell map and the active cell's number format. It is a
// leaf function so the visible label and the `aria-live` announcement cannot disagree.
import type { GridCell } from '../../../shared/contracts/workspace';
import { parseA1 } from '../formulas/formula';
import { parseGridRange } from '../ranges/gridRange';
import { GRID_NUMBER_FORMAT_PRESETS, type GridNumberFormatId } from '../formatting/gridNumberFormat';

export interface GridSelectionSummary {
  readonly range: string;
  readonly rows: number;
  readonly columns: number;
  readonly cellCount: number;
  readonly nonEmptyCount: number;
  readonly numericCount: number;
  readonly sum: number | null;
  readonly average: number | null;
  /** Canonical preset id when the active cell carries a known format, else null. */
  readonly formatId: GridNumberFormatId | null;
  /** Human-readable fallback: preset label, raw format code or semantic type. */
  readonly formatLabel: string;
}

function activeFormat(activeCell: GridCell | undefined): { id: GridNumberFormatId | null; label: string } {
  if (!activeCell) return { id: null, label: 'General' };
  if (activeCell.numberFormatCode) {
    // Match the stored code against the canonical catalogue; never create a second mapping.
    const matched = GRID_NUMBER_FORMAT_PRESETS.find((preset) => preset.code === activeCell.numberFormatCode);
    return matched
      ? { id: matched.id, label: matched.label }
      : { id: null, label: activeCell.numberFormatCode };
  }
  if (activeCell.format) {
    const matched = GRID_NUMBER_FORMAT_PRESETS.find((preset) => preset.format === activeCell.format);
    return matched
      ? { id: matched.id, label: matched.label }
      : { id: null, label: String(activeCell.format) };
  }
  return { id: 'general', label: 'General' };
}

/**
 * Computes the visible summary. Rows/columns/sum/avg are derived from the real selected
 * range and the cells actually present; empty or non-numeric cells never invent numbers.
 */
export function buildGridSelectionSummary(
  range: string,
  cells: Readonly<Record<string, GridCell>>,
  activeCell?: GridCell,
): GridSelectionSummary {
  const bounds = parseGridRange(range);
  if (!bounds) {
    return {
      range,
      rows: 0,
      columns: 0,
      cellCount: 0,
      nonEmptyCount: 0,
      numericCount: 0,
      sum: null,
      average: null,
      formatId: null,
      formatLabel: activeFormat(activeCell).label,
    };
  }

  let nonEmptyCount = 0;
  let numericCount = 0;
  let sum = 0;
  for (const [coord, cell] of Object.entries(cells)) {
    const parsed = parseA1(coord);
    if (!parsed) continue;
    if (parsed.col < bounds.startCol || parsed.col > bounds.endCol) continue;
    if (parsed.row < bounds.startRow || parsed.row > bounds.endRow) continue;
    const value = cell?.value;
    if (value === undefined || value === null || value === '') continue;
    nonEmptyCount += 1;
    if (typeof value === 'number' && Number.isFinite(value)) {
      numericCount += 1;
      sum += value;
    }
  }

  const rows = bounds.endRow - bounds.startRow + 1;
  const columns = bounds.endCol - bounds.startCol + 1;
  const format = activeFormat(activeCell);
  return {
    range: range.toUpperCase(),
    rows,
    columns,
    cellCount: rows * columns,
    nonEmptyCount,
    numericCount,
    sum: numericCount > 0 ? sum : null,
    average: numericCount > 0 ? sum / numericCount : null,
    formatId: format.id,
    formatLabel: format.label,
  };
}
