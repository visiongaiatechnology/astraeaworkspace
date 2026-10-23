// STATUS: DIAMANT VGT SUPREME
// Opening an arbitrary foreign PDF **inside** PDF Studio, through the canonical hostile-import boundary.
//
// ## Why this file exists
//
// AST-0761 asks for a directly reachable visible entry to open a PDF from disk, and AST-0907/0908 ask that a
// truncated PDF be rejected without a crash and without silent data loss. Measured on this tree, `apps/pdf` had
// neither: the only whole-file pickers were `shell/start-center/StartCenter.tsx` and `shell/header/Header.tsx`
// (not this application's ownership), and the in-app picker
// (`interchange/PdfForeignPageInsertPanel.tsx`) imports foreign pages as **images**, not as a byte-preserving
// document. Nothing in `apps/pdf` ever called `inspectNativePdfBytes`.
//
// ## What this module deliberately reuses instead of rebuilding
//
//   * the **structure gate**: `platform/documents/pdf/nativeInspection.ts` — `%PDF` header, `%%EOF`, byte,
//     object, stream, xref and declared-length budgets, SHA-256, capability snapshot. Writing a second header
//     check here is the failure this project has paid for; the platform check is called.
//   * the **persistability bound**: `../persistence/pdfStudioPersistence.maxPersistableNativePdfBytes()`,
//     derived from the two limits that already exist. An imported PDF that could never be saved is refused
//     **before** the user edits it, with a named reason instead of a late serializer byte count.
//   * the **data-URL envelope**: the same shape `security/pdfNativeDataUrl.decodePdfDataUrl` reads back, so the
//     viewer, the sanitizer and the inspector all see the payload they already understand.
//
// Every rejection is a named code with a localized message; nothing here throws for a user-reachable input.

import { inspectNativePdfBytes } from '../../../../platform/documents/pdf/nativeInspection';
import type { PdfDocumentModel, PdfNativeInspectionSnapshot, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { sanitizePdfFileName } from '../../security/pdfFileName';
import { maxPersistableNativePdfBytes } from '../../persistence/pdfStudioPersistence';

/** Why a foreign PDF was not opened. Each code has a localized sentence in `locale/pdfWorkflowDialogsLocale.ts`. */
export type PdfNativeOpenFailureCode =
  | 'empty-file'
  | 'not-a-pdf'
  | 'too-large-to-persist'
  | 'truncated'
  | 'inspection-budget-exceeded'
  | 'file-name-invalid'
  | 'read-failed';

export interface PdfNativeOpenSuccess {
  readonly ok: true;
  readonly fileName: string;
  readonly byteLength: number;
  readonly inspection: PdfNativeInspectionSnapshot;
  /** The payload to hand to the canonical persistence path and to the native viewer. */
  readonly payload: PdfDocumentModel;
}

export interface PdfNativeOpenFailure {
  readonly ok: false;
  readonly code: PdfNativeOpenFailureCode;
  /** Concrete, bounded detail for the log and for the UI's secondary line. Never the file's content. */
  readonly detail: string;
}

export type PdfNativeOpenResult = PdfNativeOpenSuccess | PdfNativeOpenFailure;

const MAX_FILE_NAME_CHARS = 255;

/** The one place this application maps a platform inspection refusal onto a named, localizable code. */
function classifyInspectionFailure(message: string, byteLength: number): PdfNativeOpenFailureCode {
  if (/missing or unsupported %PDF header/iu.test(message)) return 'not-a-pdf';
  if (/final %%EOF marker is missing/iu.test(message)) return 'truncated';
  if (/exceeds the \d+-byte import boundary/iu.test(message)) return byteLength > maxPersistableNativePdfBytes() ? 'too-large-to-persist' : 'inspection-budget-exceeded';
  if (/budget exceeded|safe decode budget|exceeded \d+ ms/iu.test(message)) return 'inspection-budget-exceeded';
  return 'not-a-pdf';
}

/**
 * A bounded, printable file name; the exported/downloaded name is derived from it everywhere else.
 *
 * It delegates to `security/pdfFileName.ts` — the one rule, shared with the download path — instead of holding
 * its own character class. The extra bound here is this module's: a name that is longer than any file system
 * accepts is not a name.
 */
export function normalizePdfFileName(value: string): string {
  return sanitizePdfFileName(value, 'document.pdf').slice(0, MAX_FILE_NAME_CHARS);
}

/**
 * Base64 without `btoa` on a huge string: chunked so a 70 MiB payload does not need a 70 MiB intermediate
 * string per chunk step, and bounded by the caller's size gate before it is called.
 */
function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return btoa(binary);
}

