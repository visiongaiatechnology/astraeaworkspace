// STATUS: PLATIN - hand-written oracles for bounded pivot drill-down and slicer wiring.

import { describe, expect, it } from 'vitest';
import type { GridCell, GridPivotDefinition } from '../../../../shared/contracts/grid/workspaceGrid';
import {
  MAX_PIVOT_DRILLDOWN_RECORDS,
  applyPivotSlicerSelection,
  buildPivotChartView,
  buildPivotDrillDown,
  buildPivotPreview,
} from '../../pivots/gridPivotPreview';

// Fixture: header row 1, data rows 2..4 -> worksheet A2:C4 with source row
// indices 1..3 (0-based, so `toA1(col, 1)` is A2).
const CELLS: Record<string, GridCell> = {
  A1: { value: 'Region' }, B1: { value: 'Monat' }, C1: { value: 'Umsatz' },
  A2: { value: 'Nord' }, B2: { value: 'Jan' }, C2: { value: 10 },
  A3: { value: 'Nord' }, B3: { value: 'Feb' }, C3: { value: 20 },
  A4: { value: 'Sued' }, B4: { value: 'Jan' }, C4: { value: 5 },
};

const DEFINITION: GridPivotDefinition = {
  id: 'pivot-1',
  name: 'Umsatz je Region',
  sourceRange: 'A1:C4',
  rowColumn: 'A',
  valueColumn: 'C',
  aggregation: 'sum',
  rowColumns: ['A'],
  valueFields: [{ column: 'C', aggregation: 'sum' }],
};

describe('Grid Pivot drill-down', () => {
  it('returns the full source records of a group in worksheet order', () => {
    const drill = buildPivotDrillDown({ cells: CELLS, definition: DEFINITION, sourceRecordRowIndices: [2, 1], groupKey: 'Nord' });
    expect(drill.state).toBe('ready');
    expect(drill.groupKey).toBe('Nord');
    expect(drill.headers).toEqual(['Region', 'Monat', 'Umsatz']);
    expect(drill.rows.map((row) => row.worksheetRow)).toEqual([2, 3]);
    expect(drill.rows.map((row) => row.cells.map((cell) => cell.value))).toEqual([
      ['Nord', 'Jan', '10'],
      ['Nord', 'Feb', '20'],
    ]);
    expect(drill.message).toContain('2 Datensaetze');
  });

  it('is deterministic: the same aggregate always yields the same records', () => {
    const first = buildPivotDrillDown({ cells: CELLS, definition: DEFINITION, sourceRecordRowIndices: [3, 1, 3, 2], groupKey: 'Nord' });
    const second = buildPivotDrillDown({ cells: CELLS, definition: DEFINITION, sourceRecordRowIndices: [1, 2, 3], groupKey: 'Nord' });
    expect(first.rows).toEqual(second.rows);
    expect(first.rows.map((row) => row.sourceRowIndex)).toEqual([1, 2, 3]);
  });

  it('caps the record list and says so', () => {
    const drill = buildPivotDrillDown({
      cells: CELLS,
      definition: DEFINITION,
      sourceRecordRowIndices: [1, 2, 3],
      groupKey: 'alle',
      maxRecords: 2,
    });
    expect(drill.state).toBe('capped');
    expect(drill.rows).toHaveLength(2);
    expect(drill.totalRecordCount).toBe(3);
    expect(drill.message).toContain('2 von 3');
  });

  it('never exceeds the hard record bound', () => {
    const indices = Array.from({ length: MAX_PIVOT_DRILLDOWN_RECORDS + 50 }, (_, index) => index);
    const drill = buildPivotDrillDown({ cells: CELLS, definition: DEFINITION, sourceRecordRowIndices: indices, groupKey: 'alle' });
    expect(drill.rows.length).toBeLessThanOrEqual(MAX_PIVOT_DRILLDOWN_RECORDS);
  });

  it('reports the empty state for an aggregate without source rows', () => {
    const drill = buildPivotDrillDown({ cells: CELLS, definition: DEFINITION, sourceRecordRowIndices: [], groupKey: '(leer)' });
    expect(drill.state).toBe('empty');
    expect(drill.rows).toEqual([]);
    expect(drill.message).toContain('keine Quellzeilen');
  });

  it('rejects negative and fractional source row indices instead of addressing wrong rows', () => {
    const drill = buildPivotDrillDown({ cells: CELLS, definition: DEFINITION, sourceRecordRowIndices: [-1, 1.5, 2], groupKey: 'Nord' });
    expect(drill.rows.map((row) => row.sourceRowIndex)).toEqual([2]);
  });
});

