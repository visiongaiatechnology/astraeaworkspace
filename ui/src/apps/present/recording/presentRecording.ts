// STATUS: DIAMANT VGT SUPREME — local-first slide recording core
import type {
  PresentRecordingCaptionCue,
  PresentRecordingInteractionEvent,
  PresentRecordingMediaTrack,
  PresentRecordingTake,
  PresentSlideRecording,
} from '../../../shared/contracts/workspace';

export const MAX_RECORDING_TRACK_BYTES = 32 * 1024 * 1024;
export const MAX_RECORDING_TAKES_PER_SLIDE = 12;
export const MAX_RECORDING_INTERACTION_EVENTS = 12_000;
export const MAX_RECORDING_CAPTIONS = 500;
export const MAX_RECORDING_DURATION_MS = 4 * 60 * 60 * 1000;

export interface PresentRecordingDeviceRequest {
  microphone: boolean;
  camera: boolean;
  /** Must come from a visible, explicit user action in the recording UI. */
  consentGranted: boolean;
}

export interface PresentRecordingSessionResult {
  narrationBlob?: Blob;
  cameraBlob?: Blob;
  durationMs: number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, min)));
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const payload = dataUrl.slice(comma + 1);
  if (dataUrl.slice(0, comma).includes(';base64')) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
  } catch {
    return 0;
  }
}

function allowedRecordingMime(mimeType: string, kind: 'audio' | 'video'): boolean {
  const value = mimeType.toLowerCase().split(';', 1)[0].trim();
  return kind === 'audio'
    ? ['audio/webm', 'audio/ogg', 'audio/mp4'].includes(value)
    : ['video/webm', 'video/mp4'].includes(value);
}

export function normalizeRecordingMediaTrack(
  value: PresentRecordingMediaTrack | undefined,
  kind: 'audio' | 'video'
): PresentRecordingMediaTrack | undefined {
  if (!value || !allowedRecordingMime(value.mimeType, kind) || !value.dataUrl.startsWith('data:')) return undefined;
  const sizeBytes = dataUrlByteLength(value.dataUrl);
  if (sizeBytes <= 0 || sizeBytes > MAX_RECORDING_TRACK_BYTES) return undefined;
  const declared = value.dataUrl.slice(5, value.dataUrl.indexOf(';') >= 0 ? value.dataUrl.indexOf(';') : value.dataUrl.indexOf(','));
  if (!allowedRecordingMime(declared, kind)) return undefined;
  return { mimeType: boundedText(value.mimeType, 120), dataUrl: value.dataUrl, sizeBytes };
}

export function normalizeRecordingInteractions(events: PresentRecordingInteractionEvent[] | undefined): PresentRecordingInteractionEvent[] {
  if (!Array.isArray(events)) return [];
  return events.slice(0, MAX_RECORDING_INTERACTION_EVENTS).map((event) => ({
    atMs: clamp(event.atMs, 0, MAX_RECORDING_DURATION_MS),
    type: event.type,
    xPercent: event.xPercent === undefined ? undefined : clamp(event.xPercent, 0, 100),
    yPercent: event.yPercent === undefined ? undefined : clamp(event.yPercent, 0, 100),
    tool: event.tool === 'highlighter' ? 'highlighter' : event.tool === 'pen' ? 'pen' : undefined,
    color: event.color ? boundedText(event.color, 32) : undefined,
    width: event.width === undefined ? undefined : clamp(event.width, 0.25, 32),
  }));
}

export function normalizeRecordingCaptions(cues: PresentRecordingCaptionCue[] | undefined): PresentRecordingCaptionCue[] {
  if (!Array.isArray(cues)) return [];
  return cues.slice(0, MAX_RECORDING_CAPTIONS).map((cue, index) => {
    const startMs = clamp(cue.startMs, 0, MAX_RECORDING_DURATION_MS);
    const endMs = clamp(cue.endMs, startMs + 1, MAX_RECORDING_DURATION_MS);
    return {
      id: boundedText(cue.id, 96) || `caption-${index + 1}`,
      startMs,
      endMs,
      text: boundedText(cue.text, 2_000),
    };
  }).filter((cue) => cue.text.trim().length > 0);
}

