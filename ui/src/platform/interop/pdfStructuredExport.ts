// STATUS: PLATIN — fail-closed Core port for PDF-owned structured serialization.
import type { PdfDocumentModel } from '../../shared/contracts/notes-pdf/pdf/workspacePdf';

export interface PdfStructuredExportHost {
  buildStructuredPdfBytes(title: string, model: PdfDocumentModel): Uint8Array;
}

export class PdfStructuredExportHostUnavailableError extends Error {
  constructor() {
    super('pdf_structured_export_host_unavailable');
    this.name = 'PdfStructuredExportHostUnavailableError';
  }
}

let activeHost: PdfStructuredExportHost | undefined;
let activeRegistration: symbol | undefined;

export function registerPdfStructuredExportHost(host: PdfStructuredExportHost): () => void {
  if (!host || typeof host !== 'object' || typeof host.buildStructuredPdfBytes !== 'function') {
    throw new TypeError('pdf_structured_export_host_invalid');
  }
  if (activeHost) throw new Error('pdf_structured_export_host_already_registered');

  const registration = Symbol('pdf-structured-export-host');
  activeHost = host;
  activeRegistration = registration;
  return () => {
    if (activeRegistration !== registration) return;
    activeHost = undefined;
    activeRegistration = undefined;
  };
}

export function buildStructuredPdfBytes(title: string, model: PdfDocumentModel): Uint8Array {
  if (typeof title !== 'string' || !model || typeof model !== 'object') {
    throw new TypeError('pdf_structured_export_input_invalid');
  }
  const host = activeHost;
  if (!host) throw new PdfStructuredExportHostUnavailableError();
  const bytes = host.buildStructuredPdfBytes(title, model);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new TypeError('pdf_structured_export_output_invalid');
  }
  return bytes;
}
