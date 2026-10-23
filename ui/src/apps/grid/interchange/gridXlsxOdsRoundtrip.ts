// STATUS: DIAMANT VGT SUPREME â€” Universal Spreadsheet Importer & Roundtrip Engine
// Pure TypeScript parser/serializer for XLSX, ODS, CSV, TSV, and JSON formats

import { decodeXmlEntities, inspectBoundedForeignXml } from '../../../shared/interoperability/xml';
import { neutralizeSpreadsheetFormulaInjection } from '../../../shared/security/spreadsheetSafety';
import { parseA1, toA1 } from '../formulas/formula';

export type GridFileFormat = 'xlsx' | 'ods' | 'csv' | 'tsv' | 'json' | 'auto';

export const GRID_IMPORT_MAX_BYTES = 16 * 1024 * 1024;
/**
 * Maximum number of *data* rows. One additional header row is always permitted, so a file with
 * 50,000 data rows plus a header row fits the stated acceptance scenario.
 */
export const GRID_IMPORT_MAX_ROWS = 50_000;
/** Row count ceiling including the optional header row. */
export const GRID_IMPORT_MAX_TOTAL_ROWS = GRID_IMPORT_MAX_ROWS + 1;
export const GRID_IMPORT_MAX_COLUMNS = 256;
/**
 * Cell budget for *cell-dictionary* inputs (JSON dictionaries, shared-string tables), preservation
 * records and anything copied into the history-safe edit path. Unchanged on purpose: callers such as
 * the scenario manager size their own bounded structures from it.
 */
export const GRID_IMPORT_MAX_CELLS = 10_000;
/**
 * Cell budget for *sheet-shaped* imports (CSV/TSV/XLSX/ODS rows). Large enough for the accepted
 * "50,000 data rows" scenario (50,000 Ã— 20 columns) while still refusing an unbounded sheet before it
 * is materialised. The UTF-8 byte budget above remains the primary memory guard.
 */
export const GRID_IMPORT_MAX_TABLE_CELLS = 1_000_000;
export const GRID_IMPORT_MAX_CELL_CHARS = 128_000;
/** Formulas get their own, much tighter ceiling so a cell body cannot smuggle a huge formula. */
export const GRID_IMPORT_MAX_FORMULA_CHARS = 16_384;
/** Ceiling for OpenDocument repeat attributes (`table:number-rows-repeated` / `-columns-repeated`). */
export const GRID_IMPORT_MAX_REPEAT = 100_000;

function assertImportTextSize(text: string): void {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index++; }
      else bytes += 3;
    } else bytes += 3;
    if (bytes > GRID_IMPORT_MAX_BYTES) throw new Error('grid_import_byte_limit');
  }
}

function assertCellValue(value: string): void {
  if (value.length > GRID_IMPORT_MAX_CELL_CHARS) throw new Error('grid_import_cell_limit');
}

function assertFormulaValue(formula: string): void {
  if (formula.length > GRID_IMPORT_MAX_FORMULA_CHARS) throw new Error('grid_import_formula_limit');
}

function boundedCoordinate(coord: string): { row: number; col: number; key: string } {
  if (!/^[A-Za-z]{1,3}[1-9]\d{0,5}$/.test(coord)) throw new Error('grid_import_coordinate_invalid');
  const point = parseA1(coord);
  // 0-based row index: `GRID_IMPORT_MAX_ROWS` is allowed (one header row on top of the data budget).
  if (!point || point.row > GRID_IMPORT_MAX_ROWS || point.col >= GRID_IMPORT_MAX_COLUMNS) {
    throw new Error('grid_import_coordinate_limit');
  }
  return { row: point.row, col: point.col, key: toA1(point.col, point.row) };
}

function boundedCellCount(count: number): void {
  if (count > GRID_IMPORT_MAX_CELLS) throw new Error('grid_import_cell_count_limit');
}

