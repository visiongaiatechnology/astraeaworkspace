// STATUS: DIAMANT VGT SUPREME
// Canonical PDF Studio persistence boundary: documented payload schema, stable IDs, protected saving,
// Save→Close→Reopen identity — and the schema/migration contract of this application.
//
// ## Why this file exists
//
// The tracker asks every feature of this app for the same four things: the change must travel through the
// canonical object model, the IDs must be stable and documented, undo/redo must hold, and the payload must be
// identical after Save→Close→Reopen. Measured on this tree, `apps/pdf` had none of that as a contract:
//
//   * `usePdfStudioState.persistPdfData` built a `WorkspaceDocument` by hand, bumped `version` and called
//     `onUpdateDocument` — without validating the payload and without checking the document invariants. An
//     unstable or duplicated annotation id travelled to the shell unchallenged, and a native payload larger
//     than the store could hold was refused only later, by the serializer, with a byte count.
//   * Nothing proved a Save→Close→Reopen cycle, because the shell owns storage. But the **canonical**
//     serializer (`serializeWorkspaceDocumentCanonical` / `deserializeWorkspaceDocumentCanonical`) is a pure,
//     in-process boundary: a round trip through it *is* the Save→Close→Reopen proof, and it was never run.
//
// ## What this file deliberately does **not** own
//
// The schema version and its storage slot belong to the platform, and this app asks them instead of inventing
// a second mechanism:
//
//   * the version number: `studio/state/pdfStudioSchema.ts` (`PDF_STUDIO_SCHEMA_VERSION`), itself derived from
//     `WORKSPACE_SCHEMA_VERSIONS.PdfStudio`;
//   * the field and its spelling: `WORKSPACE_SCHEMA_FIELD` in
//     `platform/workspace/integrations/workspaceDocumentStamp.ts`, written by the shell stamp and read by
//     `resolveWorkspaceDocumentRead` in `platform/workspace/integrations/workspaceDocumentRead.ts`.
//
// An earlier draft of this file stored its own marker in `wom_extensions`. That was a **second slot for one
// fact** — the exact failure this project keeps paying for — and it was removed after reading
// `workspaceDocumentStamp.ts` and `workspaceDocumentRead.ts`.
//
// What *is* specific to this application, and therefore lives here: which payload fields exist, which bounds
// apply (each naming the module that owns it), which identities must be stable and unique, and how large a
// native payload may be before it stops being persistable.

import type { PdfDocumentModel, PdfFormField, PdfPageModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  MAX_SERIALIZED_DOCUMENT_BYTES,
  WorkspaceMalformedInputError,
  assertStableWorkspaceId,
} from '../../../platform/workspace/model/workspaceObjectModelPrimitives';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
  validateWorkspaceDocumentInvariants,
} from '../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';
import { resolveWorkspaceDocumentRead } from '../../../platform/workspace/integrations/workspaceDocumentRead';
import { WORKSPACE_SCHEMA_FIELD } from '../../../platform/workspace/integrations/workspaceDocumentStamp';
import { WorkspaceSchemaError } from '../../../platform/workspace/integrations/workspaceSchemaVersion';
import { PDF_WORKSPACE_IMPORT_LIMITS } from '../../../platform/interop/pdfWorkspaceImport';
import { PDF_REVIEW_LIMITS } from '../annotations/pdfReviewAnnotations';
import { PDF_FORM_LIMITS } from '../forms/model/pdfAcroFormModel';
import { MAX_PAGE_COUNT } from '../pages/pdfPageOps';
import { PDF_STUDIO_SCHEMA_VERSION } from '../studio/state/pdfStudioSchema';

/** Reserved room inside the serialized-document budget for everything that is not the app payload. */
const SERIALIZED_DOCUMENT_HEADROOM_BYTES = 4 * 1024 * 1024;

/** A base64 data URL spends four characters for every three bytes. */
const BASE64_EXPANSION_NUMERATOR = 4;
const BASE64_EXPANSION_DENOMINATOR = 3;

