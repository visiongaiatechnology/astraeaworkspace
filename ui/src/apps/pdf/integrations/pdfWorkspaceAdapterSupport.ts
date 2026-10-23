// STATUS: DIAMANT VGT SUPREME — shared, bounded PDF workspace adapter primitives.
import type { PdfDocumentModel, PdfPageModel, WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';

export const MAX_EXPORT_TEXT = 2 * 1024 * 1024;

export const MAX_GRID_CELLS = 10_000;

export const MAX_ANNOTATION_TASKS = 2_000;

export const MAX_SELECTED_PAGES = 500;

export const MAX_FORM_FIELDS = 5_000;

export function entityId(prefix: string): string {
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
  return `${prefix}-${suffix}`;
}

export function nowVersioned(document: WorkspaceDocument): WorkspaceDocument {
  return { ...document, modified_at: Date.now(), version: document.version + 1 };
}

export function pdfDocumentUri(documentId: string): string {
  return `vgt://workspace/document/${encodeURIComponent(documentId)}`;
}

export function pdfPageUri(documentId: string, pageNumber: number): string {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('PDF page number must be a positive integer.');
  return `${pdfDocumentUri(documentId)}/pdf/page/${pageNumber}`;
}

export function pdfAnnotationUri(documentId: string, annotationId: string): string {
  if (!annotationId.trim()) throw new Error('PDF annotation ID is required.');
  return `${pdfDocumentUri(documentId)}/pdf/annotation/${encodeURIComponent(annotationId)}`;
}

export function cleanText(value: unknown, max = 20_000): string {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

export function pdfModel(source: WorkspaceDocument): PdfDocumentModel {
  if (source.kind !== 'PdfStudio' || !source.pdfData) throw new Error('Astraea PDF Studio source document is required.');
  return source.pdfData;
}

export function pageSnapshot(page: PdfPageModel) {
  return {
    type: 'pdf-page' as const,
    pageNumber: page.pageNumber,
    title: cleanText(page.title, 500),
    subtitle: page.subtitle ? cleanText(page.subtitle, 1_000) : undefined,
    sections: page.sections.slice(0, 2_000).map((section) => ({
      id: section.id,
      type: section.type,
      content: cleanText(section.content, 20_000),
    })),
  };
}

export function sourceReference(uri: string, cachedSnapshot?: WorkspaceObject): WorkspaceObject {
  const id = entityId('pdf-workspace-ref');
  return {
    type: 'WorkspaceReference',
    data: { id, uri, mode: 'Live', cached_snapshot: cachedSnapshot },
  };
}
