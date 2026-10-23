// STATUS: PLATIN — Typed browser speech-recognition adapter

export type DictationStatus = 'idle' | 'listening' | 'paused' | 'error' | 'unsupported';
export type DictationPrivacy = 'browser-managed' | 'local-provider';

export interface DictationResult {
  transcript: string;
  interim: string;
  confidence: number;
  isFinal: boolean;
  insertedCommand?: string;
}

export interface DictationConfig {
  language: string;
  continuous: boolean;
  interimResults: boolean;
  autoPunctuation: boolean;
}


export interface WriterLocalTranscriptionRequest {
  audioBytes: Uint8Array;
  mimeType: string;
  fileName: string;
  language: string;
}

export interface WriterLocalTranscriptionProvider {
  id: string;
  label: string;
  transport: 'local';
  transcribe(request: WriterLocalTranscriptionRequest): Promise<string>;
}

let localTranscriptionProvider: WriterLocalTranscriptionProvider | null = null;
const MAX_LOCAL_TRANSCRIPT_CHARS = 200_000;

export function registerWriterLocalTranscriptionProvider(provider: WriterLocalTranscriptionProvider | null): void {
  if (provider && (provider.transport !== 'local' || !provider.id.trim() || !provider.label.trim())) {
    throw new Error('Ungültiger lokaler Writer-Transkriptionsprovider.');
  }
  localTranscriptionProvider = provider;
}

export function getWriterLocalTranscriptionProvider(): WriterLocalTranscriptionProvider | null {
  return localTranscriptionProvider;
}

export async function transcribeWriterAudioLocally(
  file: File,
  language: string,
  provider: WriterLocalTranscriptionProvider | null = localTranscriptionProvider,
): Promise<string> {
  if (!provider || provider.transport !== 'local') throw new Error('Kein lokaler Transkriptionsprovider ist konfiguriert.');
  const { validateWriterEmbeddedMediaBytes } = await import('../../audio-video/writerAudioVideoMedia');
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateWriterEmbeddedMediaBytes('audio', file.type, bytes);
  const transcript = await provider.transcribe({
    audioBytes: bytes,
    mimeType: file.type.toLowerCase(),
    fileName: file.name.normalize('NFKC').slice(0, 240),
    language: language.normalize('NFKC').slice(0, 32),
  });
  if (typeof transcript !== 'string') throw new Error('Der lokale Provider lieferte kein gültiges Transkript.');
  const normalized = transcript.normalize('NFKC').replace(/\u0000/g, '').trim();
  if (!normalized || normalized.length > MAX_LOCAL_TRANSCRIPT_CHARS) {
    throw new Error('Das lokale Transkript ist leer oder überschreitet die zulässige Länge.');
  }
  return normalized;
}

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  readonly error?: string;
  readonly message?: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
export type SpeechRecognitionProvider = () => SpeechRecognitionConstructor | undefined;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  mozSpeechRecognition?: SpeechRecognitionConstructor;
  msSpeechRecognition?: SpeechRecognitionConstructor;
}

export const DEFAULT_DICTATION_CONFIG: DictationConfig = {
  language: 'de-DE',
  continuous: true,
  interimResults: true,
  autoPunctuation: true,
};

const VOICE_COMMANDS: ReadonlyArray<Readonly<{ trigger: RegExp; replacement: string }>> = [
  { trigger: /\b(punkt|schlusspunkt)\b/gi, replacement: '.' },
  { trigger: /\b(komma|beistrich)\b/gi, replacement: ',' },
  { trigger: /\b(ausrufezeichen|rufzeichen)\b/gi, replacement: '!' },
  { trigger: /\b(fragezeichen)\b/gi, replacement: '?' },
  { trigger: /\b(doppelpunkt)\b/gi, replacement: ':' },
  { trigger: /\b(semikolon|strichpunkt)\b/gi, replacement: ';' },
  { trigger: /\b(neue zeile|zeilenumbruch)\b/gi, replacement: '\n' },
  { trigger: /\b(neuer absatz|absatz)\b/gi, replacement: '\n\n' },
  { trigger: /\b(period|full stop)\b/gi, replacement: '.' },
  { trigger: /\b(comma)\b/gi, replacement: ',' },
  { trigger: /\b(exclamation mark|exclamation point)\b/gi, replacement: '!' },
  { trigger: /\b(question mark)\b/gi, replacement: '?' },
  { trigger: /\b(colon)\b/gi, replacement: ':' },
  { trigger: /\b(semicolon)\b/gi, replacement: ';' },
  { trigger: /\b(new line)\b/gi, replacement: '\n' },
  { trigger: /\b(new paragraph)\b/gi, replacement: '\n\n' },
];

