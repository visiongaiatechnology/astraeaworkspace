// STATUS: DIAMANT VGT SUPREME — where the caret was, so a restart can put it back
//
// Paket 41 acceptance: "Ein Dokument bearbeiten, App schließen und unverändert mit
// **Cursor/Absatzinhalt** wieder öffnen."
//
// W-216: the content survives — autosave, recovery snapshots and the emergency marker all exist —
// but nothing ever stored where the caret was. `WorkspaceDocument` has no selection field, and the
// recovery session (`workspaceSession`) only records whether the last shutdown was clean. Reopening
// therefore gave back the text without the cursor.
//
// This module keeps a **non-sensitive marker** in LocalStorage, exactly like the active-document id
// next door (`vgt_active_doc_id`): a document id, a paragraph id and two offsets. It never holds
// document content — the comments in `workspaceStorageEmergency` explain why LocalStorage must not.

export interface WorkspaceCursorState {
  documentId: string;
  paragraphId: string;
  /** Selection anchor (where the selection started). */
  anchor: number;
  /** Selection head (where the caret is). */
  head: number;
  updatedAt: number;
  /**
   * W-220: the format version, **inside** the value.
   *
   * The version used to live only in the key (`vgt_writer_cursor_v1`), so a value could not say what it
   * was: a future format bump would have had to trust the key, and a value copied to another key would
   * have been read as the current shape. Optional so a marker written before this change still parses
   * (it is treated as version 1).
   */
  version?: number;
  /**
   * W-221: when this marker stops being applicable. Written on every persist; absent on an old marker,
   * which is then treated as expired rather than as infinitely fresh.
   */
  expiresAt?: number;
}

/** The format version this module writes and understands. */
export const WORKSPACE_CURSOR_VERSION = 2;

/**
 * How long a caret marker stays applicable (W-221).
 *
 * A marker that never expires is applied whenever document and paragraph ids happen to match again — after
 * a rename, a copy or a re-import that is the wrong caret in the right place. A week is long enough for
 * "close the app, continue tomorrow" and short enough that a stale marker cannot come back months later.
 */
export const WORKSPACE_CURSOR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const CURSOR_KEY = 'vgt_writer_cursor_v1';
const MAX_ID_LENGTH = 256;
const MAX_OFFSET = 10_000_000;

function isUsableId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_ID_LENGTH
    && !/[\u0000-\u001f]/u.test(value);
}

function toOffset(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  if (truncated < 0 || truncated > MAX_OFFSET) return null;
  return truncated;
}

/**
 * Reads a cursor marker back, rejecting anything that is not exactly the expected shape.
 *
 * A malformed record is treated as "no cursor" rather than as an error: the worst case is that the
 * caret starts at the beginning again, which is what happened before this module existed. A marker from a
 * **newer** version is refused as well (W-220) — pretending to understand a shape we do not know is worse
 * than starting at the beginning.
 */
export function parseWorkspaceCursor(raw: unknown): WorkspaceCursorState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!isUsableId(record.documentId) || !isUsableId(record.paragraphId)) return null;
  const anchor = toOffset(record.anchor);
  const head = toOffset(record.head);
  if (anchor === null || head === null) return null;
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
    ? Math.trunc(record.updatedAt)
    : 0;
  // An absent version is a marker from before the field existed: version 1.
  const version = typeof record.version === 'number' && Number.isFinite(record.version)
    ? Math.trunc(record.version)
    : 1;
  if (version > WORKSPACE_CURSOR_VERSION || version < 1) return null;
  const expiresAt = typeof record.expiresAt === 'number' && Number.isFinite(record.expiresAt)
    ? Math.trunc(record.expiresAt)
    : undefined;
  return {
    documentId: record.documentId,
    paragraphId: record.paragraphId,
    anchor,
    head,
    updatedAt,
    version,
    expiresAt,
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // A browser with storage disabled throws on access; a caret is not worth an exception.
    return null;
  }
}

/**
 * Stores the marker. Returns false when nothing could be stored.
 *
 * W-220/W-221: the version and the expiry are written **into** the value, so the stored record says what
 * it is and until when it counts without anyone having to know the key name.
 */
