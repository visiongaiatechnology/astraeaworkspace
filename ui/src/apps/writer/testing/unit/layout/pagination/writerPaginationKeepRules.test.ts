// STATUS: PLATIN — Keep-rule chains must terminate and must not lose or duplicate
// content. A chain of "keep with next" paragraphs is the classic place where a
// pagination loop can stall or push everything onto one page.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterStyleDefinition } from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../../types';
import { paginateWriterParagraphs } from '../../../../layout/pagination/writerPagination';

const PAGE_SETUP: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

const STYLES: WriterStyleDefinition[] = [{
  name: 'normal',
  label: 'Normal',
  fontSizePt: 11,
  bold: false,
  lineHeight: 1.2,
  spaceBefore: 0,
  spaceAfter: 6,
}];

function paragraph(id: string, text: string, overrides: Partial<Paragraph['style']> = {}): Paragraph {
  return {
    id,
    style: {
      style_name: 'normal',
      alignment: 'left',
      line_height: 1.2,
      space_before: 0,
      space_after: 6,
      ...overrides,
    },
    spans: [{ text, font_size_pt: 11 }],
  };
}

/** Text long enough that a handful of paragraphs cannot share one page. */
const longText = (label: string) => `${label} ${'Wort '.repeat(180).trim()}`;

const placedIds = (paragraphs: Paragraph[]) => {
  const pages = paginateWriterParagraphs(paragraphs, PAGE_SETUP, STYLES);
  return pages.flatMap((page) => page.fragments.map((fragment) => fragment.paragraph.id));
};

describe('Writer keep-rule chains', () => {
  const many = Array.from({ length: 8 }, (_, index) => paragraph(
    `p${index}`,
    longText(`Absatz ${index}`),
    { keep_with_next: true },
  ));

  it('terminates when every paragraph is kept with the next one', () => {
    const pages = paginateWriterParagraphs(many, PAGE_SETUP, STYLES);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.length).toBeLessThanOrEqual(many.length);
  });

  it('places every paragraph in document order, allowing a split paragraph to repeat', () => {
    const ids = placedIds(many);
    // A paragraph that does not fit on one page legitimately produces several
    // fragments, so the invariant is the order of *first* appearances.
    const firstAppearances = ids.filter((id, index) => ids.indexOf(id) === index);
    expect(firstAppearances).toEqual(many.map((p) => p.id));
  });

  it('keeps a paragraph together with its successor when both fit on a page', () => {
    const pair = [
      paragraph('a', 'Kurzer Absatz A', { keep_with_next: true }),
      paragraph('b', 'Kurzer Absatz B'),
    ];
    const ids = placedIds(pair);
    expect(ids).toEqual(['a', 'b']);
  });

  it('does not push a kept pair onto a new page when it is already the first thing on one', () => {
    // keep_with_next must not create an empty leading page.
    const pages = paginateWriterParagraphs(
      [paragraph('a', longText('A'), { keep_with_next: true }), paragraph('b', longText('B'))],
      PAGE_SETUP,
      STYLES,
    );
    expect(pages[0]?.fragments.length).toBeGreaterThan(0);
  });

  it('terminates when keep-lines-together meets a paragraph taller than a page', () => {
    // The paragraph cannot fit on any page, so the rule must be abandoned rather
    // than pushing it forward forever.
    const huge = paragraph('huge', 'Wort '.repeat(4000).trim(), { keep_lines_together: true });
    const pages = paginateWriterParagraphs([paragraph('first', 'Kurz'), huge], PAGE_SETUP, STYLES);
    const ids = pages.flatMap((page) => page.fragments.map((fragment) => fragment.paragraph.id));
    expect(ids.filter((id) => id === 'huge').length).toBeGreaterThan(0);
    expect(ids[0]).toBe('first');
  });

  it('terminates when widow and orphan control meets a very long paragraph', () => {
    const long = paragraph('long', 'Wort '.repeat(3000).trim(), { widow_orphan_control: true });
    const pages = paginateWriterParagraphs([long], PAGE_SETUP, STYLES);
    const fragments = pages.flatMap((page) => page.fragments);
    expect(fragments.length).toBeGreaterThan(0);
    // A paragraph split by widow control still yields at least one line per fragment.
    for (const fragment of fragments) {
      expect(fragment.lineCount).toBeGreaterThan(0);
    }
  });

  it('places a manual page break at the front of its paragraph', () => {
    const pages = paginateWriterParagraphs([
      paragraph('a', 'Erste Seite'),
      paragraph('b', 'Zweite Seite', { page_break_before: true }),
    ], PAGE_SETUP, STYLES);
    expect(pages.length).toBe(2);
    expect(pages[0]?.fragments.map((f) => f.paragraph.id)).toEqual(['a']);
    expect(pages[1]?.fragments.map((f) => f.paragraph.id)).toEqual(['b']);
  });

  it('does not create a leading blank page when the first paragraph carries a break', () => {
    // There is nothing before the first paragraph, so the break has no effect and
    // both paragraphs share the opening page.
    const pages = paginateWriterParagraphs([
      paragraph('a', 'Beginnt die Datei', { page_break_before: true }),
      paragraph('b', 'Danach'),
    ], PAGE_SETUP, STYLES);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.fragments.map((f) => f.paragraph.id)).toEqual(['a', 'b']);
    expect(pages.some((page) => page.fragments.length === 0)).toBe(false);
  });
});
