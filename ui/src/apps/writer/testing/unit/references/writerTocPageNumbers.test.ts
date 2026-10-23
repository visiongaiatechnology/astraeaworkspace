// STATUS: DIAMANT VGT SUPREME — The directory must carry real page numbers on the first pass
//
// Paket 35 acceptance: "Überschriften hinzufügen und Inhaltsverzeichnis regenerieren
// **ohne manuelle Nacharbeit**."
//
// W-161: the TOC modal was rendered **without** the pagination, so
// `resolveParagraphPageNumber` answered `1` for every heading. The inserted directory
// read "1" on every line and the user had to run a field update to get real numbers —
// exactly the manual rework the acceptance excludes. `pages` is now a required prop so
// the omission cannot come back silently.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import {
  extractTocEntries,
  generateTableOfContentsParagraphs,
  resolveParagraphPageNumber,
  TOC_HEADER_PREFIX,
  TOC_ITEM_PREFIX,
  updateOrInsertTableOfContents,
} from '../../../references/toc/writerTocEngine';

const heading = (id: string, text: string, level = 1): Paragraph => ({
  id, spans: [{ text }], style: { style_name: level === 1 ? 'heading1' : 'heading2', heading_level: level },
} as unknown as Paragraph);
const body = (id: string, text: string): Paragraph => ({
  id, spans: [{ text }], style: { style_name: 'normal' },
} as unknown as Paragraph);

/** A page as the pagination produces it. */
const page = (pageIndex: number, displayPageNumber: number, paragraphs: Paragraph[]) => ({
  id: `page-${pageIndex}`,
  pageIndex,
  displayPageNumber,
  paragraphs,
} as never);

const PAGES = [
  page(0, 1, [heading('h1', 'Einleitung'), body('b1', 'Text')]),
  page(1, 2, [heading('h2', 'Hauptteil'), body('b2', 'Mehr Text')]),
  page(2, 3, [heading('h3', 'Schluss'), body('b3', 'Ende')]),
];

const numbersOf = (paragraphs: readonly Paragraph[], pages?: never) =>
  generateTableOfContentsParagraphs(paragraphs, pages, { showPageNumbers: true })
    .filter((p) => p.id.startsWith(TOC_ITEM_PREFIX))
    .map((p) => p.spans.map((s) => s.text).join('').trim().split(/\s+/u).pop());

describe('Writer directory page numbers', () => {
  it('answers 1 for everything when the pagination is missing', () => {
    // The old behaviour, kept explicit: this is what the omitted prop produced.
    expect(resolveParagraphPageNumber('h2', undefined)).toBe(1);
    expect(resolveParagraphPageNumber('h2', [])).toBe(1);
  });

  it('answers the real page when the pagination is there', () => {
    expect(resolveParagraphPageNumber('h1', PAGES)).toBe(1);
    expect(resolveParagraphPageNumber('h2', PAGES)).toBe(2);
    expect(resolveParagraphPageNumber('h3', PAGES)).toBe(3);
  });

  it('uses the printed page number, not the physical index', () => {
    const restarted = [page(0, 7, [heading('h1', 'Einleitung')])];
    expect(resolveParagraphPageNumber('h1', restarted)).toBe(7);
  });

  it('falls back to the physical index when no printed number is set', () => {
    const unnumbered = [{ id: 'p', pageIndex: 4, paragraphs: [heading('h9', 'X')] } as never];
    expect(resolveParagraphPageNumber('h9', unnumbered)).toBe(5);
  });

  it('puts the real page on every line of a generated directory', () => {
    const document = [heading('h1', 'Einleitung'), body('b1', 'Text'), heading('h2', 'Hauptteil'), heading('h3', 'Schluss')];
    expect(numbersOf(document, PAGES as never)).toEqual(['1', '2', '3']);
  });

  it('never invents a page for a heading that is not laid out', () => {
    const unknown = [heading('h1', 'Einleitung'), heading('h-neu', 'Noch nicht gesetzt')];
    const entries = extractTocEntries(unknown, PAGES, {});
    expect(entries.map((entry) => entry.pageNumber)).toEqual([1, 1]);
  });

  it('lists headings only, without the directory itself', () => {
    const document = [heading('h1', 'Einleitung'), body('b1', 'Text')];
    const withToc = [...generateTableOfContentsParagraphs(document, PAGES as never), ...document];
    const entries = extractTocEntries(withToc, PAGES as never, {});
    // The engine skips its own paragraphs; a regeneration must not list the directory.
    expect(entries.map((entry) => entry.title)).toEqual(['Einleitung']);
  });

  it('regenerates in place without duplicating or losing anything', () => {
    const document = [heading('h1', 'Einleitung'), body('b1', 'Text')];
    const first = generateTableOfContentsParagraphs(document, PAGES as never);
    const withToc = [...first, ...document];

    const again = updateOrInsertTableOfContents(withToc, PAGES as never);
    expect(again.filter((p) => p.id.startsWith(TOC_HEADER_PREFIX))).toHaveLength(1);
    expect(again.filter((p) => p.id.startsWith(TOC_ITEM_PREFIX))).toHaveLength(1);

    // Adding a heading and regenerating picks it up without any manual step.
    const grown = [...again, heading('h4', 'Anhang')];
    const refreshed = updateOrInsertTableOfContents(grown, PAGES as never);
    const titles = refreshed.filter((p) => p.id.startsWith(TOC_ITEM_PREFIX))
      .map((p) => p.spans[0]?.text);
    expect(titles).toEqual(['Einleitung', 'Anhang']);
  });

  it('inserts at the top when the document has no directory yet', () => {
    const document = [heading('h1', 'Einleitung')];
    const result = updateOrInsertTableOfContents(document, PAGES as never);
    expect(result[0]?.id.startsWith(TOC_HEADER_PREFIX)).toBe(true);
    expect(result.at(-1)?.id).toBe('h1');
  });

  it('offers a page number for every heading when page numbers are switched on', () => {
    const document = [heading('h1', 'Einleitung'), heading('h2', 'Hauptteil')];
    const lines = generateTableOfContentsParagraphs(document, PAGES as never, { showPageNumbers: true })
      .filter((p) => p.id.startsWith(TOC_ITEM_PREFIX));
    for (const line of lines) {
      expect(line.spans.some((span) => /^\d+$/u.test(span.text))).toBe(true);
    }
  });

  it('leaves the page number out when it is switched off', () => {
    const document = [heading('h1', 'Einleitung')];
    const line = generateTableOfContentsParagraphs(document, PAGES as never, { showPageNumbers: false })
      .find((p) => p.id.startsWith(TOC_ITEM_PREFIX));
    expect(line?.spans.some((span) => /^\d+$/u.test(span.text))).toBe(false);
  });

  it('links every line to its heading', () => {
    const document = [heading('h1', 'Einleitung'), heading('h2', 'Hauptteil')];
    const lines = generateTableOfContentsParagraphs(document, PAGES as never)
      .filter((p) => p.id.startsWith(TOC_ITEM_PREFIX));
    const targets = lines.map((line) => {
      const link = line.spans[0]?.link;
      // The link is a discriminated union; narrowing keeps the assertion honest.
      return link?.kind === 'internal' ? link.paragraphId : `unexpected:${link?.kind ?? 'none'}`;
    });
    expect(targets).toEqual(['h1', 'h2']);
  });
});
