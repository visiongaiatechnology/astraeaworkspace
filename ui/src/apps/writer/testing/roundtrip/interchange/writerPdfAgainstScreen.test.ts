// STATUS: DIAMANT VGT SUPREME — The PDF must show what the screen shows
//
// Paket 39 acceptance: "Realistische Writer-Seite als PDF erzeugen und mit externem Reader
// prüfen." The external reader is part of the deferred acceptance; what is checkable here is
// that the produced PDF carries the **same** numbering, fields and figures as the screen.
//
// W-118, measured before the fix: the export had its own flat counter
// (`previousWasNumbered ? +1 : 1`), so a nested list printed
//   PDF      1. Erster · 2. Unterpunkt · 3. Zweiter · 4. Noch ein Unterpunkt
//   screen   1.1.      · 1.1.1.         · 1.2.       · 1.2.1.
// W-126, measured before the fix: the header was written verbatim, so every page of a document
// with `Seite {PAGE} von {NUMPAGES}` printed those braces literally.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterPageSetupConfig } from '../../../../../shared/contracts/workspace';
import { buildWriterPdf } from '../../../interchange/export/pdf/writerPdfExport';
import type { WriterPdfTextRasterizer } from '../../../interchange/export/pdf/writerPdfTextRaster';
import { calculateMultilevelListOrdinal, BUILTIN_LIST_TEMPLATES } from '../../../formatting/lists/writerMultilevelList';
import { calculateTextStatistics } from '../../../utils/writerUtils';

const pageSetup: WriterPageSetupConfig = {
  paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
  showPageNumbers: true, headerText: '', footerText: '',
};

// The bullet character `•` lies outside the standard PDF font, so those lines take the raster
// path and need a rasterizer that returns a real mask — a thinner stub made the export throw.
const testTextRasterizer: WriterPdfTextRasterizer = () => ({
  widthPx: 16, heightPx: 16, widthPt: 8, heightPt: 8,
  baselineFromBottomPt: 3, packedMaskHex: `${'FF'.repeat(32)}>`,
});

const p = (id: string, text: string, style: Record<string, unknown> = {}): Paragraph => ({
  id, spans: [{ text }], style: {
    style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4, ...style,
  },
} as unknown as Paragraph);

const pdfText = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

const render = (
  paragraphs: Paragraph[],
  setup: Partial<WriterPageSetupConfig> = {},
  printOptions: Record<string, unknown> = {},
  renderOptions: Record<string, unknown> = {},
  title = 'Testdokument',
) => pdfText(buildWriterPdf(
  title, paragraphs, { ...pageSetup, ...setup }, [], [], [], [], printOptions, {}, { textRasterizer: testTextRasterizer, ...renderOptions },
));

/** The marker the PDF put in front of this paragraph's text. */
const markerBefore = (text: string, needle: string): string => {
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`"${needle}" not found in the PDF`);
  const line = text.slice(Math.max(0, at - 24), at);
  const start = line.lastIndexOf('(');
  return line.slice(start + 1).replace(/^\d+(?:\.\d+)? 0 0 1 [\d.]+ [\d.]+ Tm\./u, '').trim();
};

