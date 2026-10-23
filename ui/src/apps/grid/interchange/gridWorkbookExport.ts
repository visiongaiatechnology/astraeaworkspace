// STATUS: DIAMANT VGT SUPREME — bounded Grid workbook export boundary (XLSX/ODS).
//
// Split of responsibility:
//   * this module owns every *decision* (validation, budgets, preservation record, file naming,
//     structural verification of the produced package).
//   * platform/interop owns the OOXML/ODF *serialization*.
//
// The local export path used to be completely absent: `exportXlsx`/`exportOds` existed in
// platform/interop but nothing in the Grid UI called them. This facade closes that gap and refuses
// inputs that would make the platform serializer do unbounded work.
import type { GridCell, TableObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { exportXlsx } from '../../../platform/interop/xlsx';
import { exportOds } from '../../../platform/interop/ods';
import { readZip } from '../../../platform/interop/zip';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { FORMULA_MAX_LENGTH } from '../formulas/formulaContract';

export type GridWorkbookExportFormat = 'xlsx' | 'ods';

/** Mirrors the platform importer/importer-side budget so an exported book can always be re-read. */
export const GRID_EXPORT_MAX_CELLS = 250_000;
/** XLSX/ODS worksheet ceilings used by the beta importers. */
export const GRID_EXPORT_MAX_SHEETS = 256;
/** `exportOds` walks `rows × cols` densely; anything above this would allocate an unbounded amount of work. */
export const GRID_EXPORT_MAX_DENSE_DIMENSION_CELLS = 1_000_000;
export const GRID_EXPORT_MAX_TITLE_CHARS = 120;
export const GRID_EXPORT_MAX_SHEET_NAME_CHARS = 31;

/** Exactly the OOXML formula gate applied by `platform/interop/xlsx.ts#cellXml`. */
const XLSX_FORMULA_BODY_PATTERN = /^[\p{L}\p{N}_.$()+\-*/^%,:!<>=\s"']+$/u;
const XLSX_FORMULA_REJECT_PATTERN =
  /\[[^\]\r\n]{1,1024}\]|\b(?:HYPERLINK|WEBSERVICE|RTD|DDE|CALL|REGISTER\.ID|EXEC|EVALUATE|FILTERXML)\s*\(|(?:https?|file):\/\//iu;

export interface GridWorkbookExportRecord {
  format: GridWorkbookExportFormat;
  sheetCount: number;
  exportedSheetNames: string[];
  skippedSheetNames: string[];
  cellCount: number;
  formulaCount: number;
  /** Cells whose formula is neutralized into an inert literal by the XLSX writer. Always 0 for ODS. */
  neutralizedFormulaCount: number;
  dateFormattedCellCount: number;
  preserved: readonly string[];
  notPreserved: readonly string[];
}

export interface GridWorkbookExportResult {
  bytes: Uint8Array;
  fileName: string;
  record: GridWorkbookExportRecord;
  /** Package parts proven to exist after re-reading the produced bytes. */
  verifiedParts: string[];
}

const PRESERVED_COMMON = Object.freeze([
  'cell values (string / number / boolean)',
  'A1 sparse coordinates',
  'worksheet names and workbook sheet order',
  'leading zeros and long digit strings (kept as text, never coerced to a number)',
]);

const NOT_PRESERVED_COMMON = Object.freeze([
  'cell fills, fonts, borders and alignment beyond the single date number format',
  'conditional formatting, data validation and cell comments',
  'merged cells, row/column sizes and freeze panes',
  'charts, pivots, slicers, images and other drawing objects',
  'named ranges, structured table definitions and sheet protection',
  'cluster order / collaborative metadata',
]);

export function resolveGridWorkbookExportFormat(fileNameOrFormat: string): GridWorkbookExportFormat {
  const lowered = fileNameOrFormat.trim().toLowerCase();
  if (lowered === 'xlsx' || lowered.endsWith('.xlsx')) return 'xlsx';
  if (lowered === 'ods' || lowered.endsWith('.ods')) return 'ods';
  throw new Error('grid_export_format_unsupported');
}

/** True when `platform/interop/xlsx.ts` would keep the formula; false means it becomes an inert literal. */
export function isGridExportFormulaPreserved(formula: string | undefined): boolean {
  if (!formula) return false;
  const body = formula.trim().startsWith('=') ? formula.trim().slice(1).trim() : formula.trim();
  if (!body || body.length > FORMULA_MAX_LENGTH) return false;
  if (!XLSX_FORMULA_BODY_PATTERN.test(body)) return false;
  return !XLSX_FORMULA_REJECT_PATTERN.test(body);
}

function exportableSheets(document: WorkspaceDocument): Array<{ name: string; table: TableObject }> {
  if (document.kind !== 'Grid' || !document.gridData) throw new Error('grid_export_source_not_grid');
  const sheets = document.gridData.sheets;
  if (!sheets.length) throw new Error('grid_export_no_worksheets');
  if (sheets.length > GRID_EXPORT_MAX_SHEETS) throw new Error('grid_export_sheet_limit');
  const usable: Array<{ name: string; table: TableObject }> = [];
  for (const sheet of sheets) {
    const object = document.objects[sheet.tableObjectId];
    if (object?.type === 'Table') usable.push({ name: sheet.name, table: object.data });
  }
  if (!usable.length) throw new Error('grid_export_no_exportable_worksheets');
  return usable;
}

function assertDimensions(table: TableObject, sheetName: string, format: GridWorkbookExportFormat): void {
  if (!Number.isSafeInteger(table.rows) || !Number.isSafeInteger(table.cols) || table.rows < 0 || table.cols < 0) {
    throw new Error('grid_export_dimension_invalid');
  }
  // `exportOds` iterates rows × cols densely; reject before that loop can run away.
  // The XLSX writer only walks the sparse cell map, so the dense bound applies to ODS alone.
  if (format === 'ods' && table.rows * table.cols > GRID_EXPORT_MAX_DENSE_DIMENSION_CELLS) {
    throw new Error(`grid_export_dense_limit:${sheetName}`);
  }
}

/**
 * Pure pre-flight: validates the document, computes the honest preservation record and throws for
 * every unbounded or unsupported input *before* any serializer runs.
 */
export function analyzeGridWorkbookExport(
  document: WorkspaceDocument,
  format: GridWorkbookExportFormat,
): GridWorkbookExportRecord {
  if (format !== 'xlsx' && format !== 'ods') throw new Error('grid_export_format_unsupported');
  const usable = exportableSheets(document);
  const allSheets = document.gridData!.sheets.map((sheet) => sheet.name);
  const exportedNames = new Set(usable.map((sheet) => sheet.name));

  let cellCount = 0;
  let formulaCount = 0;
  let neutralizedFormulaCount = 0;
  let dateFormattedCellCount = 0;

  for (const { table, name } of usable) {
    assertDimensions(table, name, format);
    for (const [coord, cell] of Object.entries(table.cells)) {
      if (!/^[A-Za-z]{1,3}[1-9]\d{0,6}$/.test(coord)) throw new Error('grid_export_coordinate_invalid');
      cellCount += 1;
      if (cellCount > GRID_EXPORT_MAX_CELLS) throw new Error('grid_export_cell_limit');
      if (isGridExportFormulaCell(cell)) {
        formulaCount += 1;
        if (format === 'xlsx' && !isGridExportFormulaPreserved(cell.formula)) neutralizedFormulaCount += 1;
      }
      if (cell.format === 'date') dateFormattedCellCount += 1;
    }
  }

  return {
    format,
    sheetCount: usable.length,
    exportedSheetNames: usable.map((sheet) => sheet.name).slice(0, GRID_EXPORT_MAX_SHEETS),
    skippedSheetNames: allSheets.filter((name) => !exportedNames.has(name)).slice(0, GRID_EXPORT_MAX_SHEETS),
    cellCount,
    formulaCount,
    neutralizedFormulaCount,
    dateFormattedCellCount,
    preserved: [
      ...PRESERVED_COMMON,
      ...(formulaCount === 0
        ? []
        : format === 'xlsx'
          ? ['formulas inside the OOXML safety gate (kept as <f>)']
          : ['formulas (kept as table:formula, no local evaluation)']),
      ...(dateFormattedCellCount === 0 ? [] : ['date cells as a number-format/serial pair']),
    ],
    notPreserved: [
      ...NOT_PRESERVED_COMMON,
      ...(neutralizedFormulaCount === 0
        ? []
        : ['formulas outside the OOXML safety gate (written as inert text on purpose)']),
    ],
  };
}

function isGridExportFormulaCell(cell: GridCell): boolean {
  return typeof cell.formula === 'string' && cell.formula.trim().length > 0;
}

export function buildGridWorkbookExportFileName(title: string, format: GridWorkbookExportFormat): string {
  const base = title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, '_')
    .replace(/\s+/gu, '_')
    .replace(/[^A-Za-z0-9._-]/gu, '')
    .replace(/_+/gu, '_')
    .replace(/^[._-]+|[._-]+$/gu, '')
    .slice(0, GRID_EXPORT_MAX_TITLE_CHARS);
  return `${base || 'Grid_Workbook'}.${format}`;
}

/**
 * ODS/XLSX packages are ZIP containers. Re-reading the produced bytes proves the container and the
 * mandatory parts exist; it is *not* a substitute for opening the file in Excel or LibreOffice.
 */
async function verifyGridWorkbookPackage(
  bytes: Uint8Array,
  format: GridWorkbookExportFormat,
): Promise<string[]> {
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('grid_export_package_not_zip');
  const entries = await readZip(bytes, { maxEntries: 4_096, maxEntryBytes: 64 * 1024 * 1024 });
  const required = format === 'xlsx'
    ? ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']
    : ['mimetype', 'META-INF/manifest.xml', 'content.xml'];
  for (const name of required) {
    if (!entries.has(name)) throw new Error(`grid_export_package_part_missing:${name}`);
  }
  if (format === 'xlsx') {
    if (![...entries.keys()].some((name) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name))) {
      throw new Error('grid_export_package_part_missing:xl/worksheets/sheet1.xml');
    }
  }
  if (format === 'ods') {
    const mimetype = entries.get('mimetype');
    if (!mimetype || new TextDecoder().decode(mimetype) !== 'application/vnd.oasis.opendocument.spreadsheet') {
      throw new Error('grid_export_package_mimetype_invalid');
    }
  }
  return [...entries.keys()].sort();
}

