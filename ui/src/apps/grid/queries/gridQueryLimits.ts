// STATUS: PLATIN
// Shared resource ceilings for untrusted local query sources and transformations.
export const GRID_QUERY_MAX_SOURCE_BYTES = 16 * 1024 * 1024;
export const GRID_QUERY_MAX_ROWS = 50_000;
export const GRID_QUERY_MAX_COLUMNS = 256;
export const GRID_QUERY_MAX_CELLS = 250_000;
export const GRID_QUERY_MAX_CELL_CHARS = 128_000;
export const GRID_QUERY_MAX_STEPS = 128;
export const GRID_QUERY_MAX_LOADED_CELLS = 10_000;

export function assertQueryTextBytes(text: string): void {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index++; }
      else bytes += 3;
    } else bytes += 3;
    if (bytes > GRID_QUERY_MAX_SOURCE_BYTES) throw new Error('query_source_size_limit');
  }
}

export function assertQueryMatrixBounds(rowCount: number, columnCount: number): void {
  if (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > GRID_QUERY_MAX_ROWS) throw new Error('query_source_row_limit');
  if (!Number.isSafeInteger(columnCount) || columnCount < 0 || columnCount > GRID_QUERY_MAX_COLUMNS) throw new Error('query_source_column_limit');
  if (rowCount * columnCount > GRID_QUERY_MAX_CELLS) throw new Error('query_source_cell_limit');
}
