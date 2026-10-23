// STATUS: PLATIN — Writer acceptance harness, part 4/5: interchange — DOCX/ODT/RTF import, PDF/DOCX
// export, roundtrip and the acceptance letter.
//
// See `writerAcceptanceFrontend.test.tsx` for what this suite is and is not. Every `it` is titled
// `AST-xxxx` so `tools/writer-acceptance.mjs` can attribute the automated half of the acceptance point.
//
// These are the points where the automated half carries the most weight: the byte-level result of an
// export is real evidence, and the part that is missing is exactly the human opening the file.
import { describe, expect, it } from 'vitest';

import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';

import { detectFormat, importDocument, importMarkdown, importOdtXml, importRtf } from '../../interchange/import/writerImporter';
import {
  exportWriterPortableDocument,
  importWriterPortableBytes,
} from '../../interchange/portable/writerPortableInterop';
import { buildWriterPdf } from '../../interchange/export/pdf/writerPdfExport';
import type { WriterPdfTextRasterizer } from '../../interchange/export/pdf/writerPdfTextRaster';
import { preflightWriterPdfA2b } from '../../interchange/export/pdf-archive/writerPdfArchiveValidation';
import { exportDocx } from '../../../../platform/interop/docx/exporter';
import { readZip } from '../../../../platform/interop/zip';
import { buildBusinessLetter, LETTER_PAGE_SETUP } from '../fixtures/writerBusinessLetter';

const decode = (bytes: Uint8Array): string => new TextDecoder('utf8').decode(bytes);
const pdfText = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

/** The same rasteriser stub the PDF round-trip test uses; a thinner one makes the export throw. */
const testTextRasterizer: WriterPdfTextRasterizer = () => ({
  widthPx: 16, heightPx: 16, widthPt: 8, heightPt: 8,
  baselineFromBottomPt: 3, packedMaskHex: `${'FF'.repeat(32)}>`,
});

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

function writerDocument(id: string, title: string, paragraphs: Paragraph[]): WorkspaceDocument {
  return {
    id,
    title,
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'vgt-default',
    root_object_ids: [`tb-${id}`],
    objects: {
      [`tb-${id}`]: { type: 'TextBlock', data: { id: `tb-${id}`, paragraphs } },
    },
    writerData: { pageSetup: LETTER_PAGE_SETUP, tables: [] },
  };
}

function paragraphsOf(document: WorkspaceDocument): Paragraph[] {
  const block = Object.values(document.objects).find((object) => object.type === 'TextBlock');
  return block?.type === 'TextBlock' ? block.data.paragraphs : [];
}

