// STATUS: PLATIN — versioned, bounded, same-origin Present multi-display session protocol.
//
// The editor window and the two display windows (projector/audience + presenter) are separate
// documents of the same origin. They coordinate exclusively through a BroadcastChannel whose name
// is derived from a session id created once by the editor and passed to both display windows via
// the bridge/URL. Every message is versioned and validated at the boundary: a message that does not
// match the running session or the exact shape is dropped instead of reaching the renderer.
//
// Security posture: the channel is same-origin, so this validator is not an authentication
// boundary — it is an input boundary. It bounds every array, string and number, rejects unknown
// message types, and never trusts a received payload to be a well-formed deck.
import type {
  PresentDocumentModel,
  PresentSlide,
  WorkspaceObject,
} from '../../../../shared/contracts/workspace';

export const PRESENT_SESSION_PROTOCOL_VERSION = 1 as const;

/** BroadcastChannel namespace. The session id is the only capability required to join. */
export const PRESENT_SESSION_CHANNEL_PREFIX = 'astraea-present-session-v1:';

/** A display asks the editor for a snapshot; it retries every 400 ms for at most 2 s. */
export const PRESENT_SESSION_SNAPSHOT_RETRY_MS = 400;
export const PRESENT_SESSION_SNAPSHOT_TIMEOUT_MS = 2_000;
/** The editor pings the displays once a second; a display that stays silent is treated as closed. */
export const PRESENT_SESSION_HEARTBEAT_MS = 1_000;
export const PRESENT_SESSION_DISPLAY_TIMEOUT_MS = 3_000;
/**
 * A display that hears nothing from the editor for this long reports a lost connection. The window is
 * deliberately generous: the editor window is usually hidden behind the two display windows, and a
 * hidden Chromium page may throttle its timers down to one tick per minute. A live show must never be
 * declared dead because the editor window was in the background.
 */
export const PRESENT_SESSION_EDITOR_TIMEOUT_MS = 120_000;
/** A display window that never acks within this budget is reported instead of waiting forever. */
export const PRESENT_SESSION_CONNECT_TIMEOUT_MS = 10_000;

export const PRESENT_SESSION_MAX_SLIDES = 2_048;
export const PRESENT_SESSION_MAX_EMBEDDED_OBJECTS = 512;
export const PRESENT_SESSION_MAX_ID_LENGTH = 128;
export const PRESENT_SESSION_MAX_SLIDE_ID_LENGTH = 128;
export const PRESENT_SESSION_MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;

export type PresentSessionRole = 'editor' | 'audience' | 'presenter';
export type PresentDisplayRole = 'audience' | 'presenter';
export type PresentSnapshotReason = 'initial' | 'update';
export type PresentEndReason = 'presenter-end' | 'editor-end' | 'session-lost';

const SESSION_ROLES: readonly PresentSessionRole[] = ['editor', 'audience', 'presenter'];
const END_REASONS: readonly PresentEndReason[] = ['presenter-end', 'editor-end', 'session-lost'];
const SNAPSHOT_REASONS: readonly PresentSnapshotReason[] = ['initial', 'update'];

export interface PresentSessionSnapshotPayload {
  /** Authoritative slide list. Hidden slides are already removed by the editor. */
  slides: PresentSlide[];
  /** Deck design model; its `slides` member is empty on the wire so slides are not duplicated. */
  presentData: PresentDocumentModel;
  /** Workspace objects a chart layout can reference. */
  embeddedObjects: WorkspaceObject[];
  index: number;
  slideId: string | null;
  /** Epoch milliseconds of the show start; every window renders the same wall-clock timer. */
  startedAt: number;
  reason: PresentSnapshotReason;
}

export interface PresentSessionGotoPayload {
  index: number;
  /** Number of click-triggered animation groups already played on the current slide. */
  clickGroupIndex: number;
  slideId: string | null;
}

interface PresentSessionBase {
  v: typeof PRESENT_SESSION_PROTOCOL_VERSION;
  session: string;
  senderId: string;
  role: PresentSessionRole;
}

export type PresentSessionMessage =
  | (PresentSessionBase & { type: 'hello' })
  | (PresentSessionBase & { type: 'snapshot'; payload: PresentSessionSnapshotPayload })
  | (PresentSessionBase & { type: 'goto'; payload: PresentSessionGotoPayload })
  | (PresentSessionBase & { type: 'black'; payload: { enabled: boolean } })
  | (PresentSessionBase & { type: 'end'; payload: { reason: PresentEndReason } })
  | (PresentSessionBase & { type: 'ping' })
  | (PresentSessionBase & { type: 'ack'; payload: { ready: boolean } });

type PresentSessionOutboundOf<Message> = Message extends PresentSessionBase
  ? Omit<Message, keyof PresentSessionBase>
  : never;

/** Message body a sender posts; the channel adds version, session, sender id and role. */
export type PresentSessionOutbound = PresentSessionOutboundOf<PresentSessionMessage>;

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const UNSAFE_ID_PATTERN = /[\u0000-\u001f]/u;

export function isPresentSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

export function presentSessionChannelName(session: string): string {
  return `${PRESENT_SESSION_CHANNEL_PREFIX}${session}`;
}

