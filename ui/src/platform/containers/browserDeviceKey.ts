import { requireWebCrypto } from '../crypto/cryptoCore';
const DEVICE_KEY_DB = 'AstraeaVgtDeviceVault';
const DEVICE_KEY_STORE = 'keys';
const DEVICE_KEY_ID = 'device-aes-gcm-v1';
const DEVICE_KEY_DB_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | null = null;
let deviceKeyPromise: Promise<CryptoKey> | null = null;

function openDeviceKeyDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Browser device key storage is unavailable'));
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_KEY_DB, DEVICE_KEY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_KEY_STORE)) db.createObjectStore(DEVICE_KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser device key database could not be opened'));
    request.onblocked = () => reject(new Error('Browser device key database upgrade is blocked'));
  });
  return databasePromise;
}

/**
 * Whether a value read from storage may be used as the device key.
 *
 * Exported for the W-234 tests: this predicate is the only thing standing between a poisoned or
 * downgraded browser key store and the container format. A key that is extractable, of the wrong type,
 * of the wrong algorithm or without both usages must be rejected — otherwise "device-bound" would be a
 * claim rather than a property.
 */
export function isUsableDeviceKey(value: unknown): value is CryptoKey {
  if (!value || typeof value !== 'object') return false;
  const key = value as CryptoKey;
  return key.type === 'secret'
    && key.extractable === false
    && key.algorithm?.name === 'AES-GCM'
    && key.usages.includes('encrypt')
    && key.usages.includes('decrypt');
}

async function loadStoredDeviceKey(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_KEY_STORE, 'readonly');
    const request = tx.objectStore(DEVICE_KEY_STORE).get(DEVICE_KEY_ID);
    request.onsuccess = () => resolve(isUsableDeviceKey(request.result) ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error('Browser device key could not be read'));
  });
}

async function storeDeviceKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_KEY_STORE, 'readwrite');
    tx.objectStore(DEVICE_KEY_STORE).put(key, DEVICE_KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Browser device key could not be stored'));
    tx.onabort = () => reject(tx.error ?? new Error('Browser device key storage was aborted'));
  });
}

/**
 * Returns a persistent, non-exportable device-local AES-256-GCM key. The key is
 * structured-cloned by IndexedDB and is never serialized into LocalStorage or a file.
 */
export function getOrCreateBrowserDeviceKey(): Promise<CryptoKey> {
  if (deviceKeyPromise) return deviceKeyPromise;
  deviceKeyPromise = (async () => {
    const cryptoApi = requireWebCrypto();
    const db = await openDeviceKeyDatabase();
    const existing = await loadStoredDeviceKey(db);
    if (existing) return existing;
    const generated = await cryptoApi.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    await storeDeviceKey(db, generated);
    return generated;
  })().catch((error) => {
    deviceKeyPromise = null;
    throw error;
  });
  return deviceKeyPromise;
}
