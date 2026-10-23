// STATUS: DIAMANT VGT SUPREME — bounded raster export for canonical structured PDF pages.
// Arbitrary native PDFs remain fail-closed until the standards parser/renderer is available.

import type { PdfBase14Font, PdfDocumentModel, PdfFormFieldValue, PdfPageBox, PdfPageModel, PdfSectionModel } from '../../../../shared/contracts/workspace';
import { reflowPdfText, resolvePdfBase14Font } from '../../editing/pdfDirectContentEditing';
import type { PdfConversionArtifact } from '../pdfConversion';

export type PdfRasterFormat = 'png' | 'jpeg' | 'tiff';

export interface PdfRasterRenderFrame {
  rgba: Uint8Array;
  png: Uint8Array;
  jpeg: Uint8Array;
}

export interface PdfRasterRenderAdapter {
  rasterizeSvg(request: { svg: string; widthPx: number; heightPx: number; jpegQuality: number }): Promise<PdfRasterRenderFrame>;
}

export interface PdfRasterExportOptions {
  dpi?: number;
  jpegQuality?: number;
}

export const PDF_RASTER_EXPORT_LIMITS = Object.freeze({
  minDpi: 72,
  maxDpi: 300,
  maxPages: 2_000,
  maxPagePixels: 40_000_000,
  maxTotalPixels: 200_000_000,
  maxOutputBytes: 256 * 1024 * 1024,
  maxTextBytes: 32 * 1024 * 1024,
  maxSectionsPerPage: 4_096,
  maxImagesPerPage: 64,
  maxVectorsPerPage: 4_096,
});

const DEFAULT_MEDIA_BOX: PdfPageBox = { x: 0, y: 0, width: 595.28, height: 841.89 };
const PDF_MARGIN = 54;

const xml = (value: string): string => value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] ?? char));
const safeFile = (value: string): string => (value || 'document').replace(/\.(?:pdf|png|jpe?g|tiff?)$/iu, '').replace(/[^a-z0-9._-]+/giu, '_').slice(0, 110) || 'document';
const finite = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;

function assertModel(model: PdfDocumentModel): void {
  if (model.rawPdfDataUrl) throw new Error('Native PDF raster export requires the standards parser/renderer.');
  if (!Array.isArray(model.pages) || model.pages.length < 1 || model.pages.length > PDF_RASTER_EXPORT_LIMITS.maxPages) throw new Error('Raster export page count exceeds policy.');
  let textBytes = 0;
  for (const page of model.pages) {
    if (page.sections.length > PDF_RASTER_EXPORT_LIMITS.maxSectionsPerPage) throw new Error(`Page ${page.pageNumber} exceeds the raster section budget.`);
    if ((page.images?.length ?? 0) > PDF_RASTER_EXPORT_LIMITS.maxImagesPerPage) throw new Error(`Page ${page.pageNumber} exceeds the raster image budget.`);
    if ((page.vectors?.length ?? 0) > PDF_RASTER_EXPORT_LIMITS.maxVectorsPerPage) throw new Error(`Page ${page.pageNumber} exceeds the raster vector budget.`);
    for (const section of page.sections) {
      textBytes += new TextEncoder().encode(section.content).byteLength;
      if (textBytes > PDF_RASTER_EXPORT_LIMITS.maxTextBytes) throw new Error('Raster export text budget exceeded.');
    }
  }
}

function wrapText(text: string, max = 86): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= max) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

function fontFamily(font: PdfBase14Font): string {
  if (font === 'Times-Roman') return 'Times New Roman,Times,serif';
  if (font === 'Courier') return 'Courier New,Courier,monospace';
  return 'Arial,Helvetica,sans-serif';
}

function textSvg(text: string, x: number, baselineY: number, size: number, bold: boolean, font: PdfBase14Font, color = '#000000'): string {
  return `<text x="${x.toFixed(2)}" y="${baselineY.toFixed(2)}" font-family="${xml(fontFamily(font))}" font-size="${size.toFixed(2)}" font-weight="${bold ? '700' : '400'}" fill="${xml(color)}">${xml(text)}</text>`;
}

function pagePointToSvgY(media: PdfPageBox, y: number, height = 0): number {
  return media.height - ((y - media.y) + height);
}