export function normalizeRecordingTake(take: PresentRecordingTake): PresentRecordingTake {
  return {
    id: boundedText(take.id, 96) || `take-${Date.now()}`,
    createdAt: clamp(take.createdAt, 0, Number.MAX_SAFE_INTEGER),
    durationMs: clamp(take.durationMs, 0, MAX_RECORDING_DURATION_MS),
    narration: normalizeRecordingMediaTrack(take.narration, 'audio'),
    camera: normalizeRecordingMediaTrack(take.camera, 'video'),
    interactionEvents: normalizeRecordingInteractions(take.interactionEvents),
    captions: normalizeRecordingCaptions(take.captions),
    transcript: take.transcript ? boundedText(take.transcript, 50_000) : undefined,
  };
}

export function normalizeSlideRecording(value: PresentSlideRecording | undefined): PresentSlideRecording | undefined {
  if (!value || !Array.isArray(value.takes)) return undefined;
  const takes = value.takes.slice(-MAX_RECORDING_TAKES_PER_SLIDE).map(normalizeRecordingTake);
  const activeTakeId = takes.some((take) => take.id === value.activeTakeId)
    ? value.activeTakeId
    : takes.at(-1)?.id;
  return takes.length ? { activeTakeId, takes } : undefined;
}

export function upsertRecordingTake(recording: PresentSlideRecording | undefined, take: PresentRecordingTake): PresentSlideRecording {
  const normalized = normalizeRecordingTake(take);
  const previous = normalizeSlideRecording(recording)?.takes ?? [];
  const takes = [...previous.filter((item) => item.id !== normalized.id), normalized].slice(-MAX_RECORDING_TAKES_PER_SLIDE);
  return { activeTakeId: normalized.id, takes };
}

export function removeRecordingTake(recording: PresentSlideRecording | undefined, takeId: string): PresentSlideRecording | undefined {
  const current = normalizeSlideRecording(recording);
  if (!current) return undefined;
  const takes = current.takes.filter((take) => take.id !== takeId);
  if (!takes.length) return undefined;
  return {
    activeTakeId: current.activeTakeId === takeId ? takes.at(-1)?.id : current.activeTakeId,
    takes,
  };
}

export function selectRecordingTake(recording: PresentSlideRecording | undefined, takeId: string): PresentSlideRecording | undefined {
  const current = normalizeSlideRecording(recording);
  if (!current?.takes.some((take) => take.id === takeId)) return current;
  return { ...current, activeTakeId: takeId };
}

export function recordingActiveTake(recording: PresentSlideRecording | undefined): PresentRecordingTake | undefined {
  const current = normalizeSlideRecording(recording);
  return current?.takes.find((take) => take.id === current.activeTakeId) ?? current?.takes.at(-1);
}

