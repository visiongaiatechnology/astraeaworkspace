import type { VaultFile, VaultFileVersion, VaultVersionRetentionPolicy, WorkspaceDocument } from '../../contracts/workspace';
import { buildVaultChunkIntegrity, dataUrlToBytes, sha256Bytes, stableWorkspaceDocumentJson } from '../integrity/vaultIntegrity';

export const MAX_VAULT_VERSIONS_PER_FILE = 128;
export const MAX_VAULT_VERSION_AGE_DAYS = 3650;
export const MAX_VAULT_VERSION_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export const MAX_VAULT_VERSION_TOTAL_BYTES = 512 * 1024 * 1024;
export const MAX_VAULT_COMPARE_LINES = 20_000;
export const MAX_VAULT_COMPARE_OUTPUT = 64;

export const DEFAULT_VAULT_VERSION_RETENTION: VaultVersionRetentionPolicy = {
  version: 1,
  maxVersionsPerFile: 30,
  maxAgeDays: 180,
  keepProtected: true,
};

const encoder = new TextEncoder();
const safeLabel = (value?: string) => {
  const next = value?.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
  return next ? next.slice(0, 120) : undefined;
};
const versionId = (fileId: string, now: number, digest: string) => `vver-${fileId}-${now}-${digest.slice(0, 12)}`;
const byNewest = (a: VaultFileVersion, b: VaultFileVersion) => b.createdAt - a.createdAt || a.id.localeCompare(b.id);

export function normalizeVaultVersionRetention(input?: Partial<VaultVersionRetentionPolicy>): VaultVersionRetentionPolicy {
  const cap = Math.max(1, Math.min(MAX_VAULT_VERSIONS_PER_FILE, Math.trunc(input?.maxVersionsPerFile ?? DEFAULT_VAULT_VERSION_RETENTION.maxVersionsPerFile)));
  const age = Math.max(1, Math.min(MAX_VAULT_VERSION_AGE_DAYS, Math.trunc(input?.maxAgeDays ?? DEFAULT_VAULT_VERSION_RETENTION.maxAgeDays)));
  return { version: 1, maxVersionsPerFile: cap, maxAgeDays: age, keepProtected: true };
}

export function vaultVersionsForFile(versions: readonly VaultFileVersion[], fileId: string): VaultFileVersion[] {
  return versions.filter((item) => item.fileId === fileId).sort(byNewest);
}

export async function captureVaultFileVersion(
  file: VaultFile,
  documents: readonly WorkspaceDocument[],
  versions: readonly VaultFileVersion[],
  options: { source?: VaultFileVersion['source']; label?: string; protectedHold?: boolean; now?: number; allowDuplicate?: boolean } = {},
): Promise<VaultFileVersion[]> {
  const now = options.now ?? Date.now();
  const source = options.source ?? 'automatic';
  let snapshotKind: VaultFileVersion['snapshotKind'];
  let payloadDataUrl: string | undefined;
  let workspaceSnapshotJson: string | undefined;
  let workspaceDocumentVersion: number | undefined;
  let snapshotBytes = 0;
  let digest = '';

  if (file.sourceType === 'attachment') {
    if (!file.payloadDataUrl) throw new Error('vault_version_attachment_payload_unavailable');
    const bytes = dataUrlToBytes(file.payloadDataUrl);
    if (bytes.byteLength > MAX_VAULT_VERSION_SNAPSHOT_BYTES) throw new Error('vault_version_snapshot_too_large');
    snapshotKind = 'attachment';
    payloadDataUrl = file.payloadDataUrl;
    snapshotBytes = bytes.byteLength;
    digest = await sha256Bytes(bytes);
  } else if (file.sourceType === 'workspace-document' && file.documentId) {
    const current = documents.find((candidate) => candidate.id === file.documentId);
    if (!current) throw new Error('vault_version_workspace_document_unavailable');
    workspaceSnapshotJson = stableWorkspaceDocumentJson(current);
    const bytes = encoder.encode(workspaceSnapshotJson);
    if (bytes.byteLength > MAX_VAULT_VERSION_SNAPSHOT_BYTES) throw new Error('vault_version_snapshot_too_large');
    snapshotKind = 'workspace-document';
    workspaceDocumentVersion = current.version;
    snapshotBytes = bytes.byteLength;
    digest = await sha256Bytes(bytes);
  } else {
    throw new Error('vault_version_source_unsupported');
  }

  const existing = versions.find((item) => item.fileId === file.id && item.contentDigest === digest && item.snapshotKind === snapshotKind);
  if (existing && !options.allowDuplicate) {
    if (source !== 'named' && !options.label && !options.protectedHold) return [...versions];
    return versions.map((item) => item.id === existing.id ? {
      ...item,
      source: source === 'automatic' ? item.source : source,
      label: safeLabel(options.label) ?? item.label,
      protectedHold: Boolean(item.protectedHold || options.protectedHold),
    } : item);
  }

  const total = versions.reduce((sum, item) => sum + item.snapshotBytes, 0);
  if (total + snapshotBytes > MAX_VAULT_VERSION_TOTAL_BYTES) throw new Error('vault_version_total_storage_limit');
  const next: VaultFileVersion = {
    id: versionId(file.id, now, digest),
    fileId: file.id,
    createdAt: now,
    source,
    label: safeLabel(options.label),
    originalName: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    snapshotBytes,
    contentDigest: digest,
    snapshotKind,
    payloadDataUrl,
    workspaceSnapshotJson,
    workspaceDocumentVersion,
    protectedHold: Boolean(options.protectedHold),
  };
  return [next, ...versions];
}