function positionedSectionSvg(section: PdfSectionModel, media: PdfPageBox): string {
  if (!section.bounds) return '';
  const bounds = section.bounds;
  const bold = section.type === 'header' || section.type === 'key-value';
  const resolution = resolvePdfBase14Font(section.style?.requestedFont ?? section.style?.resolvedFont, bold);
  const size = Math.max(4, Math.min(144, section.style?.fontSize ?? (section.type === 'header' ? 13 : 10)));
  const lineHeight = Math.max(0.8, Math.min(3, section.style?.lineHeight ?? 1.35));
  const text = section.isRedacted ? '[REDACTED]' : section.content;
  const lines = reflowPdfText(text, Math.max(1, bounds.width), { ...section.style, resolvedFont: resolution.resolved, fontSize: size });
  const maxLines = Math.max(1, Math.floor(bounds.height / (size * lineHeight)));
  const top = pagePointToSvgY(media, bounds.y, bounds.height);
  return lines.slice(0, maxLines).map((line, index) => textSvg(line, bounds.x - media.x, top + size + index * size * lineHeight, size, bold, resolution.resolved, section.style?.color)).join('');
}

function vectorSvg(page: PdfPageModel, media: PdfPageBox): string {
  return (page.vectors ?? []).map((vector) => {
    const b = vector.bounds;
    const x = b.x - media.x;
    const y = pagePointToSvgY(media, b.y, b.height);
    const stroke = /^#[0-9a-fA-F]{6}$/u.test(vector.strokeColor) ? vector.strokeColor : '#000000';
    const fill = vector.fillColor && /^#[0-9a-fA-F]{6}$/u.test(vector.fillColor) ? vector.fillColor : 'none';
    const width = Math.max(0.1, Math.min(50, vector.lineWidth ?? 1));
    if (vector.type === 'line') return `<line x1="${x.toFixed(2)}" y1="${(y + b.height).toFixed(2)}" x2="${(x + b.width).toFixed(2)}" y2="${y.toFixed(2)}" stroke="${stroke}" stroke-width="${width.toFixed(2)}"/>`;
    if (vector.type === 'ellipse') return `<ellipse cx="${(x + b.width / 2).toFixed(2)}" cy="${(y + b.height / 2).toFixed(2)}" rx="${(b.width / 2).toFixed(2)}" ry="${(b.height / 2).toFixed(2)}" stroke="${stroke}" stroke-width="${width.toFixed(2)}" fill="${fill}"/>`;
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${b.width.toFixed(2)}" height="${b.height.toFixed(2)}" stroke="${stroke}" stroke-width="${width.toFixed(2)}" fill="${fill}"/>`;
  }).join('');
}

function imageSvg(page: PdfPageModel, media: PdfPageBox): string {
  return (page.images ?? []).map((image, index) => {
    const b = image.bounds;
    const x = b.x - media.x;
    const y = pagePointToSvgY(media, b.y, b.height);
    const crop = image.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const visibleW = Math.max(0.01, 1 - crop.left - crop.right);
    const visibleH = Math.max(0.01, 1 - crop.top - crop.bottom);
    const sourceW = b.width / visibleW;
    const sourceH = b.height / visibleH;
    const imageX = x - crop.left * sourceW;
    const imageY = y - crop.top * sourceH;
    const cx = x + b.width / 2;
    const cy = y + b.height / 2;
    const clip = `raster-clip-${page.pageNumber}-${index}`;
    return `<defs><clipPath id="${clip}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${b.width.toFixed(2)}" height="${b.height.toFixed(2)}"/></clipPath></defs><g clip-path="url(#${clip})"><image href="${xml(image.dataUrl)}" x="${imageX.toFixed(2)}" y="${imageY.toFixed(2)}" width="${sourceW.toFixed(2)}" height="${sourceH.toFixed(2)}" preserveAspectRatio="none" transform="rotate(${image.rotation ?? 0} ${cx.toFixed(2)} ${cy.toFixed(2)})"/></g>`;
  }).join('');
}

function formValue(value: PdfFormFieldValue): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'Off';
  return value;
}

