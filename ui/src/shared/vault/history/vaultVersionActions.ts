import type { KeyVaultStatus, VaultFile, VaultFileVersion, VaultKeyPolicyModel, VaultVersionRetentionPolicy, WorkspaceDocument } from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';
import { extensionForDocumentKind } from '../../../platform/operations/appContainerOps';
import { packVaultByPolicy } from '../security/vaultKeyPolicyCrypto';
import { deliverExportBytes, deliverExportDataUrl } from '../../interchange/exportDelivery';
import { DEFAULT_VAULT_KEY_POLICY } from '../security/vaultKeyPolicyEngine';
import {
  applyVaultVersionRetention,
  assertVaultVersionSnapshotIntegrity,
  captureVaultFileVersion,
  compareVaultVersions,
  DEFAULT_VAULT_VERSION_RETENTION,
  nameVaultVersion,
  normalizeVaultVersionRetention,
  previewVaultVersion,
  restoreVaultVersion,
  setVaultVersionHold,
  vaultVersionsForFile,
} from './vaultVersionHistoryEngine';

const downloadBytes = (bytes: Uint8Array, filename: string, mime = 'application/octet-stream') => {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(filename) ? filename.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportBytes(bytes, { suggestedName: filename, extensions: [extension], mimeType: mime });
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(filename) ? filename.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportDataUrl(dataUrl, { suggestedName: filename, extensions: [extension] });
};

export function createVaultVersionActions(
  vaultData: StoredVaultData,
  documents: WorkspaceDocument[],
  persistVaultData: (updated: Partial<StoredVaultData>) => void,
  onUpdateDocument: (document: WorkspaceDocument) => void,
  security: {
    policy?: VaultKeyPolicyModel;
    pin?: string | null;
    password?: string | null;
    vaultStatus: KeyVaultStatus;
  },
) {
  const versions = vaultData.versions ?? [];
  const policy = normalizeVaultVersionRetention(vaultData.versionRetention ?? DEFAULT_VAULT_VERSION_RETENTION);
  const findFile = (fileId: string): VaultFile => {
    const file = vaultData.files.find((candidate) => candidate.id === fileId);
    if (!file) throw new Error('vault_version_file_missing');
    return file;
  };
  const findVersion = (versionId: string): VaultFileVersion => {
    const version = versions.find((candidate) => candidate.id === versionId);
    if (!version) throw new Error('vault_version_not_found');
    return version;
  };
  return {
    versionsForFile(fileId: string) { return vaultVersionsForFile(versions, fileId); },
    async preview(versionId: string) { return previewVaultVersion(findVersion(versionId)); },
    compare(beforeId: string, afterId: string) { return compareVaultVersions(findVersion(beforeId), findVersion(afterId)); },
    async captureNamed(fileId: string, label: string) {
      const next = await captureVaultFileVersion(findFile(fileId), documents, versions, { source: 'named', label, allowDuplicate: false });
      persistVaultData({ versions: applyVaultVersionRetention(next, policy) });
    },
    rename(versionId: string, label: string) { persistVaultData({ versions: nameVaultVersion(versions, versionId, label) }); },
    setHold(versionId: string, hold: boolean) { persistVaultData({ versions: setVaultVersionHold(versions, versionId, hold) }); },
    updateRetention(next: Partial<VaultVersionRetentionPolicy>) {
      const normalized = normalizeVaultVersionRetention({ ...policy, ...next });
      persistVaultData({ versionRetention: normalized, versions: applyVaultVersionRetention(versions, normalized) });
    },
    async restore(versionId: string) {
      const target = findVersion(versionId);
      const file = findFile(target.fileId);
      let nextVersions = await captureVaultFileVersion(file, documents, versions, { source: 'pre_restore', label: 'Before restore', protectedHold: false, allowDuplicate: false });
      const restored = await restoreVaultVersion(file, target, documents);
      if (restored.workspaceDocument) onUpdateDocument(restored.workspaceDocument);
      nextVersions = applyVaultVersionRetention(nextVersions, policy);
      persistVaultData({ files: vaultData.files.map((candidate) => candidate.id === file.id ? restored.file : candidate), versions: nextVersions });
      return restored;
    },
    async download(versionId: string) {
      const version = findVersion(versionId);
      await assertVaultVersionSnapshotIntegrity(version);
      if (version.snapshotKind === 'attachment') {
        if (!version.payloadDataUrl) throw new Error('vault_version_snapshot_missing');
        const delivery = await downloadDataUrl(version.payloadDataUrl, version.originalName);
        return delivery.fileName;
      }
      if (!version.workspaceSnapshotJson) throw new Error('vault_version_snapshot_missing');
      const snapshot = JSON.parse(version.workspaceSnapshotJson) as WorkspaceDocument;
      const bytes = await packVaultByPolicy(snapshot, security.policy ?? DEFAULT_VAULT_KEY_POLICY, { pin: security.pin, password: security.password }, security.vaultStatus);
      const filename = `${snapshot.title}.history.${extensionForDocumentKind(snapshot.kind)}`;
      const delivery = await downloadBytes(bytes, filename);
      return delivery.fileName;
    },
    retention: policy,
  };
}
