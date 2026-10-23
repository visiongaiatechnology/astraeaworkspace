// STATUS: DIAMANT VGT SUPREME — local bounded OCR raster preprocessing.

import type { PdfPageImage } from '../../../shared/contracts/workspace';
import type { PdfOcrRegion, PdfPreparedOcrImage } from './pdfOcrEngine';

export interface PdfOcrPreprocessOptions {
  autoDeskew: boolean;
  denoise: boolean;
  enhanceContrast: boolean;
  region?: PdfOcrRegion;
}

export interface PdfOcrPreprocessResult {
  prepared: PdfPreparedOcrImage;
  detectedSkewDegrees: number;
  outputWidthPx: number;
  outputHeightPx: number;
}

const MAX_OCR_PIXELS = 8_000_000;
const MAX_OCR_DIMENSION = 6_000;

export function ocrQuarterTurnDimensions(width: number, height: number, rotation: 0 | 90 | 180 | 270): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('OCR rotation dimensions are invalid.');
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

function normalizedRegion(value: PdfOcrRegion | undefined): PdfOcrRegion {
  const region = value ?? { x: 0, y: 0, width: 1, height: 1 };
  if (![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1.000001 || region.y + region.height > 1.000001) {
    throw new Error('OCR preprocessing region is invalid.');
  }
  return region;
}

function dataUrlToJpegBlob(dataUrl: string): Blob {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  if (!match) throw new Error('OCR preprocessing accepts only normalized local JPEGs.');
  const binary = globalThis.atob(match[1]);
  if (binary.length < 32 || binary.length > 24 * 1024 * 1024) throw new Error('OCR JPEG violates byte-size policy.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes.slice().buffer], { type: 'image/jpeg' });
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
    return globalThis.btoa(binary);
  });
}

export function estimateOcrSkewRgba(data: Uint8ClampedArray, width: number, height: number): number {
  const stepY = Math.max(1, Math.floor(height / 220));
  const stepX = Math.max(1, Math.floor(width / 220));
  let bestAngle = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let angle = -5; angle <= 5; angle += 0.5) {
    const radians = angle * Math.PI / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const bins = new Int32Array(height);
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const index = (y * width + x) * 4;
        const luminance = (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000;
        if (luminance >= 150) continue;
        const projected = Math.round(y * cos - x * sin);
        if (projected >= 0 && projected < height) bins[projected] += 1;
      }
    }
    let sum = 0;
    let squared = 0;
    for (const count of bins) { sum += count; squared += count * count; }
    const score = squared / height - (sum / height) ** 2;
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  return Math.abs(bestAngle) < 0.25 ? 0 : bestAngle;
}

export function enhanceOcrContrastRgba(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  for (let index = 0; index < data.length; index += 16) {
    const luminance = Math.round((data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000);
    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
  }
  if (max - min < 24) return;
  const scale = 255 / (max - min);
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) data[index + channel] = Math.max(0, Math.min(255, Math.round((data[index + channel] - min) * scale)));
  }
}

export function denoiseOcrRgba(data: Uint8ClampedArray, width: number, height: number): void {
  if (width < 3 || height < 3) return;
  const source = new Uint8ClampedArray(data);
  const values = new Uint8Array(9);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let slot = 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const index = ((y + dy) * width + (x + dx)) * 4;
        values[slot++] = Math.round((source[index] * 299 + source[index + 1] * 587 + source[index + 2] * 114) / 1000);
      }
      values.sort();
      const median = values[4];
      const target = (y * width + x) * 4;
      data[target] = median; data[target + 1] = median; data[target + 2] = median;
    }
  }
}

async function canvasJpegBase64(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('OCR JPEG encoding failed closed.')), 'image/jpeg', 0.95));
  return blobToBase64(blob);
}

