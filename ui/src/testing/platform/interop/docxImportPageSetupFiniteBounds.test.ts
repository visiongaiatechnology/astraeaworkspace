// STATUS: DIAMANT — a foreign DOCX can put `NaN` into a Writer page margin, and the condition that should stop it
// tests a different attribute than the clamp reads.
//
// Measured in round 367, on the real package path. `platform/interop/docx/import/pageSetup.ts` writes the standard
// page border as
//
//     const borderSize    = Number(readAttribute(borderTag, 'sz')    ?? 0);   // :131
//     const borderSpacePt = Number(readAttribute(borderTag, 'space') ?? 0);   // :132
//     const standardPageBorders =
//       borderStyle && borderColor && Number.isFinite(borderSize) && borderSize  // :152  <- tests `sz`
//         ? { widthPt: borderSize / 8,
//             paddingMm: Number((Math.min(31, Math.max(0, borderSpacePt)) * 25.4 / 72).toFixed(2)) }  // :157 <- reads `space`
//         : undefined;
//
// `readAttribute` (`shared/interoperability/xml.ts:60`) returns `null` for a **missing** attribute and the raw string
// for a **present** one, without asking whether it is a number. So for `w:space="abc"` the `?? 0` never fires,
// `Number('abc')` is `NaN`, and `Math.max(0, NaN)` is `NaN` — a guard that fails for exactly the input a guard
// exists for. That is the class of DEF-RE-009/010/013-018, and this is its first measured instance outside Writer.
//
// Three neighbouring reads in the same file carry the guard the clamp lacks: `:27` and `:56` use
// `Number.isFinite(...) ? ... : fallback`, and `:171` gates the watermark on `Number.isFinite` twice. The author
// knew the hazard; these two lines did not get it.
//
// The witness does not care *how* the bound is enforced — only that no imported document receives a non-finite
// page margin. It builds a real DOCX, patches the section properties of `word/document.xml` to carry a valid
// `w:sz` and a non-numeric `w:space`, and reads the imported model back.
import { describe, expect, it } from 'vitest';
import type { Paragraph, TextBlockObject, WorkspaceDocument, WriterPageSetupConfig } from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { decodeUtf8, readZip, utf8, writeStoredZip, type ZipEntry } from '../../../platform/interop/zip';

const paragraph = (text: string): Paragraph => ({
  id: 'body-1',
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 },
  spans: [{ text }],
});

const setup = (overrides: Partial<WriterPageSetupConfig> = {}): WriterPageSetupConfig => ({
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
  ...overrides,
});

function documentWithSetup(pageSetup: WriterPageSetupConfig): WorkspaceDocument {
  const textBlock: TextBlockObject = { id: 'text-root', paragraphs: [paragraph('Body text')] };
  return {
    schema_version: 1,
    id: 'docx-import-finite-bounds',
    title: 'DOCX import finite bounds',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlock.id],
    objects: { [textBlock.id]: { type: 'TextBlock', data: textBlock } },
    writerData: { pageSetup, tables: [], sections: [] },
  };
}

/** Replace one part of a real DOCX package and rebuild it. */
async function packageWithParts(packageBytes: Uint8Array, replacements: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  const entries = await readZip(packageBytes);
  const output: ZipEntry[] = [];
  for (const [name, data] of entries) output.push({ name, data: replacements.get(name) ?? data });
  return writeStoredZip(output);
}

/**
 * A page border the importer accepts in every respect except the one under test: `w:val="single"` maps to the style
 * `solid`, `w:sz="12"` is finite and greater than zero, `w:color` is a valid hex colour — and `w:space` is the
 * string `abc`, which `Number()` turns into `NaN`.
 */
const BORDER_WITH_NON_NUMERIC_SPACE =
  '<w:pgBorders><w:top w:val="single" w:sz="12" w:space="abc" w:color="FF0000"/></w:pgBorders>';

const BORDER_WITH_NUMERIC_SPACE =
  '<w:pgBorders><w:top w:val="single" w:sz="12" w:space="8" w:color="FF0000"/></w:pgBorders>';

