import { toOwnedArrayBuffer } from '../../binary/ownedBufferSource';
import type {
  VaultBackupCatalogEntry,
  VaultBackupDocumentDigest,
  VaultBackupPolicy,
  VaultBackupSchedule,
  VaultBackupTargetDefinition,
  WorkspaceDocument,
} from '../../contracts/workspace';

export const VAULT_BACKUP_FORMAT = 'VGT_VAULT_BACKUP_V1' as const;
export const MAX_VAULT_BACKUP_DOCUMENTS = 1024;
export const MAX_VAULT_BACKUP_DOCUMENT_BYTES = 32 * 1024 * 1024;
export const MAX_VAULT_BACKUP_BUNDLE_BYTES = 96 * 1024 * 1024;
export const MAX_VAULT_BACKUP_CATALOG = 256;
export const DEFAULT_VAULT_BACKUP_POLICY: VaultBackupPolicy = Object.freeze({
  version: 1,
  mode: 'full',
  verifyAfterWrite: true,
  keyMode: 'inherit_vault',
  retentionCount: 10,
  retentionDays: 90,
});

export interface VaultBackupDocumentPayload extends VaultBackupDocumentDigest {
  snapshotJson: string;
}

export interface VaultBackupBundle {
  format: typeof VAULT_BACKUP_FORMAT;
  version: 1;
  id: string;
  createdAt: number;
  sourceVaultDocumentId: string;
  mode: 'full' | 'incremental';
  baseBackupId?: string;
  documents: VaultBackupDocumentPayload[];
  deletedDocumentIds: string[];
  documentDigests: VaultBackupDocumentDigest[];
}

export interface VaultBackupPreview {
  id: string;
  createdAt: number;
  mode: 'full' | 'incremental';
  baseBackupId?: string;
  changedDocuments: Array<{ id: string; title: string; kind: string; sizeBytes: number }>;
  deletedDocumentIds: string[];
  totalWorkspaceDocuments: number;
  vaultFiles: Array<{ id: string; name: string; sizeBytes: number; folderId?: string | null }>;
}

export interface VaultBackupRetentionResult {
  kept: VaultBackupCatalogEntry[];
  expired: VaultBackupCatalogEntry[];
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}

export function normalizeVaultBackupPolicy(input?: Partial<VaultBackupPolicy> | null): VaultBackupPolicy {
  const target = input?.target ? normalizeVaultBackupTarget(input.target) : undefined;
  return {
    version: 1,
    mode: input?.mode === 'incremental' ? 'incremental' : 'full',
    verifyAfterWrite: true,
    keyMode: input?.keyMode === 'independent_password' ? 'independent_password' : 'inherit_vault',
    retentionCount: integer(input?.retentionCount, 10, 1, MAX_VAULT_BACKUP_CATALOG),
    retentionDays: integer(input?.retentionDays, 90, 1, 3650),
    target,
    schedule: input?.schedule ? normalizeVaultBackupSchedule(input.schedule) : undefined,
  };
}

export function normalizeVaultBackupTarget(input: VaultBackupTargetDefinition): VaultBackupTargetDefinition {
  const kinds = new Set(['local_folder','external_drive','removable_media','nas_self_hosted']);
  if (!kinds.has(input.kind)) throw new Error('vault_backup_target_kind_invalid');
  const transport = input.transport === 'webdav_https' ? 'webdav_https' : 'filesystem_access';
  if (input.kind === 'nas_self_hosted' && transport === 'webdav_https' && input.endpointUrl) {
    const url = new URL(input.endpointUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('vault_backup_target_url_invalid');
  }
  if (input.kind !== 'nas_self_hosted' && transport === 'webdav_https') throw new Error('vault_backup_transport_invalid');
  if (input.airGapped && transport !== 'filesystem_access') throw new Error('vault_backup_airgap_network_invalid');
  return {
    id: String(input.id || '').slice(0, 128) || `backup-target-${Date.now()}`,
    label: String(input.label || 'Backup target').trim().slice(0, 160) || 'Backup target',
    kind: input.kind,
    transport,
    endpointUrl: transport === 'webdav_https' ? input.endpointUrl : undefined,
    username: transport === 'webdav_https' && input.username ? input.username.slice(0, 256) : undefined,
    hostTargetRef: input.hostTargetRef ? String(input.hostTargetRef).trim().slice(0,256) || undefined : undefined,
    airGapped: input.airGapped === true,
  };
}

export function normalizeVaultBackupSchedule(input: VaultBackupSchedule): VaultBackupSchedule {
  return {
    enabled: input.enabled === true,
    executor: input.executor === 'self_hosted' ? 'self_hosted' : 'local_agent',
    cadence: input.cadence === 'weekly' ? 'weekly' : 'daily',
    hourLocal: integer(input.hourLocal, 2, 0, 23),
    weekday: input.cadence === 'weekly' ? integer(input.weekday, 0, 0, 6) : undefined,
  };
}

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', toOwnedArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2,'0')).join('');
}

