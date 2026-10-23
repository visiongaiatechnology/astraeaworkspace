// STATUS: PLATIN — BATCH-INSIGHT-1: the visible pivot matrix must show numbers that exist.
//
// Counter-checked against the previous inline implementation (`InsightPivotTable.tsx:38-58` before
// BATCH-INSIGHT-1), which is re-implemented here as `legacyPivot` so that the defect is measured,
// not asserted. Measured defects of `legacyPivot`:
//  1. it summed already-aggregated cells into "Total (AVG)" / "Total (MIN)" / "Total (MAX)", so the
//     row total, column total and grand total were not any aggregate of the data;
//  2. it had no COUNT_DISTINCT branch, so that function silently produced 0 for every cell;
//  3. it rendered an empty group as 0 even for AVG/MIN/MAX, where no value exists at all.
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type AggregationFunction, type InsightRecord } from '../domain/types';
import { InsightError, aggregateInsightScalars } from '../core/insightCore';
import { PIVOT_LIMITS, buildInsightPivot, emptyGroupValue, pivotUnit, type InsightPivotConfig } from '../pivot/insightPivotCore';

const records = structuredClone(DEFAULT_INSIGHT_MODEL.records) as InsightRecord[];
const config: InsightPivotConfig = { rowDimension: 'region', colDimension: 'product', measure: 'revenue', aggFunc: 'SUM' };

/** The removed implementation, kept verbatim in behaviour so the old numbers stay reproducible. */
function legacyPivot(rows: readonly InsightRecord[], cfg: InsightPivotConfig) {
  const { rowDimension, colDimension, measure, aggFunc } = cfg;
  const rowValues = Array.from(new Set(rows.map((r) => String(r[rowDimension])))).sort();
  const colValues = Array.from(new Set(rows.map((r) => String(r[colDimension])))).sort();
  const matrix: Record<string, Record<string, number>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  for (const rVal of rowValues) {
    matrix[rVal] = {};
    for (const cVal of colValues) {
      const filtered = rows.filter((r) => String(r[rowDimension]) === rVal && String(r[colDimension]) === cVal);
      const values = filtered.map((r) => Number(r[measure]) || 0);
      let cellAgg = 0;
      if (values.length > 0) {
        if (aggFunc === 'SUM') cellAgg = values.reduce((a, b) => a + b, 0);
        else if (aggFunc === 'AVG') cellAgg = values.reduce((a, b) => a + b, 0) / values.length;
        else if (aggFunc === 'COUNT') cellAgg = values.length;
        else if (aggFunc === 'MAX') cellAgg = Math.max(...values);
        else if (aggFunc === 'MIN') cellAgg = Math.min(...values);
      }
      matrix[rVal][cVal] = cellAgg;
      rowTotals[rVal] = (rowTotals[rVal] || 0) + cellAgg;
      colTotals[cVal] = (colTotals[cVal] || 0) + cellAgg;
      grandTotal += cellAgg;
    }
  }
  return { rowValues, colValues, matrix, rowTotals, colTotals, grandTotal };
}

const sum = (rows: readonly InsightRecord[], pick: (row: InsightRecord) => number) => rows.reduce((total, row) => total + pick(row), 0);