/** Put `pgBorders` inside the section properties of `word/document.xml`. */
async function packageWithPageBorders(pageBorders: string): Promise<Uint8Array> {
  const bytes = exportDocx(documentWithSetup(setup()));
  const entries = await readZip(bytes);
  const documentPart = entries.get('word/document.xml');
  if (!documentPart) throw new Error('the exported package has no word/document.xml');
  const xml = decodeUtf8(documentPart);
  const closeIndex = xml.lastIndexOf('</w:sectPr>');
  if (closeIndex < 0) throw new Error('word/document.xml has no </w:sectPr> to inject into');
  const patched = `${xml.slice(0, closeIndex)}${pageBorders}${xml.slice(closeIndex)}`;
  return packageWithParts(bytes, new Map([['word/document.xml', utf8(patched)]]));
}

/**
 * GAP-0075 (round 371). `<w:cols>` with `w:equalWidth="0"` and one column whose `w` is not a number. It is the only
 * one of the 22 foreign-attribute reads in `ui/src/platform` without a guard: `pageSetup.ts:62` reads `w` with
 * `Number(... ?? 0)`, and `??` catches `null`, not `'abc'`. The four sibling reads on `:26`, `:53`, `:55` and `:100`
 * all carry a finiteness guard, and so do the two that were fixed in round 368.
 */
const COLUMNS_WITH_NON_NUMERIC_WIDTH =
  '<w:cols w:num="2" w:equalWidth="0"><w:col w="abc"/><w:col w="2400"/></w:cols>';

/**
 * Replace the `<w:cols>` element of `word/document.xml` with `columns`, or append it to the section properties when
 * the export wrote none. Replacing rather than appending matters: `parsePageSetup` locates `<w:cols>` with a
 * `String.match`, so it takes the FIRST one in the file — and the export already writes one (`layout.ts:44-45`). The
 * first version of this witness appended a second element and the control caught it: `columns` came back as `1`.
 */
async function packageWithColumns(columns: string): Promise<Uint8Array> {
  const bytes = exportDocx(documentWithSetup(setup()));
  const entries = await readZip(bytes);
  const documentPart = entries.get('word/document.xml');
  if (!documentPart) throw new Error('the exported package has no word/document.xml');
  const xml = decodeUtf8(documentPart);
  const existing = /<w:cols\b[^>]*(?:\/>|>[\s\S]*?<\/w:cols>)/u;
  let patched: string;
  if (existing.test(xml)) {
    patched = xml.replace(existing, columns);
  } else {
    const closeIndex = xml.lastIndexOf('</w:sectPr>');
    if (closeIndex < 0) throw new Error('word/document.xml has no </w:sectPr> to append to');
    patched = `${xml.slice(0, closeIndex)}${columns}${xml.slice(closeIndex)}`;
  }
  expect(patched).not.toBe(xml);
  return packageWithParts(bytes, new Map([['word/document.xml', utf8(patched)]]));
}

function importedBorders(document: WorkspaceDocument): NonNullable<WriterPageSetupConfig['pageBorders']> {
  const borders = document.writerData?.pageSetup?.pageBorders;
  if (!borders) throw new Error('the imported document carries no page borders — the witness would prove nothing');
  return borders;
}