async function documentSnapshot(document: WorkspaceDocument): Promise<VaultBackupDocumentPayload> {
  const snapshotJson = JSON.stringify(document);
  const sizeBytes = new TextEncoder().encode(snapshotJson).byteLength;
  if (sizeBytes <= 0 || sizeBytes > MAX_VAULT_BACKUP_DOCUMENT_BYTES) throw new Error('vault_backup_document_size_limit');
  return { documentId: document.id, digest: await sha256Hex(snapshotJson), sizeBytes, snapshotJson };
}

/**
 * **V-012 — die Grenze wird genannt, bevor sie greift.**
 *
 * **Der Befund:** `MAX_VAULT_BACKUP_BUNDLE_BYTES` (96 MiB) und `MAX_VAULT_BACKUP_DOCUMENTS` (1024) gab es
 * schon, aber sie wurden **erst beim Überschreiten** sichtbar: `createVaultBackupBundle` wirft mitten im
 * Durchlauf (`vault_backup_bundle_size_limit`). Der Nutzer erfuhr die Grenze also **nachdem** er gewartet
 * hatte, und ohne Vorwarnung, wie groß sein Bündel wird.
 *
 * Diese Funktion beantwortet die Frage **vorher** — ohne die Dokumente zu hashen, weil nur die Größen
 * gebraucht werden. Dafür wird **dieselbe** Serialisierung benutzt wie beim echten Bündel
 * (`JSON.stringify(document)`), damit die Schätzung nicht neben der Wahrheit liegt: eine zweite Schätzmethode
 * wäre eine zweite Zahl für dieselbe Frage.
 *
 * **Grenze, offengelegt:** die Schätzung serialisiert jedes Dokument **einmal** zusätzlich. Sie ist damit
 * nicht kostenlos, aber sie ist billiger als ein abgebrochener Bündelaufbau und sie **hastet nicht**.
 */
export interface VaultBackupBundlePlan {
  documentCount: number;
  totalBytes: number;
  maxDocuments: number;
  maxBundleBytes: number;
  /** `true`, wenn das Bündel nach dieser Schätzung gebaut werden kann. */
  fits: boolean;
  /** Der Grund, falls es nicht passt — benannt, nicht bloß „zu groß". */
  exceeds?: 'document_count' | 'bundle_bytes';
  /** Welches Dokument die Grenze überschreitet (nur bei `bundle_bytes`). */
  largestDocumentId?: string;
}

