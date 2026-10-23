// STATUS: DIAMANT VGT SUPREME — Grid interoperability test suite.
//
// Honesty contract: this module only reports what it actually measured.
//   * "import parser round trip" = in-memory parse → serialize → parse with the *local* parsers.
//   * "package round trip"       = a real OOXML/ODF ZIP produced by the writers, re-opened by the
//                                  platform importers, compared cell by cell.
//   * A real Microsoft Excel / LibreOffice round trip is **not** performed here and is therefore
//     reported as `foreignProgramVerified: false` on every result.

import {
  importXlsxXml,
  importOdsWorkbook,
  importCsvTsv,
  exportCellsToCsv,
  importSpreadsheetDocument,
} from './gridXlsxOdsRoundtrip';
import { buildGridWorkbookExport, type GridWorkbookExportFormat } from './gridWorkbookExport';
import { importXlsx } from '../../../platform/interop/xlsx';
import { importOds } from '../../../platform/interop/ods';
import type { GridCell, WorkspaceDocument } from '../../../shared/contracts/workspace';

export interface GridTestResult {
  format: string;
  passed: boolean;
  score: number;
  cellFidelity: number;
  formulaFidelity: number;
  anomalies: string[];
  /** Always false in this environment: no Excel/LibreOffice process is executed here. */
  foreignProgramVerified: boolean;
  verificationScope: string;
}

export interface GridFidelityReport {
  overallPassed: boolean;
  averageScore: number;
  timestamp: number;
  tests: GridTestResult[];
  /** Explicit statement of what this run does and does not prove. */
  scopeStatement: string;
}

const FOREIGN_PROGRAM_SCOPE = 'Nur lokale Parser/Writer und Paketstruktur geprüft; Excel/LibreOffice wurde NICHT ausgeführt (NOT_TESTED).';

function fidelity(expected: Record<string, string>, actual: Record<string, string>): { fidelity: number; anomalies: string[] } {
  const anomalies: string[] = [];
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  if (keys.size === 0) return { fidelity: 100, anomalies: ['keine Zellen verglichen'] };
  let matched = 0;
  for (const key of [...keys].sort()) {
    const left = expected[key];
    const right = actual[key];
    if (left === right) { matched += 1; continue; }
    if (anomalies.length < 8) anomalies.push(`${key}: erwartet ${JSON.stringify(left)}, erhalten ${JSON.stringify(right)}`);
  }
  return { fidelity: Math.round((matched / keys.size) * 100), anomalies };
}

function testXlsxImportRoundtrip(): GridTestResult {
  const sheetXml = `<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>100</v></c><c r="C1"><f>SUM(A1:B1)</f><v>100</v></c></row></sheetData>`;
  const shared = `<sst><si><t>Revenue</t></si></sst>`;
  const imported = importXlsxXml(sheetXml, shared);
  const expected = { A1: 'Revenue', B1: '100', C1: '=SUM(A1:B1)' };
  const { fidelity: score, anomalies } = fidelity(expected, imported.cells);
  const formulaOk = imported.cells.C1 === '=SUM(A1:B1)';
  return {
    format: 'XLSX (OpenXML)',
    passed: score === 100 && formulaOk,
    score,
    cellFidelity: score,
    formulaFidelity: formulaOk ? 100 : 0,
    anomalies,
    foreignProgramVerified: false,
    verificationScope: FOREIGN_PROGRAM_SCOPE,
  };
}

function testOdsImportRoundtrip(): GridTestResult {
  // Deliberately uses LibreOffice's real emission style: repeat attributes + office:value + formula.
  const sampleOds = `<office:document-content><office:body><office:spreadsheet>
    <table:table table:name="Umsatz">
      <table:table-row>
        <table:table-cell><text:p>Produkt</text:p></table:table-cell>
        <table:table-cell><text:p>Preis</text:p></table:table-cell>
      </table:table-row>
      <table:table-row>
        <table:table-cell><text:p>Astraea Sovereign</text:p></table:table-cell>
        <table:table-cell office:value-type="float" office:value="499"><text:p>499</text:p></table:table-cell>
      </table:table-row>
      <table:table-row>
        <table:table-cell table:number-columns-repeated="2"/>
      </table:table-row>
    </table:table>
    <table:table table:name="Kosten">
      <table:table-row>
        <table:table-cell office:value-type="float" office:value="12.5"><text:p>12,5</text:p></table:table-cell>
        <table:table-cell table:formula="of:=SUM([.A1:.A1])"><text:p>12,5</text:p></table:table-cell>
      </table:table-row>
    </table:table>
  </office:spreadsheet></office:body></office:document-content>`;

  const workbook = importOdsWorkbook(sampleOds);
  const first = workbook.sheets[0]!;
  const expected = { A1: 'Produkt', B1: 'Preis', A2: 'Astraea Sovereign', B2: '499' };
  const { fidelity: score, anomalies } = fidelity(expected, first.cells);
  if (workbook.sheets.length !== 2) anomalies.push(`Blattanzahl: erwartet 2, erhalten ${workbook.sheets.length}`);
  if (workbook.sheets[1]?.cells.A1 !== '12.5') anomalies.push(`office:value ignoriert: ${String(workbook.sheets[1]?.cells.A1)}`);
  if (workbook.sheets[1]?.cells.B1 !== '=SUM(A1:A1)') anomalies.push(`table:formula ignoriert: ${String(workbook.sheets[1]?.cells.B1)}`);
  const formulaOk = workbook.sheets[1]?.cells.B1 === '=SUM(A1:A1)';
  const sheetOk = workbook.sheets.length === 2 && workbook.sheets[0]?.name === 'Umsatz' && workbook.sheets[1]?.name === 'Kosten';
  return {
    format: 'ODS (OpenDocument)',
    passed: score === 100 && formulaOk && sheetOk,
    score,
    cellFidelity: score,
    formulaFidelity: formulaOk ? 100 : 0,
    anomalies,
    foreignProgramVerified: false,
    verificationScope: FOREIGN_PROGRAM_SCOPE,
  };
}