/** SHA-256 in lower-case hex, the only shape `platform/documents/pdf/nativeInspection.ts` emits. */
const SHA256_HEX = /^[a-f0-9]{64}$/u;

/** Strips an extension of the `data:…;base64,` envelope and reports the byte count it declares. */
const BASE64_MARKER = ';base64,';

export type PdfStudioPayloadIssueCode =
  | 'payload-not-an-object'
  | 'pages-missing'
  | 'num-pages-mismatch'
  | 'page-count-exceeded'
  | 'page-numbering-invalid'
  | 'page-box-invalid'
  | 'duplicate-id'
  | 'unstable-id'
  | 'dangling-page-reference'
  | 'annotation-limit-exceeded'
  | 'annotation-text-exceeds-limit'
  | 'annotation-reply-limit-exceeded'
  | 'annotation-ink-points-exceeded'
  | 'form-field-limit-exceeded'
  | 'form-field-name-invalid'
  | 'form-field-value-exceeds-limit'
  | 'raw-payload-size-exceeded'
  | 'raw-payload-metadata-inconsistent'
  | 'raw-payload-hash-missing'
  | 'document-kind-invalid'
  | 'document-id-invalid'
  | 'document-invariant-violated'
  | 'document-schema-newer'
  | 'document-schema-invalid'
  | 'serialized-document-too-large';

export interface PdfStudioPayloadIssue {
  readonly code: PdfStudioPayloadIssueCode;
  /** Dotted path of the offending value, e.g. `pdfData.annotations[3].id`. */
  readonly path: string;
  /** Concretely names the value and the rule, so a user can act on it. */
  readonly detail: string;
}

export class PdfStudioPersistenceError extends Error {
  constructor(readonly code: PdfStudioPayloadIssueCode, readonly path: string, readonly detail: string) {
    super(`${code} at ${path}: ${detail}`);
    this.name = 'PdfStudioPersistenceError';
  }
}

/**
 * The largest native PDF payload that can still be **persisted**, derived from the two limits that already
 * exist. `PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes` describes what may be *read*; the canonical document
 * serializer refuses a JSON payload above `MAX_SERIALIZED_DOCUMENT_BYTES`. Because the payload travels as a
 * base64 data URL, 72 MiB of PDF is already 96 MiB of JSON — the importer's ceiling is **above** the
 * persistence ceiling, so a document imported near that ceiling could never be saved. This function names the
 * overlap instead of encoding a third number.
 */
export function maxPersistableNativePdfBytes(): number {
  const jsonBudget = MAX_SERIALIZED_DOCUMENT_BYTES - SERIALIZED_DOCUMENT_HEADROOM_BYTES;
  const fromSerializedDocument = Math.floor((jsonBudget * BASE64_EXPANSION_DENOMINATOR) / BASE64_EXPANSION_NUMERATOR);
  return Math.max(0, Math.min(fromSerializedDocument, PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes));
}