/** Sheet-shaped imports have their own, larger budget with its own diagnostic code. */
function boundedTableCellCount(count: number): void {
  if (count > GRID_IMPORT_MAX_TABLE_CELLS) throw new Error('grid_import_table_cell_limit');
}

/** Reads one attribute from a raw start-tag body, independent of attribute order and namespace prefix. */
function readXmlAttribute(attributes: string, localName: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(localName)) throw new Error('grid_import_attribute_name_invalid');
  const pattern = new RegExp(`(?:^|\\s)(?:[A-Za-z_][\\w.-]*:)?${localName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
  const match = attributes.match(pattern);
  if (!match) return null;
  return decodeXmlEntities(match[1] ?? match[2] ?? '');
}

function boundedRepeat(raw: string | null): number {
  if (raw === null) return 1;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return 1;
  if (value > GRID_IMPORT_MAX_REPEAT) throw new Error('grid_import_repeat_limit');
  return value;
}

export interface GridRoundtripManifest {
  id: string;
  originalFormat: GridFileFormat;
  originalChecksum: string;
  stashedPackageParts: Record<string, string>; // path -> raw content
  preservedDrawingRels: Record<string, string>;
  sheetName: string;
  timestamp: number;
}

export interface SpreadsheetImportResult {
  sheetName: string;
  cells: Record<string, string>;
  rowCount: number;
  colCount: number;
  format: GridFileFormat;
  manifest: GridRoundtripManifest;
  /** All worksheets found in the document; `cells` mirrors the first entry. */
  sheets: Array<{ name: string; cells: Record<string, string>; rowCount: number; colCount: number }>;
  /** Anything the importer deliberately did not write, so the UI can show it instead of hiding it. */
  notes: string[];
}

export function createGridManifest(format: GridFileFormat = 'xlsx'): GridRoundtripManifest {
  return {
    id: `g-manifest-${Date.now()}`,
    originalFormat: format,
    originalChecksum: '',
    stashedPackageParts: {},
    preservedDrawingRels: {},
    sheetName: 'Sheet1',
    timestamp: Date.now(),
  };
}

/**
 * Parses XLSX Worksheet XML (<sheetData>) and shared strings.
 */
export function importXlsxXml(
  sheetXml: string,
  sharedStringsXml: string = ''
): { cells: Record<string, string>; rowCount: number; colCount: number } {
  assertImportTextSize(sheetXml);
  assertImportTextSize(sharedStringsXml);
  inspectBoundedForeignXml(sheetXml, { maxBytes: GRID_IMPORT_MAX_BYTES });
  if (sharedStringsXml) inspectBoundedForeignXml(sharedStringsXml, { maxBytes: GRID_IMPORT_MAX_BYTES });
  const cells: Record<string, string> = {};

  // Extract shared strings table
  const sharedStrings: string[] = [];
  if (sharedStringsXml) {
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRegex.exec(sharedStringsXml)) !== null) {
      const tMatch = siMatch[1].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
      const value = tMatch ? tMatch[1] : '';
      assertCellValue(value);
      if (sharedStrings.length >= GRID_IMPORT_MAX_CELLS) throw new Error('grid_import_shared_string_limit');
      sharedStrings.push(value);
    }
  }

  // Parse rows and cells in sheetXml. The start tag is matched first and attributes are read from it,
  // because XML attribute order is not significant and the previous pattern silently dropped
  // `t="..."` when it appeared before `r="..."`.
  const cRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let cMatch: RegExpExecArray | null;
  let maxR = 0;
  let maxC = 0;
  let cellCount = 0;

  while ((cMatch = cRegex.exec(sheetXml)) !== null) {
    const attributes = cMatch[1];
    const coord = readXmlAttribute(attributes, 'r');
    if (!coord) continue;
    const point = boundedCoordinate(coord);
    const type = readXmlAttribute(attributes, 't') ?? '';
    const inner = cMatch[2] ?? '';

    let cellValue = '';

    // Formula tag <f>
    const fMatch = inner.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/);
    if (fMatch && fMatch[1].trim() !== '') {
      const formula = `=${fMatch[1]}`;
      assertFormulaValue(formula);
      cellValue = formula;
    } else if (type === 'inlineStr') {
      // LibreOffice/Excel both emit inline strings for small sheets; ignoring them lost data.
      const inlineMatch = inner.match(/<is>([\s\S]*?)<\/is>/);
      if (inlineMatch) cellValue = decodeXmlEntities(inlineMatch[1].replace(/<[^>]*>/gu, ''));
    } else {
      // Value tag <v>
      const vMatch = inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
      if (vMatch) {
        const rawV = vMatch[1];
        if (type === 's') {
          // Shared string reference index
          const idx = parseInt(rawV, 10);
          cellValue = sharedStrings[idx] ?? rawV;
        } else if (type === 'b') {
          cellValue = rawV.trim() === '1' ? 'true' : 'false';
        } else if (type === 'str') {
          cellValue = decodeXmlEntities(rawV);
        } else {
          cellValue = rawV;
        }
      }
    }

    if (cellValue !== '') {
      assertCellValue(cellValue);
      if (Object.prototype.hasOwnProperty.call(cells, point.key)) throw new Error('grid_import_duplicate_coordinate');
      boundedTableCellCount(++cellCount);
      cells[point.key] = cellValue;

      // Track max dimensions
      if (point.row + 1 > maxR) maxR = point.row + 1;
      if (point.col + 1 > maxC) maxC = point.col + 1;
    }
  }

  return { cells, rowCount: Math.max(10, maxR), colCount: Math.max(10, maxC) };
}

export interface GridOdsSheetImport {
  name: string;
  cells: Record<string, string>;
  rowCount: number;
  colCount: number;
  /** Values that were recognised but deliberately not written, reported so nothing is lost silently. */
  skippedNotes: string[];
}

export interface GridOdsWorkbookImport {
  sheets: GridOdsSheetImport[];
  /** True when more worksheets were present than the bounded importer read. */
  truncatedSheets: boolean;
}

export const GRID_IMPORT_MAX_ODS_SHEETS = 64;

/**
 * Parses one OpenDocument `<table:table>` body. Repeat attributes, `office:value*` attributes and
 * `table:formula` are honoured, because LibreOffice emits all three for ordinary Calc files.
 */
function parseOdsTableBody(
  tableXml: string,
  tableName: string,
  counter: { cells: number },
): GridOdsSheetImport {
  const cells: Record<string, string> = Object.create(null) as Record<string, string>;
  const skippedNotes: string[] = [];
  let row = 0;
  let maxCol = 0;
  let skippedRepeatedEmpty = 0;

  const rowRegex = /<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tableXml)) !== null) {
    const rowRepeat = boundedRepeat(readXmlAttribute(rowMatch[1], 'number-rows-repeated'));
    const rowContent = rowMatch[2] ?? '';
    for (let repeat = 0; repeat < rowRepeat; repeat++) {
      if (row > GRID_IMPORT_MAX_ROWS) throw new Error('grid_import_row_limit');
      const cellRegex = /<table:table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g;
      let cellMatch: RegExpExecArray | null;
      let col = 0;
      let rowHasContent = false;

      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        const attributes = cellMatch[1];
        const cellContent = cellMatch[2] ?? '';
        const colRepeat = boundedRepeat(readXmlAttribute(attributes, 'number-columns-repeated'));
        if (col + colRepeat > GRID_IMPORT_MAX_COLUMNS) throw new Error('grid_import_column_limit');

        const valueType = readXmlAttribute(attributes, 'value-type') ?? '';
        const formulaRaw = readXmlAttribute(attributes, 'formula');
        const textContent = (cellContent.match(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/)?.[1] ?? '')
          .replace(/<[^>]*>/gu, '')
          .trim();

        let cellValue = '';
        if (valueType === 'float' || valueType === 'currency' || valueType === 'percentage') {
          cellValue = readXmlAttribute(attributes, 'value') ?? textContent;
        } else if (valueType === 'boolean') {
          const raw = readXmlAttribute(attributes, 'boolean-value');
          cellValue = raw === null ? textContent : raw;
        } else if (valueType === 'date') {
          cellValue = readXmlAttribute(attributes, 'date-value') ?? textContent;
        } else {
          cellValue = textContent;
        }

        let formula = '';
        if (formulaRaw && formulaRaw !== '') {
          const normalized = formulaRaw.replace(/^of:=|^=/u, '').replace(/\[\.([A-Za-z]{1,3}\d{1,7})(?::\.([A-Za-z]{1,3}\d{1,7}))?\]/gu, (_all, start: string, end?: string) => (end ? `${start}:${end}` : start));
          formula = `=${normalized}`;
          assertFormulaValue(formula);
        }

        if (cellValue !== '' || formula !== '') {
          rowHasContent = true;
          assertCellValue(cellValue.length > 0 ? cellValue : formula);
          // A repeated *non-empty* cell cannot be expanded into distinct values without inventing data.
          if (colRepeat > 1) {
            skippedNotes.push(`Zeile ${row + 1}: ${colRepeat}Ã— wiederholte Zelle mit Inhalt nur einmal Ã¼bernommen.`);
          }
          const key = toA1(col, row);
          if (Object.prototype.hasOwnProperty.call(cells, key)) throw new Error('grid_import_duplicate_coordinate');
          boundedTableCellCount(++counter.cells);
          // A formula wins over the cached display value: the import must keep the formula
          // ("Formeln ... wieder einlesen"). The dropped display value is reported, not hidden.
          cells[key] = formula !== '' ? formula : cellValue;
          if (formula !== '' && cellValue !== '') {
            skippedNotes.push(`Zelle ${key}: Formel ${formula} gespeichert, angezeigter Wert "${cellValue.slice(0, 32)}" verworfen.`);
          }
          maxCol = Math.max(maxCol, col + 1);
        } else if (colRepeat > 1) {
          skippedRepeatedEmpty += colRepeat - 1;
        }
        col += colRepeat;
      }
      if (!rowHasContent && rowRepeat > 1) skippedRepeatedEmpty += 1;
      row += 1;
    }
    if (row > GRID_IMPORT_MAX_ROWS) throw new Error('grid_import_row_limit');
  }

  if (skippedRepeatedEmpty > 0) {
    skippedNotes.push(`${skippedRepeatedEmpty} leere Wiederholungszelle(n) Ã¼bersprungen (keine Daten).`);
  }

  return {
    name: tableName,
    cells,
    rowCount: Math.max(10, row),
    colCount: Math.max(10, maxCol),
    skippedNotes: skippedNotes.slice(0, 64),
  };
}

/**
 * Parses an OpenDocument content.xml into **all** worksheets. The previous implementation flattened
 * every `<table:table-row>` of the document into one sheet, so a multi-sheet Calc file lost its
 * sheet boundaries entirely.
 */
export function importOdsWorkbook(contentXml: string): GridOdsWorkbookImport {
  assertImportTextSize(contentXml);
  inspectBoundedForeignXml(contentXml, { maxBytes: GRID_IMPORT_MAX_BYTES });
  const tableRegex = /<table:table\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table>)/g;
  const sheets: GridOdsSheetImport[] = [];
  const counter = { cells: 0 };
  let truncatedSheets = false;
  let tableMatch: RegExpExecArray | null;
  let index = 0;

  while ((tableMatch = tableRegex.exec(contentXml)) !== null) {
    index += 1;
    if (sheets.length >= GRID_IMPORT_MAX_ODS_SHEETS) { truncatedSheets = true; break; }
    const name = (readXmlAttribute(tableMatch[1], 'name') ?? '').slice(0, 128) || `Sheet${index}`;
    const body = tableMatch[2] ?? '';
    // Nested `<table:table>` (a named range inside a sheet) must not be split off as its own sheet.
    if (!/(?:^|>)\s*<table:table-row\b/u.test(body)) continue;
    sheets.push(parseOdsTableBody(body, name, counter));
  }

  if (!sheets.length) throw new Error('grid_import_ods_no_worksheets');
  return { sheets, truncatedSheets };
}

/**
 * Compatibility facade: parses the first (or only) worksheet of an ODS document.
 */
export function importOdsXml(contentXml: string): { cells: Record<string, string>; rowCount: number; colCount: number } {
  const workbook = importOdsWorkbook(contentXml);
  const first = workbook.sheets[0]!;
  return { cells: first.cells, rowCount: first.rowCount, colCount: first.colCount };
}

/**
 * Parses Delimited CSV / TSV text with robust delimiter detection.
 */
export function importCsvTsv(text: string): { cells: Record<string, string>; rowCount: number; colCount: number } {
  assertImportTextSize(text);
  if (!text.length || !text.trim()) return { cells: {}, rowCount: 10, colCount: 10 };

  const firstLine = text.split(/\r?\n/u, 1)[0];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const cells: Record<string, string> = Object.create(null) as Record<string, string>;
  let field = '';
  let row = 0;
  let col = 0;
  let maxCol = 0;
  let cellCount = 0;
  let quoted = false;
  let closedQuote = false;
  let rowStarted = false;

  const commitField = (): void => {
    const value = field.trim();
    if (value) {
      assertCellValue(value);
      boundedTableCellCount(++cellCount);
      cells[toA1(col, row)] = value;
    }
    field = '';
    closedQuote = false;
    col++;
    if (col > GRID_IMPORT_MAX_COLUMNS) throw new Error('grid_import_column_limit');
    maxCol = Math.max(maxCol, col);
  };
  const commitRow = (): void => {
    commitField();
    row++;
    if (row > GRID_IMPORT_MAX_TOTAL_ROWS) throw new Error('grid_import_row_limit');
    col = 0;
    rowStarted = false;
  };

  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    rowStarted = true;
    if (quoted) {
      if (ch === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (ch === '"') { quoted = false; closedQuote = true; }
      else field += ch;
    } else if (ch === '"' && field.length === 0 && !closedQuote) {
      quoted = true;
    } else if (ch === delimiter) {
      commitField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[index + 1] === '\n') index++;
      commitRow();
    } else if (!closedQuote || !/\s/u.test(ch)) {
      field += ch;
    }
    if (field.length > GRID_IMPORT_MAX_CELL_CHARS) throw new Error('grid_import_cell_limit');
  }
  if (quoted) throw new Error('grid_import_unclosed_quote');
  if (rowStarted || field.length > 0 || col > 0) commitRow();

  return { cells, rowCount: Math.max(10, row), colCount: Math.max(10, maxCol) };
}

/**
 * Exports cells to CSV string.
 */
export function exportCellsToCsv(cells: Record<string, string>, rowCount: number = 20, colCount: number = 10): string {
  const rows: string[] = [];
  const boundedRows = Math.max(0, Math.min(GRID_IMPORT_MAX_ROWS, Math.floor(rowCount)));
  const boundedCols = Math.max(0, Math.min(GRID_IMPORT_MAX_COLUMNS, Math.floor(colCount)));
  for (let r = 1; r <= boundedRows; r++) {
    const lineParts: string[] = [];
    for (let c = 0; c < boundedCols; c++) {
      const coord = toA1(c, r - 1);
      const val = neutralizeSpreadsheetFormulaInjection(cells[coord] || '');
      lineParts.push(/[",\r\n]/u.test(val) ? `"${val.replace(/"/gu, '""')}"` : val);
    }
    rows.push(lineParts.join(','));
  }
  return rows.join('\n');
}

