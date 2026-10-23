// STATUS: PLATIN - hand-written oracles for the bounded Data-View Projection Planner.
//
// Row indices in this suite are 0-based worksheet indices, exactly like the
// values `parseCoord` returns and `toA1` accepts: source row 1 addresses
// worksheet row "A2". The fixture therefore carries (Region, Revenue) =
// (West,100), (East,200), (West,300), (East,50), (West,300) in source rows 0..4
// and the identity order is [0, 1, 2, 3, 4].

import { describe, expect, it } from 'vitest';
import type { GridCell, GridFilterRule, GridSortRule } from '../../../../shared/contracts/grid/workspaceGrid';
import {
  MAX_SORT_LEVELS,
  planGridProjection,
  projectionPreservesSourceRows,
  resetGridProjection,
  decidingSortLevel,
  validateProjectionRequest,
} from '../../data/gridDataProjection';

const FIXTURE: Record<string, GridCell> = {
  A1: { value: 'West' }, B1: { value: 100 },
  A2: { value: 'East' }, B2: { value: 200 },
  A3: { value: 'West' }, B3: { value: 300 },
  A4: { value: 'East' }, B4: { value: 50 },
  A5: { value: 'West' }, B5: { value: 300 },
};

const SOURCE_ROWS = [0, 1, 2, 3, 4];

const region = (direction: 'asc' | 'desc'): GridSortRule => ({ column: 'A', direction });
const revenue = (direction: 'asc' | 'desc'): GridSortRule => ({ column: 'B', direction });

function visible(source: Record<string, GridCell> = FIXTURE, sortRules: GridSortRule[] = [], filters: GridFilterRule[] = []): number[] {
  const result = planGridProjection({ cells: source, sourceRowIndices: SOURCE_ROWS, sortRules, filters, columnCount: 2 });
  if (!result.ok) throw new Error(`unexpected rejection: ${JSON.stringify(result.issues)}`);
  return [...result.projection.orderedRowIndices];
}

describe('Grid Data-View Projection Planner - multi-level sort', () => {
  it('orders by region ascending, then revenue descending, keeping whole rows together', () => {
    const result = planGridProjection({
      cells: FIXTURE,
      sourceRowIndices: SOURCE_ROWS,
      sortRules: [region('asc'), revenue('desc')],
      columnCount: 2,
    });
    if (!result.ok) throw new Error('expected an accepted projection');

    expect(result.projection.orderedRowIndices).toEqual([1, 3, 2, 4, 0]);
    // Row integrity: each projected row carries its full source record.
    const east200 = result.projection.visibleRows[0];
    expect(east200.sourceRowIndex).toBe(1);
    expect(east200.cells.A2?.value).toBe('East');
    expect(east200.cells.B2?.value).toBe(200);
    expect(result.projection.headerRowIndex).toBe(0);
    expect(result.projection.dataLoss).toBe(false);
    expect(result.projection.accountedSourceRows).toBe(SOURCE_ROWS.length);
  });

  it('is stable: rows with identical keys keep their original worksheet order', () => {
    // Source rows 2 and 4 are fully tied (West/300). Both directions must keep 2 before 4.
    expect(visible(FIXTURE, [region('asc'), revenue('desc')])).toEqual([1, 3, 2, 4, 0]);
    expect(visible(FIXTURE, [region('desc'), revenue('asc')])).toEqual([0, 2, 4, 3, 1]);
  });

  it('sorts blanks to the end in both directions and leaves empty cells intact', () => {
    const cells: Record<string, GridCell> = {
      A2: { value: '' },
      A3: { value: 'b' },
      A4: { value: 5 },
      A5: { value: 'a' },
    };
    const asc = planGridProjection({ cells, sourceRowIndices: [1, 2, 3, 4], sortRules: [{ column: 'A', direction: 'asc' }] });
    const desc = planGridProjection({ cells, sourceRowIndices: [1, 2, 3, 4], sortRules: [{ column: 'A', direction: 'desc' }] });
    if (!asc.ok || !desc.ok) throw new Error('expected accepted projections');
    // Counter-check for the blank policy: a naive "reverse the whole comparison"
    // implementation puts the blank first in descending order.
    expect(asc.projection.orderedRowIndices).toEqual([3, 4, 2, 1]);
    expect(desc.projection.orderedRowIndices).toEqual([2, 4, 3, 1]);
    expect(cells.A2.value).toBe('');
  });

  it('never mutates the source cell store', () => {
    const snapshot = JSON.stringify(FIXTURE);
    const sourceKeys = Object.keys(FIXTURE).sort();
    planGridProjection({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, sortRules: [region('asc'), revenue('desc')], filters: [{ id: 'f', column: 'A', operator: 'equals', value: 'West' }] });
    expect(Object.keys(FIXTURE).sort()).toEqual(sourceKeys);
    expect(JSON.stringify(FIXTURE)).toBe(snapshot);
  });

  it('reports which level decided between two rows', () => {
    const result = planGridProjection({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, sortRules: [region('asc'), revenue('desc')] });
    if (!result.ok) throw new Error('expected an accepted projection');
    const rows = result.projection.visibleRows;
    const east200 = rows.find((row) => row.sourceRowIndex === 1);
    const west300 = rows.find((row) => row.sourceRowIndex === 2);
    if (!east200 || !west300) throw new Error('fixture rows missing');
    const west100 = rows.find((row) => row.sourceRowIndex === 0);
    if (!west100) throw new Error('fixture row 0 missing');
    const west300Tied = rows.find((row) => row.sourceRowIndex === 4);
    if (!west300Tied) throw new Error('fixture row 4 missing');
    // 'east' < 'west' decides at level 0; the two West rows differ first at level 1.
    expect(decidingSortLevel(east200, west300Tied, [region('asc'), revenue('desc')])).toBe(0);
    expect(decidingSortLevel(west300, west100, [region('asc'), revenue('desc')])).toBe(1);
    // Rows 2 and 4 are identical on both levels.
    expect(decidingSortLevel(west300, west300Tied, [region('asc'), revenue('desc')])).toBe(-1);
  });
});