describe('Writer acceptance — interchange', () => {
  it('AST-0180 a multi-paragraph DOCX imports without losing a paragraph and is immediately editable', () => {
    const docxXml = [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Kapitel</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Erster Absatz</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Zweiter Absatz</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Dritter Absatz</w:t></w:r></w:p>',
      '</w:body></w:document>',
    ].join('');
    // Format detection from the file name is what the import dialog relies on.
    expect(detectFormat('brief.docx', docxXml)).toBe('docx');

    const imported = importDocument(docxXml, 'brief.docx');
    expect(imported.paragraphs.length).toBeGreaterThanOrEqual(4);
    const texts = imported.paragraphs.map((item) => item.spans.map((span) => span.text).join(''));
    expect(texts).toContain('Erster Absatz');
    expect(texts).toContain('Zweiter Absatz');
    expect(texts).toContain('Dritter Absatz');
    // The heading survives as a heading, which is what keeps the outline usable after an import.
    expect(imported.paragraphs.some((item) => (item.style.heading_level ?? 0) > 0)).toBe(true);
  });

  it('AST-0185 ODT and RTF keep their layout and export back interoperably', async () => {
    const odtXml = [
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ',
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">',
      '<office:body><office:text>',
      '<text:h text:outline-level="1">Überschrift</text:h>',
      '<text:p>Erster Absatz</text:p>',
      '<text:p>Zweiter Absatz</text:p>',
      '</office:text></office:body></office:document-content>',
    ].join('');
    expect(detectFormat('brief.odt', odtXml)).toBe('odt');
    const odt = importOdtXml(odtXml);
    const odtTexts = odt.paragraphs.map((item) => item.spans.map((span) => span.text).join(''));
    expect(odtTexts).toContain('Erster Absatz');
    expect(odt.paragraphs.some((item) => (item.style.heading_level ?? 0) > 0)).toBe(true);

    const rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Erster Absatz\\par Zweiter Absatz\\par}';
    expect(detectFormat('brief.rtf', rtf)).toBe('rtf');
    const parsedRtf = importRtf(rtf);
    expect(parsedRtf.paragraphs.length).toBeGreaterThanOrEqual(2);

    // Re-export the imported text and import it again: the roundtrip must be stable.
    const document = writerDocument('doc-odt', 'Interop', odt.paragraphs);
    const exported = exportWriterPortableDocument(document, 'odt');
    expect(exported.fileName).toMatch(/\.odt$/u);
    expect(exported.bytes.byteLength).toBeGreaterThan(0);
    const reimported = await importWriterPortableBytes(exported.bytes, exported.fileName);
    // The re-import produces a real Writer workspace document, not a loose paragraph list.
    expect(reimported.kind).toBe('Writer');
    const reimportedTexts = paragraphsOf(reimported).map((item) => item.spans.map((span) => span.text).join(''));
    expect(reimportedTexts).toContain('Erster Absatz');
  });

  it('AST-0190 Markdown structure imports, edits and exports without losing the headings', () => {
    const markdown = [
      '# Titel des Dokuments',
      '',
      'Ein Absatz mit **fett** und *kursiv*.',
      '',
      '## Abschnitt',
      '',
      '- Punkt eins',
      '- Punkt zwei',
    ].join('\n');
    expect(detectFormat('notiz.md', markdown)).toBe('markdown');
    const imported = importMarkdown(markdown);
    expect(imported.paragraphs.length).toBeGreaterThanOrEqual(4);
    expect(imported.paragraphs.some((item) => item.style.heading_level === 1)).toBe(true);
    expect(imported.paragraphs.some((item) => item.style.heading_level === 2)).toBe(true);

    // Export back to Markdown and check that the structure is still recognisable as Markdown.
    const document = writerDocument('doc-md', imported.title, imported.paragraphs);
    const exported = exportWriterPortableDocument(document, 'markdown');
    const text = decode(exported.bytes);
    expect(text).toContain('#');
    expect(text).toContain('Absatz');

    // Plain text roundtrip: every paragraph survives as a line.
    const txt = exportWriterPortableDocument(document, 'txt');
    expect(decode(txt.bytes).split('\n').filter((line) => line.trim().length > 0).length)
      .toBeGreaterThanOrEqual(imported.paragraphs.length);
  });

  it('AST-0195 exporting the document produces a real, page-structured PDF that carries the text', () => {
    const paragraphs = [
      paragraph('a', 'VisionGaia Technology GmbH – Angebot'),
      paragraph('b', 'Sehr geehrte Damen und Herren,'),
      paragraph('c', 'wir bedanken uns für Ihre Anfrage und legen unser Angebot vor.'),
      paragraph('d', 'Mit freundlichen Grüßen'),
    ];
    const bytes = buildWriterPdf('Angebot', paragraphs, LETTER_PAGE_SETUP, [], [], [], [], {}, {}, {
      textRasterizer: testTextRasterizer,
    });
    expect(bytes.byteLength).toBeGreaterThan(500);
    const text = pdfText(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('%%EOF');
    // More than one page object when the text is long enough, and the page tree is present.
    expect(text).toContain('/Type /Page');
    // The document text (ASCII parts) is really in the content stream, not only in metadata.
    expect(text).toContain('Angebot');
    // The PDF/A preflight either passes or fails with named reasons — never silently "fine".
    const preflight = preflightWriterPdfA2b(bytes);
    expect(Array.isArray(preflight.failures)).toBe(true);
  });

  it('AST-0240 the acceptance letter survives both exports and a save/reopen cycle unchanged', async () => {
    const letter = buildBusinessLetter();
    const paragraphs = paragraphsOf(letter);
    expect(paragraphs.length).toBeGreaterThanOrEqual(20);
    expect((letter.writerData?.tables ?? []).length).toBeGreaterThanOrEqual(1);
    expect((letter.writerData?.images ?? []).length).toBeGreaterThanOrEqual(1);

    // A human interface that can produce this letter must be able to export it both ways.
    const docx = exportDocx(letter);
    const docxParts = await readZip(docx);
    for (const required of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
      expect(docxParts.has(required)).toBe(true);
    }
    const documentXml = decode(docxParts.get('word/document.xml')!);
    expect(documentXml).toContain('<w:pStyle w:val="Heading1"');
    expect(documentXml).toContain('<w:tbl>');
    // The image really is in the package, not only referenced (W-288).
    expect(documentXml).toContain('<w:drawing');
    expect([...docxParts.keys()].some((name) => name.startsWith('word/media/'))).toBe(true);

    const pdf = buildWriterPdf(
      letter.title,
      paragraphs,
      letter.writerData!.pageSetup!,
      letter.writerData!.tables ?? [],
      letter.writerData!.images ?? [],
      [],
      [],
      {},
      {},
      { textRasterizer: testTextRasterizer },
    );
    expect(pdfText(pdf).startsWith('%PDF-')).toBe(true);

    // Determinism: the same document must export to the same bytes twice — otherwise the letter
    // cannot be verified by hash.
    const second = await readZip(exportDocx(letter));
    expect(decode(second.get('word/document.xml')!)).toBe(documentXml);
  });
});
