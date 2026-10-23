import type { KeyVaultStatus, VaultStorageCapacitySnapshot, VaultStorageHealthState, WorkspaceDocument } from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';

export const CURRENT_VAULT_STORAGE_SCHEMA_VERSION = 1;
export const MAX_STALE_TRANSACTION_AGE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_VAULT_STORAGE_HEALTH_STATE: VaultStorageHealthState = Object.freeze({
  version: 1,
  migrationVersion: CURRENT_VAULT_STORAGE_SCHEMA_VERSION,
  readOnlyRecoveryMode: false,
});

export interface VaultSizeBreakdown {
  activeFilesBytes: number;
  versionBytes: number;
  trashBytes: number;
  recoverySnapshotBytes: number;
  searchIndexBytes: number;
  metadataBytes: number;
  logicalVaultBytes: number;
  referencedBackupBytes: number;
}

export interface VaultBackupFreshness {
  state: 'fresh' | 'stale' | 'never' | 'manual';
  latestVerifiedAt?: number;
  ageMs?: number;
  expectedWithinMs?: number;
}

export interface VaultKeyProviderHealth {
  state: 'ready' | 'locked' | 'software_or_unknown' | 'unavailable';
  platform: string;
  connected: boolean;
  hardwareBacked: boolean;
}

export interface VaultStorageHealthReport {
  createdAt: number;
  capacity: VaultStorageCapacitySnapshot;
  sizes: VaultSizeBreakdown;
  orphanRefs: string[];
  incompleteTransactions: string[];
  corruptFiles: number;
  missingFiles: number;
  latestIntegrityAt?: number;
  latestIntegrityMismatch: number;
  versionCount: number;
  trashCount: number;
  backupFreshness: VaultBackupFreshness;
  keyProvider: VaultKeyProviderHealth;
  migration: 'current' | 'pending' | 'unsupported_future';
  unsafeToWrite: boolean;
  unsafeReasons: string[];
}

const boundedInteger = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;

function jsonBytes(value: unknown, maxBytes = 8 * 1024 * 1024): number {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    return Math.min(bytes, maxBytes);
  } catch {
    return maxBytes;
  }
}

export function normalizeVaultStorageHealthState(input?: Partial<VaultStorageHealthState> | null): VaultStorageHealthState {
  const migrationVersion = boundedInteger(input?.migrationVersion, CURRENT_VAULT_STORAGE_SCHEMA_VERSION, 0, 1_000_000);
  return {
    version: 1,
    migrationVersion,
    readOnlyRecoveryMode: input?.readOnlyRecoveryMode === true,
    readOnlyReason: input?.readOnlyRecoveryMode === true ? String(input?.readOnlyReason || 'Manual recovery mode').slice(0, 256) : undefined,
    lastHealthScanAt: Number.isSafeInteger(input?.lastHealthScanAt) && Number(input?.lastHealthScanAt) > 0 ? Number(input?.lastHealthScanAt) : undefined,
    lastTransactionCleanupAt: Number.isSafeInteger(input?.lastTransactionCleanupAt) && Number(input?.lastTransactionCleanupAt) > 0 ? Number(input?.lastTransactionCleanupAt) : undefined,
  };
}

export function computeVaultSizeBreakdown(data: StoredVaultData): VaultSizeBreakdown {
  const activeFilesBytes = data.files.reduce((sum, file) => sum + Math.max(0, file.sizeBytes || 0), 0);
  const versionBytes = (data.versions ?? []).reduce((sum, version) => sum + Math.max(0, version.snapshotBytes || 0), 0);
  const trashBytes = data.trash.reduce((sum, entry) => sum + Math.max(0, entry.file.sizeBytes || 0), 0);
  const recoverySnapshotBytes = (data.recoverySnapshots ?? []).reduce((sum, snapshot) => sum + Math.max(0, snapshot.snapshotBytes || 0), 0);
  const searchIndexBytes = data.searchIndex ? jsonBytes(data.searchIndex, 16 * 1024 * 1024) : 0;
  const metadataBytes = jsonBytes({
    folders: data.folders,
    spaces: data.spaces,
    shares: data.shares,
    keyPolicy: data.keyPolicy,
    versionRetention: data.versionRetention,
    trashRetention: data.trashRetention,
    backupPolicy: data.backupPolicy,
    peerSyncPolicy: data.peerSyncPolicy,
    peerDevices: data.peerDevices,
    peerResume: data.peerResume,
    shareGrants: data.shareGrants,
    shareAudit: data.shareAudit,
    storageHealth: data.storageHealth,
  });
  const referencedBackupBytes = (data.backupCatalog ?? []).reduce((sum, entry) => sum + Math.max(0, entry.packageBytes || 0), 0);
  return {
    activeFilesBytes,
    versionBytes,
    trashBytes,
    recoverySnapshotBytes,
    searchIndexBytes,
    metadataBytes,
    logicalVaultBytes: activeFilesBytes + versionBytes + trashBytes + recoverySnapshotBytes + searchIndexBytes + metadataBytes,
    referencedBackupBytes,
  };
}