describe('Grid Pivot slicer wiring', () => {
  it('applies a selection as a bounded pivot filter', () => {
    const change = applyPivotSlicerSelection(DEFINITION, 'a', ['Nord', 'Nord', ' ']);
    expect(change.applied).toBe(true);
    expect(change.definition.filters).toEqual([{ column: 'A', allowedValues: ['Nord'] }]);
    expect(change.message).toContain('1 Wert(e)');
  });

  it('clears the filter when nothing is selected, restoring the full pivot', () => {
    const filtered = applyPivotSlicerSelection(DEFINITION, 'A', ['Nord']);
    const cleared = applyPivotSlicerSelection(filtered.definition, 'A', []);
    expect(cleared.definition.filters).toEqual([]);
    expect(cleared.message).toContain('zurueckgesetzt');

    // Proof at the data level: the cleared definition sees all three records again.
    const preview = buildPivotPreview({ cells: CELLS, definition: cleared.definition });
    expect(preview.sourceRecordCount).toBe(3);
    const filteredPreview = buildPivotPreview({ cells: CELLS, definition: filtered.definition });
    expect(filteredPreview.sourceRecordCount).toBe(2);
  });

  it('rejects an invalid slicer column instead of filtering column zero', () => {
    const change = applyPivotSlicerSelection(DEFINITION, '1', ['Nord']);
    expect(change.applied).toBe(false);
    expect(change.definition).toBe(DEFINITION);
    expect(change.message).toContain('nicht angewendet');
  });

  it('keeps filters of other columns untouched', () => {
    const withOther: GridPivotDefinition = { ...DEFINITION, filters: [{ column: 'B', allowedValues: ['Jan'] }] };
    const change = applyPivotSlicerSelection(withOther, 'A', ['Nord']);
    expect(change.definition.filters).toEqual([
      { column: 'B', allowedValues: ['Jan'] },
      { column: 'A', allowedValues: ['Nord'] },
    ]);
  });
});

describe('Grid Pivot chart view', () => {
  it('derives categories and series from the same model as the table', () => {
    const preview = buildPivotPreview({ cells: CELLS, definition: DEFINITION });
    const chart = buildPivotChartView(preview);
    expect(chart.state).toBe('ready');
    // Hand-computed: Nord = 30, Sued = 5.
    expect(chart.categories).toEqual(['Nord', 'Sued']);
    expect(chart.series[0].points).toEqual([
      { label: 'Nord', value: 30 },
      { label: 'Sued', value: 5 },
    ]);
    expect(chart.maxValue).toBe(30);
    expect(chart.accessibleSummary).toContain('Nord 30');
    expect(chart.accessibleSummary).toContain('Sued 5');
  });

  it('reports the empty state when the preview has no rows', () => {
    const preview = buildPivotPreview({ cells: CELLS, definition: { ...DEFINITION, sourceRange: 'A1:C1' } });
    const chart = buildPivotChartView(preview);
    expect(chart.state).toBe('empty');
    expect(chart.series).toEqual([]);
    expect(chart.accessibleSummary).toContain('Kein Diagramm');
  });

  it('caps categories and marks the chart partial', () => {
    const cells: Record<string, GridCell> = { A1: { value: 'Region' }, C1: { value: 'Umsatz' } };
    for (let index = 0; index < 30; index++) {
      cells[`A${index + 2}`] = { value: `R${String(index).padStart(2, '0')}` };
      cells[`C${index + 2}`] = { value: index };
    }
    const preview = buildPivotPreview({ cells, definition: { ...DEFINITION, sourceRange: 'A1:C31' } });
    const chart = buildPivotChartView(preview, 8);
    expect(chart.categories).toHaveLength(8);
    expect(chart.state).toBe('partial');
    expect(chart.message).toContain('Teildiagramm');
  });
});
