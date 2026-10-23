// STATUS: PLATIN — the one user-delivery rule for application exports (Release Beta 0.1).
//
// Release blocker: "export reports success but produces a broken file = no". On the desktop a
// synthetic `<a download>` inside the WebView does not reliably write a file. Every app export now
// goes through this module:
//
//   1. the artifact is validated/asserted by the caller (`assertArtifact`),
//   2. the byte budget for the safe native transport is enforced *before* any dialog/IPC,
//   3. `nativeShellSaveBytes` writes through the native save dialog + atomic sandbox export and only
//      then returns the granted file name → `mode: 'file'` is the only confirmed success,
//   4. only when the app does not run natively (`null`) does the browser download fallback stay, and
//      it is reported as `mode: 'download'` — the caller must not call that "saved".
//
// Errors from the native helper are passed through unchanged (the desktop messages are user-facing
// German). Errors raised here use `ExportDeliveryError` with a stable code so multi-artifact exports
// can tell "user cancelled" from "write failed" and stop instead of opening more dialogs.
import {
  DEFAULT_SHELL_NATIVE_POLICY,
  nativeShellSaveBytes,
} from '../../platform/native/nativeShellServices';

export type ExportDeliveryMode = 'file' | 'download';

export interface ExportDeliveryResult {
  /** The name the desktop granted (native) or the suggested browser download name. */
  readonly fileName: string;
  /** `file` = a file was confirmed written; `download` = browser link only, unconfirmed. */
  readonly mode: ExportDeliveryMode;
}

export type ExportDeliveryErrorCode =
  | 'invalid-name'
  | 'invalid-type'
  | 'empty'
  | 'too-large'
  | 'unavailable'
  | 'invalid-data-url';

export class ExportDeliveryError extends Error {
  readonly code: ExportDeliveryErrorCode;

  constructor(code: ExportDeliveryErrorCode, message: string) {
    super(message);
    this.name = 'ExportDeliveryError';
    this.code = code;
  }
}

/**
 * The desktop delivers bytes as base64 through the IPC. 90 MB of base64 is the documented ceiling;
 * a larger artifact is rejected *by name* before it can exhaust memory — never silently skipped.
 */
export const EXPORT_DELIVERY_MAX_BASE64_BYTES = 90 * 1024 * 1024;

/** Attachments/data URLs are decoded in memory; this bound keeps a hostile data URL from doing that. */
export const EXPORT_DELIVERY_MAX_DATA_URL_BYTES = 128 * 1024 * 1024;

export interface ExportDeliveryOptions {
  readonly suggestedName: string;
  readonly extensions: readonly string[];
  readonly mimeType: string;
  /** Preflight on the finished artifact (e.g. PDF signature). Runs before the dialog. */
  readonly assertArtifact?: (bytes: Uint8Array) => void;
  /** Lower ceiling for callers with a tighter budget or tests. Default: 90 MB base64. */
  readonly maxBase64Bytes?: number;
}

export interface ExportDataUrlOptions {
  readonly suggestedName: string;
  readonly extensions: readonly string[];
  /** Defaults to the MIME type carried by the data URL. */
  readonly mimeType?: string;
  readonly maxBytes?: number;
  readonly assertArtifact?: (bytes: Uint8Array) => void;
  readonly maxBase64Bytes?: number;
}

const MAX_FILE_NAME_LENGTH = 255;
const MAX_EXTENSIONS = 8;
const FILE_NAME_FORBIDDEN = /[/\\\u0000-\u001f]/u;
const EXTENSION_PATTERN = /^[a-z0-9]{1,12}$/u;
const MIME_PATTERN = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*/u;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/u;

interface NormalizedDeliveryOptions {
  readonly suggestedName: string;
  readonly extensions: string[];
  readonly mimeType: string;
}

export function estimateExportBase64Bytes(byteLength: number): number {
  return Math.ceil(Math.max(0, byteLength) / 3) * 4;
}

/** Exported separately so the boundary is provable with a small synthetic ceiling in tests. */
export function assertExportDeliveryByteBudget(
  bytes: Uint8Array,
  maxBase64Bytes: number = EXPORT_DELIVERY_MAX_BASE64_BYTES,
): void {
  const estimated = estimateExportBase64Bytes(bytes.byteLength);
  if (estimated > maxBase64Bytes) {
    const sizeMb = Math.ceil(estimated / (1024 * 1024));
    const limitMb = Math.floor(maxBase64Bytes / (1024 * 1024));
    throw new ExportDeliveryError(
      'too-large',
      `Datei zu groß für den sicheren Export (${sizeMb} MB als Base64, Grenze ${limitMb} MB) — es wurde keine Datei geschrieben.`,
    );
  }
}

