// STATUS: PLATIN - hand-written oracles for the bounded AutoFilter value model.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/grid/workspaceGrid';
import {
  MAX_AUTOFILTER_SELECTION,
  MAX_AUTOFILTER_VALUES,
  buildAutoFilterValues,
  describeAutoFilter,
  isAutoFilterActive,
  setAutoFilterSelection,
  toAutoFilterRule,
  toggleAutoFilterValue,
} from '../../data/gridAutoFilter';

// Fixture rows 2..8 in column A: West, East, West, North, (blank), East, West.
const CELLS: Record<string, GridCell> = {
  A1: { value: 'Region' },
  A2: { value: 'West' },
  A3: { value: 'East' },
  A4: { value: 'West' },
  A5: { value: 'North' },
  A6: { value: '' },
  A7: { value: 'East' },
  A8: { value: 'West' },
};

// 0-based worksheet rows: source row 1 is worksheet row 2 (A2).
const ROWS = [1, 2, 3, 4, 5, 6, 7];

function model(selected: string[] = []) {
  const result = buildAutoFilterValues({ cells: CELLS, dataRowIndices: ROWS, column: 'A', selected });
  if (!result.ok) throw new Error(`unexpected rejection: ${result.code}`);
  return result.value;
}

describe('Grid AutoFilter value model', () => {
  it('enumerates distinct values with exact counts and the blank bucket', () => {
    const set = model();
    // Hand-counted from the fixture: West 3, East 2, North 1, blanks 1.
    expect(set.values.map((entry) => [entry.value, entry.count])).toEqual([
      ['(Blanks)', 1],
      ['East', 2],
      ['North', 1],
      ['West', 3],
    ]);
    expect(set.column).toBe('A');
    expect(set.valueCapped).toBe(false);
    expect(set.scannedRows).toBe(7);
  });

  it('starts with no selection, so the view is unfiltered and resettable', () => {
    const set = model();
    expect(isAutoFilterActive(set)).toBe(false);
    expect(describeAutoFilter(set)).toBe('A: alle 4 Werte sichtbar');
    expect(toAutoFilterRule('rule-1', set, [])).toEqual([]);
  });

  it('builds an exact equals rule for one checked value', () => {
    const set = toggleAutoFilterValue(model(), 'West');
    expect(set.selected).toEqual(['West']);
    expect(isAutoFilterActive(set)).toBe(true);
    const rules = toAutoFilterRule('rule-1', set, []);
    expect(rules).toEqual([{ id: 'rule-1', column: 'A', operator: 'equals', value: 'West' }]);
    expect(describeAutoFilter(set)).toBe('A: 1 von 4 Werten ausgewaehlt');
  });

  it('expresses multi-selection as AND over the unchecked values', () => {
    let set = toggleAutoFilterValue(model(), 'West');
    set = toggleAutoFilterValue(set, 'East');
    expect(set.selected).toEqual(['West', 'East']);
    const rules = toAutoFilterRule('rule-1', set, []);
    // Visible = West or East  <=>  exclude North and the blank bucket.
    // The exclusion list follows the sorted value order: (Blanks), East, North, West.
    expect(rules).toEqual([
      { id: 'rule-1:0', column: 'A', operator: 'not-equals', value: '(Blanks)' },
      { id: 'rule-1:1', column: 'A', operator: 'not-equals', value: 'North' },
    ]);
    expect(describeAutoFilter(set)).toBe('A: 2 von 4 Werten ausgewaehlt');
  });

  it('reset removes only this column rule and leaves other columns untouched', () => {
    const existing = [
      { id: 'other', column: 'B', operator: 'greater-than' as const, value: 10 },
      { id: 'mine', column: 'A', operator: 'equals' as const, value: 'North' },
    ];
    const set = model(); // nothing checked
    expect(toAutoFilterRule('rule-1', set, existing)).toEqual([
      { id: 'other', column: 'B', operator: 'greater-than', value: 10 },
    ]);
    // Re-checking restores a rule without duplicating the old one.
    const reselected = toggleAutoFilterValue(set, 'North');
    expect(toAutoFilterRule('rule-1', reselected, existing)).toEqual([
      { id: 'other', column: 'B', operator: 'greater-than', value: 10 },
      { id: 'rule-1', column: 'A', operator: 'equals', value: 'North' },
    ]);
  });

  it('select-all then clear is a round trip to "no filter"', () => {
    const base = model();
    const all = setAutoFilterSelection(base, base.values.map((entry) => entry.value));
    expect(all.selected).toHaveLength(4);
    // Selecting every value is semantically "no filter"; the rule carries the
    // full exclusion list, which is empty.
    expect(toAutoFilterRule('rule-1', all, [])).toEqual([]);
    const cleared = setAutoFilterSelection(all, []);
    expect(cleared.selected).toEqual([]);
    expect(isAutoFilterActive(cleared)).toBe(false);
  });

  it('rejects a malformed column instead of scanning column zero', () => {
    const result = buildAutoFilterValues({ cells: CELLS, dataRowIndices: ROWS, column: '1A' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.code).toBe('autofilter_invalid_column');
  });

  it('caps the distinct value list and reports that it was capped', () => {
    const cells: Record<string, GridCell> = { A1: { value: 'Key' } };
    const rows: number[] = [];
    for (let index = 0; index < MAX_AUTOFILTER_VALUES + 25; index++) {
      cells[`A${index + 1}`] = { value: `v${String(index).padStart(6, '0')}` };
      // Row index `index` addresses worksheet row `A${index + 1}`.
      rows.push(index);
    }
    const result = buildAutoFilterValues({ cells, dataRowIndices: rows, column: 'A' });
    if (!result.ok) throw new Error('expected an accepted value set');
    expect(result.value.values).toHaveLength(MAX_AUTOFILTER_VALUES);
    expect(result.value.valueCapped).toBe(true);
    expect(result.value.scanTruncated).toBe(true);
  });

  it('fails closed when too many values are checked at once', () => {
    const cells: Record<string, GridCell> = { A1: { value: 'Key' } };
    const rows: number[] = [];
    const values: string[] = [];
    for (let index = 0; index <= MAX_AUTOFILTER_SELECTION; index++) {
      cells[`A${index + 1}`] = { value: `v${index}` };
      rows.push(index);
      values.push(`v${index}`);
    }
    const built = buildAutoFilterValues({ cells, dataRowIndices: rows, column: 'A' });
    if (!built.ok) throw new Error('expected an accepted value set');
    expect(built.value.values).toHaveLength(MAX_AUTOFILTER_SELECTION + 1);

    // A raw selection above the bound is rejected fail-closed: the previous
    // state is returned unchanged instead of being silently truncated.
    const oversized = setAutoFilterSelection(built.value, values);
    expect(oversized).toBe(built.value);
    expect(oversized.selected).toHaveLength(0);

    // Filling the list up to the bound is accepted...
    const atBound = setAutoFilterSelection(built.value, values.slice(0, MAX_AUTOFILTER_SELECTION));
    expect(atBound.selected).toHaveLength(MAX_AUTOFILTER_SELECTION);
    // ...and the one toggle that would exceed it returns the previous state.
    const last = `v${MAX_AUTOFILTER_SELECTION}`;
    expect(toggleAutoFilterValue(atBound, last)).toBe(atBound);
    // Removing a value first frees exactly one slot.
    const freed = toggleAutoFilterValue(atBound, 'v0');
    expect(freed.selected).toHaveLength(MAX_AUTOFILTER_SELECTION - 1);
    expect(toggleAutoFilterValue(freed, last).selected).toHaveLength(MAX_AUTOFILTER_SELECTION);
  });

  it('truncates long values for display but keeps the full comparison key', () => {
    const long = 'x'.repeat(300);
    const cells: Record<string, GridCell> = { A1: { value: 'Key' }, A2: { value: long } };
    const result = buildAutoFilterValues({ cells, dataRowIndices: [1], column: 'A' });
    if (!result.ok) throw new Error('expected an accepted value set');
    const entry = result.value.values[0];
    // The comparison key stays exact (two long values must never be merged)...
    expect(entry.value).toBe(long);
    // ...while the rendered control stays bounded.
    expect(entry.truncated).toBe(true);
    expect(entry.label.length).toBeLessThan(entry.value.length);
    expect(entry.label.endsWith('\u2026')).toBe(true);
  });

  it('never merges two long values that share a prefix', () => {
    const first = `${'a'.repeat(300)}-1`;
    const second = `${'a'.repeat(300)}-2`;
    const cells: Record<string, GridCell> = { A1: { value: 'Key' }, A2: { value: first }, A3: { value: second } };
    const result = buildAutoFilterValues({ cells, dataRowIndices: [1, 2], column: 'A' });
    if (!result.ok) throw new Error('expected an accepted value set');
    expect(result.value.values.map((entry) => entry.value)).toEqual([first, second]);
  });

  it('drops selected values that the column does not contain', () => {
    const set = model(['West', 'Atlantis']);
    expect(set.selected).toEqual(['West']);
  });
});
