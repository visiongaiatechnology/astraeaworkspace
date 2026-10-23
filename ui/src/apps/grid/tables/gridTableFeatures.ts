// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Table & Data Filtering Subsystems
// Calculated Column auto-propagation, Multi-key sort with custom lists, Filter Views, Slicers & Dataset Mappings

import { GridCell, GridStructuredTable, GridTableColumn, GridSlicerDefinition, GridNamedView } from '../../../shared/contracts/grid/workspaceGrid';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';
import { translateFormulaReferences } from '../formulas/gridFormulaReferences';
import { sha256GridHex } from '../security/gridWebCryptoIntegrity';
import { buildGridRowProjection } from './gridDataOperations';

export interface MultiKeySortLevel {
  column: string;
  direction: 'asc' | 'desc';
  sortBy?: 'value' | 'cell-color' | 'font-color' | 'icon';
  customList?: string[];
}

/**
 * Propagates a formula across all data rows of a structured table column.
 */
export function propagateColumnFormula(
  table: GridStructuredTable,
  columnName: string,
  baseFormula: string,
  cells: Record<string, GridCell>
): { updatedCells: Record<string, GridCell>; table: GridStructuredTable } {
  const bounds = parseGridRange(table.range);
  if (!bounds) return { updatedCells: cells, table };

  const colIdx = table.columns.findIndex((c) => c.name.toLowerCase() === columnName.toLowerCase());
  if (colIdx === -1) return { updatedCells: cells, table };

  const absCol = bounds.startCol + colIdx;
  const dataStartRow = table.hasHeaders ? bounds.startRow + 1 : bounds.startRow;
  const dataEndRow = table.hasTotalsRow ? bounds.endRow - 1 : bounds.endRow;

  const updated = { ...cells };
  for (let r = dataStartRow; r <= dataEndRow; r++) {
    const coord = toA1(absCol, r);
    // Relative formula translation from row dataStartRow to r
    const rowOffset = r - dataStartRow;
    const adjustedFormula = translateFormulaReferences(baseFormula, rowOffset, 0);
    updated[coord] = {
      ...(updated[coord] || {}),
      formula: adjustedFormula,
    };
  }

  const newColumns: GridTableColumn[] = table.columns.map((c, i) =>
    i === colIdx ? { ...c, calculatedFormula: baseFormula } : c
  );

  return {
    updatedCells: updated,
    table: { ...table, columns: newColumns },
  };
}

/**
 * Multi-key Sort supporting custom order lists and color matching
 */
export function multiKeySortRowIndices(
  dataRowIndices: number[],
  levels: MultiKeySortLevel[],
  cells: Record<string, GridCell>
): number[] {
  const getColIndex = (colStr: string): number => {
    const norm = colStr.toUpperCase().trim();
    let col = 0;
    for (let i = 0; i < norm.length; i++) {
      col = col * 26 + (norm.charCodeAt(i) - 64);
    }
    return col - 1;
  };

  return [...dataRowIndices].sort((aRow, bRow) => {
    for (const level of levels) {
      const col = getColIndex(level.column);
      const cellA = cells[toA1(col, aRow)];
      const cellB = cells[toA1(col, bRow)];

      if (level.sortBy === 'cell-color' || level.sortBy === 'font-color') {
        const propA = level.sortBy === 'cell-color' ? (cellA?.background || '') : (cellA?.text_color || '');
        const propB = level.sortBy === 'cell-color' ? (cellB?.background || '') : (cellB?.text_color || '');
        if (propA !== propB) {
          const cmp = propA.localeCompare(propB);
          return level.direction === 'asc' ? cmp : -cmp;
        }
        continue;
      }

      const valA = cellA?.value;
      const valB = cellB?.value;

      // Custom list sorting
      if (level.customList && level.customList.length > 0) {
        const list = level.customList.map((s) => s.toLowerCase());
        const idxA = list.indexOf(String(valA ?? '').toLowerCase());
        const idxB = list.indexOf(String(valB ?? '').toLowerCase());
        const effectiveA = idxA >= 0 ? idxA : list.length;
        const effectiveB = idxB >= 0 ? idxB : list.length;
        if (effectiveA !== effectiveB) {
          return level.direction === 'asc' ? effectiveA - effectiveB : effectiveB - effectiveA;
        }
      }

      // Standard numeric vs text sorting
      const numA = Number(valA);
      const numB = Number(valB);
      const isNumA = valA !== null && valA !== '' && !isNaN(numA);
      const isNumB = valB !== null && valB !== '' && !isNaN(numB);

      let cmp = 0;
      if (isNumA && isNumB) {
        cmp = numA - numB;
      } else {
        const strA = String(valA ?? '').toLowerCase();
        const strB = String(valB ?? '').toLowerCase();
        cmp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
      }

      if (cmp !== 0) {
        return level.direction === 'asc' ? cmp : -cmp;
      }
    }
    return aRow - bRow;
  });
}