function normalizeFileName(rawName: unknown, extensions: string[]): string {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (
    name.length === 0
    || name.length > MAX_FILE_NAME_LENGTH
    || FILE_NAME_FORBIDDEN.test(name)
    || name.startsWith('-')
    || name === '.'
    || name === '..'
  ) {
    throw new ExportDeliveryError('invalid-name', 'Der vorgeschlagene Dateiname ist ungültig — es wurde keine Datei geschrieben.');
  }
  if (extensions.length > 0 && !extensions.some((extension) => name.toLowerCase().endsWith(`.${extension}`))) {
    // A file without a type is exactly the failure the native dialog now refuses; append the
    // declared type deterministically instead of asking the user to fix the name.
    return `${name}.${extensions[0]}`;
  }
  return name;
}

function normalizeDeliveryOptions(options: ExportDeliveryOptions): NormalizedDeliveryOptions {
  const extensions = [...new Set(
    (Array.isArray(options.extensions) ? options.extensions : [])
      .map((extension) => String(extension ?? '').trim().toLowerCase())
      .filter(Boolean),
  )];
  if (extensions.length > MAX_EXTENSIONS) {
    throw new ExportDeliveryError('invalid-type', 'Der Export deklariert zu viele Dateitypen — es wurde keine Datei geschrieben.');
  }
  for (const extension of extensions) {
    if (!EXTENSION_PATTERN.test(extension)) {
      throw new ExportDeliveryError('invalid-type', `Der Dateityp „${extension}" ist ungültig — es wurde keine Datei geschrieben.`);
    }
  }
  const mimeType = typeof options.mimeType === 'string' ? options.mimeType.trim() : '';
  if (!MIME_PATTERN.test(mimeType)) {
    throw new ExportDeliveryError('invalid-type', 'Der MIME-Typ des Exports ist ungültig — es wurde keine Datei geschrieben.');
  }
  return { suggestedName: normalizeFileName(options.suggestedName, extensions), extensions, mimeType };
}

function describeFailure(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'unbekannter Fehler';
}

function assertExportBytes(bytes: unknown): asserts bytes is Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    throw new ExportDeliveryError('empty', 'Der Export enthält keine gültigen Bytes — es wurde keine Datei geschrieben.');
  }
  if (bytes.byteLength === 0) {
    throw new ExportDeliveryError('empty', 'Der Export enthält keine Daten — es wurde keine Datei geschrieben.');
  }
}

function downloadInBrowser(bytes: Uint8Array, fileName: string, mimeType: string): ExportDeliveryResult {
  if (
    typeof document === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
    || !document.body
  ) {
    throw new ExportDeliveryError(
      'unavailable',
      'Die Datei kann in dieser Umgebung nicht ausgeliefert werden — es wurde keine Datei geschrieben.',
    );
  }
  let objectUrl: string;
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    objectUrl = URL.createObjectURL(new Blob([copy.buffer as ArrayBuffer], { type: mimeType }));
  } catch (error) {
    throw new ExportDeliveryError(
      'unavailable',
      `Der Download konnte nicht vorbereitet werden: ${describeFailure(error)}`,
    );
  }
  const anchor = document.createElement('a');
  try {
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    // Browser downloads cannot be confirmed; the caller reports this as a download, not a save.
    return { fileName, mode: 'download' };
  } catch (error) {
    throw new ExportDeliveryError(
      'unavailable',
      `Der Download konnte nicht gestartet werden: ${describeFailure(error)}`,
    );
  } finally {
    anchor.remove();
    // Revoking in the same task can cancel a download that has not started yet in WebView2.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // The host cleans up on its own.
      }
    }, 1_000);
  }
}

/**
 * Delivers one finished export to the user.
 *
 * Returns `mode:'file'` **only** after `nativeShellSaveBytes` confirmed the atomic write. In the
 * browser it returns `mode:'download'`; there is no silent success path.
 */
