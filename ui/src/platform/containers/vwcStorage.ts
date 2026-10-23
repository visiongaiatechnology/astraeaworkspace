import { assertSecurityBoundaryBytes } from '../security/securityGatesPlatform';
import { toOwnedArrayBuffer } from '../../shared/binary/ownedBufferSource';
import type { DocumentKind } from '../../shared/contracts/workspace';

export const VWC_MAGIC = 'VWC1';
export const VWC_MIN_FORMAT_VERSION = 1;
export const VWC_CURRENT_FORMAT_VERSION = 3;
export const VWC_CURRENT_CRYPTO_VERSION = 1;
export const VWC_MAX_CONTAINER_BYTES = 512 * 1024 * 1024;
export const VWC_MAX_METADATA_BYTES = 10 * 1024 * 1024;
export const VWC_MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const VWC_MAX_CHUNKS = 10_000;
export const VWC_MAX_ENCRYPTED_CHUNK_BYTES = 128 * 1024 * 1024;
export const VWC_STREAM_CHUNK_BYTES = 4 * 1024 * 1024;

const DOCUMENT_EXTENSIONS: Readonly<Partial<Record<DocumentKind, string>>> = {
  Writer: 'vdoc',
  Grid: 'vgrid',
  Present: 'vpresent',
  Notes: 'vnote',
  PdfStudio: 'vpdf',
  Draw: 'vdraw',
  Whiteboard: 'vboard',
  Publish: 'vpub',
  Insight: 'vinsight',
  Tasks: 'vtask',
  Vault: 'vvault',
  Connect: 'vconnect',
  Automate: 'vauto',
  AdminPolicy: 'vpolicy',
};

export const WORKSPACE_DOCUMENT_EXTENSIONS: readonly string[] = Object.freeze(Object.values(DOCUMENT_EXTENSIONS).filter((extension): extension is string => typeof extension === 'string'));

export type VwcParseErrorCode =
  | 'container-too-large'
  | 'truncated'
  | 'invalid-magic'
  | 'unsupported-format-version'
  | 'unsupported-crypto-version'
  | 'metadata-too-large'
  | 'metadata-invalid'
  | 'manifest-too-large'
  | 'manifest-invalid'
  | 'too-many-chunks'
  | 'chunk-too-large'
  | 'trailing-bytes';

export class VwcBoundedError extends Error {
  constructor(readonly code: VwcParseErrorCode) {
    super(`VWC parse rejected: ${code}`);
    this.name = 'VwcBoundedError';
  }
}

export interface VwcChunkDescriptor {
  index: number;
  type: number;
  flags: number;
  critical: boolean;
  knownType: 'DocumentTree' | 'Asset' | 'JournalDelta' | null;
  nonceOffset: number;
  payloadOffset: number;
  encryptedLength: number;
}

export interface VwcInspection {
  magic: typeof VWC_MAGIC;
  formatVersion: number;
  cryptoVersion: number;
  headerSchemaVersion: number;
  metadataLength: number;
  manifestLength: number;
  chunkCount: number;
  chunks: VwcChunkDescriptor[];
  metadata: Readonly<Record<string, unknown>>;
}

export interface VwcFuzzResult {
  ok: boolean;
  errorCode?: VwcParseErrorCode;
  formatVersion?: number;
  chunkCount?: number;
}

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.byteLength) throw new VwcBoundedError('truncated');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.byteLength) throw new VwcBoundedError('truncated');
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] * 0x1000000)
  ) >>> 0;
}

function knownChunkType(value: number): VwcChunkDescriptor['knownType'] {
  if (value === 0) return 'DocumentTree';
  if (value === 1) return 'Asset';
  if (value === 2) return 'JournalDelta';
  return null;
}

export function extensionForDocumentKind(kind: DocumentKind): string {
  const extension = DOCUMENT_EXTENSIONS[kind];
  if (!extension) throw new RangeError('Document kind is not supported by this edition.');
  return extension;
}

export function filenameMatchesDocumentKind(filename: string, kind: DocumentKind): boolean {
  const normalized = filename.trim().toLocaleLowerCase('en-US');
  const extension = DOCUMENT_EXTENSIONS[kind];
  return Boolean(extension && normalized.endsWith(`.${extension}`));
}

/**
 * Non-authoritative, allocation-bounded UI preflight only. Native `vgt-container` remains
 * the sole acceptance/decryption truth. This parser surfaces framing for diagnostics before IPC.
 */
