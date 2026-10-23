// STATUS: DIAMANT VGT SUPREME
// Bounded Structured Table CSV/TSV/JSON import plus local Database mapping.

import type { GridCell, GridStructuredTable } from '../../../../shared/contracts/grid/workspaceGrid';
import { toA1 } from '../../formulas/formula';
import { parseCoord } from '../../compat/gridUtils';
import { createStructuredTable } from '../gridStructuredTables';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_CELLS = 100_000;
const MAX_IMPORT_COLUMNS = 16_384;
const MAX_FIELD_LENGTH = 1_000_000;

export type GridTableInterchangeFormat = 'csv' | 'tsv' | 'json';

function ensureTextBounded(text: string): void {
  if (!text || new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error('table_import_size_limit');
}

function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  ensureTextBounded(text);
  const rows: string[][] = [];
  let parsedCellCount = 0;
  let row: string[] = [], field = '', quoted = false;
  const pushField = () => { if (field.length > MAX_FIELD_LENGTH) throw new Error('table_import_field_limit'); row.push(field); field = ''; };
  const pushRow = () => {
    pushField();
    if (row.length > MAX_IMPORT_COLUMNS) throw new Error('table_import_column_limit');
    if (row.length > 1 || row[0] !== '' || rows.length > 0) {
      parsedCellCount += row.length;
      if (parsedCellCount > MAX_IMPORT_CELLS) throw new Error('table_import_cell_limit');
      rows.push(row);
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; continue; }
      if (ch === '"') { quoted = false; continue; }
      field += ch; continue;
    }
    if (ch === '"' && field.length === 0) { quoted = true; continue; }
    if (ch === delimiter) { pushField(); continue; }
    if (ch === '\r' && text[i + 1] === '\n') { i++; pushRow(); continue; }
    if (ch === '\n' || ch === '\r') { pushRow(); continue; }
    field += ch;
  }
  if (quoted) throw new Error('table_import_unterminated_quote');
  if (field.length || row.length) pushRow();
  return rows;
}

function parseJsonRecords(text: string): string[][] {
  ensureTextBounded(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('table_import_json_invalid'); }
  if (!Array.isArray(parsed)) throw new Error('table_import_json_array_required');
  if (parsed.length === 0) return [];
  if (parsed.length * 1 > MAX_IMPORT_CELLS) throw new Error('table_import_cell_limit');
  const records = parsed as unknown[];
  if (!records.every((record) => record && typeof record === 'object' && !Array.isArray(record))) throw new Error('table_import_json_records_required');
  const headerSet = new Set<string>();
  for (const record of records as Array<Record<string, unknown>>) for (const key of Object.keys(record)) {
    if (headerSet.size >= MAX_IMPORT_COLUMNS && !headerSet.has(key)) throw new Error('table_import_column_limit');
    headerSet.add(key);
  }
  const headers = [...headerSet];
  if ((records.length + 1) * Math.max(1, headers.length) > MAX_IMPORT_CELLS) throw new Error('table_import_cell_limit');
  return [headers, ...(records as Array<Record<string, unknown>>).map((record) => headers.map((header) => {
    const value = record[header];
    return value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }))];
}

function inferValue(raw: string): GridCell['value'] {
  const value = raw.trim();
  if (value === '') return '';
  if (/^(true|false)$/i.test(value)) return value.toLocaleLowerCase() === 'true';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
    const numeric = Number(value); if (Number.isFinite(numeric)) return numeric;
  }
  return raw;
}

export function importStructuredTableData(
  text: string,
  format: GridTableInterchangeFormat,
  sheetId: string,
  anchor: string,
  existingTables: readonly GridStructuredTable[],
  existingCells: Record<string, GridCell>,
  name?: string
): { table: GridStructuredTable; updatedCells: Record<string, GridCell> } {
  const matrix = format === 'json' ? parseJsonRecords(text) : parseDelimited(text, format === 'csv' ? ',' : '\t');
  if (!matrix.length) throw new Error('table_import_empty');
  const width = Math.max(...matrix.map((row) => row.length));
  if (width <= 0 || matrix.length * width > MAX_IMPORT_CELLS) throw new Error('table_import_cell_limit');
  const origin = parseCoord(anchor);
  if (origin.rowIdx < 0 || origin.colIdx < 0 || origin.colIdx + width > MAX_IMPORT_COLUMNS) throw new Error('table_import_anchor_invalid');
  const updatedCells = { ...existingCells };
  matrix.forEach((row, rowOffset) => row.forEach((raw, colOffset) => {
    updatedCells[toA1(origin.colIdx + colOffset, origin.rowIdx + rowOffset)] = { value: inferValue(raw) };
  }));
  const end = toA1(origin.colIdx + width - 1, origin.rowIdx + matrix.length - 1);
  return createStructuredTable({ range: `${anchor.toUpperCase()}:${end}`, name, hasHeaders: true }, updatedCells, [...existingTables], sheetId);
}

export interface GridDatabaseTableMapping {
  tableId: string;
  tableName: string;
  primaryKeyCandidate?: string;
  fields: Array<{ name: string; type: 'number' | 'boolean' | 'string' }>;
  records: Array<Record<string, GridCell['value']>>;
}

export function buildStructuredTableDatabaseMapping(table: GridStructuredTable, cells: Record<string, GridCell>): GridDatabaseTableMapping {
  const bounds = (() => {
    const [start, end = start] = table.range.split(':');
    const a = parseCoord(start), b = parseCoord(end);
    if (a.rowIdx < 0 || b.rowIdx < 0) throw new Error('table_mapping_range_invalid');
    return { startCol: Math.min(a.colIdx,b.colIdx), endCol: Math.max(a.colIdx,b.colIdx), startRow: Math.min(a.rowIdx,b.rowIdx), endRow: Math.max(a.rowIdx,b.rowIdx) };
  })();
  const dataStart = table.hasHeaders ? bounds.startRow + 1 : bounds.startRow;
  const dataEnd = table.hasTotalsRow ? bounds.endRow - 1 : bounds.endRow;
  const rowCount = Math.max(0, dataEnd - dataStart + 1);
  if (rowCount * table.columns.length > MAX_IMPORT_CELLS) throw new Error('table_mapping_cell_limit');
  const records: Array<Record<string, GridCell['value']>> = [];
  for (let row = dataStart; row <= dataEnd; row++) {
    const record: Record<string, GridCell['value']> = {};
    table.columns.forEach((column, index) => { record[column.name] = cells[toA1(bounds.startCol + index, row)]?.value ?? null; });
    records.push(record);
  }
  const fields = table.columns.map((column, index) => {
    let type: 'number'|'boolean'|'string' = 'string';
    for (let row = dataStart; row <= dataEnd; row++) {
      const value = cells[toA1(bounds.startCol + index, row)]?.value;
      if (typeof value === 'number') { type = 'number'; break; }
      if (typeof value === 'boolean') type = 'boolean';
    }
    return { name: column.name, type };
  });
  const primaryKeyCandidate = fields.find((field) => field.name.toLocaleLowerCase() === 'id' || field.name.toLocaleLowerCase().endsWith('id'))?.name;
  return { tableId: table.id, tableName: table.name, primaryKeyCandidate, fields, records };
}
