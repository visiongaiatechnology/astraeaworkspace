// STATUS: DIAMANT VGT SUPREME — bounded CSV/TSV sniff, preview and typed import decision layer.
//
// The import dialog needs three facts *before* anything is written into a sheet:
//   1. which encoding the bytes really are (UTF-8 with/without BOM, or a lossy fallback),
//   2. which delimiter the file really uses (RFC 4180 aware, not "first line contains a tab"),
//   3. which columns can be typed as numbers *without destroying leading zeros*.
//
// Every decision here is pure and bounded, so it can be verified headlessly and reused by the
// dialog, by the round-trip suite and by the query source parser.
import { toA1 } from '../formulas/formula';
import {
  GRID_IMPORT_MAX_BYTES,
  GRID_IMPORT_MAX_CELL_CHARS,
  GRID_IMPORT_MAX_COLUMNS,
  GRID_IMPORT_MAX_ROWS,
  GRID_IMPORT_MAX_TABLE_CELLS,
} from './gridXlsxOdsRoundtrip';

export type GridDelimitedEncoding = 'utf-8' | 'utf-8-bom' | 'utf-8-lossy';
export type GridDelimitedKind = 'csv' | 'tsv';
export type GridDelimitedInferredType = 'text' | 'number' | 'boolean' | 'date';

export const GRID_DELIMITED_PREVIEW_ROWS = 12;
export const GRID_DELIMITED_MAX_PREVIEW_ROWS = 50;
/** Internal scanner ceiling: one row more than the sheet row budget so the header row still fits. */
const GRID_SCAN_MAX_ROWS = GRID_IMPORT_MAX_ROWS + 1;

export interface GridDelimitedColumnPreview {
  index: number;
  label: string;
  letter: string;
  inferredType: GridDelimitedInferredType;
  /** Column is forced to text because at least one value carries significant leading zeros. */
  leadingZeroProtected: boolean;
  leadingZeroSamples: number;
  emptyCount: number;
  sampleValues: string[];
}

export interface GridDelimitedPreview {
  encoding: GridDelimitedEncoding;
  /** Human readable encoding label for the dialog ("UTF-8 (BOM)" / "UTF-8 (ohne BOM)" / "UTF-8 (Ersatzzeichen)"). */
  encodingLabel: string;
  bomDetected: boolean;
  replacementCharacters: number;
  delimiter: string;
  delimiterLabel: string;
  kind: GridDelimitedKind;
  lineEnding: 'crlf' | 'lf' | 'cr' | 'mixed' | 'none';
  headerRowDetected: boolean;
  columnCount: number;
  /** Row count as counted by the bounded scanner (never the full unbounded file). */
  dataRowCount: number;
  truncated: boolean;
  warnings: string[];
  columns: GridDelimitedColumnPreview[];
  previewRows: string[][];
}

export interface GridDelimitedImportOptions {
  delimiter?: string;
  /** First row becomes column labels instead of data. */
  firstRowIsHeader?: boolean;
  /** Per-column type override; `text` always wins over inference. */
  columnTypes?: Record<number, GridDelimitedInferredType>;
}

export interface GridDelimitedImportResult {
  cells: Record<string, string>;
  rowCount: number;
  colCount: number;
  preview: GridDelimitedPreview;
  /** Values that were deliberately reported instead of silently dropped. */
  skippedNotes: string[];
}

const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;
const DELIMITER_LABELS: Record<string, string> = { ',': 'Komma', ';': 'Semikolon', '\t': 'Tabulator', '|': 'Pipe' };

const LEADING_ZERO = /^-?0\d/u;
const INT_OR_DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const BOOLEAN_LIKE = /^(?:true|false|wahr|falsch|ja|nein)$/iu;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/u;

function utf8ByteLength(text: string, stopAt = GRID_IMPORT_MAX_BYTES): number {
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
    if (bytes > stopAt) return bytes;
  }
  return bytes;
}

