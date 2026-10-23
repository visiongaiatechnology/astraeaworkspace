// STATUS: PLATIN — PDF-owned inspection and rasterization installed at the trusted App composition root.
import { registerPdfWorkspaceImportHost, type PdfWorkspaceImportHost } from '../../../../platform/interop/pdfWorkspaceImport';
import { createPdfModelFromNormalizedJpegs } from '../../media/import/pdfImageImport';
import { flattenForeignPdfBytes } from '../../../pdf-studio/import/pdfForeignPageImport';
import { inspectNativePdfBytes } from '../../../../platform/documents/pdf/nativeInspection';

const pdfWorkspaceImportHost: PdfWorkspaceImportHost = {
  inspectNativePdfBytes,
  flattenForeignPdfBytes: (bytes, sourceName) => flattenForeignPdfBytes(bytes, sourceName, undefined, { stripAnnotations: true }),
  createPdfModelFromNormalizedJpegs,
};

export function installPdfWorkspaceImportHost(): () => void {
  return registerPdfWorkspaceImportHost(pdfWorkspaceImportHost);
}