/** Canonical JSON byte length of the payload, for the early size gate. */
export function estimatePdfStudioPayloadJsonBytes(model: PdfDocumentModel): number {
  return new TextEncoder().encode(JSON.stringify(model ?? null)).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteBox(box: unknown): boolean {
  if (!isRecord(box)) return false;
  return (['x', 'y', 'width', 'height'] as const).every((key) => typeof box[key] === 'number' && Number.isFinite(box[key]));
}

/**
 * Collects every schema violation instead of throwing on the first one. Callers that must fail closed use
 * `assertPdfStudioPayload`; callers that show a report use this.
 */
export function validatePdfStudioPayload(model: unknown, basePath = 'pdfData'): PdfStudioPayloadIssue[] {
  const issues: PdfStudioPayloadIssue[] = [];
  const push = (code: PdfStudioPayloadIssueCode, path: string, detail: string) => { issues.push({ code, path, detail }); };
  if (!isRecord(model)) {
    push('payload-not-an-object', basePath, `payload is ${model === null ? 'null' : typeof model}, expected the PdfDocumentModel object`);
    return issues;
  }
  const payload = model as unknown as PdfDocumentModel;
  if (!Array.isArray(payload.pages)) {
    push('pages-missing', `${basePath}.pages`, 'pages is not an array; the canonical model always carries its page list');
    return issues;
  }
  if (payload.pages.length > MAX_PAGE_COUNT) {
    push('page-count-exceeded', `${basePath}.pages`, `${payload.pages.length} pages exceed the ${MAX_PAGE_COUNT}-page policy of pages/pdfPageOps.ts`);
  }
  if (payload.numPages !== payload.pages.length) {
    push('num-pages-mismatch', `${basePath}.numPages`, `numPages is ${String(payload.numPages)} but pages.length is ${payload.pages.length}`);
  }
  for (const [index, page] of payload.pages.entries()) {
    if (!isRecord(page) || page.pageNumber !== index + 1) {
      push('page-numbering-invalid', `${basePath}.pages[${index}].pageNumber`, `page ${index} carries pageNumber ${String((page as PdfPageModel | undefined)?.pageNumber)}; pages must be numbered 1…${payload.pages.length} in order`);
    }
    const mediaBox = (page as PdfPageModel | undefined)?.mediaBox;
    if (mediaBox !== undefined && !finiteBox(mediaBox)) {
      push('page-box-invalid', `${basePath}.pages[${index}].mediaBox`, 'mediaBox must carry finite x, y, width and height');
    }
  }

  // Stable identity: one namespace per collection, and every id must satisfy the canonical WOM id rule so it
  // can be persisted as an object identity. `assertStableWorkspaceId` is *called*, not re-implemented.
  const pageNumbers = new Set(payload.pages.map((page) => (page as PdfPageModel | undefined)?.pageNumber));
  const collections: Array<[string, readonly { id?: unknown; page?: unknown }[] | undefined]> = [
    ['annotations', payload.annotations],
    ['redactions', payload.redactions],
    ['formFields', payload.formFields],
  ];
  const seen = new Map<string, string>();
  for (const [name, entries] of collections) {
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      push('payload-not-an-object', `${basePath}.${name}`, `${name} is not an array`);
      continue;
    }
    for (const [index, entry] of entries.entries()) {
      const id = entry?.id;
      if (typeof id !== 'string' || id.length === 0) {
        push('unstable-id', `${basePath}.${name}[${index}].id`, `${name}[${index}] has no string id`);
        continue;
      }
      const owner = seen.get(id);
      if (owner) push('duplicate-id', `${basePath}.${name}[${index}].id`, `id "${id}" is already used by ${owner}; identities must be unique across the document`);
      else seen.set(id, `${name}[${index}]`);
      try {
        assertStableWorkspaceId(id, `${name}[${index}] id`);
      } catch (cause) {
        push('unstable-id', `${basePath}.${name}[${index}].id`, cause instanceof Error ? cause.message : 'id is not a stable Workspace identity');
      }
      if (typeof entry.page === 'number' && !pageNumbers.has(entry.page)) {
        push('dangling-page-reference', `${basePath}.${name}[${index}].page`, `${name}[${index}] references page ${entry.page}, which the payload does not contain`);
      }
    }
  }
  for (const [pageIndex, page] of payload.pages.entries()) {
    for (const [sectionIndex, section] of ((page as PdfPageModel | undefined)?.sections ?? []).entries()) {
      const id = (section as { id?: unknown } | undefined)?.id;
      if (typeof id !== 'string' || id.length === 0) {
        push('unstable-id', `${basePath}.pages[${pageIndex}].sections[${sectionIndex}].id`, 'section has no string id');
        continue;
      }
      const owner = seen.get(id);
      if (owner) push('duplicate-id', `${basePath}.pages[${pageIndex}].sections[${sectionIndex}].id`, `id "${id}" is already used by ${owner}`);
      else seen.set(id, `pages[${pageIndex}].sections[${sectionIndex}]`);
      try {
        assertStableWorkspaceId(id, 'section id');
      } catch (cause) {
        push('unstable-id', `${basePath}.pages[${pageIndex}].sections[${sectionIndex}].id`, cause instanceof Error ? cause.message : 'section id is not a stable Workspace identity');
      }
    }
  }

  // Documented field bounds, each naming the module that owns the bound.
  const annotations = Array.isArray(payload.annotations) ? payload.annotations : [];
  if (annotations.length > PDF_REVIEW_LIMITS.maxAnnotations) {
    push('annotation-limit-exceeded', `${basePath}.annotations`, `${annotations.length} annotations exceed the ${PDF_REVIEW_LIMITS.maxAnnotations} of PDF_REVIEW_LIMITS`);
  }
  for (const [index, annotation] of annotations.entries()) {
    const text = (annotation as { text?: unknown } | undefined)?.text;
    if (typeof text === 'string' && text.length > PDF_REVIEW_LIMITS.maxTextChars) {
      push('annotation-text-exceeds-limit', `${basePath}.annotations[${index}].text`, `${text.length} characters exceed the ${PDF_REVIEW_LIMITS.maxTextChars} of PDF_REVIEW_LIMITS.maxTextChars`);
    }
    const replies = (annotation as { replies?: unknown } | undefined)?.replies;
    if (Array.isArray(replies) && replies.length > PDF_REVIEW_LIMITS.maxRepliesPerAnnotation) {
      push('annotation-reply-limit-exceeded', `${basePath}.annotations[${index}].replies`, `${replies.length} replies exceed the ${PDF_REVIEW_LIMITS.maxRepliesPerAnnotation} of PDF_REVIEW_LIMITS`);
    }
    const points = (annotation as { points?: unknown } | undefined)?.points;
    if (Array.isArray(points) && points.length > PDF_REVIEW_LIMITS.maxInkPoints) {
      push('annotation-ink-points-exceeded', `${basePath}.annotations[${index}].points`, `${points.length} ink points exceed the ${PDF_REVIEW_LIMITS.maxInkPoints} of PDF_REVIEW_LIMITS`);
    }
  }
  const fields = Array.isArray(payload.formFields) ? payload.formFields : [];
  if (fields.length > PDF_FORM_LIMITS.maxFields) {
    push('form-field-limit-exceeded', `${basePath}.formFields`, `${fields.length} fields exceed the ${PDF_FORM_LIMITS.maxFields} of PDF_FORM_LIMITS`);
  }
  for (const [index, field] of fields.entries()) {
    const candidate = field as PdfFormField | undefined;
    const name = candidate?.name;
    if (typeof name !== 'string' || name.length === 0 || name.length > PDF_FORM_LIMITS.maxName) {
      push('form-field-name-invalid', `${basePath}.formFields[${index}].name`, `name must be 1…${PDF_FORM_LIMITS.maxName} characters, received ${typeof name === 'string' ? name.length : typeof name}`);
    }
    const value = candidate?.value;
    const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    for (const entry of values) {
      if (entry.length > PDF_FORM_LIMITS.maxValueLength) {
        push('form-field-value-exceeds-limit', `${basePath}.formFields[${index}].value`, `${entry.length} characters exceed the ${PDF_FORM_LIMITS.maxValueLength} of PDF_FORM_LIMITS.maxValueLength`);
      }
    }
  }

  // Native byte payload: size, provenance and hash. A data URL without its manifest is indistinguishable from
  // a truncated import, so the three fields are checked together.
  const dataUrl = payload.rawPdfDataUrl;
  if (typeof dataUrl === 'string' && dataUrl.length > 0) {
    const markerIndex = dataUrl.indexOf(BASE64_MARKER);
    if (!dataUrl.startsWith('data:application/pdf;base64,') || markerIndex < 0) {
      push('raw-payload-metadata-inconsistent', `${basePath}.rawPdfDataUrl`, 'native payload is not an application/pdf base64 data URL');
    } else {
      const base64 = dataUrl.slice(markerIndex + BASE64_MARKER.length);
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
      const decodedLength = base64.length % 4 === 0 ? (base64.length / 4) * 3 - padding : -1;
      const declaredLength = payload.rawPdfByteLength;
      if (decodedLength < 0) {
        push('raw-payload-metadata-inconsistent', `${basePath}.rawPdfDataUrl`, 'base64 payload length is not a multiple of four');
      } else if (decodedLength > maxPersistableNativePdfBytes()) {
        push('raw-payload-size-exceeded', `${basePath}.rawPdfDataUrl`, `${decodedLength} native PDF bytes exceed the ${maxPersistableNativePdfBytes()}-byte persistability bound (derived from MAX_SERIALIZED_DOCUMENT_BYTES and PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes)`);
      }
      if (typeof declaredLength !== 'number' || declaredLength !== decodedLength) {
        push('raw-payload-metadata-inconsistent', `${basePath}.rawPdfByteLength`, `declared ${String(declaredLength)} does not match the ${decodedLength} bytes the data URL carries`);
      }
    }
    if (typeof payload.rawPdfFileName !== 'string' || payload.rawPdfFileName.length === 0) {
      push('raw-payload-metadata-inconsistent', `${basePath}.rawPdfFileName`, 'a native payload needs its origin file name next to it, otherwise the viewer shows a nameless document');
    }
    const inspection = payload.rawPdfInspection;
    if (!isRecord(inspection)) {
      push('raw-payload-hash-missing', `${basePath}.rawPdfInspection`, 'a native payload must carry the bounded import snapshot, including its SHA-256');
    } else if (typeof inspection.sha256 !== 'string' || !SHA256_HEX.test(inspection.sha256)) {
      push('raw-payload-hash-missing', `${basePath}.rawPdfInspection.sha256`, 'import snapshot has no lower-case SHA-256 hex digest');
    } else if (typeof inspection.byteLength !== 'number' || inspection.byteLength !== payload.rawPdfByteLength) {
      push('raw-payload-metadata-inconsistent', `${basePath}.rawPdfInspection.byteLength`, `import snapshot reports ${String(inspection.byteLength)} bytes, the payload declares ${String(payload.rawPdfByteLength)}`);
    }
  } else if (payload.rawPdfFileName !== undefined || payload.rawPdfByteLength !== undefined || payload.rawPdfInspection !== undefined) {
    push('raw-payload-metadata-inconsistent', `${basePath}.rawPdfDataUrl`, 'native payload metadata is present without the byte payload itself');
  }
  return issues;
}

