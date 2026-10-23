// STATUS: DIAMANT VGT SUPREME — encrypted Workspace persistence boundary.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../containers/container';
import { clearEmergencySnapshot } from './workspaceStorageEmergency';
import { collisionSafeId, sha256HexBytes } from './workspaceStorageCrypto';
import { DOCS_STORE, JOURNAL_STORE, META_STORE, RECOVERY_STORE, openDatabase } from './workspaceStorageDatabase';
import type { DocumentMetadataRecord, StorageCredentialOptions, StorageJournalRecord, StorageRecoveryRecord } from './workspaceStorageTypes';

interface EncryptedDocumentRecord { id: string; format: 'vgt-encrypted-container-v2'; container: Uint8Array; containerSha256: string; }

/**
 * Persists a single WorkspaceDocument into IndexedDB and updates metadata.
 */
export async function saveDocumentToStorage(doc: WorkspaceDocument, credentials: StorageCredentialOptions = {}): Promise<void> {
  try {
    // Encrypt before opening the transaction. No plaintext document payload is ever
    // staged in IndexedDB or LocalStorage.
    const container = await packLocalEncryptedContainer(doc, { pin: credentials.pin ?? undefined, password: credentials.password ?? undefined });
    const containerSha256 = await sha256HexBytes(container);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DOCS_STORE, META_STORE, RECOVERY_STORE, JOURNAL_STORE], 'readwrite');
      const docsStore = tx.objectStore(DOCS_STORE);
      const metaStore = tx.objectStore(META_STORE);
      const recoveryStore = tx.objectStore(RECOVERY_STORE);
      const journalStore = tx.objectStore(JOURNAL_STORE);
      const now = Date.now();
      const previousRequest = docsStore.get(doc.id);

      previousRequest.onsuccess = () => {
        const previous = previousRequest.result as Partial<EncryptedDocumentRecord> | undefined;
        let fromVersion: number | null = null;
        if (previous?.format === 'vgt-encrypted-container-v2'
          && previous.container instanceof Uint8Array
          && typeof previous.containerSha256 === 'string'
          && /^[0-9a-f]{64}$/u.test(previous.containerSha256)) {
          const recovery: StorageRecoveryRecord = {
            id: collisionSafeId('rec', doc.id, now),
            documentId: doc.id,
            format: 'vgt-encrypted-container-v2',
            container: previous.container,
            containerSha256: previous.containerSha256,
            timestamp: now,
            reason: 'pre_atomic_replace',
          };
          recoveryStore.put(recovery);
        }

        const previousMetaRequest = metaStore.get(doc.id);
        previousMetaRequest.onsuccess = () => {
          const previousMeta = previousMetaRequest.result as Partial<DocumentMetadataRecord> | undefined;
          if (typeof previousMeta?.version === 'number') fromVersion = previousMeta.version;
          const record: EncryptedDocumentRecord = { id: doc.id, format: 'vgt-encrypted-container-v2', container, containerSha256 };
          docsStore.put(record);
          metaStore.put({
            id: doc.id,
            lastSavedAt: now,
            isDirty: false,
            version: doc.version || 1,
          } satisfies DocumentMetadataRecord);
          journalStore.put({
            id: `journal_${doc.id}_${now}`,
            documentId: doc.id,
            fromVersion,
            toVersion: doc.version || 1,
            committedAt: now,
            operation: 'atomic-replace',
          } satisfies StorageJournalRecord);
        };
        previousMetaRequest.onerror = () => tx.abort();
      };
      previousRequest.onerror = () => tx.abort();

      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Atomic storage transaction aborted'));
      tx.onerror = () => reject(tx.error || new Error('Atomic storage transaction failed'));
    });
  } catch (err) {
    // Security doctrine: never fall back to plaintext document JSON in LocalStorage.
    console.warn('[WorkspaceStorage] IndexedDB write failed; plaintext LocalStorage fallback is disabled:', err instanceof Error ? err.name : 'Error');
    try {
      window.localStorage.removeItem(`vgt_doc_${doc.id}`);
    } catch {
      // Ignore cleanup failure.
    }
    throw err;
  }
}

/**
 * Persists multiple WorkspaceDocuments in a single atomic transaction.
 */
