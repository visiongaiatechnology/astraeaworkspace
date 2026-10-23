// STATUS: DIAMANT VGT SUPREME — Sovereign Special Indexes Engine (Figures, Tables, Subject Index)
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type {
  ImageBlockData,
  TableBlockData,
  WriterIndexEntry,
  WriterTableIndexItem,
} from '../../types';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import { generateTableOfFigures } from '../../media/images/operations/writerMediaOperations';

export const TOF_HEADER_PREFIX = 'tof-header-block';
export const TOT_HEADER_PREFIX = 'tot-header-block';
export const INDEX_HEADER_PREFIX = 'index-header-block';

/**
 * Generates an automated Table of Figures (Abbildungsverzeichnis) as Paragraphs.
 */
export function generateTableOfFiguresParagraphs(
  images: readonly ImageBlockData[],
  pages?: readonly WriterPaginationPage[]
): Paragraph[] {
  const figureItems = generateTableOfFigures(images, pages);

  const headingPar: Paragraph = {
    id: `${TOF_HEADER_PREFIX}-${Date.now()}`,
    style: {
      style_name: 'heading1',
      heading_level: 1,
      alignment: 'left',
      line_height: 1.25,
      space_before: 12,
      space_after: 6,
    },
    spans: [{ text: 'Abbildungsverzeichnis', bold: true, font_size_pt: 16 }],
  };

  if (figureItems.length === 0) {
    return [
      headingPar,
      {
        id: `tof-empty-${Date.now()}`,
        style: {
          style_name: 'normal',
          alignment: 'left',
          line_height: 1.2,
          space_before: 2,
          space_after: 4,
        },
        spans: [
          {
            text: 'Keine Abbildungen im Dokument vorhanden.',
            italic: true,
            font_size_pt: 10,
            text_color: '#64748b',
          },
        ],
      },
    ];
  }

  const items: Paragraph[] = figureItems.map((item, idx) => {
    const dotsCount = Math.max(8, 65 - item.label.length - item.caption.length);
    const dots = ` ${'.'.repeat(dotsCount)} `;

    return {
      id: `tof-item-${item.id}-${idx}`,
      style: {
        style_name: 'normal',
        alignment: 'left',
        line_height: 1.2,
        space_before: 2,
        space_after: 2,
      },
      spans: [
        { text: `${item.label}: `, bold: true, font_size_pt: 10 },
        { text: `${item.caption} `, font_size_pt: 10 },
        { text: dots, font_size_pt: 8.5, text_color: '#94a3b8' },
        { text: `S. ${item.pageNumber}`, bold: true, font_size_pt: 10, text_color: '#2563eb' },
      ],
    };
  });

  return [headingPar, ...items];
}

/**
 * Extracts and generates Table of Tables (Tabellenverzeichnis) items.
 */
export function extractTableIndexItems(
  tables: readonly TableBlockData[],
  pages?: readonly WriterPaginationPage[]
): WriterTableIndexItem[] {
  return tables.map((t, idx) => {
    const tableNum = idx + 1;
    const label = `Tabelle ${tableNum}`;
    const colSummary = t.columns.filter(Boolean).slice(0, 3).join(', ');
    const title = colSummary ? `(${colSummary})` : 'Datentabelle';

    let pageNumber = 1;
    if (pages && pages.length > 0) {
      for (const page of pages) {
        if (page.tableFragments?.some((tf) => tf.tableId === t.id)) {
          pageNumber = page.displayPageNumber ?? (page.pageIndex + 1);
          break;
        }
      }
    }

    return { id: t.id, label, title, pageNumber };
  });
}

/**
 * Generates an automated Table of Tables (Tabellenverzeichnis) as Paragraphs.
 */
export function generateTableOfTablesParagraphs(
  tables: readonly TableBlockData[],
  pages?: readonly WriterPaginationPage[]
): Paragraph[] {
  const tableItems = extractTableIndexItems(tables, pages);

  const headingPar: Paragraph = {
    id: `${TOT_HEADER_PREFIX}-${Date.now()}`,
    style: {
      style_name: 'heading1',
      heading_level: 1,
      alignment: 'left',
      line_height: 1.25,
      space_before: 12,
      space_after: 6,
    },
    spans: [{ text: 'Tabellenverzeichnis', bold: true, font_size_pt: 16 }],
  };

  if (tableItems.length === 0) {
    return [
      headingPar,
      {
        id: `tot-empty-${Date.now()}`,
        style: {
          style_name: 'normal',
          alignment: 'left',
          line_height: 1.2,
          space_before: 2,
          space_after: 4,
        },
        spans: [
          {
            text: 'Keine Tabellen im Dokument vorhanden.',
            italic: true,
            font_size_pt: 10,
            text_color: '#64748b',
          },
        ],
      },
    ];
  }

  const items: Paragraph[] = tableItems.map((item, idx) => {
    const dotsCount = Math.max(8, 65 - item.label.length - item.title.length);
    const dots = ` ${'.'.repeat(dotsCount)} `;

    return {
      id: `tot-item-${item.id}-${idx}`,
      style: {
        style_name: 'normal',
        alignment: 'left',
        line_height: 1.2,
        space_before: 2,
        space_after: 2,
      },
      spans: [
        { text: `${item.label}: `, bold: true, font_size_pt: 10 },
        { text: `${item.title} `, font_size_pt: 10 },
        { text: dots, font_size_pt: 8.5, text_color: '#94a3b8' },
        { text: `S. ${item.pageNumber}`, bold: true, font_size_pt: 10, text_color: '#2563eb' },
      ],
    };
  });

  return [headingPar, ...items];
}