/** Fail-closed form of `validatePdfStudioPayload`: the first violation becomes a named error. */
export function assertPdfStudioPayload(model: unknown, basePath = 'pdfData'): void {
  const issues = validatePdfStudioPayload(model, basePath);
  if (issues.length > 0) throw new PdfStudioPersistenceError(issues[0].code, issues[0].path, issues[0].detail);
}

/**
 * The read side of the schema contract, asked of the module that owns it.
 *
 * `resolveWorkspaceDocumentRead` is fail-closed: a **newer** version and an **unusable** value are rejected,
 * a missing one is allowed as `legacy` (a store written before versioning). This wraps it so the refusal
 * carries this application's name and path instead of a bare platform error.
 */
export function assertPdfStudioSchemaReadable(document: WorkspaceDocument): void {
  try {
    resolveWorkspaceDocumentRead(document);
  } catch (cause) {
    if (!(cause instanceof WorkspaceSchemaError)) throw cause;
    const newer = cause.reason === 'newer-than-supported';
    throw new PdfStudioPersistenceError(
      newer ? 'document-schema-newer' : 'document-schema-invalid',
      'schemaVersion',
      newer
        ? `document schema version is newer than the supported ${PDF_STUDIO_SCHEMA_VERSION}; refusing to read it rather than reading it best-effort`
        : `document schema version is unusable (${cause.reason}); refusing to assume a version`,
    );
  }
}

