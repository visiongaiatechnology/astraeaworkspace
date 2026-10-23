// STATUS: PLATIN — rendered checks for the Excel-like pivot builder UI.
//
// The rendered assertions run against `renderToStaticMarkup` (headless Node, no
// DOM). The source-contract assertions (drag handlers present, text-syntax fields
// absent) live in the sibling `GridPivotPanel.contract.test.mjs`, which can read
// the source file without pulling Node types into this TSX test.

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GridPivotPanel } from '../../pivots/GridPivotPanel';
import { MAX_PIVOT_BUILDER_FIELDS } from '../../pivots/gridPivotBuilder';
import type { GridCell } from '../../../../shared/contracts/grid/workspaceGrid';

// Fixture: header row 1 (Region, Monat, Umsatz), data rows A2:C5.
const CELLS: Record<string, GridCell> = {
  A1: { value: 'Region' }, B1: { value: 'Monat' }, C1: { value: 'Umsatz' },
  A2: { value: 'Nord' }, B2: { value: 'Jan' }, C2: { value: 10 },
  A3: { value: 'Nord' }, B3: { value: 'Feb' }, C3: { value: 20 },
  A4: { value: 'Sued' }, B4: { value: 'Jan' }, C4: { value: 5 },
  A5: { value: 'Sued' }, B5: { value: 'Feb' }, C5: { value: 7 },
};

const noop = (): void => undefined;

const baseProps = {
  sheet: { id: 'sheet-1', name: 'Umsatz', tableObjectId: 'table-1' },
  cells: CELLS,
  dataModelTables: [],
  onCreatePivot: noop,
  onUpdatePivot: noop,
  onUpdateDataModel: noop,
};

describe('GridPivotPanel — field builder instead of DSL text syntax', () => {
  it('renders the four drop zones with their field counts', () => {
    const markup = renderToStaticMarkup(<GridPivotPanel {...baseProps} />);
    expect(markup).toContain('data-pivot-zone="rows"');
    expect(markup).toContain('data-pivot-zone="columns"');
    expect(markup).toContain('data-pivot-zone="values"');
    expect(markup).toContain('data-pivot-zone="filters"');
    expect(markup).toContain('Feld hier ablegen oder');
    expect(markup).toContain('+ Zeile');
    expect(markup).toContain('+ Wert');
  });

  it('lists the source fields as draggable chips with a keyboard add button each', () => {
    const markup = renderToStaticMarkup(<GridPivotPanel {...baseProps} />);
    for (const column of ['A', 'B', 'C']) {
      expect(markup).toContain(`data-pivot-source-chip="${column}"`);
      for (const zone of ['rows', 'columns', 'values', 'filters']) {
        expect(markup).toContain(`data-pivot-add="${zone}:${column}"`);
      }
    }
    expect(markup).toContain('draggable="true"');
    // The add buttons are real buttons with an accessible name, not pointer-only drag.
    expect(markup).toContain('aria-label="Region zu Zeilen hinzufuegen"');
    expect(markup).toContain('aria-label="Umsatz als Summe zu den Werten hinzufuegen"');
  });

  it('offers the aggregate menu with a concrete option per aggregate', () => {
    const markup = renderToStaticMarkup(<GridPivotPanel {...baseProps} />);
    expect(markup).toContain('data-pivot-aggregate-menu');
    for (const aggregation of ['sum', 'count', 'average', 'min', 'max', 'distinct_count']) {
      expect(markup).toContain(`<option value="${aggregation}"`);
    }
    for (const label of ['Summe', 'Anzahl', 'Mittelwert', 'Minimum', 'Maximum', 'Anzahl eindeutiger Werte']) {
      expect(markup).toContain(label);
    }
  });

  it('shows the live preview state and the blockers for an incomplete configuration', () => {
    const markup = renderToStaticMarkup(<GridPivotPanel {...baseProps} />);
    expect(markup).toContain('data-pivot-preview-state="empty"');
    expect(markup).toContain('Noch keine Konfiguration: Zeilen- und Wertefelder');
    expect(markup).toContain('Mindestens ein Zeilenfeld');
    expect(markup).toContain('Mindestens ein Wert');
    // The create button is a real disabled button, not a hidden no-op.
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('data-pivot-create="true"');
  });

  it('renders stored pivots with a bounded preview and keyboard collapse controls', () => {
    const sheet = {
      ...baseProps.sheet,
      pivots: [{
        id: 'pivot-1',
        name: 'Umsatz je Region',
        sourceRange: 'A1:C5',
        rowColumn: 'A',
        valueColumn: 'C',
        aggregation: 'sum' as const,
        rowColumns: ['A'],
        valueFields: [{ column: 'C', aggregation: 'sum' as const }],
      }],
    };
    const markup = renderToStaticMarkup(<GridPivotPanel {...baseProps} sheet={sheet} />);
    expect(markup).toContain('Umsatz je Region');
    expect(markup).toContain('data-stored-pivot-state=');
    // Hand-computed group sums: Nord 30, Sued 12.
    expect(markup).toContain('Nord');
    expect(markup).toContain('Sued');
    expect(markup).toContain('Zuklappen: Nord');
  });

  it('stays usable with many fields and very long field names', () => {
    const longLabel = `Umsatz ${'sehr langer Feldname '.repeat(8)}Ende`;
    const cells: Record<string, GridCell> = { A1: { value: longLabel } };
    for (let index = 0; index < 40; index++) {
      const column = String.fromCharCode(66 + (index % 24));
      cells[`${column}1`] = { value: `Feld ${index}` };
    }
    const markup = renderToStaticMarkup(<GridPivotPanel {...baseProps} cells={cells} />);
    // The long label is rendered (truncated in CSS, never dropped) and the layout is bounded.
    expect(markup).toContain('sehr langer Feldname');
    expect(markup).toContain('truncate');
    expect(markup).toContain('data-pivot-source-chip="A"');
    expect(markup).not.toContain('data-pivot-source-chip="undefined"');
    expect(markup).not.toContain(`data-pivot-source-chip="A${MAX_PIVOT_BUILDER_FIELDS}"`);
  });

  it('never renders the removed text-syntax placeholders in the markup either', () => {
    const markup = renderToStaticMarkup(<GridPivotPanel {...baseProps} />);
    expect(markup).not.toContain('Rows: A,B');
    expect(markup).not.toContain('Values: D:sum,E:average');
    expect(markup).not.toContain('Filters: F=West|East;G=Active');
  });
});
