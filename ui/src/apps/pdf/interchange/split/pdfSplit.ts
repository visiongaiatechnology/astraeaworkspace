// STATUS: DIAMANT VGT SUPREME
// Bounded structured-PDF splitter. Native/raw PDFs remain fail-closed until the standards parser is available.

import type { PdfDocumentModel } from '../../../../shared/contracts/workspace';
import { extractPdfPages } from '../../pages/pdfPageOps';
import { structuredPdfBookmarks } from '../../navigation/pdfStructuredNavigation';
import { buildStructuredPdfBytes } from '../structuredPdfExport';
import { deliverExportBytes, isExportDeliveryAbort } from '../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../platform/rendering/documentPdfExport';

const MAX_SPLIT_PARTS = 512;
const MAX_FILESIZE_SPLIT_PAGES = 2000;
const MAX_SERIALIZATION_ATTEMPTS = 4096;
const MIN_TARGET_BYTES = 16 * 1024;
const MAX_TARGET_BYTES = 256 * 1024 * 1024;

export type PdfSplitMode = 'pages' | 'bookmarks' | 'file-size';

export interface PdfSplitRequest {
  mode: PdfSplitMode;
  pagesPerPart?: number;
  maxBytesPerPart?: number;
}

export interface PdfSplitArtifact {
  fileName: string;
  title: string;
  sourcePages: number[];
  model: PdfDocumentModel;
  bytes: Uint8Array;
}

function assertStructured(model: PdfDocumentModel): void {
  if (model.rawPdfDataUrl) throw new Error('Native/raw PDF splitting requires the standards parser; structured split is fail-closed.');
  if (!model.pages.length) throw new Error('Cannot split an empty PDF.');
  if (model.pages.length > 10_000) throw new Error('PDF exceeds the 10,000-page split policy.');
}

