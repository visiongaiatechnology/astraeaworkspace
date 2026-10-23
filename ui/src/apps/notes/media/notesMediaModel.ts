// STATUS: DIAMANT VGT SUPREME — bounded local Notes audio/video memo domain
import type { NoteMediaBookmark, NoteMediaMemo, NoteTranscriptSegment } from '../../../shared/contracts/notes-pdf/workspaceNotes';

export const NOTE_MEDIA_MAX_BYTES = 24 * 1024 * 1024;
export const NOTE_MEDIA_MAX_DURATION_SECONDS = 4 * 60 * 60;
export const NOTE_MEDIA_MAX_BOOKMARKS = 256;
export const NOTE_MEDIA_MAX_TRANSCRIPT_SEGMENTS = 8_192;
export const NOTE_MEDIA_MAX_TRANSCRIPT_TEXT = 1_000_000;

const ALLOWED_MEDIA_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'video/webm', 'video/mp4']);
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const safeText = (value: string, max: number): string => value.normalize('NFKC').replace(/\u0000/g, '').slice(0, max);

export function normalizeNoteMediaMime(mimeType: string): string {
  return mimeType.toLowerCase().split(';', 1)[0].trim();
}

export function isAllowedNoteMediaMime(mimeType: string, kind?: 'audio' | 'video'): boolean {
  const base = normalizeNoteMediaMime(mimeType);
  if (!ALLOWED_MEDIA_MIME.has(base)) return false;
  return !kind || base.startsWith(`${kind}/`);
}

export function verifyNoteMediaSignature(bytes: Uint8Array, mimeType: string): boolean {
  const base = normalizeNoteMediaMime(mimeType);
  if ((base === 'audio/webm' || base === 'video/webm')) {
    return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (base === 'audio/ogg') {
    return bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'OggS';
  }
  if (base === 'audio/mp4' || base === 'video/mp4') {
    return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp';
  }
  return false;
}

const NOTE_MEDIA_MAX_BASE64_CHARS = Math.ceil(NOTE_MEDIA_MAX_BYTES * 4 / 3) + 16;

function decodeBase64Payload(payload: string): Uint8Array {
  if (payload.length > NOTE_MEDIA_MAX_BASE64_CHARS) throw new Error('Media data exceeds the 24 MiB encoded safety limit.');
  let binary: string;
  try { binary = atob(payload); } catch { throw new Error('Media base64 payload is invalid.'); }
  if (binary.length <= 0 || binary.length > NOTE_MEDIA_MAX_BYTES) throw new Error('Media payload exceeds the 24 MiB safety limit or is empty.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}


function validateNoteMediaDataUrlEnvelope(dataUrl: string, mimeType: string, kind: 'audio' | 'video'): string {
  const base = normalizeNoteMediaMime(mimeType);
  if (!isAllowedNoteMediaMime(base, kind)) throw new Error(`Unsupported ${kind} recording MIME type.`);
  const prefix = `data:${base};base64,`;
  if (!dataUrl.startsWith(prefix)) throw new Error('Media data URL MIME does not match the declared recording MIME.');
  const payload = dataUrl.slice(prefix.length);
  if (!payload || payload.length > NOTE_MEDIA_MAX_BASE64_CHARS) throw new Error('Media data exceeds the 24 MiB encoded safety limit or is empty.');
  const sampleLength = Math.min(payload.length, 64);
  const alignedLength = sampleLength === payload.length ? sampleLength : sampleLength - (sampleLength % 4);
  let sampleBinary: string;
  try { sampleBinary = atob(payload.slice(0, Math.max(4, alignedLength))); } catch { throw new Error('Media base64 header is invalid.'); }
  const sample = new Uint8Array(sampleBinary.length);
  for (let index = 0; index < sampleBinary.length; index += 1) sample[index] = sampleBinary.charCodeAt(index);
  if (!verifyNoteMediaSignature(sample, base)) throw new Error('Media MIME type does not match its binary signature.');
  return payload;
}

export function validateNoteMediaDataUrl(dataUrl: string, mimeType: string, kind: 'audio' | 'video'): { bytes: Uint8Array; mimeType: string } {
  const base = normalizeNoteMediaMime(mimeType);
  const payload = validateNoteMediaDataUrlEnvelope(dataUrl, base, kind);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) throw new Error('Media base64 payload contains invalid characters.');
  const bytes = decodeBase64Payload(payload);
  if (!verifyNoteMediaSignature(bytes, base)) throw new Error('Media MIME type does not match its binary signature.');
  return { bytes, mimeType: base };
}

export async function blobToValidatedNoteMediaDataUrl(blob: Blob, kind: 'audio' | 'video'): Promise<{ dataUrl: string; mimeType: string; sizeBytes: number }> {
  if (blob.size <= 0 || blob.size > NOTE_MEDIA_MAX_BYTES) throw new Error('Recording exceeds the 24 MiB safety limit or is empty.');
  const mimeType = normalizeNoteMediaMime(blob.type);
  if (!isAllowedNoteMediaMime(mimeType, kind)) throw new Error(`MediaRecorder returned unsupported ${kind} MIME type.`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!verifyNoteMediaSignature(bytes, mimeType)) throw new Error('Recorded media MIME does not match its binary signature.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Recorded media could not be encoded for local persistence.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Recorded media encoding returned an invalid result.'));
    const copiedBuffer = bytes.slice().buffer;
    reader.readAsDataURL(new Blob([copiedBuffer], { type: mimeType }));
  });
  return { dataUrl, mimeType, sizeBytes: bytes.byteLength };
}

