// STATUS: DIAMANT VGT SUPREME — encrypted Workspace persistence boundary.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../containers/container';
import { securityPolicyForDocument } from '../../security/securityProfiles';
import { selectRecoveryRetention, selectRetainedVersions, VERSION_RECOVERY_LIMITS } from '../../recovery/versionRecoveryEngine';
import { collisionSafeId, sha256HexBytes, sha256HexText } from './workspaceStorageCrypto';
import { BACKUP_STORE, JOURNAL_STORE, RECOVERY_STORE, openDatabase } from './workspaceStorageDatabase';
import { saveDocumentToStorage } from './workspaceStorageDocuments';
import type { StorageBackupDescriptor, StorageBackupRecord, StorageCredentialOptions, StorageJournalRecord, StorageRecoveryRecord } from './workspaceStorageTypes';

const VERSION_META_EXTENSION = 'vgt.version-recovery:1';
const RECOVERY_REASON_ALLOWLIST = /^(?:crash_prevention|operation-autosave|autosave_routine)(?::v[0-9]{1,20})?$/;

function normalizePersistedRecoveryReason(reason: string): string {
  const candidate = reason.trim();
  return RECOVERY_REASON_ALLOWLIST.test(candidate) ? candidate : 'custom';
}
function withEncryptedVersionMetadata(document: WorkspaceDocument, label: string): WorkspaceDocument {
  return {
    ...structuredClone(document),
    wom_extensions: {
      ...(document.wom_extensions ?? {}),
      [VERSION_META_EXTENSION]: { label },
    },
  };
}

function extractAndStripVersionMetadata(document: WorkspaceDocument): { document: WorkspaceDocument; label: string } {
  const cloned = structuredClone(document);
  const meta = cloned.wom_extensions?.[VERSION_META_EXTENSION];
  const label = meta && typeof meta === 'object' && typeof (meta as { label?: unknown }).label === 'string'
    ? (meta as { label: string }).label.slice(0, VERSION_RECOVERY_LIMITS.maxLabelChars)
    : 'manual';
  if (cloned.wom_extensions) {
    const next = { ...cloned.wom_extensions };
    delete next[VERSION_META_EXTENSION];
    cloned.wom_extensions = Object.keys(next).length ? next : undefined;
  }
  return { document: cloned, label };
}
/**
 * Creates an explicit encrypted recovery snapshot in IndexedDB and applies bounded retention.
 */
export async function clearRecoverySnapshotsFromStorage(): Promise<number> {
  const db = await openDatabase();
  const existingCount = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(RECOVERY_STORE, 'readonly');
    const request = tx.objectStore(RECOVERY_STORE).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Recovery snapshot count failed'));
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECOVERY_STORE, 'readwrite');
    tx.objectStore(RECOVERY_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Recovery snapshot cleanup aborted'));
    tx.onerror = () => reject(tx.error || new Error('Recovery snapshot cleanup failed'));
  });
  return existingCount;
}

export async function saveRecoverySnapshot(
  doc: WorkspaceDocument,
  reason: string = 'crash_prevention',
  credentials: StorageCredentialOptions = {},
): Promise<string> {
  const boundedReason = normalizePersistedRecoveryReason(reason.slice(0, VERSION_RECOVERY_LIMITS.maxReasonChars));
  try {
    const container = await packLocalEncryptedContainer(doc, { pin: credentials.pin ?? undefined, password: credentials.password ?? undefined });
    const containerSha256 = await sha256HexBytes(container);
    const db = await openDatabase();
    const now = Date.now();
    const snapshotId = collisionSafeId('rec', doc.id, now);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(RECOVERY_STORE, 'readwrite');
      const store = tx.objectStore(RECOVERY_STORE);
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const existing = ((getAll.result as StorageRecoveryRecord[]) || [])
          .filter((record) => record.documentId === doc.id && record.format === 'vgt-encrypted-container-v2');
        const snapshot: StorageRecoveryRecord = {
          id: snapshotId,
          documentId: doc.id,
          format: 'vgt-encrypted-container-v2',
          container,
          containerSha256,
          timestamp: now,
          reason: boundedReason,
        };
        store.put(snapshot);
        // W-230: the retention decision is handed the same clock the snapshot was stamped with, so the age
        // dimension compares one clock with itself instead of racing `Date.now()` a second time.
        const retention = selectRecoveryRetention([
          { id: snapshot.id, createdAt: snapshot.timestamp, encryptedBytes: snapshot.container.byteLength },
          ...existing.map((record) => ({ id: record.id, createdAt: record.timestamp, encryptedBytes: record.container?.byteLength ?? 0 })),
        ], now);
        for (const id of retention.remove) if (id !== snapshotId) store.delete(id);
      };
      getAll.onerror = () => tx.abort();
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Recovery snapshot transaction aborted'));
      tx.onerror = () => reject(tx.error || new Error('Recovery snapshot transaction failed'));
    });
    return snapshotId;
  } catch (error) {
    console.warn('[WorkspaceStorage] Recovery snapshot failed:', error instanceof Error ? error.name : 'Error');
    throw error;
  }
}