export function planVaultBackupBundle(documents: readonly WorkspaceDocument[]): VaultBackupBundlePlan {
  const unique = new Map<string, WorkspaceDocument>();
  for (const document of documents) {
    if (!document?.id) continue;
    unique.set(document.id, document);
  }
  const maxDocuments = MAX_VAULT_BACKUP_DOCUMENTS;
  const maxBundleBytes = MAX_VAULT_BACKUP_BUNDLE_BYTES;
  if (unique.size > maxDocuments) {
    return { documentCount: unique.size, totalBytes: 0, maxDocuments, maxBundleBytes, fits: false, exceeds: 'document_count' };
  }
  let totalBytes = 0;
  let largestDocumentId: string | undefined;
  for (const document of [...unique.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const bytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;
    totalBytes += bytes;
    if (totalBytes > maxBundleBytes) {
      largestDocumentId = document.id;
      return { documentCount: unique.size, totalBytes, maxDocuments, maxBundleBytes, fits: false, exceeds: 'bundle_bytes', largestDocumentId };
    }
  }
  return { documentCount: unique.size, totalBytes, maxDocuments, maxBundleBytes, fits: true };
}

/** Der Satz, den die Oberfläche **vor** dem Lauf zeigt. Benennt die Zahl — nicht nur „zu groß". */
export function vaultBackupBundlePlanMessage(plan: VaultBackupBundlePlan): string {
  const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (plan.fits) return `This backup will contain ${plan.documentCount} document${plan.documentCount === 1 ? '' : 's'} — about ${mib(plan.totalBytes)} of ${mib(plan.maxBundleBytes)}.`;
  if (plan.exceeds === 'document_count') return `A backup bundle accepts at most ${plan.maxDocuments} documents; this selection has ${plan.documentCount}.`;
  return `A backup bundle accepts at most ${mib(plan.maxBundleBytes)}; this selection reaches ${mib(plan.totalBytes)}. Remove documents before running the backup.`;
}

export async function createVaultBackupBundle(
  documents: readonly WorkspaceDocument[],
  sourceVaultDocumentId: string,
  mode: 'full' | 'incremental',
  base?: VaultBackupCatalogEntry,
  now = Date.now(),
): Promise<VaultBackupBundle> {
  const unique = new Map<string, WorkspaceDocument>();
  for (const document of documents) {
    if (!document?.id || unique.has(document.id)) throw new Error('vault_backup_document_id_invalid_or_duplicate');
    unique.set(document.id, document);
  }
  if (!unique.has(sourceVaultDocumentId)) throw new Error('vault_backup_source_vault_missing');
  if (unique.size > MAX_VAULT_BACKUP_DOCUMENTS) throw new Error('vault_backup_document_count_limit');
  if (mode === 'incremental' && !base) throw new Error('vault_backup_incremental_base_required');

  const snapshots: VaultBackupDocumentPayload[] = [];
  let totalBytes = 0;
  for (const document of [...unique.values()].sort((a,b)=>a.id.localeCompare(b.id))) {
    const snapshot = await documentSnapshot(document);
    totalBytes += snapshot.sizeBytes;
    if (totalBytes > MAX_VAULT_BACKUP_BUNDLE_BYTES) throw new Error('vault_backup_bundle_size_limit');
    snapshots.push(snapshot);
  }
  const documentDigests = snapshots.map(({documentId,digest,sizeBytes})=>({documentId,digest,sizeBytes}));
  const baseMap = new Map((base?.documentDigests ?? []).map((entry)=>[entry.documentId,entry.digest]));
  const changed = mode === 'full' ? snapshots : snapshots.filter((entry)=>baseMap.get(entry.documentId)!==entry.digest);
  const deletedDocumentIds = mode === 'incremental'
    ? (base?.documentDigests ?? []).map((entry)=>entry.documentId).filter((id)=>!unique.has(id)).sort()
    : [];
  const idSeed = `${sourceVaultDocumentId}:${now}:${mode}:${changed.map(x=>x.digest).join(':')}:${deletedDocumentIds.join(':')}`;
  const suffix = (await sha256Hex(idSeed)).slice(0,16);
  return {
    format: VAULT_BACKUP_FORMAT,
    version: 1,
    id: `vault-backup-${now}-${suffix}`,
    createdAt: now,
    sourceVaultDocumentId,
    mode,
    baseBackupId: mode === 'incremental' ? base?.id : undefined,
    documents: changed,
    deletedDocumentIds,
    documentDigests,
  };
}

export async function validateVaultBackupBundle(bundle: VaultBackupBundle): Promise<VaultBackupBundle> {
  if (!bundle || bundle.format !== VAULT_BACKUP_FORMAT || bundle.version !== 1) throw new Error('vault_backup_format_invalid');
  if (!bundle.id || !Number.isSafeInteger(bundle.createdAt) || bundle.createdAt <= 0) throw new Error('vault_backup_metadata_invalid');
  if (bundle.mode === 'incremental' && !bundle.baseBackupId) throw new Error('vault_backup_incremental_base_required');
  if (bundle.documents.length > MAX_VAULT_BACKUP_DOCUMENTS || bundle.documentDigests.length > MAX_VAULT_BACKUP_DOCUMENTS) throw new Error('vault_backup_document_count_limit');
  let total = 0;
  const ids = new Set<string>();
  for (const item of bundle.documents) {
    if (!item.documentId || ids.has(item.documentId)) throw new Error('vault_backup_payload_duplicate');
    ids.add(item.documentId);
    const bytes = new TextEncoder().encode(item.snapshotJson).byteLength;
    total += bytes;
    if (bytes !== item.sizeBytes || bytes > MAX_VAULT_BACKUP_DOCUMENT_BYTES || total > MAX_VAULT_BACKUP_BUNDLE_BYTES) throw new Error('vault_backup_payload_size_invalid');
    if (await sha256Hex(item.snapshotJson) !== item.digest) throw new Error('vault_backup_payload_integrity_failed');
    const parsed = JSON.parse(item.snapshotJson) as WorkspaceDocument;
    if (!parsed || parsed.id !== item.documentId || typeof parsed.kind !== 'string') throw new Error('vault_backup_document_snapshot_invalid');
  }
  const manifestIds = new Set<string>();
  for (const item of bundle.documentDigests) {
    if (!item.documentId || manifestIds.has(item.documentId) || !/^[a-f0-9]{64}$/.test(item.digest) || item.sizeBytes <= 0) throw new Error('vault_backup_manifest_invalid');
    manifestIds.add(item.documentId);
  }
  if (!manifestIds.has(bundle.sourceVaultDocumentId)) throw new Error('vault_backup_source_vault_missing');
  if (bundle.deletedDocumentIds.some((id)=>manifestIds.has(id))) throw new Error('vault_backup_tombstone_conflict');
  return bundle;
}

export async function previewVaultBackupBundle(bundle: VaultBackupBundle): Promise<VaultBackupPreview> {
  await validateVaultBackupBundle(bundle);
  const changedDocuments = bundle.documents.map((item)=>{
    const parsed = JSON.parse(item.snapshotJson) as WorkspaceDocument;
    return { id: parsed.id, title: parsed.title, kind: parsed.kind, sizeBytes: item.sizeBytes };
  });
  const vaultPayload = bundle.documents.find((item)=>item.documentId===bundle.sourceVaultDocumentId);
  const vaultDocument = vaultPayload ? JSON.parse(vaultPayload.snapshotJson) as WorkspaceDocument : undefined;
  return {
    id: bundle.id, createdAt: bundle.createdAt, mode: bundle.mode, baseBackupId: bundle.baseBackupId,
    changedDocuments, deletedDocumentIds: [...bundle.deletedDocumentIds], totalWorkspaceDocuments: bundle.documentDigests.length,
    vaultFiles: (vaultDocument?.vaultData?.files ?? []).map((file)=>({id:file.id,name:file.name,sizeBytes:file.sizeBytes,folderId:file.folderId})),
  };
}

export async function restoreVaultBackupChain(
  chain: readonly VaultBackupBundle[],
  selectedDocumentIds?: readonly string[],
): Promise<WorkspaceDocument[]> {
  if (!chain.length) throw new Error('vault_backup_chain_empty');
  const validated: VaultBackupBundle[] = [];
  for (const bundle of chain) validated.push(await validateVaultBackupBundle(bundle));
  if (validated[0].mode !== 'full') throw new Error('vault_backup_chain_full_required');
  for (let index=1; index<validated.length; index++) {
    const previous = validated[index-1]; const current = validated[index];
    if (current.mode !== 'incremental' || current.baseBackupId !== previous.id) throw new Error('vault_backup_chain_broken');
  }
  const state = new Map<string, WorkspaceDocument>();
  for (const bundle of validated) {
    for (const id of bundle.deletedDocumentIds) state.delete(id);
    for (const item of bundle.documents) state.set(item.documentId, JSON.parse(item.snapshotJson) as WorkspaceDocument);
  }
  const finalManifest = new Map(validated.at(-1)!.documentDigests.map((entry)=>[entry.documentId,entry]));
  if (state.size !== finalManifest.size) throw new Error('vault_backup_chain_manifest_mismatch');
  for (const [id, document] of state) {
    const expected = finalManifest.get(id); if (!expected) throw new Error('vault_backup_chain_manifest_mismatch');
    const json = JSON.stringify(document); if (await sha256Hex(json) !== expected.digest) throw new Error('vault_backup_chain_integrity_failed');
  }
  const selected = selectedDocumentIds ? new Set(selectedDocumentIds) : null;
  if (selected && [...selected].some((id)=>!state.has(id))) throw new Error('vault_backup_restore_selection_missing');
  return [...state.values()].filter((doc)=>!selected || selected.has(doc.id)).sort((a,b)=>a.id.localeCompare(b.id));
}

export function applyVaultBackupRetention(
  catalog: readonly VaultBackupCatalogEntry[],
  policyInput?: Partial<VaultBackupPolicy> | null,
  now = Date.now(),
): VaultBackupRetentionResult {
  const policy = normalizeVaultBackupPolicy(policyInput);
  const ordered = [...catalog].sort((a,b)=>b.createdAt-a.createdAt);
  const cutoff = now - policy.retentionDays * 86_400_000;
  const keepIds = new Set<string>();
  for (const entry of ordered) {
    if (keepIds.size < policy.retentionCount && entry.createdAt >= cutoff) keepIds.add(entry.id);
  }
  // Never prune a base package while a retained incremental still depends on it.
  const byId = new Map(ordered.map((entry)=>[entry.id,entry]));
  const stack = [...keepIds];
  while (stack.length) {
    const entry = byId.get(stack.pop()!);
    if (!entry?.baseBackupId || keepIds.has(entry.baseBackupId)) continue;
    if (!byId.has(entry.baseBackupId)) throw new Error('vault_backup_catalog_chain_broken');
    keepIds.add(entry.baseBackupId); stack.push(entry.baseBackupId);
  }
  const kept = ordered.filter((entry)=>keepIds.has(entry.id));
  const expired = ordered.filter((entry)=>!keepIds.has(entry.id));
  return { kept, expired };
}

export function isVaultBackupScheduleDue(scheduleInput: VaultBackupSchedule, lastRunAt: number | undefined, now: number): boolean {
  const schedule = normalizeVaultBackupSchedule(scheduleInput);
  if (!schedule.enabled || !Number.isFinite(now)) return false;
  const date = new Date(now);
  if (date.getHours() < schedule.hourLocal) return false;
  if (schedule.cadence === 'weekly' && date.getDay() !== schedule.weekday) return false;
  if (!lastRunAt) return true;
  const minGap = schedule.cadence === 'weekly' ? 6 * 86_400_000 : 20 * 3_600_000;
  return now - lastRunAt >= minGap;
}

export function backupCatalogEntryFromBundle(
  bundle: VaultBackupBundle,
  packageDigest: string,
  packageBytes: number,
  policyInput: Partial<VaultBackupPolicy>,
  targetLocator: string,
  verifiedAt: number,
): VaultBackupCatalogEntry {
  const policy = normalizeVaultBackupPolicy(policyInput);
  if (!policy.target) throw new Error('vault_backup_target_required');
  if (!/^[a-f0-9]{64}$/.test(packageDigest) || packageBytes <= 0 || !targetLocator) throw new Error('vault_backup_catalog_invalid');
  return {
    id: bundle.id, createdAt: bundle.createdAt, mode: bundle.mode, baseBackupId: bundle.baseBackupId,
    packageDigest, packageBytes, documentCount: bundle.documentDigests.length,
    changedDocumentCount: bundle.documents.length, deletedDocumentIds: [...bundle.deletedDocumentIds],
    documentDigests: bundle.documentDigests.map((entry)=>({...entry})), targetKind: policy.target.kind,
    targetId: policy.target.id, targetLocator, keyMode: policy.keyMode, verifiedAt, airGapped: policy.target.airGapped,
  };
}


export async function restoreSelectedVaultFiles(
  chain: readonly VaultBackupBundle[],
  currentVaultDocument: WorkspaceDocument,
  selectedFileIds: readonly string[],
  now = Date.now(),
): Promise<WorkspaceDocument> {
  if (!selectedFileIds.length) throw new Error('vault_backup_file_selection_empty');
  const documents = await restoreVaultBackupChain(chain);
  const backupVault = documents.find((doc)=>doc.id===chain.at(-1)?.sourceVaultDocumentId);
  if (!backupVault?.vaultData) throw new Error('vault_backup_vault_document_missing');
  const requested = new Set(selectedFileIds);
  const sourceFiles = backupVault.vaultData.files.filter((file)=>requested.has(file.id));
  if (sourceFiles.length !== requested.size) throw new Error('vault_backup_file_selection_missing');
  const currentData = currentVaultDocument.vaultData;
  if (!currentData) throw new Error('vault_backup_current_vault_missing');
  const sourceFolders = backupVault.vaultData.folders ?? []; const folderMap=new Map(sourceFolders.map((folder)=>[folder.id,folder]));
  const neededFolders=new Set<string>();
  for(const file of sourceFiles){let folderId=file.folderId??null;let depth=0;while(folderId){if(depth++>128)throw new Error('vault_backup_folder_depth_limit');const folder=folderMap.get(folderId);if(!folder)break;neededFolders.add(folder.id);folderId=folder.parentId??null;}}
  const existingFolders=new Set((currentData.folders??[]).map((folder)=>folder.id));
  const mergedFolders=[...(currentData.folders??[]),...sourceFolders.filter((folder)=>neededFolders.has(folder.id)&&!existingFolders.has(folder.id))];
  const restoredIds=new Set(sourceFiles.map((file)=>file.id));
  return {
    ...currentVaultDocument, version:currentVaultDocument.version+1, modified_at:now,
    vaultData:{...currentData,folders:mergedFolders,files:[...sourceFiles.map((file)=>({...file,lastModified:now})),...currentData.files.filter((file)=>!restoredIds.has(file.id))]},
  };
}