function testCsvRoundtrip(): GridTestResult {
  const original: Record<string, string> = { A1: 'Region', B1: 'Sales', A2: 'Europe', B2: '00150', A3: 'North America', B3: '22000' };
  const csv = exportCellsToCsv(original, 3, 2);
  const reimported = importCsvTsv(csv);
  const { fidelity: score, anomalies } = fidelity(original, reimported.cells);
  return {
    format: 'CSV / TSV',
    passed: score === 100,
    score,
    cellFidelity: score,
    formulaFidelity: 100,
    anomalies,
    foreignProgramVerified: false,
    verificationScope: FOREIGN_PROGRAM_SCOPE,
  };
}

function testJsonRoundtrip(): GridTestResult {
  const original: Record<string, string> = { A1: 'Metric', B1: 'Value', A2: 'Throughput', B2: '98.5' };
  const imported = importSpreadsheetDocument(JSON.stringify(original), 'data.json', 'json');
  const { fidelity: score, anomalies } = fidelity(original, imported.cells);
  return {
    format: 'JSON Tabular',
    passed: score === 100,
    score,
    cellFidelity: score,
    formulaFidelity: 100,
    anomalies,
    foreignProgramVerified: false,
    verificationScope: FOREIGN_PROGRAM_SCOPE,
  };
}

export function runGridRoundtripTestSuite(): GridFidelityReport {
  const tests: GridTestResult[] = [testXlsxImportRoundtrip(), testOdsImportRoundtrip(), testCsvRoundtrip(), testJsonRoundtrip()];
  const totalScore = tests.reduce((acc, test) => acc + test.score, 0);
  return {
    overallPassed: tests.every((test) => test.passed),
    averageScore: Math.round(totalScore / tests.length),
    timestamp: Date.now(),
    tests,
    scopeStatement: `${FOREIGN_PROGRAM_SCOPE} Geprüft wurden Parser, Writer, Paketstruktur und Werte-/Formelerhalt innerhalb dieser Anwendung.`,
  };
}

export interface GridPackageRoundTripReport {
  format: GridWorkbookExportFormat;
  packageBytes: number;
  verifiedParts: string[];
  sheetNames: string[];
  cellFidelity: number;
  valueFidelity: number;
  formulaFidelity: number;
  formatFidelity: number;
  anomalies: string[];
  passed: boolean;
  foreignProgramVerified: false;
  verificationScope: string;
}

function cellKeyCompare(
  expected: Record<string, GridCell>,
  actual: Record<string, GridCell>,
): { valueFidelity: number; formulaFidelity: number; formatFidelity: number; anomalies: string[] } {
  const anomalies: string[] = [];
  let compared = 0;
  let valueMatches = 0;
  let formulaCompared = 0;
  let formulaMatches = 0;
  let formatCompared = 0;
  let formatMatches = 0;

  for (const [coord, cell] of Object.entries(expected)) {
    if (cell.value === '' && !cell.formula) continue;
    compared += 1;
    const other = actual[coord];
    const expectedText = cell.formula ?? String(cell.value ?? '');
    const actualText = other?.formula ?? String(other?.value ?? '');
    if (expectedText === actualText) valueMatches += 1;
    else if (anomalies.length < 10) anomalies.push(`${coord}: erwartet ${JSON.stringify(expectedText)}, erhalten ${JSON.stringify(actualText)}`);
    if (cell.formula) {
      formulaCompared += 1;
      if (other?.formula === cell.formula) formulaMatches += 1;
    }
    if (cell.format === 'date') {
      formatCompared += 1;
      if (other?.format === 'date') formatMatches += 1;
    }
  }
  return {
    valueFidelity: compared ? Math.round((valueMatches / compared) * 100) : 100,
    formulaFidelity: formulaCompared ? Math.round((formulaMatches / formulaCompared) * 100) : 100,
    formatFidelity: formatCompared ? Math.round((formatMatches / formatCompared) * 100) : 100,
    anomalies,
  };
}