/** Creates a durable encrypted backup record. User-visible label is stored only inside ciphertext. */
export async function createDocumentBackup(
  doc: WorkspaceDocument,
  label: string = 'manual',
  credentials: StorageCredentialOptions = {},
): Promise<string> {
  const normalizedLabel = label.trim().replace(/\s+/g, ' ').slice(0, VERSION_RECOVERY_LIMITS.maxLabelChars) || 'manual';
  if (/[\u0000-\u001f]/.test(normalizedLabel)) throw new Error('Version label is invalid');
  const protectedSnapshot = withEncryptedVersionMetadata(doc, normalizedLabel);
  const container = await packLocalEncryptedContainer(protectedSnapshot, { pin: credentials.pin ?? undefined, password: credentials.password ?? undefined });
  const db = await openDatabase();
  const now = Date.now();
  const backup: StorageBackupRecord = {
    id: collisionSafeId('backup', doc.id, now),
    documentId: doc.id,
    documentVersion: doc.version || 1,
    format: 'vgt-encrypted-container-v2',
    container,
    createdAt: now,
    labelDigest: await sha256HexText(normalizedLabel),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE, 'readwrite');
    const store = tx.objectStore(BACKUP_STORE);
    const getAll = store.getAll();
    getAll.onsuccess = () => {
      const existing = ((getAll.result as StorageBackupRecord[]) || [])
        .filter((record) => record.documentId === doc.id && record.format === 'vgt-encrypted-container-v2');
      store.put(backup);
      const retention = selectRetainedVersions([
        { id: backup.id, createdAt: backup.createdAt, encryptedBytes: backup.container.byteLength, documentVersion: backup.documentVersion, protectionProfile: securityPolicyForDocument(doc).profile, labelDigest: backup.labelDigest },
        ...existing.map((record) => ({ id: record.id, createdAt: record.createdAt, encryptedBytes: record.container?.byteLength ?? 0, documentVersion: record.documentVersion, protectionProfile: 'encrypted', labelDigest: record.labelDigest })),
      ], now);
      for (const id of retention.remove) if (id !== backup.id) store.delete(id);
    };
    getAll.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Encrypted backup transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('Encrypted backup transaction failed'));
  });
  return backup.id;
}

export async function listDocumentBackups(
  documentId?: string,
  credentials: StorageCredentialOptions = {},
): Promise<StorageBackupDescriptor[]> {
  const db = await openDatabase();
  const records = await new Promise<StorageBackupRecord[]>((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE, 'readonly');
    const request = tx.objectStore(BACKUP_STORE).getAll();
    request.onsuccess = () => resolve((request.result as StorageBackupRecord[]) || []);
    request.onerror = () => reject(request.error || new Error('Encrypted backup read failed'));
  });
  const selected = records
    .filter((record) => record.format === 'vgt-encrypted-container-v2' && (!documentId || record.documentId === documentId))
    .sort((a, b) => b.createdAt - a.createdAt);
  const output: StorageBackupDescriptor[] = [];
  for (const record of selected) {
    try {
      if (!(record.container instanceof Uint8Array)) continue;
      const unpacked = await unpackLocalEncryptedContainer(record.container, { pin: credentials.pin ?? undefined, password: credentials.password ?? undefined });
      const extracted = extractAndStripVersionMetadata(unpacked);
      output.push({ ...record, label: undefined, decryptedLabel: record.label ?? extracted.label });
    } catch {
      // Protected versions remain undisclosed until the same credential policy can unlock them.
    }
  }
  return output;
}

