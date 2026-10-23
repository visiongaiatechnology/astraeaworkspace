// STATUS: DIAMANT VGT SUPREME — destructive local raster redaction for structured PDF images.
// The original JPEG is decoded locally, selected pixels are overwritten, and only the re-encoded JPEG remains in the model.

import type { PdfDocumentModel, PdfPageBox, PdfPageImage, PdfRedaction } from '../../../../shared/contracts/workspace';

export const PDF_IMAGE_REDACTION_LIMITS = Object.freeze({
  maxJpegBytes: 16 * 1024 * 1024,
  maxPixels: 48_000_000,
  maxDimension: 8_192,
  maxOverlayText: 128,
  maxReasonLength: 512,
});

export interface PdfImageRedactionRequest {
  pageNumber: number;
  imageId: string;
  /** PDF page coordinates, bottom-left origin. The rectangle is clipped to the target image bounds. */
  rectangle: PdfPageBox;
  reason: string;
  overlayColor?: string;
  overlayText?: string;
}

export interface PdfImageRasterRequest {
  inputJpeg: Uint8Array;
  widthPx: number;
  heightPx: number;
  pixelBounds: { x: number; y: number; width: number; height: number };
  overlayColor: string;
  overlayText: string;
}

export interface PdfImageRasterAdapter {
  redactJpeg(request: PdfImageRasterRequest): Promise<Uint8Array>;
}

export interface PdfImageRedactionResult {
  model: PdfDocumentModel;
  redaction: PdfRedaction;
  originalSha256: string;
  redactedSha256: string;
  redactedPixelBounds: { x: number; y: number; width: number; height: number };
}

function cleanReason(value: string): string {
  const reason = value.replace(/\u0000/g, '').trim().slice(0, PDF_IMAGE_REDACTION_LIMITS.maxReasonLength);
  if (!reason) throw new Error('A redaction reason is required.');
  return reason;
}

function cleanOverlayText(value: string | undefined): string {
  return (value ?? '').replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, PDF_IMAGE_REDACTION_LIMITS.maxOverlayText);
}

function cleanOverlayColor(value: string | undefined): string {
  const color = (value ?? '#000000').trim();
  if (!/^#[0-9a-f]{6}$/iu.test(color)) throw new Error('Redaction overlay color must be a six-digit hex color.');
  return color.toLowerCase();
}

function intersectBox(a: PdfPageBox, b: PdfPageBox): PdfPageBox | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (![x1, y1, x2, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function jpegBytesFromDataUrl(dataUrl: string): Uint8Array {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  if (!match) throw new Error('Image redaction accepts only normalized local JPEG payloads.');
  const estimated = Math.floor(match[1].length * 3 / 4);
  if (estimated < 32 || estimated > PDF_IMAGE_REDACTION_LIMITS.maxJpegBytes) throw new Error('JPEG payload exceeds the image-redaction policy.');
  const decoded = globalThis.atob(match[1]);
  if (decoded.length < 32 || decoded.length > PDF_IMAGE_REDACTION_LIMITS.maxJpegBytes) throw new Error('Decoded JPEG payload exceeds policy.');
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error('Image payload is not a complete JPEG.');
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function bytesToJpegBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer], { type: 'image/jpeg' });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Browser JPEG encoder failed closed.')), 'image/jpeg', 0.94);
  });
}

function bytesFromBlob(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function jpegDataUrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return `data:image/jpeg;base64,${globalThis.btoa(binary)}`;
}