describe('PDF numbering matches the screen', () => {
  const nested = [
    p('a', 'Erster', { list_style: 'number', list_level: 0, list_id: 'L1' }),
    p('b', 'Unterpunkt', { list_style: 'number', list_level: 1, list_id: 'L1' }),
    p('c', 'Zweiter', { list_style: 'number', list_level: 0, list_id: 'L1' }),
    p('d', 'Noch ein Unterpunkt', { list_style: 'number', list_level: 1, list_id: 'L1' }),
  ];

  it('uses the screen ordinal for every item of a nested list', () => {
    const screen = nested.map((_, index) => calculateMultilevelListOrdinal(nested, index));
    const text = render(nested);
    const pdfMarkers = nested.map((paragraph) => markerBefore(text, paragraph.spans[0]!.text).split(' ')[0]);
    expect(pdfMarkers).toEqual(screen);
  });

  it('is not the flat 1, 2, 3 counter any more', () => {
    const text = render(nested);
    const markers = nested.map((paragraph) => markerBefore(text, paragraph.spans[0]!.text).split(' ')[0]);
    expect(markers).not.toEqual(['1.', '2.', '3.', '4.']);
  });

  it('restarts a second list and keeps the screen behaviour', () => {
    const twoLists = [
      p('a', 'Erste Liste A', { list_style: 'number', list_level: 0, list_id: 'L1' }),
      p('b', 'Erste Liste B', { list_style: 'number', list_level: 0, list_id: 'L1' }),
      p('c', 'Zweite Liste A', { list_style: 'number', list_level: 0, list_id: 'L2' }),
    ];
    const screen = twoLists.map((_, index) => calculateMultilevelListOrdinal(twoLists, index));
    const text = render(twoLists);
    expect(twoLists.map((paragraph) => markerBefore(text, paragraph.spans[0]!.text).split(' ')[0])).toEqual(screen);
  });

  it('leaves a plain paragraph without a number and exports a bullet list at all', () => {
    // The bullet `•` lies outside the standard PDF font, so that line is drawn as a raster
    // mask and its text is **not** extractable — asserting `toContain` would be claiming more
    // than the test reaches (see W-198).
    const text = render([p('a', 'Ein Punkt', { list_style: 'bullet' }), p('b', 'Fliesstext')]);
    expect(markerBefore(text, 'Fliesstext')).not.toMatch(/\d/u);
  });

  it('honours a custom list template instead of the default', () => {
    const items = [p('a', 'Artikeltext', { list_style: 'number', list_level: 0, list_id: 'L1' })];
    // An ASCII template, so the marker stays extractable text and can be asserted.
    const harvard = BUILTIN_LIST_TEMPLATES.find((template) => template.id === 'harvard_outline')!;
    expect(markerBefore(render(items), 'Artikeltext').split(' ')[0]).toBe('1.');
    expect(markerBefore(render(items, {}, {}, { listTemplate: harvard }), 'Artikeltext').split(' ')[0]).toBe('I.');
  });
});

describe('PDF header and footer fields are evaluated', () => {
  it('replaces the page fields instead of printing braces', () => {
    const text = render([p('a', 'Inhalt')], { headerText: 'Seite {PAGE} von {NUMPAGES}' });
    expect(text).not.toContain('{PAGE}');
    expect(text).not.toContain('{NUMPAGES}');
    expect(text).toContain('Seite 1 von 1');
  });

  it('counts the document, not the printed range', () => {
    // Two pages, but only page 1 is printed.
    const paragraphs = [p('a', 'Erste Seite'), p('b', 'Zweite Seite', { page_break_before: true })];
    const text = render(paragraphs, { headerText: 'Blatt {PAGE}/{NUMPAGES}' }, { pageRange: '1' });
    expect(text).toContain('Blatt 1/2');
  });

  it('numbers each printed page with its own number', () => {
    const paragraphs = [p('a', 'Erste Seite'), p('b', 'Zweite Seite', { page_break_before: true })];
    const text = render(paragraphs, { footerText: 'Seite {PAGE}' });
    expect(text).toContain('Seite 1');
    expect(text).toContain('Seite 2');
  });

  it('fills the title field', () => {
    const text = render([p('a', 'Inhalt')], { headerText: '{TITLE}' }, {}, {}, 'Mein Bericht');
    expect(text).toContain('Mein Bericht');
  });

  it('uses the same word count as the status bar', () => {
    const paragraphs = [p('a', 'Ein kurzer Satz mit sechs Woertern'), p('b', 'und noch vier weiteren')];
    const expected = calculateTextStatistics(paragraphs, { pageCount: 1 });
    const text = render(paragraphs, { footerText: 'Woerter: {WORDCOUNT}' });
    // One definition for both, so the PDF cannot disagree with the screen.
    expect(text).toContain(`Woerter: ${expected.words}`);
  });

  it('leaves an unknown field as it is rather than dropping the text', () => {
    const text = render([p('a', 'Inhalt')], { headerText: 'Kopf {UNBEKANNT} Ende' });
    expect(text).toContain('Kopf {UNBEKANNT} Ende');
  });

  it('evaluates a field in the footer as well', () => {
    const text = render([p('a', 'Inhalt')], { footerText: 'Vertraulich - Seite {PAGE}' });
    expect(text).toContain('Vertraulich - Seite 1');
  });
});
