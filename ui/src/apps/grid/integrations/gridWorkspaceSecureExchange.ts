// STATUS: DIAMANT VGT SUPREME
// Grid protected dataset protection. Reuses authoritative container primitives.

import type { GridPublishObjectDefinition, VaultFile, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { packContainer, type PackOptions } from '../../../platform/containers/container';
import { sha256Bytes } from '../../../shared/vault/integrity/vaultIntegrity';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';

const MAX_PROTECTED_DATASET_BYTES = 16 * 1024 * 1024;

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return `data:application/vnd.vgt.vwc;base64,${btoa(binary)}`;
}

function definitionFor(source: WorkspaceDocument, definitionId: string): GridPublishObjectDefinition {
  if (source.kind !== 'Grid' || !source.gridData) throw new Error('grid_secure_source_invalid');
  const definition = source.gridData.publishObjects?.find((candidate) => candidate.id === definitionId);
  if (!definition) throw new Error('grid_secure_publish_definition_missing');
  const object = source.objects[definition.objectId];
  if (!object || object.type !== 'Table') throw new Error('grid_secure_publish_object_missing');
  return definition;
}

export function createGridDatasetDocument(source: WorkspaceDocument, definitionId: string, now = Date.now()): WorkspaceDocument {
  const definition = definitionFor(source, definitionId);
  const object = source.objects[definition.objectId];
  if (!object || object.type !== 'Table') throw new Error('grid_secure_publish_object_missing');
  const objectId = `dataset-${definition.objectId}`;
  return {
    id: createGridSecureId('grid-dataset'),
    title: `${source.title} · ${definition.title}`.slice(0, 512),
    kind: 'Grid',
    created_at: now,
    modified_at: now,
    version: 1,
    theme_id: source.theme_id,
    root_object_ids: [objectId],
    objects: { [objectId]: { type: 'Table', data: { ...object.data, id: objectId, cells: { ...object.data.cells } } } },
    gridData: {
      sheets: [{ id: 'dataset-sheet', name: definition.title.slice(0, 64), tableObjectId: objectId }],
      activeSheetId: 'dataset-sheet',
      properties: {
        sourceDocumentId: source.id,
        sourcePublishDefinitionId: definition.id,
        sourcePublishKind: definition.kind,
        sourceRange: definition.sourceRange,
      },
    },
  };
}

export async function createProtectedGridDatasetVaultFile(
  source: WorkspaceDocument,
  definitionId: string,
  packOptions: PackOptions = {},
): Promise<VaultFile> {
  const definition = definitionFor(source, definitionId);
  const dataset = createGridDatasetDocument(source, definitionId);
  const bytes = await packContainer(dataset, packOptions);
  if (!bytes.byteLength || bytes.byteLength > MAX_PROTECTED_DATASET_BYTES) throw new Error('grid_vault_container_size_limit');
  const digest = await sha256Bytes(bytes);
  return {
    id: createGridSecureId('vault-grid-dataset'),
    name: `${definition.title.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 160) || 'Grid_Dataset'}.vgrid.vwc`,
    kind: 'Grid',
    sizeBytes: bytes.byteLength,
    encryptedHash: digest,
    contentDigest: digest,
    digestAlgorithm: 'SHA-256',
    integrityState: 'verified',
    sourceType: 'attachment',
    mimeType: 'application/vnd.vgt.vwc',
    payloadDataUrl: bytesToDataUrl(bytes),
    lastModified: Date.now(),
  };
}

export function appendProtectedGridDatasetToVault(vaultDocument: WorkspaceDocument, file: VaultFile): WorkspaceDocument {
  if (vaultDocument.kind !== 'Vault' || !vaultDocument.vaultData) throw new Error('grid_vault_target_invalid');
  if (vaultDocument.vaultData.files.length >= 10_000) throw new Error('grid_vault_file_limit');
  return {
    ...vaultDocument,
    version: vaultDocument.version + 1,
    modified_at: Date.now(),
    vaultData: { ...vaultDocument.vaultData, files: [file, ...vaultDocument.vaultData.files] },
  };
}

