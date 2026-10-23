// STATUS: PLATIN - hand-written oracles for the bounded structured-table model.

import { describe, expect, it } from 'vitest';
import type { GridCell, GridStructuredTable } from '../../../../shared/contracts/grid/workspaceGrid';
import {
  MAX_STRUCTURED_TABLE_CELLS,
  addStructuredTableRecord,
  describeStructuredTable,
  previewStructuredTable,
  validateTableRange,
} from '../../data/gridStructuredTableModel';

// Fixture "A1:C4": header Region/Menge/Preis plus three records.
const CELLS: Record<string, GridCell> = {
  A1: { value: 'Region' }, B1: { value: 'Menge' }, C1: { value: 'Preis' },
  A2: { value: 'Nord' }, B2: { value: 2 }, C2: { value: 10 },
  A3: { value: 'Sued' }, B3: { value: 3 }, C3: { value: 20 },
  A4: { value: 'Nord' }, B4: { value: 4 }, C4: { value: 30 },
};

const SHEET_ID = 'sheet-1';

describe('Structured table - range validation', () => {
  it('accepts A1:D50 style ranges and rejects malformed ones', () => {
    expect(validateTableRange('A1:D50')).toEqual([]);
    expect(validateTableRange('nonsense').map((issue) => issue.code)).toEqual(['table_range_invalid']);
    expect(validateTableRange('A1:A1').map((issue) => issue.code)).toContain('table_has_no_header_row');
    expect(validateTableRange('A1:Z60000').map((issue) => issue.code)).toContain('table_range_too_many_rows');
    expect(validateTableRange('A1:ZZ50000').map((issue) => issue.code)).toContain('table_range_too_large');
    expect(MAX_STRUCTURED_TABLE_CELLS).toBe(100_000);
  });
});

describe('Structured table - "A1:D50 in Tabelle verwandeln"', () => {
  it('produces a bounded table with inferred numeric columns and headers', () => {
    const result = previewStructuredTable({ range: 'A1:C4', cells: CELLS, existingTables: [], sheetId: SHEET_ID, name: 'Umsatz' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected an accepted table preview');
    expect(result.value.preview).toMatchObject({
      range: 'A1:C4',
      name: 'Umsatz',
      hasHeaders: true,
      hasTotalsRow: false,
      dataRowCount: 3,
      cellCount: 12,
    });
    expect(result.value.preview.columns.map((column) => [column.column, column.name, column.totalFunction])).toEqual([
      ['A', 'Region', 'none'],
      ['B', 'Menge', 'sum'],
      ['C', 'Preis', 'sum'],
    ]);
    // Concrete, colour-free notes explain the inference.
    expect(result.value.preview.columns[1].note).toContain('Summe moeglich');
    expect(result.value.preview.columns[0].note).toContain('Keine Summe');
    expect(describeStructuredTable(result.value.preview)).toBe('Umsatz: 3 Spalten, 3 Datensaetze, 2 numerische Spalte(n), 12 Zellen');
  });

  it('bakes the header row into the table so it stays a header when it was empty', () => {
    const table = previewStructuredTable({ range: 'A1:B3', cells: { A1: { value: 'Name' }, B1: { value: '' }, A2: { value: 'x' }, B2: { value: 1 } }, existingTables: [], sheetId: SHEET_ID });
    expect(table.ok).toBe(true);
    if (!table.ok) throw new Error('expected an accepted table preview');
    expect(table.value.updatedCells.B1.value).toBe('Column2');
    expect(table.value.preview.columns.map((column) => column.name)).toEqual(['Name', 'Column2']);
  });

  it('refuses to overlap an existing table', () => {
    const existing: GridStructuredTable = {
      id: 'table-1', name: 'Bestand', sheetId: SHEET_ID, range: 'A1:C4', hasHeaders: true, hasTotalsRow: false,
      columns: [{ name: 'Region' }, { name: 'Menge', totalFunction: 'sum' }, { name: 'Preis', totalFunction: 'sum' }],
    };
    const result = previewStructuredTable({ range: 'B2:D6', cells: CELLS, existingTables: [existing], sheetId: SHEET_ID });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.issues.map((issue) => issue.code)).toEqual(['table_overlaps_existing']);
  });

  it('rejects an invalid range before any cell is touched', () => {
    const snapshot = JSON.stringify(CELLS);
    const result = previewStructuredTable({ range: 'B', cells: CELLS, existingTables: [], sheetId: SHEET_ID });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(CELLS)).toBe(snapshot);
  });
});