export function processVoiceCommands(rawText: string): { processedText: string; commandUsed: boolean } {
  let text = rawText;
  let commandUsed = false;
  for (const command of VOICE_COMMANDS) {
    const next = text.replace(command.trigger, command.replacement);
    commandUsed = commandUsed || next !== text;
    text = next;
  }
  return { processedText: text.replace(/\s+([.,!?:;])/g, '$1'), commandUsed };
}

function resolveBrowserSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition
    ?? speechWindow.webkitSpeechRecognition
    ?? speechWindow.mozSpeechRecognition
    ?? speechWindow.msSpeechRecognition;
}

function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'UnknownError', message: 'Speech recognition could not be started.' };
}

export class WriterDictationEngine {
  private recognition: SpeechRecognitionLike | null = null;
  private status: DictationStatus = 'idle';
  private config: DictationConfig;
  private onResultCallback: ((result: DictationResult) => void) | null = null;
  private onStatusChangeCallback: ((status: DictationStatus, error?: string) => void) | null = null;

  constructor(
    config: Partial<DictationConfig> = {},
    provider: SpeechRecognitionProvider = resolveBrowserSpeechRecognition,
  ) {
    this.config = { ...DEFAULT_DICTATION_CONFIG, ...config };
    this.initialize(provider);
  }

  private initialize(provider: SpeechRecognitionProvider): void {
    const SpeechRecognition = provider();
    if (!SpeechRecognition) {
      this.status = 'unsupported';
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = this.config.continuous;
      recognition.interimResults = this.config.interimResults;
      recognition.lang = this.config.language;
      recognition.onstart = () => this.publishStatus('listening');
      recognition.onresult = (event) => this.handleResult(event);
      recognition.onerror = (event) => {
        this.publishStatus('error', event.error ?? event.message ?? 'Speech recognition failed.');
      };
      recognition.onend = () => {
        if (this.status === 'listening') this.publishStatus('idle');
      };
      this.recognition = recognition;
    } catch {
      this.status = 'unsupported';
    }
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    let interim = '';
    let finalTranscript = '';
    let confidence = 0;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternative = result?.[0];
      if (!result || !alternative) continue;
      if (result.isFinal) {
        finalTranscript += alternative.transcript;
        confidence = Math.max(confidence, alternative.confidence);
      } else {
        interim += alternative.transcript;
      }
    }
    if (finalTranscript.length > 0) {
      const processed = this.config.autoPunctuation
        ? processVoiceCommands(finalTranscript)
        : { processedText: finalTranscript, commandUsed: false };
      this.onResultCallback?.({
        transcript: processed.processedText,
        interim: '',
        confidence,
        isFinal: true,
        insertedCommand: processed.commandUsed ? 'voice-punctuation' : undefined,
      });
      return;
    }
    if (interim.length > 0) {
      this.onResultCallback?.({ transcript: '', interim, confidence: 0, isFinal: false });
    }
  }

  private publishStatus(status: DictationStatus, error?: string): void {
    this.status = status;
    this.onStatusChangeCallback?.(status, error);
  }

  public isAvailable(): boolean { return this.recognition !== null; }
  public getStatus(): DictationStatus { return this.status; }
  public getPrivacyModel(): DictationPrivacy { return 'browser-managed'; }
  public onResult(callback: (result: DictationResult) => void): void { this.onResultCallback = callback; }
  public onStatusChange(callback: (status: DictationStatus, error?: string) => void): void {
    this.onStatusChangeCallback = callback;
  }
  public setLanguage(language: string): void {
    this.config.language = language;
    if (this.recognition) this.recognition.lang = language;
  }
  public start(): void {
    if (!this.recognition) {
      this.publishStatus('unsupported', 'Speech recognition is not available in this environment.');
      return;
    }
    try {
      this.recognition.start();
    } catch (error: unknown) {
      const details = errorDetails(error);
      if (details.name !== 'InvalidStateError') this.publishStatus('error', details.message);
    }
  }
  public stop(): void {
    if (!this.recognition) return;
    try { this.recognition.stop(); } finally { this.publishStatus('idle'); }
  }
  public abort(): void {
    if (!this.recognition) return;
    try { this.recognition.abort(); } finally { this.publishStatus('idle'); }
  }
}
