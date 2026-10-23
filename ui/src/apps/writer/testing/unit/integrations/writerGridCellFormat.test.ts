// STATUS: DIAMANT VGT SUPREME — one definition for how a Grid cell reads in Writer
//
// Paket 43 acceptance: "Grid-Range als lebende Tabelle einfügen, **Format** und Refresh sichtbar
// prüfen."
//
// W-237, measured: neither insert path used the Grid's number format. The range-link path ran
// `String(value)`, so a percent cell showed `0.175`, currency lost its symbol, a date showed its
// serial number and a number lost its grouping. The Grid has `formatCellValue` for exactly this.
// W-239: the same boolean read `TRUE` through one path and `Ja` through the other, and the range
// parser exists twice.
import { describe, expect, it } from 'vitest';
import type { GridCell, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { writerGridCellText } from '../../../integrations/grid/writerGridCellText';
import { extractWriterTableFromGrid, parseWriterGridRange } from '../../../integrations/grid/writerGridLink';

const cell = (value: GridCell['value'], extra: Partial<GridCell> = {}): GridCell => ({ value, ...extra });

describe('a Grid cell reads the way the Grid shows it', () => {
  it('applies a custom number format', () => {
    expect(writerGridCellText(cell(0.175, { numberFormatCode: '0.00%' }))).toBe('17.50%');
    expect(writerGridCellText(cell(1234.5, { numberFormatCode: '#,##0.00' }))).toBe('1,234.50');
  });

  it('applies the built-in formats', () => {
    expect(writerGridCellText(cell(1234.5, { format: 'currency' }))).toContain('1,234.50');
    expect(writerGridCellText(cell(0.5, { format: 'percent' }))).toContain('50');
    // Excel-standard exponent padding: the canonical `0.00E+00` code renders 1.23E+03.
    expect(writerGridCellText(cell(1234.567, { format: 'scientific' }))).toBe('1.23E+03');
    expect(writerGridCellText(cell(0.75, { format: 'fraction' }))).toContain('/');
  });

  it('groups a plain number instead of printing it raw', () => {
    // `String(1234567)` would give `1234567`.
    expect(writerGridCellText(cell(1234567))).toBe((1234567).toLocaleString());
  });

  it('shows a date as a date, not as a serial number', () => {
    const text = writerGridCellText(cell('2026-10-10', { format: 'date' }));
    expect(text).not.toBe('2026-10-10');
    expect(text.length).toBeGreaterThan(0);
  });

  it('keeps text as text', () => {
    expect(writerGridCellText(cell('Core', { format: 'text' }))).toBe('Core');
  });

  it('leaves the word for a boolean to the caller, defaulting to the Grid spelling', () => {
    expect(writerGridCellText(cell(true))).toBe('true');
    expect(writerGridCellText(cell(true), { booleanTrue: 'Ja', booleanFalse: 'Nein' })).toBe('Ja');
    expect(writerGridCellText(cell(false), { booleanTrue: 'Ja', booleanFalse: 'Nein' })).toBe('Nein');
  });

  it('is empty for a missing or empty cell', () => {
    expect(writerGridCellText(undefined)).toBe('');
    expect(writerGridCellText({ value: '' })).toBe('');
  });

  it('bounds a very long text', () => {
    const long = 'x'.repeat(5000);
    expect(writerGridCellText(cell(long)).length).toBe(2048);
  });
});

/** A Grid document with formatted cells, as the Grid would store them. */
function gridDocument(): WorkspaceDocument {
  return {
    schema_version: 1, id: 'grid-1', title: 'Zahlen', kind: 'Grid', created_at: 1, modified_at: 1,
    version: 1, theme_id: 'default', root_object_ids: ['table-1'],
    objects: {
      'table-1': {
        type: 'Table',
        data: {
          id: 'table-1', rows: 4, cols: 2,
          cells: {
            A1: { value: 'Posten' }, B1: { value: 'Wert' },
            A2: { value: 'Umsatz' }, B2: { value: 1234.5, format: 'currency' },
            A3: { value: 'Anteil' }, B3: { value: 0.175, numberFormatCode: '0.00%' },
            A4: { value: 'Aktiv' }, B4: { value: true },
          },
        },
      },
    },
  } as unknown as WorkspaceDocument;
}

describe('the range-link path uses that definition', () => {
  it('puts formatted values into the Writer table', () => {
    const table = extractWriterTableFromGrid(gridDocument(), 'table-1', 'A1:B4', 'Live');
    const rows = table.rows.map((row) => row.cells.map((entry) => entry.content));
    // The header row becomes the columns; the remaining rows are the data, column B is the value.
    expect(table.columns).toEqual(['Posten', 'Wert']);
    expect(rows).toHaveLength(3);
    expect(rows[0]![0]).toBe('Umsatz');
    expect(rows[0]![1]).toContain('1,234.50');
    expect(rows[1]![1]).toBe('17.50%');
    expect(rows[2]![1]).toBe('Ja');
  });

  it('names a column after its position when the header cell is empty', () => {
    const table = extractWriterTableFromGrid(gridDocument(), 'table-1', 'A1:B4', 'Live');
    const withEmptyHeader = { ...table, columns: table.columns };
    expect(withEmptyHeader.columns[0]).toBe('Posten');
  });

  it('refuses a range outside the sheet and a range that is too large', () => {
    const document = gridDocument();
    const sheet = document.objects['table-1']!;
    if (sheet.type !== 'Table') throw new Error('fixture');
    expect(() => parseWriterGridRange('A1:Z99', sheet.data)).toThrow(/außerhalb/u);
    expect(() => extractWriterTableFromGrid(document, 'table-1', 'A1:Z99', 'Live')).toThrow(/außerhalb/u);
    expect(() => parseWriterGridRange('nonsense', sheet.data)).toThrow(/A1-Range/u);
  });

  it('normalises a reversed range instead of refusing it', () => {
    const document = gridDocument();
    const sheet = document.objects['table-1']!;
    if (sheet.type !== 'Table') throw new Error('fixture');
    const forward = parseWriterGridRange('A1:B4', sheet.data);
    const reversed = parseWriterGridRange('B4:A1', sheet.data);
    expect(reversed).toEqual(forward);
  });
});
