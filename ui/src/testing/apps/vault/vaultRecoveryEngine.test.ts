// STATUS: PLATIN — recovery snapshot integrity survives the canonical workspace persistence roundtrip.
import { describe, expect, it } from 'vitest';
import { initialDocs } from '../../../app/bootstrap/seedData';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { stableWorkspaceDocumentJson } from '../../../shared/vault/integrity/vaultIntegrity';
import { createVaultRecoverySnapshot, restoreVaultRecoverySnapshot } from '../../../shared/vault/recovery/vaultRecoveryEngine';

const documents = Object.values(initialDocs);
const vaultDocument = documents.find((document) => document.kind === 'Vault');
const gridDocument = documents.find((document) => document.kind === 'Grid');
if (!vaultDocument || !gridDocument) throw new Error('Vault recovery tests require seeded Vault and Grid documents.');

const emptyState = { files: [], folders: [], trash: [] };

describe('Vault recovery snapshot integrity', () => {
  it('restores a snapshot after the persisted Workspace document JSON roundtrip', async () => {
    const snapshot = await createVaultRecoverySnapshot(emptyState, documents, vaultDocument.id, { label: 'roundtrip' });
    const vaultWithSnapshot = {
      ...vaultDocument,
      vaultData: { ...vaultDocument.vaultData, recoverySnapshots: [snapshot] },
    } as WorkspaceDocument;
    const persistedVault = JSON.parse(stableWorkspaceDocumentJson(vaultWithSnapshot)) as WorkspaceDocument;
    const persistedSnapshot = persistedVault.vaultData?.recoverySnapshots?.[0];
    if (!persistedSnapshot) throw new Error('Persisted recovery snapshot was not found.');

    const restored = await restoreVaultRecoverySnapshot(persistedSnapshot, documents);
    const restoredGrid = restored.updatedDocuments.find((document) => document.id === gridDocument.id);

    expect(restored.updatedDocuments).toHaveLength(documents.length - 1);
    expect(restoredGrid).toMatchObject({ id: gridDocument.id, version: gridDocument.version + 1 });
  });

  it('rejects a persisted payload whose contents changed after snapshot creation', async () => {
    const snapshot = await createVaultRecoverySnapshot(emptyState, documents, vaultDocument.id, { label: 'tamper' });
    const originalDocumentJson = snapshot.documents[0]?.snapshotJson;
    if (!originalDocumentJson || !originalDocumentJson.includes('"title"')) throw new Error('Seed snapshot must contain a title field.');
    const tampered = {
      ...snapshot,
      documents: [{ ...snapshot.documents[0]!, snapshotJson: originalDocumentJson.replace('"title"', '"Title"') }, ...snapshot.documents.slice(1)],
    };

    await expect(restoreVaultRecoverySnapshot(tampered, documents)).rejects.toThrow('vault_recovery_snapshot_integrity_failed');
  });
});
