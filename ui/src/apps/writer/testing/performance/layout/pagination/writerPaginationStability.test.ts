// STATUS: PLATIN — Deterministic large-document and section-flow verification
import { describe, expect, it } from 'vitest';
import type {
  Paragraph,
  WriterSectionDefinition,
  WriterTableBlockData,
} from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../../types';
import {
  paginateWriterParagraphs,
  paginateWriterSections,
  type WriterFlowContent,
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

function paragraph(id: string, text = id, pageBreakBefore = false): Paragraph {
  return {
    id,
    style: {
      alignment: 'left',
      line_height: 1.2,
      space_before: 0,
      space_after: 0,
      page_break_before: pageBreakBefore,
    },
    spans: [{ text, font_size_pt: 11 }],
  };
}

function table(id: string, anchorParagraphId?: string, rows = 1): WriterTableBlockData {
  return {
    id,
    anchorParagraphId,
    columns: ['Value'],
    rows: Array.from({ length: rows }, (_, index) => ({
      id: `${id}-row-${index}`,
      cells: [{ id: `${id}-cell-${index}`, content: String(index) }],
    })),
  };
}

function flow(tables: readonly WriterTableBlockData[]): WriterFlowContent {
  return { tables, images: [], equations: [], footnotes: [] };
}

describe('writer pagination stability', () => {
  it('paginates thousands of explicit pages iteratively without loss or duplicate identities', () => {
    const paragraphs = Array.from({ length: 2_048 }, (_, index) =>
      paragraph(`paragraph-${index}`, `Page ${index + 1}`, index > 0));

    const pages = paginateWriterSections(paragraphs, PAGE_SETUP, [], []);

    expect(pages).toHaveLength(paragraphs.length);
    expect(pages.map((page) => page.id)).toEqual(
      paragraphs.map((_, index) => `page-${index + 1}`),
    );
    expect(pages.flatMap((page) => page.fragments).map((fragment) => fragment.paragraph.id))
      .toEqual(paragraphs.map((item) => item.id));
    expect(new Set(pages.map((page) => page.id)).size).toBe(pages.length);
  });

  it('assigns every table to exactly one section and appends unanchored objects once', () => {
    const paragraphs = [paragraph('intro'), paragraph('chapter-a'), paragraph('chapter-b')];
    const sections: WriterSectionDefinition[] = [
      { id: 'section-a', startParagraphId: 'chapter-a', pageSetup: PAGE_SETUP },
      { id: 'section-b', startParagraphId: 'chapter-b', pageSetup: PAGE_SETUP },
    ];
    const tables = [
      table('intro-table', 'intro'),
      table('a-table', 'chapter-a'),
      table('b-table', 'chapter-b'),
      table('unanchored-table'),
      table('dangling-table', 'deleted-paragraph'),
    ];

    const pages = paginateWriterSections(paragraphs, PAGE_SETUP, [], sections, flow(tables));
    const tableOccurrences = pages
      .flatMap((page) => (page.tableFragments ?? []).map((fragment) => ({
        sectionId: page.sectionId,
        tableId: fragment.tableId,
      })));

    expect(tableOccurrences).toEqual([
      { sectionId: 'document-default', tableId: 'intro-table' },
      { sectionId: 'section-a', tableId: 'a-table' },
      { sectionId: 'section-b', tableId: 'b-table' },
      { sectionId: 'section-b', tableId: 'unanchored-table' },
      { sectionId: 'section-b', tableId: 'dangling-table' },
    ]);
    expect(new Set(tableOccurrences.map(({ tableId }) => tableId)).size).toBe(tables.length);
  });

  it('preserves paragraph/table order when an anchored table spans multiple pages', () => {
    const compactSetup: PageSetupConfig = {
      ...PAGE_SETUP,
      paperSize: 'Custom',
      customWidthMm: 120,
      customHeightMm: 90,
      margins: 'custom',
      customMargins: { top: 5, bottom: 5, left: 8, right: 8, gutter: 0 },
    };
    const pages = paginateWriterParagraphs(
      [paragraph('anchor'), paragraph('tail')],
      compactSetup,
      [],
      flow([table('long-table', 'anchor', 20)]),
    );
    const orderedItems = pages.flatMap((page) => page.flowItems ?? []);
    const tableItems = orderedItems.filter((item) => item.kind === 'table');

    expect(pages.length).toBeGreaterThan(2);
    expect(orderedItems[0]).toMatchObject({
      kind: 'paragraph',
      fragment: { paragraph: { id: 'anchor' } },
    });
    expect(orderedItems.at(-1)).toMatchObject({
      kind: 'paragraph',
      fragment: { paragraph: { id: 'tail' } },
    });
    expect(tableItems.length).toBeGreaterThan(1);
    expect(tableItems.every((item) => item.kind === 'table' && item.fragment.tableId === 'long-table'))
      .toBe(true);
    expect(pages.slice(0, -1).every((page) => page.usedFlowHeightPx <= page.availableFlowHeightPx))
      .toBe(true);
  });

  it('returns byte-for-byte stable pagination metadata for identical section input', () => {
    const paragraphs = Array.from({ length: 64 }, (_, index) =>
      paragraph(`p-${index}`, 'Astraea '.repeat((index % 7) + 1), index % 11 === 0 && index > 0));
    const sections: WriterSectionDefinition[] = [
      {
        id: 'landscape',
        startParagraphId: 'p-16',
        pageSetup: { ...PAGE_SETUP, orientation: 'landscape' },
        restartPageNumberAt: 20,
      },
      {
        id: 'final',
        startParagraphId: 'p-48',
        pageSetup: { ...PAGE_SETUP, paperSize: 'Letter' },
      },
    ];
    const content = flow([table('first', 'p-5', 8), table('last', undefined, 6)]);

    const first = paginateWriterSections(paragraphs, PAGE_SETUP, [], sections, content);
    const second = paginateWriterSections(paragraphs, PAGE_SETUP, [], sections, content);

    expect(second).toEqual(first);
  });
});