export function assertGridDelimitedSize(text: string): void {
  if (utf8ByteLength(text) > GRID_IMPORT_MAX_BYTES) throw new Error('grid_import_byte_limit');
}

function detectEncoding(text: string): { encoding: GridDelimitedEncoding; bomDetected: boolean; replacementCharacters: number; label: string } {
  const bomDetected = text.charCodeAt(0) === 0xfeff;
  let replacementCharacters = 0;
  for (let index = bomDetected ? 1 : 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 0xfffd) replacementCharacters += 1;
  }
  if (bomDetected) return { encoding: 'utf-8-bom', bomDetected, replacementCharacters, label: 'UTF-8 (BOM)' };
  // Lone surrogates cannot be produced by a valid UTF-8 decode and indicate a lossy fallback decode.
  let loneSurrogates = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { index++; continue; }
      loneSurrogates += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) loneSurrogates += 1;
  }
  const lossy = replacementCharacters > 0 || loneSurrogates > 0;
  return {
    encoding: lossy ? 'utf-8-lossy' : 'utf-8',
    bomDetected,
    replacementCharacters,
    label: lossy ? 'UTF-8 (Ersatzzeichen – Datei war nicht sauber UTF-8)' : 'UTF-8 (ohne BOM)',
  };
}

function detectLineEnding(text: string): GridDelimitedPreview['lineEnding'] {
  // Counting loop instead of three `match()` passes: no per-line array allocation on a 16 MB import.
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let index = 0; index < text.length; index++) {
    const ch = text.charCodeAt(index);
    if (ch === 13) {
      if (text.charCodeAt(index + 1) === 10) { crlf += 1; index++; }
      else cr += 1;
    } else if (ch === 10) lf += 1;
  }
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  if (kinds === 0) return 'none';
  if (kinds > 1) return 'mixed';
  if (crlf > 0) return 'crlf';
  if (lf > 0) return 'lf';
  return 'cr';
}

interface DelimitedScanRow {
  fields: string[];
  quoted: boolean[];
}

/**
 * RFC 4180 style scanner that never materialises more than `maxRows` rows and never more than
 * `maxColumns` fields, and that reports truncation instead of silently cutting data.
 *
 * Blank lines are kept as empty rows: dropping them would shift every following value into the
 * wrong sheet row.
 */
export function scanGridDelimitedRows(
  text: string,
  delimiter: string,
  maxRows: number,
  maxColumns: number = GRID_IMPORT_MAX_COLUMNS,
): { rows: DelimitedScanRow[]; truncated: boolean; dataRowBudget: number; unclosedQuote: boolean } {
  if (delimiter.length !== 1) throw new Error('grid_import_delimiter_invalid');
  const boundedMaxRows = Math.max(1, Math.min(GRID_SCAN_MAX_ROWS, Math.floor(maxRows)));
  const rows: DelimitedScanRow[] = [];
  let fields: string[] = [];
  let quotedFlags: boolean[] = [];
  let field = '';
  let fieldWasQuoted = false;
  let quoted = false;
  let closedQuote = false;
  let truncated = false;
  let sawAnyChar = false;

  const pushField = (): void => {
    fields.push(field);
    quotedFlags.push(fieldWasQuoted);
    field = '';
    fieldWasQuoted = false;
    closedQuote = false;
  };
  const pushRow = (): void => {
    pushField();
    if (rows.length >= boundedMaxRows) truncated = true;
    else rows.push({ fields: fields.slice(0, maxColumns), quoted: quotedFlags.slice(0, maxColumns) });
    fields = [];
    quotedFlags = [];
  };

  for (let index = 0; index < text.length; index++) {
    const ch = text[index] as string;
    if (quoted) {
      if (ch === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (ch === '"') { quoted = false; closedQuote = true; }
      else field += ch;
    } else if (ch === '"' && field.length === 0 && !closedQuote) {
      quoted = true;
      fieldWasQuoted = true;
    } else if (ch === delimiter) {
      if (fields.length >= maxColumns) {
        // The remaining row is already wider than the sheet can hold: fail loudly, never truncate silently.
        throw new Error('grid_import_column_limit');
      }
      pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[index + 1] === '\n') index++;
      sawAnyChar = true;
      pushRow();
      if (truncated) return { rows, truncated: true, dataRowBudget: boundedMaxRows, unclosedQuote: false };
    } else {
      sawAnyChar = true;
      field += ch;
    }
    if (field.length > GRID_IMPORT_MAX_CELL_CHARS) throw new Error('grid_import_cell_limit');
  }
  const unclosedQuote = quoted;
  if (sawAnyChar && (field.length > 0 || fields.length > 0)) pushRow();
  return { rows, truncated, dataRowBudget: boundedMaxRows, unclosedQuote };
}