/**
 * Filter Views: Non-destructive filtering & sorting state isolation
 */
export function applyNamedFilterView(
  view: GridNamedView,
  rowCount: number,
  cells: Record<string, GridCell>,
  headerRow = 0,
): number[] {
  return buildGridRowProjection(cells, rowCount, {
    filters: view.filters ?? [],
    sortRules: view.sort ?? [],
    headerRowIndex: headerRow,
  }) ?? [headerRow];
}

/**
 * Evaluates Slicers filtering: checks if a row matches all active slicer selections
 */
export function evaluateSlicers(
  slicers: GridSlicerDefinition[],
  rowIdx: number,
  cells: Record<string, GridCell>
): boolean {
  const getColIndex = (colStr: string): number => {
    const norm = colStr.toUpperCase().trim();
    let col = 0;
    for (let i = 0; i < norm.length; i++) {
      col = col * 26 + (norm.charCodeAt(i) - 64);
    }
    return col - 1;
  };

  for (const slicer of slicers) {
    if (!slicer.selectedValues || slicer.selectedValues.length === 0) continue;
    const col = getColIndex(slicer.column);
    const cellVal = String(cells[toA1(col, rowIdx)]?.value ?? '');
    if (!slicer.selectedValues.includes(cellVal)) {
      return false;
    }
  }
  return true;
}

/**
 * Exports Structured Table to tabular CSV/TSV/JSON records for Database mapping & Live Dataset
 */
export function exportTableData(
  table: GridStructuredTable,
  cells: Record<string, GridCell>,
  format: 'csv' | 'tsv' | 'json'
): string {
  const bounds = parseGridRange(table.range);
  if (!bounds) return '';

  const dataStartRow = table.hasHeaders ? bounds.startRow + 1 : bounds.startRow;
  const dataEndRow = table.hasTotalsRow ? bounds.endRow - 1 : bounds.endRow;
  const headers = table.columns.map((c) => c.name);

  if (format === 'json') {
    const records: Array<Record<string, unknown>> = [];
    for (let r = dataStartRow; r <= dataEndRow; r++) {
      const rec: Record<string, unknown> = {};
      table.columns.forEach((col, idx) => {
        const coord = toA1(bounds.startCol + idx, r);
        rec[col.name] = cells[coord]?.value ?? null;
      });
      records.push(rec);
    }
    return JSON.stringify(records, null, 2);
  }

  const delimiter = format === 'csv' ? ',' : '	';
  const rows: string[] = [];
  rows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(delimiter));

  for (let r = dataStartRow; r <= dataEndRow; r++) {
    const rowVals: string[] = [];
    for (let c = 0; c < table.columns.length; c++) {
      const coord = toA1(bounds.startCol + c, r);
      const val = String(cells[coord]?.value ?? '');
      rowVals.push(`"${val.replace(/"/g, '""')}"`);
    }
    rows.push(rowVals.join(delimiter));
  }

  return rows.join('\r\n');
}

/**
 * Table -> Live Workspace Dataset Mapping Token
 */
export async function createTableWorkspaceDataset(
  table: GridStructuredTable,
  cells: Record<string, GridCell>
): Promise<{
  datasetId: string;
  tableName: string;
  schema: Array<{ field: string; type: string }>;
  recordCount: number;
  records: Array<Record<string, unknown>>;
  syncDigest: string;
}> {
  const bounds = parseGridRange(table.range);
  if (!bounds) throw new Error('Invalid table range');
  const cellCount = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  if (cellCount <= 0 || cellCount > 100_000) throw new Error('table_dataset_range_limit');

  const dataStartRow = table.hasHeaders ? bounds.startRow + 1 : bounds.startRow;
  const dataEndRow = table.hasTotalsRow ? bounds.endRow - 1 : bounds.endRow;

  const records: Array<Record<string, unknown>> = [];
  for (let r = dataStartRow; r <= dataEndRow; r++) {
    const rec: Record<string, unknown> = {};
    table.columns.forEach((col, idx) => {
      const coord = toA1(bounds.startCol + idx, r);
      rec[col.name] = cells[coord]?.value ?? null;
    });
    records.push(rec);
  }

  const schema = table.columns.map((c, idx) => {
    const sampleVal = cells[toA1(bounds.startCol + idx, dataStartRow)]?.value;
    const type = typeof sampleVal === 'number' ? 'number' : typeof sampleVal === 'boolean' ? 'boolean' : 'string';
    return { field: c.name, type };
  });

  const payload = { datasetId: `ds-${table.id}`, tableName: table.name, schema, recordCount: records.length, records };
  const digest = await sha256GridHex(payload);
  return { ...payload, syncDigest: `sha256:${digest.digestHex}` };
}
