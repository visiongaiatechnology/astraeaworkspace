import { secureRandomId } from '../../shared/crypto/secureRandom';
// STATUS: PLATIN
// Basic OOXML Spreadsheet interoperability: sheets, values, booleans, formulas and dimensions.

import type { GridCell, GridSheetModel, TableObject, WorkspaceDocument } from '../../shared/contracts/workspace';
import { decodeUtf8, readZip, utf8, writeStoredZip, type ZipEntry } from './zip';
import { decodeXmlEntities, escapeXml, extractElementFragments, extractTextNodes, inspectBoundedForeignXml, readAttribute } from '../../shared/interoperability/xml';
import { appendGridPreservedXmlEntries, captureGridXmlPreservation } from '../../apps/grid/interoperability/gridPreservation';
import { stripActiveOfficePackageParts, stripCircularImportedGridFormulas } from './officeHostileIntake';
import { validateOpcPackageGraph } from './officePackageGraph';
import { neutralizeSpreadsheetFormulaInjection } from '../../shared/security/spreadsheetSafety';
import { FORMULA_MAX_LENGTH } from '../../apps/grid/formulas/formulaContract';

const MAX_XML_CHARS = 32 * 1024 * 1024;
const MAX_CELLS_PER_BOOK = 250_000;

function validateXml(xml: string): void {
  if (xml.length > MAX_XML_CHARS) throw new Error('XLSX XML exceeds beta importer limit');
  inspectBoundedForeignXml(xml);
}

function startTags(xml: string, localName: string): string[] {
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${localName}(?:\\s[^>]*)?\\s*/?>`, 'g');
  return xml.match(pattern) ?? [];
}

function blocks(xml: string, localName: string): string[] {
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${localName}\\s*>`, 'g');
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) out.push(match[0]);
  return out;
}

function normalizeTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const baseParts = base.split('/');
  baseParts.pop();
  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

function parseRelationships(xml: string, relBase: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of startTags(xml, 'Relationship')) {
    const id = readAttribute(tag, 'Id');
    const target = readAttribute(tag, 'Target');
    const mode = readAttribute(tag, 'TargetMode');
    if (id && target && mode !== 'External') out.set(id, normalizeTarget(relBase, target));
  }
  return out;
}

function parseSharedStrings(xml: string): string[] {
  validateXml(xml);
  return extractElementFragments(xml, 'si').map((fragment) => extractTextNodes(fragment, 't').join(''));
}


interface XlsxStyleInfo { date: boolean }

const BUILTIN_DATE_NUMFMT_IDS = new Set([14,15,16,17,18,19,20,21,22,27,28,29,30,31,32,33,34,35,36,45,46,47,50,51,52,53,54,55,56,57,58]);

function isDateFormatCode(code: string): boolean {
  const normalized = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').toLocaleLowerCase();
  return /y{2,4}.*d{1,4}|d{1,4}.*y{2,4}|h{1,2}.*s{1,2}|m{1,4}[\/-]d{1,4}|d{1,4}[\/-]m{1,4}/u.test(normalized);
}

function parseStyles(xml: string): XlsxStyleInfo[] {
  validateXml(xml);
  const custom = new Map<number,string>();
  for (const tag of startTags(xml, 'numFmt')) {
    const id = Number.parseInt(readAttribute(tag, 'numFmtId') ?? '', 10);
    const code = readAttribute(tag, 'formatCode');
    if (Number.isInteger(id) && id >= 0 && code) custom.set(id, decodeXmlEntities(code));
  }
  const cellXfs = extractElementFragments(xml, 'cellXfs')[0] ?? '';
  return startTags(cellXfs, 'xf').map((tag) => {
    const id = Number.parseInt(readAttribute(tag, 'numFmtId') ?? '0', 10);
    return { date: BUILTIN_DATE_NUMFMT_IDS.has(id) || isDateFormatCode(custom.get(id) ?? '') };
  });
}

function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) return null;
  const adjusted = serial >= 60 ? serial - 1 : serial;
  const epoch = Date.UTC(1899, 11, 31);
  const millis = epoch + Math.round(adjusted * 86_400_000);
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function isoDateToExcelSerial(value: GridCell['value']): number | null {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const epoch = Date.UTC(1899, 11, 31);
  let serial = (day - epoch) / 86_400_000;
  if (serial >= 60) serial += 1;
  return Number.isFinite(serial) ? serial : null;
}