export function inspectVwcContainer(bytes: Uint8Array): VwcInspection {
  if (bytes.byteLength > VWC_MAX_CONTAINER_BYTES) throw new VwcBoundedError('container-too-large');
  if (bytes.byteLength < 16) throw new VwcBoundedError('truncated');
  try {
    assertSecurityBoundaryBytes('vwc', bytes);
  } catch {
    throw new VwcBoundedError('invalid-magic');
  }

  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  if (magic !== VWC_MAGIC) throw new VwcBoundedError('invalid-magic');

  const formatVersion = readU16(bytes, 4);
  if (formatVersion < VWC_MIN_FORMAT_VERSION || formatVersion > VWC_CURRENT_FORMAT_VERSION) {
    throw new VwcBoundedError('unsupported-format-version');
  }
  const cryptoVersion = readU16(bytes, 6);
  if (cryptoVersion !== VWC_CURRENT_CRYPTO_VERSION) throw new VwcBoundedError('unsupported-crypto-version');

  const metadataLength = readU32(bytes, 8);
  if (metadataLength > VWC_MAX_METADATA_BYTES) throw new VwcBoundedError('metadata-too-large');
  const metadataStart = 12;
  const metadataEnd = metadataStart + metadataLength;
  if (!Number.isSafeInteger(metadataEnd) || metadataEnd + 4 > bytes.byteLength) throw new VwcBoundedError('truncated');

  let metadata: Record<string, unknown>;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(metadataStart, metadataEnd));
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid metadata root');
    metadata = parsed as Record<string, unknown>;
  } catch {
    throw new VwcBoundedError('metadata-invalid');
  }

  let offset = metadataEnd;
  let manifestLength = 0;
  if (formatVersion >= 3) {
    manifestLength = readU32(bytes, offset);
    if (manifestLength === 0 || manifestLength > VWC_MAX_MANIFEST_BYTES) throw new VwcBoundedError('manifest-too-large');
    offset += 4;
    const manifestEnd = offset + manifestLength;
    if (!Number.isSafeInteger(manifestEnd) || manifestEnd + 4 > bytes.byteLength) throw new VwcBoundedError('truncated');
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, manifestEnd));
      const parsed = JSON.parse(decoded) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid manifest root');
    } catch {
      throw new VwcBoundedError('manifest-invalid');
    }
    offset = manifestEnd;
  }

  const chunkCount = readU32(bytes, offset);
  if (chunkCount === 0 || chunkCount > VWC_MAX_CHUNKS) throw new VwcBoundedError('too-many-chunks');
  offset += 4;

  const chunks: VwcChunkDescriptor[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const headerBytes = formatVersion >= 3 ? 18 : 17;
    if (offset + headerBytes > bytes.byteLength) throw new VwcBoundedError('truncated');
    const type = bytes[offset];
    const flags = formatVersion >= 3 ? bytes[offset + 1] : 0;
    const nonceOffset = offset + (formatVersion >= 3 ? 2 : 1);
    const encryptedLength = readU32(bytes, nonceOffset + 12);
    if (encryptedLength > VWC_MAX_ENCRYPTED_CHUNK_BYTES) throw new VwcBoundedError('chunk-too-large');
    const payloadOffset = nonceOffset + 16;
    const payloadEnd = payloadOffset + encryptedLength;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > bytes.byteLength) throw new VwcBoundedError('truncated');
    chunks.push({ index, type, flags, critical: (flags & 1) !== 0, knownType: knownChunkType(type), nonceOffset, payloadOffset, encryptedLength });
    offset = payloadEnd;
  }
  if (offset !== bytes.byteLength) throw new VwcBoundedError('trailing-bytes');

  const rawHeaderVersion = metadata.header_schema_version;
  const headerSchemaVersion = typeof rawHeaderVersion === 'number' && Number.isInteger(rawHeaderVersion)
    ? rawHeaderVersion
    : 1;
  return {
    magic: VWC_MAGIC,
    formatVersion,
    cryptoVersion,
    headerSchemaVersion,
    metadataLength,
    manifestLength,
    chunkCount,
    chunks,
    metadata,
  };
}

/** A no-panic/no-unbounded-message entry point suitable for fuzz harnesses. */
export function fuzzParseVwc(bytes: Uint8Array): VwcFuzzResult {
  try {
    const result = inspectVwcContainer(bytes);
    return { ok: true, formatVersion: result.formatVersion, chunkCount: result.chunkCount };
  } catch (error) {
    if (error instanceof VwcBoundedError) return { ok: false, errorCode: error.code };
    return { ok: false, errorCode: 'metadata-invalid' };
  }
}

export function splitForStreaming(bytes: Uint8Array, chunkBytes = VWC_STREAM_CHUNK_BYTES): Uint8Array[] {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0 || chunkBytes > VWC_MAX_ENCRYPTED_CHUNK_BYTES) {
    throw new RangeError('Invalid VWC streaming chunk size');
  }
  const count = Math.ceil(bytes.byteLength / chunkBytes);
  if (count > VWC_MAX_CHUNKS) throw new VwcBoundedError('too-many-chunks');
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    chunks.push(bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.byteLength)));
  }
  return chunks;
}

export type VwcCompressionDecision = 'skip-sensitive' | 'skip-small' | 'gzip-before-encryption';

/**
 * Compression is an explicit pre-encryption policy. Secret-rich document trees are
 * never compressed by this helper. Large non-sensitive assets may be gzip-compressed
 * before AEAD, avoiding post-encryption compression that is both useless and misleading.
 */
export function compressionDecision(inputBytes: number, containsSecrets: boolean): VwcCompressionDecision {
  if (containsSecrets) return 'skip-sensitive';
  if (inputBytes < 64 * 1024) return 'skip-small';
  return 'gzip-before-encryption';
}

export async function compressSafeAssetBeforeEncryption(
  bytes: Uint8Array,
  containsSecrets: boolean,
): Promise<{ algorithm: 'none' | 'gzip'; bytes: Uint8Array }> {
  const decision = compressionDecision(bytes.byteLength, containsSecrets);
  if (decision !== 'gzip-before-encryption' || typeof CompressionStream === 'undefined') {
    return { algorithm: 'none', bytes };
  }
  const stream = new Blob([toOwnedArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  if (compressed.byteLength >= bytes.byteLength) return { algorithm: 'none', bytes };
  return { algorithm: 'gzip', bytes: compressed };
}
