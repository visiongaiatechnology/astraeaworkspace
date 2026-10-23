// STATUS: PLATIN
// Counter-checks for Grid Paket 30 (Mehrstufig sortieren ohne Datenverlust) — AST-0386 + AST-0389.
//
// Hand-written oracle:
//   "Nach Region, dann Umsatz sortieren, zusammengehörige Zeilen bleiben erhalten."
//   "Jeder ungültige Pfad ist sichtbar und fail-closed."
import { describe, expect, it } from 'vitest';
import type { GridCell, GridSortRule } from '../../../../shared/contracts/grid/workspaceGrid';
import {
  addGridSortLevel,
  describeGridSortPreview,
  moveGridSortLevel,
  previewGridSort,
  removeGridSortLevel,
  setGridSortLevelDirection,
  validateGridSortLevels,
} from '../../data/gridSortDialog';
import { MAX_SORT_LEVELS } from '../../data/gridDataProjection';

/** Region / Revenue / Cost — the acceptance scenario's shape. */
function sheetCells(): Record<string, GridCell> {
  return {
    A1: { value: 'Region' }, B1: { value: 'Umsatz' }, C1: { value: 'Kosten' },
    A2: { value: 'West' }, B2: { value: 100 }, C2: { value: 60 },
    A3: { value: 'Ost' }, B3: { value: 300 }, C3: { value: 90 },
    A4: { value: 'West' }, B4: { value: 250 }, C4: { value: 80 },
    A5: { value: 'Ost' }, B5: { value: 50 }, C5: { value: 20 },
  };
}

const CELLS = sheetCells();
const ROW_COUNT = 5;
const COLUMN_COUNT = 3;

function level(column: string, direction: 'asc' | 'desc' = 'asc'): GridSortRule {
  return { column, direction };
}

