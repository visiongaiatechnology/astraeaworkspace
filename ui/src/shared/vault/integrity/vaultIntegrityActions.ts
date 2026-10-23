import type { WorkspaceDocument } from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';
import {
  appendVaultIntegrityAudit,
  repairVaultAttachmentFromKnownGood,
  verifyEntireVault,
  verifyVaultFile,
} from './vaultIntegrity';

export function createVaultIntegrityActions(
  vaultData: StoredVaultData,
  documents: WorkspaceDocument[],
  persistVaultData: (updated: Partial<StoredVaultData>) => void,
) {
  return {
    async verifyFile(fileId: string) {
      const file = vaultData.files.find((candidate) => candidate.id === fileId);
      if (!file) return { state: 'unavailable' as const, message: 'Vault entry no longer exists.' };
      try {
        const result = await verifyVaultFile(file, documents);
        const linkedDocument = file.documentId ? documents.find((candidate) => candidate.id === file.documentId) : undefined;
        persistVaultData({
          files: vaultData.files.map((candidate) => candidate.id === fileId ? {
            ...candidate,
            contentDigest: result.baselineCreated ? result.digest : candidate.contentDigest,
            encryptedHash: result.baselineCreated ? result.digest : candidate.encryptedHash,
            digestAlgorithm: 'SHA-256' as const,
            integrityState: result.state,
            integrityVerifiedAt: Date.now(),
            chunkIntegrity: result.chunkIntegrity,
            status: result.state === 'verified' ? (candidate.status === 'corrupt' || candidate.status === 'missing' ? 'available' as const : candidate.status) : 'corrupt' as const,
            documentVersion: result.baselineCreated && linkedDocument ? linkedDocument.version : candidate.documentVersion,
          } : candidate),
        });
        if (result.baselineCreated) return { state: 'verified' as const, message: 'SHA-256 + chunk-integrity baseline created from current content.' };
        return result.state === 'verified'
          ? { state: 'verified' as const, message: 'Content digest and chunk manifest match the stored baseline.' }
          : { state: 'mismatch' as const, message: 'Integrity mismatch: digest or chunk manifest differs from the stored baseline.' };
      } catch (error) {
        persistVaultData({
          files: vaultData.files.map((candidate) => candidate.id === fileId
            ? { ...candidate, integrityState: 'unavailable' as const, integrityVerifiedAt: Date.now() }
            : candidate),
        });
        return { state: 'unavailable' as const, message: error instanceof Error ? error.message : 'Integrity verification is unavailable.' };
      }
    },
    async verifyVault() {
      const result = await verifyEntireVault(vaultData.files, documents);
      persistVaultData({ files: result.files, integrityAudits: appendVaultIntegrityAudit(vaultData.integrityAudits, result.report) });
      return result.report;
    },
    async repairFromBackup(fileId: string, sourceFile: File) {
      const file = vaultData.files.find((candidate) => candidate.id === fileId);
      if (!file) throw new Error('vault_repair_file_missing');
      const bytes = new Uint8Array(await sourceFile.arrayBuffer());
      const repaired = await repairVaultAttachmentFromKnownGood(file, { kind: 'backup', bytes, mimeType: sourceFile.type || file.mimeType });
      persistVaultData({ files: vaultData.files.map((candidate) => candidate.id === fileId ? repaired : candidate) });
      return repaired;
    },
  };
}
