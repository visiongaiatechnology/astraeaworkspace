// STATUS: DIAMANT VGT SUPREME — the caret comes back where it was
//
// Paket 41 acceptance: "Ein Dokument bearbeiten, App schließen und unverändert mit
// **Cursor/Absatzinhalt** wieder öffnen."
//
// W-216: the content survived (autosave, recovery snapshots, emergency marker) but the caret did
// not — `WorkspaceDocument` has no selection field and the session record only knows whether the
// last shutdown was clean. Reopening gave back the text without the cursor.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Paragraph } from '../../../shared/contracts/workspace';
import {
  clearWorkspaceCursor,
  parseWorkspaceCursor,
  persistWorkspaceCursor,
  readWorkspaceCursor,
  resolveWriterCursorRestore,
  WORKSPACE_CURSOR_MAX_AGE_MS,
  WORKSPACE_CURSOR_VERSION,
  type WorkspaceCursorState,
} from '../../../platform/workspace/persistence/workspaceCursorState';

const p = (id: string, text: string): Paragraph => ({
  id, spans: [{ text }], style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
} as unknown as Paragraph);

const paragraphs = [p('p1', 'Erster Absatz'), p('p2', 'Zweiter Absatz mit mehr Text')];

const cursor = (overrides: Partial<WorkspaceCursorState> = {}): WorkspaceCursorState => ({
  documentId: 'doc-1', paragraphId: 'p2', anchor: 7, head: 7, updatedAt: 1, ...overrides,
});

/** A minimal LocalStorage, because the unit tests run without a DOM. */
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

describe('stored cursor marker', () => {
  let storage: ReturnType<typeof installStorage>;
  beforeEach(() => { storage = installStorage(); });
  afterEach(() => { storage.restore(); vi.restoreAllMocks(); });

  it('survives a write and read cycle unchanged', () => {
    // W-221: a marker now has a lifetime, so the fixture has to carry a real clock. W-224: it is read
    // back **by document id**, which is the finding — one cursor for several documents was ambiguous.
    const now = Date.now();
    expect(persistWorkspaceCursor(cursor({ anchor: 3, head: 9, updatedAt: now }), { now })).toBe(true);
    expect(readWorkspaceCursor('doc-1', { now })).toEqual({
      documentId: 'doc-1', paragraphId: 'p2', anchor: 3, head: 9, updatedAt: now,
      version: WORKSPACE_CURSOR_VERSION, expiresAt: now + WORKSPACE_CURSOR_MAX_AGE_MS,
    });
  });

  it('reports no cursor when nothing was stored', () => {
    expect(readWorkspaceCursor()).toBeNull();
  });

  it('drops a malformed record instead of throwing', () => {
    for (const raw of ['not json', '{}', 'null', '[]', '"text"', '{"documentId":"d","paragraphId":"p"}',
      '{"documentId":"d","paragraphId":"p","anchor":"3","head":3}', '{"documentId":"","paragraphId":"p","anchor":0,"head":0}']) {
      storage.store.set('vgt_writer_cursor_v1', raw);
      expect(readWorkspaceCursor()).toBeNull();
    }
  });

  it('rejects control characters and oversized ids', () => {
    expect(parseWorkspaceCursor({ ...cursor(), documentId: 'a\u0000b' })).toBeNull();
    expect(parseWorkspaceCursor({ ...cursor(), paragraphId: 'x'.repeat(257) })).toBeNull();
  });

  it('rejects impossible offsets', () => {
    expect(parseWorkspaceCursor({ ...cursor(), anchor: -1 })).toBeNull();
    expect(parseWorkspaceCursor({ ...cursor(), head: Number.NaN })).toBeNull();
    expect(parseWorkspaceCursor({ ...cursor(), head: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseWorkspaceCursor({ ...cursor(), anchor: 10_000_001 })).toBeNull();
  });

  it('truncates fractional offsets rather than storing them', () => {
    // A value stored before the version/expiry fields existed parses as version 1 with no expiry — that
    // backward compatibility is the reason the fields are optional, and it is asserted here.
    expect(parseWorkspaceCursor({ ...cursor(), anchor: 2.7, head: 2.2 })).toEqual(
      { documentId: 'doc-1', paragraphId: 'p2', anchor: 2, head: 2, updatedAt: 1, version: 1, expiresAt: undefined },
    );
  });

  it('clears only the matching document', () => {
    // W-221: a live marker has to be recent, otherwise the read refuses it and this test would pass for
    // the wrong reason. W-217/W-224: the clear names the document, and another document keeps its caret.
    const now = Date.now();
    persistWorkspaceCursor(cursor({ documentId: 'doc-1', updatedAt: now }), { now });
    clearWorkspaceCursor('doc-2');
    expect(readWorkspaceCursor('doc-1', { now })).not.toBeNull();
    clearWorkspaceCursor('doc-1');
    expect(readWorkspaceCursor('doc-1', { now })).toBeNull();
  });

  it('clears everything when no document is named', () => {
    persistWorkspaceCursor(cursor());
    clearWorkspaceCursor();
    expect(readWorkspaceCursor()).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage disabled'); },
    });
    expect(readWorkspaceCursor()).toBeNull();
    expect(persistWorkspaceCursor(cursor())).toBe(false);
    expect(() => clearWorkspaceCursor()).not.toThrow();
  });

  it('never throws when the quota is full', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new Error('QuotaExceededError'); },
        removeItem: () => {},
      },
    });
    expect(persistWorkspaceCursor(cursor())).toBe(false);
  });

  it('refuses to store a malformed state', () => {
    expect(persistWorkspaceCursor(cursor({ paragraphId: '' }))).toBe(false);
    expect(persistWorkspaceCursor(cursor({ anchor: -5 }))).toBe(false);
  });
});

