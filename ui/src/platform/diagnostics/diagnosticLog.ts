// STATUS: DIAMANT VGT SUPREME — local-only structured diagnostic ring buffer.
import { redactDiagnosticText, sanitizeDiagnosticValue } from './diagnosticsRedaction';

export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticLogEntry {
  sequence: number;
  timestamp: string;
  level: DiagnosticLogLevel;
  component: string;
  event_id: string;
  message: string;
  crash_id?: string;
  context?: unknown;
}

export const DIAGNOSTIC_RING_CAPACITY = 128;
export const DIAGNOSTIC_EXPORT_LOG_LIMIT = 64;
export const DIAGNOSTIC_DEBUG_MAX_MS = 30 * 60 * 1000;
const DIAGNOSTIC_DEBUG_STORAGE_KEY = 'astraea.workspace.diagnostics.debug-until.v1';
const DIAGNOSTIC_STORAGE_KEY = 'astraea.workspace.diagnostics.ring.v1';
const MAX_SERIALIZED_RING_BYTES = 128 * 1024;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
let inMemoryRing: DiagnosticLogEntry[] = [];
let sequenceCounter = 0;
let crashCaptureInstalled = false;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function boundedUtf8ByteLength(value: string, maxBytes: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x7f) bytes += 1;
    else if (unit <= 0x7ff) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes > maxBytes) return maxBytes + 1;
  }
  return bytes;
}


export interface DiagnosticDebugModeState { enabled: boolean; enabledUntilMs: number | null; }

export function diagnosticDebugModeState(nowMs = Date.now()): DiagnosticDebugModeState {
  if (!hasLocalStorage()) return { enabled: false, enabledUntilMs: null };
  try {
    const raw = sessionStorage.getItem(DIAGNOSTIC_DEBUG_STORAGE_KEY);
    const deadline = raw ? Number(raw) : 0;
    if (!Number.isFinite(deadline) || deadline <= nowMs || deadline > nowMs + DIAGNOSTIC_DEBUG_MAX_MS) {
      sessionStorage.removeItem(DIAGNOSTIC_DEBUG_STORAGE_KEY);
      return { enabled: false, enabledUntilMs: null };
    }
    return { enabled: true, enabledUntilMs: Math.trunc(deadline) };
  } catch { return { enabled: false, enabledUntilMs: null }; }
}

export function setLocalDiagnosticDebugMode(enabled: boolean, durationMs = 15 * 60 * 1000, nowMs = Date.now()): DiagnosticDebugModeState {
  if (!hasLocalStorage()) return { enabled: false, enabledUntilMs: null };
  try {
    if (!enabled) { sessionStorage.removeItem(DIAGNOSTIC_DEBUG_STORAGE_KEY); return { enabled: false, enabledUntilMs: null }; }
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > DIAGNOSTIC_DEBUG_MAX_MS) throw new Error('DIAGNOSTIC_DEBUG_DURATION_REJECTED');
    const deadline = Math.trunc(nowMs + durationMs);
    sessionStorage.setItem(DIAGNOSTIC_DEBUG_STORAGE_KEY, String(deadline));
    return { enabled: true, enabledUntilMs: deadline };
  } catch (error) {
    if (error instanceof Error && error.message === 'DIAGNOSTIC_DEBUG_DURATION_REJECTED') throw error;
    return { enabled: false, enabledUntilMs: null };
  }
}

function loadPersistedRing(): DiagnosticLogEntry[] {
  if (inMemoryRing.length > 0) return inMemoryRing;
  if (!hasLocalStorage()) return inMemoryRing;
  try {
    const raw = localStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
    if (!raw || typeof raw !== 'string' || boundedUtf8ByteLength(raw, MAX_SERIALIZED_RING_BYTES) > MAX_SERIALIZED_RING_BYTES) return inMemoryRing;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return inMemoryRing;
    if (parsed.length > 1_000_000) return inMemoryRing;
    const sequences = new Set<number>();
    inMemoryRing = [];
    for (const entry of parsed.slice(-DIAGNOSTIC_RING_CAPACITY)) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<DiagnosticLogEntry>;
      if (!Number.isSafeInteger(candidate.sequence) || (candidate.sequence as number) < 1
        || typeof candidate.timestamp !== 'string' || typeof candidate.level !== 'string'
        || typeof candidate.component !== 'string' || typeof candidate.event_id !== 'string'
        || typeof candidate.message !== 'string') continue;
      const sequence = candidate.sequence as number;
      if (sequences.has(sequence)) continue;
      sequences.add(sequence);
      inMemoryRing.push({
        sequence,
        timestamp: candidate.timestamp.slice(0, 64),
        level: candidate.level === 'debug' || candidate.level === 'info' || candidate.level === 'warn' || candidate.level === 'error' ? candidate.level : 'info',
        component: normalizeLabel(candidate.component, 'workspace'),
        event_id: normalizeLabel(candidate.event_id, 'UNSPECIFIED'),
        message: redactDiagnosticText(candidate.message),
        ...(candidate.crash_id ? { crash_id: normalizeLabel(candidate.crash_id, 'crash_unknown') } : {}),
        ...(candidate.context !== undefined ? { context: sanitizeDiagnosticValue(candidate.context) } : {}),
      });
    }
    sequenceCounter = inMemoryRing.reduce((max, entry) => Math.max(max, entry.sequence), 0);
  } catch {
    inMemoryRing = [];
  }
  return inMemoryRing;
}

