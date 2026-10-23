import type { VaultTrashRetentionPolicy, WorkspaceDocument } from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';
import {
  appendVaultRecoverySnapshot,
  applyVaultTrashRetention,
  createVaultRecoverySnapshot,
  DEFAULT_VAULT_TRASH_RETENTION,
  emptyVaultTrash,
  moveVaultFileToTrash,
  normalizeVaultTrashRetention,
  purgeVaultTrashEntry,
  restoreVaultRecoverySnapshot,
  restoreVaultTrashEntries,
  restoreVaultTrashEntry,
} from './vaultRecoveryEngine';

export function createVaultRecoveryActions(
  vaultData: StoredVaultData,
  documents: WorkspaceDocument[],
  vaultDocumentId: string,
  persistVaultData: (updated: Partial<StoredVaultData>) => void,
  onUpdateDocument: (document: WorkspaceDocument) => void,
  onCreateDerivedDocument: (document: WorkspaceDocument) => void,
) {
  /**
   * Befund + Fix (Runde 82, V-040): Diese beiden Werte waren `const`-Kopien des Zustands **zum Zeitpunkt
   * der Erzeugung**. Dieselbe Fehlerklasse wie V-037 in `vaultPeerSyncActions`, und hier mit sichtbareren
   * Folgen. Gemessen in **einer** Instanziierung:
   *
   *   • `deleteFile('vf-1')` → `restoreOne(<trashId>)` wirft `vault_trash_entry_not_found`, weil der
   *     Papierkorb aus Sicht der Kopie leer ist. Wiederherstellen direkt nach dem Löschen ist damit
   *     unmöglich.
   *   • `deleteFile('vf-1')` → `deleteFile('vf-2')`: der zweite Aufruf rechnet gegen die **alte**
   *     Dateiliste und den **alten** Papierkorb, sodass nur die zweite Datei im Papierkorb landet.
   *   • `createSnapshot()` → `restoreSnapshot(<id>)` wirft `vault_recovery_snapshot_not_found`: der eben
   *     erzeugte Snapshot ist in der eingefrorenen Liste nicht vorhanden. Ein Rollback unmittelbar nach dem
   *     Sichern war also nicht möglich — der Nutzer hätte die Oberfläche neu zeichnen lassen müssen.
   *
   * Die Werte sind jetzt `let` und werden nach jedem Persistieren nachgezogen.
   */
  let state = { files: vaultData.files, folders: vaultData.folders, trash: vaultData.trash };
  const retention = normalizeVaultTrashRetention(vaultData.trashRetention ?? DEFAULT_VAULT_TRASH_RETENTION);
  let recoverySnapshots = vaultData.recoverySnapshots ?? [];
  const persistState = (next: typeof state, extra: Partial<StoredVaultData> = {}) => {
    state = next;
    persistVaultData({ files: next.files, folders: next.folders, trash: next.trash, ...extra });
  };

  return {
    retention,
    get recoverySnapshots() { return recoverySnapshots; },
    deleteFile(fileId: string) {
      const moved = moveVaultFileToTrash(state, fileId);
      const retained = applyVaultTrashRetention(moved, retention);
      persistState(retained.state);
    },
    restoreOne(trashId: string, destinationFolderId?: string | null) {
      persistState(restoreVaultTrashEntry(state, trashId, Date.now(), destinationFolderId));
    },
    restoreBulk(trashIds: readonly string[], destinationFolderId?: string | null) {
      persistState(restoreVaultTrashEntries(state, trashIds, destinationFolderId));
    },
    purgeOne(trashId: string) {
      persistState(purgeVaultTrashEntry(state, trashId));
    },
    emptyTrash(confirmation: string) {
      persistState(emptyVaultTrash(state, confirmation));
    },
    updateRetention(next: Partial<VaultTrashRetentionPolicy>) {
      const normalized = normalizeVaultTrashRetention({ ...retention, ...next });
      const retained = applyVaultTrashRetention(state, normalized);
      persistState(retained.state, { trashRetention: normalized });
      return retained.purged;
    },
    applyRetentionNow() {
      const retained = applyVaultTrashRetention(state, retention);
      persistState(retained.state);
      return retained.purged;
    },
    async createSnapshot(label?: string) {
      const snapshot = await createVaultRecoverySnapshot(state, documents, vaultDocumentId, { label });
      const next = appendVaultRecoverySnapshot(recoverySnapshots, snapshot);
      recoverySnapshots = next;
      persistVaultData({ recoverySnapshots: next });
      return snapshot;
    },
    async restoreSnapshot(snapshotId: string) {
      const snapshot = recoverySnapshots.find((candidate) => candidate.id === snapshotId);
      if (!snapshot) throw new Error('vault_recovery_snapshot_not_found');
      const preRestore = await createVaultRecoverySnapshot(state, documents, vaultDocumentId, { label: 'Before workspace rollback' });
      const result = await restoreVaultRecoverySnapshot(snapshot, documents);
      for (const restored of result.updatedDocuments) onUpdateDocument(restored);
      for (const recreated of result.recreatedDocuments) onCreateDerivedDocument(recreated);
      const nextSnapshots = appendVaultRecoverySnapshot(recoverySnapshots, preRestore);
      recoverySnapshots = nextSnapshots;
      persistState(result.state, { recoverySnapshots: nextSnapshots });
      return { updated: result.updatedDocuments.length, recreated: result.recreatedDocuments.length };
    },
  };
}
