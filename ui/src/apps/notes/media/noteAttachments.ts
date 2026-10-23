import type { NoteAttachment } from '../../../shared/contracts/workspace';

import { probeMediaBoundary } from '../../../platform/media/index';
import { deliverExportDataUrl } from '../../../shared/interchange/exportDelivery';
export const NOTE_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const NOTE_ATTACHMENT_TOTAL_MAX_BYTES = 32 * 1024 * 1024;
export const NOTE_IMAGE_MAX_PIXELS = 24_000_000;
export const NOTE_IMAGE_MAX_EDGE = 8_192;
export const NOTE_SAFE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const NOTE_SAFE_TEXT_PREVIEW_MIME_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'] as const;
export const NOTE_SAFE_PDF_MIME_TYPE = 'application/pdf';
const NOTE_BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  'html','htm','xhtml','svg','js','mjs','cjs','exe','dll','msi','com','scr','bat','cmd','ps1','psm1','vbs','vbe','wsf','wsh','hta',
  'jar','apk','appimage','sh','command','desktop','lnk','url','reg','chm','pif','cpl','sys','drv','scf','gadget','application','appref-ms',
]);
const NOTE_BLOCKED_ATTACHMENT_MIME_TYPES = new Set([
  'text/html','application/xhtml+xml','image/svg+xml','application/javascript','text/javascript','application/x-javascript',
  'application/x-msdownload','application/x-msdos-program','application/x-sh','application/x-shellscript','application/java-archive',
]);
const NOTE_BIDI_FILENAME_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function normalizeAttachmentMime(value: string): string {
  return (value || 'application/octet-stream').toLowerCase().split(';', 1)[0].trim() || 'application/octet-stream';
}

export function sanitizeNoteAttachmentName(value: string): string {
  const clean = (value || 'attachment')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(NOTE_BIDI_FILENAME_CONTROLS, '')
    .replace(/[\\/]+/g, '_')
    .trim();
  return (clean || 'attachment').slice(0, 255);
}

export function validateNoteAttachmentSize(existing: NoteAttachment[], nextSizeBytes: number): void {
  if (!Number.isFinite(nextSizeBytes) || nextSizeBytes <= 0) throw new Error('Attachment is empty or has an invalid size.');
  if (nextSizeBytes > NOTE_ATTACHMENT_MAX_BYTES) throw new Error('Attachment exceeds the 8 MiB per-file limit.');
  const total = existing.reduce((sum, item) => sum + item.sizeBytes, 0) + nextSizeBytes;
  if (total > NOTE_ATTACHMENT_TOTAL_MAX_BYTES) throw new Error('Attachments exceed the 32 MiB per-note limit.');
}

export function isSafeNoteImageMime(mimeType: string): boolean {
  return NOTE_SAFE_IMAGE_MIME_TYPES.includes(mimeType.toLowerCase() as typeof NOTE_SAFE_IMAGE_MIME_TYPES[number]);
}

export function isSafeNoteAttachmentFile(file: Pick<File, 'name' | 'type' | 'size'>): boolean {
  const mime = normalizeAttachmentMime(file.type);
  const safeName = sanitizeNoteAttachmentName(file.name);
  const extension = safeName.includes('.') ? safeName.split('.').pop()!.toLowerCase() : '';
  if (NOTE_BLOCKED_ATTACHMENT_EXTENSIONS.has(extension) || NOTE_BLOCKED_ATTACHMENT_MIME_TYPES.has(mime)) return false;
  if (file.size <= 0 || file.size > NOTE_ATTACHMENT_MAX_BYTES) return false;
  return true;
}

