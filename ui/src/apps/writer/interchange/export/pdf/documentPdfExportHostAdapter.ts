// STATUS: DIAMANT VGT SUPREME — Writer-owned PDF rendering provider for the platform export port.
import { registerDocumentPdfExporter } from '../../../../../platform/rendering/documentPdfExport';
import { buildWriterPdf } from './writerPdfExport';

export function installWriterDocumentPdfExportHost(): () => void {
  return registerDocumentPdfExporter((request) => buildWriterPdf(
    request.title,
    request.paragraphs,
    request.config,
    request.tables ?? [],
    request.images ?? [],
    request.styles,
    request.sections ?? [],
    {},
    request.metadata ?? {},
  ));
}
