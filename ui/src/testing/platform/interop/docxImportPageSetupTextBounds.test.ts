// STATUS: PLATIN — W-314: the DOCX importer used to create Writer documents no export would accept.
//
// Measured before the fix, on the real package path: `platform/interop/docx/import/headerFooter.ts` read all six
// header/footer texts with **no** character bound, while `validateWriterHeaderFooter` (called by the DOCX exporter
// and by the Writer PDF export) refuses anything above `MAX_WRITER_HEADER_FOOTER_CHARACTERS` (4 096). A foreign
// DOCX with a 5 000-character header therefore imported fine and then **every** export of it threw
// `Invalid Writer header/footer`. The second half of the finding was the watermark: `pageSetup.ts` cut it with
// `slice(0, 120)` and said nothing.
import { describe, expect, it } from 'vitest';
import type { Paragraph, TextBlockObject, WorkspaceDocument, WriterPageSetupConfig } from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { readZip, utf8, writeStoredZip, type ZipEntry } from '../../../platform/interop/zip';
import {
  MAX_WRITER_HEADER_FOOTER_CHARACTERS,
  validateWriterHeaderFooter,
  writerHeaderFooterTextLength,
  writerHeaderFooterTextWithinLimit,
} from '../../../shared/writer/layout/headerFooter';
import { MAX_WRITER_WATERMARK_CHARACTERS } from '../../../shared/writer/layout/pageDecorations';

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
  headerText: 'SHORT HEADER',
  footerText: '',
  ...overrides,
});

function documentWithSetup(pageSetup: WriterPageSetupConfig): WorkspaceDocument {
  const textBlock: TextBlockObject = { id: 'text-root', paragraphs: [paragraph('Body text')] };
  return {
    schema_version: 1,
    id: 'docx-import-bounds',
    title: 'DOCX import bounds',
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

async function packageWithParts(packageBytes: Uint8Array, replacements: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  const entries = await readZip(packageBytes);
  const output: ZipEntry[] = [];
  for (const [name, data] of entries) output.push({ name, data: replacements.get(name) ?? data });
  return writeStoredZip(output);
}

function headerPartXml(text: string): Uint8Array {
  return utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:hdr>`);
}

async function headerPartNames(bytes: Uint8Array): Promise<string[]> {
  const entries = await readZip(bytes);
  return [...entries.keys()].filter((name) => /^word\/header\d+\.xml$/u.test(name));
}

describe('DOCX import bounds for Writer page-setup text (W-314)', () => {
  it('the shared measure counts code points, so importer and validator agree on what fits', () => {
    expect(MAX_WRITER_HEADER_FOOTER_CHARACTERS).toBe(4_096);
    // 4 096 astral characters are 8 192 UTF-16 units: a `value.length` check in the importer would have refused a
    // file the validator accepts.
    const astral = '🙂'.repeat(MAX_WRITER_HEADER_FOOTER_CHARACTERS);
    expect(astral.length).toBe(2 * MAX_WRITER_HEADER_FOOTER_CHARACTERS);
    expect(writerHeaderFooterTextLength(astral)).toBe(MAX_WRITER_HEADER_FOOTER_CHARACTERS);
    expect(writerHeaderFooterTextWithinLimit(astral)).toBe(true);
    expect(writerHeaderFooterTextWithinLimit('🙂'.repeat(MAX_WRITER_HEADER_FOOTER_CHARACTERS + 1))).toBe(false);
    expect(writerHeaderFooterTextWithinLimit(undefined)).toBe(true);
  });

  it('refuses a DOCX header above 4 096 characters at import, naming the limit', async () => {
    const bytes = exportDocx(documentWithSetup(setup()));
    const headerParts = await headerPartNames(bytes);
    expect(headerParts).toHaveLength(1);
    const patched = await packageWithParts(bytes, new Map([[headerParts[0]!, headerPartXml('H'.repeat(5_000))]]));

    await expect(importDocx(patched, 'long-header.docx'))
      .rejects.toThrow('DOCX header (default) text exceeds the 4096-character limit (5000 characters).');
  });

  // The witness the finding is really about: it does not care *how* the bound is enforced, only that the model
  // never receives a header the validator refuses. Under the old code this failed the other way round — the import
  // resolved and `validateWriterHeaderFooter` returned the German "höchstens 4.096 Zeichen" message, which is what
  // made every later DOCX and PDF export of an imported file throw.
  it('never hands the model a header the validator refuses', async () => {
    const bytes = exportDocx(documentWithSetup(setup()));
    const headerParts = await headerPartNames(bytes);
    const patched = await packageWithParts(bytes, new Map([[headerParts[0]!, headerPartXml('H'.repeat(5_000))]]));

    let imported: WorkspaceDocument | undefined;
    try {
      imported = await importDocx(patched, 'trap-long-header.docx');
    } catch (error) {
      expect((error as Error).message).toContain('4096-character limit');
      return;
    }

    expect(validateWriterHeaderFooter(imported.writerData?.pageSetup as WriterPageSetupConfig)).toBeNull();
    expect(() => exportDocx(imported!)).not.toThrow();
  });

  it('still imports a header of exactly 4 096 characters, and that document can be exported again', async () => {
    const bytes = exportDocx(documentWithSetup(setup()));
    const headerParts = await headerPartNames(bytes);
    const patched = await packageWithParts(bytes, new Map([[headerParts[0]!, headerPartXml('H'.repeat(MAX_WRITER_HEADER_FOOTER_CHARACTERS))]]));

    const imported = await importDocx(patched, 'exact-header.docx');

    expect(writerHeaderFooterTextLength(imported.writerData?.pageSetup.headerText ?? '')).toBe(MAX_WRITER_HEADER_FOOTER_CHARACTERS);
    expect(() => exportDocx(imported)).not.toThrow();
  });

  it('refuses a DOCX watermark above 120 characters instead of cutting it silently', async () => {
    const watermark = 'W'.repeat(MAX_WRITER_WATERMARK_CHARACTERS);
    const source = documentWithSetup(setup({
      watermark: { enabled: true, text: watermark, opacity: 0.1, rotationDeg: -45, color: '#94A3B8' },
    }));
    const bytes = exportDocx(source);
    const documentXml = new TextDecoder().decode((await readZip(bytes)).get('word/document.xml') ?? new Uint8Array());
    expect(documentXml).toContain(`vgt:watermarkText="${watermark}"`);
    const patchedXml = documentXml.replace(`vgt:watermarkText="${watermark}"`, `vgt:watermarkText="${watermark}X"`);
    const patched = await packageWithParts(bytes, new Map([['word/document.xml', utf8(patchedXml)]]));

    await expect(importDocx(patched, 'long-watermark.docx'))
      .rejects.toThrow(`DOCX watermark text exceeds the ${MAX_WRITER_WATERMARK_CHARACTERS}-character limit (${MAX_WRITER_WATERMARK_CHARACTERS + 1} characters).`);
  });

  it('still imports a watermark of exactly 120 characters', async () => {
    const watermark = 'W'.repeat(MAX_WRITER_WATERMARK_CHARACTERS);
    const bytes = exportDocx(documentWithSetup(setup({
      watermark: { enabled: true, text: watermark, opacity: 0.1, rotationDeg: -45, color: '#94A3B8' },
    })));

    const imported = await importDocx(bytes, 'exact-watermark.docx');

    expect(imported.writerData?.pageSetup.watermark?.text).toBe(watermark);
  });
});
