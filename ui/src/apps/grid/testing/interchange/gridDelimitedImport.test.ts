// STATUS: PLATIN — counter-checks for Grid Paket 39 (CSV/TSV import dialog decision layer).
//
// Every assertion here was written by hand against the stated requirement:
// "UTF-8 und Trennzeichen vorab sehen, Datentypen und führende Nullen erhalten."
import { describe, expect, it } from 'vitest';
import {
  buildGridDelimitedPreview,
  importGridDelimitedText,
  sniffGridDelimitedText,
  GRID_DELIMITED_MAX_PREVIEW_ROWS,
} from '../../interchange/gridDelimitedImport';
import {
  GRID_IMPORT_MAX_BYTES,
  GRID_IMPORT_MAX_COLUMNS,
  GRID_IMPORT_MAX_ROWS,
} from '../../interchange/gridXlsxOdsRoundtrip';

const UMLAUT_CSV = 'Kunde;Ort;Umsatz\nMüller AG;München;1200\nÄhre GmbH;Köln;950';

describe('Grid CSV/TSV import dialog: encoding and delimiter are visible before import', () => {
  it('detects a semicolon file as CSV with semicolon even though the first line has no comma', () => {
    const sniffed = sniffGridDelimitedText(UMLAUT_CSV);
    expect(sniffed.delimiter).toBe(';');
    expect(sniffed.kind).toBe('csv');
    expect(sniffed.columnCount).toBe(3);
    expect(sniffed.confidence).toBe(1);
  });

  it('prefers the consistent delimiter when a quoted value contains a comma', () => {
    // First line contains a comma only inside quotes; the real delimiter is the tab.
    const text = '"Nord, West"\tSüd\t123\n"A, B"\tOst\t45';
    expect(sniffGridDelimitedText(text).delimiter).toBe('\t');
  });

  it('reports UTF-8 without BOM and keeps umlauts intact', () => {
    const preview = buildGridDelimitedPreview(UMLAUT_CSV);
    expect(preview.encoding).toBe('utf-8');
    expect(preview.encodingLabel).toContain('ohne BOM');
    expect(preview.delimiterLabel).toBe('Semikolon');
    expect(preview.previewRows[1]).toEqual(['Müller AG', 'München', '1200']);
  });

  it('reports a BOM explicitly and does not leak it into the first cell', () => {
    const preview = buildGridDelimitedPreview(`\uFEFFID,Wert\n1,a`);
    expect(preview.encoding).toBe('utf-8-bom');
    expect(preview.bomDetected).toBe(true);
    const imported = importGridDelimitedText(`\uFEFFID,Wert\n1,a`);
    expect(imported.cells.A1).toBe('ID');
  });

  it('flags a lossy decode instead of pretending the file was clean UTF-8', () => {
    const preview = buildGridDelimitedPreview('Name,Wert\nM\uFFFdller,1');
    expect(preview.encoding).toBe('utf-8-lossy');
    expect(preview.replacementCharacters).toBe(1);
    expect(preview.warnings.join(' ')).toMatch(/Ersatzzeichen/u);
  });

  it('reports the line ending style, including mixed files', () => {
    expect(buildGridDelimitedPreview('a,b\r\nc,d').lineEnding).toBe('crlf');
    expect(buildGridDelimitedPreview('a,b\nc,d').lineEnding).toBe('lf');
    expect(buildGridDelimitedPreview('a,b\r\nc,d\ne,f').lineEnding).toBe('mixed');
  });
});