function formSvg(model: PdfDocumentModel, page: PdfPageModel, media: PdfPageBox): string {
  return (model.formFields ?? []).filter((field) => field.page === page.pageNumber).map((field) => {
    const b = field.bounds;
    const x = b.x - media.x;
    const y = pagePointToSvgY(media, b.y, b.height);
    const text = formValue(field.value) || field.label || (field.type === 'signature' ? '[Unsigned]' : '');
    return `<g><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${b.width.toFixed(2)}" height="${b.height.toFixed(2)}" fill="#ffffff" stroke="#64748b" stroke-width="0.8"/>${textSvg(text, x + 3, y + Math.min(b.height - 3, 12), Math.max(6, Math.min(11, b.height * 0.45)), false, 'Helvetica')}</g>`;
  }).join('');
}

export function structuredPdfPageToSvg(model: PdfDocumentModel, page: PdfPageModel): { svg: string; widthPt: number; heightPt: number } {
  assertModel(model);
  const media = page.mediaBox ?? DEFAULT_MEDIA_BOX;
  if (![media.x, media.y, media.width, media.height].every(Number.isFinite) || media.width <= 0 || media.height <= 0 || media.width > 20_000 || media.height > 20_000) throw new Error(`Page ${page.pageNumber} has invalid media box geometry.`);
  const background = page.decorations?.backgroundColor && /^#[0-9a-fA-F]{6}$/u.test(page.decorations.backgroundColor) ? page.decorations.backgroundColor : '#ffffff';
  const parts: string[] = [`<rect x="0" y="0" width="${media.width.toFixed(2)}" height="${media.height.toFixed(2)}" fill="${background}"/>`];
  parts.push(imageSvg(page, media), vectorSvg(page, media));
  for (const section of page.sections.filter((candidate) => candidate.bounds)) parts.push(positionedSectionSvg(section, media));

  let yPdf = media.y + media.height - PDF_MARGIN;
  const line = (text: string, size: number, bold = false, gap = 4, font: PdfBase14Font = bold ? 'Helvetica-Bold' : 'Helvetica', color?: string) => {
    const ySvg = media.height - (yPdf - media.y);
    parts.push(textSvg(text, PDF_MARGIN, ySvg, size, bold, font, color));
    yPdf -= size * 1.35 + gap;
  };
  const block = (text: string, size: number, bold: boolean, gap: number, maxWrap: number, font?: PdfBase14Font, color?: string) => {
    for (const value of wrapText(text, maxWrap)) line(value, size, bold, gap, font, color);
  };

  if (page.decorations?.headerText) line(page.decorations.headerText, 8, false, 5);
  block(page.title || `Page ${page.pageNumber}`, 18, true, 6, 72);
  if (page.subtitle) block(page.subtitle, 10, false, 12, 88);
  for (const section of page.sections.filter((candidate) => !candidate.bounds)) {
    if (yPdf < media.y + PDF_MARGIN + 50) break;
    const text = section.isRedacted ? '[REDACTED]' : section.content;
    const bold = section.type === 'header' || section.type === 'key-value';
    const resolution = resolvePdfBase14Font(section.style?.requestedFont ?? section.style?.resolvedFont, bold);
    const size = Math.max(4, Math.min(144, section.style?.fontSize ?? (section.type === 'header' ? 13 : 10)));
    const values = section.style ? reflowPdfText(text, media.width - 2 * PDF_MARGIN, { ...section.style, resolvedFont: resolution.resolved, fontSize: size }) : wrapText(text, section.type === 'header' ? 72 : 88);
    for (const value of values) line(value, size, bold, section.type === 'header' ? 4 : 2, resolution.resolved, section.style?.color);
    yPdf -= section.type === 'header' ? 5 : 3;
  }

  const annotations = model.annotations.filter((annotation) => annotation.page === page.pageNumber);
  if (annotations.length && yPdf > media.y + PDF_MARGIN + 70) {
    yPdf -= 6;
    block('Annotations', 10, true, 3, 82);
    for (const annotation of annotations.slice(0, 8)) {
      if (yPdf < media.y + PDF_MARGIN + 35) break;
      block(`${annotation.type.toUpperCase()}: ${annotation.text}`, 8, false, 1, 82);
    }
  }

  if (page.decorations?.watermarkText) parts.push(textSvg(page.decorations.watermarkText, media.width * 0.18, media.height * 0.5, 28, true, 'Helvetica-Bold', '#bfbfbf'));
  if (page.decorations?.footerText) parts.push(textSvg(page.decorations.footerText, PDF_MARGIN, media.height - (PDF_MARGIN - 12), 8, false, 'Helvetica'));
  if (page.decorations?.batesLabel) parts.push(textSvg(page.decorations.batesLabel, PDF_MARGIN, media.height - (PDF_MARGIN - 24), 8, false, 'Helvetica'));
  parts.push(textSvg(`${page.pageLabel || `Page ${page.pageNumber}`} of ${model.pages.length}`, Math.max(PDF_MARGIN, media.width - PDF_MARGIN - 90), media.height - (PDF_MARGIN - 12), 8, false, 'Helvetica'));
  parts.push(formSvg(model, page, media));

  const base = parts.join('');
  const rotation = page.rotation ?? 0;
  let widthPt = media.width;
  let heightPt = media.height;
  let transform = '';
  if (rotation === 90) { widthPt = media.height; heightPt = media.width; transform = `translate(${media.height.toFixed(2)} 0) rotate(90)`; }
  else if (rotation === 180) transform = `translate(${media.width.toFixed(2)} ${media.height.toFixed(2)}) rotate(180)`;
  else if (rotation === 270) { widthPt = media.height; heightPt = media.width; transform = `translate(0 ${media.width.toFixed(2)}) rotate(-90)`; }
  const content = transform ? `<g transform="${transform}">${base}</g>` : base;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPt.toFixed(2)}" height="${heightPt.toFixed(2)}" viewBox="0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)}">${content}</svg>`, widthPt, heightPt };
}