/**
 * Universal Spreadsheet Importer Facade.
 */
export function importSpreadsheetDocument(
  content: string,
  filename: string,
  explicitFormat: GridFileFormat = 'auto'
): SpreadsheetImportResult {
  assertImportTextSize(content);
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  let fmt = explicitFormat;
  if (fmt === 'auto') {
    if (ext === 'xlsx') fmt = 'xlsx';
    else if (ext === 'ods') fmt = 'ods';
    else if (ext === 'tsv') fmt = 'tsv';
    else if (ext === 'json') fmt = 'json';
    else fmt = 'csv';
  }

  let parsed: { cells: Record<string, string>; rowCount: number; colCount: number };
  let sheets: Array<{ name: string; cells: Record<string, string>; rowCount: number; colCount: number }> = [];
  const notes: string[] = [];

  switch (fmt) {
    case 'xlsx':
      parsed = importXlsxXml(content);
      break;
    case 'ods': {
      const workbook = importOdsWorkbook(content);
      sheets = workbook.sheets.map((sheet) => ({
        name: sheet.name,
        cells: sheet.cells,
        rowCount: sheet.rowCount,
        colCount: sheet.colCount,
      }));
      const first = sheets[0]!;
      parsed = { cells: first.cells, rowCount: first.rowCount, colCount: first.colCount };
      if (workbook.sheets.length > 1) {
        notes.push(`ODS-Dokument enthÃ¤lt ${workbook.sheets.length} BlÃ¤tter; Blatt 1 ("${first.name}") ist geladen, weitere BlÃ¤tter liegen in \`sheets\` bereit.`);
      }
      if (workbook.truncatedSheets) notes.push(`Nur die ersten ${GRID_IMPORT_MAX_ODS_SHEETS} BlÃ¤tter wurden gelesen.`);
      for (const sheet of workbook.sheets) {
        for (const note of sheet.skippedNotes) notes.push(`${sheet.name}: ${note}`);
      }
      break;
    }
    case 'json':
      {
        const data: unknown = JSON.parse(content);
        if (!data || typeof data !== 'object' || Array.isArray(data) || Object.getPrototypeOf(data) !== Object.prototype) {
          throw new Error('grid_import_json_shape_invalid');
        }
        const entries = Object.entries(data as Record<string, unknown>);
        boundedCellCount(entries.length);
        const cells: Record<string, string> = Object.create(null) as Record<string, string>;
        let maxRow = 0;
        let maxCol = 0;
        for (const [rawCoord, rawValue] of entries) {
          const point = boundedCoordinate(rawCoord);
          if (Object.prototype.hasOwnProperty.call(cells, point.key)) throw new Error('grid_import_duplicate_coordinate');
          if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean') {
            throw new Error('grid_import_json_value_invalid');
          }
          if (typeof rawValue === 'number' && !Number.isFinite(rawValue)) throw new Error('grid_import_json_number_invalid');
          const value = String(rawValue);
          assertCellValue(value);
          cells[point.key] = value;
          maxRow = Math.max(maxRow, point.row + 1);
          maxCol = Math.max(maxCol, point.col + 1);
        }
        parsed = { cells, rowCount: Math.max(10, maxRow), colCount: Math.max(10, maxCol) };
      }
      break;
    case 'tsv':
    case 'csv':
    default:
      parsed = importCsvTsv(content);
      break;
  }

  const manifest = createGridManifest(fmt);
  const sheetName = filename.slice(0, 128).replace(/[\\/\u0000-\u001f\u007f]/gu, '').replace(/\.[^/.]+$/u, '') || 'Sheet1';
  if (!sheets.length) {
    sheets = [{ name: sheetName, cells: parsed.cells, rowCount: parsed.rowCount, colCount: parsed.colCount }];
  }

  return {
    sheetName,
    cells: parsed.cells,
    rowCount: parsed.rowCount,
    colCount: parsed.colCount,
    format: fmt,
    manifest,
    sheets,
    notes: notes.slice(0, 64),
  };
}