export async function deliverExportBytes(
  bytes: Uint8Array,
  options: ExportDeliveryOptions,
): Promise<ExportDeliveryResult> {
  assertExportBytes(bytes);
  const normalized = normalizeDeliveryOptions(options);
  options.assertArtifact?.(bytes);
  assertExportDeliveryByteBudget(bytes, options.maxBase64Bytes ?? EXPORT_DELIVERY_MAX_BASE64_BYTES);

  const nativeName = await nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, bytes, {
    suggestedName: normalized.suggestedName,
    extensions: normalized.extensions,
  });
  if (nativeName) return { fileName: nativeName, mode: 'file' };
  return downloadInBrowser(bytes, normalized.suggestedName, normalized.mimeType);
}

export function deliverExportText(text: string, options: ExportDeliveryOptions): Promise<ExportDeliveryResult> {
  if (typeof text !== 'string') {
    throw new ExportDeliveryError('empty', 'Der Export enthält keinen Text — es wurde keine Datei geschrieben.');
  }
  return deliverExportBytes(new TextEncoder().encode(text), options);
}

export async function deliverExportBlob(blob: Blob, options: ExportDeliveryOptions): Promise<ExportDeliveryResult> {
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw new ExportDeliveryError('empty', 'Der Export enthält keine Daten — es wurde keine Datei geschrieben.');
  }
  return deliverExportBytes(new Uint8Array(await blob.arrayBuffer()), options);
}

export interface DecodedExportDataUrl {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

/** Decodes a base64 data URL with a hard byte bound; anything else is rejected by name. */
export function decodeExportDataUrl(
  dataUrl: string,
  maxBytes: number = EXPORT_DELIVERY_MAX_DATA_URL_BYTES,
): DecodedExportDataUrl {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0 || dataUrl.length > maxBytes * 2) {
    throw new ExportDeliveryError('invalid-data-url', 'Die Exportdaten sind ungültig oder zu groß — es wurde keine Datei geschrieben.');
  }
  const separator = dataUrl.indexOf(',');
  const header = separator > 0 ? dataUrl.slice(5, separator) : '';
  const payload = separator > 0 ? dataUrl.slice(separator + 1) : '';
  if (!dataUrl.startsWith('data:') || !header.split(';').includes('base64') || !payload || !BASE64_PATTERN.test(payload)) {
    throw new ExportDeliveryError('invalid-data-url', 'Die Exportdaten sind keine gültige Base64-Datei — es wurde keine Datei geschrieben.');
  }
  const mimeType = header.slice(0, header.indexOf(';') >= 0 ? header.indexOf(';') : header.length) || 'application/octet-stream';
  if (estimateExportBase64Bytes(Math.floor((payload.length * 3) / 4)) > maxBytes) {
    throw new ExportDeliveryError('too-large', 'Die Exportdaten sind zu groß für den sicheren Export — es wurde keine Datei geschrieben.');
  }
  let binary: string;
  try {
    binary = globalThis.atob(payload);
  } catch {
    throw new ExportDeliveryError('invalid-data-url', 'Die Exportdaten sind keine gültige Base64-Datei — es wurde keine Datei geschrieben.');
  }
  if (binary.length > maxBytes) {
    throw new ExportDeliveryError('too-large', 'Die Exportdaten sind zu groß für den sicheren Export — es wurde keine Datei geschrieben.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, mimeType };
}

/** Convenience for attachment exports that are stored as base64 data URLs. */
export async function deliverExportDataUrl(
  dataUrl: string,
  options: ExportDataUrlOptions,
): Promise<ExportDeliveryResult> {
  const decoded = decodeExportDataUrl(dataUrl, options.maxBytes ?? EXPORT_DELIVERY_MAX_DATA_URL_BYTES);
  return deliverExportBytes(decoded.bytes, {
    suggestedName: options.suggestedName,
    extensions: options.extensions,
    mimeType: options.mimeType ?? decoded.mimeType,
    assertArtifact: options.assertArtifact,
    maxBase64Bytes: options.maxBase64Bytes,
  });
}

const EXPORT_ABORT_PATTERNS = /kein ziel|abgebrochen|keine datei geschrieben|no destination|aborted|cancell?ed/iu;

/**
 * Whether a native delivery error means "the user did not choose a destination / aborted", so a
 * multi-artifact export must stop instead of opening further dialogs. Real write failures are not
 * classified as an abort and propagate unchanged.
 */
export function isExportDeliveryAbort(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.length > 0 && EXPORT_ABORT_PATTERNS.test(message);
}
