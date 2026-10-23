// STATUS: PLATIN — BATCH-CONNECT-6: notifications and focus, as pure rules over real events.
//
// MEASURED GAP before this batch: Connect had no notification surface at all — a new mail or an upcoming
// event produced nothing, and `ConnectDocumentModel` had no field to hold one. The requirement is
// explicitly "angemessen anzeigen, nicht als Dauer-Popup", so the rules here are:
//  - an event produces *at most one* notification, de-duplicated by a stable key;
//  - quiet hours put a notification into the bounded tray as `suppressed`, it is never shown as a popup;
//  - the tray is bounded and can be drained, so nothing accumulates forever.

import type { ConnectFocusState, ConnectNotification } from './types';

export class ConnectNotificationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectNotificationError';
  }
}

export const CONNECT_NOTIFICATION_LIMITS = {
  maxTray: 500,
  maxArgs: 16,
  maxArgChars: 512,
} as const;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse `HH:MM` into minutes since midnight; `undefined` when the value is not a valid time. */
export function parseClockMinutes(value: string): number | undefined {
  const match = TIME.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateFocusState(focus: ConnectFocusState): ConnectFocusState {
  const from = parseClockMinutes(focus.quietFrom);
  const to = parseClockMinutes(focus.quietTo);
  if (from === undefined || to === undefined) throw new ConnectNotificationError('focus-time-invalid');
  return { ...focus };
}

/** Is `at` inside the quiet window? A window that wraps midnight is handled explicitly. */
export function isQuietAt(focus: ConnectFocusState, at: Date | number): boolean {
  const date = typeof at === 'number' ? new Date(at) : at;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const from = parseClockMinutes(focus.quietFrom);
  const to = parseClockMinutes(focus.quietTo);
  if (from === undefined || to === undefined) throw new ConnectNotificationError('focus-time-invalid');
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

export interface ConnectNotificationInput {
  readonly kind: ConnectNotification['kind'];
  readonly code: string;
  /** Stable identity of the underlying event, used for de-duplication. */
  readonly dedupeKey: string;
  readonly args?: Record<string, string | number>;
  /** When the underlying event happened; defaults to `now`. */
  readonly at?: number;
  /** Calendar alerts may be switched off independently. */
  readonly allowCalendar?: boolean;
}

function sanitizeArgs(args: Record<string, string | number> | undefined): Record<string, string | number> | undefined {
  if (!args) return undefined;
  const entries = Object.entries(args).slice(0, CONNECT_NOTIFICATION_LIMITS.maxArgs);
  const out: Record<string, string | number> = {};
  for (const [key, value] of entries) {
    if (key.length > 64) continue;
    out[key] = typeof value === 'string' ? value.slice(0, CONNECT_NOTIFICATION_LIMITS.maxArgChars) : value;
  }
  return out;
}

export interface ConnectNotificationOutcome {
  readonly tray: ConnectNotification[];
  /** The notification that may be *shown* right now; `undefined` when it is suppressed. */
  readonly surfaced?: ConnectNotification;
  readonly reason: 'shown' | 'duplicate' | 'quiet-hours' | 'focus-disabled' | 'tray-limit';
}

/**
 * Add one notification to the tray. A duplicate (same kind + dedupeKey, unread) is not added again, so
 * the same mail cannot produce a permanent popup loop.
 *
 * `focus.badgeEnabled` controls the *badge counter* only. A notification outside quiet hours is always
 * surfaced in the bounded tray; it is never reduced to a permanent popup, but it is also never lost
 * merely because the badge is switched off.
 */
export function pushNotification(
  tray: readonly ConnectNotification[],
  input: ConnectNotificationInput,
  focus: ConnectFocusState,
  now = Date.now(),
): ConnectNotificationOutcome {
  validateFocusState(focus);
  if (input.kind === 'calendar' && (input.allowCalendar === false || !focus.calendarAlertsEnabled)) {
    return { tray: [...tray], reason: 'focus-disabled' };
  }
  const dedupeValue = `${input.kind}:${input.dedupeKey}`;
  // De-duplication compares `kind` + the stable key. The stored `args.dedupeKey` is the raw key, so the
  // comparison is symmetric — prefixing it twice here was a real defect the test below caught.
  if (tray.some((entry) => !entry.readAt && `${entry.kind}:${String(entry.args?.dedupeKey ?? '')}` === dedupeValue)) {
    return { tray: [...tray], reason: 'duplicate' };
  }
  const at = input.at ?? now;
  const quiet = isQuietAt(focus, at);
  const notification: ConnectNotification = {
    id: `${dedupeValue}:${at}`,
    kind: input.kind,
    code: input.code,
    args: { ...(sanitizeArgs(input.args) ?? {}), dedupeKey: input.dedupeKey },
    createdAt: at,
    suppressed: quiet ? true : undefined,
  };
  if (tray.length >= CONNECT_NOTIFICATION_LIMITS.maxTray) {
    // Oldest *read* entry is dropped first; when everything is unread the tray refuses new entries
    // instead of silently discarding one the user has not seen.
    const readIndex = tray.findIndex((entry) => entry.readAt);
    if (readIndex === -1) return { tray: [...tray], reason: 'tray-limit' };
    const next = [...tray];
    next.splice(readIndex, 1);
    next.push(notification);
    return { tray: next, surfaced: quiet ? undefined : notification, reason: quiet ? 'quiet-hours' : 'shown' };
  }
  return {
    tray: [...tray, notification],
    surfaced: quiet ? undefined : notification,
    reason: quiet ? 'quiet-hours' : 'shown',
  };
}

/** How many notifications may be shown as a badge/banner. Never the whole tray. */
export function surfacedNotifications(tray: readonly ConnectNotification[], limit = 5): ConnectNotification[] {
  return tray.filter((entry) => !entry.readAt && !entry.suppressed).slice(0, Math.max(0, Math.min(20, limit)));
}

export function suppressedCount(tray: readonly ConnectNotification[]): number {
  return tray.filter((entry) => !entry.readAt && entry.suppressed).length;
}

export function markNotificationRead(tray: readonly ConnectNotification[], id: string, now = Date.now()): ConnectNotification[] {
  if (!tray.some((entry) => entry.id === id)) throw new ConnectNotificationError('notification-unknown');
  return tray.map((entry) => (entry.id === id ? { ...entry, readAt: now } : entry));
}

export function markAllNotificationsRead(tray: readonly ConnectNotification[], now = Date.now()): ConnectNotification[] {
  return tray.map((entry) => (entry.readAt ? entry : { ...entry, readAt: now }));
}

/** Drain the tray, keeping the newest `keep` entries. Bounded by the limit. */
export function pruneNotifications(tray: readonly ConnectNotification[], keep = 50): ConnectNotification[] {
  const bounded = Math.max(0, Math.min(CONNECT_NOTIFICATION_LIMITS.maxTray, keep));
  return tray.slice(-bounded);
}
