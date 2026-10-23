// STATUS: DIAMANT VGT SUPREME
// Bounded CSV -> query table adapter.
//
// The previous implementation split each line with `/[ ,;\t]/`, which (a) had no byte, row, column,
// cell or regex budget at all and (b) produced wrong columns for any quoted field containing the
// delimiter. It now reuses the bounded RFC 4180 scanner and keeps the documented type inference
// contract (numeric columns become numbers), while explicitly refusing to destroy leading zeros.
import type { QueryColumn, QueryValue } from './gridPowerQueryEngine';
import {
  assertQueryMatrixBounds,
  assertQueryTextBytes,
  GRID_QUERY_MAX_CELL_CHARS,
  GRID_QUERY_MAX_COLUMNS,
  GRID_QUERY_MAX_ROWS,
  GRID_QUERY_MAX_SOURCE_BYTES,
} from './gridQueryLimits';
import { scanGridDelimitedRows } from '../interchange/gridDelimitedImport';

const LEADING_ZERO = /^-?0\d/u;
const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u;

function sniffQueryDelimiter(firstLine: string): string {
  if (firstLine.includes('\t')) return '\t';
  if (firstLine.includes(';') && !firstLine.includes(',')) return ';';
  return ',';
}

export function parseCsvToQueryTable(csvContent: string): { columns: QueryColumn[]; rows: QueryValue[][] } {
  assertQueryTextBytes(csvContent);
  if (csvContent.length > GRID_QUERY_MAX_SOURCE_BYTES * 4) throw new Error('query_source_size_limit');
  const firstLine = csvContent.split(/\r\n|\n|\r/u, 1)[0] ?? '';
  const delimiter = sniffQueryDelimiter(firstLine);
  let scanned;
  try {
    scanned = scanGridDelimitedRows(csvContent, delimiter, GRID_QUERY_MAX_ROWS + 1, GRID_QUERY_MAX_COLUMNS);
  } catch (reason) {
    // Normalise the shared scanner vocabulary to this module's contract.
    const message = reason instanceof Error ? reason.message : '';
    if (message === 'grid_import_column_limit') throw new Error('query_source_column_limit');
    if (message === 'grid_import_cell_limit') throw new Error('query_source_cell_limit');
    throw reason;
  }
  if (scanned.unclosedQuote) throw new Error('query_csv_unclosed_quote');
  if (scanned.truncated) throw new Error('query_source_row_limit');

  const nonEmpty = scanned.rows.filter((row) => row.fields.some((value) => value !== ''));
  if (nonEmpty.length === 0) return { columns: [], rows: [] };

  const headers = nonEmpty[0]!.fields.map((value, index) => {
    const name = value.trim().replace(/^["']|["']$/gu, '');
    return (name || `Column${index + 1}`).slice(0, 256);
  });
  let width = headers.length;
  for (const row of nonEmpty) width = Math.max(width, row.fields.length);
  if (width > GRID_QUERY_MAX_COLUMNS) throw new Error('query_source_column_limit');
  const boundedHeaders = Array.from({ length: width }, (_, index) => headers[index] ?? `Column${index + 1}`);
  assertQueryMatrixBounds(nonEmpty.length - 1, width);

  let totalTextChars = 0;
  const rows: QueryValue[][] = nonEmpty.slice(1).map((row) => Array.from({ length: width }, (_, index) => {
    const raw = row.fields[index] ?? '';
    if (raw.length > GRID_QUERY_MAX_CELL_CHARS) throw new Error('query_source_cell_limit');
    totalTextChars += raw.length;
    if (totalTextChars > GRID_QUERY_MAX_SOURCE_BYTES) throw new Error('query_source_table_text_limit');
    return raw;
  }));

  const columns: QueryColumn[] = boundedHeaders.map((name, index) => {
    const values = rows.map((row) => row[index]).filter((value): value is string => typeof value === 'string' && value.trim() !== '');
    // Leading zeros are significant: "00123" must never be typed as the number 123.
    const protectedLeadingZeros = values.some((value) => LEADING_ZERO.test(value.trim()));
    const allNumbers = !protectedLeadingZeros && values.length > 0 && values.every((value) => NUMERIC.test(value.trim()));
    if (!allNumbers) return { name, type: 'text' };
    return { name, type: 'number' };
  });

  for (let index = 0; index < columns.length; index += 1) {
    if (columns[index]!.type !== 'number') continue;
    for (const row of rows) {
      const raw = row[index];
      if (typeof raw !== 'string' || raw.trim() === '') continue;
      row[index] = Number(raw);
    }
  }

  return { columns, rows };
}
