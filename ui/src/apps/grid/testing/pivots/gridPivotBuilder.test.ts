// STATUS: PLATIN - hand-written oracles for the bounded Excel-like Pivot Builder model.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/grid/workspaceGrid';
import {
  MAX_PIVOT_VALUE_FIELDS,
  buildPivotDefinition,
  describeZone,
  movePivotField,
  pivotBuilderBlockers,
  pivotZoneOf,
  setPivotFilterValues,
  setPivotGrouping,
  setPivotValueAggregation,
  transferPivotField,
  type PivotBuilderConfig,
} from '../../pivots/gridPivotBuilder';
import { buildPivotPreview } from '../../pivots/gridPivotPreview';

function baseConfig(): PivotBuilderConfig {
  return {
    sourceRange: 'A1:C5',
    fields: [
      { column: 'A', label: 'Region' },
      { column: 'B', label: 'Monat' },
      { column: 'C', label: 'Umsatz' },
    ],
    fieldsCapped: false,
    rows: ['A'],
    columns: [],
    values: [{ column: 'C', label: 'Umsatz', aggregation: 'sum' }],
    filters: [],
    groupings: [],
    calculatedFields: [],
    style: {},
    name: 'Pivot 1',
  };
}

describe('Grid Pivot Builder - zone transfers', () => {
  it('moves a field from available into rows and reports the zone', () => {
    const result = movePivotField(baseConfig(), 'B', 'available', 'rows');
    if (!result.ok) throw new Error(`unexpected rejection: ${JSON.stringify(result.issues)}`);
    expect(result.config.rows).toEqual(['A', 'B']);
    expect(pivotZoneOf(result.config, 'B')).toBe('rows');
    expect(pivotZoneOf(result.config, 'A')).toBe('rows');
    expect(pivotZoneOf(result.config, 'C')).toBe('values');
  });

  it('moves a field between zones without leaving a duplicate behind', () => {
    // Moving the last row field away is allowed by the transfer itself; the
    // incomplete configuration is reported later by `buildPivotDefinition`.
    const toColumns = movePivotField(baseConfig(), 'A', 'rows', 'columns');
    if (!toColumns.ok) throw new Error('expected an accepted transfer');
    expect(toColumns.config.rows).toEqual([]);
    expect(toColumns.config.columns).toEqual(['A']);
    expect(pivotZoneOf(toColumns.config, 'A')).toBe('columns');
    expect(pivotBuilderBlockers(toColumns.config)).toContain('Mindestens ein Zeilenfeld noetig');

    const twoRows = movePivotField(baseConfig(), 'B', 'available', 'rows');
    if (!twoRows.ok) throw new Error('expected an accepted transfer');
    const moved = movePivotField(twoRows.config, 'A', 'rows', 'columns');
    if (!moved.ok) throw new Error('expected an accepted transfer');
    expect(moved.config.rows).toEqual(['B']);
    expect(moved.config.columns).toEqual(['A']);
    // The field exists exactly once across all zones.
    expect(pivotZoneOf(moved.config, 'A')).toBe('columns');
    expect(moved.config.rows.filter((entry) => entry === 'A')).toHaveLength(0);
  });

  it('builds an aggregated value slot when a field lands in values', () => {
    const result = movePivotField(baseConfig(), 'B', 'available', 'values', 'count');
    if (!result.ok) throw new Error('expected an accepted transfer');
    expect(result.config.values).toEqual([
      { column: 'C', label: 'Umsatz', aggregation: 'sum' },
      { column: 'B', label: 'Monat', aggregation: 'count' },
    ]);
  });

  it('keeps a filter slot empty so selecting nothing means "no filter"', () => {
    const result = movePivotField(baseConfig(), 'B', 'available', 'filters');
    if (!result.ok) throw new Error('expected an accepted transfer');
    expect(result.config.filters).toEqual([{ column: 'B', allowedValues: [] }]);
    const withValues = setPivotFilterValues(result.config, 'B', ['Jan', 'Feb', 'Jan', ' ']);
    if (!withValues.ok) throw new Error('expected an accepted filter update');
    expect(withValues.config.filters[0].allowedValues).toEqual(['Jan', 'Feb']);
    const cleared = setPivotFilterValues(withValues.config, 'B', []);
    if (!cleared.ok) throw new Error('expected an accepted filter reset');
    expect(cleared.config.filters[0].allowedValues).toEqual([]);
  });

  it('returns the field to available and clears its zone entries', () => {
    const result = movePivotField(baseConfig(), 'A', 'rows', 'available');
    if (!result.ok) throw new Error('expected an accepted transfer');
    expect(result.config.rows).toEqual([]);
    expect(pivotZoneOf(result.config, 'A')).toBe('available');
  });

  it('rejects an unknown field, a stale source zone and a self transfer', () => {
    const unknown = movePivotField(baseConfig(), 'Z', 'available', 'rows');
    expect(unknown.ok).toBe(false);
    const stale = transferPivotField({ config: baseConfig(), field: 'A', from: 'available', to: 'columns' });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error('expected rejection');
    expect(stale.issues[0].code).toBe('pivot_builder_unknown_field');
    const self = movePivotField(baseConfig(), 'A', 'rows', 'rows');
    expect(self.ok).toBe(false);
    if (self.ok) throw new Error('expected rejection');
    expect(self.issues[0].code).toBe('pivot_builder_self_transfer');
  });

  it('rejects a field name beyond the accepted length', () => {
    const result = movePivotField(baseConfig(), 'X'.repeat(200), 'available', 'rows');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.issues[0].code).toBe('pivot_builder_invalid_field_name');
  });

  it('caps the values zone and fails closed instead of dropping a measure', () => {
    const config: PivotBuilderConfig = {
      ...baseConfig(),
      fields: [
        { column: 'D99', label: 'Zusaetzlicher Wert' },
        ...Array.from({ length: MAX_PIVOT_VALUE_FIELDS }, (_, index) => ({
          column: `C${index}`,
          label: `Wert ${index}`,
        })),
      ],
      rows: ['A'],
      values: Array.from({ length: MAX_PIVOT_VALUE_FIELDS }, (_, index) => ({
        column: `C${index}`,
        label: `Wert ${index}`,
        aggregation: 'sum' as const,
      })),
    };
    const result = transferPivotField({ config, field: 'D99', from: 'available', to: 'values' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.issues[0].code).toBe('pivot_builder_value_field_limit');
  });

  it('changes aggregation and label of a value slot', () => {
    const config = baseConfig();
    const aggregated = setPivotValueAggregation(config, 'c', 'average');
    if (!aggregated.ok) throw new Error('expected an accepted aggregation change');
    expect(aggregated.config.values[0].aggregation).toBe('average');
    expect(config.values[0].aggregation).toBe('sum');
    const missing = setPivotValueAggregation(config, 'B', 'average');
    expect(missing.ok).toBe(false);
  });

  it('stores a date grouping for a row field', () => {
    const config: PivotBuilderConfig = { ...baseConfig(), columns: ['B'], rows: ['A'] };
    const grouped = setPivotGrouping(config, 'B', { dateGrouping: 'month' });
    if (!grouped.ok) throw new Error('expected an accepted grouping');
    expect(grouped.config.groupings).toEqual([{ column: 'B', dateGrouping: 'month' }]);
    const replaced = setPivotGrouping(grouped.config, 'b', { dateGrouping: 'quarter' });
    if (!replaced.ok) throw new Error('expected an accepted grouping');
    expect(replaced.config.groupings).toEqual([{ column: 'B', dateGrouping: 'quarter' }]);
  });

  it('describes every zone concretely without relying on colour', () => {
    const config = baseConfig();
    expect(describeZone(config, 'rows')).toBe('Zeilenfelder: A');
    expect(describeZone(config, 'values')).toBe('Werte: Summe von Umsatz');
    expect(describeZone(config, 'columns')).toBe('Keine Spaltenfelder');
    expect(describeZone(config, 'filters')).toBe('Keine Filter');
    expect(describeZone(config, 'available')).toBe('3 verfuegbare Felder');
  });
});

