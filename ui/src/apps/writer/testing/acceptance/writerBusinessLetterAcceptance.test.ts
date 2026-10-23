// STATUS: DIAMANT VGT SUPREME — the acceptance run: a business letter through both exports
//
// Paket 48 acceptance: "Geschäftsbrief mit Überschriften, Tabelle, Bild, mehrseitigem Text und PDF/DOCX
// erstellen."
//
// This is not a mock run. The fixture is a real `WorkspaceDocument`, and both exports are the ones the
// application uses: `exportDocx` (the OOXML writer) and `buildWriterPdf` (the PDF writer). What is
// checked here is what can be checked without a browser: the packages come out complete, carry every
// part of the letter, and survive save → close → reopen unchanged.
//
// W-288, measured before the fix: the DOCX export wrote paragraphs, equations and tables — and **no
// images at all** (no `w:drawing`, no `media/…` part, no relationship, no content type), while the PDF
// export rendered them. The same letter exported twice therefore lost its picture on one of the ways
// out. The first test below is the one that was red.
import { describe, expect, it } from 'vitest';
import { buildWriterPdf } from '../../interchange/export/pdf/writerPdfExport';
import type { WriterPdfTextRasterizer } from '../../interchange/export/pdf/writerPdfTextRaster';
import { exportDocx } from '../../../../platform/interop/docx/exporter';
import { readZip } from '../../../../platform/interop/zip';
import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { buildBusinessLetter, LETTER_PNG_DATA_URL } from '../fixtures/writerBusinessLetter';

const decode = (bytes: Uint8Array): string => new TextDecoder('utf8').decode(bytes);
const pdfText = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

/**
 * The bullet and euro characters lie outside the standard PDF font, so those lines take the raster path
 * and need a rasteriser that returns a real mask. This is the same stub the PDF round-trip test uses; a
 * thinner one makes the export throw.
 */
const testTextRasterizer: WriterPdfTextRasterizer = () => ({
  widthPx: 16, heightPx: 16, widthPt: 8, heightPt: 8,
  baselineFromBottomPt: 3, packedMaskHex: `${'FF'.repeat(32)}>`,
});

const paragraphsOf = (document: WorkspaceDocument): Paragraph[] => {
  const block = Object.values(document.objects).find((object) => object.type === 'TextBlock');
  return block?.type === 'TextBlock' ? block.data.paragraphs : [];
};

const renderLetterPdf = (document: WorkspaceDocument): Uint8Array => buildWriterPdf(
  document.title,
  paragraphsOf(document),
  document.writerData!.pageSetup!,
  document.writerData!.tables ?? [],
  document.writerData!.images ?? [],
  [],
  [],
  {},
  {},
  { textRasterizer: testTextRasterizer },
);

/**
 * The PDF writes German characters as **octal-escaped WinAnsi bytes** (W-198): `ü` leaves as `\374`,
 * `ß` as `\337`. A crude `latin1` search for the plain string therefore cannot see them any more — and
 * neither could it before, which is how the defect survived. These are the CP1252 values, written out
 * here on purpose: the oracle must not be the same encoder it is checking.
 */
const WIN_ANSI_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  ä: '\\344', ö: '\\366', ü: '\\374', Ä: '\\304', Ö: '\\326', Ü: '\\334', ß: '\\337', é: '\\351',
  '€': '\\200', '„': '\\204', '“': '\\223', '”': '\\224', '–': '\\226', '—': '\\227', '•': '\\225',
});

/** The series of PDF literal pieces a line must appear as: plain ASCII runs and escaped WinAnsi bytes. */
function expectedPdfPieces(line: string): string[] {
  const pieces: string[] = [];
  let ascii = '';
  for (const character of line) {
    const escape = WIN_ANSI_ESCAPES[character];
    if (escape) {
      if (ascii) pieces.push(ascii);
      ascii = '';
      pieces.push(escape);
      continue;
    }
    ascii += character;
  }
  if (ascii) pieces.push(ascii);
  return pieces;
}

