// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — hostile native PDF import boundary and bounded capability inspector.
import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';
import { PDF_WORKSPACE_IMPORT_LIMITS } from '../../interop/pdfWorkspaceImport';

import type { PdfNativeInspectionSnapshot } from '../../../shared/contracts/workspace';
import { assertSecurityBoundaryBytes } from '../../security/securityGatesPlatform';

export const PDF_NATIVE_IMPORT_LIMITS = Object.freeze({
  maxBytes: PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes,
  maxObjectHeaders: 500_000,
  maxStreamMarkers: 250_000,
  maxXrefMarkers: 8_192,
  maxDeclaredStreamLength: 64 * 1024 * 1024,
  maxScanMillis: 2_500,
  maxExternalReferences: 10_000,
  maxExternalHosts: 128,
});

export interface PdfNativeInspectionLimits {
  maxBytes?: number;
  maxObjectHeaders?: number;
  maxStreamMarkers?: number;
  maxXrefMarkers?: number;
  maxDeclaredStreamLength?: number;
  maxScanMillis?: number;
  maxExternalReferences?: number;
  maxExternalHosts?: number;
}

const ASCII = new TextDecoder('windows-1252', { fatal: false, ignoreBOM: true });
const CHUNK_BYTES = 512 * 1024;
const CHUNK_OVERLAP = 512;

const countRegexAfterBoundary = (text: string, expression: RegExp, boundary: number): number => {
  expression.lastIndex = 0;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text))) {
    if (match.index + match[0].length > boundary) count += 1;
    if (match[0].length === 0) expression.lastIndex += 1;
  }
  return count;
};

const normalizeLimits = (overrides: PdfNativeInspectionLimits) => ({
  ...PDF_NATIVE_IMPORT_LIMITS,
  ...overrides,
});

const decodeWindow = (bytes: Uint8Array, start: number, end: number): string =>
  ASCII.decode(bytes.subarray(Math.max(0, start), Math.min(bytes.length, end)));

function assertPdfHeader(bytes: Uint8Array): string {
  const prefix = decodeWindow(bytes, 0, Math.min(bytes.length, 1024));
  const match = /%PDF-(1\.[0-7]|2\.0)/u.exec(prefix);
  if (!match) throw new Error('PDF import rejected: missing or unsupported %PDF header in the first 1024 bytes.');
  return match[1];
}

