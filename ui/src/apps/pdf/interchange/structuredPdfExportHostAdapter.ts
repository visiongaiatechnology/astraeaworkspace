// STATUS: PLATIN — installs the existing PDF serializer behind the neutral Core host contract.
import { registerPdfStructuredExportHost, type PdfStructuredExportHost } from '../../../platform/interop/pdfStructuredExport';
import { buildStructuredPdfBytes } from './structuredPdfExport';

const pdfStructuredExportHost: PdfStructuredExportHost = { buildStructuredPdfBytes };

export function installPdfStructuredExportHost(): () => void {
  return registerPdfStructuredExportHost(pdfStructuredExportHost);
}
