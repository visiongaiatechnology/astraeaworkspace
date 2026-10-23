// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterStyleDefinition } from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../../types';
import {
  estimateWriterParagraphHeightPx,
  getWriterPageGeometry,
  paginateWriterParagraphs,
  paginateWriterSections,
} from '../../../../layout/pagination/writerPagination';

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

function paragraph(id: string, text: string, pageBreakBefore = false): Paragraph {
  return {
    id,
    style: {
      style_name: 'normal',
      alignment: 'left',
      line_height: 1.2,
      space_before: 0,
      space_after: 6,
      page_break_before: pageBreakBefore,
    },
    spans: [{ text, font_size_pt: 11 }],
  };
}

describe('writer pagination', () => {
  it('derives geometry from paper orientation, margins, and columns', () => {
    const portrait = getWriterPageGeometry(PAGE_SETUP);
    const landscape = getWriterPageGeometry({ ...PAGE_SETUP, orientation: 'landscape' });
    const columns = getWriterPageGeometry({ ...PAGE_SETUP, columns: 2, columnGapMm: 12 });

    expect(portrait.heightPx).toBeGreaterThan(portrait.widthPx);
    expect(landscape.widthPx).toBeGreaterThan(landscape.heightPx);
    expect(columns.columnCount).toBe(2);
    expect(columns.columnWidthPx * 2 + columns.columnGapPx).toBeCloseTo(columns.bodyWidthPx, 6);
  });

  it('measures long paragraphs higher than short paragraphs', () => {
    const geometry = getWriterPageGeometry(PAGE_SETUP);
    const shortHeight = estimateWriterParagraphHeightPx(
      paragraph('short', 'Short paragraph.'),
      geometry.columnWidthPx,
      STYLES
    );
    const longHeight = estimateWriterParagraphHeightPx(
      paragraph('long', 'Astraea '.repeat(800)),
      geometry.columnWidthPx,
      STYLES
    );

    expect(longHeight).toBeGreaterThan(shortHeight * 5);
  });

  it('uses explicit emergency and keep-all line-flow rules during pagination', () => {
    const emergency = paragraph('emergency', 'A'.repeat(300));
    emergency.style.line_break_mode = 'break-word';
    const keepAll = paragraph('keep-all', 'A'.repeat(300));
    keepAll.style.line_break_mode = 'keep-all';
    expect(estimateWriterParagraphHeightPx(emergency, 180, STYLES)).toBeGreaterThan(
      estimateWriterParagraphHeightPx(keepAll, 180, STYLES),
    );
  });

  it('reserves vertical page-flow space for paragraph borders', () => {
    const geometry = getWriterPageGeometry(PAGE_SETUP);
    const plain = paragraph('plain', 'Decorated paragraph');
    const decorated = paragraph('decorated', 'Decorated paragraph');
    decorated.style.borders = {
      top: { style: 'solid', widthPt: 2, color: '#334155', spacingPt: 4 },
      bottom: { style: 'solid', widthPt: 2, color: '#334155', spacingPt: 4 },
    };
    expect(estimateWriterParagraphHeightPx(decorated, geometry.columnWidthPx, STYLES))
      .toBeGreaterThan(estimateWriterParagraphHeightPx(plain, geometry.columnWidthPx, STYLES));
  });

  it('paginates by measured flow height instead of paragraph count', () => {
    const content = Array.from({ length: 8 }, (_, index) =>
      paragraph(`p-${index}`, index === 0 ? 'Astraea '.repeat(1_200) : `Paragraph ${index}`)
    );
    const pages = paginateWriterParagraphs(content, PAGE_SETUP, STYLES);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]?.paragraphs).toHaveLength(1);
    expect([...new Set(pages.flatMap((page) => page.paragraphs).map((item) => item.id))]).toEqual(
      content.map((item) => item.id),
    );
    const sourceText = content[0]?.spans.map((span) => span.text).join('') ?? '';
    const reconstructed = pages
      .flatMap((page) => page.fragments)
      .filter((fragment) => fragment.paragraph.id === 'p-0')
      .map((fragment) => sourceText.slice(fragment.startOffset, fragment.endOffset))
      .join('');
    expect(reconstructed).toBe(sourceText);
  });

  it('honors explicit page breaks', () => {
    const pages = paginateWriterParagraphs(
      [paragraph('first', 'First'), paragraph('second', 'Second', true)],
      PAGE_SETUP,
      STYLES
    );

    expect(pages).toHaveLength(2);
    expect(pages[0]?.paragraphs.map((item) => item.id)).toEqual(['first']);
    expect(pages[1]?.paragraphs.map((item) => item.id)).toEqual(['second']);
  });

  it('keeps a heading with its following paragraph when the pair does not fit', () => {
    const setup: PageSetupConfig = {
      ...PAGE_SETUP,
      paperSize: 'Custom',
      customWidthMm: 120,
      customHeightMm: 100,
      margins: 'custom',
      customMargins: { top: 5, bottom: 5, left: 8, right: 8, gutter: 0 },
    };
    const filler = paragraph('filler', 'Astraea '.repeat(180));
    const heading = paragraph('heading', 'Kept heading');
    heading.style.keep_with_next = true;
    const body = paragraph('body', 'Following paragraph '.repeat(20));
    const pages = paginateWriterParagraphs([filler, heading, body], setup, STYLES);

    expect(pages.length).toBeGreaterThan(1);
    const headingPage = pages.findIndex((page) => page.paragraphs.some((item) => item.id === 'heading'));
    const bodyPage = pages.findIndex((page) => page.paragraphs.some((item) => item.id === 'body'));
    expect(headingPage).toBe(bodyPage);
  });

  it('keeps an entire chained heading group together when the chain fits a page', () => {
    const setup: PageSetupConfig = {
      ...PAGE_SETUP,
      paperSize: 'Custom',
      customWidthMm: 120,
      customHeightMm: 80,
      margins: 'custom',
      customMargins: { top: 5, bottom: 5, left: 8, right: 8, gutter: 0 },
    };
    const filler = paragraph('filler', 'F'.repeat(320));
    const firstHeading = paragraph('heading-1', 'First heading');
    const secondHeading = paragraph('heading-2', 'Second heading');
    const body = paragraph('body', 'Body '.repeat(20));
    firstHeading.style.keep_with_next = true;
    secondHeading.style.keep_with_next = true;

    const pages = paginateWriterParagraphs([filler, firstHeading, secondHeading, body], setup, STYLES);
    const groupPageIndexes = ['heading-1', 'heading-2', 'body'].map((id) =>
      pages.findIndex((page) => page.paragraphs.some((item) => item.id === id)),
    );
    expect(new Set(groupPageIndexes).size).toBe(1);
    expect(groupPageIndexes[0]).toBeGreaterThan(0);
  });

  it('moves a keep-lines paragraph intact when it fits only on the next page', () => {
    const setup: PageSetupConfig = {
      ...PAGE_SETUP,
      paperSize: 'Custom',
      customWidthMm: 120,
      customHeightMm: 70,
      margins: 'custom',
      customMargins: { top: 5, bottom: 5, left: 8, right: 8, gutter: 0 },
    };
    const filler = paragraph('filler', 'F'.repeat(160));
    const kept = paragraph('kept', 'K'.repeat(350));
    kept.style.keep_lines_together = true;
    const pages = paginateWriterParagraphs([filler, kept], setup, STYLES);
    const keptPages = pages
      .map((page, pageIndex) => page.fragments.some((fragment) => fragment.paragraph.id === 'kept') ? pageIndex : -1)
      .filter((pageIndex) => pageIndex >= 0);

    expect(keptPages).toHaveLength(1);
    expect(keptPages[0]).toBeGreaterThan(0);
  });

  it('prevents a one-line widow while allowing an explicit opt-out', () => {
    const setup: PageSetupConfig = {
      ...PAGE_SETUP,
      paperSize: 'Custom',
      customWidthMm: 120,
      customHeightMm: 70,
      margins: 'custom',
      customMargins: { top: 5, bottom: 5, left: 8, right: 8, gutter: 0 },
    };
    const protectedParagraph = paragraph('protected', 'W'.repeat(405));
    const protectedFragments = paginateWriterParagraphs([protectedParagraph], setup, STYLES)
      .flatMap((page) => page.fragments);
    expect(protectedFragments).toHaveLength(2);
    expect(protectedFragments.every((fragment) => fragment.lineCount >= 2)).toBe(true);

    const unprotectedParagraph = paragraph('unprotected', 'W'.repeat(405));
    unprotectedParagraph.style.widow_orphan_control = false;
    const unprotectedFragments = paginateWriterParagraphs([unprotectedParagraph], setup, STYLES)
      .flatMap((page) => page.fragments);
    expect(unprotectedFragments.at(-1)?.lineCount).toBe(1);
  });

  it('starts section layouts on a new page and applies their own geometry', () => {
    const content = [
      paragraph('intro', 'Portrait introduction'),
      paragraph('landscape-start', 'Landscape section'),
      paragraph('landscape-body', 'Section body'),
    ];
    const pages = paginateWriterSections(content, PAGE_SETUP, STYLES, [{
      id: 'wide-section',
      startParagraphId: 'landscape-start',
      pageSetup: { ...PAGE_SETUP, orientation: 'landscape' },
      restartPageNumberAt: 10,
    }]);

    expect(pages).toHaveLength(2);
    expect(pages[0]?.paragraphs.map((item) => item.id)).toEqual(['intro']);
    expect(pages[1]?.paragraphs.map((item) => item.id)).toEqual(['landscape-start', 'landscape-body']);
    expect(pages[1]?.sectionId).toBe('wide-section');
    expect(pages[1]?.pageSetup.orientation).toBe('landscape');
    expect(pages[1]?.displayPageNumber).toBe(10);
  });

  it('places a compatible continuous section on the current physical page as a separate layout segment', () => {
    const content = [
      paragraph('intro', 'Short introduction'),
      paragraph('continuous-start', 'Continuous section'),
    ];
    const pages = paginateWriterSections(content, PAGE_SETUP, STYLES, [{
      id: 'continuous-section',
      startParagraphId: 'continuous-start',
      breakType: 'continuous',
      pageSetup: { ...PAGE_SETUP, columns: 2, columnGapMm: 8 },
    }]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.sectionSegments).toHaveLength(2);
    expect(pages[0]?.sectionSegments?.[0]?.sectionId).toBe('document-default');
    expect(pages[0]?.sectionSegments?.[1]?.sectionId).toBe('continuous-section');
    expect(pages[0]?.sectionSegments?.[1]?.columnFlowItems).toHaveLength(2);
    expect(pages[0]?.fragments.map((fragment) => fragment.paragraph.id)).toEqual([
      'intro',
      'continuous-start',
    ]);
  });

  it('promotes an incompatible continuous section to a new physical page', () => {
    const content = [
      paragraph('intro', 'Portrait introduction'),
      paragraph('continuous-start', 'Landscape section'),
    ];
    const pages = paginateWriterSections(content, PAGE_SETUP, STYLES, [{
      id: 'incompatible-continuous',
      startParagraphId: 'continuous-start',
      breakType: 'continuous',
      pageSetup: { ...PAGE_SETUP, orientation: 'landscape' },
    }]);

    expect(pages).toHaveLength(2);
    expect(pages[1]?.sectionId).toBe('incompatible-continuous');
    expect(pages[1]?.pageSetup.orientation).toBe('landscape');
  });

  it('inserts only the parity page required by odd and even section breaks', () => {
    const content = [paragraph('intro', 'Intro'), paragraph('section-start', 'Section')];
    const oddPages = paginateWriterSections(content, PAGE_SETUP, STYLES, [{
      id: 'odd-section',
      startParagraphId: 'section-start',
      breakType: 'odd-page',
      pageSetup: PAGE_SETUP,
    }]);
    const evenPages = paginateWriterSections(content, PAGE_SETUP, STYLES, [{
      id: 'even-section',
      startParagraphId: 'section-start',
      breakType: 'even-page',
      pageSetup: PAGE_SETUP,
    }]);

    expect(oddPages).toHaveLength(3);
    expect(oddPages[1]?.isBlankPage).toBe(true);
    expect(oddPages[2]?.pageIndex % 2).toBe(1);
    expect(oddPages[2]?.sectionId).toBe('odd-section');
    expect(evenPages).toHaveLength(2);
    expect(evenPages[1]?.isBlankPage).not.toBe(true);
    expect(evenPages[1]?.pageIndex % 2).toBe(0);
  });

  it('formats logical document and chapter page numbers across section restarts and parity blanks', () => {
    const content = [paragraph('intro', 'Intro'), paragraph('chapter-two', 'Chapter two')];
    const setup: PageSetupConfig = {
      ...PAGE_SETUP,
      pageNumberStart: 4,
      pageNumberFormat: 'roman-lower',
      chapterNumbering: true,
    };
    const pages = paginateWriterSections(content, setup, STYLES, [{
      id: 'chapter-two-section',
      startParagraphId: 'chapter-two',
      breakType: 'odd-page',
      restartPageNumberAt: 2,
      pageSetup: { ...setup, pageNumberFormat: 'alpha-upper' },
    }]);

    expect(pages.map((page) => page.displayPageNumberString)).toEqual([
      'Kapitel 1-iv',
      'Kapitel 1-v',
      'Kapitel 2-B',
    ]);
  });

  it('does not merge a continuous section that restarts page numbering', () => {
    const pages = paginateWriterSections(
      [paragraph('first', 'First'), paragraph('second', 'Second')],
      PAGE_SETUP,
      STYLES,
      [{
        id: 'restart',
        startParagraphId: 'second',
        breakType: 'continuous',
        restartPageNumberAt: 9,
        pageSetup: PAGE_SETUP,
      }],
    );
    expect(pages).toHaveLength(2);
    expect(pages[1]?.displayPageNumber).toBe(9);
  });

  it('ignores dangling and duplicate section starts deterministically', () => {
    const content = [paragraph('first', 'First'), paragraph('second', 'Second')];
    const pages = paginateWriterSections(content, PAGE_SETUP, STYLES, [
      { id: 'missing', startParagraphId: 'absent', pageSetup: { ...PAGE_SETUP, orientation: 'landscape' } },
      { id: 'first-definition', startParagraphId: 'second', pageSetup: { ...PAGE_SETUP, columns: 2 } },
      { id: 'duplicate', startParagraphId: 'second', pageSetup: { ...PAGE_SETUP, columns: 3 } },
    ]);

    expect(pages).toHaveLength(2);
    expect(pages[1]?.sectionId).toBe('first-definition');
    expect(pages[1]?.pageSetup.columns).toBe(2);
  });

  it('includes anchored Writer objects in page-flow measurement', () => {
    const setup: PageSetupConfig = {
      ...PAGE_SETUP,
      paperSize: 'Custom',
      customWidthMm: 120,
      customHeightMm: 110,
      margins: 'custom',
      customMargins: { top: 5, bottom: 5, left: 8, right: 8, gutter: 0 },
    };
    const content = [paragraph('first', 'First'), paragraph('second', 'Second')];
    const withoutObject = paginateWriterParagraphs(content, setup, STYLES);
    const withTable = paginateWriterParagraphs(content, setup, STYLES, {
      tables: [{
        id: 'table',
        anchorParagraphId: 'first',
        columns: ['A'],
        rows: Array.from({ length: 8 }, (_, index) => ({
          id: `row-${index}`,
          cells: [{ id: `cell-${index}`, content: String(index) }],
        })),
      }],
      images: [],
      equations: [],
      footnotes: [],
    });

    expect(withoutObject).toHaveLength(1);
    expect(withTable.length).toBeGreaterThan(withoutObject.length);
    expect(withTable[0]?.paragraphs.map((item) => item.id)).toEqual(['first']);
  });
});
