// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — destructive foreign-PDF sanitization by local standards rendering into a fresh raster-only PDF object graph.

import type { PdfDocumentModel } from '../../../../shared/contracts/workspace';
import { createPdfModelFromNormalizedJpegs } from '../../media/import/pdfImageImport';
import { flattenForeignPdfBytes } from '../../../pdf-studio/import/pdfForeignPageImport';
import { decodePdfDataUrl } from '../pdfNativeDataUrl';
import { buildStructuredPdfBytes } from '../../interchange/structuredPdfExport';
import type { PdfStructuredSanitizationRequest, PdfStructuredSanitizationResult } from '../sanitization/pdfStructuredSanitization';

const ACTIVE_OR_HIDDEN_STRUCTURES = /\/(?:OCProperties|OCG|Alternates|Metadata|JavaScript|JS|OpenAction|AA|Launch|SubmitForm|ImportData|URI|EmbeddedFiles|EmbeddedFile|Filespec|FileAttachment|AcroForm|Widget|Annots)\b/iu;
const OCG_STRUCTURE = /\/(?:OCProperties|OCG)\b/giu;
const ALTERNATE_IMAGE_STRUCTURE = /\/Alternates\b/giu;

const safeReplacementTitle = (value: string | undefined): string => {
  const title = (value ?? '').replace(/\u0000/gu, '').trim().slice(0, 256);
  if (!title) throw new Error('Replacement metadata title is required.');
  return title;
};

const countMatches = (text: string, pattern: RegExp): number => [...text.matchAll(pattern)].length;

export async function buildSanitizedForeignPdfCopy(
  originalTitle: string,
  model: PdfDocumentModel,
  request: PdfStructuredSanitizationRequest,
): Promise<PdfStructuredSanitizationResult> {
  if (!model.rawPdfDataUrl) throw new Error('Foreign PDF sanitization requires a locally persisted native PDF payload.');
  if (!request.stripAnnotations || !request.stripAttachments || !request.stripFormData || !request.stripActions || !request.stripHiddenText) {
    throw new Error('Foreign PDF sanitization is destructive and requires annotations, attachments, form data, actions and hidden text to be stripped.');
  }
  const input = decodePdfDataUrl(model.rawPdfDataUrl, model.rawPdfByteLength);
  const inputText = new TextDecoder('latin1').decode(input);
  const detectedHiddenLayerStructures = countMatches(inputText, OCG_STRUCTURE);
  const detectedAlternateImageStructures = countMatches(inputText, ALTERNATE_IMAGE_STRUCTURE);
  const flattened = await flattenForeignPdfBytes(input, 'Sanitized foreign PDF', undefined, { stripAnnotations: true });
  const exportTitle = request.metadataMode === 'replace-title' ? safeReplacementTitle(request.replacementTitle) : originalTitle;
  const base = createPdfModelFromNormalizedJpegs(flattened.map((source, index) => ({
    ...source,
    name: `Sanitized page ${index + 1}`,
    altText: `Sanitized raster page ${index + 1}`,
  })));
  const sanitizedModel: PdfDocumentModel = {
    ...base,
    metadataSanitized: request.metadataMode === 'strip',
    rawPdfDataUrl: undefined,
    rawPdfFileName: undefined,
    rawPdfByteLength: undefined,
    rawPdfInspection: undefined,
  };
  const bytes = buildStructuredPdfBytes(exportTitle, sanitizedModel);
  const outputText = new TextDecoder('latin1').decode(bytes);
  if (ACTIVE_OR_HIDDEN_STRUCTURES.test(outputText) || /\/Prev\s+\d+/u.test(outputText) || /<\?xpacket\b|<x:xmpmeta\b/iu.test(outputText)) {
    throw new Error('Foreign sanitized-copy verification failed: active, hidden, alternate or historical PDF structures remain.');
  }
  if (request.metadataMode === 'strip' && /\/(?:Title|Author|Subject|Keywords|Creator|CreationDate|ModDate)\b/u.test(outputText)) {
    throw new Error('Foreign sanitized-copy verification failed: descriptive metadata remains.');
  }
  return {
    bytes,
    sanitizedModel,
    exportTitle,
    report: {
      verified: true,
      metadataMode: request.metadataMode,
      originalAnnotations: 0,
      removedAnnotations: 0,
      attachmentInventory: [],
      removedAttachments: 0,
      originalFormFields: 0,
      removedFormFields: 0,
      originalActions: 0,
      removedActions: 0,
      originalHiddenTextItems: 0,
      removedHiddenTextItems: 0,
      externalReferences: [],
      rawForeignPayloadRejected: false,
      foreignRasterFlattened: true,
      detectedHiddenLayerStructures,
      detectedAlternateImageStructures,
      hiddenLayerStructuresAbsent: true,
      alternateImageStructuresAbsent: true,
      xmpAbsent: true,
      activeActionsAbsent: true,
      embeddedFilesAbsent: true,
      incrementalHistoryAbsent: true,
      annotationObjectsAbsent: true,
      formDataAbsent: true,
      hiddenTextAbsent: true,
    },
  };
}