export function persistWorkspaceCursor(
  state: WorkspaceCursorState,
  options: { readonly now?: number; readonly maxAgeMs?: number } = {},
): boolean {
  const now = Number.isFinite(options.now) ? Math.trunc(options.now as number) : Date.now();
  const maxAgeMs = Number.isFinite(options.maxAgeMs) && (options.maxAgeMs as number) > 0
    ? Math.trunc(options.maxAgeMs as number)
    : WORKSPACE_CURSOR_MAX_AGE_MS;
  const parsed = parseWorkspaceCursor({
    ...state,
    version: WORKSPACE_CURSOR_VERSION,
    // `updatedAt` is the honest clock of the caret; the expiry is derived from it, not from `now`, so a
    // caller that passes an older `updatedAt` does not get a longer life than it asked for.
    updatedAt: Number.isFinite(state.updatedAt) ? state.updatedAt : now,
    expiresAt: (Number.isFinite(state.updatedAt) ? state.updatedAt : now) + maxAgeMs,
  });
  const target = storage();
  if (!parsed || !target) return false;
  try {
    // W-224: one entry per document, so the caret of the document being edited cannot be mistaken for
    // another document's. The oldest entries fall away at the ceiling, and an expired one never survives
    // a write.
    const map = readCursorMap(target);
    map[parsed.documentId] = parsed;
    const live = Object.entries(map)
      .filter(([, record]) => cursorIsFresh(record, now, maxAgeMs))
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt);
    const kept: CursorMap = {};
    for (const [documentId, record] of live.slice(0, WORKSPACE_CURSOR_MAX_DOCUMENTS)) kept[documentId] = record;
    target.setItem(CURSOR_KEY, JSON.stringify(kept));
    return true;
  } catch {
    // Quota or a read-only profile: losing the caret is acceptable, losing the document is not.
    return false;
  }
}

/**
 * The most documents whose carets are kept at once (W-224).
 *
 * The autosave persists every dirty document; storing the caret of only the last edited one meant the
 * caret of document A could be applied to document B when the ids happened to line up. This is the
 * ceiling on the map that replaces it.
 */
export const WORKSPACE_CURSOR_MAX_DOCUMENTS = 32;

/** The stored shape: one record per document id. */
type CursorMap = Record<string, WorkspaceCursorState>;