export function chooseNoteMediaRecorderMime(kind: 'audio' | 'video'): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = kind === 'video'
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

export function createNoteMediaBookmark(seconds: number, label: string): NoteMediaBookmark {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error('Cryptographic random UUID support is required for media bookmarks.');
  return { id: `media-bookmark-${crypto.randomUUID()}`, seconds: clamp(seconds, 0, NOTE_MEDIA_MAX_DURATION_SECONDS), label: safeText(label || 'Bookmark', 512) };
}

export function normalizeNoteTranscriptSegments(source: readonly NoteTranscriptSegment[], durationSeconds: number): NoteTranscriptSegment[] {
  let textBudget = NOTE_MEDIA_MAX_TRANSCRIPT_TEXT;
  const result: NoteTranscriptSegment[] = [];
  for (const raw of source.slice(0, NOTE_MEDIA_MAX_TRANSCRIPT_SEGMENTS)) {
    if (textBudget <= 0) break;
    const text = safeText(raw.text, Math.min(16_384, textBudget)).trim();
    if (!text) continue;
    const startSeconds = clamp(raw.startSeconds, 0, durationSeconds);
    const endSeconds = clamp(Math.max(raw.endSeconds, startSeconds), startSeconds, durationSeconds);
    result.push({
      id: safeText(raw.id, 160) || `segment-${result.length + 1}`,
      startSeconds,
      endSeconds,
      text,
      confidence: raw.confidence == null ? null : clamp(raw.confidence, 0, 1),
    });
    textBudget -= text.length;
  }
  return result;
}

