import { secureRandomId } from '../../shared/crypto/secureRandom';
// STATUS: PLATIN
// Sovereign OpenDocument Spreadsheet (ODS) interoperability: sheets, values, formulas, types.
// Zero-dependency pure TypeScript implementation complying with OASIS OpenDocument v1.2 / v1.3.

import type { GridCell, GridSheetModel, TableObject, WorkspaceDocument } from '../../shared/contracts/workspace';
import { decodeUtf8, readZip, utf8, writeStoredZip, type ZipEntry } from './zip';
import { escapeXml, extractTextNodes, inspectBoundedForeignXml, readAttribute } from '../../shared/interoperability/xml';
import { appendGridPreservedXmlEntries, captureGridXmlPreservation } from '../../apps/grid/interoperability/gridPreservation';
import { validateOdfPackageManifest } from './officePackageGraph';

const MAX_XML_CHARS = 32 * 1024 * 1024;
const MAX_CELLS_PER_BOOK = 250_000;

function validateXml(xml: string): void {
  if (xml.length > MAX_XML_CHARS) throw new Error('ODS XML exceeds beta importer limit');
  inspectBoundedForeignXml(xml);
}

function blocks(xml: string, localName: string): string[] {
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${localName}\\s*>`, 'g');
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) out.push(match[0]);
  return out;
}

function colToA1Letter(col: number): string {
  let temp = col + 1;
  let letter = '';
  while (temp > 0) {
    const rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

/**
 * Parses an ODS table XML block into a TableObject.
 */
function parseOdsTable(tableXml: string, tableId: string, cellBudget: { value: number }): TableObject {
  validateXml(tableXml);
  const cells: Record<string, GridCell> = {};
  let maxCol = 0;
  let currentRow = 0;

  for (const rowXml of blocks(tableXml, 'table-row')) {
    const rowTag = rowXml.match(/^<[^>]+>/)?.[0] ?? '';
    // DEF-RE-011 class (GAP-0074, rounds 369/370). `readAttribute` returns the raw attribute string for a PRESENT
    // attribute, so the `|| '1'` fallback only catches a MISSING one: `'abc' || '1'` is `'abc'`, and
    // `parseInt('abc', 10)` is `NaN`. `Math.min(NaN, 100)` is `NaN`, so this loop never ran and the whole sheet
    // came back empty — the import resolved and reported success. A count of zero or less has the same effect and
    // is not legal in ODF either. `:69` in this file already uses this form for `Number`; these two reads did not.
    const repeatedRowsRaw = parseInt(readAttribute(rowTag, 'number-rows-repeated') || '1', 10);
    const repeatedRows = Number.isFinite(repeatedRowsRaw) && repeatedRowsRaw >= 1 ? repeatedRowsRaw : 1;
    const effectiveRows = Math.min(repeatedRows, 100); // Guard against giant empty row repeat explosions

    for (let r = 0; r < effectiveRows; r++) {
      let currentCol = 0;
      for (const cellXml of blocks(rowXml, 'table-cell')) {
        const cellTag = cellXml.match(/^<[^>]+>/)?.[0] ?? '';
        const repeatedColsRaw = parseInt(readAttribute(cellTag, 'number-columns-repeated') || '1', 10);
        const repeatedCols = Number.isFinite(repeatedColsRaw) && repeatedColsRaw >= 1 ? repeatedColsRaw : 1;
        const valType = readAttribute(cellTag, 'value-type');
        const rawFormula = readAttribute(cellTag, 'formula');

        // Extract text nodes
        const textContent = extractTextNodes(cellXml, 'p').join(' ').trim();
        const rawValueAttr = readAttribute(cellTag, 'value');
        const boolValueAttr = readAttribute(cellTag, 'boolean-value');

        let cellValue: GridCell['value'] = '';
        if (valType === 'float' || valType === 'percentage' || valType === 'currency') {
          const num = Number(rawValueAttr || textContent);
          cellValue = Number.isFinite(num) ? num : textContent;
        } else if (valType === 'date') {
          const rawDate = readAttribute(cellTag, 'date-value') || textContent;
          const date = new Date(rawDate);
          cellValue = Number.isNaN(date.getTime()) ? textContent : date.toISOString().slice(0, 10);
        } else if (valType === 'boolean') {
          cellValue = boolValueAttr === 'true' || textContent.toLowerCase() === 'true';
        } else if (textContent) {
          cellValue = textContent;
        }

        let formula: string | undefined;
        if (rawFormula) {
          // ODS formula format is typically 'of:=SUM([.A1:.A10])' or '=[.A1]+[.B1]'
          let cleanF = rawFormula.replace(/^of:=|^=/, '').trim();
          cleanF = cleanF.replace(/\[\.([A-Z0-9]+)\]/g, '$1');
          cleanF = cleanF.replace(/\[\.([A-Z0-9]+):\.([A-Z0-9]+)\]/g, '$1:$2');
          formula = `=${cleanF}`;
        }

        const effectiveCols = Math.min(repeatedCols, 100);
        for (let c = 0; c < effectiveCols; c++) {
          if (cellValue !== '' || formula !== undefined) {
            cellBudget.value += 1;
            if (cellBudget.value > MAX_CELLS_PER_BOOK) {
              throw new Error('ODS cell count exceeds beta importer limit');
            }
            const coord = `${colToA1Letter(currentCol + c)}${currentRow + 1}`;
            cells[coord] = { value: cellValue, formula, ...(valType === 'date' ? { format: 'date' as const } : {}) };
            maxCol = Math.max(maxCol, currentCol + c + 1);
          }
        }
        currentCol += repeatedCols;
      }
      currentRow += 1;
    }
  }

  return {
    id: tableId,
    rows: Math.max(30, currentRow),
    cols: Math.max(12, maxCol),
    cells,
  };
}

/**
 * Imports an ODS binary file into a WorkspaceDocument.
 */
export async function importOds(bytes: Uint8Array, fileName: string): Promise<WorkspaceDocument> {
  const entries = await readZip(bytes);
  validateOdfPackageManifest(entries);
  const contentBytes = entries.get('content.xml');
  if (!contentBytes) throw new Error('Not a valid ODS package: missing content.xml');

  const contentXml = decodeUtf8(contentBytes);
  validateXml(contentXml);

  const tableBlocks = blocks(contentXml, 'table');
  if (!tableBlocks.length) throw new Error('ODS package contains no spreadsheets');

  const now = Date.now();
  const objects: WorkspaceDocument['objects'] = {};
  const rootObjectIds: string[] = [];
  const sheets: GridSheetModel[] = [];
  const budget = { value: 0 };

  for (let index = 0; index < tableBlocks.length; index++) {
    const tableXml = tableBlocks[index];
    const tableTag = tableXml.match(/^<[^>]+>/)?.[0] ?? '';
    const name = readAttribute(tableTag, 'name') || `Sheet ${index + 1}`;
    const tableId = `ods-table-${index + 1}`;

    const table = parseOdsTable(tableXml, tableId, budget);
    objects[tableId] = { type: 'Table', data: table };
    rootObjectIds.push(tableId);
    sheets.push({ id: `ods-sheet-${index + 1}`, name, tableObjectId: tableId });
  }

  return {
    schema_version: 1,
    id: secureRandomId('ods'),
    title: fileName.replace(/\.ods$/i, '') || 'Imported ODS Workbook',
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
        'ods',
        new Set(['content.xml', 'styles.xml', 'meta.xml', 'settings.xml', 'META-INF/manifest.xml']),
      ),
    },
  };
}


function toOdsFormula(formula: string): string {
  const source = formula.replace(/^=/u, '');
  let out = '', quoted = false;
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    if (ch === '"') { quoted = !quoted; out += ch; i += 1; continue; }
    if (!quoted) {
      const match = source.slice(i).match(/^(\$?[A-Z]{1,3}\$?[1-9]\d*)(?::(\$?[A-Z]{1,3}\$?[1-9]\d*))?/u);
      const previous = i > 0 ? source[i - 1] : '';
      if (match && !/[A-Za-z0-9_.]/u.test(previous)) {
        const normalize = (ref: string) => ref.replace(/\$/gu, '');
        out += match[2] ? `[.${normalize(match[1])}:.${normalize(match[2])}]` : `[.${normalize(match[1])}]`;
        i += match[0].length;
        continue;
      }
    }
    out += ch; i += 1;
  }
  return out;
}

/**
 * Exports a WorkspaceDocument into an ODS binary byte array.
 */
export function exportOds(doc: WorkspaceDocument): Uint8Array {
  if (doc.kind !== 'Grid') throw new Error('ODS export requires a Grid document');
  const sheets = doc.gridData?.sheets ?? [];
  if (!sheets.length) throw new Error('Grid document contains no worksheets');

  const entries: ZipEntry[] = [];

  // 1. mimetype (must be first and uncompressed)
  entries.push({
    name: 'mimetype',
    data: utf8('application/vnd.oasis.opendocument.spreadsheet'),
  });

  // 2. META-INF/manifest.xml
  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;
  entries.push({ name: 'META-INF/manifest.xml', data: utf8(manifestXml) });

  // 3. content.xml
  let tablesXml = '';
  for (const sheet of sheets) {
    const obj = doc.objects[sheet.tableObjectId];
    if (obj?.type !== 'Table') continue;
    const table: TableObject = obj.data;

    let rowsXml = '';
    for (let r = 0; r < table.rows; r++) {
      let cellsXml = '';
      for (let c = 0; c < table.cols; c++) {
        const coord = `${colToA1Letter(c)}${r + 1}`;
        const cell = table.cells[coord];

        if (!cell || (cell.value === '' && !cell.formula)) {
          cellsXml += '<table:table-cell/>';
          continue;
        }

        const formulaAttr = cell.formula ? ` table:formula="of:=${escapeXml(toOdsFormula(cell.formula))}"` : '';

        if (cell.format === 'date') {
          const date = new Date(String(cell.value));
          const iso = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
          cellsXml += iso ? `<table:table-cell table:style-name="VgtDateCell" office:value-type="date" office:date-value="${iso}"${formulaAttr}><text:p>${iso}</text:p></table:table-cell>` : `<table:table-cell office:value-type="string"${formulaAttr}><text:p>${escapeXml(String(cell.value ?? ''))}</text:p></table:table-cell>`;
        } else if (typeof cell.value === 'number') {
          cellsXml += `<table:table-cell office:value-type="float" office:value="${cell.value}"${formulaAttr}><text:p>${cell.value}</text:p></table:table-cell>`;
        } else if (typeof cell.value === 'boolean') {
          cellsXml += `<table:table-cell office:value-type="boolean" office:boolean-value="${cell.value}"${formulaAttr}><text:p>${cell.value}</text:p></table:table-cell>`;
        } else {
          const valStr = escapeXml(String(cell.value ?? ''));
          cellsXml += `<table:table-cell office:value-type="string"${formulaAttr}><text:p>${valStr}</text:p></table:table-cell>`;
        }
      }
      rowsXml += `<table:table-row>${cellsXml}</table:table-row>`;
    }

    tablesXml += `<table:table table:name="${escapeXml(sheet.name)}">${rowsXml}</table:table>`;
  }

  const contentDocXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" office:version="1.2">
  <office:automatic-styles>
    <number:date-style style:name="VgtDateFormat"><number:year number:style="long"/><number:text>-</number:text><number:month number:style="long"/><number:text>-</number:text><number:day number:style="long"/></number:date-style>
    <style:style style:name="VgtDateCell" style:family="table-cell" style:data-style-name="VgtDateFormat"/>
  </office:automatic-styles>
  <office:body>
    <office:spreadsheet>
      ${tablesXml}
    </office:spreadsheet>
  </office:body>
</office:document-content>`;
  entries.push({ name: 'content.xml', data: utf8(contentDocXml) });

  // 4. styles.xml
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2"/>`;
  entries.push({ name: 'styles.xml', data: utf8(stylesXml) });

  // 5. meta.xml
  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
  <office:meta>
    <dc:title>${escapeXml(doc.title)}</dc:title>
    <dc:creator>Astraea Workspace</dc:creator>
  </office:meta>
</office:document-meta>`;
  entries.push({ name: 'meta.xml', data: utf8(metaXml) });
  appendGridPreservedXmlEntries(entries, doc.gridData?.interopPreservation, 'ods');

  return writeStoredZip(entries);
}
