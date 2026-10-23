// STATUS: DIAMANT VGT SUPREME — Safe Writer Audio/Video Media Domain
import type {
  WriterMediaObjectData,
  WriterMediaObjectKind,
} from '../../../../shared/contracts/workspace';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 200_000;
const MAX_VIDEO_BYTES = 75 * 1024 * 1024;
const MAX_LINK_CHARS = 2048;
const MAX_NAME_CHARS = 240;
const MAX_CAPTION_CHARS = 1024;
const MAX_MEDIA_OBJECTS = 128;
const MAX_ID_CHARS = 128;
const DATA_URL_PREFIX_BYTES = 96;

const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/ogg']);

export class WriterMediaObjectError extends Error {}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function boundedText(value: unknown, maxChars: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxChars) || fallback;
}

function byteLimitFor(kind: WriterMediaObjectKind): number {
  return kind === 'audio' ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
}

function mimeAllowedFor(kind: WriterMediaObjectKind, mimeType: string): boolean {
  return (kind === 'audio' ? AUDIO_MIMES : VIDEO_MIMES).has(mimeType.toLowerCase());
}

export function detectWriterMediaSignature(bytes: Uint8Array): 'mp3' | 'wav' | 'ogg' | 'webm' | 'mp4' | null {
  if (bytes.length < 4) return null;
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)) return 'mp3';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav';
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg';
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (brand === 'avif' || brand === 'avis' || brand.startsWith('hei')) return null;
    return 'mp4';
  }
  return null;
}

function allowedSignature(kind: WriterMediaObjectKind, mimeType: string, signature: ReturnType<typeof detectWriterMediaSignature>): boolean {
  const mime = mimeType.toLowerCase();
  if (kind === 'audio') {
    if (mime === 'audio/mpeg') return signature === 'mp3';
    if (mime === 'audio/wav' || mime === 'audio/x-wav') return signature === 'wav';
    if (mime === 'audio/ogg') return signature === 'ogg';
    if (mime === 'audio/webm') return signature === 'webm';
    return false;
  }
  if (mime === 'video/mp4') return signature === 'mp4';
  if (mime === 'video/webm') return signature === 'webm';
  if (mime === 'video/ogg') return signature === 'ogg';
  return false;
}

export function validateWriterEmbeddedMediaBytes(
  kind: WriterMediaObjectKind,
  mimeType: string,
  bytes: Uint8Array,
): void {
  validateWriterEmbeddedMediaSize(kind, bytes.byteLength);
  validateWriterEmbeddedMediaSignature(kind, mimeType, bytes);
}

function validateWriterEmbeddedMediaSize(kind: WriterMediaObjectKind, byteLength: number): void {
  const limit = byteLimitFor(kind);
  if (!Number.isSafeInteger(byteLength) || byteLength < 4 || byteLength > limit) {
    throw new WriterMediaObjectError(`${kind === 'audio' ? 'Audio' : 'Video'} muss zwischen 4 Byte und ${limit / 1024 / 1024} MiB groß sein.`);
  }
}

function validateWriterEmbeddedMediaSignature(
  kind: WriterMediaObjectKind,
  mimeType: string,
  bytes: Uint8Array,
): void {
  const normalizedMime = mimeType.toLowerCase();
  if (!mimeAllowedFor(kind, normalizedMime)) throw new WriterMediaObjectError('Der deklarierte MIME-Typ wird für dieses Medienobjekt nicht unterstützt.');
  if (!allowedSignature(kind, normalizedMime, detectWriterMediaSignature(bytes))) {
    throw new WriterMediaObjectError('MIME-Typ und Mediendatei-Signatur stimmen nicht überein oder werden nicht unterstützt.');
  }
}