function parseCell(cellXml: string, sharedStrings: string[], styles: readonly XlsxStyleInfo[]): { ref: string; cell: GridCell } | null {
  const openTag = cellXml.match(/^<[^>]+>/)?.[0] ?? '';
  const ref = readAttribute(openTag, 'r')?.toUpperCase();
  if (!ref || !/^[A-Z]{1,4}[1-9]\d*$/.test(ref)) return null;
  const type = readAttribute(openTag, 't') ?? '';
  const styleIndex = Number.parseInt(readAttribute(openTag, 's') ?? '0', 10);
  const style = Number.isInteger(styleIndex) && styleIndex >= 0 ? styles[styleIndex] : undefined;
  const formulaFragment = extractElementFragments(cellXml, 'f')[0];
  const formula = formulaFragment !== undefined ? `=${decodeXmlEntities(formulaFragment.replace(/<[^>]*>/g, '')).trim()}` : undefined;
  const rawV = extractElementFragments(cellXml, 'v')[0];
  const rawText = rawV !== undefined ? decodeXmlEntities(rawV.replace(/<[^>]*>/g, '')).trim() : '';
  const inlineText = extractTextNodes(cellXml, 't').join('');

  let value: GridCell['value'] = '';
  if (type === 's') {
    const index = Number.parseInt(rawText, 10);
    value = Number.isInteger(index) && index >= 0 && index < sharedStrings.length ? sharedStrings[index] : '';
  } else if (type === 'inlineStr' || type === 'str') {
    value = inlineText || rawText;
  } else if (type === 'b') {
    value = rawText === '1';
  } else if (rawText !== '' && Number.isFinite(Number(rawText))) {
    const numeric = Number(rawText);
    const isoDate = style?.date ? excelSerialToIsoDate(numeric) : null;
    value = isoDate ?? numeric;
  } else {
    value = inlineText || rawText;
  }
  return { ref, cell: { value, formula, ...(style?.date ? { format: 'date' as const } : {}) } };
}

function a1ToIndex(ref: string): { col: number; row: number } | null {
  const match = ref.match(/^([A-Z]+)([1-9]\d*)$/);
  if (!match) return null;
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(match[2]) - 1 };
}


function parseSheetWithSharedStrings(xml: string, tableId: string, shared: string[], styles: readonly XlsxStyleInfo[], cellBudget: { value: number }): TableObject {
  validateXml(xml);
  const cells: Record<string, GridCell> = {};
  let maxCol = 0;
  let maxRow = 0;
  for (const cellXml of blocks(xml, 'c')) {
    const parsed = parseCell(cellXml, shared, styles);
    if (!parsed) continue;
    cellBudget.value += 1;
    if (cellBudget.value > MAX_CELLS_PER_BOOK) throw new Error('XLSX cell count exceeds beta importer limit');
    cells[parsed.ref] = parsed.cell;
    const coord = a1ToIndex(parsed.ref);
    if (coord) {
      maxCol = Math.max(maxCol, coord.col + 1);
      maxRow = Math.max(maxRow, coord.row + 1);
    }
  }
  return { id: tableId, rows: Math.max(30, maxRow), cols: Math.max(12, maxCol), cells };
}

export async function importXlsx(bytes: Uint8Array, fileName: string): Promise<WorkspaceDocument> {
  const { entries } = stripActiveOfficePackageParts(await readZip(bytes));
  validateOpcPackageGraph(entries, 'xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  const workbookBytes = entries.get('xl/workbook.xml');
  const relBytes = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbookBytes || !relBytes || !entries.has('[Content_Types].xml')) throw new Error('Not a valid XLSX package');
  const workbookXml = decodeUtf8(workbookBytes);
  const relXml = decodeUtf8(relBytes);
  validateXml(workbookXml);
  validateXml(relXml);
  const rels = parseRelationships(relXml, 'xl/workbook.xml');
  const sharedBytes = entries.get('xl/sharedStrings.xml');
  const shared = sharedBytes ? parseSharedStrings(decodeUtf8(sharedBytes)) : [];
  const stylesBytes = entries.get('xl/styles.xml');
  const styles = stylesBytes ? parseStyles(decodeUtf8(stylesBytes)) : [{ date: false }];
  const sheetTags = startTags(workbookXml, 'sheet');
  if (!sheetTags.length) throw new Error('XLSX workbook contains no worksheets');
  if (sheetTags.length > 256) throw new Error('XLSX worksheet count exceeds beta importer limit');

  const now = Date.now();
  const objects: WorkspaceDocument['objects'] = {};
  const rootObjectIds: string[] = [];
  const sheets: GridSheetModel[] = [];
  const budget = { value: 0 };

  for (let index = 0; index < sheetTags.length; index++) {
    const tag = sheetTags[index];
    const name = readAttribute(tag, 'name') || `Sheet ${index + 1}`;
    const relId = readAttribute(tag, 'id');
    const path = relId ? rels.get(relId) : undefined;
    if (!path) continue;
    const sheetBytes = entries.get(path);
    if (!sheetBytes) continue;
    const tableId = `xlsx-table-${index + 1}`;
    const table = parseSheetWithSharedStrings(decodeUtf8(sheetBytes), tableId, shared, styles, budget);
    objects[tableId] = { type: 'Table', data: table };
    rootObjectIds.push(tableId);
    sheets.push({ id: `xlsx-sheet-${index + 1}`, name, tableObjectId: tableId });
  }
  if (!sheets.length) throw new Error('XLSX workbook has no readable worksheets');
  stripCircularImportedGridFormulas(sheets, objects);

  return {
    schema_version: 1,
    id: secureRandomId('xlsx'),
    title: fileName.replace(/\.xlsx$/i, '') || 'Imported Workbook',
    kind: 'Grid',
    created_at: now,
    modified_at: now,
    version: 1,
    theme_id: 'default',
    root_object_ids: rootObjectIds,
    objects,
    gridData: {
      sheets,
      activeSheetId: sheets[0].id,
      namedRanges: [],
      interopPreservation: captureGridXmlPreservation(
        entries,
        'xlsx',
        new Set([
          '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
          'xl/styles.xml', 'xl/sharedStrings.xml', 'docProps/core.xml', 'docProps/app.xml',
          ...[...rels.values()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/iu.test(name)),
        ]),
      ),
    },
  };
}


