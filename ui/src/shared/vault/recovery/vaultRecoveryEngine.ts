import type {
  VaultFile,
  VaultFolder,
  VaultRecoveryDocumentSnapshot,
  VaultRecoverySnapshot,
  VaultTrashEntry,
  VaultTrashRetentionPolicy,
  WorkspaceDocument,
} from '../../contracts/workspace';
import { sha256Text, stableJsonStringify, stableWorkspaceDocumentJson } from '../integrity/vaultIntegrity';

export const MAX_VAULT_TRASH_RETENTION_DAYS = 3650;
export const MAX_VAULT_BULK_RESTORE = 1000;
export const MAX_VAULT_RECOVERY_DOCUMENTS = 512;
export const MAX_VAULT_RECOVERY_SNAPSHOT_BYTES = 128 * 1024 * 1024;
export const MAX_VAULT_RECOVERY_TOTAL_BYTES = 512 * 1024 * 1024;
export const MAX_VAULT_RECOVERY_SNAPSHOTS = 16;
export const EMPTY_TRASH_CONFIRMATION = 'EMPTY TRASH';

export const DEFAULT_VAULT_TRASH_RETENTION: VaultTrashRetentionPolicy = {
  version: 1,
  maxAgeDays: 30,
};

export interface VaultRecoveryState {
  files: VaultFile[];
  folders: VaultFolder[];
  trash: VaultTrashEntry[];
}

const encoder = new TextEncoder();
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const safeLabel = (value?: string) => {
  const normalized = value?.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, 120) : undefined;
};

export function normalizeVaultTrashRetention(input?: Partial<VaultTrashRetentionPolicy>): VaultTrashRetentionPolicy {
  const maxAgeDays = Math.max(1, Math.min(MAX_VAULT_TRASH_RETENTION_DAYS, Math.trunc(input?.maxAgeDays ?? DEFAULT_VAULT_TRASH_RETENTION.maxAgeDays)));
  return { version: 1, maxAgeDays };
}

export function moveVaultFileToTrash(state: VaultRecoveryState, fileId: string, now = Date.now()): VaultRecoveryState {
  const file = state.files.find((candidate) => candidate.id === fileId);
  if (!file) throw new Error('vault_trash_file_not_found');
  const entry: VaultTrashEntry = {
    id: `trash-${now}-${file.id}`,
    deletedAt: now,
    file: cloneJson(file),
    originalFolderId: file.folderId ?? null,
  };
  return { ...state, files: state.files.filter((candidate) => candidate.id !== fileId), trash: [entry, ...state.trash] };
}

function resolveRestoreFolder(state: VaultRecoveryState, entry: VaultTrashEntry, destinationFolderId?: string | null): string | null {
  const target = destinationFolderId === undefined ? (entry.originalFolderId ?? entry.file.folderId ?? null) : destinationFolderId;
  if (target !== null && !state.folders.some((folder) => folder.id === target)) throw new Error('vault_trash_restore_folder_missing');
  return target;
}

export function restoreVaultTrashEntries(
  state: VaultRecoveryState,
  trashIds: readonly string[],
  destinationFolderId?: string | null,
  now = Date.now(),
): VaultRecoveryState {
  const ids = [...new Set(trashIds)];
  if (!ids.length) throw new Error('vault_trash_restore_selection_required');
  if (ids.length > MAX_VAULT_BULK_RESTORE) throw new Error('vault_trash_bulk_restore_limit');
  const entries = ids.map((id) => {
    const entry = state.trash.find((candidate) => candidate.id === id);
    if (!entry) throw new Error('vault_trash_entry_not_found');
    return entry;
  });
  const activeIds = new Set(state.files.map((file) => file.id));
  for (const entry of entries) if (activeIds.has(entry.file.id)) throw new Error('vault_trash_restore_id_conflict');
  const restored = entries.map((entry) => ({ ...cloneJson(entry.file), folderId: resolveRestoreFolder(state, entry, destinationFolderId), lastModified: now }));
  const selected = new Set(ids);
  return { ...state, files: [...restored, ...state.files], trash: state.trash.filter((entry) => !selected.has(entry.id)) };
}

