// STATUS: DIAMANT VGT SUPREME
// Fail-closed structured PDF redaction. Arbitrary foreign-PDF byte rewriting is intentionally out of scope here.

import type { PdfDocumentModel, PdfPageDecorations, PdfRedaction } from '../../../../shared/contracts/workspace';
import { buildStructuredPdfBytes } from '../../interchange/structuredPdfExport';
import { sha256PdfImageDataUrl } from './pdfImageRedaction';
import { LinearPattern } from '../../../../shared/patterns/linearPattern';
import { hasPdfIncrementalRevisionPointer } from '../pdfStructureInspector';
import {
  escapePdfLiteral,
  isPdfWinAnsiRepresentable,
  pdfByteStringLiteral,
  pdfUnicodeTextString,
  pdfUriByteStringLiteral,
  pdfWinAnsiLiteral,
} from '../../../../platform/interop/pdf/pdfTextStrings';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../platform/rendering/documentPdfExport';

export const PDF_TRUE_REDACTION_LIMITS = {
  maxPatternLength: 256,
  maxOverlayLength: 128,
  maxDocumentTextBytes: 8 * 1024 * 1024,
  maxMatches: 10_000,
  maxVerificationTargets: 10_000,
  /**
   * Distinct targets that may be searched for inside the exported byte stream in one verification pass.
   * The pass is linear in the serialized size (a bounded 8 MiB of visible text plus structure), so an
   * unbounded target list would turn verification into a denial-of-service on the export path. Above this
   * number the export is **refused**, never silently under-verified.
   */
  maxByteScanTargets: 4_096,
} as const;

export type PdfRedactionPatternMode = 'literal' | 'regex';

export interface PdfRedactionPatternRequest {
  pattern: string;
  mode: PdfRedactionPatternMode;
  caseSensitive?: boolean;
  reason: string;
  overlayText?: string;
}

export interface PdfSafeRedactionAuditEntry {
  redactionId: string;
  page: number;
  location: 'title' | 'subtitle' | 'page-label' | 'header' | 'footer' | 'bates' | 'watermark' | 'section' | 'ocr-layer';
  sectionId?: string;
  reason: string;
  matchCount: number;
  redactedCharacters: number;
  timestamp: number;
}

export interface PdfPatternRedactionResult {
  model: PdfDocumentModel;
  auditEntries: PdfSafeRedactionAuditEntry[];
  verificationTargets: string[];
  matchCount: number;
  redactedCharacters: number;
}

export interface PdfRedactionVerificationReport {
  verified: true;
  checkedTargets: number;
  checkedVisibleFields: number;
  checkedImageFingerprints: number;
  annotationsOmittedFromSecureExport: number;
  rawPdfPayloadOmitted: boolean;
  metadataSanitized: boolean;
  incrementalHistoryAbsent: boolean;
  activeContentAbsent: boolean;
}

export interface PdfVerifiedRedactionExport {
  bytes: Uint8Array;
  sanitizedModel: PdfDocumentModel;
  report: PdfRedactionVerificationReport;
}

function cleanReason(value: string): string {
  const reason = value.replace(/\u0000/g, '').trim().slice(0, 512);
  if (!reason) throw new Error('A redaction reason is required.');
  return reason;
}