export function normalizeWriterMediaLink(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LINK_CHARS) throw new WriterMediaObjectError('Der Medienlink ist leer oder zu lang.');
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new WriterMediaObjectError('Der Medienlink ist keine gültige URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new WriterMediaObjectError('Verknüpfte Medien erlauben ausschließlich HTTPS ohne eingebettete Zugangsdaten.');
  }
  url.hash = '';
  return url.toString();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new WriterMediaObjectError('Die Mediendatei konnte nicht lokal gelesen werden.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new WriterMediaObjectError('Die Mediendatei konnte nicht als lokales Datenobjekt gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

function decodedBase64Length(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding;
}

function decodeBase64Prefix(base64: string): Uint8Array | null {
  try {
    const prefixChars = Math.min(base64.length, Math.ceil(DATA_URL_PREFIX_BYTES / 3) * 4);
    const aligned = prefixChars - (prefixChars % 4);
    const decoded = atob(base64.slice(0, aligned));
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function isSafeWriterEmbeddedMediaSource(media: WriterMediaObjectData): boolean {
  if (media.storage !== 'embedded' || !media.embeddedDataUrl) return false;
  const mimeType = media.mimeType.toLowerCase();
  if (!mimeAllowedFor(media.kind, mimeType)) return false;
  const match = /^data:([^;,]+);base64,([a-z0-9+/]+={0,2})$/i.exec(media.embeddedDataUrl);
  if (!match || match[1]?.toLowerCase() !== mimeType || !match[2]) return false;
  const base64 = match[2];
  if (base64.length % 4 !== 0) return false;
  const decodedLength = decodedBase64Length(base64);
  if (decodedLength < 4 || decodedLength > byteLimitFor(media.kind)) return false;
  const prefix = decodeBase64Prefix(base64);
  return prefix !== null && allowedSignature(media.kind, mimeType, detectWriterMediaSignature(prefix));
}

export async function importWriterEmbeddedMedia(
  file: File,
  kind: WriterMediaObjectKind,
  anchorParagraphId?: string,
): Promise<WriterMediaObjectData> {
  // Blob.size is measured by the browser. Enforce the cap before allocating or reading file contents.
  validateWriterEmbeddedMediaSize(kind, file.size);
  const signaturePrefix = new Uint8Array(await file.slice(0, Math.min(DATA_URL_PREFIX_BYTES, file.size)).arrayBuffer());
  validateWriterEmbeddedMediaSignature(kind, file.type, signaturePrefix);
  const embeddedDataUrl = await fileToDataUrl(file);
  const media: WriterMediaObjectData = {
    id: crypto.randomUUID(), kind, storage: 'embedded',
    name: boundedText(file.name, MAX_NAME_CHARS, `${kind}-media`),
    mimeType: file.type.toLowerCase(), embeddedDataUrl,
    anchorParagraphId, createdAt: Date.now(),
  };
  if (!isSafeWriterEmbeddedMediaSource(media)) throw new WriterMediaObjectError('Die erzeugte lokale Medienquelle hat die Sicherheitsprüfung nicht bestanden.');
  return media;
}

export function createWriterLinkedMedia(
  kind: WriterMediaObjectKind,
  url: string,
  name: string,
  anchorParagraphId?: string,
): WriterMediaObjectData {
  return {
    id: crypto.randomUUID(), kind, storage: 'linked',
    name: boundedText(name, MAX_NAME_CHARS, `${kind}-link`),
    mimeType: kind === 'audio' ? 'audio/remote' : 'video/remote',
    sourceUrl: normalizeWriterMediaLink(url), anchorParagraphId, createdAt: Date.now(),
  };
}

export function normalizeWriterMediaObjects(
  raw: readonly WriterMediaObjectData[] | undefined,
  validParagraphIds?: ReadonlySet<string>,
): WriterMediaObjectData[] {
  if (!Array.isArray(raw)) return [];
  const normalized: WriterMediaObjectData[] = [];
  const seenIds = new Set<string>();
  for (const candidate of raw.slice(0, MAX_MEDIA_OBJECTS)) {
    if (!candidate || (candidate.kind !== 'audio' && candidate.kind !== 'video')) continue;
    if (candidate.storage !== 'embedded' && candidate.storage !== 'linked') continue;
    const id = boundedText(candidate.id, MAX_ID_CHARS);
    if (!id || seenIds.has(id)) continue;
    const anchorParagraphId = boundedText(candidate.anchorParagraphId, MAX_ID_CHARS) || undefined;
    const base: WriterMediaObjectData = {
      id,
      kind: candidate.kind,
      storage: candidate.storage,
      name: boundedText(candidate.name, MAX_NAME_CHARS, `${candidate.kind}-media`),
      mimeType: boundedText(candidate.mimeType, 96).toLowerCase(),
      anchorParagraphId: anchorParagraphId && (!validParagraphIds || validParagraphIds.has(anchorParagraphId)) ? anchorParagraphId : undefined,
      caption: boundedText(candidate.caption, MAX_CAPTION_CHARS) || undefined,
      transcript: boundedText(candidate.transcript, MAX_TRANSCRIPT_CHARS) || undefined,
      createdAt: Number.isSafeInteger(candidate.createdAt) && candidate.createdAt >= 0 ? candidate.createdAt : 0,
    };
    if (candidate.storage === 'embedded') {
      const embedded = { ...base, embeddedDataUrl: typeof candidate.embeddedDataUrl === 'string' ? candidate.embeddedDataUrl : undefined };
      if (!isSafeWriterEmbeddedMediaSource(embedded)) continue;
      normalized.push(embedded);
    } else {
      if (typeof candidate.sourceUrl !== 'string') continue;
      try {
        normalized.push({ ...base, sourceUrl: normalizeWriterMediaLink(candidate.sourceUrl) });
      } catch { continue; }
    }
    seenIds.add(id);
  }
  return normalized;
}