function putU16(view: DataView, offset: number, value: number): void { view.setUint16(offset, value, true); }
function putU32(view: DataView, offset: number, value: number): void { view.setUint32(offset, value, true); }

export function encodeUncompressedRgbTiff(width: number, height: number, rgba: Uint8Array, dpi: number): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > PDF_RASTER_EXPORT_LIMITS.maxPagePixels) throw new Error('TIFF geometry exceeds policy.');
  if (rgba.byteLength !== width * height * 4) throw new Error('TIFF encoder requires exact RGBA byte length.');
  const tagCount = 11;
  const ifdOffset = 8;
  const ifdSize = 2 + tagCount * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize;
  const xResOffset = bitsOffset + 6;
  const yResOffset = xResOffset + 8;
  const pixelOffset = yResOffset + 8;
  const pixelBytes = width * height * 3;
  const out = new Uint8Array(pixelOffset + pixelBytes);
  const view = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; putU16(view, 2, 42); putU32(view, 4, ifdOffset); putU16(view, ifdOffset, tagCount);
  let entry = ifdOffset + 2;
  const tag = (id: number, type: number, count: number, value: number) => { putU16(view, entry, id); putU16(view, entry + 2, type); putU32(view, entry + 4, count); if (type === 3 && count === 1) { putU16(view, entry + 8, value); putU16(view, entry + 10, 0); } else putU32(view, entry + 8, value); entry += 12; };
  tag(256, 4, 1, width); tag(257, 4, 1, height); tag(258, 3, 3, bitsOffset); tag(259, 3, 1, 1); tag(262, 3, 1, 2); tag(273, 4, 1, pixelOffset); tag(277, 3, 1, 3); tag(278, 4, 1, height); tag(279, 4, 1, pixelBytes); tag(282, 5, 1, xResOffset); tag(283, 5, 1, yResOffset); putU32(view, entry, 0);
  putU16(view, bitsOffset, 8); putU16(view, bitsOffset + 2, 8); putU16(view, bitsOffset + 4, 8);
  putU32(view, xResOffset, Math.round(dpi * 100)); putU32(view, xResOffset + 4, 100); putU32(view, yResOffset, Math.round(dpi * 100)); putU32(view, yResOffset + 4, 100);
  let target = pixelOffset;
  for (let source = 0; source < rgba.length; source += 4) { out[target++] = rgba[source]; out[target++] = rgba[source + 1]; out[target++] = rgba[source + 2]; }
  return out;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> { return new Uint8Array(await blob.arrayBuffer()); }

