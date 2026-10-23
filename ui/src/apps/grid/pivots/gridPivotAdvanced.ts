// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Advanced Pivot & Data Model Subsystem
// Date/Number Binning, Drill-down to Source Records, Calculated Fields & Multi-Table Data Model Relationships

import { evaluateGridSafeExpression } from '../../../shared/expressions/gridSafeExpression';
import { GridCell, GridPivotDefinition, GridStructuredTable } from '../../../shared/contracts/grid/workspaceGrid';
import { parseGridRange } from '../compat/gridProfessional';
import { toA1 } from '../formulas/formula';

export type PivotDateGrouping = 'year' | 'quarter' | 'month' | 'day';

export interface PivotGroupingConfig {
  column: string;
  dateGrouping?: PivotDateGrouping;
  numberBinSize?: number;
  manualGroups?: Record<string, string>; // original -> groupName
}

export interface PivotCalculatedField {
  name: string;
  formula: string; // e.g. "Revenue - Cost" or "Sales * 0.2"
}

export interface DataModelRelationship {
  id: string;
  primaryTableId: string;
  primaryColumn: string;
  foreignTableId: string;
  foreignColumn: string;
}

export interface AdvancedPivotResult {
  headers: string[];
  rows: Array<{
    groupKey: string;
    metrics: Record<string, number>;
    sourceRecordRowIndices: number[];
  }>;
  totals: Record<string, number>;
}

/**
 * Transforms an individual cell value according to binning/grouping rules
 */
export function applyGroupingToValue(
  val: unknown,
  config?: PivotGroupingConfig
): string {
  if (val === null || val === undefined || val === '') return '(blank)';
  const str = String(val).trim();

  if (!config) return str;

  // Manual group override
  if (config.manualGroups && config.manualGroups[str]) {
    return config.manualGroups[str];
  }

  // Date binning
  if (config.dateGrouping) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      if (config.dateGrouping === 'year') return String(year);
      if (config.dateGrouping === 'quarter') {
        const q = Math.ceil(month / 3);
        return `${year}-Q${q}`;
      }
      if (config.dateGrouping === 'month') {
        const mm = month < 10 ? `0${month}` : `${month}`;
        return `${year}-${mm}`;
      }
      return d.toISOString().slice(0, 10);
    }
  }

  // Number binning
  if (config.numberBinSize && config.numberBinSize > 0) {
    const num = Number(str);
    if (!isNaN(num)) {
      const lower = Math.floor(num / config.numberBinSize) * config.numberBinSize;
      const upper = lower + config.numberBinSize;
      return `${lower} - ${upper}`;
    }
  }

  return str;
}

/**
 * Builds an advanced pivot result with grouping, drill-down source row tracking,
 * and calculated fields.
 */
export function buildAdvancedPivotResult(
  cells: Record<string, GridCell>,
  definition: GridPivotDefinition,
  groupingConfig?: PivotGroupingConfig,
  calculatedFields: PivotCalculatedField[] = []
): AdvancedPivotResult {
  const bounds = parseGridRange(definition.sourceRange);
  if (!bounds) throw new Error(`Invalid pivot source range: ${definition.sourceRange}`);

  const getColIndex = (colStr: string): number => {
    const norm = colStr.toUpperCase().trim();
    let col = 0;
    for (let i = 0; i < norm.length; i++) {
      col = col * 26 + (norm.charCodeAt(i) - 64);
    }
    return col - 1;
  };

  const rowCol = getColIndex(definition.rowColumn);
  const valCol = getColIndex(definition.valueColumn);

  // Grouping map
  const groups = new Map<
    string,
    {
      values: number[];
      rawRows: number[];
      distinct: Set<string>;
    }
  >();

  for (let r = bounds.startRow + 1; r <= bounds.endRow; r++) {
    const rawGroupVal = cells[toA1(rowCol, r)]?.value;
    const groupKey = applyGroupingToValue(rawGroupVal, groupingConfig);

    const rawVal = cells[toA1(valCol, r)]?.value;
    const num = Number(rawVal);
    const isNum = !isNaN(num) && rawVal !== null && rawVal !== '';

    let entry = groups.get(groupKey);
    if (!entry) {
      entry = { values: [], rawRows: [], distinct: new Set<string>() };
      groups.set(groupKey, entry);
    }

    entry.rawRows.push(r);
    if (rawVal !== undefined && rawVal !== null) {
      entry.distinct.add(String(rawVal));
    }
    if (isNum) {
      entry.values.push(num);
    }
  }

  const valueMetricName = `${definition.aggregation.toUpperCase()}(${definition.valueColumn})`;
  const headers = [definition.rowColumn, valueMetricName, ...calculatedFields.map((f) => f.name)];

  const rows: AdvancedPivotResult['rows'] = [];
  const totals: Record<string, number> = { [valueMetricName]: 0 };
  calculatedFields.forEach((cf) => {
    totals[cf.name] = 0;
  });

  let totalItemsCount = 0;

  for (const [groupKey, data] of groups.entries()) {
    let baseAgg = 0;
    const count = data.values.length;

    switch (definition.aggregation) {
      case 'count':
        baseAgg = data.rawRows.length;
        break;
      case 'distinct_count':
        baseAgg = data.distinct.size;
        break;
      case 'sum':
        baseAgg = data.values.reduce((a, b) => a + b, 0);
        break;
      case 'average':
        baseAgg = count > 0 ? data.values.reduce((a, b) => a + b, 0) / count : 0;
        break;
      case 'min':
        baseAgg = count > 0 ? Math.min(...data.values) : 0;
        break;
      case 'max':
        baseAgg = count > 0 ? Math.max(...data.values) : 0;
        break;
    }

    const metrics: Record<string, number> = {
      [valueMetricName]: Math.round(baseAgg * 1e8) / 1e8,
    };

    // Calculated fields use the bounded numeric expression engine; never JavaScript evaluation.
    for (const cf of calculatedFields) {
      try {
        const calcVal = evaluateGridSafeExpression(cf.formula, { [definition.valueColumn]: baseAgg, ...metrics });
        metrics[cf.name] = Math.round(calcVal * 1e8) / 1e8;
      } catch {
        metrics[cf.name] = 0;
      }
      totals[cf.name] += metrics[cf.name];
    }

    totals[valueMetricName] += metrics[valueMetricName];
    totalItemsCount += data.rawRows.length;

    rows.push({
      groupKey,
      metrics,
      sourceRecordRowIndices: data.rawRows,
    });
  }

  // Sort rows alphabetically by groupKey
  rows.sort((a, b) => a.groupKey.localeCompare(b.groupKey, undefined, { numeric: true, sensitivity: 'base' }));

  return {
    headers,
    rows,
    totals,
  };
}