describe('deciding whether a stored cursor may be applied', () => {
  it('restores the caret inside the paragraph it points at', () => {
    expect(resolveWriterCursorRestore(cursor({ anchor: 7, head: 7 }), 'doc-1', paragraphs))
      .toEqual({ paragraphId: 'p2', start: 7, end: 7 });
  });

  it('keeps a selection, normalised so start is never after end', () => {
    expect(resolveWriterCursorRestore(cursor({ anchor: 12, head: 4 }), 'doc-1', paragraphs))
      .toEqual({ paragraphId: 'p2', start: 4, end: 12 });
  });

  it('refuses a cursor from a different document', () => {
    expect(resolveWriterCursorRestore(cursor({ documentId: 'doc-2' }), 'doc-1', paragraphs)).toBeNull();
  });

  it('refuses a paragraph that no longer exists', () => {
    expect(resolveWriterCursorRestore(cursor({ paragraphId: 'gone' }), 'doc-1', paragraphs)).toBeNull();
  });

  it('clamps offsets past the end of a shortened paragraph', () => {
    // The paragraph may have been edited elsewhere; the caret must not land outside it.
    // The length comes from the fixture instead of being typed out: arithmetic in a test is a
    // mistake waiting to happen, and this expectation was wrong the first time.
    const length = paragraphs[1]!.spans.reduce((sum, span) => sum + span.text.length, 0);
    expect(resolveWriterCursorRestore(cursor({ anchor: 999, head: 999 }), 'doc-1', paragraphs))
      .toEqual({ paragraphId: 'p2', start: length, end: length });
  });

  it('refuses everything when there is no stored cursor', () => {
    expect(resolveWriterCursorRestore(null, 'doc-1', paragraphs)).toBeNull();
  });

  it('refuses when the document has no paragraphs yet', () => {
    expect(resolveWriterCursorRestore(cursor(), 'doc-1', [])).toBeNull();
  });

  it('clamps against the length of all spans together', () => {
    const split: Paragraph = {
      id: 'p3',
      spans: [{ text: 'vier' }, { text: 'und' }, { text: 'fünf' }],
      style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
    } as unknown as Paragraph;
    expect(resolveWriterCursorRestore(cursor({ paragraphId: 'p3', anchor: 99, head: 99 }), 'doc-1', [split]))
      .toEqual({ paragraphId: 'p3', start: 11, end: 11 });
  });

  it('restores a caret at position zero', () => {
    expect(resolveWriterCursorRestore(cursor({ anchor: 0, head: 0 }), 'doc-1', paragraphs))
      .toEqual({ paragraphId: 'p2', start: 0, end: 0 });
  });
});
