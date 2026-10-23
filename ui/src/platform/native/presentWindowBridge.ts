// STATUS: PLATIN — bounded Present multi-monitor display bridge (Runde 42).
//
// The editor window uses this bridge to enumerate monitors and to open/close the projector
// ("audience") and presenter display windows on the monitor the user picked. Everything here is
// optional: in a browser or test environment `listPresentMonitors` returns an empty list and the
// presentation flow falls back to the single-screen presenter mode.
import { invokeNative, isNativeDesktop } from './nativeBridge';

export interface PresentMonitorInfo {
  readonly index: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly scaleFactor: number;
  readonly primary: boolean;
}

export type PresentDisplayRole = 'audience' | 'presenter';

export interface PresentDisplayHandle {
  readonly role: PresentDisplayRole;
  readonly label: string;
  readonly session: string;
}

const MAX_PRESENT_MONITORS = 16;
const MAX_SESSION_LENGTH = 64;
const ROLE_LABEL_PATTERN = /^present-(?:audience|presenter)$/u;
const SESSION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

export function presentDisplayAvailable(): boolean {
  return isNativeDesktop();
}

/** Session identifier that both display windows and the editor use for their BroadcastChannel. */
export function createPresentSessionId(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `present-${stamp}-${random}`.slice(0, MAX_SESSION_LENGTH);
}

function safeString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function sanitizeMonitor(raw: unknown, fallbackIndex: number): PresentMonitorInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const width = typeof record.width === 'number' && Number.isFinite(record.width) ? record.width : null;
  const height = typeof record.height === 'number' && Number.isFinite(record.height) ? record.height : null;
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  return {
    index: typeof record.index === 'number' && Number.isInteger(record.index) ? record.index : fallbackIndex,
    name: safeString(record.name, 128) ?? `Display ${fallbackIndex + 1}`,
    width,
    height,
    x: typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : 0,
    y: typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : 0,
    scaleFactor: typeof record.scale_factor === 'number' && Number.isFinite(record.scale_factor) && record.scale_factor > 0
      ? record.scale_factor
      : 1,
    primary: record.primary === true,
  };
}

export async function listPresentMonitors(): Promise<PresentMonitorInfo[]> {
  if (!isNativeDesktop()) return [];
  try {
    const raw = await invokeNative<unknown>('vgt_present_monitors');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry, index) => sanitizeMonitor(entry, index))
      .filter((entry): entry is PresentMonitorInfo => entry !== null)
      .slice(0, MAX_PRESENT_MONITORS);
  } catch {
    return [];
  }
}

function assertRole(role: string): asserts role is PresentDisplayRole {
  if (role !== 'audience' && role !== 'presenter') throw new Error('Present display role is invalid');
}

function assertSession(session: string): void {
  if (!SESSION_PATTERN.test(session)) throw new Error('Present display session is invalid');
}

function assertMonitorIndex(monitorIndex: number): void {
  if (!Number.isInteger(monitorIndex) || monitorIndex < 0 || monitorIndex >= MAX_PRESENT_MONITORS) {
    throw new Error('Present display monitor is invalid');
  }
}

/**
 * Opens one display window on the selected monitor. The caller creates the session once and
 * passes the same identifier for the audience and presenter windows so both join one channel.
 */
export async function openPresentDisplay(
  role: PresentDisplayRole,
  monitorIndex: number,
  session: string,
): Promise<PresentDisplayHandle | null> {
  if (!isNativeDesktop()) return null;
  assertRole(role);
  assertMonitorIndex(monitorIndex);
  assertSession(session);
  const label = await invokeNative<unknown>('vgt_present_open_display', {
    request: { role, monitor_index: monitorIndex, session },
  });
  const safeLabel = safeString(label, 64);
  if (!safeLabel || !ROLE_LABEL_PATTERN.test(safeLabel)) {
    throw new Error('Present display window returned an invalid label');
  }
  return { role, label: safeLabel, session };
}

export async function closePresentDisplay(role: PresentDisplayRole): Promise<void> {
  if (!isNativeDesktop()) return;
  assertRole(role);
  try {
    await invokeNative('vgt_present_close_display', { request: { role } });
  } catch {
    // Closing a display that is already gone is not an error for the caller.
  }
}