describe('Insight pivot geometry (pure)', () => {
  it('reproduces the legacy SUM numbers exactly, so the new module is a drop-in for the correct case', () => {
    const legacy = legacyPivot(records, config);
    const next = buildInsightPivot(records, config);
    expect(next.rowValues).toEqual(legacy.rowValues);
    expect(next.colValues).toEqual(legacy.colValues);
    expect(next.matrix).toEqual(legacy.matrix);
    expect(next.rowTotals).toEqual(legacy.rowTotals);
    expect(next.colTotals).toEqual(legacy.colTotals);
    expect(next.grandTotal).toBe(legacy.grandTotal);
    expect(next.grandTotal).toBe(sum(records, (row) => row.revenue));
  });

  it('measures the legacy total defect and shows the corrected AVG row total', () => {
    const avgConfig = { ...config, aggFunc: 'AVG' } as const;
    const legacy = legacyPivot(records, avgConfig);
    const europeCentral = records.filter((row) => row.region === 'Europe-Central');
    const trueAverage = sum(europeCentral, (row) => row.revenue) / europeCentral.length;

    // The old number: the sum of the two per-cell averages (156500 + 111000).
    expect(legacy.rowTotals['Europe-Central']).toBe(267500);
    // The corrected number: the average over the four rows of that region.
    expect(trueAverage).toBe(133750);
    expect(buildInsightPivot(records, avgConfig).rowTotals['Europe-Central']).toBe(trueAverage);
    expect(buildInsightPivot(records, avgConfig).grandTotal).toBe(sum(records, (row) => row.revenue) / records.length);
    // The legacy grand total was the sum of all four cell averages, i.e. no aggregate of anything.
    expect(legacy.grandTotal).not.toBe(buildInsightPivot(records, avgConfig).grandTotal);
  });

  it('measures the legacy MAX/MIN total defect and shows the corrected extremes', () => {
    for (const aggFunc of ['MAX', 'MIN'] as const) {
      const cfg = { ...config, aggFunc } as const;
      const legacy = legacyPivot(records, cfg);
      const correct = buildInsightPivot(records, cfg);
      const central = records.filter((row) => row.region === 'Europe-Central').map((row) => row.revenue);
      expect(correct.rowTotals['Europe-Central']).toBe(aggFunc === 'MAX' ? Math.max(...central) : Math.min(...central));
      // Both legacy extremes were a SUM of per-cell extremes, so both were larger than any real
      // extreme of the group (MAX: 168000+124000, MIN: 98000+98000).
      expect(legacy.rowTotals['Europe-Central']).toBeGreaterThan(correct.rowTotals['Europe-Central'] as number);
    }
  });

  it('aggregates the same group with the same weight the query executor uses', () => {
    const values = [145000, 98000, null, 168000];
    for (const fn of ['SUM', 'COUNT', 'COUNT_DISTINCT', 'AVG', 'MIN', 'MAX'] as AggregationFunction[]) {
      expect(aggregateInsightScalars(values, fn)).toBe(
        fn === 'SUM' ? 411000 : fn === 'COUNT' ? 4 : fn === 'COUNT_DISTINCT' ? 4 : fn === 'AVG' ? 137000 : fn === 'MIN' ? 98000 : 168000,
      );
    }
    // COUNT_DISTINCT is not zero for a group that has rows (the removed pivot switch returned 0).
    const distinct = buildInsightPivot(records, { ...config, aggFunc: 'COUNT_DISTINCT' });
    expect(distinct.grandTotal).toBe(new Set(records.map((row) => row.revenue)).size);
  });

  it('never fabricates a value for a group that has no rows', () => {
    const avg = buildInsightPivot(records, { ...config, aggFunc: 'AVG' });
    // Europe-Central has no KeyVault row: there is no average, so there must be no number.
    expect(avg.matrix['Europe-Central']['KeyVault HSM Enclave']).toBeNull();
    expect(legacyPivot(records, { ...config, aggFunc: 'AVG' }).matrix['Europe-Central']['KeyVault HSM Enclave']).toBe(0);
    expect(emptyGroupValue('AVG')).toBeNull();
    expect(emptyGroupValue('MIN')).toBeNull();
    expect(emptyGroupValue('MAX')).toBeNull();
    // Counts and sums do have a defined value on an empty set: the additive identity.
    expect(emptyGroupValue('COUNT_DISTINCT')).toBe(0);
    expect(emptyGroupValue('SUM')).toBe(0);
    expect(emptyGroupValue('COUNT')).toBe(0);
    expect(buildInsightPivot(records, config).matrix['Europe-Central']['KeyVault HSM Enclave']).toBe(0);
  });

  it('reads every record exactly once (single pass), unlike the removed quadratic filter loop', () => {
    let legacyReads = 0;
    const counting = records.map((row) => {
      const copy = { ...row } as InsightRecord;
      for (const field of ['region', 'product', 'revenue'] as const) {
        const value = copy[field];
        Object.defineProperty(copy, field, { get() { legacyReads += 1; return value; }, enumerable: true });
      }
      return copy;
    });
    buildInsightPivot(counting, config);
    expect(legacyReads).toBe(counting.length * 3);
  });

  it('rejects an oversized matrix by naming the limit instead of truncating silently', () => {
    const wide: InsightRecord[] = [];
    const groups = Math.ceil(Math.sqrt(PIVOT_LIMITS.maxCells)) + 2;
    for (let i = 0; i < groups; i += 1) {
      wide.push({ ...records[0], id: `r-${i}`, region: `Region-${i}`, product: `Product-${i}` });
    }
    expect(() => buildInsightPivot(wide, config)).toThrowError(InsightError);
    expect(() => buildInsightPivot(wide, config)).toThrowError('insight-pivot-cell-limit');
    expect(() => buildInsightPivot(records, config, { maxCells: 1, maxGroups: PIVOT_LIMITS.maxGroups })).toThrowError('insight-pivot-cell-limit');
  });

  it('derives the unit from the aggregation, never from the measure alone', () => {
    expect(pivotUnit('revenue', 'SUM')).toBe('currency');
    expect(pivotUnit('revenue', 'COUNT')).toBe('count');
    expect(pivotUnit('cost', 'COUNT_DISTINCT')).toBe('count');
    expect(pivotUnit('activeUsers', 'SUM')).toBe('count');
    expect(pivotUnit('activeUsers', 'AVG')).toBe('count');
  });

  it('fails closed on an aggregation function it does not implement', () => {
    expect(() => aggregateInsightScalars([1, 2], 'MEDIAN' as AggregationFunction)).toThrowError('insight-aggregate-invalid');
    expect(() => buildInsightPivot(records, { ...config, aggFunc: 'MEDIAN' as AggregationFunction })).toThrowError('insight-aggregate-invalid');
  });
});