export async function restoreDocumentBackup(
  backupId: string,
  credentials: StorageCredentialOptions = {},
  persist = false,
): Promise<WorkspaceDocument> {
  if (!backupId || backupId.length > 512 || /[\u0000-\u001f]/.test(backupId)) throw new Error('Invalid backup identifier');
  const db = await openDatabase();
  const backup = await new Promise<StorageBackupRecord | null>((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE, 'readonly');
    const request = tx.objectStore(BACKUP_STORE).get(backupId);
    request.onsuccess = () => resolve((request.result as StorageBackupRecord | undefined) || null);
    request.onerror = () => reject(request.error || new Error('Encrypted backup read failed'));
  });
  if (!backup || backup.format !== 'vgt-encrypted-container-v2' || !(backup.container instanceof Uint8Array)) throw new Error('Encrypted backup is unavailable or invalid');
  const unpacked = await unpackLocalEncryptedContainer(backup.container, { pin: credentials.pin ?? undefined, password: credentials.password ?? undefined });
  const { document } = extractAndStripVersionMetadata(unpacked);
  if (document.id !== backup.documentId) throw new Error('Encrypted backup identity mismatch');
  if (persist) {
    await saveDocumentToStorage(document, credentials);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(JOURNAL_STORE, 'readwrite');
      tx.objectStore(JOURNAL_STORE).put({
        id: collisionSafeId('journal', document.id), documentId: document.id, fromVersion: null,
        toVersion: document.version || 1, committedAt: Date.now(), operation: 'restore-backup',
      } satisfies StorageJournalRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Restore journal write failed'));
    });
  }
  return document;
}

/**
 * W-230 decision, written down so it is not mistaken for an oversight: the age bound of the recovery retention
 * (`DEFAULT_RECOVERY_RETENTION.maxAgeMs`) is applied where all three retention dimensions are applied — when the
 * next snapshot of the document is written. This read path deliberately still serves whatever is **stored**: a
 * snapshot that survived is a possible last-known-good copy, and refusing it here would drop it without the user
 * ever seeing it. An expired snapshot therefore lives until the document is saved again, not forever by policy.
 */
export async function loadLatestRecoverySnapshot(
  documentId: string,
  credentials: StorageCredentialOptions = {},
): Promise<WorkspaceDocument | null> {
  if (!documentId || documentId.length > 256 || /[\u0000-\u001f]/.test(documentId)) return null;
  const db = await openDatabase();
  const records = await new Promise<StorageRecoveryRecord[]>((resolve, reject) => {
    const tx = db.transaction(RECOVERY_STORE, 'readonly');
    const request = tx.objectStore(RECOVERY_STORE).getAll();
    request.onsuccess = () => resolve((request.result as StorageRecoveryRecord[]) || []);
    request.onerror = () => reject(request.error || new Error('Recovery snapshot read failed'));
  });
  const latest = records
    .filter((record) => record.documentId === documentId && record.format === 'vgt-encrypted-container-v2')
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  if (!latest || !(latest.container instanceof Uint8Array) || !/^[0-9a-f]{64}$/u.test(latest.containerSha256 ?? '')) return null;
  if (await sha256HexBytes(latest.container) !== latest.containerSha256) throw new Error('Recovery snapshot integrity mismatch');
  const document = await unpackLocalEncryptedContainer(latest.container, { pin: credentials.pin ?? undefined, password: credentials.password ?? undefined });
  if (document.id !== documentId) throw new Error('Recovery snapshot identity mismatch');
  return document;
}
