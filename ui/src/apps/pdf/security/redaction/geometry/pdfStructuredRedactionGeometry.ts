// STATUS: DIAMANT VGT SUPREME — conservative geometry for structured-PDF redaction.
// Geometry mirrors the structured exporter. Flow blocks deliberately use full content width so
// rectangle redaction may over-redact, but must never under-redact a visually intersecting block.

import type { PdfPageBox, PdfPageModel, PdfSectionModel } from '../../../../../shared/contracts/workspace';
import { reflowPdfText, resolvePdfBase14Font } from '../../../editing/pdfDirectContentEditing';

export const PDF_STRUCTURED_MARGIN = 54;
const DEFAULT_MEDIA_BOX: PdfPageBox = { x: 0, y: 0, width: 595.28, height: 841.89 };

export type PdfStructuredTextGeometryKind =
  | 'title'
  | 'subtitle'
  | 'page-label'
  | 'header'
  | 'footer'
  | 'bates'
  | 'watermark'
  | 'section';

export interface PdfStructuredTextGeometry {
  kind: PdfStructuredTextGeometryKind;
  bounds: PdfPageBox;
  text: string;
  sectionId?: string;
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

function assertBox(box: PdfPageBox, label: string): void {
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0 || box.width > 20_000 || box.height > 20_000) {
    throw new Error(`${label} has invalid PDF geometry.`);
  }
}

function slotBounds(media: PdfPageBox, startBaseline: number, endBaseline: number, size: number): PdfPageBox {
  const y = Math.max(media.y, endBaseline);
  const top = Math.min(media.y + media.height, startBaseline + size * 1.05);
  return {
    x: media.x + PDF_STRUCTURED_MARGIN,
    y,
    width: Math.max(1, media.width - PDF_STRUCTURED_MARGIN * 2),
    height: Math.max(1, top - y),
  };
}

export function getStructuredPdfTextGeometry(page: PdfPageModel): PdfStructuredTextGeometry[] {
  const media = page.mediaBox ?? DEFAULT_MEDIA_BOX;
  assertBox(media, `Page ${page.pageNumber} media box`);
  const result: PdfStructuredTextGeometry[] = [];
  let y = media.y + media.height - PDF_STRUCTURED_MARGIN;

  const addFlow = (
    kind: PdfStructuredTextGeometryKind,
    text: string | undefined,
    size: number,
    gap: number,
    maxWrap: number,
    section?: PdfSectionModel,
  ) => {
    if (!text) return;
    const start = y;
    const bold = section?.type === 'header' || section?.type === 'key-value';
    const resolution = section ? resolvePdfBase14Font(section.style?.requestedFont ?? section.style?.resolvedFont, bold) : null;
    const lines = section?.style
      ? reflowPdfText(text, Math.max(1, media.width - 2 * PDF_STRUCTURED_MARGIN), { ...section.style, resolvedFont: resolution!.resolved, fontSize: size })
      : wrapText(text, maxWrap);
    for (const _line of lines) y -= size * 1.35 + gap;
    result.push({ kind, text, sectionId: section?.id, bounds: slotBounds(media, start, y, size) });
  };

  addFlow('header', page.decorations?.headerText, 8, 5, 86);
  if (page.title) addFlow('title', page.title, 18, 6, 72);
  if (page.subtitle) addFlow('subtitle', page.subtitle, 10, 12, 88);

  for (const section of page.sections.filter((candidate) => !candidate.bounds)) {
    if (y < media.y + PDF_STRUCTURED_MARGIN + 50) break;
    const text = section.isRedacted ? '[REDACTED]' : section.content;
    const size = Math.max(4, Math.min(144, section.style?.fontSize ?? (section.type === 'header' ? 13 : 10)));
    addFlow('section', text, size, section.type === 'header' ? 4 : 2, section.type === 'header' ? 72 : 88, section);
    y -= section.type === 'header' ? 5 : 3;
  }

  for (const section of page.sections.filter((candidate) => candidate.bounds)) {
    assertBox(section.bounds!, `Page ${page.pageNumber} section ${section.id}`);
    result.push({ kind: 'section', text: section.content, sectionId: section.id, bounds: { ...section.bounds! } });
  }

  const footerWidth = Math.max(1, media.width - 2 * PDF_STRUCTURED_MARGIN);
  if (page.decorations?.footerText) result.push({ kind: 'footer', text: page.decorations.footerText, bounds: { x: media.x + PDF_STRUCTURED_MARGIN, y: media.y + PDF_STRUCTURED_MARGIN - 18, width: footerWidth, height: 14 } });
  if (page.decorations?.batesLabel) result.push({ kind: 'bates', text: page.decorations.batesLabel, bounds: { x: media.x + PDF_STRUCTURED_MARGIN, y: media.y + PDF_STRUCTURED_MARGIN - 30, width: footerWidth * 0.55, height: 14 } });
  if (page.pageLabel) result.push({ kind: 'page-label', text: page.pageLabel, bounds: { x: media.x + media.width - PDF_STRUCTURED_MARGIN - 110, y: media.y + PDF_STRUCTURED_MARGIN - 18, width: 110, height: 14 } });
  if (page.decorations?.watermarkText) result.push({ kind: 'watermark', text: page.decorations.watermarkText, bounds: { x: media.x + media.width * 0.12, y: media.y + media.height * 0.46, width: media.width * 0.76, height: 42 } });
  return result;
}

export function intersectPdfBoxes(a: PdfPageBox, b: PdfPageBox): PdfPageBox | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (![x1, y1, x2, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function normalizeStructuredPdfRectangle(page: PdfPageModel, rectangle: PdfPageBox): PdfPageBox {
  const media = page.mediaBox ?? DEFAULT_MEDIA_BOX;
  assertBox(media, `Page ${page.pageNumber} media box`);
  assertBox(rectangle, 'Redaction rectangle');
  const clipped = intersectPdfBoxes(media, rectangle);
  if (!clipped || clipped.width < 0.5 || clipped.height < 0.5) throw new Error('Redaction rectangle does not overlap the page or is too small.');
  return clipped;
}
