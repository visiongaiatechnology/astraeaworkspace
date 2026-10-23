import type { WorkspaceDocument, VaultSearchIndexPolicy } from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';
import { applyVaultSearchPrivacyPolicy, buildVaultSearchIndex, normalizeVaultSearchPolicy, type VaultSearchSpaceMetadata } from './vaultSearchEngine';
import { vaultSearchAdapters } from './vaultSearchAdapters';

export function createVaultSearchActions(
  vaultData: StoredVaultData,
  documents: WorkspaceDocument[],
  persist: (update: Partial<StoredVaultData>) => void,
  indexedSpaces: readonly VaultSearchSpaceMetadata[] = vaultData.spaces,
) {
  const policy=normalizeVaultSearchPolicy(vaultData.searchPolicy);
  return {
    policy,
    async rebuild(){const searchIndex=await buildVaultSearchIndex(vaultData.files,vaultData.folders,indexedSpaces,documents,policy,vaultSearchAdapters);persist({searchIndex});return searchIndex;},
    updatePolicy(update:Partial<VaultSearchIndexPolicy>){const searchPolicy=normalizeVaultSearchPolicy({...policy,...update});const searchIndex=applyVaultSearchPrivacyPolicy(vaultData.searchIndex,vaultData.files,vaultData.folders,searchPolicy);persist({searchPolicy,searchIndex});return searchPolicy;},
  };
}
