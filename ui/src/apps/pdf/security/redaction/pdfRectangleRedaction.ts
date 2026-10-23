// STATUS: DIAMANT VGT SUPREME — fail-closed arbitrary rectangle redaction for canonical structured PDFs.
// Intersecting structured objects are removed/destructively rewritten before an optional visual overlay is added.

import type { PdfDocumentModel, PdfFormFieldValue, PdfPageBox, PdfSectionModel, PdfVectorObject } from '../../../../shared/contracts/workspace';
import { redactStructuredPdfImageRectangle, type PdfImageRasterAdapter } from './pdfImageRedaction';
import { getStructuredPdfTextGeometry, intersectPdfBoxes, normalizeStructuredPdfRectangle } from './geometry/pdfStructuredRedactionGeometry';

export const PDF_RECTANGLE_REDACTION_LIMITS = Object.freeze({
  maxTargets: 10_000,
  maxTargetBytes: 8 * 1024 * 1024,
  maxReasonLength: 512,
  maxOverlayText: 128,
  maxImagesPerRectangle: 64,
});

export interface PdfRectangleRedactionRequest {
  pageNumber: number;
  rectangle: PdfPageBox;
  reason: string;
  overlayColor?: string;
  overlayText?: string;
}

export interface PdfRectangleRedactionResult {
  model: PdfDocumentModel;
  verificationTargets: string[];
  originalImageSha256: string[];
  removed: {
    textObjects: number;
    images: number;
    vectors: number;
    links: number;
    formFields: number;
    annotations: number;
  };
  rectangle: PdfPageBox;
}

function cleanReason(value: string): string {
  const reason = value.replace(/\u0000/gu, '').trim().slice(0, PDF_RECTANGLE_REDACTION_LIMITS.maxReasonLength);
  if (!reason) throw new Error('A redaction reason is required.');
  return reason;
}

function cleanOverlayText(value: string | undefined): string {
  return (value ?? 'REDACTED').replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, PDF_RECTANGLE_REDACTION_LIMITS.maxOverlayText);
}

function cleanOverlayColor(value: string | undefined): string {
  const color = (value ?? '#000000').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/u.test(color)) throw new Error('Redaction overlay color must be a six-digit hex color.');
  return color;
}

function formValueStrings(value: PdfFormFieldValue): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'boolean') return [];
  return value ? [value] : [];
}

function addTarget(targets: Set<string>, value: string | undefined, budget: { bytes: number }): void {
  const cleaned = (value ?? '').trim();
  if (!cleaned) return;
  const bytes = new TextEncoder().encode(cleaned).byteLength;
  if (targets.size >= PDF_RECTANGLE_REDACTION_LIMITS.maxTargets || budget.bytes + bytes > PDF_RECTANGLE_REDACTION_LIMITS.maxTargetBytes) {
    throw new Error('Rectangle redaction verification-target budget exceeded.');
  }
  targets.add(cleaned);
  budget.bytes += bytes;
}

