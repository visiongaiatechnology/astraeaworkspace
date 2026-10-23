// STATUS: PLATIN — WR-006 / WR-007: no artificial page break at the top of a page
//
// Native M7 re-probe: a click in the free area below the text created a paragraph whose
// `space_before` was as large as the remaining page. The paginator broke the page
// immediately — the previous page ended 40–50 % white — and carried the same huge gap to
// the top of the **next** page, where the first line sat hundreds of points below the
// margin. A gap at the head of a flowed page has no predecessor to collapse with; it
// collapses to zero.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterStyleDefinition } from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../../types';
import { paginateWriterParagraphs } from '../../../../layout/pagination/writerPagination';
import { getWriterPageGeometry } from '../../../../layout/pagination/geometry/writerPaginationGeometry';

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

/** Enough text that the next paragraph cannot share the page with it. */
const longText = (label: string) => `${label} ${'Wort '.repeat(700).trim()}`;

describe('WR-006/WR-007 — space_before collapses at the head of a continued page', () => {
  it('does not start the continuation page with the full paragraph gap', () => {
    // 400 pt ≈ 533 px of gap: bigger than "a bit of air", smaller than the page.
    const pages = paginateWriterParagraphs([
      paragraph('filler', longText('Fülltext')),
      paragraph('after', 'Kurzer Absatz nach dem Klick', { space_before: 400 }),
    ], PAGE_SETUP, STYLES);

    expect(pages.length).toBeGreaterThanOrEqual(2);
    const second = pages[1]!;
    expect(second.fragments[0]?.paragraph.id).toBe('after');
    // Without the collapsing rule this page was ~533 px "used" before a single line.
    expect(second.usedFlowHeightPx).toBeLessThan(200);
  });

  it('keeps the authored gap on the first page', () => {
    const geometry = getWriterPageGeometry(PAGE_SETUP, 1);
    const pages = paginateWriterParagraphs([
      paragraph('intro', 'Kurzer Absatz', { space_before: 60 }),
    ], PAGE_SETUP, STYLES);

    expect(pages).toHaveLength(1);
    // 60 pt ≈ 80 px must still be part of the first page's flow height.
    expect(pages[0]!.usedFlowHeightPx).toBeGreaterThan(geometry.bodyHeightPx * 0.05);
  });

  it('never produces a page whose only content is a gap', () => {
    const pages = paginateWriterParagraphs([
      paragraph('filler', longText('Fülltext')),
      paragraph('huge', 'Nach 900 pt Abstand', { space_before: 900 }),
    ], PAGE_SETUP, STYLES);

    for (const page of pages) {
      expect(page.fragments.length).toBeGreaterThan(0);
    }
  });
});