describe('Structured table - new record extends formulas and formats', () => {
  const table: GridStructuredTable = {
    id: 'table-1', name: 'Umsatz', sheetId: SHEET_ID, range: 'A1:C4', hasHeaders: true, hasTotalsRow: false,
    columns: [{ name: 'Region' }, { name: 'Menge', totalFunction: 'sum' }, { name: 'Preis', totalFunction: 'sum' }],
  };

  it('grows the range by one row and keeps every existing value', () => {
    const result = addStructuredTableRecord({ table, cells: CELLS, values: { Region: 'West', Menge: 5, Preis: 40 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected an accepted record');
    expect(result.value.tables[0].range).toBe('A1:C5');
    expect(result.value.cells.A5?.value).toBe('West');
    expect(result.value.cells.B5?.value).toBe(5);
    expect(result.value.cells.C5?.value).toBe(40);
    // Every pre-existing record is untouched.
    for (const coord of ['A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4']) {
      expect(result.value.cells[coord]).toEqual(CELLS[coord]);
    }
  });

  it('extends the previous row formula with a shifted relative reference', () => {
    const withFormulas: Record<string, GridCell> = {
      ...CELLS,
      C2: { value: 10, formula: '=B2*5' },
      C3: { value: 20, formula: '=B3*5' },
      C4: { value: 30, formula: '=B4*5' },
    };
    const result = addStructuredTableRecord({ table, cells: withFormulas, values: { Region: 'West', Menge: 5, Preis: 40 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected an accepted record');
    // The new row continues the series instead of copying the literal row.
    expect(result.value.cells.C5?.formula).toBe('=B5*5');
    expect(result.value.applied.some((line) => line.includes('=B5*5'))).toBe(true);
    expect(result.value.applied[0]).toBe('Bereich A1:C4 -> A1:C5');
  });

  it('carries number format and emphasis of the previous data row onto the new record', () => {
    const styled: Record<string, GridCell> = {
      ...CELLS,
      C4: { value: 30, format: 'currency', numberFormatCode: '#,##0.00 ', bold: true, background: '#0f172a', text_color: '#e2e8f0' },
    };
    const result = addStructuredTableRecord({ table, cells: styled, values: { Region: 'West', Menge: 5, Preis: 40 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected an accepted record');
    expect(result.value.cells.C5).toMatchObject({ format: 'currency', numberFormatCode: '#,##0.00 ', bold: true, background: '#0f172a', text_color: '#e2e8f0' });
  });

  it('moves the totals row down instead of overwriting data', () => {
    const withTotals: GridStructuredTable = { ...table, range: 'A1:C5', hasTotalsRow: true };
    const cells: Record<string, GridCell> = {
      ...CELLS,
      A5: { value: 'Summe', bold: true },
      B5: { value: 0, formula: '=SUM(B2:B4)', bold: true },
      C5: { value: 0, formula: '=SUM(C2:C4)', bold: true },
    };
    const result = addStructuredTableRecord({ table: withTotals, cells, values: { Region: 'West', Menge: 5, Preis: 40 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected an accepted record');
    // The table grows by one row; the record takes the freed row.
    expect(result.value.tables[0].range).toBe('A1:C6');
    expect(result.value.cells.A5?.value).toBe('West');
    expect(result.value.cells.B5?.value).toBe(5);
    expect(result.value.cells.C5?.value).toBe(40);
    // The totals row moved down and its formulas were extended over the new record.
    expect(result.value.cells.B6?.formula).toBe('=SUM(B2:B5)');
    expect(result.value.cells.C6?.formula).toBe('=SUM(C2:C5)');
    expect(result.value.applied).toContain('Summenzeile wurde um eine Zeile nach unten verschoben');
    // Regression guard for the fix in this module: the user's totals-row label and
    // every untouched totals cell survive the shift. The canonical auto-expansion
    // path clears that first cell, which is why the shift is done here.
    expect(result.value.cells.A6?.value).toBe('Summe');
    expect(result.value.cells.A6?.bold).toBe(true);
    // Every original data record survives.
    for (const coord of ['A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4']) {
      expect(result.value.cells[coord]).toEqual(CELLS[coord]);
    }
  });

  it('fails closed for an unparseable table range', () => {
    const result = addStructuredTableRecord({ table: { ...table, range: 'kaputt' }, cells: CELLS, values: { Region: 'West' } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.issues[0].code).toBe('table_range_invalid');
  });
});