/** Whether a line was written as text — every piece in order, which a rasterised line never satisfies. */
function isWrittenAsText(pdf: string, line: string): boolean {
  const pieces = expectedPdfPieces(line).filter((piece) => piece.length > 1);
  if (pieces.length === 0) return false;
  let cursor = 0;
  for (const piece of pieces) {
    const found = pdf.indexOf(piece, cursor);
    if (found < 0) return false;
    cursor = found + piece.length;
  }
  return true;
}

describe('the business letter exists as a document', () => {
  const letter = buildBusinessLetter();

  it('AST-0240 has what the acceptance names', () => {
    const paragraphs = paragraphsOf(letter);
    const headingLevels = paragraphs.map((paragraph) => paragraph.style.heading_level ?? 0).filter((level) => level > 0);
    expect(headingLevels).toContain(1);
    expect(headingLevels).toContain(2);
    expect(paragraphs.length).toBeGreaterThan(25);
    expect(letter.writerData?.tables).toHaveLength(1);
    expect(letter.writerData?.images).toHaveLength(1);
  });

  it('AST-0240 anchors table and image to paragraphs that exist', () => {
    const ids = new Set(paragraphsOf(letter).map((paragraph) => paragraph.id));
    expect(ids.has(letter.writerData!.tables![0]!.anchorParagraphId!)).toBe(true);
    expect(ids.has(letter.writerData!.images![0]!.anchorParagraphId!)).toBe(true);
  });
});

describe('the DOCX carries every part of the letter', () => {
  it('AST-0240 is a complete package', async () => {
    const entries = await readZip(exportDocx(buildBusinessLetter()));
    for (const name of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/_rels/document.xml.rels',
      'word/styles.xml',
      'word/settings.xml',
    ]) {
      expect(entries.has(name), name).toBe(true);
    }
  });

  it('AST-0240 keeps the headings as headings', async () => {
    const entries = await readZip(exportDocx(buildBusinessLetter()));
    const xml = decode(entries.get('word/document.xml')!);
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toContain('VisionGaia Technology GmbH');
  });

  it('AST-0240 keeps the table', async () => {
    const entries = await readZip(exportDocx(buildBusinessLetter()));
    const xml = decode(entries.get('word/document.xml')!);
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Einzelpreis');
    expect(xml).toContain('1.200,00 €');
  });

  it('AST-0240 embeds the image — this was red before W-288', async () => {
    const entries = await readZip(exportDocx(buildBusinessLetter()));
    const xml = decode(entries.get('word/document.xml')!);
    const rels = decode(entries.get('word/_rels/document.xml.rels')!);
    const contentTypes = decode(entries.get('[Content_Types].xml')!);

    // The drawing exists, points at a relationship, and is inline with a real extent.
    expect(xml).toContain('<w:drawing');
    expect(xml).toContain('<wp:inline');
    const embed = /r:embed="(rId\d+)"/u.exec(xml);
    expect(embed).not.toBeNull();

    // The relationship names a media part, and that part is in the package with the exact bytes.
    expect(rels).toContain(`Id="${embed![1]}"`);
    expect(rels).toContain('relationships/image');
    expect(rels).toContain('Target="media/image1.png"');
    const media = entries.get('word/media/image1.png');
    expect(media).toBeDefined();
    const payload = LETTER_PNG_DATA_URL.slice(LETTER_PNG_DATA_URL.indexOf(',') + 1);
    const expected = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
    expect(Array.from(media!)).toEqual(Array.from(expected));

    // A media part without a declared content type is rejected by Word.
    expect(contentTypes).toContain('<Default Extension="png" ContentType="image/png"/>');

    // The alt text and the caption are not lost.
    expect(xml).toContain('Verlauf der Kennzahlen über vier Quartale');
    expect(xml).toContain('Abbildung 1: Verlauf der Kennzahlen');
  });

  it('AST-0240 writes the picture next to the paragraph it is anchored to', async () => {
    const entries = await readZip(exportDocx(buildBusinessLetter()));
    const xml = decode(entries.get('word/document.xml')!);
    const anchorText = xml.indexOf('Das Schaubild zeigt den Verlauf');
    const beforeTable = xml.indexOf('Aufstellung der Positionen');
    const drawing = xml.indexOf('<w:drawing');
    // The image belongs under its own paragraph, which comes after the table section of the letter.
    expect(anchorText).toBeGreaterThan(-1);
    expect(drawing).toBeGreaterThan(anchorText);
    expect(anchorText).toBeGreaterThan(beforeTable);
  });

  it('AST-0240 is deterministic', () => {
    const first = exportDocx(buildBusinessLetter());
    const second = exportDocx(buildBusinessLetter());
    expect(Array.from(first)).toEqual(Array.from(second));
  });
});

