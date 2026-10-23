// STATUS: DIAMANT VGT SUPREME — explicit PDF/A-2b download surface.
import type { Paragraph, WriterSectionDefinition, WriterStyleDefinition } from '../../../../../shared/contracts/workspace';
import type { ImageBlockData, PageSetupConfig, TableBlockData } from '../../../types';
import { buildWriterPdf } from '../pdf/writerPdfExport';
import { createBrowserWriterPdfTextRasterizer } from '../pdf/writerPdfTextRaster';
import type { WriterPdfDocumentMetadata } from '../pdf/writerPdfStructure';
import { assertWriterPdfA2b } from './writerPdfArchiveValidation';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../../platform/rendering/documentPdfExport';

export async function downloadWriterPdfA(
  title: string,
  paragraphs: Paragraph[],
  config: PageSetupConfig,
  tables: TableBlockData[] = [],
  images: ImageBlockData[] = [],
  styles?: WriterStyleDefinition[],
  sections: WriterSectionDefinition[] = [],
  documentMetadata: WriterPdfDocumentMetadata = {},
): Promise<ExportDeliveryResult> {
  const textRasterizer = createBrowserWriterPdfTextRasterizer();
  if (!textRasterizer) throw new Error('PDF/A-2b export requires browser-native Canvas text shaping');
  const bytes = buildWriterPdf(title, paragraphs, config, tables, images, styles, sections, {}, documentMetadata, {
    profile: 'pdfa-2b',
    textRasterizer,
  });
  assertWriterPdfA2b(bytes);
  const safeTitle = (title || 'document').replace(/[^a-z0-9._-]+/gi, '_');
  return deliverExportBytes(bytes, {
    suggestedName: `${safeTitle}_PDF-A-2b.pdf`,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}