export function nameVaultVersion(versions: readonly VaultFileVersion[], versionIdValue: string, label: string): VaultFileVersion[] {
  const normalized = safeLabel(label);
  if (!normalized) throw new Error('vault_version_label_required');
  let found = false;
  const next = versions.map((item) => {
    if (item.id !== versionIdValue) return item;
    found = true;
    return { ...item, source: 'named' as const, label: normalized };
  });
  if (!found) throw new Error('vault_version_not_found');
  return next;
}

export function setVaultVersionHold(versions: readonly VaultFileVersion[], versionIdValue: string, protectedHold: boolean): VaultFileVersion[] {
  let found = false;
  const next = versions.map((item) => {
    if (item.id !== versionIdValue) return item;
    found = true;
    return { ...item, protectedHold };
  });
  if (!found) throw new Error('vault_version_not_found');
  return next;
}

export function applyVaultVersionRetention(
  versions: readonly VaultFileVersion[],
  input?: Partial<VaultVersionRetentionPolicy>,
  now = Date.now(),
): VaultFileVersion[] {
  const policy = normalizeVaultVersionRetention(input);
  const cutoff = now - policy.maxAgeDays * 86_400_000;
  const files = new Map<string, VaultFileVersion[]>();
  for (const item of versions) files.set(item.fileId, [...(files.get(item.fileId) ?? []), item]);
  const kept: VaultFileVersion[] = [];
  for (const group of files.values()) {
    const sorted = group.sort(byNewest);
    let ordinaryKept = 0;
    for (const item of sorted) {
      if (item.protectedHold) { kept.push(item); continue; }
      if (item.createdAt < cutoff) continue;
      if (ordinaryKept >= policy.maxVersionsPerFile) continue;
      ordinaryKept += 1;
      kept.push(item);
    }
  }
  return kept.sort(byNewest);
}

export function vaultVersionStorageUsage(versions: readonly VaultFileVersion[]) {
  const totalBytes = versions.reduce((sum, item) => sum + item.snapshotBytes, 0);
  const heldBytes = versions.filter((item) => item.protectedHold).reduce((sum, item) => sum + item.snapshotBytes, 0);
  return { totalBytes, heldBytes, versionCount: versions.length, heldCount: versions.filter((item) => item.protectedHold).length };
}

