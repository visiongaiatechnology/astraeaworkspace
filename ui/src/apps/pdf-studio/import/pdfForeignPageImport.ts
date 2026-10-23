// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — hostile foreign PDF/image/scanner page import via deterministic local raster flattening.

import type { PdfDocumentModel } from '../../../shared/contracts/workspace';
import { PDF_WORKSPACE_IMPORT_LIMITS } from '../../../platform/interop/pdfWorkspaceImport';
import { createPdfModelFromNormalizedJpegs, normalizeLocalImageFiles, type PdfNormalizedJpegSource } from '../../pdf/media/import/pdfImageImport';
import { insertStructuredPdfPages } from '../../pdf/pages/pdfPageOps';
import { openPdfJsDisplayDocument } from '../../pdf/viewer/display/pdfJsDisplayClient';

export const PDF_FOREIGN_PAGE_IMPORT_LIMITS = Object.freeze({
  maxPdfBytes: PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes,
  maxImportedPages: 256,
  maxRasterDimension: 2_400,
  maxRasterPixels: 12_000_000,
  maxJpegBytesPerPage: 16 * 1024 * 1024,
  maxAggregateJpegBytes: 256 * 1024 * 1024,
});

export interface ForeignPdfFlattenOptions {
  stripAnnotations?: boolean;
  maxImportedPages?: number;
  maxAggregateJpegBytes?: number;
}

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not encode flattened PDF page image'));
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Flattened PDF page produced invalid data'));
  reader.readAsDataURL(blob);
});

const canvasToJpeg = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Browser JPEG encoder failed while flattening imported PDF page')), 'image/jpeg', 0.94);
});

const assertPdfMagic = (bytes: Uint8Array): void => {
  if (bytes.byteLength < 8 || new TextDecoder('latin1').decode(bytes.subarray(0, 8)).indexOf('%PDF-') < 0) {
    throw new Error('Foreign page import rejected a non-PDF payload');
  }
};

const selectedPages = (pageCount: number, pages: readonly number[] | undefined, maxImportedPages: number): number[] => {
  if (!Number.isSafeInteger(maxImportedPages) || maxImportedPages < 1 || maxImportedPages > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxImportedPages) throw new Error('Foreign PDF page budget is invalid');
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('Foreign PDF page count is invalid');
  if (!pages?.length && pageCount > maxImportedPages) throw new Error('Foreign PDF page selection exceeds the import budget');
  if (pages && pages.length > maxImportedPages) throw new Error('Foreign PDF page selection exceeds the import budget');
  const values = pages?.length ? [...new Set(pages)] : Array.from({ length: pageCount }, (_, index) => index + 1);
  if (values.length > maxImportedPages) throw new Error('Foreign PDF page selection exceeds the import budget');
  for (const page of values) if (!Number.isInteger(page) || page < 1 || page > pageCount) throw new Error(`Foreign PDF page ${page} is outside the parsed document boundary`);
  return values.sort((a, b) => a - b);
};

