// STATUS: PLATIN — fail-closed Core port for PDF inspection, raster import, and model normalization.
import type { PdfDocumentModel, PdfNativeInspectionSnapshot, PdfNormalizedJpegSource } from '../../shared/contracts/notes-pdf/pdf/workspacePdf';

export const PDF_WORKSPACE_IMPORT_LIMITS = Object.freeze({
  maxNativePdfBytes: 96 * 1024 * 1024,
});

export interface PdfWorkspaceImportHost {
  inspectNativePdfBytes(bytes: Uint8Array): Promise<PdfNativeInspectionSnapshot>;
  flattenForeignPdfBytes(bytes: Uint8Array, sourceName: string): Promise<readonly PdfNormalizedJpegSource[]>;
  createPdfModelFromNormalizedJpegs(sources: readonly PdfNormalizedJpegSource[]): PdfDocumentModel;
}

export class PdfWorkspaceImportHostUnavailableError extends Error {
  constructor() {
    super('pdf_workspace_import_host_unavailable');
    this.name = 'PdfWorkspaceImportHostUnavailableError';
  }
}

let activeHost: PdfWorkspaceImportHost | undefined;
let activeRegistration: symbol | undefined;

export function registerPdfWorkspaceImportHost(host: PdfWorkspaceImportHost): () => void {
  if (!host || typeof host !== 'object'
    || typeof host.inspectNativePdfBytes !== 'function'
    || typeof host.flattenForeignPdfBytes !== 'function'
    || typeof host.createPdfModelFromNormalizedJpegs !== 'function') {
    throw new TypeError('pdf_workspace_import_host_invalid');
  }
  if (activeHost) throw new Error('pdf_workspace_import_host_already_registered');

  const registration = Symbol('pdf-workspace-import-host');
  activeHost = host;
  activeRegistration = registration;
  return () => {
    if (activeRegistration !== registration) return;
    activeHost = undefined;
    activeRegistration = undefined;
  };
}

function requireHost(): PdfWorkspaceImportHost {
  const host = activeHost;
  if (!host) throw new PdfWorkspaceImportHostUnavailableError();
  return host;
}

function assertPdfBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes) {
    throw new TypeError('pdf_workspace_import_bytes_invalid');
  }
}

export async function inspectNativePdfBytes(bytes: Uint8Array): Promise<PdfNativeInspectionSnapshot> {
  assertPdfBytes(bytes);
  return requireHost().inspectNativePdfBytes(bytes);
}

export async function flattenForeignPdfBytes(bytes: Uint8Array, sourceName: string): Promise<readonly PdfNormalizedJpegSource[]> {
  assertPdfBytes(bytes);
  if (typeof sourceName !== 'string' || sourceName.length === 0) throw new TypeError('pdf_workspace_import_name_invalid');
  return requireHost().flattenForeignPdfBytes(bytes, sourceName);
}

export function createPdfModelFromNormalizedJpegs(sources: readonly PdfNormalizedJpegSource[]): PdfDocumentModel {
  if (!Array.isArray(sources) || sources.length === 0) throw new TypeError('pdf_workspace_import_images_invalid');
  return requireHost().createPdfModelFromNormalizedJpegs(sources);
}
