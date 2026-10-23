// STATUS: DIAMANT — the caret marker's version, its lifetime and its refusal reasons
//
// Three findings, one marker:
//   W-220  the format version lived only in the key name, so a value could not say what it was
//   W-221  the marker never expired: an old marker was applied whenever the ids happened to match again
//   W-225  the restore answered `null` for every refusal, so an unannounced failure and an unannounced
//          success looked the same to the user
//
// The clock is injected everywhere, so "a week later" is a test and not a wait.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearWorkspaceCursor,
  parseWorkspaceCursor,
  persistWorkspaceCursor,
  pruneWorkspaceCursors,
  readWorkspaceCursor,
  resolveWriterCursorRestore,
  resolveWriterCursorRestoreDecision,
  WORKSPACE_CURSOR_MAX_AGE_MS,
  WORKSPACE_CURSOR_MAX_DOCUMENTS,
  WORKSPACE_CURSOR_VERSION,
  type WorkspaceCursorState,
} from '../../../platform/workspace/persistence/workspaceCursorState';

const NOW = 1_700_000_000_000;

function cursor(overrides: Partial<WorkspaceCursorState> = {}): WorkspaceCursorState {
  return { documentId: 'doc-1', paragraphId: 'p2', anchor: 3, head: 9, updatedAt: NOW, ...overrides };
}

const paragraphs = [{ id: 'p1', spans: [{ text: 'Erster' }] }, { id: 'p2', spans: [{ text: 'Zweiter Absatz' }] }];

function installStorage(): { store: Map<string, string>; restore: () => void } {
  const store = new Map<string, string>();
  const original = (globalThis as { localStorage?: unknown }).localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  });
  return {
    store,
    restore: () => {
      if (original === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    },
  };
}

describe('W-220 — the value says what it is', () => {
  it('writes the version and the expiry into the record', () => {
    const storage = installStorage();
    try {
      persistWorkspaceCursor(cursor(), { now: NOW });
      // W-224: the stored value is a map of document id to record, so several documents keep their caret.
      const raw = JSON.parse(storage.store.get('vgt_writer_cursor_v1')!) as Record<string, Record<string, unknown>>;
      expect(raw['doc-1']!.version).toBe(WORKSPACE_CURSOR_VERSION);
      expect(raw['doc-1']!.expiresAt).toBe(NOW + WORKSPACE_CURSOR_MAX_AGE_MS);
    } finally {
      storage.restore();
    }
  });

  it('treats a record without a version as version 1, so an old marker still parses', () => {
    const parsed = parseWorkspaceCursor({ documentId: 'd', paragraphId: 'p', anchor: 1, head: 2, updatedAt: 5 });
    expect(parsed?.version).toBe(1);
    expect(parsed?.expiresAt).toBeUndefined();
  });

  it('refuses a record from a newer version instead of guessing it', () => {
    // Pretending to understand an unknown shape is worse than starting at the beginning.
    expect(parseWorkspaceCursor({
      documentId: 'd', paragraphId: 'p', anchor: 1, head: 2, updatedAt: 5,
      version: WORKSPACE_CURSOR_VERSION + 1,
    })).toBeNull();
    expect(parseWorkspaceCursor({
      documentId: 'd', paragraphId: 'p', anchor: 1, head: 2, updatedAt: 5, version: 0,
    })).toBeNull();
  });
});