describe('the PDF carries every part of the letter', () => {
  const letter = buildBusinessLetter();
  const pdf = renderLetterPdf(letter);

  it('AST-0240 is a well-formed PDF', () => {
    const text = pdfText(pdf);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Catalog');
  });

  it('AST-0240 has more than one page, as the acceptance asks for multi-page text', () => {
    const pages = pdfText(pdf).match(/\/Type \/Page[^s]/gu) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });

  it('AST-0239 writes German text as text, not as a picture — this was red before W-198', () => {
    // Before the fix the decision was `/[^\x20-\x7E]/`: **any** non-ASCII character sent the whole line to
    // the raster path, so `Mit freundlichen Grüßen` was a picture — not searchable, not selectable, not
    // readable by a screen reader. Now the line is text: the ASCII parts verbatim and the umlauts as
    // octal-escaped WinAnsi bytes, which is what `/Encoding /WinAnsiEncoding` maps back to the character.
    const text = pdfText(pdf);
    expect(text).toContain('/Encoding /WinAnsiEncoding');
    expect(isWrittenAsText(text, 'Mit freundlichen Grüßen')).toBe(true);
    expect(isWrittenAsText(text, 'Für Rückfragen stehe ich Ihnen gern zur Verfügung.')).toBe(true);
    // The umlauts really are the escaped bytes, not transliterated or dropped.
    expect(text).toContain('\\374');
    expect(text).toContain('\\337');
    expect(text).not.toContain('Grussen');
  });

  it('AST-0239 draws no line of the letter as a picture any more — this was red before W-198', () => {
    // The sharpest available proof, and independent of how the layout wraps: a rasterised line leaves an
    // `/ImageMask` object behind. Before the fix every German line produced one; now the count is zero and
    // the text is written as content, which is what makes it searchable and readable.
    const text = pdfText(pdf);
    expect((text.match(/\/ImageMask/gu) ?? []).length).toBe(0);
    expect((text.match(/\) Tj/gu) ?? []).length).toBeGreaterThan(30);
    expect(text).toContain('/Encoding /WinAnsiEncoding');
  });

  it('AST-0240 writes every paragraph of the letter as text', () => {
    // A paragraph passes when at least one of its **words** is findable. Words rather than sentences,
    // because the layout wraps long paragraphs and a wrapped sentence is split across text operators —
    // measured: a per-sentence check flagged the longest paragraph although nothing was rasterised (the
    // `/ImageMask` count above is the layout-independent proof). A word of eight or more ASCII characters
    // is long enough not to occur by accident and short enough not to be broken by the layout.
    const text = pdfText(pdf);
    const paragraphs = paragraphsOf(letter)
      .map((paragraph) => paragraph.spans.map((span) => span.text).join(''))
      .filter((line) => line.trim().length > 8);
    const missing = paragraphs.filter((line) => {
      const words = line.split(/\s+/u)
        .map((word) => word.replace(/[^A-Za-z0-9-]/gu, ''))
        .filter((word) => word.length >= 8 && /^[\x20-\x7E]+$/u.test(word));
      return words.length === 0 || !words.some((word) => text.includes(word));
    });
    expect(missing).toEqual([]);
    expect(paragraphs.length).toBeGreaterThan(20);
  });

  it('AST-0240 is deterministic as well', () => {
    expect(Array.from(renderLetterPdf(buildBusinessLetter()))).toEqual(Array.from(renderLetterPdf(buildBusinessLetter())));
  });
});

