// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Structured Tables Engine
// Table Creation (Ctrl+T), Totals Row Aggregations, Auto-Expansion, Structured Reference Resolution

import { GridCell, GridStructuredTable, GridTableColumn } from '../../../shared/contracts/grid/workspaceGrid';
import { parseA1, toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';
import { parseCoord } from '../compat/gridUtils';

export interface CreateTableOptions {
  range: string;
  name?: string;
  hasHeaders?: boolean;
  hasTotalsRow?: boolean;
  styleTheme?: 'blue' | 'dark' | 'emerald' | 'purple' | 'amber';
}

const MAX_TABLE_CELLS = 100_000;
const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const CELL_REF_RE = /^\$?[A-Za-z]{1,3}\$?[1-9]\d*$/;

function boundedTableRange(range: string) {
  const bounds = parseGridRange(range.toUpperCase());
  if (!bounds) throw new Error('Invalid table range');
  const cellCount = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  if (cellCount <= 0 || cellCount > MAX_TABLE_CELLS) throw new Error('Table range exceeds bounded cell limit');
  return bounds;
}

export function normalizeStructuredTableName(name: string, existingTables: readonly GridStructuredTable[], currentId?: string): string {
  const trimmed = name.trim();
  if (!TABLE_NAME_RE.test(trimmed) || CELL_REF_RE.test(trimmed)) throw new Error('Invalid table name');
  if (existingTables.some((table) => table.id !== currentId && table.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error('Table name already exists');
  return trimmed;
}

function uniqueColumnName(raw: string, used: Set<string>, fallback: string): string {
  const base = (raw.trim() || fallback).slice(0, 96);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase())) candidate = `${base.slice(0, 88)}_${suffix++}`;
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

function totalFormulaName(fn: GridTableColumn['totalFunction']): string | null {
  switch (fn) {
    case 'sum': return 'SUM';
    case 'count': return 'COUNT';
    case 'average': return 'AVERAGE';
    case 'min': return 'MIN';
    case 'max': return 'MAX';
    case 'stdDev': return 'STDEV.S';
    case 'var': return 'VAR.S';
    default: return null;
  }
}

function writeTotalsRow(table: GridStructuredTable, updated: Record<string, GridCell>, bounds: ReturnType<typeof boundedTableRange>): void {
  const totalsRow = bounds.endRow;
  const dataStartRow = table.hasHeaders ? bounds.startRow + 1 : bounds.startRow;
  const dataEndRow = Math.max(dataStartRow, totalsRow - 1);
  for (let c = bounds.startCol; c <= bounds.endCol; c++) {
    const coord = toA1(c, totalsRow);
    const col = table.columns[c - bounds.startCol];
    if (c === bounds.startCol && (!col || col.totalFunction === 'none')) { updated[coord] = { value: 'Total', bold: true }; continue; }
    const fn = totalFormulaName(col?.totalFunction);
    updated[coord] = fn
      ? { ...(updated[coord] ?? {}), value: 0, formula: `=${fn}(${toA1(c, dataStartRow)}:${toA1(c, dataEndRow)})`, bold: true }
      : { ...(updated[coord] ?? {}), value: '', formula: undefined, bold: true };
  }
}

function buildTotalsRow(table: GridStructuredTable, cells: Record<string, GridCell>, bounds: ReturnType<typeof boundedTableRange>): Record<string, GridCell> {
  const updated = { ...cells };
  writeTotalsRow(table, updated, bounds);
  return updated;
}

export function createStructuredTable(
  options: CreateTableOptions,
  cells: Record<string, GridCell>,
  existingTables: GridStructuredTable[],
  sheetId: string
): { table: GridStructuredTable; updatedCells: Record<string, GridCell> } {
  const bounds = boundedTableRange(options.range);
  const overlaps = existingTables.some((table) => {
    const other = parseGridRange(table.range);
    return !!other && !(bounds.endRow < other.startRow || bounds.startRow > other.endRow || bounds.endCol < other.startCol || bounds.startCol > other.endCol);
  });
  if (overlaps) throw new Error('Structured tables cannot overlap');

  const tableCount = existingTables.length + 1;
  const name = normalizeStructuredTableName(options.name || `Table${tableCount}`, existingTables);
  const hasHeaders = options.hasHeaders ?? true;
  const hasTotalsRow = options.hasTotalsRow ?? false;
  const styleTheme = options.styleTheme ?? 'blue';

  const columns: GridTableColumn[] = [];
  const updated: Record<string, GridCell> = { ...cells };
  const usedHeaders = new Set<string>();

  // 1. Detect or generate unique column names
  for (let c = bounds.startCol; c <= bounds.endCol; c++) {
    let colName = `Column${c - bounds.startCol + 1}`;
    if (hasHeaders) {
      const headerCoord = toA1(c, bounds.startRow);
      const existingVal = cells[headerCoord]?.value;
      if (existingVal !== undefined && existingVal !== null && existingVal !== '') {
        colName = String(existingVal);
      }
      colName = uniqueColumnName(colName, usedHeaders, `Column${c - bounds.startCol + 1}`);
      updated[headerCoord] = { ...updated[headerCoord], value: colName, bold: true };
    } else {
      colName = uniqueColumnName(colName, usedHeaders, colName);
    }
    let numericSeen = false;
    const sampleStart = hasHeaders ? bounds.startRow + 1 : bounds.startRow;
    for (let r = sampleStart; r <= bounds.endRow; r++) { if (typeof cells[toA1(c, r)]?.value === 'number') { numericSeen = true; break; } }
    columns.push({ name: colName, totalFunction: numericSeen ? 'sum' : 'none' });
  }

  const table: GridStructuredTable = {
    id: createGridSecureId('table'),
    name,
    sheetId,
    range: options.range,
    hasHeaders,
    hasTotalsRow,
    styleTheme,
    columns,
  };

  // 2. If totals row is requested, extend the range and generate functions from column policy.
  if (hasTotalsRow) {
    const totalsRow = bounds.endRow + 1;
    table.range = `${toA1(bounds.startCol, bounds.startRow)}:${toA1(bounds.endCol, totalsRow)}`;
    return { table, updatedCells: buildTotalsRow(table, updated, boundedTableRange(table.range)) };
  }

  return { table, updatedCells: updated };
}

export function toggleTableTotalsRow(
  table: GridStructuredTable,
  cells: Record<string, GridCell>
): { table: GridStructuredTable; updatedCells: Record<string, GridCell> } {
  const bounds = boundedTableRange(table.range);
  if (!table.hasTotalsRow) {
    const newEndRow = bounds.endRow + 1;
    const next = { ...table, hasTotalsRow: true, range: `${toA1(bounds.startCol, bounds.startRow)}:${toA1(bounds.endCol, newEndRow)}` };
    return { table: next, updatedCells: buildTotalsRow(next, cells, boundedTableRange(next.range)) };
  }
  const updated = { ...cells };
  for (let c = bounds.startCol; c <= bounds.endCol; c++) delete updated[toA1(c, bounds.endRow)];
  const newEndRow = Math.max(bounds.startRow, bounds.endRow - 1);
  return { table: { ...table, hasTotalsRow: false, range: `${toA1(bounds.startCol, bounds.startRow)}:${toA1(bounds.endCol, newEndRow)}` }, updatedCells: updated };
}

export function setStructuredTableTotalFunction(
  table: GridStructuredTable,
  columnName: string,
  fn: GridTableColumn['totalFunction'],
  cells: Record<string, GridCell>
): { table: GridStructuredTable; updatedCells: Record<string, GridCell> } {
  const columns = table.columns.map((column) => column.name.toLocaleLowerCase() === columnName.toLocaleLowerCase() ? { ...column, totalFunction: fn } : column);
  const next = { ...table, columns };
  if (!table.hasTotalsRow) return { table: next, updatedCells: cells };
  return { table: next, updatedCells: buildTotalsRow(next, cells, boundedTableRange(next.range)) };
}

export function renameStructuredTable(table: GridStructuredTable, name: string, tables: readonly GridStructuredTable[]): GridStructuredTable {
  return { ...table, name: normalizeStructuredTableName(name, tables, table.id) };
}

export function autoExpandStructuredTables(
  tables: readonly GridStructuredTable[],
  cells: Record<string, GridCell>,
  editedCoord: string
): { tables: GridStructuredTable[]; cells: Record<string, GridCell> } {
  return autoExpandStructuredTablesForEdits(tables, cells, [{ coord: editedCoord }]);
}

export function autoExpandStructuredTablesForEdits(
  tables: readonly GridStructuredTable[],
  cells: Record<string, GridCell>,
  edits: readonly { coord: string; cell?: GridCell }[],
): { tables: GridStructuredTable[]; cells: Record<string, GridCell> } {
  const updatedCells = { ...cells };
  const nextTables = tables.map((table) => ({ ...table }));

  for (const edit of edits) {
    const editedCoord = edit.coord.toUpperCase();
    if (edit.cell) updatedCells[editedCoord] = edit.cell;
    const edited = parseCoord(editedCoord);
    if (edited.rowIdx < 0 || edited.colIdx < 0) continue;

    for (let tableIndex = 0; tableIndex < nextTables.length; tableIndex++) {
      const table = nextTables[tableIndex];
      const bounds = boundedTableRange(table.range);
      const dataEnd = table.hasTotalsRow ? bounds.endRow - 1 : bounds.endRow;

      if (edited.rowIdx === dataEnd + 1 && edited.colIdx >= bounds.startCol && edited.colIdx <= bounds.endCol) {
        if (!table.hasTotalsRow) {
          nextTables[tableIndex] = { ...table, range: `${toA1(bounds.startCol, bounds.startRow)}:${toA1(bounds.endCol, bounds.endRow + 1)}` };
          continue;
        }
        const oldTotalsRow = bounds.endRow;
        const newTotalsRow = oldTotalsRow + 1;
        for (let col = bounds.startCol; col <= bounds.endCol; col++) {
          const oldCoord = toA1(col, oldTotalsRow);
          const newCoord = toA1(col, newTotalsRow);
          if (updatedCells[oldCoord]) updatedCells[newCoord] = { ...updatedCells[oldCoord] };
          if (oldCoord !== editedCoord) delete updatedCells[oldCoord];
        }
        const expanded = { ...table, range: `${toA1(bounds.startCol, bounds.startRow)}:${toA1(bounds.endCol, newTotalsRow)}` };
        nextTables[tableIndex] = expanded;
        writeTotalsRow(expanded, updatedCells, boundedTableRange(expanded.range));
        continue;
      }

      if (edited.colIdx === bounds.endCol + 1 && edited.rowIdx >= bounds.startRow && edited.rowIdx <= dataEnd) {
        const newColumnName = uniqueColumnName(String(updatedCells[toA1(edited.colIdx, bounds.startRow)]?.value ?? `Column${table.columns.length + 1}`), new Set(table.columns.map((column) => column.name.toLocaleLowerCase())), `Column${table.columns.length + 1}`);
        const columns = [...table.columns, { name: newColumnName, totalFunction: 'none' as const }];
        const expanded = { ...table, columns, range: `${toA1(bounds.startCol, bounds.startRow)}:${toA1(edited.colIdx, bounds.endRow)}` };
        nextTables[tableIndex] = expanded;
        if (table.hasHeaders) updatedCells[toA1(edited.colIdx, bounds.startRow)] = { ...(updatedCells[toA1(edited.colIdx, bounds.startRow)] ?? {}), value: newColumnName, bold: true };
        if (table.hasTotalsRow) writeTotalsRow(expanded, updatedCells, boundedTableRange(expanded.range));
      }
    }
  }
  return { tables: nextTables, cells: updatedCells };
}

/**
 * Resolves structured references like Table1[Column1], Table1[@Column1], Table1[#Totals]
 * into standard A1 range notation.
 */
export function resolveStructuredReference(
  ref: string,
  tables: GridStructuredTable[],
  currentCoord?: string
): string | null {
  const match = ref.match(/^([A-Za-z0-9_]+)\[(.*)\]$/);
  if (!match) return null;

  const tableName = match[1];
  const specifier = match[2].trim();

  const table = tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
  if (!table) return null;

  const bounds = parseGridRange(table.range);
  if (!bounds) return null;

  const dataStartRow = table.hasHeaders ? bounds.startRow + 1 : bounds.startRow;
  const dataEndRow = table.hasTotalsRow ? bounds.endRow - 1 : bounds.endRow;

  // 1. Full Table: Table1[#All]
  if (specifier === '#All') {
    return table.range;
  }

  // 2. Data only: Table1[#Data]
  if (specifier === '#Data') {
    return `${toA1(bounds.startCol, dataStartRow)}:${toA1(bounds.endCol, dataEndRow)}`;
  }

  // 3. Headers: Table1[#Headers]
  if (specifier === '#Headers') {
    return `${toA1(bounds.startCol, bounds.startRow)}:${toA1(bounds.endCol, bounds.startRow)}`;
  }

  // 4. Totals: Table1[#Totals]
  if (specifier === '#Totals') {
    if (!table.hasTotalsRow) return null;
    return `${toA1(bounds.startCol, bounds.endRow)}:${toA1(bounds.endCol, bounds.endRow)}`;
  }

  // 5. This Row specifier: Table1[@ColumnName]
  if (specifier.startsWith('@')) {
    const colName = specifier.slice(1).trim();
    const colIdx = table.columns.findIndex((c) => c.name.toLowerCase() === colName.toLowerCase());
    if (colIdx === -1) return null;
    const col = bounds.startCol + colIdx;

    let targetRow = dataStartRow;
    if (currentCoord) {
      const current = parseA1(currentCoord);
      if (current) targetRow = current.row;
    }
    return toA1(col, targetRow);
  }

  // 6. Named column range: Table1[ColumnName]
  const colIdx = table.columns.findIndex((c) => c.name.toLowerCase() === specifier.toLowerCase());
  if (colIdx !== -1) {
    const col = bounds.startCol + colIdx;
    return `${toA1(col, dataStartRow)}:${toA1(col, dataEndRow)}`;
  }

  return null;
}

/**
 * Rewrites structured table references to bounded A1 references before formula
 * evaluation. Quoted strings are never rewritten. Unknown table/column references
 * fail closed as #REF! rather than becoming accidental names.
 */
export function resolveStructuredReferencesInFormula(
  formula: string,
  tables: GridStructuredTable[],
  currentCoord?: string
): string {
  if (!formula.includes('[') || tables.length === 0) return formula;
  let out = '';
  let chunk = '';
  let inQuote = false;
  const flush = () => {
    if (!chunk) return;
    out += chunk.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\[([^\]\r\n]{1,128})\]/g, (full) => {
      return resolveStructuredReference(full, tables, currentCoord) ?? '#REF!';
    });
    chunk = '';
  };
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '"') {
      if (inQuote && formula[i + 1] === '"') {
        if (inQuote) out += '""'; else chunk += '""';
        i++;
        continue;
      }
      if (!inQuote) { flush(); out += ch; inQuote = true; }
      else { out += ch; inQuote = false; }
      continue;
    }
    if (inQuote) out += ch; else chunk += ch;
  }
  flush();
  return out;
}
