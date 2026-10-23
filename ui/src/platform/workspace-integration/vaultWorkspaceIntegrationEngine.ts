import type { VaultFile, WorkspaceDocument } from '../../shared/contracts/workspace';
import { createVaultWorkspaceEntry } from '../../shared/vault/integrity/vaultIntegrity';

export type VaultAssetConsumer = 'Writer' | 'Present' | 'Whiteboard';
export type VaultNativeOpenTarget = { kind: 'workspace-document'; documentId: string } | { kind: 'attachment'; fileId: string };
export function resolveVaultNativeOpenTarget(file: VaultFile): VaultNativeOpenTarget {
  if (file.sourceType === 'workspace-document' && file.documentId) return { kind:'workspace-document', documentId:file.documentId };
  if (file.sourceType === 'attachment' && file.payloadDataUrl) return { kind:'attachment', fileId:file.id };
  throw new Error('vault_open_target_unavailable');
}

export interface VaultAssetDescriptor {
  vaultDocumentId: string;
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sourceType: VaultFile['sourceType'];
  sourceDocumentId?: string;
  integrityState: VaultFile['integrityState'];
  uri: string;
}
export interface VaultIntegrationDiagnostics {
  linkedWorkspaceDocuments: number;
  attachments: number;
  versions: number;
  recoverySnapshots: number;
  corruptOrMissing: number;
}

const cleanId = (value: string): string => encodeURIComponent(String(value ?? '').slice(0, 256));
export const makeVaultAssetUri = (vaultDocumentId: string, fileId: string): string =>
  `vgt://workspace/document/${cleanId(vaultDocumentId)}?vaultFile=${cleanId(fileId)}`;

export function listVaultAssetsForConsumer(vaultDocument: WorkspaceDocument, _consumer: VaultAssetConsumer): VaultAssetDescriptor[] {
  if (vaultDocument.kind !== 'Vault' || !vaultDocument.vaultData) return [];
  return vaultDocument.vaultData.files
    .filter((file) => file.status !== 'quarantined' && file.status !== 'corrupt' && file.status !== 'missing')
    .slice(0, 10_000)
    .map((file) => ({
      vaultDocumentId: vaultDocument.id,
      fileId: file.id,
      name: String(file.name ?? '').slice(0, 512),
      mimeType: String(file.mimeType ?? 'application/octet-stream').slice(0, 160),
      sizeBytes: Math.max(0, Number(file.sizeBytes) || 0),
      sourceType: file.sourceType,
      sourceDocumentId: file.documentId,
      integrityState: file.integrityState,
      uri: makeVaultAssetUri(vaultDocument.id, file.id),
    }));
}

export async function refreshVaultWorkspaceFile(file: VaultFile, source: WorkspaceDocument): Promise<VaultFile> {
  if (file.sourceType !== 'workspace-document' || !file.documentId || file.documentId !== source.id) throw new Error('vault_workspace_link_mismatch');
  const refreshed = await createVaultWorkspaceEntry(source);
  return {
    ...refreshed,
    id: file.id,
    folderId: file.folderId,
    tags: file.tags,
    favorite: file.favorite,
    pinned: file.pinned,
    createdAt: file.createdAt,
    lastAccessedAt: file.lastAccessedAt,
    owner: file.owner,
    classification: file.classification,
    association: file.association,
    properties: file.properties,
  };
}

export async function createIncomingVaultWorkspaceLink(source: WorkspaceDocument, existingFiles: readonly VaultFile[]): Promise<VaultFile[]> {
  const existing = existingFiles.find((file) => file.sourceType === 'workspace-document' && file.documentId === source.id);
  if (existing) { const refreshed = await refreshVaultWorkspaceFile(existing, source); return existingFiles.map((file) => file.id === existing.id ? refreshed : file); }
  const entry = await createVaultWorkspaceEntry(source);
  return [entry, ...existingFiles];
}


export function buildVaultIntegrationDiagnostics(vaultDocument: WorkspaceDocument): VaultIntegrationDiagnostics {
  const data = vaultDocument.kind === 'Vault' ? vaultDocument.vaultData : undefined;
  if (!data) return { linkedWorkspaceDocuments:0,attachments:0,versions:0,recoverySnapshots:0,corruptOrMissing:0 };
  const files = data.files ?? [];
  return {
    linkedWorkspaceDocuments: files.filter((file) => file.sourceType === 'workspace-document' && file.documentId).length,
    attachments: files.filter((file) => file.sourceType === 'attachment').length,
    versions: data.versions?.length ?? 0,
    recoverySnapshots: data.recoverySnapshots?.length ?? 0,
    corruptOrMissing: files.filter((file) => file.status === 'corrupt' || file.status === 'missing' || file.integrityState === 'mismatch').length,
  };
}