export function restoreVaultTrashEntry(state: VaultRecoveryState, trashId: string, now = Date.now(), destinationFolderId?: string | null): VaultRecoveryState {
  return restoreVaultTrashEntries(state, [trashId], destinationFolderId, now);
}

export function purgeVaultTrashEntry(state: VaultRecoveryState, trashId: string): VaultRecoveryState {
  if (!state.trash.some((entry) => entry.id === trashId)) throw new Error('vault_trash_entry_not_found');
  return { ...state, trash: state.trash.filter((entry) => entry.id !== trashId) };
}

export function emptyVaultTrash(state: VaultRecoveryState, confirmation: string): VaultRecoveryState {
  if (confirmation !== EMPTY_TRASH_CONFIRMATION) throw new Error('vault_trash_confirmation_required');
  return { ...state, trash: [] };
}

export function applyVaultTrashRetention(
  state: VaultRecoveryState,
  policyInput?: Partial<VaultTrashRetentionPolicy>,
  now = Date.now(),
): { state: VaultRecoveryState; purged: number } {
  const policy = normalizeVaultTrashRetention(policyInput);
  const cutoff = now - policy.maxAgeDays * 86_400_000;
  const trash = state.trash.filter((entry) => entry.deletedAt >= cutoff);
  return { state: { ...state, trash }, purged: state.trash.length - trash.length };
}

export function vaultTrashUsage(trash: readonly VaultTrashEntry[]) {
  return { count: trash.length, bytes: trash.reduce((sum, entry) => sum + Math.max(0, entry.file.sizeBytes || 0), 0) };
}

export function vaultPurgeSemantics() {
  return {
    logicalPurge: true,
    cryptographicKeyDestruction: false,
    physicalOverwriteClaim: false,
    reason: 'Current Vault containers use a shared container key; per-file key destruction is not claimed.',
  } as const;
}

const recoveryDigestPayload = (snapshot: Pick<VaultRecoverySnapshot, 'files' | 'folders' | 'trash' | 'documents'>) => ({
  files: snapshot.files,
  folders: snapshot.folders,
  trash: snapshot.trash,
  documents: snapshot.documents,
});
const recoveryDigestInput = (snapshot: Pick<VaultRecoverySnapshot, 'files' | 'folders' | 'trash' | 'documents'>) => stableJsonStringify(recoveryDigestPayload(snapshot));
const legacyRecoveryDigestInput = (snapshot: Pick<VaultRecoverySnapshot, 'files' | 'folders' | 'trash' | 'documents'>) => JSON.stringify(recoveryDigestPayload(snapshot));

export async function createVaultRecoverySnapshot(
  state: VaultRecoveryState,
  documents: readonly WorkspaceDocument[],
  vaultDocumentId: string,
  options: { label?: string; now?: number } = {},
): Promise<VaultRecoverySnapshot> {
  const candidates = documents.filter((document) => document.id !== vaultDocumentId);
  if (candidates.length > MAX_VAULT_RECOVERY_DOCUMENTS) throw new Error('vault_recovery_document_limit');
  const documentSnapshots: VaultRecoveryDocumentSnapshot[] = [];
  for (const document of candidates) {
    const snapshotJson = stableWorkspaceDocumentJson(document);
    const snapshotBytes = encoder.encode(snapshotJson).byteLength;
    documentSnapshots.push({
      documentId: document.id,
      documentKind: document.kind,
      snapshotJson,
      contentDigest: await sha256Text(snapshotJson),
      snapshotBytes,
    });
  }
  const draft = {
    files: cloneJson(state.files),
    folders: cloneJson(state.folders),
    trash: cloneJson(state.trash),
    documents: documentSnapshots,
  };
  const digestInput = recoveryDigestInput(draft);
  const snapshotBytes = encoder.encode(digestInput).byteLength;
  if (snapshotBytes > MAX_VAULT_RECOVERY_SNAPSHOT_BYTES) throw new Error('vault_recovery_snapshot_too_large');
  const contentDigest = await sha256Text(digestInput);
  const now = options.now ?? Date.now();
  return {
    id: `recovery-${now}-${contentDigest.slice(0, 12)}`,
    createdAt: now,
    label: safeLabel(options.label),
    integrityVersion: 2,
    ...draft,
    snapshotBytes,
    contentDigest,
  };
}

