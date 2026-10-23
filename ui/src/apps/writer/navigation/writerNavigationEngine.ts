// STATUS: DIAMANT VGT SUPREME — Writer Navigation, Go-To & Outline Reorder Domain
import type {
  Paragraph,
  WriterBookmark,
  WriterComment,
  WriterFootnote,
  WriterImageBlockData,
  WriterEquationBlockData,
  WriterSectionDefinition,
  WriterTableBlockData,
} from '../../../shared/contracts/workspace';
import type { WriterPaginationPage } from '../layout/pagination/writerPagination';

export interface WriterOutlineEntry {
  id: string;
  paragraphIndex: number;
  level: number;
  text: string;
}

export type WriterGoToKind = 'page' | 'section' | 'bookmark' | 'footnote' | 'comment' | 'object';
export interface WriterGoToTarget {
  kind: WriterGoToKind;
  id: string;
  label: string;
  paragraphId?: string;
  pageIndex?: number;
  objectId?: string;
}

export function getWriterOutline(paragraphs: readonly Paragraph[]): WriterOutlineEntry[] {
  return paragraphs.flatMap((paragraph, paragraphIndex) => {
    const level = paragraph.style.heading_level ?? 0;
    const text = paragraph.spans.map((span) => span.text).join('').trim();
    return level > 0 && text ? [{ id: paragraph.id, paragraphIndex, level, text }] : [];
  });
}

export function reorderWriterOutlineBlock(
  paragraphs: readonly Paragraph[],
  sourceHeadingId: string,
  targetHeadingId: string,
): Paragraph[] {
  if (sourceHeadingId === targetHeadingId) return [...paragraphs];
  const outline = getWriterOutline(paragraphs);
  const source = outline.find((entry) => entry.id === sourceHeadingId);
  const target = outline.find((entry) => entry.id === targetHeadingId);
  if (!source || !target) throw new Error('Outline target does not exist.');

  let sourceEnd = paragraphs.length;
  for (const entry of outline) {
    if (entry.paragraphIndex > source.paragraphIndex && entry.level <= source.level) {
      sourceEnd = entry.paragraphIndex;
      break;
    }
  }
  const block = paragraphs.slice(source.paragraphIndex, sourceEnd);
  const blockIds = new Set(block.map((paragraph) => paragraph.id));
  if (blockIds.has(targetHeadingId)) return [...paragraphs];
  const without = paragraphs.filter((paragraph) => !blockIds.has(paragraph.id));
  const targetIndex = without.findIndex((paragraph) => paragraph.id === targetHeadingId);
  if (targetIndex < 0) throw new Error('Outline target disappeared during reorder.');
  const next = [...without];
  next.splice(targetIndex, 0, ...block);
  return next;
}

export function buildWriterGoToTargets(input: {
  pages: readonly WriterPaginationPage[];
  sections: readonly WriterSectionDefinition[];
  bookmarks: readonly WriterBookmark[];
  footnotes: readonly WriterFootnote[];
  comments: readonly WriterComment[];
  tables: readonly WriterTableBlockData[];
  images: readonly WriterImageBlockData[];
  equations: readonly WriterEquationBlockData[];
}): WriterGoToTarget[] {
  const targets: WriterGoToTarget[] = [];
  for (const page of input.pages) {
    targets.push({ kind: 'page', id: page.id, label: `Seite ${page.displayPageNumberString ?? page.displayPageNumber}`, pageIndex: page.pageIndex, paragraphId: page.paragraphs[0]?.id });
  }
  for (const section of input.sections) targets.push({ kind: 'section', id: section.id, label: section.id, paragraphId: section.startParagraphId });
  for (const bookmark of input.bookmarks) targets.push({ kind: 'bookmark', id: bookmark.id, label: bookmark.name, paragraphId: bookmark.paragraphId });
  for (const footnote of input.footnotes) targets.push({ kind: 'footnote', id: footnote.id, label: `Fußnote ${footnote.number}`, paragraphId: footnote.referenceParagraphId });
  for (const comment of input.comments) targets.push({ kind: 'comment', id: comment.id, label: `${comment.author}: ${comment.text.slice(0, 48)}`, paragraphId: comment.paragraphId });
  for (const table of input.tables) targets.push({ kind: 'object', id: `table:${table.id}`, label: `Tabelle: ${table.caption ?? table.id}`, paragraphId: table.anchorParagraphId, objectId: table.id });
  for (const image of input.images) targets.push({ kind: 'object', id: `image:${image.id}`, label: `Bild: ${image.caption ?? image.name}`, paragraphId: image.anchorParagraphId, objectId: image.id });
  for (const equation of input.equations) targets.push({ kind: 'object', id: `equation:${equation.id}`, label: `Formel: ${equation.caption ?? equation.id}`, paragraphId: equation.anchorParagraphId, objectId: equation.id });
  return targets;
}