export function normalizeNoteMediaMemo(memo: NoteMediaMemo): NoteMediaMemo {
  const durationSeconds = clamp(memo.durationSeconds, 0.05, NOTE_MEDIA_MAX_DURATION_SECONDS);
  const trimStartSeconds = clamp(memo.trimStartSeconds, 0, Math.max(0, durationSeconds - 0.01));
  const trimEndSeconds = clamp(Math.max(memo.trimEndSeconds, trimStartSeconds + 0.01), trimStartSeconds + 0.01, durationSeconds);
  const kind = memo.kind === 'video' ? 'video' : 'audio';
  const mimeType = normalizeNoteMediaMime(memo.mimeType);
  if (!isAllowedNoteMediaMime(mimeType, kind)) throw new Error('Persisted Notes media has an unsupported MIME type.');
  if (memo.sizeBytes <= 0 || memo.sizeBytes > NOTE_MEDIA_MAX_BYTES) throw new Error('Persisted Notes media violates the bounded media size.');
  validateNoteMediaDataUrlEnvelope(memo.dataUrl, mimeType, kind);
  return {
    ...memo,
    id: safeText(memo.id, 160),
    kind,
    title: safeText(memo.title || (kind === 'video' ? 'Video Note' : 'Voice Note'), 512),
    mimeType,
    sizeBytes: Math.round(memo.sizeBytes),
    durationSeconds,
    trimStartSeconds,
    trimEndSeconds,
    bookmarks: (memo.bookmarks ?? []).slice(0, NOTE_MEDIA_MAX_BOOKMARKS).map((bookmark) => ({
      id: safeText(bookmark.id, 160),
      seconds: clamp(bookmark.seconds, trimStartSeconds, trimEndSeconds),
      label: safeText(bookmark.label, 512),
    })).filter((bookmark) => bookmark.id.length > 0),
    transcript: normalizeNoteTranscriptSegments(memo.transcript ?? [], durationSeconds),
    createdAt: clamp(memo.createdAt, 0, Number.MAX_SAFE_INTEGER),
    transcriptionEngine: memo.transcriptionEngine === 'web-speech-local' ? 'web-speech-local' : undefined,
  };
}

/**
 * **W-431 — die Korrektur der Mediendauer, als reine Entscheidung.**
 *
 * Der Abspieler meldet die **echte** Länge, sobald er Metadaten hat. Diese Entscheidung war vorher im Dialog
 * vergraben und lautete `duration >= memo.durationSeconds → return`: *eine Korrektur nach **oben** wurde
 * verworfen* ✗. Gemessen an einer **angehängten** Datei — `attachLocalMediaFile` setzt den Platzhalter
 * `durationSeconds: 0.05` — hieß das: die echte Länge (größer) wurde **nie** übernommen, `trimEndSeconds`
 * blieb `0.05`, und damit blieb die sichtbare Trimm-Obergrenze auf 0,05 s stehen. *Eine angehängte Audiodatei
 * ließ sich überhaupt nicht trimmen, und die Anzeige nannte 0,0 s für eine mehrsekündige Datei.*
 *
 * Hier ist der Abspieler die **Autorität** — in beide Richtungen. Ein **ungetrimmter** Verweis
 * (Ende == bisherige Länge) folgt dem Dateiende; ein **getrimmtes** Fenster wird in die neue Länge geklemmt,
 * statt zu verschwinden. `null` heißt: nichts zu korrigieren — *der Aufrufer schreibt dann keinen Zustand.*
 *
 * Die Grenzen sind die **vorhandenen** dieses Moduls (`0.05`–`NOTE_MEDIA_MAX_DURATION_SECONDS`), damit keine
 * zweite Zahl entsteht.
 */
export function correctNoteMediaDuration(memo: NoteMediaMemo, reportedDurationSeconds: number): NoteMediaMemo | null {
  const reported = Number(reportedDurationSeconds);
  if (!Number.isFinite(reported) || reported <= 0) return null;
  const durationSeconds = clamp(reported, 0.05, NOTE_MEDIA_MAX_DURATION_SECONDS);
  // Weniger als eine Millisekunde Abweichung ist keine Korrektur — sonst schriebe jedes `metadata`-Ereignis.
  if (Math.abs(durationSeconds - memo.durationSeconds) < 0.001) return null;
  const followsFileEnd = Math.abs(memo.trimEndSeconds - memo.durationSeconds) < 0.001;
  const minimumGap = memo.trimStartSeconds + 0.01;
  const trimEndSeconds = followsFileEnd
    ? durationSeconds
    : clamp(Math.max(memo.trimEndSeconds, minimumGap), minimumGap, durationSeconds);
  return { ...memo, durationSeconds, trimEndSeconds };
}

export function noteMediaSearchText(memo: NoteMediaMemo): string {
  const normalized = normalizeNoteMediaMemo(memo);
  return [normalized.title, ...normalized.bookmarks.map((item) => item.label), ...normalized.transcript.map((item) => item.text)].join(' ').slice(0, NOTE_MEDIA_MAX_TRANSCRIPT_TEXT + 65_536);
}