export function detectVaultOrphans(data: StoredVaultData, documents: WorkspaceDocument[]): string[] {
  const out: string[] = [];
  const folderIds = new Set(data.folders.map((folder) => folder.id));
  const fileIds = new Set(data.files.map((file) => file.id));
  const docIds = new Set(documents.map((doc) => doc.id));
  const peerIds = new Set((data.peerDevices ?? []).map((peer) => peer.id));
  const add = (kind: string, id: string, ref: string) => { if (out.length < 512) out.push(`${kind}:${id}:${ref}`); };
  for (const folder of data.folders) if (folder.parentId && !folderIds.has(folder.parentId)) add('folder_parent', folder.id, folder.parentId);
  for (const file of data.files) {
    if (file.folderId && !folderIds.has(file.folderId)) add('file_folder', file.id, file.folderId);
    if (file.sourceType === 'workspace-document' && file.documentId && !docIds.has(file.documentId)) add('file_document', file.id, file.documentId);
  }
  for (const version of data.versions ?? []) if (!fileIds.has(version.fileId)) add('version_file', version.id, version.fileId);
  for (const entry of data.searchIndex?.entries ?? []) if (!fileIds.has(entry.fileId)) add('search_file', entry.fileId, entry.fileId);
  for (const grant of data.shareGrants ?? []) if (!fileIds.has(grant.fileId)) add('share_file', grant.id, grant.fileId);
  for (const resume of data.peerResume ?? []) {
    if (!fileIds.has(resume.fileId)) add('resume_file', resume.sessionId, resume.fileId);
    if (!peerIds.has(resume.peerId)) add('resume_peer', resume.sessionId, resume.peerId);
  }
  for (const space of data.spaces) for (const fileId of space.fileIds ?? []) if (!fileIds.has(fileId)) add('space_file', space.id, fileId);
  return out;
}

export function listIncompleteVaultTransactions(data: StoredVaultData, now = Date.now()): string[] {
  const fileIds = new Set(data.files.map((file) => file.id));
  const peerIds = new Set((data.peerDevices ?? []).map((peer) => peer.id));
  return (data.peerResume ?? []).filter((resume) =>
    now - resume.updatedAt > MAX_STALE_TRANSACTION_AGE_MS || !fileIds.has(resume.fileId) || !peerIds.has(resume.peerId)
  ).slice(0, 512).map((resume) => resume.sessionId);
}

export function cleanupIncompleteVaultTransactions(data: StoredVaultData, now = Date.now()): { peerResume: NonNullable<StoredVaultData['peerResume']>; removed: string[] } {
  const stale = new Set(listIncompleteVaultTransactions(data, now));
  return { peerResume: (data.peerResume ?? []).filter((resume) => !stale.has(resume.sessionId)), removed: [...stale] };
}

export function computeVaultBackupFreshness(data: StoredVaultData, now = Date.now()): VaultBackupFreshness {
  const latest = [...(data.backupCatalog ?? [])].sort((a, b) => b.verifiedAt - a.verifiedAt)[0];
  const schedule = data.backupPolicy?.schedule;
  if (!schedule?.enabled) return latest ? { state: 'manual', latestVerifiedAt: latest.verifiedAt, ageMs: Math.max(0, now - latest.verifiedAt) } : { state: 'manual' };
  const expectedWithinMs = schedule.cadence === 'daily' ? 48 * 60 * 60 * 1000 : 10 * 24 * 60 * 60 * 1000;
  if (!latest) return { state: 'never', expectedWithinMs };
  const ageMs = Math.max(0, now - latest.verifiedAt);
  return { state: ageMs <= expectedWithinMs ? 'fresh' : 'stale', latestVerifiedAt: latest.verifiedAt, ageMs, expectedWithinMs };
}

