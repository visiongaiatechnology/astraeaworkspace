// STATUS: DIAMANT VGT SUPREME — ODT and RTF round trip keeps rich text and layout
//
// Paket 37 acceptance: "Fremddatei öffnen, rich text ändern und wieder interoperabel
// exportieren." The existing round-trip test only asked whether the word "Interop" came
// back — text can survive while every bit of formatting is gone, which is exactly what
// W-178 and W-179 were. This test asks what the acceptance asks: does the **rich text**
// and the **layout** survive the trip through the file?
import { describe, expect, it } from 'vitest';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  exportWriterPortableDocument,
  importWriterPortableBytes,
  type WriterPortableFormat,
} from '../../../interchange/portable/writerPortableInterop';

const paragraphs: Paragraph[] = [
  {
    id: 'p1',
    style: { style_name: 'heading2', heading_level: 2, alignment: 'left', line_height: 1.25, space_before: 14, space_after: 6 },
    spans: [{ text: 'Kapitelüberschrift', font_size_pt: 16 }],
  },
  {
    id: 'p2',
    style: { style_name: 'normal', alignment: 'center', line_height: 1.25, space_before: 0, space_after: 4 },
    spans: [
      { text: 'fett', bold: true },
      { text: ' und ' },
      { text: 'kursiv', italic: true },
      { text: ' und ' },
      { text: 'unterstrichen', underline: true },
    ],
  },
  {
    id: 'p3',
    style: { style_name: 'normal', alignment: 'justify', line_height: 1.25, space_before: 0, space_after: 4 },
    spans: [{ text: 'Grüße aus München — 5 € · „Zitat“', font_size_pt: 11 }],
  },
];

function documentModel(): WorkspaceDocument {
  const textId = 'text-1';
  return {
    schema_version: 1,
    id: 'writer-portable-roundtrip',
    title: 'Portable Roundtrip',
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
        showPageNumbers: true, headerText: '', footerText: '',
      },
      tables: [],
    },
  };
}

async function roundTrip(format: WriterPortableFormat): Promise<Paragraph[]> {
  const exported = exportWriterPortableDocument(documentModel(), format);
  expect(exported.bytes.byteLength).toBeGreaterThan(0);
  const imported = await importWriterPortableBytes(exported.bytes, exported.fileName);
  const block = Object.values(imported.objects).find((object) => object.type === 'TextBlock');
  if (block?.type !== 'TextBlock') throw new Error('round trip lost the text block');
  return block.data.paragraphs;
}

const flat = (list: readonly Paragraph[], index: number) => list[index]?.spans.map((span) => span.text).join('') ?? '';

describe.each(['odt', 'rtf'] as const)('portable %s round trip', (format) => {
  it('keeps every paragraph and its text', async () => {
    const back = await roundTrip(format);
    expect(back).toHaveLength(3);
    expect(flat(back, 0)).toBe('Kapitelüberschrift');
    expect(flat(back, 2)).toBe('Grüße aus München — 5 € · „Zitat“');
  });

  it('keeps the heading level, so the layout survives', async () => {
    const back = await roundTrip(format);
    expect(back[0]?.style.heading_level).toBe(2);
    expect(back[0]?.style.style_name).toBe('heading2');
  });

  it('keeps bold, italic and underline as separate runs', async () => {
    const back = await roundTrip(format);
    const marks = back[1]?.spans.map((span) => ({
      text: span.text,
      bold: span.bold ?? false,
      italic: span.italic ?? false,
      underline: span.underline ?? false,
    }));
    expect(marks).toEqual([
      { text: 'fett', bold: true, italic: false, underline: false },
      { text: ' und ', bold: false, italic: false, underline: false },
      { text: 'kursiv', bold: false, italic: true, underline: false },
      { text: ' und ', bold: false, italic: false, underline: false },
      { text: 'unterstrichen', bold: false, italic: false, underline: true },
    ]);
  });

  it('keeps the alignment of a paragraph', async () => {
    const back = await roundTrip(format);
    expect(back[1]?.style.alignment).toBe('center');
    expect(back[2]?.style.alignment).toBe('justify');
  });

  it('keeps the font size of a run', async () => {
    const back = await roundTrip(format);
    expect(back[2]?.spans[0]?.font_size_pt).toBe(11);
  });

  it('survives a second trip unchanged', async () => {
    const first = await roundTrip(format);
    const exported = exportWriterPortableDocument(
      { ...documentModel(), objects: { 'text-1': { type: 'TextBlock', data: { id: 'text-1', paragraphs: first } } } },
      format,
    );
    const imported = await importWriterPortableBytes(exported.bytes, exported.fileName);
    const block = Object.values(imported.objects).find((object) => object.type === 'TextBlock');
    if (block?.type !== 'TextBlock') throw new Error('second trip lost the text block');
    expect(block.data.paragraphs.map((p) => p.spans.map((s) => s.text).join('')))
      .toEqual(first.map((p) => p.spans.map((s) => s.text).join('')));
    expect(block.data.paragraphs[0]?.style.heading_level).toBe(2);
    expect(block.data.paragraphs[1]?.spans[0]?.bold).toBe(true);
  });
});

