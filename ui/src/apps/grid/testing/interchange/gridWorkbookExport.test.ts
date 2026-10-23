// STATUS: PLATIN — structural round-trip counter-checks for Grid Paket 40 (XLSX export) and 41 (ODS).
//
// What these tests DO prove: a Grid document survives Grid -> XLSX/ODS bytes -> platform importer with
// identical values, formulas and the date number format, and the produced container has every mandatory
// OOXML/ODF part.
//
// What they do NOT prove: that Microsoft Excel or LibreOffice opens the file identically. No foreign
// spreadsheet process runs in this environment, so every foreign-program claim stays NOT_TESTED.
import { describe, expect, it } from 'vitest';
import {
  analyzeGridWorkbookExport,
  buildGridWorkbookExport,
  buildGridWorkbookExportFileName,
  GRID_EXPORT_MAX_CELLS,
  GRID_EXPORT_MAX_SHEETS,
  isGridExportFormulaPreserved,
  resolveGridWorkbookExportFormat,
} from '../../interchange/gridWorkbookExport';
import {
  createGridRoundTripFixtureDocument,
  runGridWorkbookPackageRoundTrip,
} from '../../interchange/gridRoundtripTestSuite';
import { importOdsWorkbook, GRID_IMPORT_MAX_ODS_SHEETS } from '../../interchange/gridXlsxOdsRoundtrip';
import type { GridCell, WorkspaceDocument } from '../../../../shared/contracts/workspace';

function gridDocument(cells: Record<string, GridCell>, title = 'Export Fixture', rows = 5, cols = 3): WorkspaceDocument {
  const tableId = 't1';
  const sheetId = 's1';
  return {
    schema_version: 1, id: 'doc-1', title, kind: 'Grid',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default',
    root_object_ids: [tableId],
    objects: { [tableId]: { type: 'Table', data: { id: tableId, rows, cols, cells } } },
    gridData: { sheets: [{ id: sheetId, name: 'Daten', tableObjectId: tableId }], activeSheetId: sheetId, namedRanges: [] },
  } as unknown as WorkspaceDocument;
}

describe('Grid XLSX export: real package, real round trip (AST-0437/0440)', () => {
  it('exports a Grid workbook to a readable XLSX package with every mandatory part', async () => {
    const document = createGridRoundTripFixtureDocument();
    const exported = await buildGridWorkbookExport(document, 'xlsx');
    expect(exported.fileName).toBe('Grid_Roundtrip_Fixture.xlsx');
    expect(exported.bytes.byteLength).toBeGreaterThan(500);
    expect(exported.verifiedParts).toContain('[Content_Types].xml');
    expect(exported.verifiedParts).toContain('xl/workbook.xml');
    expect(exported.verifiedParts).toContain('xl/worksheets/sheet1.xml');
    expect(exported.record.cellCount).toBe(13);
    expect(exported.record.formulaCount).toBe(2);
    expect(exported.record.neutralizedFormulaCount).toBe(0);
  });

  it('round-trips values, formulas and the date format through the platform importer', async () => {
    const document = createGridRoundTripFixtureDocument();
    const report = await runGridWorkbookPackageRoundTrip(document, 'xlsx');

    expect(report.foreignProgramVerified).toBe(false);
    expect(report.verificationScope).toMatch(/NOT_TESTED/u);
    expect(report.sheetNames).toEqual(['Umsatz']);
    expect(report.anomalies).toEqual([]);
    expect(report.valueFidelity).toBe(100);
    expect(report.formulaFidelity).toBe(100);
    expect(report.formatFidelity).toBe(100);
    expect(report.passed).toBe(true);
  });

  it('states explicitly which cell properties are not preserved', () => {
    const record = analyzeGridWorkbookExport(createGridRoundTripFixtureDocument(), 'xlsx');
    expect(record.notPreserved.join(' ')).toMatch(/fills, fonts, borders/u);
    expect(record.notPreserved.join(' ')).toMatch(/charts, pivots/u);
    expect(record.preserved.join(' ')).toMatch(/leading zeros/u);
    expect(record.preserved.join(' ')).toMatch(/formulas inside the OOXML safety gate/u);
  });

  it('reports a formula outside the OOXML safety gate as neutralized instead of hiding the loss', () => {
    const document = gridDocument({ A1: { value: 0, formula: '=HYPERLINK("http://x","y")' }, A2: { value: 1, formula: '=SUM(A1:A1)' } });
    const record = analyzeGridWorkbookExport(document, 'xlsx');
    expect(record.formulaCount).toBe(2);
    expect(record.neutralizedFormulaCount).toBe(1);
    expect(record.notPreserved.join(' ')).toMatch(/outside the OOXML safety gate/u);
    expect(isGridExportFormulaPreserved('=SUM(A1:A1)')).toBe(true);
    expect(isGridExportFormulaPreserved('=HYPERLINK("http://x","y")')).toBe(false);
    expect(isGridExportFormulaPreserved('='.concat('a'.repeat(20_000)))).toBe(false);
    expect(isGridExportFormulaPreserved(undefined)).toBe(false);
  });

  it('neutralises an injected formula into inert text on the real package path', async () => {
    const document = gridDocument({ A1: { value: 'x', formula: '=WEBSERVICE("http://evil")' } });
    const exported = await buildGridWorkbookExport(document, 'xlsx');
    const { importXlsx } = await import('../../../../platform/interop/xlsx');
    const reimported = await importXlsx(exported.bytes, exported.fileName);
    const sheet = reimported.gridData!.sheets[0]!;
    const table = reimported.objects[sheet.tableObjectId];
    if (table?.type !== 'Table') throw new Error('table missing');
    // The dangerous formula must not survive as an executable formula.
    expect(table.data.cells.A1?.formula).toBeUndefined();
    expect(String(table.data.cells.A1?.value)).toContain('WEBSERVICE');
  });
});