describe('W-221 — the marker has a lifetime', () => {
  let storage: ReturnType<typeof installStorage>;
  beforeEach(() => { storage = installStorage(); });
  afterEach(() => { storage.restore(); });

  it('reads back inside the window and refuses outside it', () => {
    persistWorkspaceCursor(cursor(), { now: NOW });
    expect(readWorkspaceCursor('doc-1', { now: NOW })).not.toBeNull();
    expect(readWorkspaceCursor('doc-1', { now: NOW + WORKSPACE_CURSOR_MAX_AGE_MS - 1 })).not.toBeNull();
    // Exactly at the expiry it is already too old — "until then" excludes the boundary.
    expect(readWorkspaceCursor('doc-1', { now: NOW + WORKSPACE_CURSOR_MAX_AGE_MS })).toBeNull();
    expect(readWorkspaceCursor('doc-1', { now: NOW + WORKSPACE_CURSOR_MAX_AGE_MS + 1 })).toBeNull();
  });

  it('judges an old marker without an expiry by its own clock, not as infinitely fresh', () => {
    // A marker written before the field existed: applied while recent, refused when ancient.
    storage.store.set('vgt_writer_cursor_v1', JSON.stringify({
      documentId: 'doc-1', paragraphId: 'p2', anchor: 3, head: 9, updatedAt: NOW,
    }));
    expect(readWorkspaceCursor('doc-1', { now: NOW + 1_000 })).not.toBeNull();
    expect(readWorkspaceCursor('doc-1', { now: NOW + WORKSPACE_CURSOR_MAX_AGE_MS + 1 })).toBeNull();
  });

  it('lets a caller shorten the window without changing the default', () => {
    persistWorkspaceCursor(cursor(), { now: NOW });
    expect(readWorkspaceCursor('doc-1', { now: NOW + 60_000, maxAgeMs: 30_000 })).toBeNull();
    expect(readWorkspaceCursor('doc-1', { now: NOW + 60_000 })).not.toBeNull();
  });

  it('derives the expiry from the caret clock, not from the caller clock', () => {
    // A caller that passes an older `updatedAt` does not thereby buy a longer life.
    persistWorkspaceCursor(cursor({ updatedAt: NOW - 1_000 }), { now: NOW });
    expect(readWorkspaceCursor('doc-1', { now: NOW - 1_000 + WORKSPACE_CURSOR_MAX_AGE_MS })).toBeNull();
  });
});

describe('W-224 — several documents keep their own caret', () => {
  let storage: ReturnType<typeof installStorage>;
  beforeEach(() => { storage = installStorage(); });
  afterEach(() => { storage.restore(); });

  it('answers about the document that was asked for, not the last one written', () => {
    persistWorkspaceCursor(cursor({ documentId: 'doc-a', paragraphId: 'pa', anchor: 1, head: 1 }), { now: NOW });
    persistWorkspaceCursor(cursor({ documentId: 'doc-b', paragraphId: 'pb', anchor: 2, head: 2 }), { now: NOW + 1 });
    expect(readWorkspaceCursor('doc-a', { now: NOW + 1 })?.paragraphId).toBe('pa');
    expect(readWorkspaceCursor('doc-b', { now: NOW + 1 })?.paragraphId).toBe('pb');
    // This is the finding: before this change only `doc-b` was stored and `doc-a` would have been
    // served `doc-b`'s caret whenever the ids happened to line up.
    expect(readWorkspaceCursor('doc-c', { now: NOW + 1 })).toBeNull();
  });

  it('migrates a single-cursor record from the previous format', () => {
    // A value written before this change: one record, not a map. Nobody loses a caret on upgrade.
    storage.store.set('vgt_writer_cursor_v1', JSON.stringify({
      documentId: 'doc-1', paragraphId: 'p2', anchor: 3, head: 9, updatedAt: NOW, version: 1,
    }));
    expect(readWorkspaceCursor('doc-1', { now: NOW + 1 })?.paragraphId).toBe('p2');
    // And it survives the next write as a proper map.
    persistWorkspaceCursor(cursor({ documentId: 'doc-2' }), { now: NOW + 2 });
    expect(readWorkspaceCursor('doc-1', { now: NOW + 2 })?.paragraphId).toBe('p2');
    expect(readWorkspaceCursor('doc-2', { now: NOW + 2 })?.paragraphId).toBe('p2');
  });

  it('clears one document without touching another (W-217)', () => {
    persistWorkspaceCursor(cursor({ documentId: 'doc-a' }), { now: NOW });
    persistWorkspaceCursor(cursor({ documentId: 'doc-b' }), { now: NOW });
    clearWorkspaceCursor('doc-a');
    expect(readWorkspaceCursor('doc-a', { now: NOW })).toBeNull();
    expect(readWorkspaceCursor('doc-b', { now: NOW })).not.toBeNull();
  });

  it('bounds how many documents are kept, dropping the oldest', () => {
    for (let index = 0; index < WORKSPACE_CURSOR_MAX_DOCUMENTS + 3; index += 1) {
      persistWorkspaceCursor(cursor({ documentId: `doc-${index}`, updatedAt: NOW + index }), { now: NOW + index });
    }
    const raw = JSON.parse(storage.store.get('vgt_writer_cursor_v1')!) as Record<string, unknown>;
    expect(Object.keys(raw)).toHaveLength(WORKSPACE_CURSOR_MAX_DOCUMENTS);
    // The oldest three are gone; the newest is there.
    expect(raw['doc-0']).toBeUndefined();
    expect(raw[`doc-${WORKSPACE_CURSOR_MAX_DOCUMENTS + 2}`]).toBeDefined();
  });

  it('drops expired entries on write instead of carrying them along', () => {
    persistWorkspaceCursor(cursor({ documentId: 'old', updatedAt: NOW }), { now: NOW });
    // A week and a day later a new document is edited: the ancient caret must not survive the write.
    const later = NOW + WORKSPACE_CURSOR_MAX_AGE_MS + 86_400_000;
    persistWorkspaceCursor(cursor({ documentId: 'new', updatedAt: later }), { now: later });
    expect(readWorkspaceCursor('old', { now: later })).toBeNull();
    expect(readWorkspaceCursor('new', { now: later })).not.toBeNull();
    const raw = JSON.parse(storage.store.get('vgt_writer_cursor_v1')!) as Record<string, unknown>;
    expect(Object.keys(raw)).toEqual(['new']);
  });

  it('prunes expired carets explicitly and reports how many went', () => {
    persistWorkspaceCursor(cursor({ documentId: 'a', updatedAt: NOW }), { now: NOW });
    persistWorkspaceCursor(cursor({ documentId: 'b', updatedAt: NOW }), { now: NOW });
    expect(pruneWorkspaceCursors({ now: NOW + 1 })).toBe(0);
    expect(pruneWorkspaceCursors({ now: NOW + WORKSPACE_CURSOR_MAX_AGE_MS + 1 })).toBe(2);
    expect(readWorkspaceCursor('a', { now: NOW + 1 })).toBeNull();
  });
});

