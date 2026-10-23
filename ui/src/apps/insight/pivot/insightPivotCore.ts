// STATUS: PLATIN — BATCH-INSIGHT-1: single-pass pivot geometry for the visible Insight matrix.
//
// MEASURED FACTS this module replaces (proof: `components/InsightPivotTable.tsx:38-58` before
// BATCH-INSIGHT-1, reproduced as `legacyPivot` in testing/insightPivotCore.test.ts):
//  - The matrix was built by filtering the whole record array once per (row, column) cell, i.e.
//    rows × groups² row visits for a sparse matrix.
//  - "Total (AVG)", "Total (MIN)" and "Total (MAX)" summed already-aggregated cells, so those
//    totals were not an aggregate of the data at all.
//  - A group without rows was rendered as 0 even for AVG/MIN/MAX, where no value exists.
//  - COUNT_DISTINCT was missing from the switch and silently produced 0.
// All four are fixed here; every number the matrix shows now comes from `aggregateInsightScalars`
// over the rows that are really in that group.
import type { AggregationFunction, InsightRecord, InsightScalar } from '../domain/types';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { InsightError, aggregateInsightScalars } from '../core/insightCore';
import { formatInsightUsd } from '../interactions/insightCrossFilter';

export const PIVOT_LIMITS = { maxCells: 100_000, maxGroups: 4_096 } as const;

/** The aggregation functions the matrix offers. One list for buttons, model validation and tests. */
export const PIVOT_AGGREGATIONS: readonly AggregationFunction[] = ['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX'];

export interface InsightPivotLimits { readonly maxCells: number; readonly maxGroups: number; }
export interface InsightPivotConfig {
  readonly rowDimension: keyof InsightRecord;
  readonly colDimension: keyof InsightRecord;
  readonly measure: 'revenue' | 'cost' | 'activeUsers';
  readonly aggFunc: AggregationFunction;
}
/** `null` is "no rows in this group" — a real absence, not the number zero. */
export type InsightPivotCell = number | null;
export interface InsightPivotResult {
  readonly rowValues: string[];
  readonly colValues: string[];
  readonly matrix: Record<string, Record<string, InsightPivotCell>>;
  readonly rowTotals: Record<string, InsightPivotCell>;
  readonly colTotals: Record<string, InsightPivotCell>;
  readonly grandTotal: InsightPivotCell;
  /** Rows really visited. Equals `records.length` — the single-pass proof. */
  readonly scannedRows: number;
}

export type InsightPivotUnit = 'currency' | 'count';

/**
 * The value of a group that contains no rows. Counts and sums have an additive identity (0);
 * averages and extremes do not exist, so they stay absent instead of becoming a plausible 0.
 */
export function emptyGroupValue(fn: AggregationFunction): InsightPivotCell {
  if (fn === 'AVG' || fn === 'MIN' || fn === 'MAX') return null;
  if (fn === 'COUNT' || fn === 'COUNT_DISTINCT' || fn === 'SUM') return 0;
  throw new InsightError('insight-aggregate-invalid');
}

/** Unit of a displayed cell: derived from the aggregation first, then from the measure. */
export function pivotUnit(measure: InsightPivotConfig['measure'], fn: AggregationFunction): InsightPivotUnit {
  if (fn === 'COUNT' || fn === 'COUNT_DISTINCT') return 'count';
  return measure === 'activeUsers' ? 'count' : 'currency';
}

export function formatPivotValue(value: InsightPivotCell, unit: InsightPivotUnit, locale: WorkspaceLocale, emptyLabel: string): string {
  if (value === null) return emptyLabel;
  return unit === 'count' ? Math.round(value).toLocaleString(locale) : formatInsightUsd(value, locale);
}

export function buildInsightPivot(
  records: readonly InsightRecord[],
  config: InsightPivotConfig,
  limits: InsightPivotLimits = PIVOT_LIMITS,
): InsightPivotResult {
  const { rowDimension, colDimension, measure, aggFunc } = config;
  const cellValues = new Map<string, InsightScalar[]>();
  const rowGroups = new Map<string, InsightScalar[]>();
  const colGroups = new Map<string, InsightScalar[]>();
  const all: InsightScalar[] = [];

  // One pass over the records: three reads per row (row key, column key, measure) and no re-scan.
  for (const record of records) {
    const rowKey = String(record[rowDimension]);
    const colKey = String(record[colDimension]);
    const value: InsightScalar = record[measure];
    const cellKey = `${rowKey}\u0000${colKey}`;
    const cell = cellValues.get(cellKey);
    if (cell) cell.push(value); else cellValues.set(cellKey, [value]);
    const rowGroup = rowGroups.get(rowKey);
    if (rowGroup) rowGroup.push(value); else rowGroups.set(rowKey, [value]);
    const colGroup = colGroups.get(colKey);
    if (colGroup) colGroup.push(value); else colGroups.set(colKey, [value]);
    all.push(value);
  }

  const rowValues = [...rowGroups.keys()].sort();
  const colValues = [...colGroups.keys()].sort();
  if (rowValues.length > limits.maxGroups || colValues.length > limits.maxGroups) throw new InsightError('insight-pivot-group-limit');
  if (rowValues.length * colValues.length > limits.maxCells) throw new InsightError('insight-pivot-cell-limit');

  const matrix: Record<string, Record<string, InsightPivotCell>> = {};
  const rowTotals: Record<string, InsightPivotCell> = {};
  const colTotals: Record<string, InsightPivotCell> = {};
  for (const rowKey of rowValues) {
    const line: Record<string, InsightPivotCell> = {};
    for (const colKey of colValues) {
      const cell = cellValues.get(`${rowKey}\u0000${colKey}`);
      line[colKey] = cell ? aggregateInsightScalars(cell, aggFunc) : emptyGroupValue(aggFunc);
    }
    matrix[rowKey] = line;
  }
  // Totals are aggregates of the rows in that group — never a sum of already-aggregated cells.
  for (const rowKey of rowValues) rowTotals[rowKey] = aggregateInsightScalars(rowGroups.get(rowKey)!, aggFunc);
  for (const colKey of colValues) colTotals[colKey] = aggregateInsightScalars(colGroups.get(colKey)!, aggFunc);
  const grandTotal = all.length ? aggregateInsightScalars(all, aggFunc) : emptyGroupValue(aggFunc);

  return { rowValues, colValues, matrix, rowTotals, colTotals, grandTotal, scannedRows: records.length };
}