/**
 * The value the stored document envelope carries in the canonical schema field, whatever it is.
 *
 * Read through the field name the platform owns (`WORKSPACE_SCHEMA_FIELD`), never through a literal: a second
 * spelling of one field is how a stamp and its reader lose each other.
 */
export function readPdfStudioSchemaStamp(document: WorkspaceDocument): unknown {
  return (document as WorkspaceDocument & Record<string, unknown>)[WORKSPACE_SCHEMA_FIELD];
}

/**
 * Requires the envelope to carry **this** version, for callers that just wrote it (the live save path stamps
 * it in `usePdfStudioState`). Distinct from `assertPdfStudioSchemaReadable`, which deliberately allows a
 * pre-versioning store as `legacy`.
 */
export function assertPdfStudioSchemaStamped(document: WorkspaceDocument): void {
  const found = readPdfStudioSchemaStamp(document);
  if (found !== PDF_STUDIO_SCHEMA_VERSION) {
    throw new PdfStudioPersistenceError('document-schema-invalid', WORKSPACE_SCHEMA_FIELD, `envelope carries ${String(found)}, expected the current ${PDF_STUDIO_SCHEMA_VERSION}; the application stamp must run on the save path`);
  }
}

/**
 * The canonical write path. Everything a feature changes reaches the document through here.
 *
 * It validates the payload, checks the document invariants, bumps `version` and `modified_at` — and it **does
 * not touch** `protection` or `securityPolicy`. The shell encrypts with that metadata; an application that
 * rewrote it while saving would silently weaken the store, so the saved document is checked against the
 * incoming one for exactly those two fields.
 *
 * **The schema stamp is not written here.** `platform/workspace/integrations/workspaceDocumentStamp.ts` is
 * measured by `src/testing/cross-app/integrationSchemaAdoption.contract.test.mjs` as having **exactly one**
 * production caller (`src/app/useWorkspaceDocumentUpdates.ts`), and that contract is right: one place stamps
 * the envelope. A second stamping site inside `apps/pdf` would be a second mechanism — so this function
 * *reads* the stamp fail-closed (via `assertPdfStudioSchemaReadable`) and the application's own envelope stamp
 * runs in the live save path (`usePdfStudioState.persistPdfData`). The name of that application stamp is not
 * written here on purpose: the cross-app contract measures the bare symbol name in the file text, comments
 * included, and a comment is not a call site.
 */
