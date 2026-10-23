// STATUS: DIAMANT VGT SUPREME
// Local, bounded JPEG downsampling for structured PDF image objects.

import type { PdfDocumentModel, PdfPageImage } from '../../../../shared/contracts/workspace';

export const PDF_IMAGE_OPTIMIZATION_LIMITS = Object.freeze({
  maxImages: 512,
  maxTotalInputBytes: 128 * 1024 * 1024,
  maxInputBytesPerImage: 16 * 1024 * 1024,
  maxPixelsPerImage: 48_000_000,
  maxDimension: 8_192,
  minTargetDimension: 256,
  maxTargetDimension: 4_096,
  minQuality: 0.4,
  maxQuality: 0.95,
});

export interface PdfImageDownsampleRequest {
  maxDimension: number;
  jpegQuality: number;
}

export interface PdfImageDownsampleAdapterRequest {
  inputJpeg: Uint8Array;
  widthPx: number;
  heightPx: number;
  targetWidthPx: number;
  targetHeightPx: number;
  jpegQuality: number;
}

export interface PdfImageDownsampleAdapter {
  resizeJpeg(request: PdfImageDownsampleAdapterRequest): Promise<Uint8Array>;
}

export interface PdfImageDownsamplePreview {
  previewId: string;
  model: PdfDocumentModel;
  request: PdfImageDownsampleRequest;
  imagesSeen: number;
  imagesDownsampled: number;
  imagesKept: number;
  originalBytes: number;
  optimizedBytes: number;
  bytesSaved: number;
  warnings: string[];
}

function decodeJpegDataUrl(dataUrl: string): Uint8Array {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  if (!match) throw new Error('Image optimization accepts only normalized local JPEG payloads.');
  const estimated = Math.floor(match[1].length * 3 / 4);
  if (estimated < 32 || estimated > PDF_IMAGE_OPTIMIZATION_LIMITS.maxInputBytesPerImage) throw new Error('JPEG payload exceeds image-optimization policy.');
  const binary = globalThis.atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.length < 32 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new Error('Image optimization input is not a complete JPEG.');
  return bytes;
}

function encodeJpegDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return `data:image/jpeg;base64,${globalThis.btoa(binary)}`;
}

function assertImage(image: PdfPageImage): void {
  if (!Number.isInteger(image.widthPx) || !Number.isInteger(image.heightPx) || image.widthPx < 1 || image.heightPx < 1) throw new Error('Structured PDF image dimensions are invalid.');
  if (image.widthPx > PDF_IMAGE_OPTIMIZATION_LIMITS.maxDimension || image.heightPx > PDF_IMAGE_OPTIMIZATION_LIMITS.maxDimension || image.widthPx * image.heightPx > PDF_IMAGE_OPTIMIZATION_LIMITS.maxPixelsPerImage) {
    throw new Error('Structured PDF image dimensions exceed optimization policy.');
  }
}

function normalizeRequest(request: PdfImageDownsampleRequest): PdfImageDownsampleRequest {
  const maxDimension = Math.trunc(request.maxDimension);
  const jpegQuality = Number(request.jpegQuality);
  if (!Number.isInteger(maxDimension) || maxDimension < PDF_IMAGE_OPTIMIZATION_LIMITS.minTargetDimension || maxDimension > PDF_IMAGE_OPTIMIZATION_LIMITS.maxTargetDimension) {
    throw new Error(`Image target dimension must be ${PDF_IMAGE_OPTIMIZATION_LIMITS.minTargetDimension}-${PDF_IMAGE_OPTIMIZATION_LIMITS.maxTargetDimension}px.`);
  }
  if (!Number.isFinite(jpegQuality) || jpegQuality < PDF_IMAGE_OPTIMIZATION_LIMITS.minQuality || jpegQuality > PDF_IMAGE_OPTIMIZATION_LIMITS.maxQuality) throw new Error('JPEG quality is outside the 0.40-0.95 policy.');
  return { maxDimension, jpegQuality };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function jpegBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer], { type: 'image/jpeg' });
}

