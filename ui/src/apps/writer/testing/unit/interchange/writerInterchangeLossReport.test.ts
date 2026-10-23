// STATUS: DIAMANT — W-177 / W-181 / W-196: an export says what it could not carry
//
// The disease the register names "never let a failure be silent": images, tables, notes, comments and
// revisions vanished from an ODT/RTF/Markdown/TXT export without a word, and a very large document was
// cut off at 4 000 000 characters with no notice. This file measures both halves:
//
//   * the report is built from the document's real content (not from a guess), and
//   * a text/markdown export that would have to be cut is **refused** instead of losing the tail.
import { describe, expect, it } from 'vitest';

import type { Paragraph, TextSpan, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  buildWriterInterchangeLossReport,
  describeWriterInterchangeFormattingLoss,
  describeWriterInterchangeLoss,
  measureWriterInterchangeContent,
  WRITER_FORMAT_CAPABILITIES,
} from '../../../../writer/interchange/portable/writerInterchangeLossReport';
import {
  exportWriterPortableDocument,
  type WriterPortableFormat,
} from '../../../../writer/interchange/portable/writerPortableInterop';

function paragraph(id: string, text: string, extra: Partial<Paragraph['style']> = {}, spans?: TextSpan[]): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.25, space_before: 0, space_after: 0, ...extra },
    spans: spans ?? [{ text }],
  };
}

function writerDocument(paragraphs: Paragraph[], overrides: Partial<WorkspaceDocument['writerData']> = {}): WorkspaceDocument {
  const textId = 'text-1';
  return {
    schema_version: 1,
    id: 'doc-1',
    title: 'Abnahme',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textId],
    objects: { [textId]: { type: 'TextBlock', data: { id: textId, paragraphs } } },
    writerData: {
      pageSetup: {
        paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
        showPageNumbers: true, headerText: 'Astraea', footerText: '',
      },
      tables: [],
      images: [],
      equations: [],
      footnotes: [],
      comments: [],
      revisions: [],
      ...overrides,
    },
  } as unknown as WorkspaceDocument;
}

/** A document that carries one of everything the interop formats can lose. */
function richDocument(): WorkspaceDocument {
  return writerDocument(
    [
      paragraph('p1', 'Überschrift', { heading_level: 1, alignment: 'center' }),
      paragraph('p2', 'bunt', {}, [{ text: 'bunt', text_color: '#ff0000', font_size_pt: 18, underline: true }]),
      paragraph('p3', 'Punkt', { list_style: 'number' }),
    ],
    {
      images: [{ id: 'img-1' }] as never,
      tables: [{ id: 'tbl-1' }] as never,
      equations: [{ id: 'eq-1' }] as never,
      footnotes: [{ id: 'fn-1' }] as never,
      comments: [{ id: 'c-1' }] as never,
      revisions: [{ id: 'r-1' }, { id: 'r-2' }] as never,
    },
  );
}