export function canPreviewNoteAttachment(attachment: NoteAttachment): 'image' | 'text' | 'pdf' | null {
  const mime = normalizeAttachmentMime(attachment.mimeType);
  if (isSafeNoteImageMime(mime)) return 'image';
  if (NOTE_SAFE_TEXT_PREVIEW_MIME_TYPES.includes(mime as typeof NOTE_SAFE_TEXT_PREVIEW_MIME_TYPES[number])) return 'text';
  if (mime === NOTE_SAFE_PDF_MIME_TYPE) return 'pdf';
  return null;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error('WebCrypto SHA-256 support is required for attachment integrity metadata.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyAndReadNoteAttachment(attachment: NoteAttachment): Promise<{ bytes: Uint8Array; mimeType: string; sha256: string }> {
  if (!attachment || typeof attachment !== 'object') throw new Error('Attachment record is invalid.');
  if (!Number.isSafeInteger(attachment.sizeBytes) || attachment.sizeBytes <= 0 || attachment.sizeBytes > NOTE_ATTACHMENT_MAX_BYTES) {
    throw new Error('Attachment size is outside the allowed per-file boundary.');
  }
  if (typeof attachment.name !== 'string' || typeof attachment.mimeType !== 'string' || typeof attachment.dataUrl !== 'string') {
    throw new Error('Attachment metadata is invalid.');
  }
  if (typeof attachment.sha256 !== 'string' || !/^[0-9a-f]{64}$/iu.test(attachment.sha256)) {
    throw new Error('Attachment integrity metadata is missing or invalid.');
  }

  const mimeType = normalizeAttachmentMime(attachment.mimeType);
  const prefix = `data:${mimeType};base64,`;
  const expectedPayloadLength = Math.ceil(attachment.sizeBytes / 3) * 4;
  if (attachment.dataUrl.length !== prefix.length + expectedPayloadLength || !attachment.dataUrl.startsWith(prefix)) {
    throw new Error('Attachment payload length does not match its declared size.');
  }
  const payload = attachment.dataUrl.slice(prefix.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload)) {
    throw new Error('Attachment payload is not canonical base64.');
  }

  let binary: string;
  try { binary = atob(payload); } catch { throw new Error('Attachment payload could not be decoded.'); }
  if (binary.length !== attachment.sizeBytes) throw new Error('Attachment decoded size does not match its declaration.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  assertSafeNoteAttachmentBinary(bytes, mimeType, attachment.name);
  if (isSafeNoteImageMime(mimeType)) {
    assertNoteImageDimensionsWithinLimits(readNoteImageDimensions(bytes.subarray(0, Math.min(bytes.length, 512 * 1024)), mimeType));
  }

  const sha256 = await sha256Hex(bytes.buffer);
  if (sha256 !== attachment.sha256.toLowerCase()) throw new Error('Attachment integrity verification failed.');
  return { bytes, mimeType, sha256 };
}

export async function verifyNoteAttachmentIntegrity(attachment: NoteAttachment): Promise<boolean> {
  try {
    await verifyAndReadNoteAttachment(attachment);
    return true;
  } catch {
    return false;
  }
}


function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function containsPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024);
  for (let index = 0; index <= limit - 5; index += 1) {
    if (bytes[index] === 0x25 && bytes[index + 1] === 0x50 && bytes[index + 2] === 0x44 && bytes[index + 3] === 0x46 && bytes[index + 4] === 0x2d) return true;
  }
  return false;
}

/**
 * Fail-closed checks for executable/active payloads before persistence. Unknown passive
 * binary formats remain attachable, but are stored as opaque blobs and never rendered.
 */