export async function preprocessPdfOcrImage(
  pageNumber: number,
  image: PdfPageImage,
  options: PdfOcrPreprocessOptions,
): Promise<PdfOcrPreprocessResult> {
  if (typeof document === 'undefined' || typeof globalThis.createImageBitmap !== 'function') throw new Error('OCR preprocessing requires local browser canvas APIs.');
  if (image.widthPx < 1 || image.heightPx < 1 || image.widthPx > MAX_OCR_DIMENSION || image.heightPx > MAX_OCR_DIMENSION || image.widthPx * image.heightPx > MAX_OCR_PIXELS) throw new Error('OCR source image exceeds preprocessing policy.');
  const region = normalizedRegion(options.region);
  const bitmap = await globalThis.createImageBitmap(dataUrlToJpegBlob(image.dataUrl));
  try {
    const crop = image.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const sx = Math.round(bitmap.width * Math.max(0, Math.min(0.95, crop.left)));
    const sy = Math.round(bitmap.height * Math.max(0, Math.min(0.95, crop.top)));
    const sw = Math.max(1, Math.round(bitmap.width * Math.max(0.01, 1 - crop.left - crop.right)));
    const sh = Math.max(1, Math.round(bitmap.height * Math.max(0.01, 1 - crop.top - crop.bottom)));
    const quarterTurn = image.rotation ?? 0;
    const rotated = ocrQuarterTurnDimensions(sw, sh, quarterTurn);
    const rotatedWidth = rotated.width;
    const rotatedHeight = rotated.height;
    const scale = Math.min(1, Math.sqrt(MAX_OCR_PIXELS / Math.max(1, rotatedWidth * rotatedHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rotatedWidth * scale));
    canvas.height = Math.max(1, Math.round(rotatedHeight * scale));
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw new Error('OCR preprocessing canvas is unavailable.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(quarterTurn * Math.PI / 180);
    const drawWidth = sw * scale;
    const drawHeight = sh * scale;
    context.drawImage(bitmap, sx, sy, sw, sh, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();

    let frame = context.getImageData(0, 0, canvas.width, canvas.height);
    if (options.enhanceContrast) enhanceOcrContrastRgba(frame.data);
    if (options.denoise) denoiseOcrRgba(frame.data, frame.width, frame.height);
    context.putImageData(frame, 0, 0);
    const detectedSkewDegrees = options.autoDeskew ? estimateOcrSkewRgba(frame.data, frame.width, frame.height) : 0;
    if (detectedSkewDegrees !== 0) {
      const snapshot = document.createElement('canvas'); snapshot.width = canvas.width; snapshot.height = canvas.height;
      const snapshotContext = snapshot.getContext('2d', { alpha: false });
      if (!snapshotContext) throw new Error('OCR deskew canvas is unavailable.');
      snapshotContext.drawImage(canvas, 0, 0);
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.save(); context.translate(canvas.width / 2, canvas.height / 2); context.rotate(-detectedSkewDegrees * Math.PI / 180); context.drawImage(snapshot, -canvas.width / 2, -canvas.height / 2); context.restore();
    }

    const rx = Math.floor(region.x * canvas.width); const ry = Math.floor(region.y * canvas.height);
    const rw = Math.max(1, Math.ceil(region.width * canvas.width)); const rh = Math.max(1, Math.ceil(region.height * canvas.height));
    const regionCanvas = document.createElement('canvas'); regionCanvas.width = rw; regionCanvas.height = rh;
    const regionContext = regionCanvas.getContext('2d', { alpha: false });
    if (!regionContext) throw new Error('OCR region canvas is unavailable.');
    regionContext.fillStyle = '#ffffff'; regionContext.fillRect(0, 0, rw, rh); regionContext.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);
    return {
      prepared: { pageNumber, imageId: image.id, jpegBase64: await canvasJpegBase64(regionCanvas), pageBounds: { ...image.bounds }, mappingRegion: region },
      detectedSkewDegrees,
      outputWidthPx: rw,
      outputHeightPx: rh,
    };
  } finally {
    bitmap.close();
  }
}