describe('W-196 / W-181 — the report is measured against the document, not guessed', () => {
  it('counts what a document actually contains', () => {
    const content = measureWriterInterchangeContent({
      paragraphs: [
        paragraph('p1', 'A', { alignment: 'right' }),
        paragraph('p2', 'B', {}, [{ text: 'B', text_color: '#00ff00', font_size_pt: 12, underline: true }]),
        paragraph('p3', 'C', { list_style: 'number' }),
      ],
      images: [{ id: 'i' }] as never,
      tables: [{ id: 't' }] as never,
      equations: [],
      notes: [{ id: 'f' }] as never,
      comments: 2,
      revisions: 1,
      headerText: 'Astraea',
      footerText: '',
    });
    expect(content.images).toBe(1);
    expect(content.tables).toBe(1);
    expect(content.notes).toBe(1);
    expect(content.comments).toBe(2);
    expect(content.revisions).toBe(1);
    expect(content.hasHeaderFooter).toBe(true);
    expect(content.alignedParagraphs).toBe(1);
    expect(content.colouredSpans).toBe(1);
    expect(content.sizedSpans).toBe(1);
    expect(content.underlinedSpans).toBe(1);
    expect(content.numberedItems).toBe(1);
  });

  it('says DOCX is complete for the parts it carries and silent about nothing', () => {
    const report = buildWriterInterchangeLossReport('docx', measureWriterInterchangeContent({
      paragraphs: [paragraph('p1', 'Text')],
    }));
    // A document with nothing but paragraphs has nothing to lose — in every format.
    expect(report.hasLosses).toBe(false);
    expect(describeWriterInterchangeLoss(report)).toContain('vollständig');
  });

  it('names each loss with a count for a rich document in a format that cannot carry it', () => {
    const doc = richDocument();
    const paragraphs = doc.objects['text-1']!.type === 'TextBlock' ? doc.objects['text-1']!.data.paragraphs : [];
    const report = buildWriterInterchangeLossReport('txt', measureWriterInterchangeContent({
      paragraphs,
      images: doc.writerData!.images,
      tables: doc.writerData!.tables,
      equations: doc.writerData!.equations,
      notes: doc.writerData!.footnotes,
      comments: doc.writerData!.comments!.length,
      revisions: doc.writerData!.revisions!.length,
      headerText: doc.writerData!.pageSetup.headerText,
    }));

    expect(report.hasContentLoss).toBe(true);
    const kinds = report.losses.map((entry) => entry.kind);
    expect(kinds).toContain('image');
    expect(kinds).toContain('table');
    expect(kinds).toContain('equation');
    expect(kinds).toContain('note');
    expect(kinds).toContain('comment');
    expect(kinds).toContain('revision');
    expect(kinds).toContain('header-footer');
    expect(kinds).toContain('alignment');
    expect(kinds).toContain('color');
    expect(kinds).toContain('font-size');
    expect(kinds).toContain('underline');
    // Every message names the format, so a user who exports twice can tell the two reports apart.
    for (const entry of report.losses) expect(entry.message).toContain('TXT');
  });

  it('separates content loss from formatting loss and phrases them differently', () => {
    const doc = richDocument();
    const paragraphs = doc.objects['text-1']!.type === 'TextBlock' ? doc.objects['text-1']!.data.paragraphs : [];
    const report = buildWriterInterchangeLossReport('markdown', measureWriterInterchangeContent({
      paragraphs,
      images: doc.writerData!.images,
      comments: 1,
    }));
    const content = report.losses.filter((entry) => entry.severity === 'content');
    const formatting = report.losses.filter((entry) => entry.severity === 'formatting');
    expect(content.length).toBeGreaterThan(0);
    expect(formatting.length).toBeGreaterThan(0);
    expect(content[0]!.message).toContain('nicht speichern');
    expect(formatting[0]!.message).toContain('Formatierung');
    expect(describeWriterInterchangeFormattingLoss(report)).toContain('Formatierung');
  });

  it('keeps the order stable, so two exports of one document read the same', () => {
    const doc = richDocument();
    const paragraphs = doc.objects['text-1']!.type === 'TextBlock' ? doc.objects['text-1']!.data.paragraphs : [];
    const content = measureWriterInterchangeContent({ paragraphs, images: doc.writerData!.images, tables: doc.writerData!.tables });
    const first = buildWriterInterchangeLossReport('rtf', content);
    const second = buildWriterInterchangeLossReport('rtf', content);
    expect(first.losses.map((entry) => entry.kind)).toEqual(second.losses.map((entry) => entry.kind));
  });

  it('tells the truth about DOCX: it carries images, tables, headers and equations, but not notes', () => {
    expect(WRITER_FORMAT_CAPABILITIES.docx.images).toBe(true);
    expect(WRITER_FORMAT_CAPABILITIES.docx.tables).toBe(true);
    expect(WRITER_FORMAT_CAPABILITIES.docx.headerFooter).toBe(true);
    // WR-042: `platform/interop/docx/exporter.ts` writes OMML and the importer reads it back, so
    // claiming equations are lost was a false warning.
    expect(WRITER_FORMAT_CAPABILITIES.docx.equations).toBe(true);
    expect(WRITER_FORMAT_CAPABILITIES.docx.notes).toBe(false);
    // Shapes and media objects are written by no portable exporter at all.
    expect(WRITER_FORMAT_CAPABILITIES.docx.shapes).toBe(false);
    expect(WRITER_FORMAT_CAPABILITIES.docx.mediaObjects).toBe(false);
    // DOCX and ODT carry the semantic paragraph spacing; the text formats do not.
    expect(WRITER_FORMAT_CAPABILITIES.docx.paragraphSpacing).toBe(true);
    expect(WRITER_FORMAT_CAPABILITIES.odt.paragraphSpacing).toBe(true);
    expect(WRITER_FORMAT_CAPABILITIES.txt.paragraphSpacing).toBe(false);
  });

  it('summarises many losses in one line without hiding the first', () => {
    const report = buildWriterInterchangeLossReport('txt', {
      images: 2, tables: 1, equations: 0, notes: 0, hasHeaderFooter: false,
      comments: 0, revisions: 0, alignedParagraphs: 0, colouredSpans: 0,
      sizedSpans: 0, underlinedSpans: 0, numberedItems: 0,
    });
    const summary = describeWriterInterchangeLoss(report);
    expect(summary).toContain('2 Bild(er)');
    expect(summary).toContain('weitere');
  });
});

