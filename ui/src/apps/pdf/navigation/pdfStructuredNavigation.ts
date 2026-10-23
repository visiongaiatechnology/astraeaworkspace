// STATUS: DIAMANT VGT SUPREME
// Shared structured-PDF bookmark/outlines model used by export and split operations.

import type { PdfDocumentModel, PdfPageModel } from '../../../shared/contracts/workspace';
import { pdfUnicodeTextString } from '../../../platform/interop/pdf/pdfTextStrings';

const MAX_BOOKMARKS = 4096;
const MAX_BOOKMARK_TITLE = 512;

export interface PdfStructuredBookmark {
  pageNumber: number;
  title: string;
}

const cleanTitle = (value: string): string =>
  value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_BOOKMARK_TITLE);

export function structuredPdfBookmarks(model: PdfDocumentModel): PdfStructuredBookmark[] {
  const pages = [...model.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const bookmarks: PdfStructuredBookmark[] = [];
  for (const page of pages) {
    const heading = page.sections.find((section) => section.type === 'header' && cleanTitle(section.content));
    if (!heading) continue;
    bookmarks.push({ pageNumber: page.pageNumber, title: cleanTitle(heading.content) });
    if (bookmarks.length > MAX_BOOKMARKS) throw new Error(`Structured PDF exceeds the ${MAX_BOOKMARKS}-bookmark policy.`);
  }
  return bookmarks;
}


/**
 * Appends a flat ISO 32000 outline tree and returns its root object id.
 * The caller owns the object allocator so xref numbering stays canonical.
 */
export function appendStructuredPdfOutlines(
  model: PdfDocumentModel,
  sourcePages: readonly PdfPageModel[],
  pageIds: readonly number[],
  addObject: (body: string) => number,
  objects: string[],
): number {
  const bookmarks = structuredPdfBookmarks(model);
  if (!bookmarks.length) return 0;
  const pageIdByNumber = new Map<number, number>();
  sourcePages.forEach((page, index) => {
    const pageId = pageIds[index];
    if (pageId) pageIdByNumber.set(page.pageNumber, pageId);
  });
  const resolved = bookmarks
    .map((bookmark) => ({ ...bookmark, pageId: pageIdByNumber.get(bookmark.pageNumber) }))
    .filter((bookmark): bookmark is PdfStructuredBookmark & { pageId: number } => Boolean(bookmark.pageId));
  if (!resolved.length) return 0;

  const rootId = addObject('');
  const itemIds = resolved.map(() => addObject(''));
  objects[rootId - 1] = `<< /Type /Outlines /First ${itemIds[0]} 0 R /Last ${itemIds[itemIds.length - 1]} 0 R /Count ${itemIds.length} >>`;
  resolved.forEach((bookmark, index) => {
    const prev = index > 0 ? ` /Prev ${itemIds[index - 1]} 0 R` : '';
    const next = index + 1 < itemIds.length ? ` /Next ${itemIds[index + 1]} 0 R` : '';
    objects[itemIds[index] - 1] = `<< /Title ${pdfUnicodeTextString(bookmark.title)} /Parent ${rootId} 0 R /Dest [${bookmark.pageId} 0 R /Fit]${prev}${next} >>`;
  });
  return rootId;
}
