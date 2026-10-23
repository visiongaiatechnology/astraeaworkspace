import type { KeyVaultStatus, VaultStorageCapacitySnapshot, WorkspaceDocument } from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';
import { verifyEntireVault } from '../integrity/vaultIntegrity';
import { queryVaultStorageCapacity } from './vaultStorageHealthAdapters';
import { buildVaultStorageHealthReport, cleanupIncompleteVaultTransactions, DEFAULT_VAULT_STORAGE_HEALTH_STATE, normalizeVaultStorageHealthState, setVaultReadOnlyRecoveryMode } from './vaultStorageHealthEngine';

export function createVaultStorageHealthActions(
  vaultData: StoredVaultData,
  documents: WorkspaceDocument[],
  keyStatus: KeyVaultStatus,
  persist: (patch: Partial<StoredVaultData>) => void,
) {
  const state = normalizeVaultStorageHealthState(vaultData.storageHealth ?? DEFAULT_VAULT_STORAGE_HEALTH_STATE);
  const scan = async (capacity?: VaultStorageCapacitySnapshot) => {
    const report = buildVaultStorageHealthReport(vaultData, documents, keyStatus, capacity ?? await queryVaultStorageCapacity());
    persist({ storageHealth: { ...state, lastHealthScanAt: report.createdAt } });
    return report;
  };
  return {
    state,
    scan,
    async runIntegrityAndScan(capacity?: VaultStorageCapacitySnapshot) {
      const integrity = await verifyEntireVault(vaultData.files, documents);
      const ephemeral: StoredVaultData = { ...vaultData, files: integrity.files, integrityAudits: [integrity.report, ...(vaultData.integrityAudits ?? [])].slice(0, 32) };
      const report = buildVaultStorageHealthReport(ephemeral, documents, keyStatus, capacity ?? await queryVaultStorageCapacity());
      persist({ storageHealth: { ...state, lastHealthScanAt: report.createdAt } });
      return report;
    },
    cleanupIncomplete(now = Date.now()) {
      const result = cleanupIncompleteVaultTransactions(vaultData, now);
      persist({ peerResume: result.peerResume, storageHealth: { ...state, lastTransactionCleanupAt: now } });
      return result;
    },
    setReadOnly(enabled: boolean, reason?: string) { const next = setVaultReadOnlyRecoveryMode(state, enabled, reason); persist({ storageHealth: next }); return next; },
  };
}