export function assertSafeNoteAttachmentBinary(bytes: Uint8Array, mimeType: string, fileName: string): void {
  if (bytes.length === 0 || bytes.length > NOTE_ATTACHMENT_MAX_BYTES) throw new Error('Attachment binary size is outside the allowed bounds.');
  const mime = normalizeAttachmentMime(mimeType);
  const name = sanitizeNoteAttachmentName(fileName);
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (NOTE_BLOCKED_ATTACHMENT_EXTENSIONS.has(extension) || NOTE_BLOCKED_ATTACHMENT_MIME_TYPES.has(mime)) {
    throw new Error('Attachment type is active or executable and is blocked by Notes policy.');
  }

  const blockedMagic =
    startsWithBytes(bytes, [0x4d, 0x5a]) || // PE / DOS executable
    startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    startsWithBytes(bytes, [0xfe, 0xed, 0xfa, 0xce]) || startsWithBytes(bytes, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWithBytes(bytes, [0xfe, 0xed, 0xfa, 0xcf]) || startsWithBytes(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O
    startsWithBytes(bytes, [0xca, 0xfe, 0xba, 0xbe]) || // Java class / universal binary
    startsWithBytes(bytes, [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00]) || // Windows shortcut
    startsWithBytes(bytes, [0x23, 0x21]); // executable script shebang
  if (blockedMagic) throw new Error('Executable attachment signature rejected.');

  const probe = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 4096))).replace(/^\ufeff/, '').trimStart().toLowerCase();
  if (probe.startsWith('<!doctype html') || probe.startsWith('<html') || probe.startsWith('<script') || probe.startsWith('<svg')) {
    throw new Error('Active HTML/SVG attachment payload rejected.');
  }

  if (mime === NOTE_SAFE_PDF_MIME_TYPE && !containsPdfHeader(bytes)) throw new Error('PDF MIME type does not match the binary header.');
  if (isSafeNoteImageMime(mime) && !verifyNoteImageSignature(bytes, mime)) throw new Error('Image MIME type does not match its binary signature.');
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    for (let index = 0; index < chunk.length; index += 1) binary += String.fromCharCode(chunk[index]);
  }
  return `data:${normalizeAttachmentMime(mimeType)};base64,${btoa(binary)}`;
}

export function verifyNoteImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  try { const probe = probeMediaBoundary(bytes, mimeType); return ['image/png','image/jpeg','image/webp'].includes(probe.mimeType); }
  catch { return false; }
}


export interface NoteImageDimensions { width: number; height: number }

function readU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}
function readU24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
function readU32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

/** Reads raster dimensions from the bounded binary envelope before browser decode. */
export function readNoteImageDimensions(bytes: Uint8Array, mimeType: string): NoteImageDimensions | null {
  if (!verifyNoteImageSignature(bytes, mimeType)) return null;
  if (mimeType === 'image/png') {
    if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
    const width = readU32BE(bytes, 16); const height = readU32BE(bytes, 20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (mimeType === 'image/jpeg') {
    let cursor = 2;
    while (cursor + 8 < bytes.length) {
      if (bytes[cursor] !== 0xff) { cursor += 1; continue; }
      while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
      if (cursor >= bytes.length) break;
      const marker = bytes[cursor++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (cursor + 1 >= bytes.length) break;
      const length = readU16BE(bytes, cursor);
      if (length < 2 || cursor + length > bytes.length) break;
      const isSof = [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker);
      if (isSof && length >= 7) {
        const height = readU16BE(bytes, cursor + 3); const width = readU16BE(bytes, cursor + 5);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      cursor += length;
    }
    return null;
  }
  if (mimeType === 'image/webp') {
    if (bytes.length < 30) return null;
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') return { width: 1 + readU24LE(bytes, 24), height: 1 + readU24LE(bytes, 27) };
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: readU16BE(Uint8Array.of(bytes[27], bytes[26]), 0) & 0x3fff, height: readU16BE(Uint8Array.of(bytes[29], bytes[28]), 0) & 0x3fff };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b0 = bytes[21]; const b1 = bytes[22]; const b2 = bytes[23]; const b3 = bytes[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
  }
  return null;
}

export function assertNoteImageDimensionsWithinLimits(dimensions: NoteImageDimensions | null): NoteImageDimensions {
  if (!dimensions) throw new Error('Image dimensions could not be read safely from the binary header.');
  const { width, height } = dimensions;
  if (width <= 0 || height <= 0 || width > NOTE_IMAGE_MAX_EDGE || height > NOTE_IMAGE_MAX_EDGE || width * height > NOTE_IMAGE_MAX_PIXELS) {
    throw new Error('Image exceeds the 8192px / 24MP decoded resource limit.');
  }
  return dimensions;
}
export async function validateNoteImageFile(file: File): Promise<void> {
  if (!isSafeNoteImageMime(file.type)) throw new Error('Notes images support only PNG, JPEG and WebP. SVG and other active/unsupported image formats are rejected.');
  if (file.size <= 0 || file.size > NOTE_ATTACHMENT_MAX_BYTES) throw new Error('Image exceeds the 8 MiB safety limit or is empty.');
  // JPEG SOF can occur after metadata; the 512 KiB bounded prefix is large enough for normal files and fails closed otherwise.
  const prefix = new Uint8Array((await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer()));
  if (!verifyNoteImageSignature(prefix, file.type)) throw new Error('Image MIME type does not match its binary signature.');
  assertNoteImageDimensionsWithinLimits(readNoteImageDimensions(prefix, file.type));
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return bytesToDataUrl(bytes, normalizeAttachmentMime(file.type));
}

export async function validateNoteImageDataUrlDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(dataUrl)) throw new Error('Image data URL is not an allowed local raster format.');
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Image decoder rejected the image.'));
    image.src = dataUrl;
  });
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0 || width > NOTE_IMAGE_MAX_EDGE || height > NOTE_IMAGE_MAX_EDGE || width * height > NOTE_IMAGE_MAX_PIXELS) throw new Error('Image exceeds the 8192px / 24MP decoded resource limit.');
  return { width, height };
}