describe('Grid ODS export: real package, real round trip (AST-0442/0445)', () => {
  it('exports a valid ODF package with the correct mimetype entry', async () => {
    const exported = await buildGridWorkbookExport(createGridRoundTripFixtureDocument(), 'ods');
    expect(exported.fileName).toBe('Grid_Roundtrip_Fixture.ods');
    expect(exported.verifiedParts).toContain('mimetype');
    expect(exported.verifiedParts).toContain('content.xml');
    expect(exported.verifiedParts).toContain('META-INF/manifest.xml');
  });

  it('round-trips values and formulas through the platform ODS importer', async () => {
    const report = await runGridWorkbookPackageRoundTrip(createGridRoundTripFixtureDocument(), 'ods');
    expect(report.anomalies).toEqual([]);
    expect(report.valueFidelity).toBe(100);
    expect(report.formulaFidelity).toBe(100);
    expect(report.passed).toBe(true);
  });

  it('refuses a dense sheet whose rows × cols would make the ODS writer do unbounded work', async () => {
    const document = gridDocument({ A1: { value: 1 } }, 'Dense', 1_048_576, 16_384);
    await expect(buildGridWorkbookExport(document, 'ods')).rejects.toThrow('grid_export_dense_limit:Daten');
    // The XLSX writer is sparse, so the same document is still exportable there.
    const xlsx = await buildGridWorkbookExport(document, 'xlsx');
    expect(xlsx.record.cellCount).toBe(1);
  });
});

describe('Grid workbook export: format, naming and budget decisions', () => {
  it('resolves the format from an extension or a bare format token', () => {
    expect(resolveGridWorkbookExportFormat('Buch.XLSX')).toBe('xlsx');
    expect(resolveGridWorkbookExportFormat('ods')).toBe('ods');
    expect(() => resolveGridWorkbookExportFormat('csv')).toThrow('grid_export_format_unsupported');
    expect(resolveGridWorkbookExportFormat('xlsx ')).toBe('xlsx');
  });

  it('produces a deterministic, filesystem-safe file name', () => {
    expect(buildGridWorkbookExportFileName('Q3 / 2026: Umsatz*Bericht', 'xlsx')).toBe('Q3_2026_Umsatz_Bericht.xlsx');
    expect(buildGridWorkbookExportFileName('', 'ods')).toBe('Grid_Workbook.ods');
    expect(buildGridWorkbookExportFileName('Ä'.repeat(500), 'xlsx').length).toBeLessThanOrEqual(124);
  });

  it('refuses a non-Grid document, an empty workbook and over-budget inputs', () => {
    expect(() => analyzeGridWorkbookExport({ ...gridDocument({}), kind: 'Writer' } as unknown as WorkspaceDocument, 'xlsx'))
      .toThrow('grid_export_source_not_grid');
    const empty = gridDocument({});
    (empty.gridData as { sheets: unknown[] }).sheets = [];
    expect(() => analyzeGridWorkbookExport(empty, 'xlsx')).toThrow('grid_export_no_worksheets');

    const many = gridDocument({});
    const sheet = (many.gridData as { sheets: unknown[] }).sheets[0] as Record<string, unknown>;
    (many.gridData as { sheets: unknown[] }).sheets = Array.from({ length: GRID_EXPORT_MAX_SHEETS + 1 }, (_, index) => ({ ...sheet, id: `s${index}` }));
    expect(() => analyzeGridWorkbookExport(many, 'xlsx')).toThrow('grid_export_sheet_limit');
  });

  it('refuses a workbook above the cell budget that the platform importers can read back', () => {
    const cells: Record<string, GridCell> = {};
    for (let row = 0; row < Math.ceil((GRID_EXPORT_MAX_CELLS + 1) / 256); row++) {
      for (let col = 0; col < 256; col++) cells[`${columnLetter(col)}${row + 1}`] = { value: 1 };
    }
    expect(Object.keys(cells).length).toBeGreaterThan(GRID_EXPORT_MAX_CELLS);
    expect(() => analyzeGridWorkbookExport(gridDocument(cells, 'Big', 2_000, 256), 'xlsx')).toThrow('grid_export_cell_limit');
  });

  it('reports sheets without a table object as skipped instead of dropping them silently', () => {
    const document = gridDocument({ A1: { value: 1 } });
    (document.gridData as { sheets: unknown[] }).sheets = [
      ...(document.gridData as { sheets: unknown[] }).sheets,
      { id: 's2', name: 'Leer', tableObjectId: 'missing' },
    ];
    const record = analyzeGridWorkbookExport(document, 'xlsx');
    expect(record.sheetCount).toBe(1);
    expect(record.skippedSheetNames).toEqual(['Leer']);
  });
});

