// STATUS: DIAMANT VGT SUPREME — bounded Present media source validation
import type { PresentMediaSource } from '../../../shared/contracts/workspace';
import { probeMediaBoundary } from '../../../platform/media/index';
import { preflightIsolatedImageDecode } from '../../../platform/import-sandbox/importExportSandbox';

const MAX_MEDIA_BYTES = 24 * 1024 * 1024;
const AUDIO_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/ogg']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm']);

const MAX_VTT_CHARS = 256 * 1024;
const MAX_TRANSCRIPT_CHARS = 512 * 1024;

export function validatePresentVttText(value: string): string {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalized || normalized.length > MAX_VTT_CHARS) throw new Error('Subtitle VTT is empty or too large.');
  if (!/^WEBVTT(?:\s|$)/.test(normalized)) throw new Error('Subtitle file must be WebVTT.');
  if (/<script|javascript:|data:text\/html/i.test(normalized)) throw new Error('Unsafe subtitle content rejected.');
  return normalized;
}

export function validatePresentTranscript(value: string): string | undefined {
  const normalized = String(value ?? '').replace(/\u0000/g, '').trim();
  if (!normalized) return undefined;
  if (normalized.length > MAX_TRANSCRIPT_CHARS) throw new Error('Transcript is too large.');
  return normalized;
}

export function bytesFromPresentMediaDataUrl(dataUrl: string): Uint8Array {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Embedded media must be a base64 data URL.');
  const binary = globalThis.atob(match[2]);
  if (binary.length <= 0 || binary.length > MAX_MEDIA_BYTES) throw new Error('Embedded media size boundary violation.');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return 'audio/wav';
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg';
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  return null;
}

export function validatePresentExternalMediaUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096) throw new Error('External media URL is invalid.');
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('External media URL is invalid.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP(S) external media links are allowed.');
  if (url.username || url.password) throw new Error('Credentials in media URLs are rejected.');
  return url.toString();
}

export async function presentMediaSourceFromFile(file: File, mediaKind: 'audio' | 'video'): Promise<PresentMediaSource> {
  if (file.size <= 0 || file.size > MAX_MEDIA_BYTES) throw new Error('Embedded media size boundary violation.');
  const allowed = mediaKind === 'audio' ? AUDIO_MIME : VIDEO_MIME;
  if (!allowed.has(file.type)) throw new Error(`Unsupported ${mediaKind} MIME type.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniffMime(bytes);
  if (detected !== file.type) throw new Error('Embedded media MIME/signature mismatch.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Media read failed.'));
    reader.onerror = () => reject(new Error('Media read failed.'));
    reader.readAsDataURL(file);
  });
  return { mode: 'embedded', mediaKind, mimeType: file.type, name: file.name.slice(0, 512), dataUrl: base64, sizeBytes: file.size };
}

export function normalizePresentMediaSource(source: PresentMediaSource | undefined, mediaKind: 'audio' | 'video'): PresentMediaSource | undefined {
  if (!source || source.mediaKind !== mediaKind) return undefined;
  if (source.mode === 'external') {
    if (!source.externalUrl) return undefined;
    return { ...source, mode: 'external', mediaKind, externalUrl: validatePresentExternalMediaUrl(source.externalUrl), dataUrl: undefined, sizeBytes: undefined, subtitlesVtt: mediaKind === 'video' && source.subtitlesVtt ? validatePresentVttText(source.subtitlesVtt) : undefined, transcript: validatePresentTranscript(source.transcript ?? '') };
  }
  if (!source.dataUrl) return undefined;
  const bytes = bytesFromPresentMediaDataUrl(source.dataUrl);
  const detected = sniffMime(bytes);
  const allowed = mediaKind === 'audio' ? AUDIO_MIME : VIDEO_MIME;
  if (!detected || detected !== source.mimeType || !allowed.has(detected)) throw new Error('Embedded media failed signature validation.');
  return { ...source, mode: 'embedded', mediaKind, externalUrl: undefined, sizeBytes: bytes.byteLength, subtitlesVtt: mediaKind === 'video' && source.subtitlesVtt ? validatePresentVttText(source.subtitlesVtt) : undefined, transcript: validatePresentTranscript(source.transcript ?? '') };
}


const PRESENT_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_PRESENT_IMAGE_BYTES = 16 * 1024 * 1024;

export async function presentImageDataUrlFromFile(file: File): Promise<string> {
  return (await presentImageInsertionFromFile(file)).dataUrl;
}

export interface PresentImageInsertion {
  dataUrl: string;
  /** Intrinsic pixel size measured by the isolated decoder preflight, not guessed from the file. */
  widthPx: number;
  heightPx: number;
  name: string;
  sizeBytes: number;
}

/**
 * Bounded image intake that also reports the intrinsic size.
 *
 * `presentImageDataUrlFromFile` threw the measured size away, so every inserted image got the same
 * hard-coded 28 x 18 % box and was visibly distorted (Paket 6). The measurement already happened
 * inside `preflightIsolatedImageDecode`; this function keeps it.
 */
export async function presentImageInsertionFromFile(file: File): Promise<PresentImageInsertion> {
  if (file.size <= 0 || file.size > MAX_PRESENT_IMAGE_BYTES) throw new Error('Image size boundary violation.');
  if (!PRESENT_IMAGE_MIME.has(file.type)) throw new Error('Only PNG, JPEG, and WebP images are accepted.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const probe = probeMediaBoundary(bytes, file.type);
  if (!PRESENT_IMAGE_MIME.has(probe.mimeType) || probe.kind !== 'image') throw new Error('Image MIME/signature mismatch.');
  const isolated = await preflightIsolatedImageDecode(file);
  if (!isolated.image_width || !isolated.image_height) throw new Error('Image failed isolated decoder preflight.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image read failed.'));
    reader.onerror = () => reject(new Error('Image read failed.'));
    reader.readAsDataURL(file);
  });
  return {
    dataUrl,
    widthPx: isolated.image_width,
    heightPx: isolated.image_height,
    name: file.name.slice(0, 240),
    sizeBytes: file.size,
  };
}