export const browserPdfImageDownsampleAdapter: PdfImageDownsampleAdapter = {
  async resizeJpeg(request): Promise<Uint8Array> {
    if (typeof globalThis.createImageBitmap !== 'function' || typeof document === 'undefined') throw new Error('Browser image downsampling primitives are unavailable.');
    const bitmap = await createImageBitmap(jpegBlob(request.inputJpeg));
    try {
      if (bitmap.width !== request.widthPx || bitmap.height !== request.heightPx) throw new Error('Decoded JPEG dimensions do not match the canonical image model.');
      const canvas = document.createElement('canvas');
      canvas.width = request.targetWidthPx;
      canvas.height = request.targetHeightPx;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Local image downsampling is unavailable in this browser.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Browser JPEG encoder failed closed.')), 'image/jpeg', request.jpegQuality));
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      bitmap.close();
    }
  },
};

export async function previewStructuredPdfImageDownsampling(
  model: PdfDocumentModel,
  requestInput: PdfImageDownsampleRequest,
  adapter: PdfImageDownsampleAdapter = browserPdfImageDownsampleAdapter,
): Promise<PdfImageDownsamplePreview> {
  if (model.rawPdfDataUrl) throw new Error('Native PDF image downsampling requires the standards parser/renderer.');
  const request = normalizeRequest(requestInput);
  const imageCount = model.pages.reduce((count, page) => count + (page.images?.length ?? 0), 0);
  if (imageCount > PDF_IMAGE_OPTIMIZATION_LIMITS.maxImages) throw new Error('Structured PDF exceeds the image-count optimization policy.');
  let totalInput = 0;
  let totalOutput = 0;
  let downsampled = 0;
  const fingerprintParts: string[] = [`${request.maxDimension}:${request.jpegQuality}`];

  const pages = [] as PdfDocumentModel['pages'];
  for (const page of model.pages) {
    const images: PdfPageImage[] = [];
    for (const image of page.images ?? []) {
      assertImage(image);
      const input = decodeJpegDataUrl(image.dataUrl);
      totalInput += input.byteLength;
      if (totalInput > PDF_IMAGE_OPTIMIZATION_LIMITS.maxTotalInputBytes) throw new Error('Structured PDF image bytes exceed optimization policy.');
      const scale = Math.min(1, request.maxDimension / Math.max(image.widthPx, image.heightPx));
      const targetWidthPx = Math.max(1, Math.round(image.widthPx * scale));
      const targetHeightPx = Math.max(1, Math.round(image.heightPx * scale));
      const output = await adapter.resizeJpeg({ inputJpeg: input, widthPx: image.widthPx, heightPx: image.heightPx, targetWidthPx, targetHeightPx, jpegQuality: request.jpegQuality });
      if (output.length < 32 || output.length > PDF_IMAGE_OPTIMIZATION_LIMITS.maxInputBytesPerImage || output[0] !== 0xff || output[1] !== 0xd8) throw new Error('Image downsampler returned an invalid or oversized JPEG.');
      const useOutput = output.byteLength < input.byteLength && (targetWidthPx < image.widthPx || targetHeightPx < image.heightPx || request.jpegQuality < 0.95);
      const finalBytes = useOutput ? output : input;
      totalOutput += finalBytes.byteLength;
      if (useOutput) downsampled += 1;
      fingerprintParts.push(`${page.pageNumber}:${image.id}:${input.byteLength}:${finalBytes.byteLength}:${useOutput ? targetWidthPx : image.widthPx}x${useOutput ? targetHeightPx : image.heightPx}`);
      images.push(useOutput ? { ...image, dataUrl: encodeJpegDataUrl(finalBytes), widthPx: targetWidthPx, heightPx: targetHeightPx } : image);
    }
    pages.push({ ...page, images });
  }
  const previewId = await sha256Hex(fingerprintParts.join('|'));
  return {
    previewId,
    model: { ...model, pages },
    request,
    imagesSeen: imageCount,
    imagesDownsampled: downsampled,
    imagesKept: imageCount - downsampled,
    originalBytes: totalInput,
    optimizedBytes: totalOutput,
    bytesSaved: totalInput - totalOutput,
    warnings: ['Image downsampling is lossy. Review the exact preview before export; the original Workspace document is not mutated.'],
  };
}