describe('Grid Pivot Builder - canonical definition', () => {
  it('produces the canonical definition the engine consumes', () => {
    const withColumns = movePivotField(baseConfig(), 'B', 'available', 'columns');
    if (!withColumns.ok) throw new Error('expected an accepted transfer');
    const definition = buildPivotDefinition(withColumns.config, 'pivot-1');
    expect(definition).not.toBeNull();
    expect(definition).toMatchObject({
      id: 'pivot-1',
      sourceRange: 'A1:C5',
      rowColumn: 'A',
      rowColumns: ['A'],
      columnColumns: ['B'],
      valueColumn: 'C',
      aggregation: 'sum',
      valueFields: [{ column: 'C', aggregation: 'sum' }],
    });
  });

  it('refuses an incomplete configuration and names every blocker', () => {
    const incomplete: PivotBuilderConfig = { ...baseConfig(), rows: [], values: [] };
    expect(buildPivotDefinition(incomplete, 'pivot-2')).toBeNull();
    expect(pivotBuilderBlockers(incomplete)).toEqual([
      'Mindestens ein Zeilenfeld noetig',
      'Mindestens ein Wert noetig',
    ]);
    expect(buildPivotDefinition({ ...incomplete, sourceRange: '' }, 'pivot-3')).toBeNull();
  });

  it('refuses a definition that references a field outside the source range', () => {
    const config: PivotBuilderConfig = { ...baseConfig(), rows: ['A'], columns: ['H'] };
    expect(buildPivotDefinition(config, 'pivot-4')).toBeNull();
  });

  it('never mutates the configuration it was given', () => {
    const config = baseConfig();
    const snapshot = JSON.stringify(config);
    movePivotField(config, 'B', 'available', 'rows');
    setPivotValueAggregation(config, 'C', 'max');
    expect(JSON.stringify(config)).toBe(snapshot);
  });
});

