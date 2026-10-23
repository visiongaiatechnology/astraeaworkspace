// STATUS: DIAMANT VGT SUPREME — Print preview and the real document pages
//
// Paket 40 acceptance: "Seitengeometrie und Seitenumbrüche in Print-Preview mit realen
// Dokumentseiten vergleichen."
//
// W-206, found by reading the wiring: the toolbar's print button called `window.print()`, which
// prints the **application shell** and lets the browser paginate it again — while the export
// dialog printed the exact PDF. Three different notions of "print" existed:
//   Ctrl+P        → opens the export action
//   toolbar       → window.print() on the app shell
//   export dialog → the exported PDF
// The preview therefore did not correspond to the document's pages. The print path now goes
// through the same renderer as the export, so preview and export are literally the same file.
//
// What is measurable here without a browser: the PDF's page size and page count against the
// pages the on-screen pagination produces for the same document.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterPageSetupConfig } from '../../../../../shared/contracts/workspace';
import { buildWriterPdf } from '../../../interchange/export/pdf/writerPdfExport';
import type { WriterPdfTextRasterizer } from '../../../interchange/export/pdf/writerPdfTextRaster';
import { writerPageGeometry } from '../../../interchange/export/pdf/writerPdfLayoutPrimitives';
import { paginateWriterSections } from '../../../layout/pagination/writerPagination';
import { getWriterPageGeometry, CSS_PIXELS_PER_MM } from '../../../layout/pagination/geometry/writerPaginationGeometry';

const testTextRasterizer: WriterPdfTextRasterizer = () => ({
  widthPx: 16, heightPx: 16, widthPt: 8, heightPt: 8,
  baselineFromBottomPt: 3, packedMaskHex: `${'FF'.repeat(32)}>`,
});

const setup = (overrides: Partial<WriterPageSetupConfig> = {}): WriterPageSetupConfig => ({
  paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
  showPageNumbers: true, headerText: '', footerText: '', ...overrides,
});

const p = (id: string, text: string, style: Record<string, unknown> = {}): Paragraph => ({
  id, spans: [{ text }], style: {
    style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4, ...style,
  },
} as unknown as Paragraph);

const pdfText = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

const mediaBox = (bytes: Uint8Array): number[] => {
  const match = /\/MediaBox\s*\[([^\]]+)\]/u.exec(pdfText(bytes));
  if (!match) throw new Error('the PDF carries no MediaBox');
  return match[1]!.trim().split(/\s+/u).map(Number);
};

const pageCount = (bytes: Uint8Array): number => {
  const match = /\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/u.exec(pdfText(bytes));
  if (!match) throw new Error('the PDF carries no page count');
  return Number(match[1]);
};

const render = (paragraphs: Paragraph[], config = setup()) =>
  buildWriterPdf('Druckprobe', paragraphs, config, [], [], [], [], {}, {}, { textRasterizer: testTextRasterizer });

/** The pages the screen lays out for the same document. */
const screenPages = (paragraphs: Paragraph[], config = setup()) =>
  paginateWriterSections(paragraphs, config, [], [], { tables: [], images: [], equations: [], footnotes: [] });

describe('print preview geometry matches the real document pages', () => {
  it('uses the same paper size in points', () => {
    const config = setup();
    const box = mediaBox(render([p('a', 'Inhalt')], config));
    const geometry = writerPageGeometry(config);
    expect(box[0]).toBe(0);
    expect(box[1]).toBe(0);
    expect(box[2]).toBeCloseTo(geometry.width, 1);
    expect(box[3]).toBeCloseTo(geometry.height, 1);
  });

  it('matches the screen geometry for portrait, landscape and every margin preset', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const margins of ['normal', 'narrow', 'wide', 'mirrored'] as const) {
        const config = setup({ orientation, margins });
        const box = mediaBox(render([p('a', 'Inhalt')], config));
        // The screen measures in CSS pixels, the PDF in points; one constant converts them.
        const screen = getWriterPageGeometry(config, 1);
        expect(box[2]).toBeCloseTo(screen.widthPx / CSS_PIXELS_PER_MM * (72 / 25.4), 0);
        expect(box[3]).toBeCloseTo(screen.heightPx / CSS_PIXELS_PER_MM * (72 / 25.4), 0);
        if (orientation === 'landscape') expect(box[2]).toBeGreaterThan(box[3]);
        else expect(box[3]).toBeGreaterThan(box[2]);
      }
    }
  });

  it('produces exactly as many PDF pages as the screen lays out', () => {
    const paragraphs = [
      p('a', 'Erste Seite'),
      p('b', 'Zweite Seite', { page_break_before: true }),
      p('c', 'Dritte Seite', { page_break_before: true }),
    ];
    expect(pageCount(render(paragraphs))).toBe(3);
    expect(screenPages(paragraphs).length).toBe(3);
  });

  it('places the same page breaks as the screen', () => {
    const paragraphs = [p('a', 'A'), p('b', 'B', { page_break_before: true })];
    const pages = screenPages(paragraphs);
    // The screen puts B on the second page; the PDF must have two pages for that.
    expect(pages[1]?.paragraphs.some((paragraph) => paragraph.id === 'b')).toBe(true);
    expect(pageCount(render(paragraphs))).toBe(2);
  });

  it('counts a long document the same way on both sides', () => {
    // Enough lines to force several pages without manual breaks.
    const many = Array.from({ length: 120 }, (_, index) => p(`p${index}`, `Zeile ${index} mit etwas Text darauf`));
    const screenCount = screenPages(many).length;
    expect(screenCount).toBeGreaterThan(1);
    expect(pageCount(render(many))).toBe(screenCount);
  });

  it('keeps the print output byte-identical for the same input', () => {
    // Preview and export must not differ: both call the same builder with the same arguments.
    const paragraphs = [p('a', 'Inhalt'), p('b', 'Noch etwas')];
    const first = render(paragraphs);
    const second = render(paragraphs);
    expect(pdfText(first)).toBe(pdfText(second));
  });
});