export async function buildGridWorkbookExport(
  document: WorkspaceDocument,
  formatOrFileName: GridWorkbookExportFormat | string,
): Promise<GridWorkbookExportResult> {
  const format = formatOrFileName === 'xlsx' || formatOrFileName === 'ods'
    ? formatOrFileName
    : resolveGridWorkbookExportFormat(String(formatOrFileName));
  const record = analyzeGridWorkbookExport(document, format);
  const bytes = format === 'xlsx' ? exportXlsx(document) : exportOds(document);
  const verifiedParts = await verifyGridWorkbookPackage(bytes, format);
  return { bytes, fileName: buildGridWorkbookExportFileName(document.title, format), record, verifiedParts };
}

/**
 * Workbook delivery. Native round 42 (export integrity): the desktop writes the verified package
 * through the save dialog and the atomic sandbox export; only then is `mode:'file'` reported. The
 * browser fallback stays a download and says so.
 */
export function downloadGridWorkbookExport(
  bytes: Uint8Array,
  fileName: string,
  format: GridWorkbookExportFormat,
): Promise<ExportDeliveryResult> {
  const mime = format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.oasis.opendocument.spreadsheet';
  return deliverExportBytes(bytes, {
    suggestedName: fileName,
    extensions: [format],
    mimeType: mime,
  });
}

