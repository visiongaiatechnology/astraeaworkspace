import { probeMediaBoundary } from '../../../../platform/media/index';
// STATUS: DIAMANT VGT SUPREME — local-only bounded image normalization for PDF Studio.
// Active/vector formats are intentionally excluded. Browser-decoded raster input is normalized to JPEG.

import type { PdfDocumentModel, PdfNormalizedJpegSource, PdfPageImage, PdfPageModel } from '../../../../shared/contracts/notes-pdf/pdf/workspacePdf';

export type { PdfNormalizedJpegSource } from '../../../../shared/contracts/notes-pdf/pdf/workspacePdf';

export const PDF_IMAGE_IMPORT_LIMITS = Object.freeze({
  maxFiles: 128,
  maxInputBytesPerFile: 16 * 1024 * 1024,
  maxOutputBytesPerImage: 16 * 1024 * 1024,
  maxPixels: 48_000_000,
  maxDimension: 8_192,
});

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 24;

function safeImageName(value: string, index: number): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 180);
  return clean || `Image ${index + 1}`;
}

function fitImageBounds(widthPx: number, heightPx: number) {
  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx < 1 || heightPx < 1) throw new Error('Image dimensions are invalid.');
  if (widthPx > PDF_IMAGE_IMPORT_LIMITS.maxDimension || heightPx > PDF_IMAGE_IMPORT_LIMITS.maxDimension || widthPx * heightPx > PDF_IMAGE_IMPORT_LIMITS.maxPixels) {
    throw new Error('Image dimensions exceed the PDF Studio raster policy.');
  }
  const maxWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const maxHeight = A4_HEIGHT - PAGE_MARGIN * 2;
  const scale = Math.min(maxWidth / widthPx, maxHeight / heightPx);
  const width = widthPx * scale;
  const height = heightPx * scale;
  return {
    x: (A4_WIDTH - width) / 2,
    y: (A4_HEIGHT - height) / 2,
    width,
    height,
  };
}

function assertJpegDataUrl(dataUrl: string): void {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  if (!match) throw new Error('Normalized image payload must be a local JPEG data URL.');
  const estimatedBytes = Math.floor(match[1].length * 3 / 4);
  if (estimatedBytes < 32 || estimatedBytes > PDF_IMAGE_IMPORT_LIMITS.maxOutputBytesPerImage) throw new Error('Normalized JPEG payload exceeds policy.');
}

export function createPdfModelFromNormalizedJpegs(sources: readonly PdfNormalizedJpegSource[]): PdfDocumentModel {
  if (!sources.length) throw new Error('At least one normalized JPEG image is required.');
  if (sources.length > PDF_IMAGE_IMPORT_LIMITS.maxFiles) throw new Error('Image count exceeds the PDF Studio policy.');
  const pages: PdfPageModel[] = sources.map((source, index) => {
    assertJpegDataUrl(source.dataUrl);
    const title = safeImageName(source.name, index);
    const preservesPdfPage = Number.isFinite(source.pageWidthPt) && Number.isFinite(source.pageHeightPt)
      && (source.pageWidthPt ?? 0) > 1 && (source.pageHeightPt ?? 0) > 1
      && (source.pageWidthPt ?? 0) <= 20_000 && (source.pageHeightPt ?? 0) <= 20_000;
    const mediaBox = preservesPdfPage ? { x: 0, y: 0, width: source.pageWidthPt!, height: source.pageHeightPt! } : undefined;
    const image: PdfPageImage = {
      id: `image-pdf-${index + 1}`,
      mimeType: 'image/jpeg',
      dataUrl: source.dataUrl,
      widthPx: source.widthPx,
      heightPx: source.heightPx,
      bounds: mediaBox ?? fitImageBounds(source.widthPx, source.heightPx),
      altText: source.altText?.trim().slice(0, 2_000) || title,
    };
    return {
      pageNumber: index + 1,
      title,
      pageLabel: `Image ${index + 1}`,
      ...(mediaBox ? { mediaBox } : {}),
      images: [image],
      sections: [],
    };
  });
  return { numPages: pages.length, pages, annotations: [], redactions: [] };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not encode the normalized image.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image normalization produced an invalid payload.'));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Browser JPEG encoder failed.')), 'image/jpeg', 0.92);
  });
}

export async function normalizeLocalImageFiles(files: readonly File[]): Promise<PdfNormalizedJpegSource[]> {
  if (!files.length) throw new Error('Choose at least one local image.');
  if (files.length > PDF_IMAGE_IMPORT_LIMITS.maxFiles) throw new Error('Image count exceeds the PDF Studio policy.');
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const output: PdfNormalizedJpegSource[] = [];
  for (const [index, file] of files.entries()) {
    if (!allowed.has(file.type.toLowerCase())) throw new Error(`${file.name}: only local JPEG, PNG and WebP raster images are accepted.`);
    if (file.size < 1 || file.size > PDF_IMAGE_IMPORT_LIMITS.maxInputBytesPerFile) throw new Error(`${file.name}: input file size exceeds policy.`);
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    const mediaProbe = probeMediaBoundary(sourceBytes, file.type);
    if (!allowed.has(mediaProbe.mimeType)) throw new Error(`${file.name}: image boundary rejected the source.`);
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > PDF_IMAGE_IMPORT_LIMITS.maxDimension || bitmap.height > PDF_IMAGE_IMPORT_LIMITS.maxDimension || bitmap.width * bitmap.height > PDF_IMAGE_IMPORT_LIMITS.maxPixels) {
        throw new Error(`${file.name}: decoded dimensions exceed the PDF Studio raster policy.`);
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Local raster conversion is unavailable in this browser.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      const jpeg = await canvasToJpeg(canvas);
      if (jpeg.size < 32 || jpeg.size > PDF_IMAGE_IMPORT_LIMITS.maxOutputBytesPerImage) throw new Error(`${file.name}: normalized JPEG exceeds policy.`);
      output.push({
        name: safeImageName(file.name, index),
        dataUrl: await blobToDataUrl(jpeg),
        widthPx: bitmap.width,
        heightPx: bitmap.height,
        altText: safeImageName(file.name.replace(/\.[^.]+$/u, ''), index),
      });
    } finally {
      bitmap.close();
    }
  }
  return output;
}
