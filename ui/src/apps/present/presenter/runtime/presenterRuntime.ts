// STATUS: DIAMANT VGT SUPREME — bounded Presenter sequencing, annotations and trusted remote adapter
import type { PresentCustomShow, PresentInkStroke, PresentSection, PresentSlide } from '../../../../shared/contracts/workspace';

export type PresentRemoteCommand =
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'black'; enabled?: boolean }
  | { type: 'white'; enabled?: boolean }
  | { type: 'goto'; slideId: string };

export interface PresentRemoteEnvelope {
  version: 1;
  sessionId: string;
  token: string;
  command: PresentRemoteCommand;
}

export interface PresenterSequence {
  id: string;
  label: string;
  slideIds: string[];
}

const MAX_REMOTE_TOKEN = 128;
const MAX_STROKES = 256;
const MAX_POINTS_PER_STROKE = 4096;

export function createPresenterPairToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqualAscii(left: string, right: string): boolean {
  const a = left.slice(0, MAX_REMOTE_TOKEN);
  const b = right.slice(0, MAX_REMOTE_TOKEN);
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function normalizeRemoteEnvelope(value: unknown, expectedSessionId: string, expectedToken: string): PresentRemoteCommand | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Partial<PresentRemoteEnvelope>;
  if (envelope.version !== 1 || !constantTimeEqualAscii(String(envelope.sessionId || ''), expectedSessionId) || !constantTimeEqualAscii(String(envelope.token || ''), expectedToken)) return null;
  const command = envelope.command;
  if (!command || typeof command !== 'object' || typeof command.type !== 'string') return null;
  if (['next','previous','pause','resume'].includes(command.type)) return { type: command.type } as PresentRemoteCommand;
  if (command.type === 'black' || command.type === 'white') return { type: command.type, enabled: typeof command.enabled === 'boolean' ? command.enabled : undefined } as PresentRemoteCommand;
  if (command.type === 'goto' && typeof command.slideId === 'string' && command.slideId.length > 0 && command.slideId.length <= 128) return { type: 'goto', slideId: command.slideId };
  return null;
}

export function buildPresenterSequences(
  slides: PresentSlide[],
  sections: PresentSection[] | undefined,
  customShows: PresentCustomShow[] | undefined,
): PresenterSequence[] {
  const validIds = new Set(slides.map((slide) => slide.id));
  const sequences: PresenterSequence[] = [{ id: 'all', label: 'All Slides', slideIds: slides.map((slide) => slide.id) }];
  for (const section of (sections || []).slice(0, 128)) {
    const ids = slides.filter((slide) => slide.sectionId === section.id).map((slide) => slide.id);
    if (ids.length) sequences.push({ id: `section:${section.id}`, label: `Section · ${section.name.slice(0, 80)}`, slideIds: ids });
  }
  for (const show of (customShows || []).slice(0, 64)) {
    const ids = (show.slideIds || []).filter((id) => validIds.has(id)).slice(0, slides.length);
    if (ids.length) sequences.push({ id: `show:${show.id}`, label: `Show · ${show.name.slice(0, 80)}`, slideIds: ids });
  }
  return sequences;
}

export function sequenceIndexForSlide(sequence: PresenterSequence, slideId: string): number {
  return sequence.slideIds.indexOf(slideId);
}

export function nextSlideIdInSequence(sequence: PresenterSequence, slideId: string, loop: boolean): string | null {
  const index = sequenceIndexForSlide(sequence, slideId);
  if (index < 0) return sequence.slideIds[0] || null;
  if (index + 1 < sequence.slideIds.length) return sequence.slideIds[index + 1];
  return loop ? (sequence.slideIds[0] || null) : null;
}

export function previousSlideIdInSequence(sequence: PresenterSequence, slideId: string, loop: boolean): string | null {
  const index = sequenceIndexForSlide(sequence, slideId);
  if (index > 0) return sequence.slideIds[index - 1];
  return loop ? (sequence.slideIds[sequence.slideIds.length - 1] || null) : null;
}

export function normalizeInkStrokes(strokes: PresentInkStroke[] | undefined): PresentInkStroke[] {
  return (strokes || []).slice(0, MAX_STROKES).map((stroke) => ({
    id: String(stroke.id || 'ink').slice(0, 128),
    tool: (stroke.tool === 'highlighter' ? 'highlighter' : 'pen') as PresentInkStroke['tool'],
    color: /^#[0-9a-fA-F]{6}$/.test(stroke.color) ? stroke.color : '#ef4444',
    width: Math.max(1, Math.min(40, Number.isFinite(stroke.width) ? stroke.width : 3)),
    opacity: Math.max(0.05, Math.min(1, Number.isFinite(stroke.opacity) ? stroke.opacity : 1)),
    points: (stroke.points || []).slice(0, MAX_POINTS_PER_STROKE).map((point) => ({
      xPercent: Math.max(0, Math.min(100, Number.isFinite(point.xPercent) ? point.xPercent : 0)),
      yPercent: Math.max(0, Math.min(100, Number.isFinite(point.yPercent) ? point.yPercent : 0)),
    })),
  })).filter((stroke) => stroke.points.length >= 2);
}

export function eraseInkAt(strokes: PresentInkStroke[], xPercent: number, yPercent: number, radiusPercent = 2.5): PresentInkStroke[] {
  const radiusSq = radiusPercent * radiusPercent;
  return strokes.filter((stroke) => !stroke.points.some((point) => {
    const dx = point.xPercent - xPercent;
    const dy = point.yPercent - yPercent;
    return dx * dx + dy * dy <= radiusSq;
  }));
}

export class PresenterRemoteChannel {
  private readonly channel: BroadcastChannel | null;
  private readonly listener: (command: PresentRemoteCommand) => void;
  readonly sessionId: string;
  readonly token: string;

  constructor(sessionId: string, token: string, listener: (command: PresentRemoteCommand) => void) {
    this.sessionId = sessionId.slice(0, 128);
    this.token = token.slice(0, MAX_REMOTE_TOKEN);
    this.listener = listener;
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`astraea-present-remote-${this.sessionId}`);
    if (this.channel) this.channel.onmessage = (event) => {
      const command = normalizeRemoteEnvelope(event.data, this.sessionId, this.token);
      if (command) this.listener(command);
    };
  }

  get available(): boolean { return this.channel !== null; }
  close(): void { this.channel?.close(); }
}