/** Re-exported for the import side so a single module owns the "what did we keep" vocabulary. */
export function gridExportRecordSummary(record: GridWorkbookExportRecord): string {
  const skip = record.skippedSheetNames.length ? ` · übersprungen: ${record.skippedSheetNames.join(', ')}` : '';
  const inert = record.neutralizedFormulaCount
    ? ` · ${record.neutralizedFormulaCount} Formel(n) als inaktiver Text gesichert`
    : '';
  return `${record.format.toUpperCase()} · ${record.cellCount} Zellen · ${record.sheetCount} Blatt/Blätter${skip}${inert}`;
}

/**
 * Wraps a sparse coordinate map into the canonical Grid document shape the platform exporters
 * require. Used by the round-trip dialog so the export path is exercisable without extra props,
 * and by tests as the explicit "cells -> workbook" conversion.
 */
export function createGridExportDocumentFromCells(
  cells: Record<string, GridCell | string>,
  title: string,
  rowCount = 20,
  colCount = 10,
): WorkspaceDocument {
  const normalized: Record<string, GridCell> = {};
  for (const [coord, value] of Object.entries(cells)) {
    if (!/^[A-Za-z]{1,3}[1-9]\d{0,6}$/u.test(coord)) throw new Error('grid_export_coordinate_invalid');
    normalized[coord.toUpperCase()] = typeof value === 'string' ? { value } : value;
  }
  const boundedRows = Math.max(1, Math.min(1_048_576, Math.trunc(rowCount) || 1));
  const boundedCols = Math.max(1, Math.min(16_384, Math.trunc(colCount) || 1));
  const tableId = 'grid-export-table-1';
  const sheetId = 'grid-export-sheet-1';
  const safeTitle = title.trim().slice(0, GRID_EXPORT_MAX_TITLE_CHARS) || 'Grid Export';
  return {
    schema_version: 1,
    id: 'grid-export-document',
    title: safeTitle,
    kind: 'Grid',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [tableId],
    objects: { [tableId]: { type: 'Table', data: { id: tableId, rows: boundedRows, cols: boundedCols, cells: normalized } } },
    gridData: { sheets: [{ id: sheetId, name: 'Sheet1', tableObjectId: tableId }], activeSheetId: sheetId, namedRanges: [] },
  } as unknown as WorkspaceDocument;
}