/**
 * Opens foreign PDF bytes. Pure apart from the platform inspection call, so it is testable without a browser.
 *
 * The returned payload has **no pages**: the byte payload *is* the document, the page list comes from the
 * renderer, and inventing structured pages here would claim structure the model does not have. The one
 * consequence — the studio must not replace such a payload with its demonstration model — is handled where the
 * studio picks its payload (`studio/state/usePdfStudioState.ts`).
 */
export async function openNativePdfPayload(input: { fileName: string; bytes: Uint8Array }): Promise<PdfNativeOpenResult> {
  const fileName = normalizePdfFileName(input.fileName);
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    return { ok: false, code: 'empty-file', detail: 'the chosen file is empty' };
  }
  const byteLength = input.bytes.byteLength;
  if (byteLength > maxPersistableNativePdfBytes()) {
    return {
      ok: false,
      code: 'too-large-to-persist',
      detail: `${byteLength} bytes exceed the ${maxPersistableNativePdfBytes()}-byte persistability bound; a document this large could not be saved again after editing`,
    };
  }
  if (fileName === 'document.pdf' && !input.fileName.trim()) {
    return { ok: false, code: 'file-name-invalid', detail: 'the chosen file has no usable name' };
  }
  let inspection: PdfNativeInspectionSnapshot;
  try {
    inspection = await inspectNativePdfBytes(input.bytes);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'the bounded PDF inspection failed';
    return { ok: false, code: classifyInspectionFailure(message, byteLength), detail: message };
  }
  return {
    ok: true,
    fileName,
    byteLength,
    inspection,
    payload: {
      numPages: 0,
      pages: [],
      annotations: [],
      redactions: [],
      rawPdfDataUrl: `data:application/pdf;base64,${toBase64(input.bytes)}`,
      rawPdfFileName: fileName,
      rawPdfByteLength: byteLength,
      rawPdfInspection: inspection,
    },
  };
}

/**
 * The derived Workspace document for a freshly opened foreign PDF.
 *
 * A derived document (not an overwrite) is the honest default: the bytes are a different document from the one
 * that was open, and the shell already offers `onCreateDerivedDocument` for exactly that. The id is stable and
 * unique through `createId`, the title comes from the file name, and the payload version is stamped by the
 * canonical save path — this function does not invent a document envelope of its own.
 */
export function buildNativePdfDerivedDocument(input: {
  createId: () => string;
  payload: PdfDocumentModel;
  fileName: string;
  now?: number;
  themeId?: string;
}): Pick<WorkspaceDocument, 'id' | 'title' | 'kind' | 'created_at' | 'modified_at' | 'version' | 'theme_id' | 'root_object_ids' | 'objects' | 'pdfData'> {
  const now = input.now ?? Date.now();
  const title = input.fileName.replace(/\.pdf$/iu, '').slice(0, 200) || 'PDF';
  return {
    id: input.createId(),
    title,
    kind: 'PdfStudio',
    created_at: now,
    modified_at: now,
    version: 1,
    theme_id: input.themeId ?? 'default',
    root_object_ids: [],
    objects: {},
    pdfData: input.payload,
  };
}
