// STATUS: PLATIN — bounded, content-free storage key projection.
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STORED_DOCUMENT_ID_PAGE_SIZE,
  MAX_STORED_DOCUMENT_ID_PAGE_SIZE,
  MAX_STORED_DOCUMENT_ID_PAGE_SCAN,
  normalizeStoredDocumentIdKeys,
} from '../../../../platform/workspace/persistence/workspaceStorage';

interface FakeRequest<T> {
  result: T;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

function createKeyCursorHarness(keys: readonly string[]) {
  let cursorVisits = 0;
  const objectStore = {
    count: () => {
      const request: FakeRequest<number> = { result: keys.length, error: null, onsuccess: null, onerror: null };
      queueMicrotask(() => request.onsuccess?.(new Event('success')));
      return request as unknown as IDBRequest<number>;
    },
    openKeyCursor: (range?: IDBKeyRange) => {
      const rangeValue = range as unknown as { lower?: IDBValidKey; lowerOpen?: boolean } | undefined;
      const lowerBound = rangeValue?.lower;
      const matchingKeys = keys.filter((key) => typeof lowerBound !== 'string' || key > lowerBound);
      let keyIndex = 0;
      const request: FakeRequest<IDBCursorWithValue | null> = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
      };
      const emitCursor = () => {
        const key = matchingKeys[keyIndex];
        request.result = key === undefined ? null : {
          primaryKey: key,
          continue: () => {
            keyIndex += 1;
            queueMicrotask(emitCursor);
          },
        } as unknown as IDBCursorWithValue;
        cursorVisits += 1;
        request.onsuccess?.(new Event('success'));
      };
      queueMicrotask(emitCursor);
      return request as unknown as IDBRequest<IDBCursorWithValue | null>;
    },
  } as unknown as IDBObjectStore;
  const database = {
    transaction: () => ({
      error: null,
      onabort: null,
      onerror: null,
      objectStore: () => objectStore,
    }),
  } as unknown as IDBDatabase;
  const indexedDB = {
    open: () => {
      const request = {
        result: database,
        error: null as DOMException | null,
        onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
      };
      queueMicrotask(() => request.onsuccess?.(new Event('success')));
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
  return { indexedDB, cursorVisits: () => cursorVisits };
}

describe('normalizeStoredDocumentIdKeys', () => {
  it('keeps only unique bounded opaque document identifiers', () => {
    expect(normalizeStoredDocumentIdKeys([
      'doc-alpha',
      '../private-file',
      'doc-alpha',
      'folder/document',
      'doc:with-colon',
      12,
      new Date(0),
      `doc-${'x'.repeat(257)}`,
      'doc_beta',
    ])).toEqual(['doc-alpha', 'doc_beta']);
  });

  it('enforces caller and hard scan limits', () => {
    expect(normalizeStoredDocumentIdKeys(['doc-one', 'doc-two'], 1)).toEqual(['doc-one']);
    expect(normalizeStoredDocumentIdKeys(['doc-one'], 0)).toEqual([]);
  });
});

describe('listStoredDocumentIdPage', () => {
  it('uses bounded exclusive key cursors and never reads document payloads', async () => {
    const keys = Array.from({ length: 1_005 }, (_, index) => `doc-${String(index).padStart(5, '0')}`);
    const harness = createKeyCursorHarness(keys);
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousKeyRange = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { indexedDB: harness.indexedDB },
    });
    Object.defineProperty(globalThis, 'IDBKeyRange', {
      configurable: true,
      value: {
        lowerBound: (lower: IDBValidKey, lowerOpen: boolean) => ({ lower, lowerOpen }),
      },
    });

    try {
      const { listStoredDocumentIdPage } = await import('../../../../platform/workspace/persistence/workspaceStorage');
      const firstPage = await listStoredDocumentIdPage({ pageSize: 4 });
      expect(firstPage).toMatchObject({
        ids: keys.slice(0, 4),
        nextCursor: keys[3],
        totalCount: keys.length,
        hasMore: true,
      });
      expect(harness.cursorVisits()).toBe(5);

      const secondPage = await listStoredDocumentIdPage({ afterId: firstPage.nextCursor, pageSize: 4 });
      expect(secondPage.ids).toEqual(keys.slice(4, 8));
      expect(secondPage.nextCursor).toBe(keys[7]);
      expect(harness.cursorVisits()).toBe(10);

      const lastPage = await listStoredDocumentIdPage({ afterId: keys[999], pageSize: 10 });
      expect(lastPage.ids).toEqual(keys.slice(1_000));
      expect(lastPage.nextCursor).toBeNull();
      expect(lastPage.hasMore).toBe(false);
      expect(lastPage.totalCount).toBe(keys.length);

      const cappedPage = await listStoredDocumentIdPage({ pageSize: Number.MAX_SAFE_INTEGER });
      expect(cappedPage.ids).toHaveLength(MAX_STORED_DOCUMENT_ID_PAGE_SIZE);
      expect(cappedPage.hasMore).toBe(true);
      expect(cappedPage.ids).not.toContain(keys[MAX_STORED_DOCUMENT_ID_PAGE_SIZE]);

      const defaultPage = await listStoredDocumentIdPage({ afterId: keys[900] });
      expect(defaultPage.ids).toHaveLength(DEFAULT_STORED_DOCUMENT_ID_PAGE_SIZE);
      expect(defaultPage.ids[0]).toBe(keys[901]);

      const clampedPage = await listStoredDocumentIdPage({ afterId: keys[0], pageSize: 0 });
      expect(clampedPage.ids).toEqual([keys[1]]);
      await expect(listStoredDocumentIdPage({ afterId: '../outside' })).rejects.toThrow('Invalid stored document cursor');
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (previousKeyRange) Object.defineProperty(globalThis, 'IDBKeyRange', previousKeyRange);
      else Reflect.deleteProperty(globalThis, 'IDBKeyRange');
    }
  });

  it('fails closed when malformed legacy keys exceed the per-query scan budget', async () => {
    vi.resetModules();
    const keys = Array.from(
      { length: MAX_STORED_DOCUMENT_ID_PAGE_SCAN + 8 },
      (_, index) => `zz/invalid-${String(index).padStart(5, '0')}`,
    );
    const harness = createKeyCursorHarness(keys);
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousKeyRange = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { indexedDB: harness.indexedDB },
    });
    Object.defineProperty(globalThis, 'IDBKeyRange', {
      configurable: true,
      value: {
        lowerBound: (lower: IDBValidKey, lowerOpen: boolean) => ({ lower, lowerOpen }),
      },
    });

    try {
      const { listStoredDocumentIdPage } = await import('../../../../platform/workspace/persistence/workspaceStorage');
      await expect(listStoredDocumentIdPage({ pageSize: 1 })).rejects.toThrow('Stored document key scan budget exceeded');
      expect(harness.cursorVisits()).toBe(MAX_STORED_DOCUMENT_ID_PAGE_SCAN + 1);
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (previousKeyRange) Object.defineProperty(globalThis, 'IDBKeyRange', previousKeyRange);
      else Reflect.deleteProperty(globalThis, 'IDBKeyRange');
    }
  });
});

