// STATUS: DIAMANT VGT SUPREME
// Deterministic structured-PDF flow layout shared by on-screen print view and PDF serialization.

import type { PdfAnnotation, PdfBase14Font, PdfPageBox, PdfPageModel } from '../../../shared/contracts/workspace';
import { reflowPdfText, resolvePdfBase14Font } from '../editing/pdfDirectContentEditing';

export type PdfFlowRole = 'H1' | 'H2' | 'P' | 'Note' | 'Table';
export type PdfFlowSourceKind = 'header-decoration' | 'title' | 'subtitle' | 'section' | 'annotations-heading' | 'annotation';

export interface PdfFlowBlock {
  id: string;
  sourceKind: PdfFlowSourceKind;
  sourceId?: string;
  role: PdfFlowRole;
  artifact: boolean;
  lines: string[];
  baselines: number[];
  x: number;
  fontSize: number;
  font: PdfBase14Font;
  color?: string;
  /** Conservative screen hit/edit rectangle expressed in PDF points. */
  bounds: PdfPageBox;
}

export interface PdfFixedTextItem {
  id: string;
  kind: 'watermark' | 'footer' | 'bates' | 'page-label';
  text: string;
  x: number;
  baseline: number;
  fontSize: number;
  font: PdfBase14Font;
  color?: string;
  artifact: true;
}

export interface PdfStructuredPageLayout {
  mediaBox: PdfPageBox;
  margin: number;
  flowBlocks: PdfFlowBlock[];
  fixedText: PdfFixedTextItem[];
}

export const DEFAULT_PDF_MEDIA_BOX: PdfPageBox = { x: 0, y: 0, width: 595.28, height: 841.89 };
export const STRUCTURED_PDF_MARGIN = 54;

const MAX_LAYOUT_TEXT = 2 * 1024 * 1024;
const MAX_LAYOUT_BLOCKS = 8_192;

const boundedText = (value: string, label: string): string => {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n');
  if (normalized.length > MAX_LAYOUT_TEXT) throw new Error(`${label} exceeds structured PDF layout policy.`);
  return normalized;
};

const wrapByCharacters = (textRaw: string, max = 86): string[] => {
  const text = boundedText(textRaw, 'Layout text');
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
};

const assertMediaBox = (box: PdfPageBox): PdfPageBox => {
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 1 || box.height <= 1) {
    throw new Error('Structured PDF page has an invalid media box.');
  }
  return box;
};

const blockBounds = (x: number, baselines: readonly number[], size: number, width: number): PdfPageBox => {
  const first = baselines[0] ?? 0;
  const last = baselines[baselines.length - 1] ?? first;
  const bottom = last - size * 0.28;
  const top = first + size * 0.92;
  return { x, y: bottom, width: Math.max(1, width), height: Math.max(size, top - bottom) };
};