describe('Grid Data-View Projection Planner - filters and exact reset', () => {
  const westOnly: GridFilterRule[] = [{ id: 'f1', column: 'A', operator: 'equals', value: 'West' }];

  it('hides non-matching rows without removing them from the sheet', () => {
    const result = planGridProjection({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, filters: westOnly, columnCount: 2 });
    if (!result.ok) throw new Error('expected an accepted projection');
    expect(result.projection.orderedRowIndices).toEqual([0, 2, 4]);
    expect(result.projection.hiddenRowIndices).toEqual([1, 3]);
    expect(result.projection.filterActive).toBe(true);
    expect(projectionPreservesSourceRows(result.projection, SOURCE_ROWS)).toBe(true);
    // Hidden rows are still present in the sheet: a hidden row is not a deleted row.
    for (const hidden of result.projection.hiddenRowIndices) {
      expect(FIXTURE[`A${hidden + 1}`]).toBeDefined();
      expect(FIXTURE[`B${hidden + 1}`]).toBeDefined();
    }
  });

  it('restores the original set and order exactly after clearing the filter', () => {
    const filtered = planGridProjection({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, filters: westOnly, sortRules: [revenue('desc')], columnCount: 2 });
    if (!filtered.ok) throw new Error('expected an accepted projection');
    expect(filtered.projection.orderedRowIndices).not.toEqual(SOURCE_ROWS);

    const reset = resetGridProjection(SOURCE_ROWS, FIXTURE);
    expect(reset.orderedRowIndices).toEqual(SOURCE_ROWS);
    expect(reset.hiddenRowIndices).toEqual([]);
    expect(reset.filterActive).toBe(false);
    expect(reset.sortActive).toBe(false);
    expect(reset.visibleRows.map((row) => row.sourceRowIndex)).toEqual(SOURCE_ROWS);
    expect(projectionPreservesSourceRows(reset, SOURCE_ROWS)).toBe(true);
  });

  it('filter + sort + reset is a round trip over the same source rows', () => {
    const both = planGridProjection({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, filters: westOnly, sortRules: [revenue('desc')], columnCount: 2 });
    if (!both.ok) throw new Error('expected an accepted projection');
    expect(both.projection.orderedRowIndices).toEqual([2, 4, 0]);
    // Re-running without filters/sort must reproduce the worksheet order.
    const cleared = planGridProjection({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, filters: [], sortRules: [] });
    if (!cleared.ok) throw new Error('expected an accepted projection');
    expect(cleared.projection.orderedRowIndices).toEqual(SOURCE_ROWS);
    expect(projectionPreservesSourceRows(cleared.projection, SOURCE_ROWS)).toBe(true);
  });

  it('AND-combines base filters and OR-combines advanced filter groups', () => {
    const andResult = planGridProjection({
      cells: FIXTURE,
      sourceRowIndices: SOURCE_ROWS,
      filters: [
        { id: 'f1', column: 'A', operator: 'equals', value: 'West' },
        { id: 'f2', column: 'B', operator: 'greater-than', value: 200 },
      ],
      columnCount: 2,
    });
    if (!andResult.ok) throw new Error('expected an accepted projection');
    // Hand-checked: A=West is source rows 0, 2, 4; B>200 keeps only rows 2 and 4.
    expect(andResult.projection.orderedRowIndices).toEqual([2, 4]);

    const orResult = planGridProjection({
      cells: FIXTURE,
      sourceRowIndices: SOURCE_ROWS,
      advancedFilter: {
        groups: [
          [{ id: 'g1', column: 'A', operator: 'equals', value: 'East' }],
          [{ id: 'g2', column: 'B', operator: 'greater-than-or-equal', value: 300 }],
        ],
      },
      columnCount: 2,
    });
    if (!orResult.ok) throw new Error('expected an accepted projection');
    // Group 1: A=East -> rows 1, 3. Group 2: B>=300 -> rows 2, 4. Union in worksheet order.
    expect(orResult.projection.orderedRowIndices).toEqual([1, 2, 3, 4]);
  });

  it('keeps unique-record filtering lossless for the surviving rows', () => {
    const cells: Record<string, GridCell> = {
      A2: { value: 'x' }, A3: { value: 'x' }, A4: { value: 'y' },
    };
    const result = planGridProjection({
      cells,
      sourceRowIndices: [1, 2, 3],
      advancedFilter: { groups: [[{ id: 'g', column: 'A', operator: 'not-empty' }]], uniqueOnly: true },
    });
    if (!result.ok) throw new Error('expected an accepted projection');
    expect(result.projection.orderedRowIndices).toEqual([1, 3]);
    expect(result.projection.hiddenRowIndices).toEqual([2]);
    expect(projectionPreservesSourceRows(result.projection, [1, 2, 3])).toBe(true);
  });
});