describe('scanStoredDocumentIds', () => {
  it('returns a stable continuation cursor without reading storage payloads', async () => {
    vi.resetModules();
    const keys = ['../legacy-key', 'doc-alpha', 'doc-bravo', 'doc-charlie', 'doc-delta'];
    const harness = createKeyCursorHarness(keys);
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousKeyRange = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { indexedDB: harness.indexedDB },
    });
    Object.defineProperty(globalThis, 'IDBKeyRange', {
      configurable: true,
      value: {
        lowerBound: (lower: IDBValidKey, lowerOpen: boolean) => ({ lower, lowerOpen }),
      },
    });

    try {
      const { listStoredDocumentIdPage, scanStoredDocumentIds } = await import('../../../../platform/workspace/persistence/workspaceStorage');
      const initialPage = await scanStoredDocumentIds(3);
      expect(initialPage).toEqual({
        ids: ['doc-alpha', 'doc-bravo', 'doc-charlie'],
        nextCursor: 'doc-charlie',
        hasMore: true,
      });
      await expect(listStoredDocumentIdPage({ afterId: initialPage.nextCursor, pageSize: 2 })).resolves.toMatchObject({
        ids: ['doc-delta'],
        nextCursor: null,
        hasMore: false,
      });
      await expect(scanStoredDocumentIds(5)).resolves.toEqual({
        ids: ['doc-alpha', 'doc-bravo', 'doc-charlie', 'doc-delta'],
        nextCursor: null,
        hasMore: false,
      });
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (previousKeyRange) Object.defineProperty(globalThis, 'IDBKeyRange', previousKeyRange);
      else Reflect.deleteProperty(globalThis, 'IDBKeyRange');
    }
  });
});