export async function assertVaultVersionSnapshotIntegrity(version: VaultFileVersion): Promise<void> {
  let bytes: Uint8Array;
  if (version.snapshotKind === 'attachment') {
    if (!version.payloadDataUrl) throw new Error('vault_version_snapshot_missing');
    bytes = dataUrlToBytes(version.payloadDataUrl);
  } else {
    if (!version.workspaceSnapshotJson) throw new Error('vault_version_snapshot_missing');
    bytes = encoder.encode(version.workspaceSnapshotJson);
  }
  if (bytes.byteLength !== version.snapshotBytes) throw new Error('vault_version_snapshot_size_mismatch');
  const digest = await sha256Bytes(bytes);
  if (digest !== version.contentDigest) throw new Error('vault_version_snapshot_integrity_failed');
}

export type VaultVersionPreview =
  | { kind: 'text'; text: string }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'pdf'; dataUrl: string }
  | { kind: 'workspace'; document: WorkspaceDocument }
  | { kind: 'binary'; message: string };

/**
 * Vorschau einer historischen Version — **integritätsgeprüft vor dem Parsen**.
 *
 * Gemessener Befund (AST-1164, Defekt V-008): Die vorige Fassung war synchron und parste
 * `workspaceSnapshotJson` mit `JSON.parse` **bevor** irgendeine Digest-Prüfung lief. Eine manipulierte
 * Version konnte damit einen Syntaxfehler auslösen, dessen Meldung nach einem Formatproblem klingt,
 * obwohl in Wahrheit die Integrität verletzt war — und bei gültigem JSON wäre der manipulierte Inhalt
 * angezeigt worden, ohne dass der Digest je verglichen wurde. `restoreVaultVersion` prüfte dagegen
 * korrekt zuerst (`assertVaultVersionSnapshotIntegrity`), weshalb **derselbe** Snapshot beim
 * Wiederherstellen abgelehnt und beim Anzeigen akzeptiert wurde. Zwei Regeln für eine Frage.
 *
 * Die Funktion ist deshalb `async` und ruft die Digest-Prüfung als **ersten** Schritt. Die Umstellung ist
 * bewusst in Kauf genommen: eine Inhaltsprüfung, die den Inhalt schon geparst hat, ist keine Prüfung mehr.
 */
export async function previewVaultVersion(version: VaultFileVersion): Promise<VaultVersionPreview> {
  await assertVaultVersionSnapshotIntegrity(version);
  if (version.snapshotKind === 'workspace-document') {
    if (!version.workspaceSnapshotJson) throw new Error('vault_version_snapshot_missing');
    return { kind: 'workspace', document: JSON.parse(version.workspaceSnapshotJson) as WorkspaceDocument };
  }
  if (!version.payloadDataUrl) throw new Error('vault_version_snapshot_missing');
  if (version.mimeType?.startsWith('image/')) return { kind: 'image', dataUrl: version.payloadDataUrl };
  if (version.mimeType === 'application/pdf') return { kind: 'pdf', dataUrl: version.payloadDataUrl };
  if (version.mimeType?.startsWith('text/') || version.mimeType === 'application/json') {
    const bytes = dataUrlToBytes(version.payloadDataUrl);
    if (bytes.byteLength > 2 * 1024 * 1024) return { kind: 'binary', message: 'Text preview is bounded to 2 MiB.' };
    return { kind: 'text', text: new TextDecoder('utf-8', { fatal: false }).decode(bytes) };
  }
  return { kind: 'binary', message: 'This historical binary is available for explicit download, not execution.' };
}

export interface VaultVersionCompareResult { supported: boolean; added: number; removed: number; changed: number; sample: string[]; reason?: string }

const compareText = (before: string, after: string): VaultVersionCompareResult => {
  const a = before.split(/\r?\n/).slice(0, MAX_VAULT_COMPARE_LINES);
  const b = after.split(/\r?\n/).slice(0, MAX_VAULT_COMPARE_LINES);
  const max = Math.max(a.length, b.length);
  let added = 0, removed = 0, changed = 0;
  const sample: string[] = [];
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) added++;
    else if (b[i] === undefined) removed++;
    else changed++;
    if (sample.length < MAX_VAULT_COMPARE_OUTPUT) sample.push(`L${i + 1}: ${a[i] ?? '∅'} → ${b[i] ?? '∅'}`.slice(0, 600));
  }
  return { supported: true, added, removed, changed, sample };
};