export const browserPdfRasterRenderAdapter: PdfRasterRenderAdapter = {
  async rasterizeSvg(request) {
    if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') throw new Error('Browser raster export requires DOM canvas APIs.');
    const blob = new Blob([request.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = 'sync';
      image.src = url;
      if (typeof image.decode === 'function') await image.decode();
      else await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('SVG raster decode failed closed.')); });
      const canvas = document.createElement('canvas');
      canvas.width = request.widthPx; canvas.height = request.heightPx;
      const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      if (!context) throw new Error('2D canvas is unavailable for PDF raster export.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const rgba = new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data);
      const toBlob = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`Canvas ${type} encoding failed closed.`)), type, quality));
      const png = await blobBytes(await toBlob('image/png'));
      const jpeg = await blobBytes(await toBlob('image/jpeg', request.jpegQuality));
      return { rgba, png, jpeg };
    } finally { URL.revokeObjectURL(url); }
  },
};

export async function exportStructuredPdfPagesToRaster(
  title: string,
  model: PdfDocumentModel,
  format: PdfRasterFormat,
  options: PdfRasterExportOptions = {},
  adapter: PdfRasterRenderAdapter = browserPdfRasterRenderAdapter,
): Promise<PdfConversionArtifact[]> {
  assertModel(model);
  const dpi = finite(options.dpi ?? 144, 144);
  const jpegQuality = finite(options.jpegQuality ?? 0.9, 0.9);
  if (dpi < PDF_RASTER_EXPORT_LIMITS.minDpi || dpi > PDF_RASTER_EXPORT_LIMITS.maxDpi) throw new Error('Raster export DPI exceeds policy.');
  if (jpegQuality < 0.5 || jpegQuality > 1) throw new Error('Raster JPEG quality exceeds policy.');
  let totalPixels = 0;
  let totalBytes = 0;
  const artifacts: PdfConversionArtifact[] = [];
  for (const page of model.pages) {
    const presentation = structuredPdfPageToSvg(model, page);
    const widthPx = Math.max(1, Math.round((presentation.widthPt / 72) * dpi));
    const heightPx = Math.max(1, Math.round((presentation.heightPt / 72) * dpi));
    const pagePixels = widthPx * heightPx;
    if (pagePixels > PDF_RASTER_EXPORT_LIMITS.maxPagePixels) throw new Error(`Page ${page.pageNumber} raster pixel budget exceeded.`);
    totalPixels += pagePixels;
    if (totalPixels > PDF_RASTER_EXPORT_LIMITS.maxTotalPixels) throw new Error('Raster export total pixel budget exceeded.');
    const frame = await adapter.rasterizeSvg({ svg: presentation.svg, widthPx, heightPx, jpegQuality });
    if (frame.rgba.byteLength !== pagePixels * 4) throw new Error(`Page ${page.pageNumber} raster adapter returned an invalid RGBA frame.`);
    let bytes: Uint8Array;
    let mimeType: string;
    let extension: string;
    if (format === 'png') { bytes = frame.png; mimeType = 'image/png'; extension = 'png'; }
    else if (format === 'jpeg') { bytes = frame.jpeg; mimeType = 'image/jpeg'; extension = 'jpg'; }
    else { bytes = encodeUncompressedRgbTiff(widthPx, heightPx, frame.rgba, dpi); mimeType = 'image/tiff'; extension = 'tiff'; }
    if (!bytes.byteLength) throw new Error(`Page ${page.pageNumber} raster encoder produced an empty file.`);
    totalBytes += bytes.byteLength;
    if (totalBytes > PDF_RASTER_EXPORT_LIMITS.maxOutputBytes) throw new Error('Raster export output-size budget exceeded.');
    artifacts.push({ fileName: `${safeFile(title)}-page-${String(page.pageNumber).padStart(4, '0')}.${extension}`, mimeType, bytes, sourcePages: 1, warnings: ['Raster export is generated from Astraea structured PDF geometry. Arbitrary native PDF pages remain unavailable until the standards renderer is installed.'] });
  }
  return artifacts;
}
