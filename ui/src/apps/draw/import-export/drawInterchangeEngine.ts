// STATUS: DIAMANT VGT SUPREME — bounded Astraea Draw browser raster and PDF exports
export * from './drawInterchangeCore';

import type { DrawDocumentModel } from '../../../shared/contracts/draw/workspaceDraw';
import { rasterizeSvgToDataUrl } from '../../../platform/rendering/svgRasterizer';
import { assertDrawDocument, DrawModelError } from '../model/drawDocumentEngine';
import { buildDrawSvg } from './drawInterchangeCore';

export const DRAW_PDF_LIMITS = Object.freeze({
  maxPages: 128,
  maxBytes: 64 * 1024 * 1024,
  maxImageBytes: 24 * 1024 * 1024,
  maxAggregateJpegBytes: 48 * 1024 * 1024,
});

const DRAW_RASTER_LIMITS = Object.freeze({ maxEdge: 8_192, maxPixels: 32_000_000, imageLoadTimeoutMs: 30_000 });
const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const pdfEncoder = new TextEncoder();

export async function buildDrawPng(model: DrawDocumentModel, pageId = model.activePageId): Promise<string> {
  const svg = buildDrawSvg(model, pageId);
  return rasterizeSvgToDataUrl(svg, 'image/png', 2);
}

function loadSvgImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => finish(new DrawModelError('svg-raster-timeout')), DRAW_RASTER_LIMITS.imageLoadTimeoutMs);
    const finish = (error?: DrawModelError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new DrawModelError('svg-raster-load-failed'));
    try {
      image.src = url;
    } catch {
      finish(new DrawModelError('svg-raster-load-failed'));
    }
  });
}

export async function buildDrawWebp(model: DrawDocumentModel, pageId = model.activePageId): Promise<string> {
  const svg = buildDrawSvg(model, pageId);
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  if (typeof document === 'undefined') throw new DrawModelError('browser-rasterizer-unavailable');

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadSvgImage(url);
    const scale = Math.min(
      2,
      DRAW_RASTER_LIMITS.maxEdge / Math.max(page.width, page.height),
      Math.sqrt(DRAW_RASTER_LIMITS.maxPixels / (page.width * page.height)),
    );
    const width = Math.max(1, Math.floor(page.width * scale));
    const height = Math.max(1, Math.floor(page.height * scale));
    if (width > DRAW_RASTER_LIMITS.maxEdge || height > DRAW_RASTER_LIMITS.maxEdge || width * height > DRAW_RASTER_LIMITS.maxPixels) {
      throw new DrawModelError('raster-size-boundary');
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new DrawModelError('canvas-unavailable');
    context.drawImage(image, 0, 0, width, height);
    const output = canvas.toDataURL('image/webp', 0.92);
    if (!output.startsWith('data:image/webp;base64,')) throw new DrawModelError('webp-encoder-unavailable');
    return output;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function decodeRasterDataUrl(dataUrl: string): Uint8Array {
  if (typeof dataUrl !== 'string' || dataUrl.length > JPEG_DATA_URL_PREFIX.length + Math.ceil(DRAW_PDF_LIMITS.maxImageBytes / 3) * 4) {
    throw new DrawModelError('pdf-jpeg-size-boundary');
  }
  if (!dataUrl.startsWith(JPEG_DATA_URL_PREFIX)) throw new DrawModelError('pdf-jpeg-invalid');
  const encoded = dataUrl.slice(JPEG_DATA_URL_PREFIX.length);
  if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new DrawModelError('pdf-jpeg-invalid');
  }

  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const lastDataIndex = encoded.length - padding - 1;
  if ((padding === 2 && (alphabetIndex(encoded[lastDataIndex]) & 0x0f) !== 0)
    || (padding === 1 && (alphabetIndex(encoded[lastDataIndex]) & 0x03) !== 0)) {
    throw new DrawModelError('pdf-jpeg-invalid');
  }
  const decodedLength = (encoded.length / 4) * 3 - padding;
  if (decodedLength < 4 || decodedLength > DRAW_PDF_LIMITS.maxImageBytes) throw new DrawModelError('pdf-jpeg-size-boundary');

  const output = new Uint8Array(decodedLength);
  let offset = 0;
  for (let index = 0; index < encoded.length; index += 4) {
    const a = alphabetIndex(encoded[index]);
    const b = alphabetIndex(encoded[index + 1]);
    const c = encoded[index + 2] === '=' ? 0 : alphabetIndex(encoded[index + 2]);
    const d = encoded[index + 3] === '=' ? 0 : alphabetIndex(encoded[index + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new DrawModelError('pdf-jpeg-invalid');
    const block = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < decodedLength) output[offset++] = (block >>> 16) & 0xff;
    if (offset < decodedLength) output[offset++] = (block >>> 8) & 0xff;
    if (offset < decodedLength) output[offset++] = block & 0xff;
  }
  return output;
}

function alphabetIndex(value: string): number {
  return BASE64_ALPHABET.indexOf(value);
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new DrawModelError('pdf-jpeg-invalid');
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new DrawModelError('pdf-jpeg-invalid');
    while (offset + 1 < bytes.length && bytes[offset + 1] === 0xff) offset += 1;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda || marker === 0x00) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= bytes.length) throw new DrawModelError('pdf-jpeg-invalid');
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) throw new DrawModelError('pdf-jpeg-invalid');
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 8) throw new DrawModelError('pdf-jpeg-invalid');
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width < 1 || height < 1 || width > DRAW_RASTER_LIMITS.maxEdge || height > DRAW_RASTER_LIMITS.maxEdge
        || width * height > DRAW_RASTER_LIMITS.maxPixels) {
        throw new DrawModelError('pdf-jpeg-size-boundary');
      }
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  throw new DrawModelError('pdf-jpeg-dimensions-missing');
}

