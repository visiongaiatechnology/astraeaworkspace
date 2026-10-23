// STATUS: DIAMANT VGT SUPREME
// Fail-closed sanitization for Astraea's canonical structured PDF model.
// Arbitrary foreign PDF byte rewriting is intentionally rejected until the standards parser/renderer adapter is active.

import type { PdfAnnotationAttachment, PdfDocumentModel } from '../../../../shared/contracts/workspace';
import { buildStructuredPdfBytes } from '../../interchange/structuredPdfExport';
import { pdfUnicodeTextString } from '../../../../platform/interop/pdf/pdfTextStrings';
import { hasPdfIncrementalRevisionPointer, pdfInfoDictionaryEntries } from '../pdfStructureInspector';

export const PDF_STRUCTURED_SANITIZATION_LIMITS = Object.freeze({
  maxExternalReferences: 1_000,
  maxScannedTextBytes: 8 * 1024 * 1024,
  maxReplacementTitle: 256,
});

export type PdfMetadataSanitizationMode = 'strip' | 'replace-title';

export interface PdfStructuredSanitizationRequest {
  metadataMode: PdfMetadataSanitizationMode;
  replacementTitle?: string;
  stripAnnotations: boolean;
  stripAttachments: boolean;
  stripFormData: boolean;
  stripActions: boolean;
  stripHiddenText: boolean;
}