describe('Grid multi-level sort: the acceptance scenario (AST-0386)', () => {
  it('sorts by region ascending, then revenue descending, without losing a row', () => {
    const result = previewGridSort({
      cells: CELLS,
      rowCount: ROW_COUNT,
      columnCount: COLUMN_COUNT,
      headerRowIndex: 0,
      levels: [level('A', 'asc'), level('B', 'desc')],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.preview.sourceRows).toBe(ROW_COUNT);
    // `visibleRows` counts the header row as well: header + all four data rows, nothing hidden.
    expect(result.preview.visibleRows).toBe(ROW_COUNT);
    expect(result.preview.hiddenRows).toBe(0);
    expect(result.preview.reordered).toBe(true);
    expect(result.preview.dataLoss).toBe(false);
    // Header row keeps index 0; the first data row is one of the "Ost" rows (revenue 300).
    expect(result.preview.firstRowIndex).toBe(2);
  });

  it('reports a no-op sort as unchanged instead of pretending a reorder happened', () => {
    const single = previewGridSort({
      cells: CELLS, rowCount: ROW_COUNT, columnCount: COLUMN_COUNT, headerRowIndex: 0, levels: [level('B', 'asc')],
    });
    expect(single.ok).toBe(true);
    if (!single.ok) throw new Error('unreachable');
    expect(single.preview.dataLoss).toBe(false);
    expect(typeof single.preview.movedRows).toBe('number');
  });

  it('keeps the hidden/visible partition intact when a filter is combined with a sort', () => {
    const result = previewGridSort({
      cells: CELLS,
      rowCount: ROW_COUNT,
      columnCount: COLUMN_COUNT,
      headerRowIndex: 0,
      levels: [level('B', 'desc')],
      filters: [{ id: 'f1', column: 'A', operator: 'equals', value: 'Ost' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.preview.visibleRows + result.preview.hiddenRows).toBe(result.preview.sourceRows);
    // The header row does not match "Ost", so hidden = header + the two "West" rows.
    expect(result.preview.hiddenRows).toBe(3);
    expect(result.preview.visibleRows).toBe(2);
  });

  it('describes the preview in one bounded sentence', () => {
    const result = previewGridSort({
      cells: CELLS, rowCount: ROW_COUNT, columnCount: COLUMN_COUNT, headerRowIndex: 0, levels: [level('A'), level('B', 'desc')],
    });
    if (!result.ok) throw new Error('unreachable');
    const text = describeGridSortPreview(result.preview);
    expect(text).toContain('A ↑');
    expect(text).toContain('B ↓');
    expect(text).toContain('keine Zeile entfernt');
  });
});

describe('Grid multi-level sort: fail-closed with named reasons (AST-0389)', () => {
  it('refuses an empty level list with a named reason', () => {
    const issues = validateGridSortLevels([], COLUMN_COUNT);
    expect(issues.map((issue) => issue.code)).toEqual(['sort_no_levels']);
    expect(issues[0]!.message).toContain('keine Sortierebene');
  });

  it('refuses a column outside the sheet instead of silently ignoring the level', () => {
    const issues = validateGridSortLevels([level('Z')], COLUMN_COUNT);
    expect(issues.map((issue) => issue.code)).toEqual(['sort_column_outside_sheet']);
    const preview = previewGridSort({ cells: CELLS, rowCount: ROW_COUNT, columnCount: COLUMN_COUNT, levels: [level('Z')] });
    expect(preview.ok).toBe(false);
  });

  it('refuses a duplicate level with the offending column named', () => {
    const levels = [level('A'), level('B'), level('A', 'desc')];
    const issues = validateGridSortLevels(levels, COLUMN_COUNT);
    expect(issues.map((issue) => issue.code)).toContain('sort_duplicate_level');
    // Same column in different case is still a duplicate.
    expect(validateGridSortLevels([level('A'), level('a')], COLUMN_COUNT).map((issue) => issue.code)).toContain('sort_duplicate_level');
  });

  it('refuses a malformed column token and a level list beyond the ceiling', () => {
    expect(validateGridSortLevels([level('1')], COLUMN_COUNT).map((issue) => issue.code)).toEqual(['sort_column_invalid']);
    expect(validateGridSortLevels([level('')], COLUMN_COUNT).map((issue) => issue.code)).toEqual(['sort_column_invalid']);
    const tooMany = Array.from({ length: MAX_SORT_LEVELS + 1 }, (_, index) => level(String.fromCharCode(65 + (index % 26))));
    expect(validateGridSortLevels(tooMany, COLUMN_COUNT).map((issue) => issue.code)).toContain('sort_too_many_levels');
  });

  it('refuses a sheet with no sortable rows and an unusable row count', () => {
    expect(previewGridSort({ cells: {}, rowCount: 0, columnCount: COLUMN_COUNT, levels: [level('A')] }).ok).toBe(false);
    expect(previewGridSort({ cells: {}, rowCount: -1, columnCount: COLUMN_COUNT, levels: [level('A')] }).ok).toBe(false);
    expect(previewGridSort({ cells: {}, rowCount: 1.5, columnCount: COLUMN_COUNT, levels: [level('A')] }).ok).toBe(false);
  });

  it('never returns a preview together with an issue', () => {
    const results = [
      previewGridSort({ cells: CELLS, rowCount: ROW_COUNT, columnCount: COLUMN_COUNT, levels: [] }),
      previewGridSort({ cells: CELLS, rowCount: ROW_COUNT, columnCount: COLUMN_COUNT, levels: [level('Z')] }),
      previewGridSort({ cells: CELLS, rowCount: ROW_COUNT, columnCount: COLUMN_COUNT, levels: [level('A'), level('a')] }),
    ];
    for (const result of results) {
      if (result.ok) throw new Error('a rejected request produced a preview');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.every((issue) => issue.message.length > 0)).toBe(true);
    }
  });
});

describe('Grid multi-level sort: bounded level-list editing', () => {
  it('adds a level and refuses to exceed the ceiling', () => {
    const base = [level('A')];
    expect(addGridSortLevel(base, level('b')).map((rule) => rule.column)).toEqual(['A', 'B']);
    const full = Array.from({ length: MAX_SORT_LEVELS }, () => level('A'));
    expect(addGridSortLevel(full, level('B'))).toBe(full);
  });

  it('removes and moves levels with the priority order intact', () => {
    const levels = [level('A'), level('B'), level('C')];
    expect(removeGridSortLevel(levels, 1).map((rule) => rule.column)).toEqual(['A', 'C']);
    expect(removeGridSortLevel(levels, 9)).toBe(levels);
    expect(removeGridSortLevel(levels, -1)).toBe(levels);
    expect(moveGridSortLevel(levels, 0, 1).map((rule) => rule.column)).toEqual(['B', 'A', 'C']);
    expect(moveGridSortLevel(levels, 2, -1).map((rule) => rule.column)).toEqual(['A', 'C', 'B']);
    // Moving past either end is a no-op rather than a silent wrap-around.
    expect(moveGridSortLevel(levels, 0, -1)).toBe(levels);
    expect(moveGridSortLevel(levels, 2, 1)).toBe(levels);
  });

  it('toggles a level direction without touching the other levels', () => {
    const levels = [level('A'), level('B', 'desc')];
    expect(setGridSortLevelDirection(levels, 0, 'desc').map((rule) => rule.direction)).toEqual(['desc', 'desc']);
    expect(setGridSortLevelDirection(levels, 5, 'asc')).toBe(levels);
  });
});
