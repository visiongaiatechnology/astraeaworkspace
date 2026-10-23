// STATUS: DIAMANT VGT SUPREME — bounded hostile-archive parser
// Minimal, bounded ZIP reader/writer for OOXML interoperability.
// Reader supports STORED (0) and DEFLATE (8). Writer emits STORED entries for deterministic output.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export interface ZipReadLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxElapsedMs: number;
}

export const ZIP_SECURITY_HARD_CAPS: Readonly<ZipReadLimits> = Object.freeze({
  maxEntries: 10_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxElapsedMs: 30_000,
});

const DEFAULT_LIMITS: ZipReadLimits = {
  maxEntries: 4096,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxElapsedMs: 5_000,
};

function resolveZipReadLimits(overrides: Partial<ZipReadLimits>): ZipReadLimits {
  const resolved = { ...DEFAULT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`ZIP ${name} must be a positive finite value`);
  }
  if (!Number.isInteger(resolved.maxEntries)) throw new Error('ZIP maxEntries must be an integer');
  if (resolved.maxEntries > ZIP_SECURITY_HARD_CAPS.maxEntries
    || resolved.maxEntryBytes > ZIP_SECURITY_HARD_CAPS.maxEntryBytes
    || resolved.maxTotalUncompressedBytes > ZIP_SECURITY_HARD_CAPS.maxTotalUncompressedBytes
    || resolved.maxCompressionRatio > ZIP_SECURITY_HARD_CAPS.maxCompressionRatio
    || resolved.maxElapsedMs > ZIP_SECURITY_HARD_CAPS.maxElapsedMs) {
    throw new Error('ZIP read policy exceeds immutable security hard caps');
  }
  return resolved;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const UTF8_FLAG = 1 << 11;
const ENCRYPTED_FLAG = 1 << 0;
const DATA_DESCRIPTOR_FLAG = 1 << 3;

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

/**
 * Returns the single canonical archive name accepted by the in-memory importer.
 * ZIP uses '/' as its path separator; backslashes and filesystem-ambiguous names
 * are rejected rather than normalized into a second interpretation.
 */
export function normalizeZipEntryName(name: string): string {
  if (!name || name.length > 4096 || name.includes('\0')) throw new Error('ZIP entry name is invalid');
  if (name.includes('\\')) throw new Error('ZIP entry path uses a non-canonical separator');
  if (name.startsWith('/') || name.startsWith('//') || /^[A-Za-z]:/u.test(name)) throw new Error('ZIP entry path must be relative');

  const directoryEntry = name.endsWith('/');
  const body = directoryEntry ? name.slice(0, -1) : name;
  if (!body) throw new Error('ZIP root directory entry is not accepted');
  const segments = body.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('ZIP entry path traversal or ambiguity rejected');
  for (const segment of segments) {
    if (segment.endsWith('.') || segment.endsWith(' ') || segment.includes(':')) throw new Error('ZIP entry path is unsafe on Windows filesystems');
    if (WINDOWS_RESERVED_BASENAME.test(segment)) throw new Error('ZIP entry uses a reserved Windows device name');
  }
  return `${segments.join('/')}${directoryEntry ? '/' : ''}`;
}

function assertSafeEntryName(name: string): void {
  if (normalizeZipEntryName(name) !== name) throw new Error('ZIP entry path is not canonical');
}

function zipNowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function assertZipDeadline(deadlineMs: number): void {
  if (zipNowMs() > deadlineMs) throw new Error('ZIP processing exceeded time limit');
}

function decodeArchiveName(decoder: TextDecoder, bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new Error('ZIP entry name is not valid UTF-8');
  }
}