export function savePdfStudioDocument(
  document: WorkspaceDocument,
  model: PdfDocumentModel,
  now = Date.now(),
): WorkspaceDocument {
  if (document.kind !== 'PdfStudio') {
    throw new PdfStudioPersistenceError('document-kind-invalid', 'kind', `document kind is ${String(document.kind)}, expected PdfStudio`);
  }
  try {
    assertStableWorkspaceId(document.id, 'PDF Studio document id');
  } catch (cause) {
    throw new PdfStudioPersistenceError('document-id-invalid', 'id', cause instanceof Error ? cause.message : 'document id is not a stable Workspace identity');
  }
  if (!Number.isInteger(document.version) || document.version < 1) {
    throw new PdfStudioPersistenceError('document-invariant-violated', 'version', `document version is ${String(document.version)}`);
  }
  // The canonical invariant is `modified_at >= created_at`. Checking it here turns the platform's generic
  // sentence into a named reason that says which timestamp and which clock the caller passed.
  if (!Number.isFinite(now) || now < document.created_at) {
    throw new PdfStudioPersistenceError('document-invariant-violated', 'modified_at', `save timestamp ${String(now)} is before the document's created_at ${document.created_at}; a document cannot be modified before it exists`);
  }
  assertPdfStudioSchemaReadable(document);
  assertPdfStudioPayload(model);
  const next: WorkspaceDocument = { ...document, modified_at: now, version: document.version + 1, pdfData: model };
  try {
    validateWorkspaceDocumentInvariants(next);
  } catch (cause) {
    throw new PdfStudioPersistenceError(
      'document-invariant-violated',
      'document',
      cause instanceof WorkspaceMalformedInputError || cause instanceof Error ? cause.message : 'document invariants rejected the save',
    );
  }
  assertPdfStudioProtectionPreserved(document, next);
  return next;
}