export async function flattenForeignPdfBytes(sourceBytes: Uint8Array, sourceName = 'Imported PDF', pages?: readonly number[], options: ForeignPdfFlattenOptions = {}): Promise<PdfNormalizedJpegSource[]> {
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength < 1 || sourceBytes.byteLength > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxPdfBytes) throw new Error('Foreign PDF byte size exceeds the import policy');
  const bytes = new Uint8Array(sourceBytes.byteLength);
  bytes.set(sourceBytes);
  assertPdfMagic(bytes);
  const opened = await openPdfJsDisplayDocument(bytes);
  try {
    const maxImportedPages = options.maxImportedPages ?? PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxImportedPages;
    const maxAggregateJpegBytes = options.maxAggregateJpegBytes ?? PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxAggregateJpegBytes;
    if (!Number.isSafeInteger(maxAggregateJpegBytes) || maxAggregateJpegBytes < 1 || maxAggregateJpegBytes > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxAggregateJpegBytes) throw new Error('Foreign PDF aggregate JPEG budget is invalid');
    const wanted = selectedPages(opened.document.numPages, pages, maxImportedPages);
    const output: PdfNormalizedJpegSource[] = [];
    let aggregateJpegBytes = 0;
    for (const pageNumber of wanted) {
      const page = await opened.document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        2,
        PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxRasterDimension / Math.max(base.width, base.height, 1),
        Math.sqrt(PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxRasterPixels / Math.max(base.width * base.height, 1)),
      );
      const viewport = page.getViewport({ scale: Math.max(0.25, scale) });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      if (width > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxRasterDimension || height > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxRasterDimension || width * height > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxRasterPixels) {
        throw new Error(`Foreign PDF page ${pageNumber} exceeds the flattened raster budget`);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('2D canvas unavailable for foreign PDF page flattening');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      const render = page.render({ canvas, canvasContext: context, viewport, annotationMode: options.stripAnnotations ? opened.module.AnnotationMode.DISABLE : opened.module.AnnotationMode.ENABLE_FORMS, background: '#ffffff' });
      await render.promise;
      const blob = await canvasToJpeg(canvas);
      if (blob.size < 32 || blob.size > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxJpegBytesPerPage) throw new Error(`Flattened PDF page ${pageNumber} exceeds encoded JPEG policy`);
      if (blob.size > maxAggregateJpegBytes - aggregateJpegBytes) throw new Error('Foreign PDF pages exceed the aggregate encoded JPEG policy');
      aggregateJpegBytes += blob.size;
      output.push({
        name: `${sourceName || 'Imported PDF'} · page ${pageNumber}`,
        dataUrl: await blobToDataUrl(blob),
        widthPx: width,
        heightPx: height,
        pageWidthPt: base.width,
        pageHeightPt: base.height,
        altText: `Flattened imported PDF page ${pageNumber} from ${sourceName || 'local file'}`,
      });
    }
    return output;
  } finally {
    await opened.loadingTask.destroy().catch(() => undefined);
  }
}

export async function flattenForeignPdfPages(file: File, pages?: readonly number[], options: ForeignPdfFlattenOptions = {}): Promise<PdfNormalizedJpegSource[]> {
  if (!file || file.size < 1 || file.size > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxPdfBytes) throw new Error('Foreign PDF file size exceeds the import policy');
  if (file.type && file.type !== 'application/pdf') throw new Error('Foreign page import accepts only PDF files');
  return flattenForeignPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name || 'Imported PDF', pages, options);
}

export async function normalizedImagesFromScannerFrame(video: HTMLVideoElement, name = 'Scanner capture'): Promise<PdfNormalizedJpegSource[]> {
  if (!(video instanceof HTMLVideoElement) || video.videoWidth < 1 || video.videoHeight < 1) throw new Error('Scanner camera has no decoded frame');
  const maxDimension = 3_000;
  const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  if (width * height > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxRasterPixels) throw new Error('Scanner frame exceeds the raster safety budget');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('2D canvas unavailable for scanner capture');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(video, 0, 0, width, height);
  const blob = await canvasToJpeg(canvas);
  if (blob.size > PDF_FOREIGN_PAGE_IMPORT_LIMITS.maxJpegBytesPerPage) throw new Error('Scanner capture exceeds encoded JPEG policy');
  return [{ name, dataUrl: await blobToDataUrl(blob), widthPx: width, heightPx: height, altText: name }];
}

export async function normalizedImagesFromLocalFiles(files: readonly File[]): Promise<PdfNormalizedJpegSource[]> {
  return normalizeLocalImageFiles(files);
}

export function insertNormalizedForeignPages(
  target: PdfDocumentModel,
  sources: readonly PdfNormalizedJpegSource[],
  atPage: number,
  namespace = 'foreign-raster-import',
): PdfDocumentModel {
  const imported = createPdfModelFromNormalizedJpegs(sources);
  return insertStructuredPdfPages(target, imported, imported.pages.map((page) => page.pageNumber), atPage, namespace);
}