export async function blobToBoundedRecordingTrack(blob: Blob, kind: 'audio' | 'video'): Promise<PresentRecordingMediaTrack> {
  if (blob.size <= 0 || blob.size > MAX_RECORDING_TRACK_BYTES) {
    throw new Error(`Recorded ${kind} track exceeds the ${Math.floor(MAX_RECORDING_TRACK_BYTES / 1024 / 1024)} MiB per-track limit.`);
  }
  if (!allowedRecordingMime(blob.type, kind)) throw new Error(`Unsupported recorded ${kind} MIME type: ${blob.type || 'unknown'}.`);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not serialize recorded ${kind} track.`));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`Invalid recorded ${kind} track.`));
    reader.readAsDataURL(blob);
  });
  const result = normalizeRecordingMediaTrack({ mimeType: blob.type, dataUrl, sizeBytes: blob.size }, kind);
  if (!result) throw new Error(`Recorded ${kind} track failed validation.`);
  return result;
}

export async function requestPresentRecordingMedia(request: PresentRecordingDeviceRequest): Promise<MediaStream> {
  if (!request.consentGranted) throw new Error('Visible consent is required before requesting camera or microphone access.');
  if (!request.microphone && !request.camera) throw new Error('Select microphone and/or camera before recording.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This runtime does not provide camera/microphone capture APIs.');
  return navigator.mediaDevices.getUserMedia({
    audio: request.microphone ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
    video: request.camera ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } : false,
  });
}

function bestMime(candidates: string[]): string {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is unavailable in this runtime.');
  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) ?? candidates.at(-1) ?? '';
}

export class PresentTakeRecorder {
  private audioRecorder?: MediaRecorder;
  private cameraRecorder?: MediaRecorder;
  private readonly audioChunks: Blob[] = [];
  private readonly cameraChunks: Blob[] = [];
  private startedAt = 0;

  constructor(private readonly stream: MediaStream) {}

  start(): void {
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is unavailable in this runtime.');
    if (this.startedAt) throw new Error('Recording is already active.');
    const audioTrack = this.stream.getAudioTracks()[0];
    const videoTrack = this.stream.getVideoTracks()[0];
    if (audioTrack) {
      const mimeType = bestMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']);
      this.audioRecorder = new MediaRecorder(new MediaStream([audioTrack]), { mimeType });
      this.audioRecorder.ondataavailable = (event) => { if (event.data.size) this.audioChunks.push(event.data); };
      this.audioRecorder.start(500);
    }
    if (videoTrack) {
      const mimeType = bestMime(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']);
      this.cameraRecorder = new MediaRecorder(new MediaStream([videoTrack]), { mimeType });
      this.cameraRecorder.ondataavailable = (event) => { if (event.data.size) this.cameraChunks.push(event.data); };
      this.cameraRecorder.start(500);
    }
    if (!this.audioRecorder && !this.cameraRecorder) throw new Error('The granted media stream contains no usable tracks.');
    this.startedAt = performance.now();
  }

  async stop(): Promise<PresentRecordingSessionResult> {
    if (!this.startedAt) throw new Error('Recording is not active.');
    const durationMs = clamp(performance.now() - this.startedAt, 0, MAX_RECORDING_DURATION_MS);
    const stopRecorder = (recorder?: MediaRecorder): Promise<void> => new Promise((resolve) => {
      if (!recorder || recorder.state === 'inactive') return resolve();
      const previous = recorder.onstop;
      recorder.onstop = (event) => { previous?.call(recorder, event); resolve(); };
      recorder.stop();
    });
    await Promise.all([stopRecorder(this.audioRecorder), stopRecorder(this.cameraRecorder)]);
    const narrationBlob = this.audioRecorder ? new Blob(this.audioChunks, { type: this.audioRecorder.mimeType }) : undefined;
    const cameraBlob = this.cameraRecorder ? new Blob(this.cameraChunks, { type: this.cameraRecorder.mimeType }) : undefined;
    this.startedAt = 0;
    return { narrationBlob, cameraBlob, durationMs };
  }

  dispose(): void {
    for (const track of this.stream.getTracks()) track.stop();
  }
}

export function captionsFromTranscript(transcript: string, durationMs: number): PresentRecordingCaptionCue[] {
  const lines = transcript.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, MAX_RECORDING_CAPTIONS);
  if (!lines.length) return [];
  const boundedDuration = clamp(durationMs, lines.length, MAX_RECORDING_DURATION_MS);
  const chunk = boundedDuration / lines.length;
  return lines.map((text, index) => ({
    id: `caption-${index + 1}`,
    startMs: Math.round(index * chunk),
    endMs: Math.round((index + 1) * chunk),
    text: text.slice(0, 2_000),
  }));
}
