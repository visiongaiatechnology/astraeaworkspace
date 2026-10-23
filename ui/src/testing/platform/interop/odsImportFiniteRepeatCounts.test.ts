// STATUS: DIAMANT — a foreign ODS can silently drop cells, and the guard that exists three lines away is missing
// twice.
//
// Measured in round 369, reproduced in round 370 on the real package path. `platform/interop/ods.ts` reads two
// repeat counts straight out of foreign XML:
//
//     const repeatedRows = parseInt(readAttribute(rowTag,  'number-rows-repeated')    || '1', 10);  // :50
//     const repeatedCols = parseInt(readAttribute(cellTag, 'number-columns-repeated') || '1', 10);  // :57
//
// The `|| '1'` fallback fires for a **missing** attribute. It does **not** fire for a present but non-numeric one:
// `'abc' || '1'` is `'abc'`, and `parseInt('abc', 10)` is `NaN`. From there:
//
//   * `Math.min(NaN, 100)` is `NaN`, so `for (let r = 0; r < effectiveRows; r++)` (:53) never runs — **the whole
//     table comes back empty**; and `for (let c = 0; c < effectiveCols; c++)` (:90) never runs, so that cell's value
//     is never written;
//   * `currentCol += repeatedCols` (:101) makes `currentCol` `NaN`, so every later cell in the row is stored under
//     `colToA1Letter(NaN + c)` — and `colToA1Letter` returns `''` for `NaN` (:28-37), which yields the key `'1'`,
//     a coordinate with no column letter.
//
// No throw, no warning, no log: the import resolves and the workbook is short of cells. That is a data-loss path,
// which §1 of the binding strategy says to prioritise regardless of order.
//
// The same file already uses the missing guard three lines further down — `Number.isFinite(num) ? num : textContent`
// on :69 — so the hazard was known and two reads did not get it. `platform/interop/docx/import/pageSetup.ts` had the
// identical shape (GAP-0073).
import { describe, expect, it } from 'vitest';
import type { GridCell, TableObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { exportOds, importOds } from '../../../platform/interop/ods';
import { decodeUtf8, readZip, utf8, writeStoredZip, type ZipEntry } from '../../../platform/interop/zip';

const A1_COORDINATE = /^[A-Z]{1,3}[1-9][0-9]*$/u;

function worksheetDocument(): WorkspaceDocument {
  const cells: Record<string, GridCell> = {
    A1: { value: 'alpha' },
    B1: { value: 'beta' },
    A2: { value: 'gamma' },
  };
  const table: TableObject = { id: 'ods-table-1', rows: 30, cols: 12, cells };
  return {
    schema_version: 1,
    id: 'ods-finite-repeat',
    title: 'ODS finite repeat counts',
    kind: 'Grid',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [table.id],
    objects: { [table.id]: { type: 'Table', data: table } },
    gridData: { sheets: [{ id: 'ods-sheet-1', name: 'Sheet 1', tableObjectId: table.id }] },
  };
}

/** Set an attribute on the FIRST occurrence of a tag — replacing it when present, inserting it when absent. */
function poisonFirstTag(xml: string, tagName: string, attribute: string, value: string): string {
  const open = xml.indexOf(`<${tagName}`);
  if (open < 0) throw new Error(`content.xml has no <${tagName}`);
  const close = xml.indexOf('>', open);
  if (close < 0) throw new Error(`content.xml has an unterminated <${tagName}`);
  const tag = xml.slice(open, close + 1);
  const existing = new RegExp(`\\s${attribute}="[^"]*"`, 'u');
  let patchedTag: string;
  if (existing.test(tag)) {
    patchedTag = tag.replace(existing, ` ${attribute}="${value}"`);
  } else {
    const selfClosing = tag.endsWith('/>');
    const body = selfClosing ? tag.slice(0, -2) : tag.slice(0, -1);
    patchedTag = `${body} ${attribute}="${value}"${selfClosing ? '/>' : '>'}`;
  }
  return `${xml.slice(0, open)}${patchedTag}${xml.slice(close + 1)}`;
}

async function packageWithPoisonedContent(poison: (xml: string) => string): Promise<Uint8Array> {
  const bytes = exportOds(worksheetDocument());
  const entries = await readZip(bytes);
  const content = entries.get('content.xml');
  if (!content) throw new Error('the exported package has no content.xml');
  const poisoned = poison(decodeUtf8(content));
  const output: ZipEntry[] = [];
  for (const [name, data] of entries) output.push({ name, data: name === 'content.xml' ? utf8(poisoned) : data });
  return writeStoredZip(output);
}

async function importedCells(bytes: Uint8Array): Promise<Record<string, GridCell>> {
  const document = await importOds(bytes, 'witness.ods');
  const tableId = document.root_object_ids[0];
  if (!tableId) throw new Error('the imported document has no table');
  const object = document.objects[tableId];
  if (object?.type !== 'Table') throw new Error('the imported root object is not a table');
  return object.data.cells;
}

function values(cells: Record<string, GridCell>): string[] {
  return Object.values(cells).map((cell) => String(cell.value));
}

describe('ODS import keeps repeat counts finite (data-loss class)', () => {
  // The control. While this holds, the two witnesses below are about the repeat attributes and nothing else — in
  // particular they are not about a package the exporter never wrote in the first place.
  it('round-trips a worksheet unchanged when no repeat attribute is poisoned', async () => {
    const cells = await importedCells(exportOds(worksheetDocument()));
    expect(values(cells).sort()).toEqual(['alpha', 'beta', 'gamma']);
    for (const coordinate of Object.keys(cells)) expect(coordinate).toMatch(A1_COORDINATE);
  });

  // GAP-0074. `number-columns-repeated="abc"` on the first cell of the first row. Before the fix the inner loop
  // never ran for that cell, so 'alpha' was lost, and `currentCol` became NaN, so 'beta' was stored under the key
  // '1'.
  it('never drops a cell or writes an impossible coordinate when number-columns-repeated is not a number', async () => {
    const patched = await packageWithPoisonedContent((xml) =>
      poisonFirstTag(xml, 'table:table-cell', 'table:number-columns-repeated', 'abc'));
    const cells = await importedCells(patched);
    expect(values(cells)).toContain('alpha');
    expect(values(cells)).toContain('beta');
    for (const coordinate of Object.keys(cells)) expect(coordinate).toMatch(A1_COORDINATE);
  });

  // The heavier half of the same defect: the row loop is the OUTER one, so a non-finite `number-rows-repeated`
  // empties the entire sheet rather than one row.
  it('never empties the sheet when number-rows-repeated is not a number', async () => {
    const patched = await packageWithPoisonedContent((xml) =>
      poisonFirstTag(xml, 'table:table-row', 'table:number-rows-repeated', 'abc'));
    const cells = await importedCells(patched);
    expect(values(cells).sort()).toEqual(['alpha', 'beta', 'gamma']);
    for (const coordinate of Object.keys(cells)) expect(coordinate).toMatch(A1_COORDINATE);
  });
});