describe('Grid Data-View Projection Planner - fail-closed input validation', () => {
  it('rejects a column that the sheet does not have', () => {
    const issues = validateProjectionRequest({
      cells: FIXTURE,
      sourceRowIndices: SOURCE_ROWS,
      sortRules: [{ column: 'H', direction: 'asc' }],
      columnCount: 2,
    });
    expect(issues.map((issue) => issue.code)).toContain('projection_column_outside_bounds');
  });

  it('rejects malformed columns, duplicate sort levels and incomplete between rules', () => {
    expect(validateProjectionRequest({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, sortRules: [{ column: 'A1', direction: 'asc' }] }).map((issue) => issue.code))
      .toContain('projection_invalid_column');
    expect(validateProjectionRequest({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, sortRules: [{ column: 'A', direction: 'asc' }, { column: 'a', direction: 'desc' }] }).map((issue) => issue.code))
      .toContain('projection_duplicate_sort_column');
    expect(validateProjectionRequest({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, filters: [{ id: 'f', column: 'B', operator: 'between', value: 1 }] }).map((issue) => issue.code))
      .toContain('projection_missing_between_value');
    expect(validateProjectionRequest({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, filters: [{ id: 'f', column: 'B', operator: 'equals', value: 'x'.repeat(5_000) }] }).map((issue) => issue.code))
      .toContain('projection_value_too_long');
  });

  it('rejects an oversized sort level list instead of silently truncating it', () => {
    const sortRules: GridSortRule[] = Array.from({ length: MAX_SORT_LEVELS + 1 }, (_, index) => ({
      column: `A${index}`,
      direction: 'asc',
    }));
    const result = planGridProjection({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS, sortRules });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.issues.map((issue) => issue.code)).toContain('projection_invalid_column');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('fails closed for an unparseable operator instead of dropping the row', () => {
    const result = planGridProjection({
      cells: FIXTURE,
      sourceRowIndices: SOURCE_ROWS,
      filters: [{ id: 'f', column: 'A', operator: 'regex' as never, value: 'West' }],
    });
    expect(result.ok).toBe(false);
  });

  it('fails closed for a negative or fractional row index instead of addressing the wrong row', () => {
    expect(validateProjectionRequest({ cells: FIXTURE, sourceRowIndices: [-1, 0] }).map((issue) => issue.code))
      .toContain('projection_row_index_invalid');
    expect(validateProjectionRequest({ cells: FIXTURE, sourceRowIndices: [0, 1.5] }).map((issue) => issue.code))
      .toContain('projection_row_index_invalid');
  });

  it('accepts an empty request as the identity view', () => {
    const result = planGridProjection({ cells: FIXTURE, sourceRowIndices: SOURCE_ROWS });
    if (!result.ok) throw new Error('expected an accepted projection');
    expect(result.projection.orderedRowIndices).toEqual(SOURCE_ROWS);
    expect(result.projection.filterActive).toBe(false);
    expect(result.projection.sortActive).toBe(false);
  });
});