function safeStem(input: string): string {
  return (input || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'document';
}

function sequence(start: number, end: number): number[] {
  const out: number[] = [];
  for (let page = start; page <= end; page += 1) out.push(page);
  return out;
}

function createArtifact(model: PdfDocumentModel, documentTitle: string, pages: number[], index: number, label?: string): PdfSplitArtifact {
  const extracted = extractPdfPages(model, pages);
  const partTitle = `${documentTitle || 'Document'} - ${label || `Part ${index + 1}`}`.slice(0, 512);
  const bytes = buildStructuredPdfBytes(partTitle, extracted, { taggedStructure: true });
  return {
    fileName: `${safeStem(documentTitle)}_part_${String(index + 1).padStart(3, '0')}.pdf`,
    title: partTitle,
    sourcePages: [...pages],
    model: extracted,
    bytes,
  };
}

function assertPartCount(count: number): void {
  if (count < 1 || count > MAX_SPLIT_PARTS) throw new Error(`Split would produce ${count} parts; policy allows 1-${MAX_SPLIT_PARTS}.`);
}

function splitByPageCount(model: PdfDocumentModel, title: string, pagesPerPartInput: number | undefined): PdfSplitArtifact[] {
  const pagesPerPart = Math.trunc(pagesPerPartInput ?? 1);
  if (!Number.isInteger(pagesPerPart) || pagesPerPart < 1 || pagesPerPart > 1000) throw new Error('Pages per split part must be between 1 and 1000.');
  const partCount = Math.ceil(model.pages.length / pagesPerPart);
  assertPartCount(partCount);
  const artifacts: PdfSplitArtifact[] = [];
  for (let start = 1; start <= model.pages.length; start += pagesPerPart) {
    const end = Math.min(model.pages.length, start + pagesPerPart - 1);
    artifacts.push(createArtifact(model, title, sequence(start, end), artifacts.length, `Pages ${start}-${end}`));
  }
  return artifacts;
}

function splitByBookmarks(model: PdfDocumentModel, title: string): PdfSplitArtifact[] {
  const bookmarkPages = [...new Set(structuredPdfBookmarks(model).map((bookmark) => bookmark.pageNumber))].sort((a, b) => a - b);
  if (bookmarkPages.length < 2) throw new Error('Bookmark split requires at least two structured header bookmarks.');
  const boundaries = bookmarkPages[0] === 1 ? bookmarkPages : [1, ...bookmarkPages];
  assertPartCount(boundaries.length);
  const bookmarks = new Map(structuredPdfBookmarks(model).map((bookmark) => [bookmark.pageNumber, bookmark.title]));
  return boundaries.map((start, index) => {
    const end = index + 1 < boundaries.length ? boundaries[index + 1] - 1 : model.pages.length;
    const label = bookmarks.get(start) || (start === 1 ? 'Front matter' : `Pages ${start}-${end}`);
    return createArtifact(model, title, sequence(start, end), index, label);
  });
}

function splitByFileSize(model: PdfDocumentModel, title: string, maxBytesInput: number | undefined): PdfSplitArtifact[] {
  if (model.pages.length > MAX_FILESIZE_SPLIT_PAGES) throw new Error(`File-size split is limited to ${MAX_FILESIZE_SPLIT_PAGES} pages per operation.`);
  const maxBytes = Math.trunc(maxBytesInput ?? 4 * 1024 * 1024);
  if (!Number.isFinite(maxBytes) || maxBytes < MIN_TARGET_BYTES || maxBytes > MAX_TARGET_BYTES) {
    throw new Error(`Target part size must be between ${MIN_TARGET_BYTES} and ${MAX_TARGET_BYTES} bytes.`);
  }
  const artifacts: PdfSplitArtifact[] = [];
  let start = 1;
  let attempts = 0;
  while (start <= model.pages.length) {
    if (artifacts.length >= MAX_SPLIT_PARTS) throw new Error(`Split exceeds the ${MAX_SPLIT_PARTS}-part policy.`);
    let best: PdfSplitArtifact | null = null;
    for (let end = start; end <= model.pages.length; end += 1) {
      attempts += 1;
      if (attempts > MAX_SERIALIZATION_ATTEMPTS) throw new Error('File-size split exceeded the serialization-attempt budget.');
      let candidate: PdfSplitArtifact;
      try {
        candidate = createArtifact(model, title, sequence(start, end), artifacts.length, `Pages ${start}-${end}`);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (message.includes('form') || message.includes('dependenc')) continue;
        throw cause;
      }
      if (candidate.bytes.byteLength <= maxBytes) {
        best = candidate;
        continue;
      }
      if (best) break;
      throw new Error(`Page/dependency group beginning at page ${start} exceeds the requested part-size limit.`);
    }
    if (!best) throw new Error(`Unable to create a dependency-closed split part beginning at page ${start}.`);
    artifacts.push(best);
    start = best.sourcePages[best.sourcePages.length - 1] + 1;
  }
  return artifacts;
}

export function splitStructuredPdf(model: PdfDocumentModel, documentTitle: string, request: PdfSplitRequest): PdfSplitArtifact[] {
  assertStructured(model);
  if (request.mode === 'pages') return splitByPageCount(model, documentTitle, request.pagesPerPart);
  if (request.mode === 'bookmarks') return splitByBookmarks(model, documentTitle);
  if (request.mode === 'file-size') return splitByFileSize(model, documentTitle, request.maxBytesPerPart);
  throw new Error('Unsupported PDF split mode.');
}

export interface PdfSplitDeliveryResult {
  /** Number of parts the user actually saved/downloaded before an abort. */
  readonly written: number;
  readonly total: number;
  readonly mode: 'file' | 'download';
  readonly cancelled: boolean;
  readonly fileName: string | null;
}

/**
 * Delivers the split parts one by one.
 *
 * Release Beta 0.1: each part goes through the native save dialog + atomic export on the desktop. If
 * the user cancels the first or an intermediate dialog the remaining dialogs are **not** opened; the
 * caller reports "N of M saved, no further files written" instead of claiming a complete split.
 */
export async function downloadPdfSplitArtifacts(artifacts: readonly PdfSplitArtifact[]): Promise<PdfSplitDeliveryResult> {
  if (!artifacts.length) throw new Error('No split artifacts to download.');
  const written: string[] = [];
  let mode: 'file' | 'download' = 'file';
  for (const artifact of artifacts) {
    try {
      const delivery = await deliverExportBytes(artifact.bytes, {
        suggestedName: artifact.fileName,
        extensions: ['pdf'],
        mimeType: 'application/pdf',
        assertArtifact: assertPdfExportArtifact,
      });
      written.push(delivery.fileName);
      mode = delivery.mode;
    } catch (error) {
      if (isExportDeliveryAbort(error)) {
        return { written: written.length, total: artifacts.length, mode, cancelled: true, fileName: written.at(-1) ?? null };
      }
      throw error;
    }
  }
  return { written: written.length, total: artifacts.length, mode, cancelled: false, fileName: written.at(-1) ?? null };
}
