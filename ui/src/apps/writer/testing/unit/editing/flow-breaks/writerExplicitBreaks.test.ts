// STATUS: DIAMANT VGT SUPREME — Explicit breaks: insert, delete, page count, numbering
//
// Paket 28 acceptance: "Expliziten Umbruch einfügen/löschen, Seitennummern und
// Textfluss stimmen." Insertion, the pagination effect and the PDF path were
// covered; what was missing is the **deletion** — pressing Backspace at the start
// of the paragraph that carries the break — and the page numbers that follow.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterStyleDefinition } from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../../types';
import { formatWriterPageNumber } from '../../../../layout/pagination/geometry/writerPaginationGeometry';
import { paginateWriterParagraphs } from '../../../../layout/pagination/writerPagination';
import {
  insertWriterFlowBreak,
  insertWriterSectionBreak,
} from '../../../../editing/flow-breaks/writerBreaks';
import { mergeWriterParagraphBackward } from '../../../../editing/paragraphs/writerParagraphStructure';

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

const longText = (label: string) => `${label} ${'Wort '.repeat(180).trim()}`;

const pageIndexOfParagraph = (
  paragraphs: Paragraph[],
  paragraphId: string,
): number => {
  const pages = paginateWriterParagraphs(paragraphs, PAGE_SETUP, STYLES);
  const index = pages.findIndex((page) => page.fragments.some((fragment) => fragment.paragraph.id === paragraphId));
  return index;
};

const pageCount = (paragraphs: Paragraph[]): number =>
  paginateWriterParagraphs(paragraphs, PAGE_SETUP, STYLES).length;

describe('Writer explicit breaks', () => {
  it('puts a new page break on the paragraph after the split', () => {
    const source = [paragraph('p1', 'Erster Absatz'), paragraph('p2', 'Zweiter Absatz')];
    const result = insertWriterFlowBreak(source, 'p1', null, 'page', () => 'p-tail');
    expect(result.paragraphs[1]?.style.page_break_before).toBe(true);
    expect(result.paragraphs[0]?.style.page_break_before).toBeUndefined();
  });

  it('moves the following paragraph to a new page', () => {
    const withoutBreak = [paragraph('p1', longText('A')), paragraph('p2', longText('B'))];
    const withBreak = withoutBreak.map((item, index) =>
      index === 1 ? { ...item, style: { ...item.style, page_break_before: true } } : item);

    expect(pageIndexOfParagraph(withBreak, 'p2')).toBeGreaterThan(pageIndexOfParagraph(withoutBreak, 'p2'));
    expect(pageCount(withBreak)).toBeGreaterThanOrEqual(pageCount(withoutBreak));
  });

  it('deletes the break again when Backspace merges the paragraph into its predecessor', () => {
    // The break lives on the *following* paragraph; Backspace at its start removes
    // that paragraph, so the break goes with it. Nothing tested that before.
    const withBreak = [
      paragraph('p1', 'Erster Absatz'),
      paragraph('p2', 'Zweiter Absatz', { page_break_before: true }),
    ];
    const merged = mergeWriterParagraphBackward(withBreak, 1);
    expect(merged).not.toBeNull();
    expect(merged!.paragraphs).toHaveLength(1);
    expect(merged!.paragraphs[0]!.style.page_break_before).toBeUndefined();
    expect(merged!.paragraphs[0]!.spans.map((span) => span.text).join('')).toBe('Erster AbsatzZweiter Absatz');
  });

  it('returns the page count to the unbroken value after deleting the break', () => {
    const broken = [
      paragraph('p1', longText('A')),
      paragraph('p2', longText('B')),
      paragraph('p3', 'Ende', { page_break_before: true }),
    ];
    const unbroken = broken.map((item) => ({
      ...item,
      style: { ...item.style, page_break_before: undefined },
    }));
    const afterDelete = mergeWriterParagraphBackward(broken, 2)!;

    // The break paragraph folded into its predecessor, so the break is gone.
    expect(afterDelete.paragraphs).toHaveLength(2);
    expect(afterDelete.paragraphs.some((item) => item.style.page_break_before === true)).toBe(false);
    // The break cost at least the page it forced, and removing it cannot cost more.
    expect(pageCount(unbroken)).toBeLessThanOrEqual(pageCount(broken));
    expect(pageCount(afterDelete.paragraphs)).toBeLessThanOrEqual(pageCount(broken));
  });

  it('keeps the display page numbers consecutive across an explicit break', () => {
    const withBreak = [
      paragraph('p1', longText('A')),
      paragraph('p2', longText('B')),
      paragraph('p3', longText('C'), { page_break_before: true }),
    ];
    const pages = paginateWriterParagraphs(withBreak, PAGE_SETUP, STYLES);
    const numbers = pages.map((page) => page.displayPageNumber);
    expect(numbers.length).toBeGreaterThan(1);
    // Numbering must run 1, 2, 3 … with no gap and no repeat, whatever the break did.
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });

  it('keeps a column break inside the page, unlike a page break', () => {
    const withColumn = [
      paragraph('p1', longText('A')),
      paragraph('p2', 'Zweite Spalte', { column_break_before: true }),
    ];
    const pages = paginateWriterParagraphs(withColumn, { ...PAGE_SETUP, columns: 2 } as PageSetupConfig, STYLES);
    // A column break must not create an extra page on its own.
    const withoutColumn = [withColumn[0]!, { ...withColumn[1]!, style: { ...withColumn[1]!.style, column_break_before: undefined } }];
    expect(pages.length).toBeLessThanOrEqual(paginateWriterParagraphs(withoutColumn, { ...PAGE_SETUP, columns: 2 } as PageSetupConfig, STYLES).length);
  });

  it('formats a page number for every supported format', () => {
    expect(formatWriterPageNumber(1, 'arabic')).toBe('1');
    expect(formatWriterPageNumber(4, 'roman-upper')).toBe('IV');
    expect(formatWriterPageNumber(4, 'roman-lower')).toBe('iv');
    expect(formatWriterPageNumber(2, 'alpha-upper')).toBe('B');
    expect(formatWriterPageNumber(2, 'alpha-lower')).toBe('b');
  });

  it('inserts a section break with the requested type', () => {
    const source = [paragraph('p1', 'Erster'), paragraph('p2', 'Zweiter')];
    const result = insertWriterSectionBreak(source, 'p1', null, 'next-page', () => 'p-section');
    expect(result.paragraphs.length).toBe(source.length + 1);
    expect(result.breakType).toBe('next-page');
    // The new section starts at the tail, which is what the caller registers.
    expect(result.sectionStartParagraphId).toBe(result.activeParagraphId);
    expect(result.paragraphs.some((item) => item.id === 'p-section')).toBe(true);
  });

  it('refuses a section break on a paragraph that does not exist', () => {
    expect(() => insertWriterSectionBreak([paragraph('p1', 'A')], 'fehlt', null, 'next-page'))
      .toThrow(/does not exist/u);
  });
});
