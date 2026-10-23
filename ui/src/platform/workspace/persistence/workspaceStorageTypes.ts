// STATUS: DIAMANT VGT SUPREME — encrypted Workspace persistence boundary.
export const MAX_STORED_DOCUMENT_ID_SCAN = 20_000;
export const DEFAULT_STORED_DOCUMENT_ID_PAGE_SIZE = 100;
export const MAX_STORED_DOCUMENT_ID_PAGE_SIZE = 500;
export const MAX_STORED_DOCUMENT_ID_PAGE_SCAN = 4_096;
const STORED_DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u;

export interface DocumentMetadataRecord { id: string; lastSavedAt: number; isDirty: boolean; version: number; }

export interface StoredDocumentIdPageOptions {
  readonly afterId?: string | null;
  readonly pageSize?: number;
}

export interface StoredDocumentIdPage {
  readonly ids: readonly string[];
  readonly nextCursor: string | null;
  /** IndexedDB record count; legacy records with invalid keys are included in this count. */
  readonly totalCount: number;
  readonly hasMore: boolean;
}

export interface StoredDocumentIdScan {
  readonly ids: readonly string[];
  /** Last included valid primary key. Invalid keys are skipped without loading records. */
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
export function isStoredDocumentId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 256
    && STORED_DOCUMENT_ID_PATTERN.test(value);
}

export function normalizeStoredDocumentIdPageSize(value: unknown): number {
  if (!Number.isSafeInteger(value)) return DEFAULT_STORED_DOCUMENT_ID_PAGE_SIZE;
  return Math.max(1, Math.min(value as number, MAX_STORED_DOCUMENT_ID_PAGE_SIZE));
}

export function normalizeStoredDocumentIdKeys(
  keys: readonly IDBValidKey[],
  limit = MAX_STORED_DOCUMENT_ID_SCAN,
): string[] {
  const boundedLimit = Number.isSafeInteger(limit)
    ? Math.max(0, Math.min(limit, MAX_STORED_DOCUMENT_ID_SCAN))
    : MAX_STORED_DOCUMENT_ID_SCAN;
  if (boundedLimit === 0) return [];
  const ids = new Set<string>();
  for (const key of keys.slice(0, MAX_STORED_DOCUMENT_ID_SCAN)) {
    if (!isStoredDocumentId(key)) continue;
    ids.add(key);
    if (ids.size >= boundedLimit) break;
  }
  return [...ids];
}

export interface StorageRecoveryRecord {
  id: string;
  documentId?: string;
  format: 'vgt-encrypted-container-v2';
  container: Uint8Array;
  containerSha256: string;
  timestamp: number;
  reason: string;
}

export interface StorageJournalRecord {
  id: string; documentId: string; fromVersion: number | null; toVersion: number; committedAt: number;
  operation: 'atomic-replace' | 'batch-replace' | 'restore-backup';
}

export interface StorageBackupRecord {
  id: string;
  documentId: string;
  documentVersion: number;
  format: 'vgt-encrypted-container-v2';
  container: Uint8Array;
  createdAt: number;
  labelDigest: string;
  /** Legacy v3 field. Never written by v4. */
  label?: string;
}

export interface StorageBackupDescriptor extends StorageBackupRecord {
  decryptedLabel: string;
}
export interface StorageCredentialOptions { pin?: string | null; password?: string | null; }