export async function saveAllDocumentsToStorage(
  docs: Record<string, WorkspaceDocument>,
  credentialsForDocument: (documentId: string) => StorageCredentialOptions = () => ({}),
): Promise<void> {
  const docList = Object.values(docs);
  if (docList.length === 0) return;

  try {
    // Encrypt before opening the IndexedDB transaction. Awaiting crypto inside an
    // IDB transaction can auto-close the transaction between event-loop turns.
    const encrypted = await Promise.all(docList.map(async (doc) => {
      const container = await packLocalEncryptedContainer(doc, (() => { const credential = credentialsForDocument(doc.id); return { pin: credential.pin ?? undefined, password: credential.password ?? undefined }; })());
      return { doc, container, containerSha256: await sha256HexBytes(container) };
    }));
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DOCS_STORE, META_STORE, JOURNAL_STORE], 'readwrite');
      const docsStore = tx.objectStore(DOCS_STORE);
      const metaStore = tx.objectStore(META_STORE);
      const journalStore = tx.objectStore(JOURNAL_STORE);
      const now = Date.now();

      for (const { doc, container, containerSha256 } of encrypted) {
        const record: EncryptedDocumentRecord = { id: doc.id, format: 'vgt-encrypted-container-v2', container, containerSha256 };
        docsStore.put(record);
        metaStore.put({
          id: doc.id,
          lastSavedAt: now,
          isDirty: false,
          version: doc.version || 1,
        });
        journalStore.put({
          id: `journal_${doc.id}_${now}`,
          documentId: doc.id,
          fromVersion: null,
          toVersion: doc.version || 1,
          committedAt: now,
          operation: 'batch-replace',
        } satisfies StorageJournalRecord);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Batch transaction error'));
    });
  } catch (err) {
    console.warn('[WorkspaceStorage] Batch IndexedDB failed:', err instanceof Error ? err.name : 'Error');
    throw err;
  }
}

/**
 * Loads all saved WorkspaceDocuments from local IndexedDB storage.
 */
export async function loadDocumentFromStorage(docId: string): Promise<WorkspaceDocument | null> {
  if (!docId || docId.length > 256 || /[\u0000-\u001f]/.test(docId)) return null;
  try {
    const db = await openDatabase();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(DOCS_STORE, 'readonly');
      const request = tx.objectStore(DOCS_STORE).get(docId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error('Failed to load document'));
    });
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Partial<EncryptedDocumentRecord> & { id?: unknown };
    if (record.format !== 'vgt-encrypted-container-v2' || record.id !== docId || !(record.container instanceof Uint8Array) || !/^[0-9a-f]{64}$/u.test(record.containerSha256 ?? '')) return null;
    if (await sha256HexBytes(record.container) !== record.containerSha256) throw new Error('Encrypted document integrity mismatch');
    const document = await unpackLocalEncryptedContainer(record.container);
    if (document.id !== docId) throw new Error('Encrypted document identity mismatch');
    return document;
  } catch (error) {
    console.warn('[WorkspaceStorage] Single encrypted document load failed:', error instanceof Error ? error.name : 'Error');
    return null;
  }
}

export async function loadAllDocumentsFromStorage(): Promise<Record<string, WorkspaceDocument>> {
  try {
    const db = await openDatabase();
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(DOCS_STORE, 'readonly');
      const store = tx.objectStore(DOCS_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result as unknown[]) || []);
      request.onerror = () => reject(request.error || new Error('Failed to load documents'));
    });
    const map: Record<string, WorkspaceDocument> = {};
    const legacyIds: string[] = [];
    for (const raw of records) {
      const record = raw as Partial<EncryptedDocumentRecord> & { id?: unknown };
      if (
        record.format !== 'vgt-encrypted-container-v2' ||
        typeof record.id !== 'string' ||
        !(record.container instanceof Uint8Array) ||
        !/^[0-9a-f]{64}$/u.test(record.containerSha256 ?? '')
      ) {
        if (typeof record.id === 'string') legacyIds.push(record.id);
        continue;
      }
      try {
        if (await sha256HexBytes(record.container) !== record.containerSha256) throw new Error('Encrypted autosave integrity mismatch');
        const doc = await unpackLocalEncryptedContainer(record.container);
        if (doc.id !== record.id) throw new Error('Encrypted autosave identity mismatch');
        map[doc.id] = doc;
      } catch (error) {
        console.warn('[WorkspaceStorage] Encrypted autosave record rejected:', typeof record.id === 'string' ? record.id.slice(0, 64) : 'unknown', error instanceof Error ? error.name : 'Error');
      }
    }
    if (legacyIds.length > 0) {
      const tx = db.transaction([DOCS_STORE, META_STORE], 'readwrite');
      for (const id of legacyIds) {
        tx.objectStore(DOCS_STORE).delete(id);
        tx.objectStore(META_STORE).delete(id);
      }
    }
    return map;
  } catch (err) {
    // Do not resurrect legacy plaintext document snapshots from LocalStorage.
    console.warn('[WorkspaceStorage] IndexedDB read failed; secure browser fallback is unavailable:', err instanceof Error ? err.name : 'Error');
    clearEmergencySnapshot();
    return {};
  }
}

/**
 * Deletes a document from IndexedDB storage.
 */
export async function deleteDocumentFromStorage(docId: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DOCS_STORE, META_STORE], 'readwrite');
      tx.objectStore(DOCS_STORE).delete(docId);
      tx.objectStore(META_STORE).delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Delete error'));
    });
  } catch {
    try {
      window.localStorage.removeItem(`vgt_doc_${docId}`);
    } catch {
      // ignore
    }
  }
}