async function inflateRaw(compressed: Uint8Array, expectedSize: number, deadlineMs: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DEFLATE decompression is unavailable in this runtime');
  }
  assertZipDeadline(deadlineMs);
  const stream = new Blob([compressed as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let produced = 0;
  try {
    while (true) {
      assertZipDeadline(deadlineMs);
      const remainingMs = Math.max(1, Math.ceil(deadlineMs - zipNowMs()));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const next = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('ZIP decompression exceeded time limit')), remainingMs);
          }),
        ]);
        if (next.done) break;
        const chunk = next.value;
        produced += chunk.byteLength;
        if (produced > expectedSize || produced > ZIP_SECURITY_HARD_CAPS.maxEntryBytes) {
          throw new Error('ZIP decompression exceeded declared or hard output boundary');
        }
        chunks.push(chunk.slice());
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (produced !== expectedSize) throw new Error('ZIP entry uncompressed size mismatch');
  return concatBytes(chunks);
}

function findEocd(bytes: Uint8Array): number {
  if (bytes.byteLength < 22) throw new Error('ZIP archive is truncated');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let offset = bytes.byteLength - 22; offset >= min; offset--) {
    if (u32(view, offset) === SIG_EOCD) return offset;
  }
  throw new Error('ZIP end-of-central-directory record not found');
}