/** Random sender id; only used to suppress a window's own echo, not as a security token. */
export function createPresentSessionSenderId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `present-sender-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > maxLength) return null;
  if (UNSAFE_ID_PATTERN.test(value)) return null;
  return value;
}

function boundedCount(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) return null;
  return value;
}

function sanitizeSlides(value: unknown): PresentSlide[] | null {
  if (!Array.isArray(value) || value.length > PRESENT_SESSION_MAX_SLIDES) return null;
  const slides: PresentSlide[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const id = boundedString(entry.id, PRESENT_SESSION_MAX_SLIDE_ID_LENGTH);
    if (!id) return null;
    const title = typeof entry.title === 'string' ? entry.title.slice(0, 10_000) : '';
    slides.push({ ...(entry as unknown as PresentSlide), id, title });
  }
  return slides;
}

function sanitizeEmbeddedObjects(value: unknown): WorkspaceObject[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PRESENT_SESSION_MAX_EMBEDDED_OBJECTS) return null;
  return value.filter(isRecord) as unknown as WorkspaceObject[];
}

function sanitizePresentData(value: unknown): PresentDocumentModel | null {
  if (!isRecord(value)) return null;
  // The slide list travels in `slides`; the design model never needs its own copy on the wire.
  return { ...(value as unknown as PresentDocumentModel), slides: [] };
}

function sanitizeSnapshotPayload(value: unknown): PresentSessionSnapshotPayload | null {
  if (!isRecord(value)) return null;
  const slides = sanitizeSlides(value.slides);
  if (!slides) return null;
  const presentData = sanitizePresentData(value.presentData);
  if (!presentData) return null;
  const embeddedObjects = sanitizeEmbeddedObjects(value.embeddedObjects);
  if (!embeddedObjects) return null;
  const index = boundedCount(value.index, 1_000_000);
  if (index === null) return null;
  const slideId = value.slideId === null ? null : boundedString(value.slideId, PRESENT_SESSION_MAX_SLIDE_ID_LENGTH);
  if (value.slideId !== null && slideId === null) return null;
  const startedAt = value.startedAt;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt < 0) return null;
  const reason = value.reason;
  if (typeof reason !== 'string' || !SNAPSHOT_REASONS.includes(reason as PresentSnapshotReason)) return null;
  return { slides, presentData, embeddedObjects, index, slideId, startedAt, reason: reason as PresentSnapshotReason };
}

function sanitizeGotoPayload(value: unknown): PresentSessionGotoPayload | null {
  if (!isRecord(value)) return null;
  const index = boundedCount(value.index, 1_000_000);
  const clickGroupIndex = boundedCount(value.clickGroupIndex, 10_000);
  if (index === null || clickGroupIndex === null) return null;
  const slideId = value.slideId === null ? null : boundedString(value.slideId, PRESENT_SESSION_MAX_SLIDE_ID_LENGTH);
  if (value.slideId !== null && slideId === null) return null;
  return { index, clickGroupIndex, slideId };
}

/**
 * Total, deterministic resolution of a channel payload. Returns `null` for anything that is not a
 * complete, bounded, versioned message of the running session.
 */
export function normalizePresentSessionMessage(
  raw: unknown,
  expectedSession: string,
): PresentSessionMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== PRESENT_SESSION_PROTOCOL_VERSION) return null;
  if (typeof raw.session !== 'string' || raw.session !== expectedSession) return null;
  const senderId = boundedString(raw.senderId, 256);
  if (!senderId) return null;
  const role = raw.role;
  if (typeof role !== 'string' || !SESSION_ROLES.includes(role as PresentSessionRole)) return null;
  const base: PresentSessionBase = {
    v: PRESENT_SESSION_PROTOCOL_VERSION,
    session: expectedSession,
    senderId,
    role: role as PresentSessionRole,
  };
  const type = raw.type;
  switch (type) {
    case 'hello':
    case 'ping':
      return { ...base, type };
    case 'snapshot': {
      const payload = sanitizeSnapshotPayload(raw.payload);
      return payload ? { ...base, type, payload } : null;
    }
    case 'goto': {
      const payload = sanitizeGotoPayload(raw.payload);
      return payload ? { ...base, type, payload } : null;
    }
    case 'black': {
      if (!isRecord(raw.payload) || typeof raw.payload.enabled !== 'boolean') return null;
      return { ...base, type, payload: { enabled: raw.payload.enabled } };
    }
    case 'end': {
      if (!isRecord(raw.payload)) return null;
      const reason = raw.payload.reason;
      if (typeof reason !== 'string' || !END_REASONS.includes(reason as PresentEndReason)) return null;
      return { ...base, type, payload: { reason: reason as PresentEndReason } };
    }
    case 'ack': {
      if (!isRecord(raw.payload) || typeof raw.payload.ready !== 'boolean') return null;
      return { ...base, type, payload: { ready: raw.payload.ready } };
    }
    default:
      return null;
  }
}

/**
 * Serialization guard for a snapshot. Returns `false` when the snapshot cannot be structured-cloned
 * or exceeds the byte budget; the editor then reports the failure instead of flooding the channel.
 */
export function isPresentSnapshotSendable(payload: PresentSessionSnapshotPayload): boolean {
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length <= PRESENT_SESSION_MAX_SNAPSHOT_BYTES;
  } catch {
    return false;
  }
}