function assertEofMarker(bytes: Uint8Array): boolean {
  const tail = decodeWindow(bytes, Math.max(0, bytes.length - 1024 * 1024), bytes.length);
  if (!/%%EOF[\x00\x09\x0A\x0C\x0D\x20]*$/u.test(tail)) {
    throw new Error('PDF import rejected: final %%EOF marker is missing or trailing bytes exceed the accepted boundary.');
  }
  return true;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('PDF import rejected: SHA-256 provider unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', toOwnedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function inspectNativePdfBytes(
  bytes: Uint8Array,
  overrides: PdfNativeInspectionLimits = {},
): Promise<PdfNativeInspectionSnapshot> {
  const limits = normalizeLimits(overrides);
  assertSecurityBoundaryBytes('pdf', bytes);
  if (bytes.byteLength <= 0) throw new Error('PDF import rejected: empty file.');
  if (bytes.byteLength > limits.maxBytes) {
    throw new Error(`PDF import rejected: ${bytes.byteLength} bytes exceeds the ${limits.maxBytes}-byte import boundary.`);
  }

  const version = assertPdfHeader(bytes);
  const eofMarkerPresent = assertEofMarker(bytes);
  const started = performance.now();

  let objectHeaders = 0;
  let streamMarkers = 0;
  let xrefMarkers = 0;
  let estimatedPageObjects = 0;
  let maxDeclaredStreamLength = 0;
  let encrypted = false;
  let tagged = false;
  let hasOutlines = false;
  let hasPageLabels = false;
  let hasLinksOrDestinations = false;
  let hasEmbeddedFiles = false;
  let hasOptionalContentGroups = false;
  let hasAcroForm = false;
  let hasXfa = false;
  let hasAnnotations = false;
  let hasJavaScriptOrActions = false;
  let externalUrlCount = 0;
  const externalUrlHosts = new Set<string>();
  const actionTypes = new Set<string>();
  let hasSignatures = false;

  let previousTail = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    if (performance.now() - started > limits.maxScanMillis) {
      throw new Error(`PDF import rejected: bounded inspection exceeded ${limits.maxScanMillis} ms.`);
    }

    const current = decodeWindow(bytes, offset, Math.min(bytes.length, offset + CHUNK_BYTES));
    const text = previousTail + current;
    const boundary = previousTail.length;

    objectHeaders += countRegexAfterBoundary(text, /(?:^|[\x00-\x20])\d{1,10}\s+\d{1,5}\s+obj\b/gu, boundary);
    streamMarkers += countRegexAfterBoundary(text, /(?:^|[\r\n])stream(?:[\r\n]|$)/gu, boundary);
    xrefMarkers += countRegexAfterBoundary(text, /(?:^|[\r\n])xref(?:[\r\n]|$)/gu, boundary);
    estimatedPageObjects += countRegexAfterBoundary(text, /\/Type\s*\/Page\b/gu, boundary);

    for (const match of text.matchAll(/\/Length\s+(\d{1,12})\b/gu)) {
      if (match.index === undefined || match.index + match[0].length <= boundary) continue;
      const declared = Number(match[1]);
      if (Number.isSafeInteger(declared)) maxDeclaredStreamLength = Math.max(maxDeclaredStreamLength, declared);
    }

    encrypted ||= /\/Encrypt\b/u.test(text);
    tagged ||= /\/StructTreeRoot\b/u.test(text) || /\/Marked\s+true\b/u.test(text);
    hasOutlines ||= /\/Outlines\b/u.test(text);
    hasPageLabels ||= /\/PageLabels\b/u.test(text);
    hasLinksOrDestinations ||= /\/Subtype\s*\/Link\b|\/Dests\b|\/Dest\b/u.test(text);
    hasEmbeddedFiles ||= /\/EmbeddedFiles\b|\/Type\s*\/Filespec\b|\/EF\s*<</u.test(text);
    hasOptionalContentGroups ||= /\/OCProperties\b|\/Type\s*\/OCG\b/u.test(text);
    hasAcroForm ||= /\/AcroForm\b/u.test(text);
    hasXfa ||= /\/XFA\b/u.test(text);
    hasAnnotations ||= /\/Annots\b|\/Type\s*\/Annot\b/u.test(text);
    const actionNeedles: Array<[string, RegExp]> = [
      ['JavaScript', /\/JavaScript\b|\/JS\b/gu],
      ['OpenAction', /\/OpenAction\b/gu],
      ['AdditionalActions', /\/AA\b/gu],
      ['Launch', /\/Launch\b/gu],
      ['SubmitForm', /\/SubmitForm\b/gu],
      ['ImportData', /\/ImportData\b/gu],
      ['URI', /\/URI\b/gu],
    ];
    for (const [label, expression] of actionNeedles) {
      if (countRegexAfterBoundary(text, expression, boundary) > 0) actionTypes.add(label);
    }
    hasJavaScriptOrActions ||= actionTypes.size > 0;
    const urlExpression = /\b(?:https?:\/\/[^\s<>()\[\]{}"']+|mailto:[^\s<>()\[\]{}"']+)/giu;
    for (const match of text.matchAll(urlExpression)) {
      if (match.index === undefined || match.index + match[0].length <= boundary) continue;
      externalUrlCount += 1;
      if (externalUrlCount > limits.maxExternalReferences) throw new Error('PDF import rejected: external-reference budget exceeded.');
      if (externalUrlHosts.size >= limits.maxExternalHosts) continue;
      const raw = match[0].replace(/[.,;:!?]+$/u, '');
      try {
        if (/^mailto:/iu.test(raw)) {
          const domain = raw.slice(7).split('@')[1];
          if (domain) externalUrlHosts.add(domain.toLowerCase().slice(0, 255));
        } else {
          externalUrlHosts.add(new URL(raw).hostname.toLowerCase().slice(0, 255));
        }
      } catch {
        // Host reporting is best-effort; the bounded count is still retained.
      }
    }
    hasSignatures ||= /\/Type\s*\/Sig\b|\/ByteRange\s*\[/u.test(text);

    if (objectHeaders > limits.maxObjectHeaders) throw new Error('PDF import rejected: object-count budget exceeded.');
    if (streamMarkers > limits.maxStreamMarkers) throw new Error('PDF import rejected: stream-count budget exceeded.');
    if (xrefMarkers > limits.maxXrefMarkers) throw new Error('PDF import rejected: xref/revision budget exceeded.');
    if (maxDeclaredStreamLength > limits.maxDeclaredStreamLength) throw new Error('PDF import rejected: declared stream length exceeds the safe decode budget.');

    previousTail = current.slice(-CHUNK_OVERLAP);
  }

  const warnings: string[] = [];
  if (hasJavaScriptOrActions) warnings.push('Active PDF actions/JavaScript detected. Astraea does not grant them network or Workspace capabilities.');
  if (encrypted) warnings.push('Encrypted PDF detected. Password handling is delegated to the isolated native renderer until the dedicated decryption adapter is active.');
  if (hasXfa) warnings.push('XFA detected. XFA is inventory-only in native viewer mode and must not be silently rewritten.');
  if (xrefMarkers > 1) warnings.push(`Incremental/revision structure detected (${xrefMarkers} xref markers). Editing must preserve or explicitly rewrite revision semantics.`);

  return {
    parser: 'vgt-native-pdf-boundary-v1',
    version,
    byteLength: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    objectHeaders,
    streamMarkers,
    xrefMarkers,
    estimatedPageObjects,
    maxDeclaredStreamLength,
    eofMarkerPresent,
    encrypted,
    tagged,
    hasOutlines,
    hasPageLabels,
    hasLinksOrDestinations,
    hasEmbeddedFiles,
    hasOptionalContentGroups,
    hasAcroForm,
    hasXfa,
    hasAnnotations,
    hasJavaScriptOrActions,
    externalUrlCount,
    externalUrlHosts: [...externalUrlHosts].sort(),
    actionTypes: [...actionTypes].sort(),
    hasSignatures,
    warnings,
  };
}