export const browserPdfImageRasterAdapter: PdfImageRasterAdapter = {
  async redactJpeg(request): Promise<Uint8Array> {
    if (typeof globalThis.createImageBitmap !== 'function' || typeof document === 'undefined') {
      throw new Error('Browser raster redaction primitives are unavailable.');
    }
    const bitmap = await createImageBitmap(bytesToJpegBlob(request.inputJpeg));
    try {
      if (bitmap.width !== request.widthPx || bitmap.height !== request.heightPx) throw new Error('Decoded JPEG dimensions do not match the canonical image model.');
      const canvas = document.createElement('canvas');
      canvas.width = request.widthPx;
      canvas.height = request.heightPx;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Local raster redaction is unavailable in this browser.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      context.save();
      context.fillStyle = request.overlayColor;
      context.fillRect(request.pixelBounds.x, request.pixelBounds.y, request.pixelBounds.width, request.pixelBounds.height);
      if (request.overlayText && request.pixelBounds.width >= 24 && request.pixelBounds.height >= 12) {
        const fontSize = Math.max(8, Math.min(28, Math.floor(request.pixelBounds.height * 0.34)));
        context.font = `600 ${fontSize}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = request.overlayColor === '#000000' ? '#ffffff' : '#000000';
        context.fillText(request.overlayText, request.pixelBounds.x + request.pixelBounds.width / 2, request.pixelBounds.y + request.pixelBounds.height / 2, Math.max(1, request.pixelBounds.width - 8));
      }
      context.restore();
      return bytesFromBlob(await canvasToJpeg(canvas));
    } finally {
      bitmap.close();
    }
  },
};

function assertImagePolicy(image: PdfPageImage): void {
  if (!Number.isInteger(image.widthPx) || !Number.isInteger(image.heightPx) || image.widthPx < 1 || image.heightPx < 1) throw new Error('Image dimensions are invalid.');
  if (image.widthPx > PDF_IMAGE_REDACTION_LIMITS.maxDimension || image.heightPx > PDF_IMAGE_REDACTION_LIMITS.maxDimension || image.widthPx * image.heightPx > PDF_IMAGE_REDACTION_LIMITS.maxPixels) {
    throw new Error('Image dimensions exceed the image-redaction policy.');
  }
  if (![image.bounds.x, image.bounds.y, image.bounds.width, image.bounds.height].every(Number.isFinite) || image.bounds.width <= 0 || image.bounds.height <= 0) {
    throw new Error('Image page bounds are invalid.');
  }
}

export async function sha256PdfImageDataUrl(dataUrl: string): Promise<string> {
  return sha256Hex(jpegBytesFromDataUrl(dataUrl));
}

export async function redactStructuredPdfImageRectangle(
  model: PdfDocumentModel,
  request: PdfImageRedactionRequest,
  now = Date.now(),
  rasterAdapter: PdfImageRasterAdapter = browserPdfImageRasterAdapter,
): Promise<PdfImageRedactionResult> {
  const page = model.pages.find((candidate) => candidate.pageNumber === request.pageNumber);
  if (!page) throw new Error('Redaction target page does not exist.');
  const image = (page.images ?? []).find((candidate) => candidate.id === request.imageId);
  if (!image) throw new Error('Redaction target image does not exist.');
  assertImagePolicy(image);
  const clipped = intersectBox(request.rectangle, image.bounds);
  if (!clipped) throw new Error('Redaction rectangle does not intersect the target image.');

  const reason = cleanReason(request.reason);
  const overlayColor = cleanOverlayColor(request.overlayColor);
  const overlayText = cleanOverlayText(request.overlayText);
  const originalBytes = jpegBytesFromDataUrl(image.dataUrl);
  const originalSha256 = await sha256Hex(originalBytes);
  const relativeLeft = (clipped.x - image.bounds.x) / image.bounds.width;
  const relativeRight = (clipped.x + clipped.width - image.bounds.x) / image.bounds.width;
  const relativeBottom = (clipped.y - image.bounds.y) / image.bounds.height;
  const relativeTop = (clipped.y + clipped.height - image.bounds.y) / image.bounds.height;
  const x1 = Math.max(0, Math.floor(relativeLeft * image.widthPx));
  const x2 = Math.min(image.widthPx, Math.ceil(relativeRight * image.widthPx));
  // PDF page coordinates use a bottom-left origin; raster coordinates use top-left.
  const y1 = Math.max(0, Math.floor((1 - relativeTop) * image.heightPx));
  const y2 = Math.min(image.heightPx, Math.ceil((1 - relativeBottom) * image.heightPx));
  if (x2 <= x1 || y2 <= y1) throw new Error('Redaction rectangle maps to an empty pixel area.');
  const pixelBounds = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };

  const redactedBytes = await rasterAdapter.redactJpeg({
    inputJpeg: originalBytes,
    widthPx: image.widthPx,
    heightPx: image.heightPx,
    pixelBounds,
    overlayColor,
    overlayText,
  });
  if (redactedBytes.length < 32 || redactedBytes.length > PDF_IMAGE_REDACTION_LIMITS.maxJpegBytes) throw new Error('Redacted JPEG exceeds policy.');
  const dataUrl = jpegDataUrlFromBytes(redactedBytes);

  const redactedSha256 = await sha256PdfImageDataUrl(dataUrl);
  if (redactedSha256 === originalSha256) throw new Error('Image redaction failed closed because the raster fingerprint did not change.');
  const redaction: PdfRedaction = {
    id: `redact-image-${now}-${request.pageNumber}-${request.imageId}`,
    page: request.pageNumber,
    x: clipped.x,
    y: clipped.y,
    width: clipped.width,
    height: clipped.height,
    reason,
    isApplied: true,
    targetKind: 'image',
    imageId: request.imageId,
    targetText: `[IMAGE PIXELS REDACTED ${pixelBounds.width}x${pixelBounds.height}]`,
    timestamp: now,
  };

  const pages = model.pages.map((candidate) => candidate.pageNumber !== request.pageNumber ? candidate : {
    ...candidate,
    images: (candidate.images ?? []).map((candidateImage) => candidateImage.id !== request.imageId ? candidateImage : {
      ...candidateImage,
      dataUrl,
      // Alt text is an alternate representation and must not retain a description of redacted image content.
      altText: overlayText || '[REDACTED IMAGE CONTENT]',
    }),
  });

  return {
    model: { ...model, pages, redactions: [...model.redactions, redaction] },
    redaction,
    originalSha256,
    redactedSha256,
    redactedPixelBounds: pixelBounds,
  };
}
