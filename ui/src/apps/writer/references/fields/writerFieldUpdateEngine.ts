// STATUS: DIAMANT VGT SUPREME — Sovereign Global Field Update Engine (F9 Key)
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type {
  BookmarkItem,
  FootnoteItem,
  ImageBlockData,
  TableBlockData,
  WriterIndexEntry,
} from '../../types';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import {
  TOC_HEADER_PREFIX,
  TOC_ITEM_PREFIX,
  generateTableOfContentsParagraphs,
} from '../toc/writerTocEngine';
import {
  TOF_HEADER_PREFIX,
  TOT_HEADER_PREFIX,
  INDEX_HEADER_PREFIX,
  generateTableOfFiguresParagraphs,
  generateTableOfTablesParagraphs,
  generateSubjectIndexParagraphs,
} from '../indexes/writerSpecialIndexesEngine';
import { recalculateNotes } from '../notes/writerNotesEngine';
import {
  extractCrossReferenceTargets,
  CrossReferenceContext,
} from '../cross-references/writerCrossReferenceEngine';

export interface FieldUpdateSummary {
  tocsUpdated: number;
  figuresUpdated: number;
  tablesUpdated: number;
  indexesUpdated: number;
  crossRefsUpdated: number;
  notesUpdated: number;
  totalUpdated: number;
  message: string;
}

export interface DocumentFieldContext {
  paragraphs: readonly Paragraph[];
  footnotes: readonly FootnoteItem[];
  bookmarks: readonly BookmarkItem[];
  tables: readonly TableBlockData[];
  images: readonly ImageBlockData[];
  indexEntries?: readonly WriterIndexEntry[];
  pages?: readonly WriterPaginationPage[];
}

export interface FieldUpdateResult {
  updatedParagraphs: Paragraph[];
  updatedFootnotes: FootnoteItem[];
  summary: FieldUpdateSummary;
}

/**
 * Re-evaluates and refreshes all dynamic fields, tables of content, special directories,
 * cross-references, and footnotes/endnotes across the document.
 */