describe('DOCX import keeps page margins finite (DEF-RE-015 class)', () => {
  it('turns a numeric w:space into a finite padding and keeps the style and colour', async () => {
    const patched = await packageWithPageBorders(BORDER_WITH_NUMERIC_SPACE);
    const imported = await importDocx(patched, 'border-space-numeric.docx');
    const borders = importedBorders(imported);
    // The control: while this holds, the section below is testing the `space` attribute and nothing else.
    expect(borders.style).toBe('solid');
    expect(borders.color?.toUpperCase()).toBe('#FF0000');
    expect(Number.isFinite(borders.paddingMm)).toBe(true);
    // 8 pt in millimetres, the value the clamp produces for a finite input.
    expect(borders.paddingMm).toBeCloseTo(2.82, 2);
  });

  // The finding. `w:space="abc"` is what a foreign or damaged file can carry; `Number('abc')` is `NaN`, and
  // `Math.max(0, NaN)` is `NaN`. Before the fix this read `paddingMm: NaN` — a page margin that is not a number,
  // imported from a file the user was simply opening.
  it('never hands the model a non-finite page margin when w:space is not a number', async () => {
    const patched = await packageWithPageBorders(BORDER_WITH_NON_NUMERIC_SPACE);
    const imported = await importDocx(patched, 'border-space-not-a-number.docx');
    const borders = importedBorders(imported);
    expect(borders.style).toBe('solid');
    expect(borders.color?.toUpperCase()).toBe('#FF0000');
    expect(Number.isFinite(borders.paddingMm)).toBe(true);
  });

  // The same question for every other length the importer reads out of the section properties. A `<w:pgMar>` and a
  // `<w:pgSz>` are read with `Number(... ?? fallback)` too, and the fallback only fires for a MISSING attribute.
  it('never hands the model a non-finite paper size or margin when the section attributes are not numbers', async () => {
    const bytes = exportDocx(documentWithSetup(setup()));
    const entries = await readZip(bytes);
    const documentPart = entries.get('word/document.xml');
    if (!documentPart) throw new Error('the exported package has no word/document.xml');
    const xml = decodeUtf8(documentPart);
    const poisoned = xml
      .replace(/(<w:pgSz\b[^>]*?)\sw="\d+"/u, '$1 w="abc"')
      .replace(/(<w:pgSz\b[^>]*?)\sh="\d+"/u, '$1 h="abc"')
      .replace(/(<w:pgMar\b[^>]*?)\sw:top="[^"]*"/u, '$1 w:top="abc"');
    expect(poisoned).not.toBe(xml);
    const patched = await packageWithParts(bytes, new Map([['word/document.xml', utf8(poisoned)]]));

    const imported = await importDocx(patched, 'section-attributes-not-numbers.docx');
    const pageSetup = imported.writerData?.pageSetup;
    if (!pageSetup) throw new Error('the imported document carries no page setup');
    expect(Number.isFinite(pageSetup.customWidthMm ?? 0)).toBe(true);
    expect(Number.isFinite(pageSetup.customHeightMm ?? 0)).toBe(true);
    for (const value of Object.values(pageSetup.customMargins ?? {})) {
      expect(Number.isFinite(value)).toBe(true);
    }
    // GAP-0075 was missed by the first version of this test because it checked three output fields and this is a
    // fourth. Enumerate the field instead of trusting that the list is complete.
    for (const value of pageSetup.columnWidthsMm ?? []) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  // GAP-0075. `<w:col w="abc"/>` inside `<w:cols w:equalWidth="0">`. `columnWidthsMm` is the last output field of
  // `pageSetup.ts` that nothing guards: the value goes straight from `Number(readAttribute(tag, 'w') ?? 0)` into
  // the returned object on `:74`.
  it('never hands the model a non-finite column width when a w:col width is not a number', async () => {
    const patched = await packageWithColumns(COLUMNS_WITH_NON_NUMERIC_WIDTH);
    const imported = await importDocx(patched, 'columns-not-numbers.docx');
    const pageSetup = imported.writerData?.pageSetup;
    if (!pageSetup) throw new Error('the imported document carries no page setup');
    // The control: `unequalColumns && columnTags.length === columns` must hold, otherwise the branch never runs and
    // this test would prove nothing. Two `<w:col>` tags and `w:num="2"` are what open it.
    expect(pageSetup.columns).toBe(2);
    const widths = pageSetup.columnWidthsMm;
    expect(widths).toBeDefined();
    expect(widths).toHaveLength(2);
    for (const value of widths ?? []) {
      expect(Number.isFinite(value)).toBe(true);
    }
    // The second column keeps its real width: the guard must not flatten the whole array.
    expect(widths?.[1]).toBeCloseTo(42.33, 1);
  });
});