describe('Grid ODS import: LibreOffice emission style (AST-0441/0442)', () => {
  const multiSheetOds = `<office:document-content><office:body><office:spreadsheet>
    <table:table table:name="Q1">
      <table:table-row><table:table-cell><text:p>Monat</text:p></table:table-cell><table:table-cell><text:p>Umsatz</text:p></table:table-cell></table:table-row>
      <table:table-row><table:table-cell><text:p>Jan</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="100"><text:p>100</text:p></table:table-cell></table:table-row>
    </table:table>
    <table:table table:name="Q2">
      <table:table-row><table:table-cell table:number-columns-repeated="2"><text:p>leer</text:p></table:table-cell><table:table-cell><text:p>danach</text:p></table:table-cell></table:table-row>
    </table:table>
  </office:spreadsheet></office:body></office:document-content>`;

  it('keeps worksheets separate instead of flattening them into one sheet', () => {
    const workbook = importOdsWorkbook(multiSheetOds);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['Q1', 'Q2']);
    expect(workbook.sheets[0]?.cells.A1).toBe('Monat');
    expect(workbook.sheets[1]?.cells.A1).toBe('leer');
  });

  it('honours number-columns-repeated so following cells keep their real column', () => {
    const workbook = importOdsWorkbook(multiSheetOds);
    const q2 = workbook.sheets[1]!;
    // A repeated filled cell cannot be expanded without inventing data: it stays at A1...
    expect(q2.cells.A1).toBe('leer');
    // ...and "danach" must land in column C, not column B.
    expect(q2.cells.C1).toBe('danach');
    expect(q2.cells.B1).toBeUndefined();
    expect(q2.skippedNotes.join(' ')).toMatch(/wiederholte Zelle/u);
  });

  it('honours number-rows-repeated and office:value / table:formula', () => {
    const xml = `<office:spreadsheet><table:table table:name="R">
      <table:table-row table:number-rows-repeated="3"><table:table-cell office:value-type="float" office:value="7"><text:p>7</text:p></table:table-cell></table:table-row>
      <table:table-row><table:table-cell table:formula="of:=SUM([.A1:.A3])"><text:p>21</text:p></table:table-cell></table:table-row>
    </table:table></office:spreadsheet>`;
    const sheet = importOdsWorkbook(xml).sheets[0]!;
    expect(sheet.cells.A1).toBe('7');
    expect(sheet.cells.A2).toBe('7');
    expect(sheet.cells.A3).toBe('7');
    expect(sheet.cells.A4).toBe('=SUM(A1:A3)');
  });

  it('refuses an ODS document with no worksheet and bounds the sheet count', () => {
    expect(() => importOdsWorkbook('<office:spreadsheet></office:spreadsheet>')).toThrow('grid_import_ods_no_worksheets');
    const many = `<office:spreadsheet>${Array.from({ length: GRID_IMPORT_MAX_ODS_SHEETS + 3 }, (_, index) => `<table:table table:name="S${index}"><table:table-row><table:table-cell><text:p>x</text:p></table:table-cell></table:table-row></table:table>`).join('')}</office:spreadsheet>`;
    const workbook = importOdsWorkbook(many);
    expect(workbook.sheets).toHaveLength(GRID_IMPORT_MAX_ODS_SHEETS);
    expect(workbook.truncatedSheets).toBe(true);
  });

  it('rejects an oversized repeat attribute instead of expanding it', () => {
    const xml = `<office:spreadsheet><table:table table:name="X"><table:table-row table:number-rows-repeated="999999999"><table:table-cell><text:p>x</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet>`;
    expect(() => importOdsWorkbook(xml)).toThrow('grid_import_repeat_limit');
  });

  it('rejects a formula longer than the formula budget', () => {
    const xml = `<office:spreadsheet><table:table table:name="F"><table:table-row><table:table-cell table:formula="of:=${'1+'.repeat(9_000)}1"><text:p/></table:table-cell></table:table-row></table:table></office:spreadsheet>`;
    expect(() => importOdsWorkbook(xml)).toThrow('grid_import_formula_limit');
  });
});

function columnLetter(col: number): string {
  let c = col + 1;
  let out = '';
  while (c > 0) {
    const rem = (c - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    c = Math.floor((c - 1) / 26);
  }
  return out;
}