function cellXml(ref: string, cell: GridCell): string {
  const formula = cell.formula?.trim();
  if (formula) {
    const body = formula.startsWith('=') ? formula.slice(1).trim() : formula;
    const allowedFormula = body.length <= FORMULA_MAX_LENGTH
      && /^[\p{L}\p{N}_.$()+\-*/^%,:!<>=\s"']+$/u.test(body)
      && !/\[[^\]\r\n]{1,1024}\]|\b(?:HYPERLINK|WEBSERVICE|RTD|DDE|CALL|REGISTER\.ID|EXEC|EVALUATE|FILTERXML)\s*\(|(?:https?|file):\/\//iu.test(body);
    if (body && allowedFormula) {
      const formulaElement = `<f>${escapeXml(body)}</f>`;
      if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return `<c r="${ref}">${formulaElement}<v>${cell.value}</v></c>`;
      if (typeof cell.value === 'boolean') return `<c r="${ref}" t="b">${formulaElement}<v>${cell.value ? 1 : 0}</v></c>`;
      if (typeof cell.value === 'string') return `<c r="${ref}" t="str">${formulaElement}<v>${escapeXml(cell.value)}</v></c>`;
      return `<c r="${ref}">${formulaElement}</c>`;
    }
    const inertFormula = neutralizeSpreadsheetFormulaInjection(formula);
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(inertFormula)}</t></is></c>`;
  }
  if (cell.format === 'date') {
    const serial = isoDateToExcelSerial(cell.value);
    if (serial !== null) return `<c r="${ref}" s="1"><v>${serial}</v></c>`;
  }
  if (typeof cell.value === 'number') return `<c r="${ref}"><v>${Number.isFinite(cell.value) ? cell.value : 0}</v></c>`;
  if (typeof cell.value === 'boolean') return `<c r="${ref}" t="b"><v>${cell.value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(neutralizeSpreadsheetFormulaInjection(cell.value))}</t></is></c>`;
}

function worksheetXml(table: TableObject): string {
  const rows = new Map<number, Array<{ ref: string; cell: GridCell }>>();
  for (const [ref, cell] of Object.entries(table.cells)) {
    const coord = a1ToIndex(ref.toUpperCase());
    if (!coord) continue;
    const row = rows.get(coord.row) ?? [];
    row.push({ ref: ref.toUpperCase(), cell });
    rows.set(coord.row, row);
  }
  const rowXml = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([rowIndex, cells]) => {
    cells.sort((a, b) => (a1ToIndex(a.ref)?.col ?? 0) - (a1ToIndex(b.ref)?.col ?? 0));
    return `<row r="${rowIndex + 1}">${cells.map(({ ref, cell }) => cellXml(ref, cell)).join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function workbookXml(sheets: GridSheetModel[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name.slice(0, 31) || `Sheet ${index + 1}`)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
}

export function exportXlsx(doc: WorkspaceDocument): Uint8Array {
  if (doc.kind !== 'Grid') throw new Error('XLSX export requires a Grid document');
  const sheets = doc.gridData?.sheets ?? [];
  if (!sheets.length) throw new Error('Grid document contains no worksheets');
  const usable = sheets.filter((sheet) => doc.objects[sheet.tableObjectId]?.type === 'Table').slice(0, 256);
  if (!usable.length) throw new Error('Grid document contains no exportable worksheets');

  const entries: ZipEntry[] = [];
  const overrides = usable.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  entries.push({ name: '[Content_Types].xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`) });
  entries.push({ name: '_rels/.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`) });
  entries.push({ name: 'xl/workbook.xml', data: utf8(workbookXml(usable)) });
  entries.push({ name: 'xl/_rels/workbook.xml.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${usable.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${usable.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
  entries.push({ name: 'xl/styles.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) });

  usable.forEach((sheet, index) => {
    const object = doc.objects[sheet.tableObjectId];
    if (object?.type === 'Table') entries.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: utf8(worksheetXml(object.data)) });
  });
  entries.push({ name: 'docProps/core.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(doc.title)}</dc:title><dc:creator>VGT Workspace</dc:creator></cp:coreProperties>`) });
  entries.push({ name: 'docProps/app.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>VGT Workspace</Application></Properties>`) });
  appendGridPreservedXmlEntries(entries, doc.gridData?.interopPreservation, 'xlsx');
  return writeStoredZip(entries);
}