describe('Grid Pivot Builder - live preview wiring', () => {
  // Fixture: header row 1, data rows A2:C4 with Region/Monat/Umsatz.
  const CELLS: Record<string, GridCell> = {
    A1: { value: 'Region' }, B1: { value: 'Monat' }, C1: { value: 'Umsatz' },
    A2: { value: 'Nord' }, B2: { value: 'Jan' }, C2: { value: 10 },
    A3: { value: 'Nord' }, B3: { value: 'Feb' }, C3: { value: 20 },
    A4: { value: 'Sued' }, B4: { value: 'Jan' }, C4: { value: 5 },
  };

  it('renders a live preview from the builder configuration', () => {
    const config: PivotBuilderConfig = { ...baseConfig(), sourceRange: 'A1:C4' };
    const definition = buildPivotDefinition(config, 'pivot-preview');
    if (!definition) throw new Error('expected a complete definition');
    const preview = buildPivotPreview({ cells: CELLS, definition });
    expect(preview.state).toBe('ready');
    // Hand-computed: Nord = 10 + 20 = 30, Sued = 5.
    expect(preview.rows.map((row) => [row.label, row.cells[0].metrics[0].value])).toEqual([
      ['Nord', 30],
      ['Sued', 5],
    ]);
    expect(preview.sourceRecordCount).toBe(3);
  });

  it('reports the empty state when the source range has no records', () => {
    const definition = buildPivotDefinition({ ...baseConfig(), sourceRange: 'A1:C1' }, 'pivot-empty');
    if (!definition) throw new Error('expected a complete definition');
    const preview = buildPivotPreview({ cells: CELLS, definition });
    expect(preview.state).toBe('empty');
    expect(preview.message).toContain('Keine Datensaetze');
  });

  it('reports an error state with a concrete message instead of throwing', () => {
    const definition = buildPivotDefinition({ ...baseConfig(), sourceRange: 'nonsense' }, 'pivot-bad');
    // The builder refuses the range before the engine is reached.
    expect(definition).toBeNull();
    const preview = buildPivotPreview({ cells: CELLS, definition: null });
    expect(preview.state).toBe('empty');
    expect(preview.message).toContain('Noch keine Konfiguration');

    const hallucinated = {
      id: 'pivot-bad', name: 'bad', sourceRange: 'A1:C4', rowColumn: 'H', valueColumn: 'C', aggregation: 'sum' as const,
    };
    const errorPreview = buildPivotPreview({ cells: CELLS, definition: hallucinated });
    expect(errorPreview.state).toBe('error');
    expect(errorPreview.errorCode).toBe('pivot_preview_field_outside_source');
    // No raw engine internals leak into the user-facing message.
    expect(errorPreview.message).not.toContain('pivot_field_outside_source');
  });

  it('caps preview rows and reports the partial state', () => {
    const cells: Record<string, GridCell> = {
      A1: { value: 'Region' }, C1: { value: 'Umsatz' },
    };
    for (let index = 0; index < 40; index++) {
      cells[`A${index + 2}`] = { value: `R${String(index).padStart(2, '0')}` };
      cells[`C${index + 2}`] = { value: index };
    }
    const definition = buildPivotDefinition({ ...baseConfig(), sourceRange: 'A1:C41' }, 'pivot-cap');
    if (!definition) throw new Error('expected a complete definition');
    const preview = buildPivotPreview({ cells, definition, maxRows: 10 });
    expect(preview.rows).toHaveLength(10);
    expect(preview.rowsTruncated).toBe(true);
    expect(preview.state).toBe('partial');
    expect(preview.message).toContain('von 40 Zeilen');
    expect(preview.totalRowCount).toBe(40);
  });
});