function overlayTextColor(background: string): string {
  const r = parseInt(background.slice(1, 3), 16);
  const g = parseInt(background.slice(3, 5), 16);
  const b = parseInt(background.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#ffffff';
}

function overlayObjects(pageNumber: number, rectangle: PdfPageBox, color: string, text: string, now: number): { vector: PdfVectorObject; section?: PdfSectionModel } {
  const id = `rectangle-redaction-${now}-${pageNumber}`;
  const vector: PdfVectorObject = {
    id: `${id}-overlay`,
    type: 'rectangle',
    bounds: { ...rectangle },
    strokeColor: color,
    fillColor: color,
    lineWidth: 0.1,
    zIndex: 1_000_000,
  };
  if (!text || rectangle.width < 28 || rectangle.height < 12) return { vector };
  const inset = Math.min(4, rectangle.width * 0.05, rectangle.height * 0.15);
  return {
    vector,
    section: {
      id: `${id}-label`,
      type: 'callout',
      content: text,
      bounds: {
        x: rectangle.x + inset,
        y: rectangle.y + inset,
        width: Math.max(1, rectangle.width - inset * 2),
        height: Math.max(1, rectangle.height - inset * 2),
      },
      style: { requestedFont: 'Helvetica', resolvedFont: 'Helvetica-Bold', fontSize: Math.max(6, Math.min(12, rectangle.height * 0.28)), color: overlayTextColor(color) },
      zIndex: 1_000_001,
    },
  };
}

export async function redactStructuredPdfRectangle(
  model: PdfDocumentModel,
  request: PdfRectangleRedactionRequest,
  now = Date.now(),
  rasterAdapter?: PdfImageRasterAdapter,
): Promise<PdfRectangleRedactionResult> {
  if (model.rawPdfDataUrl) throw new Error('Arbitrary rectangle redaction of native PDFs requires the standards parser/renderer.');
  const sourcePage = model.pages.find((candidate) => candidate.pageNumber === request.pageNumber);
  if (!sourcePage) throw new Error('Rectangle redaction page does not exist.');
  const rectangle = normalizeStructuredPdfRectangle(sourcePage, request.rectangle);
  const reason = cleanReason(request.reason);
  const overlayColor = cleanOverlayColor(request.overlayColor);
  const overlayText = cleanOverlayText(request.overlayText);
  const targets = new Set<string>();
  const budget = { bytes: 0 };

  const geometry = getStructuredPdfTextGeometry(sourcePage).filter((entry) => intersectPdfBoxes(entry.bounds, rectangle));
  const hitKinds = new Set(geometry.map((entry) => entry.kind));
  const hitSections = new Set(geometry.flatMap((entry) => entry.sectionId ? [entry.sectionId] : []));
  for (const entry of geometry) addTarget(targets, entry.text, budget);

  const hitImages = (sourcePage.images ?? []).filter((image) => intersectPdfBoxes(image.bounds, rectangle));
  if (hitImages.length > PDF_RECTANGLE_REDACTION_LIMITS.maxImagesPerRectangle) throw new Error('Rectangle intersects too many image objects.');
  const hitVectors = new Set((sourcePage.vectors ?? []).filter((vector) => intersectPdfBoxes(vector.bounds, rectangle)).map((vector) => vector.id));
  const hitLinks = new Set((sourcePage.links ?? []).filter((link) => intersectPdfBoxes(link.bounds, rectangle)).map((link) => link.id));
  for (const link of sourcePage.links ?? []) if (hitLinks.has(link.id) && link.target.kind === 'url') addTarget(targets, link.target.url, budget);

  const hitForms = new Set((model.formFields ?? []).filter((field) => field.page === request.pageNumber && intersectPdfBoxes(field.bounds, rectangle)).map((field) => field.id));
  for (const field of model.formFields ?? []) {
    if (!hitForms.has(field.id)) continue;
    addTarget(targets, field.label, budget);
    addTarget(targets, field.tooltip, budget);
    for (const value of formValueStrings(field.value)) addTarget(targets, value, budget);
  }

  const hitAnnotations = new Set(model.annotations.filter((annotation) => annotation.page === request.pageNumber && (
    (annotation.bounds && intersectPdfBoxes(annotation.bounds, rectangle)) || (annotation.sectionId && hitSections.has(annotation.sectionId))
  )).map((annotation) => annotation.id));
  const hitOcrWordIds = new Set<string>();
  for (const line of sourcePage.ocrLayer?.lines ?? []) {
    for (const word of line.words) {
      if (!intersectPdfBoxes(word.bounds, rectangle)) continue;
      hitOcrWordIds.add(word.id);
      addTarget(targets, word.text, budget);
    }
  }

  const pages = model.pages.map((page) => {
    if (page.pageNumber !== request.pageNumber) return page;
    const decorations = page.decorations ? { ...page.decorations } : undefined;
    if (decorations) {
      if (hitKinds.has('header')) decorations.headerText = undefined;
      if (hitKinds.has('footer')) decorations.footerText = undefined;
      if (hitKinds.has('bates')) decorations.batesLabel = undefined;
      if (hitKinds.has('watermark')) decorations.watermarkText = undefined;
    }
    const ocrLines = (page.ocrLayer?.lines ?? []).flatMap((line) => {
      const words = line.words.filter((word) => !hitOcrWordIds.has(word.id));
      if (words.length === 0) return [];
      return [{ ...line, words, text: words.map((word) => word.text).join(' '), confidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length }];
    });
    const ocrLayer = page.ocrLayer ? {
      ...page.ocrLayer,
      lines: ocrLines,
      meanConfidence: ocrLines.length === 0 ? 0 : ocrLines.reduce((sum, line) => sum + line.confidence, 0) / ocrLines.length,
    } : undefined;
    return {
      ...page,
      title: hitKinds.has('title') ? '' : page.title,
      subtitle: hitKinds.has('subtitle') ? undefined : page.subtitle,
      pageLabel: hitKinds.has('page-label') ? undefined : page.pageLabel,
      decorations,
      ocrLayer,
      sections: page.sections.map((section) => hitSections.has(section.id) ? {
        ...section,
        content: '',
        originalContent: undefined,
        isRedacted: true,
        isMarkedForRedaction: false,
        redactionReason: reason,
      } : section),
      vectors: (page.vectors ?? []).filter((vector) => !hitVectors.has(vector.id)),
      links: (page.links ?? []).filter((link) => !hitLinks.has(link.id)),
    };
  });

  let working: PdfDocumentModel = {
    ...model,
    pages,
    annotations: model.annotations.filter((annotation) => !hitAnnotations.has(annotation.id)),
    formFields: (model.formFields ?? []).filter((field) => !hitForms.has(field.id)),
  };
  const originalImageSha256: string[] = [];
  for (const image of hitImages) {
    const result = await redactStructuredPdfImageRectangle(working, {
      pageNumber: request.pageNumber,
      imageId: image.id,
      rectangle,
      reason,
      overlayColor,
      overlayText: '',
    }, now + originalImageSha256.length + 1, rasterAdapter);
    working = result.model;
    originalImageSha256.push(result.originalSha256);
  }

  const overlay = overlayObjects(request.pageNumber, rectangle, overlayColor, overlayText, now);
  working = {
    ...working,
    pages: working.pages.map((page) => page.pageNumber !== request.pageNumber ? page : {
      ...page,
      vectors: [...(page.vectors ?? []), overlay.vector],
      sections: overlay.section ? [...page.sections, overlay.section] : page.sections,
    }),
    redactions: [...working.redactions, {
      id: `redact-rectangle-${now}-${request.pageNumber}`,
      page: request.pageNumber,
      ...rectangle,
      reason,
      isApplied: true,
      targetKind: 'rectangle',
      timestamp: now,
    }],
  };

  return {
    model: working,
    verificationTargets: [...targets],
    originalImageSha256,
    rectangle,
    removed: {
      textObjects: geometry.length + hitOcrWordIds.size,
      images: hitImages.length,
      vectors: hitVectors.size,
      links: hitLinks.size,
      formFields: hitForms.size,
      annotations: hitAnnotations.size,
    },
  };
}
