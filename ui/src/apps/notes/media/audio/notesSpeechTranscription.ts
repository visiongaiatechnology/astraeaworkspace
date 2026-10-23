// STATUS: DIAMANT VGT SUPREME — local-only speech recognition adapter; no synthetic/cloud fallback
import type { NoteTranscriptSegment } from '../../../../shared/contracts/notes-pdf/workspaceNotes';

export interface TranscriptSegment extends NoteTranscriptSegment {}

export function formatTimeCode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function punctuateSpokenText(segments: { text: string; pauseAfterSeconds: number }[]): string {
  let punctuated = '';
  segments.forEach((segment, index) => {
    let piece = segment.text.normalize('NFKC').trim();
    if (!piece) return;
    if (index === 0 || /[.!?]\s$/.test(punctuated)) piece = piece.charAt(0).toUpperCase() + piece.slice(1);
    punctuated += piece;
    punctuated += segment.pauseAfterSeconds >= 1.2 ? '. ' : segment.pauseAfterSeconds >= 0.5 ? ', ' : ' ';
  });
  return punctuated.trim();
}

interface SpeechRecognitionAlternativeLike { transcript: string; confidence?: number; }
interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal?: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike { resultIndex: number; results: SpeechRecognitionResultListLike; }
interface SpeechRecognitionErrorEventLike { error?: string; }
interface LocalSpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface LocalSpeechRecognitionConstructor {
  new (): LocalSpeechRecognitionLike;
  available?: (options: { langs: string[]; processLocally: true }) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
}
interface WindowWithLocalSpeechRecognition extends Window {
  SpeechRecognition?: LocalSpeechRecognitionConstructor;
  webkitSpeechRecognition?: LocalSpeechRecognitionConstructor;
}

function recognitionConstructor(): LocalSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const source = window as WindowWithLocalSpeechRecognition;
  return source.SpeechRecognition ?? source.webkitSpeechRecognition ?? null;
}

export async function localSpeechRecognitionAvailable(language: string): Promise<boolean> {
  const Constructor = recognitionConstructor();
  if (!Constructor?.available) return false;
  const lang = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language) ? language : 'en-US';
  try {
    const availability = await Constructor.available({ langs: [lang], processLocally: true });
    if (availability !== 'available') return false;
    const probe = new Constructor();
    return 'processLocally' in probe;
  } catch {
    return false;
  }
}

/**
 * Streams transcript segments only when the platform explicitly supports local speech recognition.
 * It never installs language packs automatically and never falls back to network recognition.
 */
export class LocalSpeechTranscriptionSession {
  private recognition: LocalSpeechRecognitionLike | null = null;
  private startedAt = 0;
  private lastEndSeconds = 0;
  private activeFlag = false;
  private readonly language: string;

  constructor(language = 'en-US') {
    this.language = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language) ? language : 'en-US';
  }

  async start(onSegment: (segment: TranscriptSegment) => void, onError?: (error: string) => void): Promise<boolean> {
    if (this.activeFlag) return true;
    const Constructor = recognitionConstructor();
    if (!Constructor || !await localSpeechRecognitionAvailable(this.language)) return false;
    const recognition = new Constructor();
    if (!('processLocally' in recognition)) return false;
    recognition.processLocally = true;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = this.language;
    this.startedAt = performance.now();
    this.lastEndSeconds = 0;
    recognition.onresult = (event) => {
      for (let index = Math.max(0, event.resultIndex); index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal === false || !result[0]) continue;
        const text = result[0].transcript?.normalize('NFKC').trim().slice(0, 16_384) ?? '';
        if (!text) continue;
        const endSeconds = Math.max(this.lastEndSeconds, (performance.now() - this.startedAt) / 1000);
        const confidence = Number.isFinite(result[0].confidence) ? Math.max(0, Math.min(1, result[0].confidence ?? 0)) : null;
        const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `transcript-${crypto.randomUUID()}`
          : `transcript-${Math.round(endSeconds * 1000)}-${index}`;
        onSegment({ id, startSeconds: this.lastEndSeconds, endSeconds, text, confidence });
        this.lastEndSeconds = endSeconds;
      }
    };
    recognition.onerror = (event) => onError?.(event.error?.slice(0, 256) || 'Local speech recognition error.');
    recognition.onend = () => { this.activeFlag = false; };
    try {
      recognition.start();
      this.recognition = recognition;
      this.activeFlag = true;
      return true;
    } catch (error) {
      recognition.abort();
      this.recognition = null;
      this.activeFlag = false;
      onError?.(error instanceof Error ? error.message : 'Local speech recognition could not start.');
      return false;
    }
  }

  stop(): void {
    const current = this.recognition;
    this.recognition = null;
    this.activeFlag = false;
    if (!current) return;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    try { current.stop(); } catch { try { current.abort(); } catch { /* no-op */ } }
  }

  get active(): boolean { return this.activeFlag; }
}
