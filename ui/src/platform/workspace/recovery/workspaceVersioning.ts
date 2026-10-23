// STATUS: DIAMANT VGT SUPREME — Durable encrypted named versions / autosave recovery bridge
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  createDocumentBackup,
  listDocumentBackups,
  restoreDocumentBackup,
  saveRecoverySnapshot,
  type StorageBackupDescriptor,
  type StorageCredentialOptions,
} from '../persistence/workspaceStorage';
import { compareWorkspaceVersionMetadata, prepareVersionRestore, type VersionComparison, type VersionRestoreMode } from '../../recovery/versionRecoveryEngine';

const NAMED_VERSION_PREFIX = 'named-version:';

export interface DurableNamedVersion {
  id: string;
  documentId: string;
  documentVersion: number;
  name: string;
  createdAt: number;
  encryptedBytes: number;
}

function normalizeName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 96);
  if (!normalized || /[\u0000-\u001f]/.test(normalized)) throw new Error('Named version label is invalid');
  return normalized;
}

export async function saveNamedWorkspaceVersion(
  document: WorkspaceDocument,
  name: string,
  credentials: StorageCredentialOptions = {},
): Promise<string> {
  const normalized = normalizeName(name);
  return createDocumentBackup(document, `${NAMED_VERSION_PREFIX}${normalized}`, credentials);
}

export async function listNamedWorkspaceVersions(
  documentId: string,
  credentials: StorageCredentialOptions = {},
): Promise<DurableNamedVersion[]> {
  const records = await listDocumentBackups(documentId, credentials);
  return records
    .filter(isNamedVersionRecord)
    .map((record) => ({
      id: record.id,
      documentId: record.documentId,
      documentVersion: record.documentVersion,
      name: record.decryptedLabel.slice(NAMED_VERSION_PREFIX.length),
      createdAt: record.createdAt,
      encryptedBytes: record.container.byteLength,
    }));
}

export async function previewNamedWorkspaceVersion(
  current: WorkspaceDocument,
  versionId: string,
  credentials: StorageCredentialOptions = {},
): Promise<{ snapshot: WorkspaceDocument; comparison: VersionComparison }> {
  const snapshot = await restoreDocumentBackup(versionId, credentials, false);
  return { snapshot, comparison: compareWorkspaceVersionMetadata(current, snapshot) };
}

export async function restoreNamedWorkspaceVersion(
  current: WorkspaceDocument,
  versionId: string,
  mode: VersionRestoreMode,
  options: StorageCredentialOptions & { confirmedReplace?: boolean; newDocumentId?: string; now?: number } = {},
): Promise<WorkspaceDocument> {
  const snapshot = await restoreDocumentBackup(versionId, options, false);
  return prepareVersionRestore(current, snapshot, mode, options);
}

export async function persistOperationAutosaveSnapshot(
  document: WorkspaceDocument,
  reason = 'operation-autosave',
  credentials: StorageCredentialOptions = {},
): Promise<string> {
  return saveRecoverySnapshot(document, `${reason}:v${document.version}`.slice(0, 128), credentials);
}

export function isNamedVersionRecord(record: StorageBackupDescriptor): boolean {
  return record.decryptedLabel.startsWith(NAMED_VERSION_PREFIX);
}