function cleanOverlay(value: string | undefined): string {
  const overlay = (value ?? '[REDACTED]').replace(/\u0000/g, '').trim().slice(0, PDF_TRUE_REDACTION_LIMITS.maxOverlayLength);
  return overlay || '[REDACTED]';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePattern(request: PdfRedactionPatternRequest): LinearPattern {
  const pattern = request.pattern.replace(/\u0000/g, '').trim();
  if (!pattern) throw new Error('A redaction search pattern is required.');
  if (pattern.length > PDF_TRUE_REDACTION_LIMITS.maxPatternLength) throw new Error('Redaction pattern is too long.');
  const source = request.mode === 'literal' ? escapeRegExp(pattern) : pattern;
  try {
    return new LinearPattern(source, {
      caseInsensitive: !request.caseSensitive,
      limits: {
        maxPatternLength: PDF_TRUE_REDACTION_LIMITS.maxPatternLength * 2,
        maxInputLength: PDF_TRUE_REDACTION_LIMITS.maxDocumentTextBytes,
        maxStates: 4096,
        maxMatches: PDF_TRUE_REDACTION_LIMITS.maxMatches,
        maxRepeat: 128,
      },
    });
  } catch {
    throw new Error('Invalid or unsupported non-linear redaction regex.');
  }
}

function visibleTextByteLength(model: PdfDocumentModel): number {
  const encoder = new TextEncoder();
  let total = 0;
  const add = (value: string | undefined) => { if (value) total += encoder.encode(value).byteLength; };
  for (const page of model.pages) {
    add(page.title); add(page.subtitle); add(page.pageLabel);
    add(page.decorations?.headerText); add(page.decorations?.footerText); add(page.decorations?.batesLabel); add(page.decorations?.watermarkText);
    for (const section of page.sections) add(section.content);
    for (const line of page.ocrLayer?.lines ?? []) add(line.text);
  }
  return total;
}

function mapDecorations(
  decorations: PdfPageDecorations | undefined,
  apply: (value: string | undefined, location: PdfSafeRedactionAuditEntry['location']) => string | undefined,
): PdfPageDecorations | undefined {
  if (!decorations) return undefined;
  return {
    ...decorations,
    headerText: apply(decorations.headerText, 'header'),
    footerText: apply(decorations.footerText, 'footer'),
    batesLabel: apply(decorations.batesLabel, 'bates'),
    watermarkText: apply(decorations.watermarkText, 'watermark'),
  };
}

export function redactStructuredPdfPattern(
  model: PdfDocumentModel,
  request: PdfRedactionPatternRequest,
  now = Date.now(),
): PdfPatternRedactionResult {
  if (visibleTextByteLength(model) > PDF_TRUE_REDACTION_LIMITS.maxDocumentTextBytes) throw new Error('Document text exceeds the safe redaction budget.');
  const regex = compilePattern(request);
  const reason = cleanReason(request.reason);
  const overlay = cleanOverlay(request.overlayText);
  const targets = new Set<string>();
  const auditEntries: PdfSafeRedactionAuditEntry[] = [];
  const redactions: PdfRedaction[] = [...model.redactions];
  let totalMatches = 0;
  let totalCharacters = 0;
  let sequence = 0;

  const pages = model.pages.map((page) => {
    const apply = (value: string | undefined, location: PdfSafeRedactionAuditEntry['location'], sectionId?: string): string | undefined => {
      if (!value) return value;
      const matches = regex.findAll(value);
      const localMatches = matches.length;
      const localCharacters = matches.reduce((sum, match) => sum + match.text.length, 0);
      totalMatches += localMatches;
      totalCharacters += localCharacters;
      if (totalMatches > PDF_TRUE_REDACTION_LIMITS.maxMatches) throw new Error('Redaction match budget exceeded.');
      for (const match of matches) if (targets.size < PDF_TRUE_REDACTION_LIMITS.maxVerificationTargets) targets.add(match.text);
      const redacted = localMatches ? regex.replace(value, overlay, true).text : value;
      if (localMatches === 0) return value;
      sequence += 1;
      const id = `redact-batch-${now}-${sequence}`;
      auditEntries.push({ redactionId: id, page: page.pageNumber, location, sectionId, reason, matchCount: localMatches, redactedCharacters: localCharacters, timestamp: now });
      redactions.push({
        id,
        page: page.pageNumber,
        x: 0, y: 0, width: 0, height: 0,
        reason,
        isApplied: true,
        targetText: `[${localCharacters} CHARACTERS REDACTED / ${localMatches} MATCH${localMatches === 1 ? '' : 'ES'}]`,
        timestamp: now,
      });
      return redacted;
    };

    const ocrLines = (page.ocrLayer?.lines ?? []).flatMap((line) => {
      const redacted = apply(line.text, 'ocr-layer');
      // OCR is an alternate representation of the scan. If a pattern hits a line,
      // remove the complete hidden line rather than risk leaving matched glyphs in
      // individually positioned words. Over-redaction is preferable to a leak.
      return redacted === line.text ? [line] : [];
    });
    const ocrLayer = page.ocrLayer ? {
      ...page.ocrLayer,
      lines: ocrLines,
      meanConfidence: ocrLines.length === 0 ? 0 : ocrLines.reduce((sum, line) => sum + line.confidence, 0) / ocrLines.length,
    } : undefined;

    return {
      ...page,
      title: apply(page.title, 'title') ?? '',
      subtitle: apply(page.subtitle, 'subtitle'),
      pageLabel: apply(page.pageLabel, 'page-label'),
      decorations: mapDecorations(page.decorations, (value, location) => apply(value, location)),
      sections: page.sections.map((section) => ({
        ...section,
        content: apply(section.content, 'section', section.id) ?? '',
        originalContent: undefined,
        isMarkedForRedaction: false,
      })),
      ocrLayer,
    };
  });

  if (totalMatches === 0) return { model, auditEntries: [], verificationTargets: [], matchCount: 0, redactedCharacters: 0 };
  return {
    model: { ...model, pages, redactions },
    auditEntries,
    verificationTargets: [...targets],
    matchCount: totalMatches,
    redactedCharacters: totalCharacters,
  };
}

function scanVisibleFields(model: PdfDocumentModel, callback: (value: string) => void): number {
  let count = 0;
  const visit = (value: string | undefined) => { if (value !== undefined) { count += 1; callback(value); } };
  for (const page of model.pages) {
    visit(page.title); visit(page.subtitle); visit(page.pageLabel);
    visit(page.decorations?.headerText); visit(page.decorations?.footerText); visit(page.decorations?.batesLabel); visit(page.decorations?.watermarkText);
    for (const section of page.sections) { visit(section.content); visit(section.originalContent); }
    for (const line of page.ocrLayer?.lines ?? []) { visit(line.text); for (const word of line.words) visit(word.text); }
    for (const link of page.links ?? []) if (link.target.kind === 'url') visit(link.target.url);
  }
  for (const field of model.formFields ?? []) {
    // `/T` (the fully qualified field name) and `/DV` (the default value) are written into every widget
    // dictionary, so a target that survives in a name survives in the bytes. Leaving them out of the model
    // scan was the gap that made the byte scan the only line of defence — and that one was weaker than the
    // writer it was checking.
    visit(field.name); visit(field.label); visit(field.tooltip); visit(field.submitUrl);
    if (Array.isArray(field.value)) for (const value of field.value) visit(value);
    else if (typeof field.value === 'string') visit(field.value);
    if (Array.isArray(field.defaultValue)) for (const value of field.defaultValue) visit(value);
    else if (typeof field.defaultValue === 'string') visit(field.defaultValue);
    for (const option of field.options ?? []) visit(option);
  }
  return count;
}

/**
 * Every byte-level representation the canonical PDF text writers can emit for `value`.
 *
 * This used to be a **second** escaping rule living in this file (`escapedPdfLiteral`, which ran
 * `normalize('NFKD').replace(/[^\x20-\x7E]/g, '?')`). It was measurably weaker than the writer it was
 * verifying: `interchange/structuredPdfExport.ts` draws content text with `pdfWinAnsiLiteral` (octal escapes,
 * `Müller` → `M\374ller`) and metadata with `pdfUnicodeTextString` (UTF-16BE hex), so a target that survived
 * the redaction was invisible to a check that only looked for `M?ller`. The verification could therefore
 * report `verified: true` on a document that still contained the secret.
 *
 * One rule, asked of the module that owns it (`platform/interop/pdf/pdfTextStrings.ts`) — the same rule the
 * Writer and Grid use.
 */
export function pdfRedactionVerificationEncodings(value: string): string[] {
  const encodings = new Set<string>([value, escapePdfLiteral(value)]);
  // The lossy writers only participate when they can carry the value without substituting characters:
  // `pdfWinAnsiLiteral`/`pdfByteStringLiteral` turn every character they cannot carry into `?`, and a `?`
  // produced that way would match unrelated bytes in the stream — a false alarm on a clean document is as
  // damaging to the feature as a missed one. `pdfUnicodeTextString` carries everything, so a value outside
  // WinAnsi still gets a lossless byte representation to look for.
  if (isPdfWinAnsiRepresentable(value)) encodings.add(pdfWinAnsiLiteral(value));
  if (/^[\x20-\x7E]*$/u.test(value)) {
    encodings.add(pdfByteStringLiteral(value));
    encodings.add(pdfUriByteStringLiteral(value));
  }
  encodings.add(pdfUnicodeTextString(value));
  return [...encodings].filter((encoding) => encoding.length > 0);
}

/**
 * True when the file carries an **incremental revision** — a second cross-reference section chained by the
 * trailer's `/Prev` key.
 *
 * **One rule, one implementation (this batch).** `security/sanitization/pdfStructuredSanitization.ts` tested
 * `/\/Prev\s+\d+/` over the whole serialized file. `/Prev` is, however, also the standard key for the
 * **previous sibling in an outline tree**, which the very same exporter writes for every document with more
 * than one heading, so the sanitizer refused its own correct output. The trailer-scoped rule now lives in
 * `security/pdfStructureInspector.ts` and both passes ask it.
 */
function incrementalRevisionOf(serialized: string): boolean {
  try {
    return hasPdfIncrementalRevisionPointer(serialized);
  } catch (cause) {
    throw new Error(`Redaction verification failed: ${cause instanceof Error ? cause.message : 'PDF xref trailer could not be verified.'}`);
  }
}

export function buildVerifiedRedactedStructuredPdfBytes(
  title: string,
  model: PdfDocumentModel,
  verificationTargets: readonly string[],
): PdfVerifiedRedactionExport {
  if (model.redactions.length === 0) throw new Error('Verified redaction export requires at least one applied redaction.');
  const targets = [...new Set(verificationTargets.filter((target) => target.length > 0))];
  if (targets.length > PDF_TRUE_REDACTION_LIMITS.maxVerificationTargets) throw new Error('Too many redaction verification targets.');

  for (const page of model.pages) {
    for (const section of page.sections) {
      if (section.originalContent) throw new Error('Redaction verification failed: originalContent remains in the structured model.');
    }
  }
  for (const redaction of model.redactions) {
    if (redaction.targetText && !/^(?:\[\d+ CHARACTERS REDACTED(?: \/ \d+ MATCH(?:ES)?)?\]|\[IMAGE PIXELS REDACTED \d+x\d+\])$/.test(redaction.targetText)) {
      throw new Error('Redaction verification failed: audit record contains unsafe target text.');
    }
  }

  let checkedVisibleFields = 0;
  checkedVisibleFields = scanVisibleFields(model, (value) => {
    for (const target of targets) {
      if (value.includes(target)) throw new Error('Redaction verification failed: target text remains in the structured model.');
    }
  });

  const sanitizedModel: PdfDocumentModel = {
    ...model,
    pages: model.pages.map((page) => ({ ...page, links: [] })),
    annotations: [],
    formFields: (model.formFields ?? []).map((field) => ({ ...field, submitUrl: undefined })),
    metadataSanitized: true,
    rawPdfDataUrl: undefined,
    rawPdfFileName: undefined,
    rawPdfByteLength: undefined,
    rawPdfInspection: undefined,
  };
  const bytes = buildStructuredPdfBytes(title, sanitizedModel);
  const serialized = new TextDecoder('latin1').decode(bytes);
  if (targets.length > PDF_TRUE_REDACTION_LIMITS.maxByteScanTargets) {
    throw new Error(`Redaction verification refused: ${targets.length} distinct targets exceed the ${PDF_TRUE_REDACTION_LIMITS.maxByteScanTargets}-target byte-verification policy.`);
  }
  for (const target of targets) {
    for (const encoding of pdfRedactionVerificationEncodings(target)) {
      if (serialized.includes(encoding)) {
        throw new Error('Redaction verification failed: target text remains in exported PDF bytes.');
      }
    }
  }
  if (incrementalRevisionOf(serialized)) throw new Error('Redaction verification failed: incremental history is present.');
  if (/\/(JavaScript|JS|OpenAction|Launch|EmbeddedFiles|FileAttachment|URI|SubmitForm)\b/.test(serialized)) {
    throw new Error('Redaction verification failed: active or embedded hidden content is present.');
  }

  return {
    bytes,
    sanitizedModel,
    report: {
      verified: true,
      checkedTargets: targets.length,
      checkedVisibleFields,
      checkedImageFingerprints: 0,
      annotationsOmittedFromSecureExport: model.annotations.length,
      rawPdfPayloadOmitted: !sanitizedModel.rawPdfDataUrl,
      metadataSanitized: sanitizedModel.metadataSanitized === true,
      incrementalHistoryAbsent: true,
      activeContentAbsent: true,
    },
  };
}

export async function buildVerifiedRedactedStructuredPdfBytesWithImages(
  title: string,
  model: PdfDocumentModel,
  verificationTargets: readonly string[],
  originalImageSha256: readonly string[],
): Promise<PdfVerifiedRedactionExport> {
  const blocked = new Set(originalImageSha256.map((value) => value.trim().toLowerCase()).filter((value) => /^[0-9a-f]{64}$/u.test(value)));
  let checkedImageFingerprints = 0;
  for (const page of model.pages) {
    for (const image of page.images ?? []) {
      const fingerprint = await sha256PdfImageDataUrl(image.dataUrl);
      checkedImageFingerprints += 1;
      if (blocked.has(fingerprint)) throw new Error('Redaction verification failed: an original image fingerprint remains in the structured model.');
    }
  }
  const verified = buildVerifiedRedactedStructuredPdfBytes(title, model, verificationTargets);
  return {
    ...verified,
    report: { ...verified.report, checkedImageFingerprints },
  };
}

/**
 * Delivers the verified redacted PDF. Success is only reported after the desktop confirmed the
 * atomic write; the browser fallback is a download (Release Beta 0.1).
 */
export async function downloadVerifiedRedactedStructuredPdf(
  title: string,
  model: PdfDocumentModel,
): Promise<ExportDeliveryResult> {
  const verified = buildVerifiedRedactedStructuredPdfBytes(title, model, []);
  const safe = (title || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_');
  return deliverExportBytes(verified.bytes, {
    suggestedName: `${safe}_redacted_verified.pdf`,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}
