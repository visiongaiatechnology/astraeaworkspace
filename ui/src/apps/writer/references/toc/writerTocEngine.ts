// STATUS: DIAMANT VGT SUPREME — Sovereign Table of Contents (TOC) Engine
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';

export interface TocOptions {
  title?: string;
  maxLevel?: number; // 1 to 5, default 3
  tabLeader?: '.' | '-' | '_' | 'none'; // default '.'
  showPageNumbers?: boolean; // default true
  rightAlignPageNumbers?: boolean; // default true
}

export interface TocEntry {
  headingId: string;
  level: number;
  title: string;
  pageNumber: number;
  dots: string;
}

export const TOC_HEADER_PREFIX = 'toc-header-block';
export const TOC_ITEM_PREFIX = 'toc-item-';

/**
 * Resolves the page number on which a paragraph is rendered.
 */
export function resolveParagraphPageNumber(
  paragraphId: string,
  pages?: readonly WriterPaginationPage[]
): number {
  if (!pages || pages.length === 0) return 1;
  for (const page of pages) {
    if (page.paragraphs && page.paragraphs.some((p) => p.id === paragraphId)) {
      return page.displayPageNumber ?? (page.pageIndex + 1);
    }
  }
  return 1;
}

/**
 * Extracts and filters all headings from paragraphs based on maxLevel.
 */
export function extractTocEntries(
  paragraphs: readonly Paragraph[],
  pages?: readonly WriterPaginationPage[],
  options?: TocOptions
): TocEntry[] {
  const maxLevel = options?.maxLevel ?? 3;
  const tabLeader = options?.tabLeader ?? '.';
  const entries: TocEntry[] = [];

  paragraphs.forEach((p) => {
    // Skip existing TOC items to prevent self-referencing loops
    if (p.id.startsWith(TOC_HEADER_PREFIX) || p.id.startsWith(TOC_ITEM_PREFIX)) {
      return;
    }

    const level = p.style.heading_level || 0;
    if (level >= 1 && level <= maxLevel) {
      const title = p.spans.map((s) => s.text).join('').trim();
      if (title.length > 0) {
        const pageNumber = resolveParagraphPageNumber(p.id, pages);
        const leaderChar = tabLeader === 'none' ? ' ' : tabLeader;
        const dotsCount = Math.max(8, 65 - (level * 4) - title.length);
        const dots = leaderChar === ' ' ? ' ' : ` ${leaderChar.repeat(dotsCount)} `;

        entries.push({
          headingId: p.id,
          level,
          title,
          pageNumber,
          dots,
        });
      }
    }
  });

  return entries;
}

/**
 * Generates an automated Inhaltsverzeichnis (TOC) as a series of Paragraph objects.
 */
export function generateTableOfContentsParagraphs(
  paragraphs: readonly Paragraph[],
  pages?: readonly WriterPaginationPage[],
  options?: TocOptions
): Paragraph[] {
  const title = options?.title ?? 'Inhaltsverzeichnis';
  const showPageNumbers = options?.showPageNumbers ?? true;
  const entries = extractTocEntries(paragraphs, pages, options);

  const tocHeading: Paragraph = {
    id: `${TOC_HEADER_PREFIX}-${Date.now()}`,
    style: {
      style_name: 'heading1',
      heading_level: 1,
      alignment: 'left',
      line_height: 1.25,
      space_before: 12,
      space_after: 8,
    },
    spans: [
      {
        text: title,
        bold: true,
        font_size_pt: 18,
      },
    ],
  };

  if (entries.length === 0) {
    const emptyNotice: Paragraph = {
      id: `${TOC_ITEM_PREFIX}empty-${Date.now()}`,
      style: {
        style_name: 'normal',
        alignment: 'left',
        line_height: 1.2,
        space_before: 2,
        space_after: 4,
      },
      spans: [
        {
          text: 'Keine Überschriften im Dokument gefunden.',
          italic: true,
          font_size_pt: 10,
          text_color: '#64748b',
        },
      ],
    };
    return [tocHeading, emptyNotice];
  }

  const tocItems: Paragraph[] = entries.map((entry, idx) => {
    const leftIndentMm = (entry.level - 1) * 6; // 0mm, 6mm, 12mm
    const isMainLevel = entry.level === 1;

    return {
      id: `${TOC_ITEM_PREFIX}${entry.headingId}-${idx}`,
      style: {
        style_name: 'normal',
        alignment: 'left',
        line_height: 1.25,
        space_before: isMainLevel ? 4 : 1,
        space_after: 1,
        left_indent_mm: leftIndentMm,
      },
      spans: [
        {
          text: entry.title,
          bold: isMainLevel,
          font_size_pt: isMainLevel ? 10.5 : 9.5,
          text_color: '#1e293b',
          link: { kind: 'internal' as const, paragraphId: entry.headingId },
        },
        {
          text: entry.dots,
          font_size_pt: 8.5,
          text_color: '#94a3b8',
          link: { kind: 'internal' as const, paragraphId: entry.headingId },
        },
        ...(showPageNumbers
          ? [
              {
                text: `${entry.pageNumber}`,
                bold: isMainLevel,
                font_size_pt: 10,
                text_color: '#2563eb',
                link: { kind: 'internal' as const, paragraphId: entry.headingId },
              },
            ]
          : []),
      ],
    };
  });

  return [tocHeading, ...tocItems];
}

/**
 * Updates an existing TOC in a list of paragraphs or inserts it at index 0.
 */
export function updateOrInsertTableOfContents(
  currentParagraphs: readonly Paragraph[],
  pages?: readonly WriterPaginationPage[],
  options?: TocOptions
): Paragraph[] {
  const newToc = generateTableOfContentsParagraphs(currentParagraphs, pages, options);

  const firstTocIdx = currentParagraphs.findIndex((p) => p.id.startsWith(TOC_HEADER_PREFIX));
  if (firstTocIdx === -1) {
    // Prepend to document
    return [...newToc, ...currentParagraphs];
  }

  // Find end of contiguous TOC items
  let lastTocIdx = firstTocIdx;
  while (
    lastTocIdx + 1 < currentParagraphs.length &&
    currentParagraphs[lastTocIdx + 1].id.startsWith(TOC_ITEM_PREFIX)
  ) {
    lastTocIdx++;
  }

  const before = currentParagraphs.slice(0, firstTocIdx);
  const after = currentParagraphs.slice(lastTocIdx + 1);

  return [...before, ...newToc, ...after];
}