describe('W-195 — a text export that would be cut off is refused, not truncated', () => {
  it('refuses plain-text export above the character limit and names the size', () => {
    const huge = paragraph('p1', 'a'.repeat(4_000_001));
    const doc = writerDocument([huge]);
    expect(() => exportWriterPortableDocument(doc, 'txt')).toThrow(/überschreitet die Grenze von 4000000/u);
    // And the message says the document was not cut — the difference the finding is about.
    try {
      exportWriterPortableDocument(doc, 'txt');
    } catch (error: unknown) {
      expect(String(error)).toContain('nicht gekürzt');
    }
  });

  it('refuses Markdown export above the same limit', () => {
    const doc = writerDocument([paragraph('p1', 'a'.repeat(4_000_001))]);
    expect(() => exportWriterPortableDocument(doc, 'markdown')).toThrow(/Markdown-Export umfasst 4000001/u);
  });

  /*
   * The boundary, in both directions, at the exact limit.
   *
   * The first version of the "at the limit" test used the shared fixture, which carries a header — so the
   * report correctly listed the header loss and the test failed while claiming "nothing lost". The fixture
   * was wrong, not the code: the refusal is `>` (strictly above), so a document of exactly the limit
   * exports. Both sides are pinned here so an off-by-one cannot creep in later.
   */
  it('exports a document of exactly the limit, with an empty report', () => {
    // A document with nothing to lose: no header, one paragraph of exactly MAX_TEXT_EXPORT_CHARS.
    const doc = writerDocument([paragraph('p1', 'a'.repeat(4_000_000))], {
      pageSetup: {
        paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
        showPageNumbers: false, headerText: '', footerText: '',
      },
    });
    const output = exportWriterPortableDocument(doc, 'txt');
    expect(output.bytes.byteLength).toBe(4_000_000);
    expect(output.lossReport.losses).toEqual([]);
    expect(output.lossReport.hasContentLoss).toBe(false);
  });

  it('refuses one character more, and refuses it by name', () => {
    const doc = writerDocument([paragraph('p1', 'a'.repeat(4_000_001))], {
      pageSetup: {
        paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
        showPageNumbers: false, headerText: '', footerText: '',
      },
    });
    expect(() => exportWriterPortableDocument(doc, 'txt')).toThrow(/4000001/);
    expect(() => exportWriterPortableDocument(doc, 'txt')).toThrow(/4000000/);
  });

  it('reports a header loss in TXT even for a short document, so "nothing lost" is not assumed', () => {
    // The regression that produced the red test above: the shared fixture has a header, and TXT cannot
    // carry one. The report says so — that is the mechanism working, not a boundary problem.
    const doc = writerDocument([paragraph('p1', 'kurz')]);
    const output = exportWriterPortableDocument(doc, 'txt');
    expect(output.lossReport.losses.map((entry) => entry.kind)).toContain('header-footer');
  });
});

describe('W-177 / W-181 — the report reaches the export result, for every format', () => {
  it('carries a report on every format, so "nothing lost" is also readable', () => {
    const formats: WriterPortableFormat[] = ['docx', 'odt', 'rtf', 'html', 'markdown', 'txt'];
    const doc = writerDocument([paragraph('p1', 'Text')]);
    for (const format of formats) {
      const output = exportWriterPortableDocument(doc, format);
      expect(output.lossReport.format, format).toBe(format);
      expect(typeof output.lossReport.hasContentLoss, format).toBe('boolean');
    }
  });

  it('reports the images an ODT export cannot write', () => {
    const doc = writerDocument([paragraph('p1', 'Text')], { images: [{ id: 'img-1' }] as never });
    const output = exportWriterPortableDocument(doc, 'odt');
    expect(output.lossReport.hasContentLoss).toBe(true);
    expect(describeWriterInterchangeLoss(output.lossReport)).toContain('ODT');
    expect(describeWriterInterchangeLoss(output.lossReport)).toContain('Bild');
  });
});