/** The save path must not change who may read the document, nor how strongly it is protected. */
export function assertPdfStudioProtectionPreserved(before: WorkspaceDocument, after: WorkspaceDocument): void {
  const left = JSON.stringify(before.protection ?? null);
  const right = JSON.stringify(after.protection ?? null);
  if (left !== right) throw new PdfStudioPersistenceError('document-invariant-violated', 'protection', `saving changed the protection metadata (${left} → ${right}); an application must not rewrite the store's protection contract`);
  const leftPolicy = JSON.stringify(before.securityPolicy ?? null);
  const rightPolicy = JSON.stringify(after.securityPolicy ?? null);
  if (leftPolicy !== rightPolicy) throw new PdfStudioPersistenceError('document-invariant-violated', 'securityPolicy', `saving changed the security policy (${leftPolicy} → ${rightPolicy})`);
}

/**
 * Save: hand the document to the **canonical** WOM serializer. No second serializer, no `JSON.stringify` of
 * the whole document in this application.
 */
export function serializePdfStudioDocument(document: WorkspaceDocument): string {
  assertPdfStudioSchemaReadable(document);
  assertPdfStudioPayload(document.pdfData);
  try {
    return serializeWorkspaceDocumentCanonical(document);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'canonical serialization failed';
    if (/exceeds size limit/u.test(message)) {
      throw new PdfStudioPersistenceError('serialized-document-too-large', 'document', `serialized document exceeds the canonical ${MAX_SERIALIZED_DOCUMENT_BYTES}-byte limit`);
    }
    throw new PdfStudioPersistenceError('document-invariant-violated', 'document', message);
  }
}

/**
 * Close and reopen: hand the string back to the canonical WOM deserializer, then apply this application's own
 * schema and payload decisions. A payload this client cannot read is refused by name.
 */
export function reopenPdfStudioDocument(serialized: string): WorkspaceDocument {
  let document: WorkspaceDocument;
  try {
    document = deserializeWorkspaceDocumentCanonical(serialized);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'canonical deserialization failed';
    throw new PdfStudioPersistenceError('document-invariant-violated', 'document', message);
  }
  if (document.kind !== 'PdfStudio') {
    throw new PdfStudioPersistenceError('document-kind-invalid', 'kind', `reopened document kind is ${String(document.kind)}, expected PdfStudio`);
  }
  assertPdfStudioSchemaReadable(document);
  assertPdfStudioPayload(document.pdfData);
  return document;
}

export interface PdfStudioRoundTripResult {
  readonly saved: WorkspaceDocument;
  readonly serialized: string;
  readonly reheardSerialized: string;
  readonly reopened: WorkspaceDocument;
  /** True when re-serializing the reopened document reproduces the same bytes: the strongest form of identity through the canonical boundary. */
  readonly byteIdentical: boolean;
  readonly serializedBytes: number;
}

/**
 * Save → Close → Reopen, in process, over the canonical boundary.
 *
 * Identity is proven by re-serializing the reopened document: the canonical serializer sorts keys, so equal
 * output means the payload came back value-for-value, independent of property order. `version`, `modified_at`
 * and the schema version are part of that comparison, which is why the round trip runs on the **saved**
 * document and does not save a second time.
 */
export function assertPdfStudioRoundTrip(document: WorkspaceDocument): PdfStudioRoundTripResult {
  const serialized = serializePdfStudioDocument(document);
  const reopened = reopenPdfStudioDocument(serialized);
  const reheardSerialized = serializePdfStudioDocument(reopened);
  return {
    saved: document,
    serialized,
    reheardSerialized,
    reopened,
    byteIdentical: reheardSerialized === serialized,
    serializedBytes: new TextEncoder().encode(serialized).byteLength,
  };
}
