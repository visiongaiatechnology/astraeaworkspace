// Compatibility surface: Vault Trash/Recovery now lives in the hardened recovery core.
export type { VaultRecoveryState as VaultFileState } from '../vaultRecoveryEngine';
export { moveVaultFileToTrash, restoreVaultTrashEntry, purgeVaultTrashEntry } from '../vaultRecoveryEngine';