describe('WR-042 — the semantic paragraph spacing survives the exchange', () => {
  /** The direct cursor stores the clicked distance as `space_before`; it is content, not chrome. */
  function documentWithSpacing(): WorkspaceDocument {
    const model = documentModel();
    const withSpacing: Paragraph[] = paragraphs.map((paragraph, index) => (
      index === 1
        ? { ...paragraph, style: { ...paragraph.style, space_before: 96, space_after: 12 } }
        : paragraph
    ));
    return { ...model, objects: { 'text-1': { type: 'TextBlock', data: { id: 'text-1', paragraphs: withSpacing } } } };
  }

  it.each(['docx', 'odt'] as const)('keeps space_before/space_after through %s', async (format) => {
    const exported = exportWriterPortableDocument(documentWithSpacing(), format);
    const imported = await importWriterPortableBytes(exported.bytes, exported.fileName);
    const block = Object.values(imported.objects).find((object) => object.type === 'TextBlock');
    if (block?.type !== 'TextBlock') throw new Error('round trip lost the text block');
    expect(block.data.paragraphs[1]?.style.space_before).toBe(96);
    expect(block.data.paragraphs[1]?.style.space_after).toBe(12);
  });

  it.each(['docx', 'odt'] as const)('reports that %s carries the spacing', (format) => {
    const exported = exportWriterPortableDocument(documentWithSpacing(), format);
    expect(exported.lossReport.losses.map((entry) => entry.kind)).not.toContain('paragraph-spacing');
  });

  it('reports the spacing loss for TXT instead of pretending it is complete', () => {
    const exported = exportWriterPortableDocument(documentWithSpacing(), 'txt');
    const kinds = exported.lossReport.losses.map((entry) => entry.kind);
    expect(kinds).toContain('paragraph-spacing');
  });
});

describe('the two formats stay distinct', () => {
  it('writes an ODF package whose first entry is the uncompressed mimetype', () => {
    const exported = exportWriterPortableDocument(documentModel(), 'odt');
    // "PK" then the first local file header name, stored uncompressed: ODF requires
    // `mimetype` to be the first entry and to carry the media type as its content.
    const head = new TextDecoder('latin1').decode(exported.bytes.slice(0, 120));
    expect(head.startsWith('PK')).toBe(true);
    expect(head).toContain('mimetype');
    expect(head).toContain('application/vnd.oasis.opendocument.text');
  });

  it('writes RTF that opens with the RTF header', () => {
    const exported = exportWriterPortableDocument(documentModel(), 'rtf');
    expect(new TextDecoder().decode(exported.bytes).startsWith('{\\rtf1')).toBe(true);
  });
});
