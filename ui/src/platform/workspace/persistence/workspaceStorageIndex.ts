// STATUS: DIAMANT VGT SUPREME — encrypted Workspace persistence boundary.
import { DOCS_STORE, openDatabase } from './workspaceStorageDatabase';
import { isStoredDocumentId, MAX_STORED_DOCUMENT_ID_PAGE_SCAN, MAX_STORED_DOCUMENT_ID_SCAN, normalizeStoredDocumentIdPageSize } from './workspaceStorageTypes';
import type { StoredDocumentIdPage, StoredDocumentIdPageOptions, StoredDocumentIdScan } from './workspaceStorageTypes';

/**
 * Lists bounded document keys without reading encrypted payloads or plaintext metadata.
 * Explorer uses this to represent saved files whose document contents are not unlocked.
 */
export async function listStoredDocumentIds(limit = MAX_STORED_DOCUMENT_ID_SCAN): Promise<string[]> {
  const scan = await scanStoredDocumentIds(limit);
  return [...scan.ids];
}

/**
 * Reads one bounded startup scan of opaque document keys and reports whether keyset
 * continuation may have more results. The scan never opens encrypted record values.
 */
export async function scanStoredDocumentIds(limit = MAX_STORED_DOCUMENT_ID_SCAN): Promise<StoredDocumentIdScan> {
  const boundedLimit = Number.isSafeInteger(limit)
    ? Math.max(0, Math.min(limit, MAX_STORED_DOCUMENT_ID_SCAN))
    : MAX_STORED_DOCUMENT_ID_SCAN;
  if (boundedLimit === 0) return { ids: [], nextCursor: null, hasMore: false };

  const db = await openDatabase();
  return new Promise<StoredDocumentIdScan>((resolve, reject) => {
    const transaction = db.transaction(DOCS_STORE, 'readonly');
    const request = transaction.objectStore(DOCS_STORE).openKeyCursor();
    const ids: string[] = [];
    let scanned = 0;
    let nextCursor: string | null = null;
    let hasMore = false;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (error) reject(error instanceof Error ? error : new Error('Stored document key enumeration failed'));
      else resolve({ ids, nextCursor: hasMore ? nextCursor : null, hasMore });
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        finish();
        return;
      }
      if (scanned >= MAX_STORED_DOCUMENT_ID_SCAN) {
        hasMore = true;
        finish();
        return;
      }
      scanned += 1;
      const id = isStoredDocumentId(cursor.primaryKey) ? cursor.primaryKey : null;
      if (id !== null) {
        if (ids.length >= boundedLimit) {
          hasMore = true;
          finish();
          return;
        }
        ids.push(id);
        nextCursor = id;
      }
      // Continue once beyond the requested page to distinguish an exact end from
      // an available next page. The raw-key budget still caps malformed-key walks.
      cursor.continue();
    };
    request.onerror = () => finish(request.error ?? new Error('Stored document key enumeration failed'));
    transaction.onabort = () => finish(transaction.error ?? new Error('Stored document key enumeration aborted'));
    transaction.onerror = () => finish(transaction.error ?? new Error('Stored document key enumeration failed'));
  });
}

/**
 * Reads one bounded, key-only page from the encrypted document store.
 * The exclusive primary-key cursor keeps page traversal stable without loading payloads.
 * `totalCount` is the store record count, including any invalid legacy keys that are skipped.
 */
export async function listStoredDocumentIdPage(
  options: StoredDocumentIdPageOptions = {},
): Promise<StoredDocumentIdPage> {
  const afterId = options.afterId ?? null;
  if (afterId !== null && !isStoredDocumentId(afterId)) {
    throw new Error('Invalid stored document cursor');
  }
  const pageSize = normalizeStoredDocumentIdPageSize(options.pageSize);
  const db = await openDatabase();

  return new Promise<StoredDocumentIdPage>((resolve, reject) => {
    const transaction = db.transaction(DOCS_STORE, 'readonly');
    const store = transaction.objectStore(DOCS_STORE);
    const countRequest = store.count();
    const cursorRange = afterId === null ? undefined : IDBKeyRange.lowerBound(afterId, true);
    const cursorRequest = store.openKeyCursor(cursorRange, 'next');
    const ids: string[] = [];
    let totalCount: number | null = null;
    let cursorComplete = false;
    let hasMore = false;
    let scannedKeys = 0;
    let scanBudgetReached = false;
    let settled = false;

    const finishWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error('Stored document page query failed'));
    };
    const finishWhenReady = () => {
      if (settled || !cursorComplete || totalCount === null) return;
      settled = true;
      resolve({
        ids,
        nextCursor: hasMore ? ids.at(-1) ?? null : null,
        totalCount,
        hasMore,
      });
    };

    countRequest.onsuccess = () => {
      const count = countRequest.result;
      if (!Number.isSafeInteger(count) || count < 0) {
        finishWithError(new Error('Stored document count is invalid'));
        return;
      }
      totalCount = count;
      finishWhenReady();
    };
    countRequest.onerror = () => finishWithError(countRequest.error ?? new Error('Stored document count failed'));

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        cursorComplete = true;
        finishWhenReady();
        return;
      }

      if (scanBudgetReached) {
        finishWithError(new Error('Stored document key scan budget exceeded'));
        return;
      }
      scannedKeys += 1;
      const id = isStoredDocumentId(cursor.primaryKey) ? cursor.primaryKey : null;
      if (id !== null) {
        if (ids.length === pageSize) {
          hasMore = true;
          cursorComplete = true;
          finishWhenReady();
          return;
        }
        ids.push(id);
      }
      if (scannedKeys >= MAX_STORED_DOCUMENT_ID_PAGE_SCAN) {
        scanBudgetReached = true;
        cursor.continue();
        return;
      }
      cursor.continue();
    };
    cursorRequest.onerror = () => finishWithError(cursorRequest.error ?? new Error('Stored document page query failed'));
    transaction.onabort = () => finishWithError(transaction.error ?? new Error('Stored document page query aborted'));
    transaction.onerror = () => finishWithError(transaction.error ?? new Error('Stored document page query failed'));
  });
}