function readCursorMap(target: Storage): CursorMap {
  const raw = target.getItem(CURSOR_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  // W-224 migration: a record written before this change is a **single** cursor, not a map. It is
  // recognised by its own shape and moved under its document id, so nobody loses a caret on upgrade.
  const single = parseWorkspaceCursor(parsed);
  if (single) return { [single.documentId]: single };
  if (typeof parsed !== 'object' || parsed === null) return {};
  const map: CursorMap = {};
  for (const [documentId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const record = parseWorkspaceCursor(value);
    if (record && record.documentId === documentId) map[documentId] = record;
  }
  return map;
}

function cursorIsFresh(record: WorkspaceCursorState, now: number, maxAgeMs: number): boolean {
  // A marker without an expiry is from before that field existed; it is judged by its own clock rather
  // than trusted forever, which is the whole point of W-221. An injected `maxAgeMs` **shortens** the
  // window rather than being ignored: the stricter of the two rules wins, so a caller cannot widen the
  // default by accident and a test can close it deterministically.
  const storedExpiry = record.expiresAt ?? record.updatedAt + WORKSPACE_CURSOR_MAX_AGE_MS;
  const requestedExpiry = record.updatedAt + maxAgeMs;
  return Math.min(storedExpiry, requestedExpiry) > now;
}

/**
 * Reads one document's caret back, refusing one that has expired (W-221).
 *
 * `documentId` is optional **only** for compatibility: without it the newest live caret is returned, which
 * is what the single-cursor version did. Every caller inside the application passes the document it is
 * opening (W-224), because that is the only way the answer can be about the right document.
 *
 * `now` and `maxAgeMs` are injectable so the expiry is testable without waiting a week.
 */
export function readWorkspaceCursor(
  documentId?: string,
  options: { readonly now?: number; readonly maxAgeMs?: number } = {},
): WorkspaceCursorState | null {
  const target = storage();
  if (!target) return null;
  try {
    const map = readCursorMap(target);
    const now = Number.isFinite(options.now) ? Math.trunc(options.now as number) : Date.now();
    const maxAgeMs = Number.isFinite(options.maxAgeMs) && (options.maxAgeMs as number) > 0
      ? Math.trunc(options.maxAgeMs as number)
      : WORKSPACE_CURSOR_MAX_AGE_MS;
    if (documentId !== undefined) {
      const record = map[documentId];
      if (!record) return null;
      return cursorIsFresh(record, now, maxAgeMs) ? record : null;
    }
    // No id: the newest live caret, which keeps the previous single-cursor behaviour meaningful.
    const live = Object.values(map).filter((record) => cursorIsFresh(record, now, maxAgeMs));
    if (live.length === 0) return null;
    return live.reduce((newest, record) => (record.updatedAt > newest.updatedAt ? record : newest));
  } catch {
    return null;
  }
}

/** Drops one document's caret — or every caret when no id is given. */
export function clearWorkspaceCursor(documentId?: string): void {
  const target = storage();
  if (!target) return;
  try {
    if (documentId === undefined) {
      target.removeItem(CURSOR_KEY);
      return;
    }
    const map = readCursorMap(target);
    // W-217: this used to remove the marker only when it belonged to the document being cleared, so the
    // marker of a **deleted** document stayed behind. Per-document removal is now what it says.
    if (!(documentId in map)) return;
    delete map[documentId];
    if (Object.keys(map).length === 0) {
      target.removeItem(CURSOR_KEY);
      return;
    }
    target.setItem(CURSOR_KEY, JSON.stringify(map));
  } catch {
    // Nothing to do: a stale marker is rejected on read anyway.
  }
}

/** Drops every expired caret (W-221/W-224), so a long-lived session does not accumulate them. */
export function pruneWorkspaceCursors(options: { readonly now?: number; readonly maxAgeMs?: number } = {}): number {
  const target = storage();
  if (!target) return 0;
  try {
    const map = readCursorMap(target);
    const now = Number.isFinite(options.now) ? Math.trunc(options.now as number) : Date.now();
    const maxAgeMs = Number.isFinite(options.maxAgeMs) && (options.maxAgeMs as number) > 0
      ? Math.trunc(options.maxAgeMs as number)
      : WORKSPACE_CURSOR_MAX_AGE_MS;
    let removed = 0;
    for (const [documentId, record] of Object.entries(map)) {
      if (!cursorIsFresh(record, now, maxAgeMs)) {
        delete map[documentId];
        removed += 1;
      }
    }
    if (removed > 0) {
      if (Object.keys(map).length === 0) target.removeItem(CURSOR_KEY);
      else target.setItem(CURSOR_KEY, JSON.stringify(map));
    }
    return removed;
  } catch {
    return 0;
  }
}

export interface WriterCursorRestore {
  paragraphId: string;
  start: number;
  end: number;
}

/**
 * Why a stored caret was **not** applied (W-225).
 *
 * The restore used to answer "null" for every case. An unannounced failure and an unannounced success are
 * the same disease from the user's side: either way nobody knows whether the caret came back. The reason
 * is coarse on purpose — it must not carry a paragraph's text or a path — but it is enough for the
 * surface to say something true.
 */
export type WriterCursorRestoreDecline =
  /** There was no marker at all. */
  | 'no-marker'
  /** The marker belongs to another document. */
  | 'other-document'
  /** The marker's paragraph no longer exists in this document. */
  | 'paragraph-missing'
  /** The marker was older than the applicable window (W-221) or had already been refused on read. */
  | 'expired-or-unreadable';

export type WriterCursorRestoreDecision =
  | { readonly restored: true; readonly restore: WriterCursorRestore }
  | { readonly restored: false; readonly reason: WriterCursorRestoreDecline };

/**
 * Decides whether a stored cursor may be applied to the document that is open now, **and says why not**
 * when it may not (W-225).
 *
 * Everything is checked before anything is restored, because a caret pointing at a paragraph that no
 * longer exists — or past the end of a shortened paragraph — must not throw and must not silently select
 * the wrong text.
 */
export function resolveWriterCursorRestoreDecision(
  cursor: WorkspaceCursorState | null,
  documentId: string,
  paragraphs: readonly { id: string; spans: readonly { text: string }[] }[],
): WriterCursorRestoreDecision {
  if (!cursor) return { restored: false, reason: 'no-marker' };
  if (cursor.documentId !== documentId) return { restored: false, reason: 'other-document' };
  // A marker whose window has closed is a marker, not a cursor: `readWorkspaceCursor` already refuses one,
  // but this function is also reachable with a value a caller kept in memory.
  const expiresAt = cursor.expiresAt;
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return { restored: false, reason: 'expired-or-unreadable' };
  }
  const paragraph = paragraphs.find((candidate) => candidate.id === cursor.paragraphId);
  if (!paragraph) return { restored: false, reason: 'paragraph-missing' };
  const length = paragraph.spans.reduce((sum, span) => sum + span.text.length, 0);
  const start = Math.min(cursor.anchor, length);
  const end = Math.min(cursor.head, length);
  return {
    restored: true,
    restore: {
      paragraphId: cursor.paragraphId,
      start: Math.min(start, end),
      end: Math.max(start, end),
    },
  };
}

/**
 * The previous answer, unchanged for every existing caller: the caret or `null`.
 *
 * Kept as the compatible signature; `resolveWriterCursorRestoreDecision` is the same decision with the
 * reason attached, and this function is a thin projection of it so the two can never disagree.
 */
export function resolveWriterCursorRestore(
  cursor: WorkspaceCursorState | null,
  documentId: string,
  paragraphs: readonly { id: string; spans: readonly { text: string }[] }[],
): WriterCursorRestore | null {
  const decision = resolveWriterCursorRestoreDecision(cursor, documentId, paragraphs);
  return decision.restored ? decision.restore : null;
}