/** Scores a delimiter by field-count consistency over the bounded sample. */
function scoreDelimiter(text: string, delimiter: string): { score: number; columns: number } {
  const sample = text.length > 65_536 ? text.slice(0, 65_536) : text;
  const scanned = scanGridDelimitedRows(sample, delimiter, GRID_DELIMITED_PREVIEW_ROWS + 1);
  const rows = scanned.rows.filter((row) => row.fields.some((value) => value !== ''));
  if (rows.length < 2) return { score: -1, columns: rows[0]?.fields.length ?? 0 };
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.fields.length, (counts.get(row.fields.length) ?? 0) + 1);
  let bestCount = 0;
  let bestFrequency = 0;
  for (const [count, frequency] of counts) {
    if (frequency > bestFrequency || (frequency === bestFrequency && count > bestCount)) {
      bestCount = count;
      bestFrequency = frequency;
    }
  }
  if (bestCount < 2) return { score: -1, columns: bestCount };
  return { score: bestFrequency / rows.length, columns: bestCount };
}

export function sniffGridDelimitedText(text: string, forcedDelimiter?: string): {
  delimiter: string;
  kind: GridDelimitedKind;
  confidence: number;
  columnCount: number;
} {
  assertGridDelimitedSize(text);
  if (forcedDelimiter !== undefined) {
    if (forcedDelimiter.length !== 1) throw new Error('grid_import_delimiter_invalid');
    const scored = scoreDelimiter(text, forcedDelimiter);
    return {
      delimiter: forcedDelimiter,
      kind: forcedDelimiter === '\t' ? 'tsv' : 'csv',
      confidence: Math.max(0, scored.score),
      columnCount: Math.max(1, scored.columns),
    };
  }
  let best = { delimiter: ',' as string, score: -1, columns: 1 };
  for (const candidate of DELIMITER_CANDIDATES) {
    const scored = scoreDelimiter(text, candidate);
    if (scored.score > best.score) best = { delimiter: candidate, score: scored.score, columns: scored.columns };
  }
  if (best.score < 0) {
    // Single-column file: still report a deterministic delimiter rather than guessing from a substring.
    const firstLine = text.split(/\r\n|\n|\r/u, 1)[0] ?? '';
    const fallback = firstLine.includes('\t') ? '\t' : ',';
    return { delimiter: fallback, kind: fallback === '\t' ? 'tsv' : 'csv', confidence: 0, columnCount: 1 };
  }
  return {
    delimiter: best.delimiter,
    kind: best.delimiter === '\t' ? 'tsv' : 'csv',
    confidence: best.score,
    columnCount: Math.max(1, best.columns),
  };
}

function classifyValue(raw: string): GridDelimitedInferredType {
  const value = raw.trim();
  if (value === '') return 'text';
  if (BOOLEAN_LIKE.test(value)) return 'boolean';
  if (INT_OR_DECIMAL.test(value)) return 'number';
  if (ISO_DATE.test(value)) return 'date';
  return 'text';
}

