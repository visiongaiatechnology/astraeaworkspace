// STATUS: DIAMANT VGT SUPREME — PDF-to-Vault protection adapter.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { createVaultWorkspaceEntry } from '../../../shared/vault/integrity/vaultIntegrity';
import { nowVersioned, pdfModel } from './pdfWorkspaceAdapterSupport';

export async function storePdfDocumentInVault(source: WorkspaceDocument, target: WorkspaceDocument): Promise<WorkspaceDocument> {
  pdfModel(source);
  if (target.kind !== 'Vault') throw new Error('Protected PDF storage requires an Astraea Vault target.');
  const entry = await createVaultWorkspaceEntry(source);
  const existing = target.vaultData?.files ?? [];
  const withoutOldVersion = existing.filter((file) => !(file.sourceType === 'workspace-document' && file.documentId === source.id && file.documentVersion === source.version));
  return {
    ...nowVersioned(target),
    vaultData: { files: [entry, ...withoutOldVersion].slice(0, 10_000), shares: target.vaultData?.shares ?? [], spaces: target.vaultData?.spaces, trash: target.vaultData?.trash },
  };
}