export function compareVaultVersions(before: VaultFileVersion, after: VaultFileVersion): VaultVersionCompareResult {
  if (before.fileId !== after.fileId) throw new Error('vault_version_compare_file_mismatch');
  if (before.snapshotKind !== after.snapshotKind) return { supported: false, added: 0, removed: 0, changed: 0, sample: [], reason: 'snapshot_kind_mismatch' };
  if (before.snapshotKind === 'workspace-document') {
    if (!before.workspaceSnapshotJson || !after.workspaceSnapshotJson) throw new Error('vault_version_snapshot_missing');
    const a = JSON.stringify(JSON.parse(before.workspaceSnapshotJson), null, 2);
    const b = JSON.stringify(JSON.parse(after.workspaceSnapshotJson), null, 2);
    return compareText(a, b);
  }
  const textMime = (mime?: string) => Boolean(mime?.startsWith('text/') || mime === 'application/json');
  if (!textMime(before.mimeType) || !textMime(after.mimeType) || !before.payloadDataUrl || !after.payloadDataUrl) {
    return { supported: false, added: 0, removed: 0, changed: 0, sample: [], reason: 'binary_compare_unsupported' };
  }
  return compareText(new TextDecoder().decode(dataUrlToBytes(before.payloadDataUrl)), new TextDecoder().decode(dataUrlToBytes(after.payloadDataUrl)));
}

export async function restoreVaultVersion(
  file: VaultFile,
  version: VaultFileVersion,
  documents: readonly WorkspaceDocument[],
  now = Date.now(),
): Promise<{ file: VaultFile; workspaceDocument?: WorkspaceDocument }> {
  if (version.fileId !== file.id) throw new Error('vault_version_restore_file_mismatch');
  await assertVaultVersionSnapshotIntegrity(version);
  if (version.snapshotKind === 'attachment') {
    if (file.sourceType !== 'attachment' || !version.payloadDataUrl) throw new Error('vault_version_restore_kind_mismatch');
    const bytes = dataUrlToBytes(version.payloadDataUrl);
    const digest = await sha256Bytes(bytes);
    if (digest !== version.contentDigest) throw new Error('vault_version_snapshot_integrity_failed');
    const chunkIntegrity = await buildVaultChunkIntegrity(bytes);
    return { file: { ...file, name: version.originalName, mimeType: version.mimeType, payloadDataUrl: version.payloadDataUrl, sizeBytes: bytes.byteLength, contentDigest: digest, encryptedHash: digest, digestAlgorithm: 'SHA-256', chunkIntegrity, integrityState: 'verified', integrityVerifiedAt: now, status: 'available', lastModified: now } };
  }
  if (file.sourceType !== 'workspace-document' || !file.documentId || !version.workspaceSnapshotJson) throw new Error('vault_version_restore_kind_mismatch');
  const current = documents.find((item) => item.id === file.documentId);
  if (!current) throw new Error('vault_version_workspace_document_unavailable');
  const parsed = JSON.parse(version.workspaceSnapshotJson) as WorkspaceDocument;
  if (parsed.id !== current.id || parsed.kind !== current.kind) throw new Error('vault_version_workspace_identity_mismatch');
  const restored: WorkspaceDocument = { ...parsed, id: current.id, version: current.version + 1, created_at: current.created_at, modified_at: now };
  const bytes = encoder.encode(stableWorkspaceDocumentJson(restored));
  const digest = await sha256Bytes(bytes);
  const chunkIntegrity = await buildVaultChunkIntegrity(bytes);
  return {
    workspaceDocument: restored,
    file: { ...file, name: restored.title, kind: restored.kind, sizeBytes: bytes.byteLength, contentDigest: digest, encryptedHash: digest, digestAlgorithm: 'SHA-256', chunkIntegrity, integrityState: 'verified', integrityVerifiedAt: now, documentVersion: restored.version, status: 'available', lastModified: now },
  };
}

export function parseWorkspaceVersionSnapshot(version: VaultFileVersion): WorkspaceDocument {
  if (version.snapshotKind !== 'workspace-document' || !version.workspaceSnapshotJson) throw new Error('vault_version_workspace_snapshot_required');
  return JSON.parse(version.workspaceSnapshotJson) as WorkspaceDocument;
}
