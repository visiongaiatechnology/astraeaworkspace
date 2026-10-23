// STATUS: DIAMANT VGT SUPREME — Sovereign Cross-Reference Resolution Engine
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type {
  BookmarkItem,
  FootnoteItem,
  ImageBlockData,
  TableBlockData,
  WriterCrossReferenceField,
} from '../../types';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import { resolveParagraphPageNumber } from '../toc/writerTocEngine';
import { recalculateNotes } from '../notes/writerNotesEngine';

export interface CrossReferenceTarget {
  id: string;
  type: 'heading' | 'bookmark' | 'footnote' | 'endnote' | 'figure' | 'table';
  title: string;
  subtitle: string;
  pageNumber: number;
  label: string;
}

export interface CrossReferenceContext {
  paragraphs: readonly Paragraph[];
  bookmarks: readonly BookmarkItem[];
  footnotes: readonly FootnoteItem[];
  tables: readonly TableBlockData[];
  images: readonly ImageBlockData[];
  pages?: readonly WriterPaginationPage[];
}

/**
 * Extracts all valid cross-reference targets across headings, bookmarks, notes, tables, and figures.
 */
export function extractCrossReferenceTargets(
  ctx: CrossReferenceContext
): CrossReferenceTarget[] {
  const targets: CrossReferenceTarget[] = [];

  // 1. Headings
  ctx.paragraphs.forEach((p) => {
    const level = p.style.heading_level || 0;
    if (level > 0) {
      const text = p.spans.map((s) => s.text).join('').trim();
      if (text) {
        const pageNumber = resolveParagraphPageNumber(p.id, ctx.pages);
        targets.push({
          id: p.id,
          type: 'heading',
          title: text,
          subtitle: `Überschrift Ebene ${level}`,
          pageNumber,
          label: `Abschnitt „${text}“`,
        });
      }
    }
  });

  // 2. Bookmarks
  ctx.bookmarks.forEach((b) => {
    const pageNumber = resolveParagraphPageNumber(b.paragraphId, ctx.pages);
    targets.push({
      id: b.id,
      type: 'bookmark',
      title: b.name,
      subtitle: 'Textmarke',
      pageNumber,
      label: `Textmarke „${b.name}“`,
    });
  });

  // 3. Footnotes & Endnotes
  const { footnotes, endnotes } = recalculateNotes(ctx.paragraphs, ctx.footnotes);
  footnotes.forEach((fn) => {
    const pageNumber = resolveParagraphPageNumber(fn.note.referenceParagraphId, ctx.pages);
    const snippet = fn.note.text.length > 35 ? `${fn.note.text.slice(0, 35)}...` : fn.note.text;
    targets.push({
      id: fn.note.id,
      type: 'footnote',
      title: `Fußnote [${fn.displayNumber}]`,
      subtitle: snippet,
      pageNumber,
      label: `Fußnote ${fn.displayNumber}`,
    });
  });

  endnotes.forEach((en) => {
    const pageNumber = resolveParagraphPageNumber(en.note.referenceParagraphId, ctx.pages);
    const snippet = en.note.text.length > 35 ? `${en.note.text.slice(0, 35)}...` : en.note.text;
    targets.push({
      id: en.note.id,
      type: 'endnote',
      title: `Endnote [${en.displayNumber}]`,
      subtitle: snippet,
      pageNumber,
      label: `Endnote ${en.displayNumber}`,
    });
  });

  // 4. Tables
  ctx.tables.forEach((t, idx) => {
    const tableNum = idx + 1;
    const title = `Tabelle ${tableNum}`;
    let pageNumber = 1;
    if (ctx.pages && ctx.pages.length > 0) {
      for (const page of ctx.pages) {
        if (page.tableFragments?.some((tf) => tf.tableId === t.id)) {
          pageNumber = page.displayPageNumber ?? (page.pageIndex + 1);
          break;
        }
      }
    }
    targets.push({
      id: t.id,
      type: 'table',
      title,
      subtitle: `${t.columns.join(', ').slice(0, 30)}...`,
      pageNumber,
      label: title,
    });
  });

  // 5. Figures / Images
  ctx.images.forEach((img, idx) => {
    const figNum = idx + 1;
    const caption = img.caption
      ? img.caption.replace(/^Abbildung\s*\d+\s*:\s*/i, '').trim()
      : img.name;
    const label = `Abbildung ${figNum}`;
    const pageNumber = resolveParagraphPageNumber(img.anchorParagraphId || '', ctx.pages);
    targets.push({
      id: img.id,
      type: 'figure',
      title: `${label}: ${caption}`,
      subtitle: img.name,
      pageNumber,
      label,
    });
  });

  return targets;
}

/**
 * Resolves the display string of a cross-reference field.
 */
export function resolveCrossReferenceText(
  field: WriterCrossReferenceField,
  ctx: CrossReferenceContext
): string {
  const targets = extractCrossReferenceTargets(ctx);
  const target = targets.find((t) => t.id === field.targetId);

  if (!target) {
    return '[Fehler: Querverweisziel nicht gefunden]';
  }

  switch (field.format) {
    case 'text':
      return target.label;
    case 'page':
      return `Seite ${target.pageNumber}`;
    case 'text_and_page':
      return `${target.label} auf Seite ${target.pageNumber}`;
    case 'full':
    default:
      return `[Siehe ${target.label}, S. ${target.pageNumber}]`;
  }
}