export function buildStructuredPdfPageLayout(
  page: PdfPageModel,
  pageIndex: number,
  pageCount: number,
  annotations: readonly PdfAnnotation[],
): PdfStructuredPageLayout {
  const mediaBox = assertMediaBox(page.mediaBox ?? DEFAULT_PDF_MEDIA_BOX);
  const margin = STRUCTURED_PDF_MARGIN;
  const contentWidth = Math.max(1, mediaBox.width - 2 * margin);
  let y = mediaBox.y + mediaBox.height - margin;
  const flowBlocks: PdfFlowBlock[] = [];
  const fixedText: PdfFixedTextItem[] = [];

  const pushBlock = (input: {
    id: string;
    sourceKind: PdfFlowSourceKind;
    sourceId?: string;
    role: PdfFlowRole;
    artifact?: boolean;
    lines: string[];
    fontSize: number;
    font: PdfBase14Font;
    gap: number;
    color?: string;
  }): void => {
    if (flowBlocks.length >= MAX_LAYOUT_BLOCKS) throw new Error('Structured PDF page exceeds the flow-block layout policy.');
    const lines = input.lines.length ? input.lines : [''];
    const baselines: number[] = [];
    for (const _line of lines) {
      baselines.push(y);
      y -= input.fontSize * 1.35 + input.gap;
    }
    flowBlocks.push({
      id: input.id,
      sourceKind: input.sourceKind,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      role: input.role,
      artifact: input.artifact === true,
      lines,
      baselines,
      x: mediaBox.x + margin,
      fontSize: input.fontSize,
      font: input.font,
      ...(input.color ? { color: input.color } : {}),
      bounds: blockBounds(mediaBox.x + margin, baselines, input.fontSize, contentWidth),
    });
  };

  if (page.decorations?.headerText) {
    pushBlock({ id: `header-${page.pageNumber}`, sourceKind: 'header-decoration', role: 'P', artifact: true, lines: [boundedText(page.decorations.headerText, 'Header')], fontSize: 8, font: 'Helvetica', gap: 5 });
  }

  pushBlock({
    id: `title-${page.pageNumber}`,
    sourceKind: 'title',
    role: 'H1',
    lines: wrapByCharacters(page.title || `Page ${pageIndex + 1}`, 72),
    fontSize: 18,
    font: 'Helvetica-Bold',
    gap: 6,
  });

  if (page.subtitle) {
    pushBlock({ id: `subtitle-${page.pageNumber}`, sourceKind: 'subtitle', role: 'P', lines: wrapByCharacters(page.subtitle, 88), fontSize: 10, font: 'Helvetica', gap: 12 });
  }

  for (const section of page.sections.filter((candidate) => !candidate.bounds)) {
    if (y < mediaBox.y + margin + 50) break;
    const text = section.isRedacted ? '[REDACTED]' : boundedText(section.content, 'Section content');
    const defaultSize = section.type === 'header' ? 13 : 10;
    const bold = section.type === 'header' || section.type === 'key-value';
    const role: PdfFlowRole = section.type === 'header' ? 'H2' : section.type === 'callout' ? 'Note' : section.type === 'table' ? 'Table' : 'P';
    const resolution = resolvePdfBase14Font(section.style?.requestedFont ?? section.style?.resolvedFont, bold);
    const size = Math.max(4, Math.min(144, section.style?.fontSize ?? defaultSize));
    const lines = section.style
      ? reflowPdfText(text, contentWidth, { ...section.style, resolvedFont: resolution.resolved, fontSize: size })
      : wrapByCharacters(text, section.type === 'header' ? 72 : 88);
    pushBlock({
      id: `section-${section.id}`,
      sourceKind: 'section',
      sourceId: section.id,
      role,
      lines,
      fontSize: size,
      font: resolution.resolved,
      gap: section.type === 'header' ? 4 : 2,
      ...(section.style?.color ? { color: section.style.color } : {}),
    });
    y -= section.type === 'header' ? 5 : 3;
  }

  const pageAnnotations = annotations.filter((annotation) => annotation.page === page.pageNumber);
  if (pageAnnotations.length && y > mediaBox.y + margin + 70) {
    y -= 6;
    pushBlock({ id: `annotations-heading-${page.pageNumber}`, sourceKind: 'annotations-heading', role: 'H2', lines: ['Annotations'], fontSize: 10, font: 'Helvetica-Bold', gap: 3 });
    for (const annotation of pageAnnotations.slice(0, 8)) {
      if (y < mediaBox.y + margin + 35) break;
      pushBlock({
        id: `annotation-${annotation.id}`,
        sourceKind: 'annotation',
        sourceId: annotation.id,
        role: 'Note',
        lines: wrapByCharacters(`${annotation.type.toUpperCase()}: ${annotation.text}`, 82),
        fontSize: 8,
        font: 'Helvetica',
        gap: 1,
      });
    }
  }

  if (page.decorations?.watermarkText) {
    fixedText.push({ id: `watermark-${page.pageNumber}`, kind: 'watermark', text: boundedText(page.decorations.watermarkText, 'Watermark'), x: mediaBox.x + mediaBox.width * 0.18, baseline: mediaBox.y + mediaBox.height * 0.5, fontSize: 28, font: 'Helvetica-Bold', color: '#bfbfbf', artifact: true });
  }
  if (page.decorations?.footerText) {
    fixedText.push({ id: `footer-${page.pageNumber}`, kind: 'footer', text: boundedText(page.decorations.footerText, 'Footer'), x: mediaBox.x + margin, baseline: mediaBox.y + margin - 12, fontSize: 8, font: 'Helvetica', artifact: true });
  }
  if (page.decorations?.batesLabel) {
    fixedText.push({ id: `bates-${page.pageNumber}`, kind: 'bates', text: boundedText(page.decorations.batesLabel, 'Bates label'), x: mediaBox.x + margin, baseline: mediaBox.y + margin - 24, fontSize: 8, font: 'Helvetica', artifact: true });
  }
  fixedText.push({
    id: `page-label-${page.pageNumber}`,
    kind: 'page-label',
    text: `${page.pageLabel || `Page ${pageIndex + 1}`} of ${pageCount}`,
    x: mediaBox.x + mediaBox.width - margin - 90,
    baseline: mediaBox.y + margin - 12,
    fontSize: 8,
    font: 'Helvetica',
    artifact: true,
  });

  return { mediaBox, margin, flowBlocks, fixedText };
}
