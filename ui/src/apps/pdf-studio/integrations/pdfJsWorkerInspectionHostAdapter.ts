// STATUS: PLATIN — installs the PDF-owned worker behind the neutral document-inspection contract.
import {
  registerPdfDocumentInspectionHost,
  type PdfDocumentInspectionHost,
} from '../../../platform/documents/pdfjs/pdfDocumentInspection';
import { openPdfJsWorkerDocument } from '../../../platform/documents/pdfjs/pdfJsWorkerClient';

export function installPdfJsWorkerInspectionHost(
  openDocument: PdfDocumentInspectionHost['openDocument'] = openPdfJsWorkerDocument,
): () => void {
  return registerPdfDocumentInspectionHost({ openDocument });
}
