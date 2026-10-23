// STATUS: DIAMANT VGT SUPREME
// Shared security-gate invariants for hostile parser/file boundaries and product claims.

export type SecurityBoundaryKind = 'vwc' | 'ooxml' | 'pdf' | 'image' | 'foreign';
export type HighRiskCoreId =
  | 'vwc-storage'
  | 'foreign-import'
  | 'pdf-import'
  | 'keyvault-top-secret'
  | 'native-ipc'
  | 'updates'
  | 'netgate-plugin-automation'
  | 'sync-collaboration';

export interface HighRiskCoreThreatModel {
  id: HighRiskCoreId;
  assets: readonly string[];
  trustBoundary: string;
  attackerCapabilities: readonly string[];
  failClosedInvariant: string;
}

export const HIGH_RISK_CORE_THREAT_MODELS: readonly HighRiskCoreThreatModel[] = Object.freeze([
  {
    id: 'vwc-storage',
    assets: ['document plaintext', 'container keys', 'authenticated metadata'],
    trustBoundary: 'untrusted VWC bytes -> bounded structural parser -> authenticated container core',
    attackerCapabilities: ['arbitrary bytes', 'truncation', 'length/count corruption', 'wrong-key/tamper attempts'],
    failClosedInvariant: 'No document is accepted before structural bounds and authenticated decryption succeed.',
  },
  {
    id: 'foreign-import',
    assets: ['workspace process', 'user files', 'conversion fidelity'],
    trustBoundary: 'hostile OOXML/ODF/image/archive bytes -> isolated bounded sandbox -> inert model',
    attackerCapabilities: ['archive bombs', 'path traversal names', 'active content', 'parser bombs', 'polyglots'],
    failClosedInvariant: 'Foreign bytes remain inert until sandbox inspection succeeds within explicit budgets.',
  },
  {
    id: 'pdf-import',
    assets: ['workspace process', 'rendering surface', 'local filesystem/network capabilities'],
    trustBoundary: 'hostile PDF bytes -> bounded inspection/native renderer -> capability-free document model',
    attackerCapabilities: ['malformed xref/object graphs', 'oversized streams', 'JavaScript/actions', 'external references'],
    failClosedInvariant: 'Active PDF content receives no ambient Workspace, filesystem, or network capability.',
  },
  {
    id: 'keyvault-top-secret',
    assets: ['master keys', 'sealed secrets', 'offline factors', 'recipient key material'],
    trustBoundary: 'UI request -> native scoped command -> KeyVault/Top Secret provider',
    attackerCapabilities: ['malicious UI input', 'replay attempts', 'oversized payloads', 'invalid key material'],
    failClosedInvariant: 'Plaintext key material is bounded, short-lived, never logged, and never returned to plugin execution.',
  },
  {
    id: 'native-ipc',
    assets: ['native commands', 'filesystem operations', 'secret-bearing providers'],
    trustBoundary: 'local Astraea webview -> Tauri command boundary -> native core',
    attackerCapabilities: ['compromised renderer request', 'forged parameters', 'cross-window invocation'],
    failClosedInvariant: 'Sensitive native commands accept only trusted local Astraea windows and revalidate every input natively.',
  },
  {
    id: 'updates',
    assets: ['installed binaries', 'release trust root', 'rollback state'],
    trustBoundary: 'offline/update package -> signature/digest verification -> internal staged cache',
    attackerCapabilities: ['package replacement', 'manifest tampering', 'downgrade attempt', 'stale cache substitution'],
    failClosedInvariant: 'Unsigned, mismatched, or unauthorized rollback artifacts never reach install staging.',
  },
  {
    id: 'netgate-plugin-automation',
    assets: ['network access', 'filesystem access', 'secret handles', 'workspace mutations'],
    trustBoundary: 'plugin/flow intent -> policy/capability broker -> bounded host action',
    attackerCapabilities: ['capability confusion', 'SSRF targets', 'secret exfiltration attempts', 'hung workers'],
    failClosedInvariant: 'No ambient network/filesystem/key authority exists outside explicit capability handles.',
  },
  {
    id: 'sync-collaboration',
    assets: ['workspace changes', 'membership state', 'encrypted sync history'],
    trustBoundary: 'peer data -> authenticated sync graph -> canonical workspace operation log',
    attackerCapabilities: ['replay', 'malformed operations', 'stale membership', 'ordering/conflict abuse'],
    failClosedInvariant: 'Unauthenticated or policy-invalid peer operations cannot mutate authoritative workspace state.',
  },
]);