function tableOf(document: WorkspaceDocument, sheetIndex: number): Record<string, GridCell> {
  const sheet = document.gridData!.sheets[sheetIndex]!;
  const object = document.objects[sheet.tableObjectId];
  if (!object || object.type !== 'Table') throw new Error('grid_roundtrip_table_missing');
  return object.data.cells;
}

/**
 * Real package round trip: Grid document → OOXML/ODF bytes → platform importer → cell comparison.
 * This is the strongest structural evidence available without Excel/LibreOffice.
 */
export async function runGridWorkbookPackageRoundTrip(
  document: WorkspaceDocument,
  format: GridWorkbookExportFormat,
): Promise<GridPackageRoundTripReport> {
  const exported = await buildGridWorkbookExport(document, format);
  const reimported = format === 'xlsx'
    ? await importXlsx(exported.bytes, exported.fileName)
    : await importOds(exported.bytes, exported.fileName);

  const sourceSheets = document.gridData!.sheets;
  const anomalies: string[] = [];
  let valueFidelitySum = 0;
  let formulaFidelitySum = 0;
  let formatFidelitySum = 0;
  let comparedSheets = 0;

  const targetSheets = reimported.gridData?.sheets ?? [];
  if (targetSheets.length !== sourceSheets.length) {
    anomalies.push(`Blattanzahl: erwartet ${sourceSheets.length}, erhalten ${targetSheets.length}`);
  }

  for (let index = 0; index < Math.min(sourceSheets.length, targetSheets.length); index++) {
    const expected = tableOf(document, index);
    const actual = tableOf(reimported, index);
    const compared = cellKeyCompare(expected, actual);
    valueFidelitySum += compared.valueFidelity;
    formulaFidelitySum += compared.formulaFidelity;
    formatFidelitySum += compared.formatFidelity;
    comparedSheets += 1;
    for (const anomaly of compared.anomalies) anomalies.push(`Blatt ${index + 1}: ${anomaly}`);
  }

  const divisor = Math.max(1, comparedSheets);
  const valueFidelity = Math.round(valueFidelitySum / divisor);
  const formulaFidelity = Math.round(formulaFidelitySum / divisor);
  const formatFidelity = Math.round(formatFidelitySum / divisor);
  const cellFidelity = Math.round((valueFidelity + formulaFidelity + formatFidelity) / 3);

  return {
    format,
    packageBytes: exported.bytes.byteLength,
    verifiedParts: exported.verifiedParts,
    sheetNames: targetSheets.map((sheet) => sheet.name),
    cellFidelity,
    valueFidelity,
    formulaFidelity,
    formatFidelity,
    anomalies: anomalies.slice(0, 32),
    passed: valueFidelity === 100 && formulaFidelity === 100 && anomalies.length === 0,
    foreignProgramVerified: false,
    verificationScope: `${FOREIGN_PROGRAM_SCOPE} Nachgewiesen wurden ZIP-Paketstruktur, Pflichtteile, Werte, Formeln und das Datumsformat über den eigenen Plattform-Importer.`,
  };
}

/** Builds the deterministic fixture used by the package round-trip test and the evidence run. */
export function createGridRoundTripFixtureDocument(): WorkspaceDocument {
  const cells: Record<string, GridCell> = {
    A1: { value: 'Produkt' },
    B1: { value: 'Umsatz' },
    C1: { value: 'Marge' },
    A2: { value: 'Astraea Sovereign' },
    B2: { value: 1000 },
    C2: { value: 250, formula: '=B2*0.25' },
    A3: { value: 'VGT Core' },
    B3: { value: 0.5 },
    C3: { value: 0, formula: '=SUM(B2:B3)' },
    A4: { value: '00123' },
    B4: { value: true },
    C4: { value: '2026-09-28', format: 'date' },
    A5: { value: 1_234_567_890_123 },
  };
  const tableId = 'grid-roundtrip-table-1';
  const sheetId = 'grid-roundtrip-sheet-1';
  return {
    schema_version: 1,
    id: 'grid-roundtrip-doc',
    title: 'Grid Roundtrip Fixture',
    kind: 'Grid',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [tableId],
    objects: { [tableId]: { type: 'Table', data: { id: tableId, rows: 5, cols: 3, cells } } },
    gridData: { sheets: [{ id: sheetId, name: 'Umsatz', tableObjectId: tableId }], activeSheetId: sheetId, namedRanges: [] },
  } as unknown as WorkspaceDocument;
}