export interface PdfSanitizedAttachmentInventoryItem {
  page: number;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

export interface PdfExternalReferenceSummary {
  scheme: 'http' | 'https' | 'mailto';
  host: string;
  occurrences: number;
}

export interface PdfStructuredSanitizationReport {
  verified: true;
  metadataMode: PdfMetadataSanitizationMode;
  originalAnnotations: number;
  removedAnnotations: number;
  attachmentInventory: PdfSanitizedAttachmentInventoryItem[];
  removedAttachments: number;
  originalFormFields: number;
  removedFormFields: number;
  originalActions: number;
  removedActions: number;
  originalHiddenTextItems: number;
  removedHiddenTextItems: number;
  externalReferences: PdfExternalReferenceSummary[];
  rawForeignPayloadRejected: boolean;
  foreignRasterFlattened?: boolean;
  detectedHiddenLayerStructures?: number;
  detectedAlternateImageStructures?: number;
  hiddenLayerStructuresAbsent?: boolean;
  alternateImageStructuresAbsent?: boolean;
  xmpAbsent: boolean;
  activeActionsAbsent: boolean;
  embeddedFilesAbsent: boolean;
  incrementalHistoryAbsent: boolean;
  annotationObjectsAbsent: boolean;
  formDataAbsent: boolean;
  hiddenTextAbsent: boolean;
}

export interface PdfStructuredSanitizationResult {
  bytes: Uint8Array;
  sanitizedModel: PdfDocumentModel;
  exportTitle: string;
  report: PdfStructuredSanitizationReport;
}

function safeReplacementTitle(value: string | undefined): string {
  const cleaned = (value ?? '').replace(/\u0000/g, '').trim().slice(0, PDF_STRUCTURED_SANITIZATION_LIMITS.maxReplacementTitle);
  if (!cleaned) throw new Error('Replacement metadata title is required.');
  return cleaned;
}

function collectText(model: PdfDocumentModel): string[] {
  const values: string[] = [];
  let totalBytes = 0;
  const encoder = new TextEncoder();
  const push = (value: string | undefined) => {
    if (!value) return;
    totalBytes += encoder.encode(value).byteLength;
    if (totalBytes > PDF_STRUCTURED_SANITIZATION_LIMITS.maxScannedTextBytes) throw new Error('Structured sanitization text scan exceeded the safe budget.');
    values.push(value);
  };
  for (const page of model.pages) {
    push(page.title); push(page.subtitle); push(page.pageLabel);
    push(page.decorations?.headerText); push(page.decorations?.footerText); push(page.decorations?.batesLabel); push(page.decorations?.watermarkText);
    for (const section of page.sections) push(section.content);
  }
  for (const annotation of model.annotations) {
    push(annotation.text); push(annotation.targetText); push(annotation.replacementText); push(annotation.stampLabel);
    for (const reply of annotation.replies ?? []) push(reply.text);
  }
  return values;
}

function summarizeExternalReferences(model: PdfDocumentModel): PdfExternalReferenceSummary[] {
  const counts = new Map<string, PdfExternalReferenceSummary>();
  let seen = 0;
  const add = (rawInput: string) => {
    if (++seen > PDF_STRUCTURED_SANITIZATION_LIMITS.maxExternalReferences) throw new Error('External-reference inventory exceeded the safe budget.');
    const raw = rawInput.replace(/[.,;:!?]+$/u, '');
    let scheme: PdfExternalReferenceSummary['scheme'];
    let host: string;
    if (/^mailto:/iu.test(raw)) {
      scheme = 'mailto';
      const address = raw.slice(7);
      host = (address.split('@')[1] ?? 'invalid').toLowerCase().slice(0, 255);
    } else {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      scheme = url.protocol === 'https:' ? 'https' : 'http';
      host = url.hostname.toLowerCase().slice(0, 255);
    }
    const key = `${scheme}:${host}`;
    const current = counts.get(key);
    if (current) current.occurrences += 1;
    else counts.set(key, { scheme, host, occurrences: 1 });
  };
  const pattern = /\b(?:https?:\/\/[^\s<>()\[\]{}"']+|mailto:[^\s<>()\[\]{}"']+)/giu;
  for (const value of collectText(model)) for (const match of value.matchAll(pattern)) add(match[0]);
  for (const page of model.pages) for (const link of page.links ?? []) if (link.target.kind === 'url') add(link.target.url);
  for (const field of model.formFields ?? []) if (field.submitUrl) add(field.submitUrl);
  return [...counts.values()].sort((a, b) => a.host.localeCompare(b.host) || a.scheme.localeCompare(b.scheme));
}

function inventoryAttachments(model: PdfDocumentModel): PdfSanitizedAttachmentInventoryItem[] {
  return model.annotations.flatMap((annotation): PdfSanitizedAttachmentInventoryItem[] => {
    const attachment: PdfAnnotationAttachment | undefined = annotation.attachment;
    if (!attachment) return [];
    return [{
      page: annotation.page,
      fileName: attachment.fileName.slice(0, 255),
      mimeType: attachment.mimeType.slice(0, 255),
      byteLength: Math.max(0, Math.floor(attachment.byteLength)),
      sha256: attachment.sha256.toLowerCase(),
    }];
  });
}

function assertSanitizedPdfBytes(bytes: Uint8Array, metadataMode: PdfMetadataSanitizationMode, originalTitle: string, replacementTitle: string | undefined, requireFormDataAbsent: boolean, requireActionsAbsent: boolean, requireEmbeddedFilesAbsent: boolean, requireAllAnnotationObjectsAbsent: boolean, requireHiddenTextAbsent: boolean): Omit<PdfStructuredSanitizationReport, 'verified' | 'metadataMode' | 'originalAnnotations' | 'removedAnnotations' | 'attachmentInventory' | 'removedAttachments' | 'originalFormFields' | 'removedFormFields' | 'originalActions' | 'removedActions' | 'originalHiddenTextItems' | 'removedHiddenTextItems' | 'externalReferences' | 'rawForeignPayloadRejected'> {
  const serialized = new TextDecoder('latin1').decode(bytes);
  if (/\/Metadata\b|<\?xpacket\b|<x:xmpmeta\b/iu.test(serialized)) throw new Error('Sanitized export verification failed: XMP metadata remains.');
  const hasActiveActions = /\/(JavaScript|JS|OpenAction|AA|Launch|SubmitForm|ImportData|URI)\b/u.test(serialized);
  if (requireActionsAbsent && hasActiveActions) throw new Error('Sanitized export verification failed: active actions remain.');
  const hasEmbeddedFiles = /\/(EmbeddedFiles|FileAttachment|Filespec)\b/u.test(serialized);
  if (requireEmbeddedFilesAbsent && hasEmbeddedFiles) throw new Error('Sanitized export verification failed: embedded-file structures remain.');
  // Both structure questions are asked of the module that owns the trailer rule, and both are scoped correctly:
  // the incremental-revision chain lives in the trailer (`/Prev`), and the descriptive metadata lives in the
  // information dictionary the trailer names (`/Info N 0 R`). The file-wide regexes that used to answer these
  // two questions matched an outline item's `/Title` and an outline sibling's `/Prev`, i.e. they rejected this
  // module's own correct output for every document with more than one heading.
  let infoEntries: string;
  let hasIncrementalHistory: boolean;
  try {
    infoEntries = pdfInfoDictionaryEntries(serialized);
    hasIncrementalHistory = hasPdfIncrementalRevisionPointer(serialized);
  } catch (cause) {
    throw new Error(`Sanitized export verification failed: ${cause instanceof Error ? cause.message : 'PDF xref trailer could not be verified.'}`);
  }
  if (hasIncrementalHistory) throw new Error('Sanitized export verification failed: incremental revision history remains.');
  const hasAnnotationObjects = /\/Annots\b|\/Type\s*\/Annot\b/u.test(serialized);
  if (requireAllAnnotationObjectsAbsent && hasAnnotationObjects) throw new Error('Sanitized export verification failed: annotation objects remain.');
  const hasHiddenOrClippingText = /(?:^|[\r\n ])(?:3|4|5|6|7)\s+Tr(?:[\r\n ]|$)/u.test(serialized);
  if (requireHiddenTextAbsent && hasHiddenOrClippingText) throw new Error('Sanitized export verification failed: hidden/clipping text operators remain.');
  if (requireFormDataAbsent && /\/(AcroForm|Widget|FT)\b/u.test(serialized)) throw new Error('Sanitized export verification failed: form data/fields remain.');
  if (metadataMode === 'strip' && /\/(Title|Author|Subject|Keywords|Creator|CreationDate|ModDate)\b/u.test(infoEntries)) {
    throw new Error('Sanitized export verification failed: descriptive Info metadata remains.');
  }
  if (metadataMode === 'replace-title') {
    // The writer puts a title into the information dictionary as a **PDF text string in hex form**
    // (`pdfUnicodeTextString` → `<FEFF…>`), so the plain text never appears in the bytes. The check used to
    // search for the plain text — and for a non-ASCII title even for the delimiter-escaped literal form — so
    // it fired on this module's own correct export ("replacement title is missing") and could never have
    // confirmed a replacement. It now asks the module that owns how text becomes a PDF string, and it is
    // scoped to the information dictionary, where a document title belongs.
    const encodedOriginal = pdfUnicodeTextString(originalTitle);
    if (originalTitle && originalTitle !== replacementTitle && infoEntries.includes(encodedOriginal)) {
      throw new Error('Sanitized export verification failed: original title remains.');
    }
    if (!replacementTitle || !infoEntries.includes(pdfUnicodeTextString(replacementTitle))) {
      throw new Error('Sanitized export verification failed: replacement title is missing.');
    }
  }
  return {
    xmpAbsent: true,
    activeActionsAbsent: !hasActiveActions,
    embeddedFilesAbsent: !hasEmbeddedFiles,
    incrementalHistoryAbsent: !hasIncrementalHistory,
    annotationObjectsAbsent: !hasAnnotationObjects,
    formDataAbsent: requireFormDataAbsent ? true : !/\/(AcroForm|Widget|FT)\b/u.test(serialized),
    hiddenTextAbsent: !hasHiddenOrClippingText,
  };
}

export function buildSanitizedStructuredPdfCopy(
  originalTitle: string,
  model: PdfDocumentModel,
  request: PdfStructuredSanitizationRequest,
): PdfStructuredSanitizationResult {
  if (model.rawPdfDataUrl || model.rawPdfInspection) {
    throw new Error('Foreign/native PDF sanitization requires the standards parser adapter and is blocked fail-closed.');
  }
  const attachmentInventory = inventoryAttachments(model);
  const externalReferences = summarizeExternalReferences(model);
  const exportTitle = request.metadataMode === 'replace-title' ? safeReplacementTitle(request.replacementTitle) : originalTitle;

  const annotations = model.annotations.filter((annotation) => {
    if (request.stripAnnotations) return false;
    if (request.stripAttachments && (annotation.type === 'file-attachment' || annotation.attachment)) return false;
    return true;
  });
  const removedAnnotations = model.annotations.length - annotations.length;
  const originalFormFields = model.formFields?.length ?? 0;
  const originalActions = model.pages.reduce((sum, page) => sum + (page.links?.filter((link) => link.target.kind === 'url').length ?? 0), 0)
    + (model.formFields?.filter((field) => Boolean(field.submitUrl)).length ?? 0);
  const originalHiddenTextItems = model.pages.reduce((sum, page) => sum + (page.ocrLayer?.lines.reduce((lineSum, line) => lineSum + line.words.length, 0) ?? 0), 0);
  const pages = model.pages.map((page) => ({
    ...page,
    links: request.stripActions ? (page.links ?? []).filter((link) => link.target.kind !== 'url') : page.links,
    ocrLayer: request.stripHiddenText ? undefined : page.ocrLayer,
  }));
  const formFields = request.stripFormData
    ? []
    : (model.formFields?.map((field) => request.stripActions && field.submitUrl ? { ...field, submitUrl: undefined } : field));
  const remainingActions = pages.reduce((sum, page) => sum + (page.links?.filter((link) => link.target.kind === 'url').length ?? 0), 0)
    + (formFields?.filter((field) => Boolean(field.submitUrl)).length ?? 0);
  const sanitizedModel: PdfDocumentModel = {
    ...model,
    pages,
    annotations,
    formFields,
    metadataSanitized: request.metadataMode === 'strip',
    rawPdfDataUrl: undefined,
    rawPdfFileName: undefined,
    rawPdfByteLength: undefined,
    rawPdfInspection: undefined,
  };
  const bytes = buildStructuredPdfBytes(exportTitle, sanitizedModel);
  const byteChecks = assertSanitizedPdfBytes(bytes, request.metadataMode, originalTitle, request.replacementTitle?.trim(), request.stripFormData, request.stripActions, request.stripAttachments, request.stripAnnotations && request.stripFormData && request.stripActions && request.stripAttachments, request.stripHiddenText);
  return {
    bytes,
    sanitizedModel,
    exportTitle,
    report: {
      verified: true,
      metadataMode: request.metadataMode,
      originalAnnotations: model.annotations.length,
      removedAnnotations,
      attachmentInventory,
      removedAttachments: attachmentInventory.filter((item) => !annotations.some((annotation) => annotation.page === item.page && annotation.attachment?.sha256.toLowerCase() === item.sha256)).length,
      originalFormFields,
      removedFormFields: originalFormFields - (formFields?.length ?? 0),
      originalActions,
      removedActions: originalActions - remainingActions,
      originalHiddenTextItems,
      removedHiddenTextItems: request.stripHiddenText ? originalHiddenTextItems : 0,
      externalReferences,
      rawForeignPayloadRejected: true,
      ...byteChecks,
    },
  };
}