export function computeVaultKeyProviderHealth(status: KeyVaultStatus): VaultKeyProviderHealth {
  const connected = status.coreConnected === true;
  return {
    state: !connected ? 'software_or_unknown' : status.isLocked ? 'locked' : 'ready',
    platform: status.platform || 'Unknown provider',
    connected,
    hardwareBacked: connected
      && status.hardwareBacked === true
      && status.hardwareAttestationVerified === true
      && status.hardwareSlotSupported === true,
  };
}

export function buildVaultStorageHealthReport(
  data: StoredVaultData,
  documents: WorkspaceDocument[],
  keyStatus: KeyVaultStatus,
  capacity: VaultStorageCapacitySnapshot,
  now = Date.now(),
): VaultStorageHealthReport {
  const health = normalizeVaultStorageHealthState(data.storageHealth);
  const sizes = computeVaultSizeBreakdown(data);
  const orphanRefs = detectVaultOrphans(data, documents);
  const incompleteTransactions = listIncompleteVaultTransactions(data, now);
  const corruptFiles = data.files.filter((file) => file.status === 'corrupt' || file.integrityState === 'mismatch').length;
  const missingFiles = data.files.filter((file) => file.status === 'missing').length;
  const latestIntegrity = [...(data.integrityAudits ?? [])].sort((a, b) => b.createdAt - a.createdAt)[0];
  const migration = health.migrationVersion === CURRENT_VAULT_STORAGE_SCHEMA_VERSION
    ? 'current'
    : health.migrationVersion < CURRENT_VAULT_STORAGE_SCHEMA_VERSION ? 'pending' : 'unsupported_future';
  const unsafeReasons: string[] = [];
  if (migration !== 'current') unsafeReasons.push(`migration_${migration}`);
  if (corruptFiles > 0 || missingFiles > 0 || (latestIntegrity?.mismatch ?? 0) > 0) unsafeReasons.push('integrity_failure');
  if (capacity.totalBytes && capacity.freeBytes !== undefined) {
    const floor = Math.max(64 * 1024 * 1024, Math.floor(capacity.totalBytes * 0.02));
    if (capacity.freeBytes < floor) unsafeReasons.push('storage_capacity_critical');
  }
  return {
    createdAt: now,
    capacity,
    sizes,
    orphanRefs,
    incompleteTransactions,
    corruptFiles,
    missingFiles,
    latestIntegrityAt: latestIntegrity?.createdAt,
    latestIntegrityMismatch: latestIntegrity?.mismatch ?? 0,
    versionCount: (data.versions ?? []).length,
    trashCount: data.trash.length,
    backupFreshness: computeVaultBackupFreshness(data, now),
    keyProvider: computeVaultKeyProviderHealth(keyStatus),
    migration,
    unsafeToWrite: unsafeReasons.length > 0,
    unsafeReasons,
  };
}

export function setVaultReadOnlyRecoveryMode(state: VaultStorageHealthState | undefined, enabled: boolean, reason?: string, now = Date.now()): VaultStorageHealthState {
  const current = normalizeVaultStorageHealthState(state);
  return {
    ...current,
    readOnlyRecoveryMode: enabled,
    /**
     * Befund + Fix (Runde 82, V-035): Die Begründung wurde auf 256 Zeichen begrenzt, aber **nicht getrimmt**
     * und nicht auf Brauchbarkeit geprüft. Gemessen: `setVaultReadOnlyRecoveryMode(state, true, '  Text  ')`
     * ergab `'  Text  '`. Diese Zeichenkette wird dem Nutzer angezeigt (`VaultStorageHealthPanel`), also
     * erbte sie führende Leerzeichen und — bei ausschließlich whitespace — eine leere Begründung, die wie
     * ein Anzeigefehler aussieht. Jetzt wird getrimmt und ein unbrauchbarer Wert durch den Standardtext
     * ersetzt; nur die tatsächliche Länge bleibt begrenzt.
     */
    readOnlyReason: enabled
      ? (String(reason ?? '').trim() || 'Storage health requires recovery mode').slice(0, 256)
      : undefined,
    lastHealthScanAt: current.lastHealthScanAt ?? now,
  };
}