/**
 * Drill-down: Extracts full source record rows for a specific pivot group key
 */
export function drillDownPivotSourceRecords(
  cells: Record<string, GridCell>,
  sourceRange: string,
  sourceRowIndices: number[]
): Array<Record<string, GridCell['value']>> {
  const bounds = parseGridRange(sourceRange);
  if (!bounds) return [];

  // Extract header names from startRow
  const headers: string[] = [];
  for (let c = bounds.startCol; c <= bounds.endCol; c++) {
    const val = cells[toA1(c, bounds.startRow)]?.value;
    headers.push(val !== undefined && val !== null ? String(val) : `Col${c + 1}`);
  }

  const records: Array<Record<string, GridCell['value']>> = [];
  for (const r of sourceRowIndices) {
    const rec: Record<string, GridCell['value']> = {};
    for (let c = bounds.startCol; c <= bounds.endCol; c++) {
      const h = headers[c - bounds.startCol];
      rec[h] = cells[toA1(c, r)]?.value ?? null;
    }
    records.push(rec);
  }

  return records;
}

/**
 * Relational Data Model: Joins records across two tables via relationship
 */
export function joinDataModelTables(
  primaryTable: GridStructuredTable,
  primaryCells: Record<string, GridCell>,
  foreignTable: GridStructuredTable,
  foreignCells: Record<string, GridCell>,
  relationship: DataModelRelationship
): Array<Record<string, unknown>> {
  const pBounds = parseGridRange(primaryTable.range);
  const fBounds = parseGridRange(foreignTable.range);
  if (!pBounds || !fBounds) return [];

  const pKeyCol = primaryTable.columns.findIndex(
    (c) => c.name.toLowerCase() === relationship.primaryColumn.toLowerCase()
  );
  const fKeyCol = foreignTable.columns.findIndex(
    (c) => c.name.toLowerCase() === relationship.foreignColumn.toLowerCase()
  );

  if (pKeyCol === -1 || fKeyCol === -1) return [];

  const pDataStart = primaryTable.hasHeaders ? pBounds.startRow + 1 : pBounds.startRow;
  const pDataEnd = primaryTable.hasTotalsRow ? pBounds.endRow - 1 : pBounds.endRow;

  const fDataStart = foreignTable.hasHeaders ? fBounds.startRow + 1 : fBounds.startRow;
  const fDataEnd = foreignTable.hasTotalsRow ? fBounds.endRow - 1 : fBounds.endRow;

  // Build index on foreign table
  const fIndex = new Map<string, Record<string, unknown>[]>();
  for (let r = fDataStart; r <= fDataEnd; r++) {
    const keyVal = String(foreignCells[toA1(fBounds.startCol + fKeyCol, r)]?.value ?? '');
    const rec: Record<string, unknown> = {};
    foreignTable.columns.forEach((col, idx) => {
      rec[`${foreignTable.name}.${col.name}`] = foreignCells[toA1(fBounds.startCol + idx, r)]?.value ?? null;
    });
    const list = fIndex.get(keyVal) ?? [];
    list.push(rec);
    fIndex.set(keyVal, list);
  }

  // Join
  const joined: Array<Record<string, unknown>> = [];
  for (let r = pDataStart; r <= pDataEnd; r++) {
    const pKeyVal = String(primaryCells[toA1(pBounds.startCol + pKeyCol, r)]?.value ?? '');
    const pRec: Record<string, unknown> = {};
    primaryTable.columns.forEach((col, idx) => {
      pRec[`${primaryTable.name}.${col.name}`] = primaryCells[toA1(pBounds.startCol + idx, r)]?.value ?? null;
    });

    const matches = fIndex.get(pKeyVal) || [{}];
    for (const m of matches) {
      joined.push({ ...pRec, ...m });
    }
  }

  return joined;
}