describe('save, close, reopen', () => {
  it('AST-0238 gives back identical payload', () => {
    const letter = buildBusinessLetter();
    const reopened = JSON.parse(JSON.stringify(letter)) as WorkspaceDocument;
    expect(reopened).toEqual(letter);
    // The parts the acceptance names survive the round trip by identity, not only by shape.
    expect(reopened.writerData?.images?.[0]?.dataUrl).toBe(letter.writerData?.images?.[0]?.dataUrl);
    expect(reopened.writerData?.tables?.[0]?.anchorParagraphId).toBe(letter.writerData?.tables?.[0]?.anchorParagraphId);
    expect(paragraphsOf(reopened)).toHaveLength(paragraphsOf(letter).length);
  });

  it('AST-0238 exports the same bytes after reopening', async () => {
    const letter = buildBusinessLetter();
    const reopened = JSON.parse(JSON.stringify(letter)) as WorkspaceDocument;
    const before = await readZip(exportDocx(letter));
    const after = await readZip(exportDocx(reopened));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    expect(decode(after.get('word/document.xml')!)).toBe(decode(before.get('word/document.xml')!));
  });
});

describe('a malformed table does not kill the export', () => {
  const withBrokenCell = (): WorkspaceDocument => {
    const letter = buildBusinessLetter();
    const table = letter.writerData!.tables![0]!;
    // Foreign or imported data may carry a cell without `content`. Before W-289 the whole PDF export died
    // with `TypeError: … reading 'replace'` from inside the layout primitives — measured while building
    // this fixture, which is how the hole was found.
    const broken = {
      ...table,
      rows: [{ id: 'letter-row-broken', cells: [{ id: 'letter-cell-broken' }] }],
    } as unknown as typeof table;
    return { ...letter, writerData: { ...letter.writerData!, tables: [broken] } };
  };

  it('AST-0239 renders the missing cell as empty instead of throwing', () => {
    expect(() => renderLetterPdf(withBrokenCell())).not.toThrow();
    expect(pdfText(renderLetterPdf(withBrokenCell())).startsWith('%PDF-')).toBe(true);
  });

  it('AST-0239 understands a row with fewer cells than columns', () => {
    const letter = withBrokenCell();
    const table = letter.writerData!.tables![0]!;
    const short = { ...table, rows: [{ id: 'r', cells: [{ id: 'c', content: 'nur eine' }] }] } as typeof table;
    const document = { ...letter, writerData: { ...letter.writerData!, tables: [short] } } as WorkspaceDocument;
    expect(() => renderLetterPdf(document)).not.toThrow();
    expect(pdfText(renderLetterPdf(document))).toContain('nur eine');
  });
});

describe('an unembeddable image is an error, not a silent loss', () => {
  const withImage = (dataUrl: string): WorkspaceDocument => {
    const letter = buildBusinessLetter();
    const images = [{ ...letter.writerData!.images![0]!, dataUrl }];
    return { ...letter, writerData: { ...letter.writerData!, images } };
  };

  it('AST-0239 refuses a URL that is not a data URL', () => {
    expect(() => exportDocx(withImage('file:///C:/bilder/verlauf.png'))).toThrow(/Daten-URL/u);
  });

  it('AST-0239 refuses a format it cannot declare a content type for', () => {
    expect(() => exportDocx(withImage('data:image/tiff;base64,AAAA'))).toThrow(/Bildformat/u);
  });

  it('AST-0239 refuses broken base64', () => {
    expect(() => exportDocx(withImage('data:image/png;base64,!!!!'))).toThrow(/Base64/u);
  });

  it('AST-0239 refuses an empty picture', () => {
    expect(() => exportDocx(withImage('data:image/png;base64,'))).toThrow(/keine Daten/u);
  });

  it('AST-0239 still exports a letter without any image', async () => {
    const letter = buildBusinessLetter();
    const withoutImages = { ...letter, writerData: { ...letter.writerData!, images: [] } };
    const entries = await readZip(exportDocx(withoutImages));
    expect(decode(entries.get('word/document.xml')!)).not.toContain('<w:drawing');
    expect(entries.has('word/media/image1.png')).toBe(false);
  });
});