describe('Grid CSV/TSV import dialog: data types and leading zeros', () => {
  it('protects a leading-zero column from numeric typing', () => {
    const preview = buildGridDelimitedPreview('PLZ,Einwohner\n00123,4500\n01067,52000');
    const [plz, inhabitants] = preview.columns;
    expect(plz?.inferredType).toBe('text');
    expect(plz?.leadingZeroProtected).toBe(true);
    expect(inhabitants?.inferredType).toBe('number');

    const imported = importGridDelimitedText('PLZ,Einwohner\n00123,4500\n01067,52000');
    expect(imported.cells.A2).toBe('00123');
    expect(imported.cells.A3).toBe('01067');
    expect(imported.preview.warnings.join(' ')).toMatch(/Führende Nullen/u);
  });

  it('does not coerce a long digit string into a number', () => {
    const preview = buildGridDelimitedPreview('IBAN,Konto\nDE89370400440532013000,0000000001');
    expect(preview.columns.every((column) => column.inferredType === 'text')).toBe(true);
    const imported = importGridDelimitedText('IBAN,Konto\nDE89370400440532013000,0000000001');
    expect(imported.cells.B2).toBe('0000000001');
  });

  it('keeps numeric and boolean columns as reported by the preview', () => {
    const preview = buildGridDelimitedPreview('Menge,Aktiv\n12,true\n7,false');
    expect(preview.columns.map((column) => column.inferredType)).toEqual(['number', 'boolean']);
  });

  it('falls back to text when a column mixes numbers and words', () => {
    const preview = buildGridDelimitedPreview('Wert\n12\nn/a\n7');
    expect(preview.columns[0]?.inferredType).toBe('text');
  });

  it('honours an explicit text override even for an all-numeric column', () => {
    const preview = buildGridDelimitedPreview('Jahr\n2024\n2025', { columnTypes: { 0: 'text' } });
    expect(preview.columns[0]?.inferredType).toBe('text');
  });
});

describe('Grid CSV/TSV import dialog: boundaries and fail-closed behaviour', () => {
  it('rejects a file over the UTF-8 byte budget instead of truncating', () => {
    expect(() => buildGridDelimitedPreview('x'.repeat(GRID_IMPORT_MAX_BYTES + 1)))
      .toThrow('grid_import_byte_limit');
  });

  it('rejects a row wider than the sheet ceiling instead of dropping columns', () => {
    const wide = Array.from({ length: GRID_IMPORT_MAX_COLUMNS + 2 }, (_, index) => `c${index}`).join(',');
    expect(() => importGridDelimitedText(wide)).toThrow('grid_import_column_limit');
  });

  it('rejects more than the row ceiling and reports the unclosed quote path', () => {
    const tooManyRows = ['a,b', ...Array.from({ length: GRID_IMPORT_MAX_ROWS + 2 }, () => 'a,b')].join('\n');
    expect(() => importGridDelimitedText(tooManyRows)).toThrow('grid_import_row_limit');
    expect(() => importGridDelimitedText('a,"unterminated')).toThrow('grid_import_unclosed_quote');
  });

  it('marks a bounded preview as truncated and says so to the user', () => {
    const manyRows = ['a,b', ...Array.from({ length: GRID_DELIMITED_MAX_PREVIEW_ROWS + 25 }, (_, index) => `${index},x`)].join('\n');
    const preview = buildGridDelimitedPreview(manyRows);
    expect(preview.truncated).toBe(true);
    expect(preview.warnings.join(' ')).toMatch(/begrenzt/u);
  });

  it('accepts the 50,000 data-row acceptance scenario through the bounded importer', () => {
    const rows = Array.from({ length: 50_000 }, (_, index) => `${index},00123`);
    const text = ['ID,PLZ', ...rows].join('\n');
    const result = importGridDelimitedText(text);
    expect(result.colCount).toBe(10);
    expect(result.cells.A2).toBe('0');
    expect(result.cells.B2).toBe('00123');
    expect(result.cells['A50001']).toBe('49999');
    expect(result.cells['B50001']).toBe('00123');
    expect(Object.keys(result.cells)).toHaveLength(100_002);
  });

  it('keeps empty fields empty and reports dropped blank rows instead of inventing cells', () => {
    const result = importGridDelimitedText('A,B,C\n1,,3\n,,\n4,5,6');
    expect(result.cells.B2).toBeUndefined();
    expect(result.cells.A2).toBe('1');
    expect(result.cells.A4).toBe('4');
    expect(result.skippedNotes.join(' ')).toMatch(/leere Zeile/u);
  });
});