const OPAQUE_PUBLIC_MESSAGE = 'Request rejected by Workspace security policy.';
const MAX_LEAF_NAME_BYTES = 255;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const PATH_SEPARATOR = /[\\/]/u;
const UNSUPPORTED_SECURITY_CLAIM = /\b(?:unbreakable|unhackable|100%\s*secure|military[- ]grade|quantum[- ]proof|tamper[- ]proof|mathematically\s+impossible\s+to\s+break)\b/iu;

export class OpaqueSecurityError extends Error {
  readonly publicMessage = OPAQUE_PUBLIC_MESSAGE;

  constructor(readonly diagnosticCode: string) {
    super(OPAQUE_PUBLIC_MESSAGE);
    this.name = 'OpaqueSecurityError';
  }

  toJSON(): Readonly<{ error: string }> {
    return { error: this.publicMessage };
  }
}

export function opaqueSecurityMessage(): string {
  return OPAQUE_PUBLIC_MESSAGE;
}

export function assertSafeLeafName(fileName: string): string {
  const normalized = fileName.normalize('NFC').trim();
  const byteLength = new TextEncoder().encode(normalized).byteLength;
  if (!normalized || byteLength > MAX_LEAF_NAME_BYTES || CONTROL.test(normalized) || PATH_SEPARATOR.test(normalized)) {
    throw new OpaqueSecurityError('SEC_FILE_NAME_REJECTED');
  }
  if (normalized === '.' || normalized === '..' || normalized.includes('..\u2215') || normalized.includes('..\u2044')) {
    throw new OpaqueSecurityError('SEC_FILE_NAME_REJECTED');
  }
  return normalized;
}

function lowerExtension(fileName: string): string {
  const name = assertSafeLeafName(fileName).toLocaleLowerCase('en-US');
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.length <= bytes.byteLength && prefix.every((value, index) => bytes[index] === value);
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.byteLength, 1024);
  for (let offset = 0; offset + 8 <= limit; offset += 1) {
    if (bytes[offset] !== 0x25 || bytes[offset + 1] !== 0x50 || bytes[offset + 2] !== 0x44 || bytes[offset + 3] !== 0x46 || bytes[offset + 4] !== 0x2d) continue;
    const major = bytes[offset + 5];
    const dot = bytes[offset + 6];
    const minor = bytes[offset + 7];
    if ((major === 0x31 || major === 0x32) && dot === 0x2e && minor >= 0x30 && minor <= 0x39) return true;
  }
  return false;
}

export function assertZipSignature(bytes: Uint8Array): void {
  const valid = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
  if (!valid) throw new OpaqueSecurityError('SEC_ZIP_SIGNATURE_REJECTED');
}

export function assertSecurityBoundaryBytes(kind: SecurityBoundaryKind, bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new OpaqueSecurityError('SEC_EMPTY_INPUT_REJECTED');
  switch (kind) {
    case 'vwc':
      if (!startsWith(bytes, [0x56, 0x57, 0x43, 0x31])) throw new OpaqueSecurityError('SEC_VWC_MAGIC_REJECTED');
      return;
    case 'ooxml':
      assertZipSignature(bytes);
      return;
    case 'pdf':
      if (!hasPdfHeader(bytes)) throw new OpaqueSecurityError('SEC_PDF_HEADER_REJECTED');
      return;
    case 'image': {
      const png = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const jpeg = startsWith(bytes, [0xff, 0xd8, 0xff]);
      const gif = startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
      const webp = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.byteLength >= 12
        && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]);
      if (!png && !jpeg && !gif && !webp) throw new OpaqueSecurityError('SEC_IMAGE_MAGIC_REJECTED');
      return;
    }
    case 'foreign':
      return;
  }
}

export interface ForeignBoundaryPreflight {
  fileName: string;
  extension: string;
  boundary: SecurityBoundaryKind;
  normalizedMime: string;
}

const MIME_BY_EXTENSION: Readonly<Record<string, readonly string[]>> = Object.freeze({
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip'],
  odt: ['application/vnd.oasis.opendocument.text', 'application/zip'],
  ods: ['application/vnd.oasis.opendocument.spreadsheet', 'application/zip'],
  odp: ['application/vnd.oasis.opendocument.presentation', 'application/zip'],
  png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], gif: ['image/gif'], webp: ['image/webp'],
  csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  json: ['application/json', 'text/json', 'text/plain'],
});

