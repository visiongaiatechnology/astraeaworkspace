// STATUS: DIAMANT VGT SUPREME — bounded CSV serialization with formula-injection neutralization
import type { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../ranges/gridRange';
import { neutralizeSpreadsheetFormulaInjection } from '../../../shared/security/spreadsheetSafety';

function csvEscape(value: unknown): string {
  const text = neutralizeSpreadsheetFormulaInjection(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildGridCsv(
  cells: Record<string, GridCell>,
  colCount: number,
  rowCount: number,
  range?: string,
): string {
  const bounds = range ? parseGridRange(range) : null;
  if (range && !bounds) throw new Error(`Invalid CSV export range: ${range}`);
  const startCol = bounds?.startCol ?? 0;
  const endCol = bounds?.endCol ?? Math.max(0, colCount - 1);
  const startRow = bounds?.startRow ?? 0;
  const endRow = bounds?.endRow ?? Math.max(0, rowCount - 1);
  const rows: string[] = [];

  for (let row = startRow; row <= endRow; row++) {
    const values: string[] = [];
    for (let col = startCol; col <= endCol; col++) {
      values.push(csvEscape(cells[toA1(col, row)]?.value ?? ''));
    }
    rows.push(values.join(','));
  }
  return rows.join('\r\n');
}
