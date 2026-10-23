// STATUS: DIAMANT VGT SUPREME — app-neutral document PDF export port and browser download owner.
//
// Release Beta 0.1 (export integrity): on the desktop the built PDF bytes are written through the
// native save dialog and the atomic sandbox export (which verifies the PDF artifact) before success is
// reported. The browser build keeps the download-link fallback, which cannot confirm a disk write.
import type {
  Paragraph,
  WriterBookmark,
  WriterImageBlockData,
  WriterPageSetupConfig,
  WriterSectionDefinition,
  WriterStyleDefinition,
  WriterTableBlockData,
} from '../../shared/contracts/workspace';
import { DEFAULT_SHELL_NATIVE_POLICY, nativeShellSaveBytes } from '../native/nativeShellServices';

export interface DocumentPdfMetadata {
  language?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  createdAt?: number;
  modifiedAt?: number;
  bookmarks?: readonly WriterBookmark[];
}

export interface DocumentPdfExportRequest {
  title: string;
  paragraphs: Paragraph[];
  config: WriterPageSetupConfig;
  tables?: WriterTableBlockData[];
  images?: WriterImageBlockData[];
  styles?: WriterStyleDefinition[];
  sections?: WriterSectionDefinition[];
  metadata?: DocumentPdfMetadata;
}

export type DocumentPdfExporter = (request: DocumentPdfExportRequest) => Uint8Array;

export class DocumentPdfExporterUnavailableError extends Error {
  constructor() {
    super('document_pdf_exporter_unavailable');
    this.name = 'DocumentPdfExporterUnavailableError';
  }
}

let activeExporter: DocumentPdfExporter | undefined;
let activeRegistration: symbol | undefined;

export function registerDocumentPdfExporter(exporter: DocumentPdfExporter): () => void {
  if (typeof exporter !== 'function') throw new TypeError('document_pdf_exporter_invalid');
  if (activeExporter) throw new Error('document_pdf_exporter_already_registered');

  const registration = Symbol('document-pdf-exporter');
  activeExporter = exporter;
  activeRegistration = registration;
  return () => {
    if (activeRegistration !== registration) return;
    activeExporter = undefined;
    activeRegistration = undefined;
  };
}

export function buildDocumentPdf(request: DocumentPdfExportRequest): Uint8Array {
  const exporter = activeExporter;
  if (!exporter) throw new DocumentPdfExporterUnavailableError();
  const bytes = exporter(request);
  if (!(bytes instanceof Uint8Array)) throw new TypeError('document_pdf_export_result_invalid');
  return bytes;
}

/** Cheap artifact preflight before any dialog: non-empty and carrying the PDF signature. */
export function assertPdfExportArtifact(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8) throw new Error('document_pdf_export_result_invalid');
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.byteLength, 1024)));
  if (!head.includes('%PDF-')) throw new Error('document_pdf_signature_missing');
}

/**
 * Writes the built PDF to a real file on the desktop (save dialog + atomic sandbox export). Resolves
 * with the confirmed file name only after the file exists. In the browser it falls back to a download
 * link and returns the suggested name — the caller must not describe that as a confirmed save.
 */
export async function downloadDocumentPdf(request: DocumentPdfExportRequest): Promise<{ fileName: string; mode: 'file' | 'download' }> {
  const bytes = buildDocumentPdf(request);
  assertPdfExportArtifact(bytes);
  const safeTitle = (request.title || 'document').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120) || 'document';
  const filename = `${safeTitle}.pdf`;
  const nativeName = await nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, bytes, {
    suggestedName: filename,
    extensions: ['pdf'],
  });
  if (nativeName) return { fileName: nativeName, mode: 'file' };

  if (typeof document === 'undefined' || !document.body || typeof URL.createObjectURL !== 'function') {
    throw new Error('document_pdf_download_unavailable');
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
  };

  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(revoke, 1000);
    return { fileName: filename, mode: 'download' };
  } catch (error) {
    revoke();
    throw error;
  } finally {
    anchor.remove();
  }
}
