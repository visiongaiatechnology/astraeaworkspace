// STATUS: PLATIN — fail-closed neutral contract for bounded PDF text and link inspection.
import { PDF_WORKSPACE_IMPORT_LIMITS } from '../../interop/pdfWorkspaceImport';

export interface PdfInspectionSnapshot {
  readonly pageCount: number;
  readonly hasJavaScriptActions: boolean;
}

export interface PdfInspectionTextItem {
  readonly str: string;
}

export interface PdfInspectionLink {
  readonly url: string | null;
}

export interface PdfInspectionDocument {
  readonly snapshot: PdfInspectionSnapshot;
  getTextItems(pageNumber: number): Promise<readonly PdfInspectionTextItem[]>;
  getLinks(pageNumber: number): Promise<readonly PdfInspectionLink[]>;
  destroy(): Promise<void>;
}

export interface PdfDocumentInspectionHost {
  openDocument(sourceBytes: Uint8Array): Promise<PdfInspectionDocument>;
}

export class PdfDocumentInspectionHostUnavailableError extends Error {
  constructor() {
    super('pdf_document_inspection_host_unavailable');
    this.name = 'PdfDocumentInspectionHostUnavailableError';
  }
}

let activeHost: PdfDocumentInspectionHost | undefined;
let activeRegistration: symbol | undefined;

export function registerPdfDocumentInspectionHost(host: PdfDocumentInspectionHost): () => void {
  if (!host || typeof host !== 'object' || typeof host.openDocument !== 'function') {
    throw new TypeError('pdf_document_inspection_host_invalid');
  }
  if (activeHost) throw new Error('pdf_document_inspection_host_already_registered');

  const registration = Symbol('pdf-document-inspection-host');
  activeHost = host;
  activeRegistration = registration;
  return () => {
    if (activeRegistration !== registration) return;
    activeHost = undefined;
    activeRegistration = undefined;
  };
}

function validateSourceBytes(sourceBytes: Uint8Array): void {
  if (!(sourceBytes instanceof Uint8Array)
    || sourceBytes.byteLength < 1
    || sourceBytes.byteLength > PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes) {
    throw new TypeError('pdf_document_inspection_bytes_invalid');
  }
}

function assertPageNumber(pageNumber: number, pageCount: number): void {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    throw new RangeError('pdf_document_inspection_page_invalid');
  }
}

function wrapInspectionDocument(document: PdfInspectionDocument): PdfInspectionDocument {
  if (!document || typeof document !== 'object'
    || !document.snapshot || typeof document.snapshot !== 'object'
    || !Number.isInteger(document.snapshot.pageCount)
    || document.snapshot.pageCount < 1
    || document.snapshot.pageCount > 100_000
    || typeof document.snapshot.hasJavaScriptActions !== 'boolean'
    || typeof document.getTextItems !== 'function'
    || typeof document.getLinks !== 'function'
    || typeof document.destroy !== 'function') {
    throw new TypeError('pdf_document_inspection_document_invalid');
  }

  const snapshot = Object.freeze({
    pageCount: document.snapshot.pageCount,
    hasJavaScriptActions: document.snapshot.hasJavaScriptActions,
  });
  let destroyed = false;

  return Object.freeze({
    snapshot,
    async getTextItems(pageNumber: number): Promise<readonly PdfInspectionTextItem[]> {
      if (destroyed) throw new Error('pdf_document_inspection_document_destroyed');
      assertPageNumber(pageNumber, snapshot.pageCount);
      return document.getTextItems(pageNumber);
    },
    async getLinks(pageNumber: number): Promise<readonly PdfInspectionLink[]> {
      if (destroyed) throw new Error('pdf_document_inspection_document_destroyed');
      assertPageNumber(pageNumber, snapshot.pageCount);
      return document.getLinks(pageNumber);
    },
    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await document.destroy();
    },
  });
}

export async function openPdfDocumentForInspection(sourceBytes: Uint8Array): Promise<PdfInspectionDocument> {
  validateSourceBytes(sourceBytes);
  const host = activeHost;
  if (!host) throw new PdfDocumentInspectionHostUnavailableError();
  return wrapInspectionDocument(await host.openDocument(sourceBytes));
}