describe('W-225 — a refusal says why', () => {
  it('names a missing marker', () => {
    expect(resolveWriterCursorRestoreDecision(null, 'doc-1', paragraphs))
      .toEqual({ restored: false, reason: 'no-marker' });
  });

  it('names a marker from another document', () => {
    expect(resolveWriterCursorRestoreDecision(cursor({ documentId: 'other' }), 'doc-1', paragraphs))
      .toEqual({ restored: false, reason: 'other-document' });
  });

  it('names a paragraph that no longer exists', () => {
    expect(resolveWriterCursorRestoreDecision(cursor({ paragraphId: 'gone' }), 'doc-1', paragraphs))
      .toEqual({ restored: false, reason: 'paragraph-missing' });
  });

  it('names an expired marker held in memory', () => {
    const stale = cursor({ expiresAt: NOW - 1 });
    // The clock here is the real one, so an expiry in 1970 is in the past.
    expect(resolveWriterCursorRestoreDecision(stale, 'doc-1', paragraphs))
      .toEqual({ restored: false, reason: 'expired-or-unreadable' });
  });

  it('returns the restore itself when it applies, clamped to the paragraph', () => {
    const decision = resolveWriterCursorRestoreDecision(cursor({ anchor: 9, head: 3 }), 'doc-1', paragraphs);
    expect(decision.restored).toBe(true);
    if (decision.restored) {
      expect(decision.restore).toEqual({ paragraphId: 'p2', start: 3, end: 9 });
    }
    // Beyond the paragraph end it is clamped rather than refused.
    const clamped = resolveWriterCursorRestoreDecision(cursor({ anchor: 999, head: 999 }), 'doc-1', paragraphs);
    expect(clamped.restored).toBe(true);
    if (clamped.restored) expect(clamped.restore.end).toBe('Zweiter Absatz'.length);
  });

  it('never disagrees with the compatible projection', () => {
    // `resolveWriterCursorRestore` is what every existing caller uses; the two are one decision.
    const cases: Array<[WorkspaceCursorState | null, string]> = [
      [null, 'doc-1'],
      [cursor({ documentId: 'other' }), 'doc-1'],
      [cursor({ paragraphId: 'gone' }), 'doc-1'],
      [cursor({ expiresAt: NOW - 1 }), 'doc-1'],
      [cursor(), 'doc-1'],
    ];
    for (const [value, documentId] of cases) {
      const decision = resolveWriterCursorRestoreDecision(value, documentId, paragraphs);
      const projection = resolveWriterCursorRestore(value, documentId, paragraphs);
      expect(projection).toEqual(decision.restored ? decision.restore : null);
    }
  });
});