export async function readZip(
  bytes: Uint8Array,
  limits: Partial<ZipReadLimits> = {},
): Promise<Map<string, Uint8Array>> {
  const resolved = resolveZipReadLimits(limits);
  if (bytes.byteLength > ZIP_SECURITY_HARD_CAPS.maxTotalUncompressedBytes) throw new Error('ZIP archive exceeds input hard cap');
  const deadlineMs = zipNowMs() + resolved.maxElapsedMs;
  const eocdOffset = findEocd(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const diskNumber = u16(view, eocdOffset + 4);
  const centralDisk = u16(view, eocdOffset + 6);
  const diskEntryCount = u16(view, eocdOffset + 8);
  const totalEntryCount = u16(view, eocdOffset + 10);
  const centralSize = u32(view, eocdOffset + 12);
  const centralOffset = u32(view, eocdOffset + 16);

  if (diskNumber !== 0 || centralDisk !== 0 || diskEntryCount !== totalEntryCount) {
    throw new Error('Multi-disk ZIP archives are not supported');
  }
  if (totalEntryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported by the beta OOXML importer');
  }
  if (totalEntryCount > resolved.maxEntries) {
    throw new Error('ZIP archive exceeds entry-count limit');
  }
  if (centralOffset + centralSize > bytes.byteLength) {
    throw new Error('ZIP central directory is out of bounds');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < totalEntryCount; index++) {
    assertZipDeadline(deadlineMs);
    if (cursor + 46 > bytes.byteLength || u32(view, cursor) !== SIG_CENTRAL) {
      throw new Error('ZIP central directory entry is invalid');
    }
    const flags = u16(view, cursor + 8);
    const method = u16(view, cursor + 10);
    const expectedCrc = u32(view, cursor + 16);
    const compressedSize = u32(view, cursor + 20);
    const uncompressedSize = u32(view, cursor + 24);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const localOffset = u32(view, cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw new Error('ZIP central directory entry exceeds archive bounds');
    if ((flags & ENCRYPTED_FLAG) !== 0) throw new Error('Encrypted ZIP entries are not supported');
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method: ${method}`);
    if (uncompressedSize > resolved.maxEntryBytes) throw new Error('ZIP entry exceeds per-entry size limit');
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > resolved.maxTotalUncompressedBytes) throw new Error('ZIP archive exceeds total size limit');
    if (compressedSize === 0 && uncompressedSize > 0) throw new Error('ZIP entry has invalid compressed size');
    if (compressedSize > 0 && uncompressedSize / compressedSize > resolved.maxCompressionRatio) {
      throw new Error('ZIP entry exceeds compression-ratio limit');
    }

    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const decodedName = decodeArchiveName(decoder, nameBytes);
    const name = normalizeZipEntryName(decodedName);
    if (name !== decodedName) throw new Error('ZIP entry path is not canonical');
    if (entries.has(name)) throw new Error('ZIP archive contains duplicate entry names');

    if (localOffset + 30 > bytes.byteLength || u32(view, localOffset) !== SIG_LOCAL) {
      throw new Error('ZIP local header is invalid');
    }
    const localFlags = u16(view, localOffset + 6);
    const localMethod = u16(view, localOffset + 8);
    const localCrc = u32(view, localOffset + 14);
    const localCompressedSize = u32(view, localOffset + 18);
    const localUncompressedSize = u32(view, localOffset + 22);
    const localNameLength = u16(view, localOffset + 26);
    const localExtraLength = u16(view, localOffset + 28);
    const localNameEnd = localOffset + 30 + localNameLength;
    if (localNameEnd > bytes.byteLength) throw new Error('ZIP local entry name exceeds archive bounds');
    const localDecodedName = decodeArchiveName(decoder, bytes.subarray(localOffset + 30, localNameEnd));
    const localName = normalizeZipEntryName(localDecodedName);
    if (localName !== localDecodedName || localName !== name || localFlags !== flags || localMethod !== method) throw new Error('ZIP central/local header mismatch');
    const usesDataDescriptor = (flags & DATA_DESCRIPTOR_FLAG) !== 0;
    const localMetadataMatches = localCrc === expectedCrc && localCompressedSize === compressedSize && localUncompressedSize === uncompressedSize;
    const localMetadataDeferred = usesDataDescriptor && localCrc === 0 && localCompressedSize === 0 && localUncompressedSize === 0;
    if (!localMetadataMatches && !localMetadataDeferred) throw new Error('ZIP central/local size or checksum mismatch');
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > bytes.byteLength) throw new Error('ZIP entry data exceeds archive bounds');
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);

    const data = method === 0 ? compressed.slice() : await inflateRaw(compressed, uncompressedSize, deadlineMs);
    if (data.byteLength !== uncompressedSize) throw new Error('ZIP entry size mismatch');
    if (crc32(data) !== expectedCrc) throw new Error('ZIP entry checksum mismatch');
    entries.set(name, data);
    cursor = end;
  }

  return entries;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function writeStoredZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) throw new Error('ZIP entry count exceeds classic ZIP limit');
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    assertSafeEntryName(entry.name);
    const nameBytes = encoder.encode(entry.name);
    if (nameBytes.byteLength > 0xffff) throw new Error('ZIP entry name is too long');
    if (entry.data.byteLength > 0xffffffff) throw new Error('ZIP entry exceeds classic ZIP size limit');
    const checksum = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(local.buffer);
    writeU32(localView, 0, SIG_LOCAL);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, UTF8_FLAG);
    writeU16(localView, 8, 0);
    writeU16(localView, 10, 0);
    writeU16(localView, 12, 0);
    writeU32(localView, 14, checksum);
    writeU32(localView, 18, entry.data.byteLength);
    writeU32(localView, 22, entry.data.byteLength);
    writeU16(localView, 26, nameBytes.byteLength);
    writeU16(localView, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(central.buffer);
    writeU32(centralView, 0, SIG_CENTRAL);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, UTF8_FLAG);
    writeU16(centralView, 10, 0);
    writeU16(centralView, 12, 0);
    writeU16(centralView, 14, 0);
    writeU32(centralView, 16, checksum);
    writeU32(centralView, 20, entry.data.byteLength);
    writeU32(centralView, 24, entry.data.byteLength);
    writeU16(centralView, 28, nameBytes.byteLength);
    writeU16(centralView, 30, 0);
    writeU16(centralView, 32, 0);
    writeU16(centralView, 34, 0);
    writeU16(centralView, 36, 0);
    writeU32(centralView, 38, 0);
    writeU32(centralView, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    localOffset += local.byteLength + entry.data.byteLength;
  }

  const centralDirectory = concatBytes(centralParts);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeU32(eocdView, 0, SIG_EOCD);
  writeU16(eocdView, 4, 0);
  writeU16(eocdView, 6, 0);
  writeU16(eocdView, 8, entries.length);
  writeU16(eocdView, 10, entries.length);
  writeU32(eocdView, 12, centralDirectory.byteLength);
  writeU32(eocdView, 16, localOffset);
  writeU16(eocdView, 20, 0);

  return concatBytes([...localParts, centralDirectory, eocd]);
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('ZIP entry contains invalid UTF-8 text.');
  }
}