function sniffForeignBoundary(bytes: Uint8Array): SecurityBoundaryKind {
  const zip = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]);
  if (zip) return 'ooxml';
  if (hasPdfHeader(bytes)) return 'pdf';
  const png = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = startsWith(bytes, [0xff, 0xd8, 0xff]);
  const gif = startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
  const webp = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.byteLength >= 12 && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]);
  return png || jpeg || gif || webp ? 'image' : 'foreign';
}

export function preflightForeignBoundary(fileName: string, declaredMime: string | undefined, bytes: Uint8Array): ForeignBoundaryPreflight {
  const safeName = assertSafeLeafName(fileName);
  const extension = lowerExtension(safeName);
  const normalizedMime = (declaredMime ?? '').trim().toLocaleLowerCase('en-US').split(';', 1)[0];
  // Extension and declared MIME are deliberately hints only. Never reject hostile or renamed
  // input based on their agreement; native magic/container validation owns classification.
  const _declaredMimeMatchesHint = !normalizedMime || !MIME_BY_EXTENSION[extension] || MIME_BY_EXTENSION[extension].includes(normalizedMime);
  void _declaredMimeMatchesHint;
  const boundary = sniffForeignBoundary(bytes);
  if (boundary !== 'foreign') assertSecurityBoundaryBytes(boundary, bytes);
  return { fileName: safeName, extension, boundary, normalizedMime };
}

export interface SecurityRoundtripTicket {
  schema: 'astraea-security-boundary/v1';
  boundary: SecurityBoundaryKind;
  fileName: string;
  byteLength: number;
  nonce: string;
}

export function encodeSecurityRoundtripTicket(ticket: SecurityRoundtripTicket): string {
  const fileName = assertSafeLeafName(ticket.fileName);
  if (!Number.isSafeInteger(ticket.byteLength) || ticket.byteLength < 0 || ticket.byteLength > 512 * 1024 * 1024) {
    throw new OpaqueSecurityError('SEC_TICKET_SIZE_REJECTED');
  }
  if (!/^[a-f0-9]{32}$/u.test(ticket.nonce)) throw new OpaqueSecurityError('SEC_TICKET_NONCE_REJECTED');
  return JSON.stringify({ schema: ticket.schema, boundary: ticket.boundary, fileName, byteLength: ticket.byteLength, nonce: ticket.nonce });
}

export function decodeSecurityRoundtripTicket(encoded: string): SecurityRoundtripTicket {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > 2048) throw new OpaqueSecurityError('SEC_TICKET_ENCODING_REJECTED');
  let value: unknown;
  try { value = JSON.parse(encoded); } catch { throw new OpaqueSecurityError('SEC_TICKET_ENCODING_REJECTED'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OpaqueSecurityError('SEC_TICKET_ENCODING_REJECTED');
  const record = value as Partial<SecurityRoundtripTicket>;
  if (record.schema !== 'astraea-security-boundary/v1'
    || typeof record.boundary !== 'string'
    || !['vwc', 'ooxml', 'pdf', 'image', 'foreign'].includes(record.boundary)
    || typeof record.fileName !== 'string'
    || typeof record.byteLength !== 'number'
    || typeof record.nonce !== 'string') {
    throw new OpaqueSecurityError('SEC_TICKET_SCHEMA_REJECTED');
  }
  const ticket: SecurityRoundtripTicket = {
    schema: record.schema,
    boundary: record.boundary as SecurityBoundaryKind,
    fileName: record.fileName,
    byteLength: record.byteLength,
    nonce: record.nonce,
  };
  encodeSecurityRoundtripTicket(ticket);
  return ticket;
}

export class FailureInjector {
  private readonly injectAt: string | null;
  private seen = 0;

  constructor(injectAt: string | null) {
    if (injectAt !== null && !/^[a-z0-9._-]{1,64}$/u.test(injectAt)) throw new OpaqueSecurityError('SEC_FAILURE_POINT_REJECTED');
    this.injectAt = injectAt;
  }

  checkpoint(label: string): void {
    if (!/^[a-z0-9._-]{1,64}$/u.test(label)) throw new OpaqueSecurityError('SEC_FAILURE_POINT_REJECTED');
    this.seen += 1;
    if (this.injectAt === label) throw new OpaqueSecurityError('SEC_INJECTED_FAILURE');
  }

  checkpointsSeen(): number {
    return this.seen;
  }
}

export function assertSupportedSecurityClaim(text: string): void {
  if (UNSUPPORTED_SECURITY_CLAIM.test(text)) throw new OpaqueSecurityError('SEC_UNSUPPORTED_MARKETING_CLAIM');
}