/**
 * Generates an automated A–Z Subject Index (Stichwortverzeichnis mit Untereinträgen).
 */
export function generateSubjectIndexParagraphs(
  indexEntries: readonly WriterIndexEntry[]
): Paragraph[] {
  const headingPar: Paragraph = {
    id: `${INDEX_HEADER_PREFIX}-${Date.now()}`,
    style: {
      style_name: 'heading1',
      heading_level: 1,
      alignment: 'left',
      line_height: 1.25,
      space_before: 14,
      space_after: 8,
    },
    spans: [{ text: 'Stichwortverzeichnis', bold: true, font_size_pt: 18 }],
  };

  if (!indexEntries || indexEntries.length === 0) {
    return [
      headingPar,
      {
        id: `index-empty-${Date.now()}`,
        style: {
          style_name: 'normal',
          alignment: 'left',
          line_height: 1.2,
          space_before: 2,
          space_after: 4,
        },
        spans: [
          {
            text: 'Keine Indexeinträge im Dokument festgelegt.',
            italic: true,
            font_size_pt: 10,
            text_color: '#64748b',
          },
        ],
      },
    ];
  }

  // Sort entries alphabetically
  const sorted = [...indexEntries].sort((a, b) => a.term.localeCompare(b.term, 'de-DE'));

  // Group by first letter
  const groups = new Map<string, WriterIndexEntry[]>();
  sorted.forEach((item) => {
    const firstLetter = (item.term[0] || '#').toUpperCase();
    if (!groups.has(firstLetter)) {
      groups.set(firstLetter, []);
    }
    groups.get(firstLetter)!.push(item);
  });

  const result: Paragraph[] = [headingPar];

  // For each group, create group header + items
  const sortedLetters = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'de-DE'));

  for (const letter of sortedLetters) {
    const letterHeading: Paragraph = {
      id: `index-letter-${letter}-${Date.now()}`,
      style: {
        style_name: 'heading2',
        heading_level: 2,
        alignment: 'left',
        line_height: 1.2,
        space_before: 8,
        space_after: 2,
      },
      spans: [{ text: letter, bold: true, font_size_pt: 13, text_color: '#2563eb' }],
    };
    result.push(letterHeading);

    const items = groups.get(letter)!;
    items.forEach((entry, idx) => {
      const pagesStr = entry.pageNumbers.length > 0 ? entry.pageNumbers.join(', ') : '1';
      const mainPar: Paragraph = {
        id: `index-entry-${entry.id}-${idx}`,
        style: {
          style_name: 'normal',
          alignment: 'left',
          line_height: 1.2,
          space_before: 1,
          space_after: 1,
          left_indent_mm: 3,
        },
        spans: [
          { text: entry.term, bold: true, font_size_pt: 10 },
          { text: ` ........................ `, font_size_pt: 8.5, text_color: '#94a3b8' },
          { text: pagesStr, font_size_pt: 10, text_color: '#1e293b' },
        ],
      };
      result.push(mainPar);

      // Subentries
      if (entry.subEntries && entry.subEntries.length > 0) {
        entry.subEntries.forEach((sub: import('../../types').WriterIndexSubEntry, subIdx: number) => {
          const subPagesStr = sub.pageNumbers.length > 0 ? sub.pageNumbers.join(', ') : '1';
          result.push({
            id: `index-sub-${entry.id}-${subIdx}`,
            style: {
              style_name: 'normal',
              alignment: 'left',
              line_height: 1.2,
              space_before: 1,
              space_after: 1,
              left_indent_mm: 8,
            },
            spans: [
              { text: `${sub.subTerm}: `, font_size_pt: 9.5, italic: true },
              { text: subPagesStr, font_size_pt: 9.5, text_color: '#475569' },
            ],
          });
        });
      }
    });
  }

  return result;
}
