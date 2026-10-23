// STATUS: DIAMANT VGT SUPREME — how a Grid cell reads in Writer, defined once
//
// Paket 43 acceptance: "Grid-Range als lebende Tabelle einfügen, **Format** und Refresh sichtbar
// prüfen."
//
// W-237/W-239, measured: the Writer had **two** cell-text functions for the same feature and neither
// used the Grid's number format.
//   • `writerGridLink.ts`      → `String(value)`   → a percent cell showed `0.175`, currency lost its
//                                                    symbol, dates showed a serial number, `true`
//                                                    became `TRUE`
//   • `writerWorkspaceExtractors.ts` → `valueText()` → little better, and `true` became `Ja`
// The same cell therefore read differently depending on which "insert" button was used, and in both
// cases it read differently from the Grid itself — which has `formatCellValue` for exactly this.
//
// One definition now: the Grid's own formatter decides how a value reads, and the word for a boolean
// is the only thing a caller may choose (the Writer UI is German, so `Ja`/`Nein`).

import type { GridCell } from '../../../../shared/contracts/workspace';
import { formatCellValue } from '../../../grid/compat/gridUtils';

export interface WriterGridCellTextOptions {
  /** Word for `true`. Defaults to the Grid's own spelling. */
  booleanTrue?: string;
  /** Word for `false`. Defaults to the Grid's own spelling. */
  booleanFalse?: string;
}

/** Longest text one cell may contribute. The canonical path bounded and normalised already; the
 * range-link path did neither, so the stricter behaviour is the one that survives here. */
const MAX_CELL_TEXT = 2_048;

/**
 * The display text of one Grid cell, as the Grid itself would show it.
 *
 * `formatCellValue` covers `numberFormatCode`, `currency`, `accounting`, `percent`, `scientific`,
 * `fraction`, `date`, `datetime`, `time`, `duration`, `text` and plain numbers. A number without a
 * format is grouped by the locale, which is also what the Grid shows.
 *
 * The result is normalised and bounded: a cell can never contribute an unbounded string to a Writer
 * table, and the two insert paths cannot differ in how long a cell may be.
 */
export function writerGridCellText(cell: GridCell | undefined, options: WriterGridCellTextOptions = {}): string {
  if (!cell || cell.value === undefined || cell.value === null) return '';
  if (typeof cell.value === 'boolean') {
    return cell.value ? (options.booleanTrue ?? String(cell.value)) : (options.booleanFalse ?? String(cell.value));
  }
  // The contract says `string | number | boolean`; an array can only arrive from malformed foreign
  // data, and was joined before, so it still is.
  if (Array.isArray(cell.value)) {
    return cell.value.map((item) => String(item ?? '')).join(', ').slice(0, MAX_CELL_TEXT);
  }
  return formatCellValue(cell).normalize('NFKC').slice(0, MAX_CELL_TEXT);
}
