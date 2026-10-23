// STATUS: DIAMANT VGT SUPREME — encrypted Workspace persistence boundary.
const DB_NAME = 'AstraeaWorkspaceDB';
const DB_VERSION = 4;
export const DOCS_STORE = 'documents';
export const META_STORE = 'metadata';
export const RECOVERY_STORE = 'recovery_snapshots';
export const JOURNAL_STORE = 'storage_journal';
export const BACKUP_STORE = 'encrypted_backups';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DOCS_STORE)) {
        db.createObjectStore(DOCS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) {
        db.createObjectStore(RECOVERY_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
        db.createObjectStore(JOURNAL_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BACKUP_STORE)) {
        db.createObjectStore(BACKUP_STORE, { keyPath: 'id' });
      }
      // v1 stored plaintext WorkspaceDocument payloads. Do not retain them after
      // upgrading to the encrypted-at-rest v2 schema.
      if (event.oldVersion > 0 && event.oldVersion < 2 && request.transaction) {
        request.transaction.objectStore(DOCS_STORE).clear();
        request.transaction.objectStore(META_STORE).clear();
        request.transaction.objectStore(RECOVERY_STORE).clear();
      }
      // v3 backup records exposed user-defined version labels as plaintext metadata.
      // A synchronous IndexedDB migration cannot safely encrypt those labels, so v4 drops
      // only the legacy backup store rather than preserving a metadata leak.
      if (event.oldVersion > 0 && event.oldVersion < 4 && request.transaction) {
        request.transaction.objectStore(BACKUP_STORE).clear();
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}
