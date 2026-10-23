import { assertQueryTableLimits, type QueryColumn, type QueryValue } from './gridPowerQueryEngine';
import { assertQueryMatrixBounds, GRID_QUERY_MAX_COLUMNS, GRID_QUERY_MAX_LOADED_CELLS, GRID_QUERY_MAX_ROWS } from './gridQueryLimits';

/**
 * Converts a table result to an Astraea Grid coordinate map { "A1": "Val", "B1": "Val" }.
 */
export function queryResultToGridCells(
  startRow: number,
  startCol: number,
  columns: QueryColumn[],
  rows: QueryValue[][]
): Record<string, string> {
  assertQueryTableLimits(columns, rows);
  const loadedRows = rows.length + 1;
  assertQueryMatrixBounds(loadedRows, columns.length);
  if (loadedRows * columns.length > GRID_QUERY_MAX_LOADED_CELLS) throw new Error('query_load_cell_limit');
  if (!Number.isSafeInteger(startRow) || !Number.isSafeInteger(startCol) || startRow < 0 || startCol < 0
    || startRow + loadedRows > GRID_QUERY_MAX_ROWS || startCol + columns.length > GRID_QUERY_MAX_COLUMNS) {
    throw new Error('query_load_coordinate_limit');
  }
  const cells: Record<string, string> = Object.create(null) as Record<string, string>;

  const colToLetter = (c: number): string => {
    let temp = c;
    let letter = '';
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  // Header row
  for (let c = 0; c < columns.length; c++) {
    const coord = `${colToLetter(startCol + c)}${startRow + 1}`;
    cells[coord] = columns[c].name;
  }

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < columns.length; c++) {
      const coord = `${colToLetter(startCol + c)}${startRow + 2 + r}`;
      cells[coord] = String(rows[r][c] ?? '');
    }
  }

  return cells;
}