function persistRing(): void {
  if (!hasLocalStorage()) return;
  try {
    let candidate = inMemoryRing.slice(-DIAGNOSTIC_RING_CAPACITY);
    let serialized = JSON.stringify(candidate);
    while (boundedUtf8ByteLength(serialized, MAX_SERIALIZED_RING_BYTES) > MAX_SERIALIZED_RING_BYTES && candidate.length > 0) {
      const contextIndex = candidate.findIndex((entry) => entry.context !== undefined);
      if (contextIndex >= 0) {
        candidate = candidate.map((entry, index) => index === contextIndex
          ? { ...entry, context: '[TRUNCATED_STORAGE_LIMIT]' }
          : entry);
        serialized = JSON.stringify(candidate);
        continue;
      }
      candidate = candidate.slice(Math.ceil(candidate.length / 4));
      serialized = JSON.stringify(candidate);
    }
    localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, serialized);
  } catch {
    // Diagnostics must never break the application when browser storage is unavailable or full.
  }
}

function normalizeLabel(value: string, fallback: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 96);
  return sanitized || fallback;
}

export function writeDiagnosticLog(input: {
  level: DiagnosticLogLevel;
  component: string;
  eventId: string;
  message: string;
  crashId?: string;
  context?: unknown;
  now?: Date;
}): DiagnosticLogEntry | null {
  if (input.level === 'debug' && !diagnosticDebugModeState((input.now ?? new Date()).getTime()).enabled) return null;
  let ring = loadPersistedRing();
  if (sequenceCounter >= MAX_SEQUENCE) {
    ring = ring.map((entry, index) => ({ ...entry, sequence: index + 1 }));
    inMemoryRing = ring;
    sequenceCounter = ring.length;
  }
  const entry: DiagnosticLogEntry = {
    sequence: ++sequenceCounter,
    timestamp: (input.now ?? new Date()).toISOString(),
    level: input.level,
    component: normalizeLabel(input.component, 'workspace'),
    event_id: normalizeLabel(input.eventId, 'UNSPECIFIED'),
    message: redactDiagnosticText(input.message),
  };
  if (input.crashId) entry.crash_id = normalizeLabel(input.crashId, 'crash_unknown');
  if (input.context !== undefined) entry.context = sanitizeDiagnosticValue(input.context);
  ring.push(entry);
  inMemoryRing = ring.slice(-DIAGNOSTIC_RING_CAPACITY);
  persistRing();
  return entry;
}

function randomCrashSuffix(randomBytes?: Uint8Array): string {
  const bytes = randomBytes ?? (() => {
    const generated = new Uint8Array(6);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(generated);
      return generated;
    }
    const fallback = Date.now().toString(16).padStart(12, '0').slice(-12);
    return Uint8Array.from(fallback.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [0, 0, 0, 0, 0, 0]);
  })();
  return Array.from(bytes.slice(0, 6), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createCrashId(nowMs = Date.now(), randomBytes?: Uint8Array): string {
  return `crash_${Math.max(0, Math.trunc(nowMs)).toString(36)}_${randomCrashSuffix(randomBytes)}`;
}

export function recordDiagnosticCrash(error: unknown, component = 'workspace-ui', now = new Date()): string {
  const crashId = createCrashId(now.getTime());
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  writeDiagnosticLog({
    level: 'error',
    component,
    eventId: 'UNHANDLED_CRASH',
    message,
    crashId,
    now,
  });
  return crashId;
}

export function listDiagnosticLogs(limit = DIAGNOSTIC_EXPORT_LOG_LIMIT): DiagnosticLogEntry[] {
  const bounded = Number.isFinite(limit)
    ? Math.max(0, Math.min(Math.trunc(limit), DIAGNOSTIC_RING_CAPACITY))
    : 0;
  if (bounded === 0) return [];
  return loadPersistedRing().slice(-bounded).map((entry) => ({ ...entry }));
}

export function latestCrashId(): string | null {
  const logs = loadPersistedRing();
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    if (logs[index].crash_id) return logs[index].crash_id ?? null;
  }
  return null;
}

export function clearDiagnosticLogs(): void {
  inMemoryRing = [];
  sequenceCounter = 0;
  if (!hasLocalStorage()) return;
  try { localStorage.removeItem(DIAGNOSTIC_STORAGE_KEY); } catch { /* local-only best effort */ }
}

export function installDiagnosticCrashCapture(): () => void {
  if (typeof window === 'undefined' || crashCaptureInstalled) return () => undefined;
  crashCaptureInstalled = true;
  const errorHandler = (event: ErrorEvent) => {
    recordDiagnosticCrash(event.error ?? event.message, 'workspace-window');
  };
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    recordDiagnosticCrash(event.reason, 'workspace-promise');
  };
  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);
  writeDiagnosticLog({ level: 'info', component: 'diagnostics', eventId: 'CRASH_CAPTURE_READY', message: 'Local crash capture initialized.' });
  return () => {
    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', rejectionHandler);
    crashCaptureInstalled = false;
  };
}