export function updateAllDocumentFields(ctx: DocumentFieldContext): FieldUpdateResult {
  let paragraphs = [...ctx.paragraphs];
  let tocsUpdated = 0;
  let figuresUpdated = 0;
  let tablesUpdated = 0;
  let indexesUpdated = 0;
  let crossRefsUpdated = 0;

  // 1. Update Notes (Footnotes and Endnotes)
  const { footnotes: fns, endnotes: ens } = recalculateNotes(paragraphs, ctx.footnotes);
  const updatedFootnotes: FootnoteItem[] = [
    ...fns.map((f) => f.note),
    ...ens.map((e) => e.note),
  ];
  const notesUpdated = updatedFootnotes.length;

  // Context for cross-references with fresh notes
  const crossRefCtx: CrossReferenceContext = {
    paragraphs,
    bookmarks: ctx.bookmarks,
    footnotes: updatedFootnotes,
    tables: ctx.tables,
    images: ctx.images,
    pages: ctx.pages,
  };
  const refTargets = extractCrossReferenceTargets(crossRefCtx);

  // 2. Scan and update cross-reference spans in all paragraphs
  paragraphs = paragraphs.map((p) => {
    // Skip index and directory blocks themselves
    if (
      p.id.startsWith(TOC_HEADER_PREFIX) ||
      p.id.startsWith(TOC_ITEM_PREFIX) ||
      p.id.startsWith(TOF_HEADER_PREFIX) ||
      p.id.startsWith(TOT_HEADER_PREFIX) ||
      p.id.startsWith(INDEX_HEADER_PREFIX)
    ) {
      return p;
    }

    let modified = false;
    const newSpans = p.spans.map((span) => {
      // Check for bracketed cross-ref patterns like [Siehe „Titel“, S. X] or [Siehe Abbildung 1, S. 2]
      const regex = /\[Siehe\s+([^,]+),\s+S\.\s*(\d+)\]/i;
      const match = span.text.match(regex);
      if (match) {
        const rawTargetTitle = match[1].replace(/[„“"]/g, '').trim();
        const target = refTargets.find(
          (t) =>
            t.title.toLowerCase() === rawTargetTitle.toLowerCase() ||
            t.label.toLowerCase() === rawTargetTitle.toLowerCase()
        );
        if (target && target.pageNumber !== Number(match[2])) {
          modified = true;
          crossRefsUpdated++;
          const replacement = `[Siehe ${target.label}, S. ${target.pageNumber}]`;
          return {
            ...span,
            text: span.text.replace(regex, replacement),
          };
        }
      }
      return span;
    });

    return modified ? { ...p, spans: newSpans } : p;
  });

  // 3. Update Table of Contents (TOC) if present
  const tocHeaderIdx = paragraphs.findIndex((p) => p.id.startsWith(TOC_HEADER_PREFIX));
  if (tocHeaderIdx !== -1) {
    let lastTocIdx = tocHeaderIdx;
    while (
      lastTocIdx + 1 < paragraphs.length &&
      paragraphs[lastTocIdx + 1].id.startsWith(TOC_ITEM_PREFIX)
    ) {
      lastTocIdx++;
    }
    const freshToc = generateTableOfContentsParagraphs(paragraphs, ctx.pages);
    paragraphs = [
      ...paragraphs.slice(0, tocHeaderIdx),
      ...freshToc,
      ...paragraphs.slice(lastTocIdx + 1),
    ];
    tocsUpdated = 1;
  }

  // 4. Update Table of Figures (TOF) if present
  const tofHeaderIdx = paragraphs.findIndex((p) => p.id.startsWith(TOF_HEADER_PREFIX));
  if (tofHeaderIdx !== -1) {
    let lastTofIdx = tofHeaderIdx;
    while (
      lastTofIdx + 1 < paragraphs.length &&
      paragraphs[lastTofIdx + 1].id.startsWith('tof-item-')
    ) {
      lastTofIdx++;
    }
    const freshTof = generateTableOfFiguresParagraphs(ctx.images, ctx.pages);
    paragraphs = [
      ...paragraphs.slice(0, tofHeaderIdx),
      ...freshTof,
      ...paragraphs.slice(lastTofIdx + 1),
    ];
    figuresUpdated = 1;
  }

  // 5. Update Table of Tables (TOT) if present
  const totHeaderIdx = paragraphs.findIndex((p) => p.id.startsWith(TOT_HEADER_PREFIX));
  if (totHeaderIdx !== -1) {
    let lastTotIdx = totHeaderIdx;
    while (
      lastTotIdx + 1 < paragraphs.length &&
      paragraphs[lastTotIdx + 1].id.startsWith('tot-item-')
    ) {
      lastTotIdx++;
    }
    const freshTot = generateTableOfTablesParagraphs(ctx.tables, ctx.pages);
    paragraphs = [
      ...paragraphs.slice(0, totHeaderIdx),
      ...freshTot,
      ...paragraphs.slice(lastTotIdx + 1),
    ];
    tablesUpdated = 1;
  }

  // 6. Update Subject Index if present
  const indexHeaderIdx = paragraphs.findIndex((p) => p.id.startsWith(INDEX_HEADER_PREFIX));
  if (indexHeaderIdx !== -1) {
    let lastIndexIdx = indexHeaderIdx;
    while (
      lastIndexIdx + 1 < paragraphs.length &&
      (paragraphs[lastIndexIdx + 1].id.startsWith('index-letter-') ||
        paragraphs[lastIndexIdx + 1].id.startsWith('index-entry-') ||
        paragraphs[lastIndexIdx + 1].id.startsWith('index-sub-'))
    ) {
      lastIndexIdx++;
    }
    const freshIndex = generateSubjectIndexParagraphs(ctx.indexEntries ?? []);
    paragraphs = [
      ...paragraphs.slice(0, indexHeaderIdx),
      ...freshIndex,
      ...paragraphs.slice(lastIndexIdx + 1),
    ];
    indexesUpdated = 1;
  }

  const totalUpdated =
    tocsUpdated + figuresUpdated + tablesUpdated + indexesUpdated + crossRefsUpdated + notesUpdated;

  const summary: FieldUpdateSummary = {
    tocsUpdated,
    figuresUpdated,
    tablesUpdated,
    indexesUpdated,
    crossRefsUpdated,
    notesUpdated,
    totalUpdated,
    message:
      totalUpdated > 0
        ? `F9: ${totalUpdated} Felder & Verzeichnisse erfolgreich aktualisiert.`
        : 'F9: Alle dynamischen Felder sind bereits auf dem neuesten Stand.',
  };

  return {
    updatedParagraphs: paragraphs,
    updatedFootnotes,
    summary,
  };
}