function pdfTitleHex(title: string): string {
  if (typeof title !== 'string' || title.length > 512) throw new DrawModelError('pdf-title-size-boundary');
  const sanitized = title.replace(/[\u0000-\u001f\u007f]/g, ' ');
  let hex = 'FEFF';
  for (let index = 0; index < sanitized.length; index += 1) {
    let codeUnit = sanitized.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = sanitized.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        hex += codeUnit.toString(16).padStart(4, '0') + next.toString(16).padStart(4, '0');
        index += 1;
        continue;
      }
      codeUnit = 0xfffd;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) codeUnit = 0xfffd;
    hex += codeUnit.toString(16).padStart(4, '0');
  }
  return `<${hex}>`;
}

interface DrawPdfPage {
  jpeg: Uint8Array;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

function buildDrawPdfFromJpegs(title: string, pages: readonly DrawPdfPage[]): Uint8Array {
  if (pages.length === 0 || pages.length > DRAW_PDF_LIMITS.maxPages) throw new DrawModelError('pdf-page-limit');
  const titleHex = pdfTitleHex(title);
  const pageObjectIds = pages.map((_, index) => 5 + index * 3);
  const infoId = 3 + pages.length * 3;
  const offsets = new Array<number>(infoId + 1).fill(0);
  const parts: Uint8Array[] = [];
  let outputLength = 0;
  const append = (part: Uint8Array): void => {
    if (outputLength + part.byteLength > DRAW_PDF_LIMITS.maxBytes) throw new DrawModelError('pdf-size-boundary');
    parts.push(part);
    outputLength += part.byteLength;
  };
  const appendText = (value: string): void => append(pdfEncoder.encode(value));
  const addObject = (id: number, body: readonly Uint8Array[]): void => {
    offsets[id] = outputLength;
    appendText(`${id} 0 obj\n`);
    for (const part of body) append(part);
    appendText('\nendobj\n');
  };

  appendText('%PDF-1.4\n%VGT Draw\n');
  addObject(1, [pdfEncoder.encode('<< /Type /Catalog /Pages 2 0 R >>')]);
  addObject(2, [pdfEncoder.encode(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)]);

  for (const [index, page] of pages.entries()) {
    const imageId = 3 + index * 3;
    const contentId = imageId + 1;
    const pageId = imageId + 2;
    const imageHeader = `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.byteLength} >>\nstream\n`;
    addObject(imageId, [pdfEncoder.encode(imageHeader), page.jpeg, pdfEncoder.encode('\nendstream')]);

    const content = `q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im${index + 1} Do\nQ`;
    const contentBytes = pdfEncoder.encode(content);
    addObject(contentId, [pdfEncoder.encode(`<< /Length ${contentBytes.byteLength} >>\nstream\n`), contentBytes, pdfEncoder.encode('\nendstream')]);

    const pageObject = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    addObject(pageId, [pdfEncoder.encode(pageObject)]);
  }

  addObject(infoId, [pdfEncoder.encode(`<< /Title ${titleHex} /Producer (Astraea Draw) >>`)]);
  const xrefOffset = outputLength;
  appendText(`xref\n0 ${infoId + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= infoId; id += 1) {
    const offset = offsets[id];
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 9_999_999_999) throw new DrawModelError('pdf-offset-boundary');
    appendText(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  appendText(`trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const output = new Uint8Array(outputLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export async function buildDrawPdf(
  title: string,
  model: DrawDocumentModel,
  pageIds?: readonly string[],
): Promise<Uint8Array> {
  assertDrawDocument(model);
  pdfTitleHex(title);
  if (pageIds !== undefined && !Array.isArray(pageIds)) throw new DrawModelError('pdf-page-limit');
  const ids = pageIds?.length ? [...pageIds] : model.pages.map((page) => page.id);
  if (ids.length === 0 || ids.length > DRAW_PDF_LIMITS.maxPages || new Set(ids).size !== ids.length) {
    throw new DrawModelError('pdf-page-limit');
  }

  const pages: DrawPdfPage[] = [];
  let aggregateJpegBytes = 0;
  for (const id of ids) {
    const page = model.pages.find((candidate) => candidate.id === id);
    if (!page) throw new DrawModelError('page-missing');
    const jpegDataUrl = await rasterizeSvgToDataUrl(buildDrawSvg(model, id), 'image/jpeg', 1.5);
    const jpeg = decodeRasterDataUrl(jpegDataUrl);
    aggregateJpegBytes += jpeg.byteLength;
    if (aggregateJpegBytes > DRAW_PDF_LIMITS.maxAggregateJpegBytes) throw new DrawModelError('pdf-image-budget-exceeded');
    const imageBounds = jpegDimensions(jpeg);
    pages.push({ jpeg, width: page.width, height: page.height, imageWidth: imageBounds.width, imageHeight: imageBounds.height });
  }
  return buildDrawPdfFromJpegs(title, pages);
}
