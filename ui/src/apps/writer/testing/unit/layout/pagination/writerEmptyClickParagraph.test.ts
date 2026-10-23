// STATUS: PLATIN — native Runde 4: an empty click paragraph must not break the page
//
// Native regression: clicking low on page 1 created one empty paragraph whose `space_before`
// was a hair too large. `maximumLines < 1` advanced the column, the gap collapsed at the new
// page head, page 1 stayed half empty — and the next click on page 1 pushed page 3 and 4.
// The caret geometry now measures against the paginator's own page height and keeps a safety
// buffer; this test pins the paginator's last line of defence: such a paragraph is capped to
// the remaining space instead of forcing a break.
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
    spans: [{ text }],
  };
}

/** Enough text to leave only a small strip on page 1. */
function filler(): Paragraph {
  return paragraph('filler', `${'Wort '.repeat(660).trim()}`);
}

describe('native Runde 4 — an empty paragraph with space_before does not force a page break', () => {
  it('keeps the empty click paragraph on page 1 when its gap no longer fits', () => {
    const pages = paginateWriterParagraphs([
      filler(),
      // A gap that is clearly larger than the remaining strip on page 1.
      paragraph('click', '', { space_before: 200 }),
    ], PAGE_SETUP, STYLES);

    const ids = pages.flatMap((page) => page.fragments.map((fragment) => fragment.paragraph.id));
    // Both paragraphs are on page 1: the empty paragraph is capped, not pushed.
    expect(pages).toHaveLength(1);
    expect(ids).toContain('filler');
    expect(ids).toContain('click');
  });

  it('still advances when a non-empty paragraph genuinely does not fit', () => {
    const pages = paginateWriterParagraphs([
      filler(),
      // Several lines: after the filler only a small strip is left, so this must break.
      paragraph('real', 'Satz mit Inhalt. '.repeat(40).trim()),
    ], PAGE_SETUP, STYLES);
    const ids = pages.flatMap((page) => page.fragments.map((fragment) => fragment.paragraph.id));
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(ids.filter((id) => id === 'real').length).toBeGreaterThanOrEqual(1);
  });

  it('never produces an empty page for a click paragraph chain', () => {
    const fragments = Array.from({ length: 5 }, (_, index) => (
      paragraph(`click-${index}`, '', { space_before: 180 })
    ));
    const pages = paginateWriterParagraphs([filler(), ...fragments], PAGE_SETUP, STYLES);
    // No page may exist without a fragment — the "ghost page" shape.
    for (const page of pages) expect(page.fragments.length).toBeGreaterThan(0);
    const geometry = getWriterPageGeometry(PAGE_SETUP, 1);
    // Page 1 keeps its content even with five empty click paragraphs stacked below it.
    expect(pages[0]!.fragments.some((fragment) => fragment.paragraph.id === 'click-0')).toBe(true);
    expect(geometry.bodyHeightPx).toBeGreaterThan(0);
  });
});