function inferColumnType(values: string[]): { type: GridDelimitedInferredType; leadingZeroProtected: boolean; leadingZeroSamples: number } {
  const nonEmpty = values.filter((value) => value.trim() !== '');
  if (!nonEmpty.length) return { type: 'text', leadingZeroProtected: false, leadingZeroSamples: 0 };
  const leadingZeroSamples = nonEmpty.filter((value) => LEADING_ZERO.test(value.trim())).length;
  if (leadingZeroSamples > 0) {
    // "007" must stay "007": a single significant leading zero blocks numeric typing for the column.
    return { type: 'text', leadingZeroProtected: true, leadingZeroSamples };
  }
  const types = new Set(nonEmpty.map(classifyValue));
  if (types.size !== 1) return { type: 'text', leadingZeroProtected: false, leadingZeroSamples: 0 };
  const [only] = [...types];
  return { type: only ?? 'text', leadingZeroProtected: false, leadingZeroSamples: 0 };
}

/** Cells that could be mistaken for a formula on re-export; reported, never silently rewritten here. */
export function countGridDelimitedFormulaLikeValues(rows: string[][]): number {
  let count = 0;
  for (const row of rows) for (const value of row) if (/^[=+\-@\t\r]/u.test(value)) count += 1;
  return count;
}

export function buildGridDelimitedPreview(text: string, options: GridDelimitedImportOptions = {}): GridDelimitedPreview {
  assertGridDelimitedSize(text);
  const sniffed = sniffGridDelimitedText(text, options.delimiter);
  const encoding = detectEncoding(text);
  const lineEnding = detectLineEnding(text);
  const { rows, truncated, unclosedQuote } = scanGridDelimitedRows(text, sniffed.delimiter, GRID_DELIMITED_MAX_PREVIEW_ROWS + 1);
  const headerRowDetected = options.firstRowIsHeader ?? true;
  const columnCount = Math.max(1, Math.min(GRID_IMPORT_MAX_COLUMNS, rows.reduce((max, row) => Math.max(max, row.fields.length), 1)));

  const dataRows = headerRowDetected ? rows.slice(1) : rows;
  const warnings: string[] = [];
  if (encoding.encoding === 'utf-8-lossy') warnings.push('Die Datei enthält Ersatzzeichen: sie war nicht verlustfrei UTF-8 dekodierbar.');
  if (lineEnding === 'mixed') warnings.push('Gemischte Zeilenenden (CRLF und LF) erkannt.');
  if (unclosedQuote) warnings.push('Eine Anführungszeichen-Gruppe ist nicht geschlossen – der Import wird abgelehnt.');
  if (truncated) warnings.push(`Die Vorschau ist auf ${GRID_DELIMITED_MAX_PREVIEW_ROWS} Zeilen begrenzt; die vollständige Datei wird erst beim Import geprüft.`);
  if (headerRowDetected) warnings.push('Die erste Zeile wird als Kopfzeile verwendet.');

  const columns: GridDelimitedColumnPreview[] = [];
  for (let index = 0; index < columnCount; index++) {
    const values = dataRows.map((row) => row.fields[index] ?? '');
    const inferred = inferColumnType(values);
    const override = options.columnTypes?.[index];
    const effective = override === 'text' || override === undefined ? (override ?? inferred.type) : (inferred.leadingZeroProtected ? 'text' : override);
    columns.push({
      index,
      label: headerRowDetected ? (rows[0]?.fields[index] ?? `Spalte ${index + 1}`).slice(0, 256) : `Spalte ${index + 1}`,
      letter: toA1(index, 0).replace(/\d+$/u, ''),
      inferredType: effective,
      leadingZeroProtected: inferred.leadingZeroProtected,
      leadingZeroSamples: inferred.leadingZeroSamples,
      emptyCount: values.filter((value) => value.trim() === '').length,
      sampleValues: values.filter((value) => value.trim() !== '').slice(0, 3).map((value) => value.slice(0, 48)),
    });
  }
  if (columns.some((column) => column.leadingZeroProtected)) {
    warnings.push('Führende Nullen erkannt: betroffene Spalten bleiben Text und werden nicht in Zahlen umgewandelt.');
  }

  return {
    encoding: encoding.encoding,
    encodingLabel: encoding.label,
    bomDetected: encoding.bomDetected,
    replacementCharacters: encoding.replacementCharacters,
    delimiter: sniffed.delimiter,
    delimiterLabel: DELIMITER_LABELS[sniffed.delimiter] ?? sniffed.delimiter,
    kind: sniffed.kind,
    lineEnding,
    headerRowDetected,
    columnCount,
    dataRowCount: Math.max(0, rows.length - (headerRowDetected ? 1 : 0)),
    truncated,
    warnings,
    columns,
    previewRows: rows.slice(0, GRID_DELIMITED_PREVIEW_ROWS).map((row) => row.fields.slice(0, columnCount)),
  };
}