export function appendVaultRecoverySnapshot(existing: readonly VaultRecoverySnapshot[], snapshot: VaultRecoverySnapshot): VaultRecoverySnapshot[] {
  const next = [snapshot, ...existing.filter((candidate) => candidate.id !== snapshot.id)].sort((a, b) => b.createdAt - a.createdAt);
  const kept: VaultRecoverySnapshot[] = [];
  let totalBytes = 0;
  for (const candidate of next) {
    if (kept.length >= MAX_VAULT_RECOVERY_SNAPSHOTS) break;
    if (totalBytes + candidate.snapshotBytes > MAX_VAULT_RECOVERY_TOTAL_BYTES) continue;
    kept.push(candidate);
    totalBytes += candidate.snapshotBytes;
  }
  return kept;
}

export async function restoreVaultRecoverySnapshot(
  snapshot: VaultRecoverySnapshot,
  currentDocuments: readonly WorkspaceDocument[],
  now = Date.now(),
): Promise<{ state: VaultRecoveryState; updatedDocuments: WorkspaceDocument[]; recreatedDocuments: WorkspaceDocument[] }> {
  if (snapshot.integrityVersion !== undefined && snapshot.integrityVersion !== 2) throw new Error('vault_recovery_snapshot_integrity_version_unsupported');
  const canonicalDigestInput = recoveryDigestInput(snapshot);
  const digestCandidates = snapshot.integrityVersion === 2
    ? [canonicalDigestInput]
    : [legacyRecoveryDigestInput(snapshot), canonicalDigestInput];
  let verifiedDigestInput: string | null = null;
  for (const candidate of digestCandidates) {
    if (await sha256Text(candidate) === snapshot.contentDigest) {
      verifiedDigestInput = candidate;
      break;
    }
  }
  if (!verifiedDigestInput) throw new Error('vault_recovery_snapshot_integrity_failed');
  if (encoder.encode(verifiedDigestInput).byteLength !== snapshot.snapshotBytes) throw new Error('vault_recovery_snapshot_size_mismatch');

  const currentById = new Map(currentDocuments.map((document) => [document.id, document]));
  const updatedDocuments: WorkspaceDocument[] = [];
  const recreatedDocuments: WorkspaceDocument[] = [];
  for (const item of snapshot.documents) {
    if (encoder.encode(item.snapshotJson).byteLength !== item.snapshotBytes) throw new Error('vault_recovery_document_size_mismatch');
    if (await sha256Text(item.snapshotJson) !== item.contentDigest) throw new Error('vault_recovery_document_integrity_failed');
    const parsed = JSON.parse(item.snapshotJson) as WorkspaceDocument;
    if (parsed.id !== item.documentId || parsed.kind !== item.documentKind) throw new Error('vault_recovery_document_identity_mismatch');
    const current = currentById.get(item.documentId);
    if (current) {
      if (current.kind !== item.documentKind) throw new Error('vault_recovery_document_kind_mismatch');
      updatedDocuments.push({ ...parsed, id: current.id, created_at: current.created_at, version: current.version + 1, modified_at: now });
    } else {
      recreatedDocuments.push({ ...parsed, version: parsed.version + 1, modified_at: now });
    }
  }
  return { state: { files: cloneJson(snapshot.files), folders: cloneJson(snapshot.folders), trash: cloneJson(snapshot.trash) }, updatedDocuments, recreatedDocuments };
}

export function vaultRecoveryStorageUsage(snapshots: readonly VaultRecoverySnapshot[]) {
  return { count: snapshots.length, bytes: snapshots.reduce((sum, snapshot) => sum + snapshot.snapshotBytes, 0) };
}