export async function readValidatedNoteImageFile(file: File): Promise<string> {
  await validateNoteImageFile(file);
  const dataUrl = await fileToDataUrl(file);
  await validateNoteImageDataUrlDimensions(dataUrl);
  return dataUrl;
}

export async function fileToNoteAttachment(file: File, existing: NoteAttachment[] = []): Promise<NoteAttachment> {
  validateNoteAttachmentSize(existing, file.size);
  if (!isSafeNoteAttachmentFile(file)) throw new Error('Attachment type is active/executable, empty, or exceeds the bounded Notes attachment policy.');
  const mimeType = normalizeAttachmentMime(file.type);
  const name = sanitizeNoteAttachmentName(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertSafeNoteAttachmentBinary(bytes, mimeType, name);
  if (isSafeNoteImageMime(mimeType)) {
    assertNoteImageDimensionsWithinLimits(readNoteImageDimensions(bytes.subarray(0, Math.min(bytes.length, 512 * 1024)), mimeType));
  }
  const dataUrl = bytesToDataUrl(bytes, mimeType);
  if (isSafeNoteImageMime(mimeType)) await validateNoteImageDataUrlDimensions(dataUrl);
  const sha256 = await sha256Hex(bytes.buffer);
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error('Cryptographic random UUID support is required for attachments.');
  return {
    id: `note-attachment-${crypto.randomUUID()}`,
    name,
    mimeType,
    sizeBytes: bytes.length,
    dataUrl,
    createdAt: Date.now(),
    sha256,
  };
}

export async function downloadNoteAttachment(attachment: NoteAttachment): Promise<void> {
  if (!(await verifyNoteAttachmentIntegrity(attachment))) throw new Error('Attachment integrity verification failed. Save As was blocked.');
  const safeName = sanitizeNoteAttachmentName(attachment.name).replace(/[\\:*?"<>|]+/g, '_') || 'attachment';
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(safeName) ? safeName.split('.').pop()!.toLowerCase() : 'bin';
  // Release Beta 0.1: native save on the desktop; the browser fallback stays a download.
  await deliverExportDataUrl(attachment.dataUrl, { suggestedName: safeName, extensions: [extension] });
}