/**
 * Full bounded import. Every rejection is explicit; the result carries the notes the dialog must show.
 */
export function importGridDelimitedText(
  text: string,
  options: GridDelimitedImportOptions = {},
): GridDelimitedImportResult {
  assertGridDelimitedSize(text);
  const preview = buildGridDelimitedPreview(text, options);
  const scanned = scanGridDelimitedRows(text, preview.delimiter, GRID_SCAN_MAX_ROWS);
  if (scanned.unclosedQuote) throw new Error('grid_import_unclosed_quote');
  // Fail closed: a truncated scan would silently drop trailing rows.
  if (scanned.truncated) throw new Error('grid_import_row_limit');
  const rows = scanned.rows;
  if (rows.length > GRID_SCAN_MAX_ROWS) throw new Error('grid_import_row_limit');

  const headerRowDetected = preview.headerRowDetected;
  const dataRows = headerRowDetected ? rows.slice(1) : rows;
  const columnCount = preview.columnCount;
  const cells: Record<string, string> = Object.create(null) as Record<string, string>;
  const skippedNotes: string[] = [];
  let cellCount = 0;

  if (headerRowDetected && rows.length > 0) {
    for (let col = 0; col < columnCount; col++) {
      const label = (rows[0]?.fields[col] ?? '').trim().slice(0, GRID_IMPORT_MAX_CELL_CHARS);
      if (!label) continue;
      cellCount += 1;
      if (cellCount > GRID_IMPORT_MAX_TABLE_CELLS) throw new Error('grid_import_table_cell_limit');
      cells[toA1(col, 0)] = label;
    }
  }

  let droppedEmptyColumns = 0;
  for (let row = 0; row < dataRows.length; row++) {
    const source = dataRows[row] as DelimitedScanRow;
    const targetRow = headerRowDetected ? row + 1 : row;
    if (targetRow > GRID_IMPORT_MAX_ROWS) throw new Error('grid_import_row_limit');
    const nextRow = Array.from({ length: columnCount }, () => false);
    for (let col = 0; col < columnCount; col++) {
      const raw = source.fields[col];
      if (raw === undefined || raw === '') continue;
      const value = raw.length > GRID_IMPORT_MAX_CELL_CHARS ? raw.slice(0, GRID_IMPORT_MAX_CELL_CHARS) : raw;
      cellCount += 1;
      if (cellCount > GRID_IMPORT_MAX_TABLE_CELLS) throw new Error('grid_import_table_cell_limit');
      cells[toA1(col, targetRow)] = value;
      nextRow[col] = true;
    }
    if (!nextRow.some(Boolean)) droppedEmptyColumns += 1;
  }
  if (droppedEmptyColumns > 0) skippedNotes.push(`${droppedEmptyColumns} vollständig leere Zeile(n) wurden nicht geschrieben (leere Zellen bleiben leer).`);

  return {
    cells,
    rowCount: Math.max(10, headerRowDetected ? dataRows.length + 1 : dataRows.length),
    colCount: Math.max(10, columnCount),
    preview,
    skippedNotes,
  };
}
