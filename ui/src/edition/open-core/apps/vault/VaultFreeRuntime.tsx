import React, { useEffect, useMemo, useState } from 'react';
import type { DocumentKind, KeyVaultStatus, NetworkCapability, VaultFile, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { StoredVaultData } from '../../../../shared/contracts/vaultSpaces';
import { ShieldCheck, HardDrive, Cpu, ShieldAlert } from 'lucide-react';
import { releaseStatusDetail, releaseStatusLabel, securityGateDecisionOf } from '../../../../edition/releaseStatus';
import { VaultAdvancedModal } from '../../../../apps/vault/settings/VaultAdvancedModal';
import { VaultFilesTab } from '../../../../shared/vault/files/VaultFilesTab';
import { createVaultWorkspaceEntry, dataUrlToBytes } from '../../../../shared/vault/integrity/vaultIntegrity';
import { buildVaultImportEntries } from '../../../../shared/vault/vaultImports';
import { evaluateVaultAccess } from '../../../../shared/vault/security/vaultAccessPolicyEngine';
import { VaultSharePanel } from '../../../../shared/vault/security/VaultSharePanel';
import { VaultFirstRunPanel } from '../../../../apps/vault/setup/VaultFirstRunPanel';
import { vaultFirstRunFactsFrom } from '../../../../apps/vault/setup/vaultFirstRun';
import { VaultPickerModal } from '../../../../shared/vault/picker/VaultPickerModal';
import { extensionForDocumentKind } from '../../../../platform/operations/appContainerOps';
import { VaultPlaintextExportGate } from '../../../../shared/vault/backup/VaultPlaintextExportGate';
import { vaultPlaintextExportSubject, type VaultBackupExportKind } from '../../../../shared/vault/backup/vaultExportWarnings';
import { importOfficeDocument } from '../../../../platform/interop';
import { normalizeVaultFile, type VaultFileSystemState, type VaultOpenTarget } from '../../../../shared/vault/files/vaultFileSystemEngine';
import { VaultKeyPolicyPanel } from '../../../../shared/vault/security/VaultKeyPolicyPanel';
import { VaultIntegrityPanel } from '../../../../shared/vault/integrity/VaultIntegrityPanel';
import { createVaultIntegrityActions } from '../../../../shared/vault/integrity/vaultIntegrityActions';
import { assertVaultPolicySafeToPersist, DEFAULT_VAULT_KEY_POLICY, normalizeVaultKeyPolicy } from '../../../../shared/vault/security/vaultKeyPolicyEngine';
import { VaultVersionHistoryPanel } from '../../../../shared/vault/history/VaultVersionHistoryPanel';
import { createVaultVersionActions } from '../../../../shared/vault/history/vaultVersionActions';
import { applyVaultVersionRetention, captureVaultFileVersion, DEFAULT_VAULT_VERSION_RETENTION, normalizeVaultVersionRetention } from '../../../../shared/vault/history/vaultVersionHistoryEngine';
import { useVaultAutomaticVersions } from '../../../../shared/vault/history/hooks/useVaultAutomaticVersions';
import { VaultTrashRecoveryPanel } from '../../../../shared/vault/recovery/VaultTrashRecoveryPanel';
import { createVaultRecoveryActions } from '../../../../shared/vault/recovery/vaultRecoveryActions';
import { DEFAULT_VAULT_TRASH_RETENTION, normalizeVaultTrashRetention } from '../../../../shared/vault/recovery/vaultRecoveryEngine';
import { planVaultBackupBundle, DEFAULT_VAULT_BACKUP_POLICY, normalizeVaultBackupPolicy } from '../../../../shared/vault/backup/vaultBackupEngine';
import { createVaultBackupActions } from '../../../../shared/vault/backup/vaultBackupActions';
import { VaultBackupPanel } from '../../../../apps/vault/backup/VaultBackupPanel';
import { exportVaultQuickBackup } from '../../../../shared/vault/backup/vaultQuickBackup';
import { type ExportDeliveryResult } from '../../../../shared/interchange/exportDelivery';
import { deliverVaultAttachment } from './vaultAttachmentDelivery';
import { createVaultPeerSyncActions } from '../../../../shared/vault/sync/vaultPeerSyncActions';
import { DEFAULT_VAULT_PEER_SYNC_POLICY, normalizeVaultPeerSyncPolicy } from '../../../../shared/vault/sync/vaultPeerSyncEngine';
import { vaultPreviewParserAdapters } from '../../../../shared/vault/preview/vaultPreviewAdapters';
import { createVaultSearchActions } from '../../../../shared/vault/search/vaultSearchActions';
import { DEFAULT_VAULT_SEARCH_POLICY, normalizeVaultSearchPolicy } from '../../../../shared/vault/search/vaultSearchEngine';
import { VaultFreeSearchPanel } from './search/VaultFreeSearchPanel';
import { VaultStorageHealthPanel } from '../../../../shared/vault/diagnostics/VaultStorageHealthPanel';
import { createVaultStorageHealthActions } from '../../../../shared/vault/diagnostics/vaultStorageHealthActions';
import { DEFAULT_VAULT_STORAGE_HEALTH_STATE, normalizeVaultStorageHealthState } from '../../../../shared/vault/diagnostics/vaultStorageHealthEngine';
import { persistVaultLockRecord, persistVaultSnapshotInWorkspaceDocument, readVaultLockRecord } from '../../../../shared/vault/persistence/vaultPersistenceEngine';
import { deriveVaultLockState, vaultLockRecord } from '../../../../shared/vault/security/vaultSessionLock';
import { useVaultUndoHistory } from '../../../../shared/vault/history/hooks/useVaultUndoHistory';
import { VaultUndoToolbar } from '../../../../shared/vault/history/VaultUndoToolbar';
import { DEFAULT_VAULT_FILES, DEFAULT_VAULT_FOLDERS } from '../../../../shared/contracts/vaultSpaces';

export interface VaultFreeRuntimeProps {
  document: WorkspaceDocument;
  documents: WorkspaceDocument[];
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onCreateDerivedDocument: (doc: WorkspaceDocument) => void;
  onOpenDocument?: (documentId: string) => void;
  vaultStatus: KeyVaultStatus;
  activeDocumentPin: string | null;
  activeDocumentPassword?: string | null;
  onSetActiveDocumentPin?: (pin: string | null) => void;
  onSetActiveDocumentPassword?: (password: string | null) => void;
  networkCapability: NetworkCapability;
}

/**
 * Open Core Vault surface for encrypted local storage, recovery, and Workspace links.
 */
export const VaultFreeRuntime: React.FC<VaultFreeRuntimeProps> = ({
  document,
  documents,
  onUpdateDocument,
  onCreateDerivedDocument,
  onOpenDocument,
  vaultStatus,
  activeDocumentPin,
  activeDocumentPassword,
  onSetActiveDocumentPin,
  onSetActiveDocumentPassword,
  networkCapability,
}) => {
  const [isAdvancedModalOpen, setIsAdvancedModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /**
   * Cross-App-Picker (V-023): `null` bedeutet „geschlossen", sonst die **aufrufende Anwendung**. Sie
   * bestimmt die Klassifikationsgrenze — der Picker zeigt nur, was diese Anwendung öffnen darf.
   */
  const [pickerApp, setPickerApp] = useState<DocumentKind | null>(null);
  /**
   * **V-039 — eine Warnpforte für jeden Klartext-Austritt.** Es gab **zwei** Wege, auf denen eine
   * entschlüsselte Kopie den Tresor verließ, und der zweite (`exportVaultQuickBackup`) schrieb ohne
   * Warnung. Statt die Warnung ein zweites Mal zu formulieren, hält dieser Zustand den angeforderten
   * Austritt fest, bis der Nutzer **an derselben Stelle** bestätigt hat; beide Wege gehen hindurch.
   */
  const [pendingPlaintextExport, setPendingPlaintextExport] = useState<{
    kind: VaultBackupExportKind;
    subject: string;
    run: () => Promise<ExportDeliveryResult>;
  } | null>(null);
  /**
   * **V-010 — der Sperrzustand überlebt das Laden.** `runtimeLocked` allein lebte nur im Speicher: ein
   * Neuladen setzte den Tresor auf **entsperrt** zurück, obwohl der Nutzer ihn ausdrücklich gesperrt hatte.
   * Der Zustand kommt deshalb aus dem Dokument (`objects`, die freie Trägerschicht des zentralen
   * Objektmodells — kein zweiter Speicher), und `deriveVaultLockState` entscheidet **einmal beim Laden**,
   * ob der Tresor gesperrt startet. Ein ausdrücklicher Sperrvermerk gewinnt dabei gegen jede Auto-Lock-Frist.
   */
  const [runtimeLocked, setRuntimeLocked] = useState(
    () => deriveVaultLockState({
      lockedAt: readVaultLockRecord(document).lockedAt,
      lastActivityAt: readVaultLockRecord(document).lastActivityAt,
      autoLockMinutes: (document.vaultData?.keyPolicy ?? DEFAULT_VAULT_KEY_POLICY).autoLockMinutes,
      now: Date.now(),
    }).locked,
  );
  /**
   * **Sperren ist eine Revokation, kein Ausblenden.** Der Sperrzustand kann durch den Auto-Lock-Timer
   * (`VaultKeyPolicyPanel`) umschalten, ohne dass dieser Runtime-Baum neu gemountet wird. Deshalb werden
   * beim Sperren alle sekundären Dialoge geschlossen, die entschlüsseltes Material zeigen könnten —
   * insbesondere „Enclave & Relay" (`VaultAdvancedModal`), das Datei-Metadaten und Peer-Geräte rendert.
   * Die Sperr-Sichtbarkeitsliste (`vaultSessionLock.ts`) nennt `advancedModal` ausdrücklich.
   */
  useEffect(() => {
    if (!runtimeLocked) return;
    setIsAdvancedModalOpen(false);
    setPickerApp(null);
    setPendingPlaintextExport(null);
  }, [runtimeLocked]);
  const legacyKeyPolicy = useMemo(() => normalizeVaultKeyPolicy({
    protectionMode: activeDocumentPin ? 'device_pin' : activeDocumentPassword ? 'portable_password' : 'device',
  }), [activeDocumentPin, activeDocumentPassword]);
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const vaultData: StoredVaultData = useMemo(() => {
    if (document.vaultData) {
      return {
        ...document.vaultData,
        files: document.vaultData.files ?? DEFAULT_VAULT_FILES,
        folders: document.vaultData.folders ?? DEFAULT_VAULT_FOLDERS,
        spaces: document.vaultData.spaces ?? [],
        spaceTemplates: document.vaultData.spaceTemplates ?? [],
        shares: document.vaultData.shares ?? [],
        trash: document.vaultData.trash ?? [],
        keyPolicy: document.vaultData.keyPolicy ? normalizeVaultKeyPolicy(document.vaultData.keyPolicy) : legacyKeyPolicy,
        integrityAudits: document.vaultData.integrityAudits ?? [],
        versions: document.vaultData.versions ?? [],
        versionRetention: normalizeVaultVersionRetention(document.vaultData.versionRetention),
        trashRetention: normalizeVaultTrashRetention(document.vaultData.trashRetention),
        recoverySnapshots: document.vaultData.recoverySnapshots ?? [],
        backupPolicy: normalizeVaultBackupPolicy(document.vaultData.backupPolicy),
        backupCatalog: document.vaultData.backupCatalog ?? [],
        peerSyncPolicy: normalizeVaultPeerSyncPolicy(document.vaultData.peerSyncPolicy ?? DEFAULT_VAULT_PEER_SYNC_POLICY),
        peerDevices: document.vaultData.peerDevices ?? [],
        peerResume: document.vaultData.peerResume ?? [],
        peerSyncAudit: document.vaultData.peerSyncAudit ?? [],
        searchPolicy: normalizeVaultSearchPolicy(document.vaultData.searchPolicy ?? DEFAULT_VAULT_SEARCH_POLICY),
        searchIndex: document.vaultData.searchIndex,
        shareGrants: document.vaultData.shareGrants ?? [],
        shareAudit: document.vaultData.shareAudit ?? [],
        storageHealth: normalizeVaultStorageHealthState(document.vaultData.storageHealth ?? DEFAULT_VAULT_STORAGE_HEALTH_STATE),
      };
    }

    return {
      files: DEFAULT_VAULT_FILES,
      folders: DEFAULT_VAULT_FOLDERS,
      spaces: [],
      spaceTemplates: [],
      shares: [],
      trash: [],
      keyPolicy: legacyKeyPolicy,
      integrityAudits: [],
      versions: [],
      versionRetention: DEFAULT_VAULT_VERSION_RETENTION,
      trashRetention: DEFAULT_VAULT_TRASH_RETENTION,
      recoverySnapshots: [],
      backupPolicy: DEFAULT_VAULT_BACKUP_POLICY,
      backupCatalog: [],
      peerSyncPolicy: DEFAULT_VAULT_PEER_SYNC_POLICY,
      peerDevices: [],
      peerResume: [],
      peerSyncAudit: [],
      searchPolicy: DEFAULT_VAULT_SEARCH_POLICY,
      searchIndex: undefined,
      shareGrants: [],
      shareAudit: [],
      storageHealth: DEFAULT_VAULT_STORAGE_HEALTH_STATE,
    };
  }, [document.vaultData, legacyKeyPolicy]);

  const healthState = normalizeVaultStorageHealthState(vaultData.storageHealth ?? DEFAULT_VAULT_STORAGE_HEALTH_STATE);
  const undoHistory = useVaultUndoHistory(
    vaultData,
    (snapshot) => onUpdateDocument(persistVaultSnapshotInWorkspaceDocument(document, snapshot)),
    runtimeLocked || healthState.readOnlyRecoveryMode,
  );
  const persistVaultData = (updated: Partial<StoredVaultData>) => {
    if (runtimeLocked) throw new Error('vault_runtime_locked');
    if (healthState.readOnlyRecoveryMode && Object.keys(updated).some((key) => key !== 'storageHealth')) {
      throw new Error('vault_read_only_recovery_mode');
    }
    const next: StoredVaultData = {
      files: updated.files ?? vaultData.files,
      folders: updated.folders ?? vaultData.folders,
      // Retain extension payloads exactly; the Free runtime has no writer for them.
      spaces: vaultData.spaces,
      spaceTemplates: vaultData.spaceTemplates ?? [],
      shares: vaultData.shares,
      trash: updated.trash ?? vaultData.trash,
      keyPolicy: assertVaultPolicySafeToPersist(updated.keyPolicy ?? vaultData.keyPolicy ?? DEFAULT_VAULT_KEY_POLICY),
      integrityAudits: updated.integrityAudits ?? vaultData.integrityAudits ?? [],
      versions: updated.versions ?? vaultData.versions ?? [],
      versionRetention: normalizeVaultVersionRetention(updated.versionRetention ?? vaultData.versionRetention),
      trashRetention: normalizeVaultTrashRetention(updated.trashRetention ?? vaultData.trashRetention),
      recoverySnapshots: updated.recoverySnapshots ?? vaultData.recoverySnapshots ?? [],
      backupPolicy: normalizeVaultBackupPolicy(updated.backupPolicy ?? vaultData.backupPolicy),
      backupCatalog: updated.backupCatalog ?? vaultData.backupCatalog ?? [],
      peerSyncPolicy: normalizeVaultPeerSyncPolicy(updated.peerSyncPolicy ?? vaultData.peerSyncPolicy ?? DEFAULT_VAULT_PEER_SYNC_POLICY),
      peerDevices: updated.peerDevices ?? vaultData.peerDevices ?? [],
      peerResume: updated.peerResume ?? vaultData.peerResume ?? [],
      peerSyncAudit: updated.peerSyncAudit ?? vaultData.peerSyncAudit ?? [],
      searchPolicy: normalizeVaultSearchPolicy(updated.searchPolicy ?? vaultData.searchPolicy ?? DEFAULT_VAULT_SEARCH_POLICY),
      searchIndex: updated.searchIndex ?? vaultData.searchIndex,
      shareGrants: updated.shareGrants ?? vaultData.shareGrants ?? [],
      shareAudit: updated.shareAudit ?? vaultData.shareAudit ?? [],
      storageHealth: normalizeVaultStorageHealthState(updated.storageHealth ?? vaultData.storageHealth ?? DEFAULT_VAULT_STORAGE_HEALTH_STATE),
    };
    undoHistory.record(vaultData);
    onUpdateDocument(persistVaultSnapshotInWorkspaceDocument(document, next));
  };

  /**
   * Lokale Dateien importieren — **Grenzen zuerst, dann lesen**.
   *
   * Die Reihenfolge ist der Grund, warum dieser Pfad jetzt über `buildVaultImportEntries` läuft: die
   * vorherige Fassung erzeugte für **jede** Datei sofort den Anhang (also Base64-Data-URL plus Bytes im
   * Speicher) und prüfte die Größe erst danach im Vorschau-Pfad. Bei einem Stapel, dessen 200. Datei zu groß
   * war, lagen die ersten 199 bereits vollständig im Speicher, bevor irgendetwas abgelehnt wurde. Jetzt
   * prüft `assertVaultImportWithinLimits` Anzahl, Einzelgröße, Summe und Namenslänge **vor** dem ersten
   * `FileReader` und lehnt den ganzen Stapel ab, statt ihn halb zu importieren.
   */
  const handleAddLocalFiles = async (incomingFiles: File[], folderId: string | null) => {
    const entries = (await buildVaultImportEntries(incomingFiles, vaultPreviewParserAdapters, folderId))
      .map((entry) => normalizeVaultFile(entry));
    let versions = [...(vaultData.versions ?? [])];
    for (const entry of entries) versions = await captureVaultFileVersion(entry, documents, versions, { source: 'automatic', now: entry.createdAt ?? Date.now() });
    versions = applyVaultVersionRetention(versions, vaultData.versionRetention);
    persistVaultData({ files: [...entries, ...vaultData.files], versions });
  };

  const handleAddWorkspaceDocument = async (documentId: string, folderId: string | null) => {
    if (vaultData.files.some((file) => file.sourceType === 'workspace-document' && file.documentId === documentId)) {
      throw new Error('This Workspace document is already linked in the Vault.');
    }
    const sourceDocument = documents.find((candidate) => candidate.id === documentId);
    if (!sourceDocument) throw new Error('Workspace document is unavailable.');
    const entry = normalizeVaultFile({ ...(await createVaultWorkspaceEntry(sourceDocument)), folderId });
    let versions = await captureVaultFileVersion(entry, documents, vaultData.versions ?? [], { source: 'automatic', now: sourceDocument.modified_at });
    versions = applyVaultVersionRetention(versions, vaultData.versionRetention);
    persistVaultData({ files: [entry, ...vaultData.files], versions });
  };

  const downloadVaultAttachment = async (file: VaultFile) => {
    // Release Beta 0.1: native save on the desktop; the browser fallback stays a download.
    return deliverVaultAttachment(file);
  };

  const assertVaultWritable = () => {
    if (runtimeLocked) throw new Error('vault_runtime_locked');
    if (healthState.readOnlyRecoveryMode) throw new Error('vault_read_only_recovery_mode');
  };
  /**
   * **Zugriffsautorität (V-016).** Bis hierher entschied dieser Pfad allein nach „gesperrt?" und
   * „Dokumentart passt?". `shareGrants` wurde **nie** gelesen und die Klassifikation nur angezeigt: jede
   * Anwendung durfte jedes Asset öffnen, solange der Tresor entsperrt war. Jetzt entscheidet
   * `evaluateVaultAccess` auf Basis der Klassifikation und der vorhandenen Grants — fail-closed, und eine
   * Ablehnung wird **benannt** statt still verschluckt.
   */
  const assertVaultAccessAllowed = (file: VaultFile, action: 'open' | 'preview' | 'export' | 'download', app?: DocumentKind | null) => {
    const decision = evaluateVaultAccess({
      file,
      action,
      app: app ?? null,
      grants: vaultData.shareGrants,
    });
    if (!decision.allowed) throw new Error(decision.message);
  };
  const handleOpenVaultFile = async (file: VaultFile, target: VaultOpenTarget) => {
    if (target.action === 'workspace') {
      // Die Autoritätsprüfung steht **vor** jedem Zugriff auf die Nutzlast.
      assertVaultAccessAllowed(file, 'open', target.app ?? null);
      if (file.sourceType === 'workspace-document' && file.documentId) {
        onOpenDocument?.(file.documentId);
        return;
      }
      if (!file.payloadDataUrl) throw new Error('Vault attachment payload is unavailable.');
      const bytes = dataUrlToBytes(file.payloadDataUrl);
      const attachmentBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(attachmentBuffer).set(bytes);
      const localFile = new File([attachmentBuffer], file.name, { type: file.mimeType || 'application/octet-stream', lastModified: file.lastModified });
      const imported = await importOfficeDocument(localFile);
      if (target.app && imported.kind !== target.app) throw new Error('Vault file association does not match imported document type.');
      assertVaultWritable();
      onCreateDerivedDocument(imported);
      return;
    }
      if (target.action === 'download') {
        assertVaultAccessAllowed(file, 'download', target.app ?? null);
        if (!file.payloadDataUrl) throw new Error('Vault attachment payload is unavailable.');
        assertVaultAccessAllowed(file, 'export', target.app ?? null);
        await downloadVaultAttachment(file);
        return;
      }
    throw new Error('Requested Vault Open With target is unavailable.');
  };

  const handleUpdateVaultFileSystem = (state: VaultFileSystemState) => {
    persistVaultData({ files: state.files, folders: state.folders });
  };
  const guardedUpdateDocument = (doc: WorkspaceDocument) => { assertVaultWritable(); onUpdateDocument(doc); };
  const guardedCreateDocument = (doc: WorkspaceDocument) => { assertVaultWritable(); onCreateDerivedDocument(doc); };
  const integrity = createVaultIntegrityActions(vaultData, documents, persistVaultData);
  const recovery = createVaultRecoveryActions(vaultData, documents, document.id, persistVaultData, guardedUpdateDocument, guardedCreateDocument);
  const backup = createVaultBackupActions(vaultData, documents, document.id, persistVaultData, vaultStatus);
  const peerSync = createVaultPeerSyncActions(vaultData, documents, persistVaultData);
  const search = createVaultSearchActions(vaultData, documents, persistVaultData, []);
  const storageHealth = createVaultStorageHealthActions(vaultData, documents, vaultStatus, persistVaultData);
  useVaultAutomaticVersions(vaultData, documents, runtimeLocked || healthState.readOnlyRecoveryMode, persistVaultData);
  const versions = createVaultVersionActions(vaultData, documents, persistVaultData, guardedUpdateDocument, {
    policy: vaultData.keyPolicy,
    pin: activeDocumentPin,
    password: activeDocumentPassword,
    vaultStatus,
  });
  const linkedDocumentCount = vaultData.files.filter((file) => file.sourceType === 'workspace-document' && file.documentId).length;
  const unhealthyFileCount = vaultData.files.filter((file) => file.status === 'corrupt' || file.status === 'missing' || file.integrityState === 'mismatch').length;
  /**
   * Ehrliche Beta-Kennzeichnung direkt in der App. Der Vault ist das eine **freigegebene** Sicherheits-Gate;
   * die Grenzen stehen sichtbar neben dem Namen, nicht nur im Release-Bericht. Die Vault-Oberfläche ist
   * englischsprachig, deshalb die englische Label-Variante.
   */
  const vaultGate = securityGateDecisionOf('Vault');
  const vaultReleaseLabel = releaseStatusLabel('Vault', 'en-US');
  const vaultReleaseDetail = releaseStatusDetail('Vault', 'en-US');

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#07050d] text-slate-100" data-vgt-vault-root="true" data-release-gate={vaultGate} data-release-status="security-gate-approved" data-vault-linked-docs={runtimeLocked ? 0 : linkedDocumentCount} data-vault-diagnostic-errors={runtimeLocked ? 0 : unhealthyFileCount} data-vgt-edition-module="vault-free">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-purple-500/15 bg-[#0a0714]/90 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/15 text-purple-300">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-100">
              <span>Astraea Vault</span>
              <span className="rounded-full border border-purple-500/30 bg-purple-500/20 px-2 py-0.5 font-mono text-[10px] text-purple-300">Local-First</span>
              <span
                data-vault-release-badge="security-gate-approved"
                title={vaultReleaseDetail}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-200"
              >
                <ShieldAlert aria-hidden="true" className="h-3 w-3" />
                {vaultReleaseLabel}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Encrypted local Workspace storage and recovery</p>
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-slate-300" aria-label={runtimeLocked ? 'Vault locked — file count hidden' : `${vaultData.files.length} Vault files`}>
            <HardDrive aria-hidden="true" className="h-3.5 w-3.5" /> Vault <span className="font-mono">{runtimeLocked ? '—' : vaultData.files.length}</span>
          </span>
          <VaultUndoToolbar canUndo={undoHistory.canUndo} canRedo={undoHistory.canRedo} onUndo={undoHistory.undo} onRedo={undoHistory.redo} />
          <button type="button" onClick={() => setIsAdvancedModalOpen(true)} disabled={runtimeLocked} aria-disabled={runtimeLocked} className="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 shadow-sm transition-colors hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50" title={runtimeLocked ? 'Locked — unlock the Vault session first' : 'Hardware Enclave, Peer Relay & Audit Suite'}>
            <Cpu aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Enclave & Relay</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          {/*
            Die Release-Grenze des Sicherheits-Gates steht sichtbar in der App. Ein Nutzer soll nicht aus
            „Encrypted" schließen, dass der Gerätemodus einen eigenen Ausweis verlangt oder dass es einen
            universellen Wiederherstellungsschlüssel gibt.
          */}
          <p
            data-vault-release-gate-notice="security-gate-approved"
            className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-2.5 text-[11px] leading-relaxed text-amber-100/90"
          >
            <strong className="font-semibold">Security gate — reviewed and approved (Beta).</strong>{' '}
            Container encryption, PIN/password lock and restore are tested. Limits: in device mode “Lock now”
            locks the UI without a separate credential; the PIN is 4–8 digits; there is no universal recovery
            key — without credential or backup a vault stays unreadable.
          </p>
          <VaultKeyPolicyPanel
            document={document}
            policy={vaultData.keyPolicy ?? DEFAULT_VAULT_KEY_POLICY}
            vaultStatus={vaultStatus}
            activeDocumentPin={activeDocumentPin}
            activeDocumentPassword={activeDocumentPassword}
            onSetActiveDocumentPin={onSetActiveDocumentPin}
            onSetActiveDocumentPassword={onSetActiveDocumentPassword}
            runtimeLocked={runtimeLocked}
            /**
             * **V-010:** Das Sperren wird **ins Dokument** geschrieben, bevor der Zustand umschaltet. Sonst
             * wäre „Lock now" wieder nur eine Meldung bis zum nächsten Laden — genau der Befund. Der
             * Schreibvorgang läuft über die freie Trägerschicht, weil `persistVaultData` bei gesperrtem
             * Tresor wirft (es kann den Sperrzustand nicht selbst setzen).
             */
            onRuntimeLockedChange={(locked) => {
              onUpdateDocument(persistVaultLockRecord(document, vaultLockRecord(locked, Date.now())));
              setRuntimeLocked(locked);
            }}
            onPolicyChange={(keyPolicy) => persistVaultData({ keyPolicy })}
            showToast={showToast}
          />
          {!runtimeLocked && <VaultSharePanel
            files={vaultData.files}
            grants={vaultData.shareGrants ?? []}
            audit={vaultData.shareAudit ?? []}
            onGrantsChange={(shareGrants, entry) => persistVaultData({
              shareGrants,
              // Jede Freigabeoperation wird auditiert — die drei Felder waren vorher ohne Schreiber.
              shareAudit: [entry, ...(vaultData.shareAudit ?? []).filter((candidate) => candidate.id !== entry.id)].slice(0, 1024),
            })}
            /**
             * **V-043:** Der verschlüsselte Export ist ab jetzt eine **Zustellart der Freigabe**, kein eigener
             * Weg. Damit bleibt `exportRecipientEncryptedVaultPackage` erreichbar, aber er kann nur noch
             * **nach** dem Anlegen eines Grants mit Empfänger, Ablauf und Audit-Eintrag ausgelöst werden.
             */
            onExportEncryptedPackage={() => {
              /*
               * **V-039.** Auch dieser Weg schrieb ohne Warnung. Er geht durch dieselbe Pforte wie der
               * Backup-Export.
               *
               * **Ehrlichkeitskorrektur gegenüber meinem ersten Entwurf:** der Rückruf gibt den Dateinamen
               * zurück, und das Panel meldete daraufhin „… written". Wenn die Warnung davorsteht, ist das
               * **falsch** — es ist noch nichts geschrieben, solange nicht bestätigt wurde. Der Rückruf
               * gibt deshalb `null` zurück, und das Panel sagt nur dann „written", wenn wirklich geschrieben
               * wurde. Was bleibt, ist die **Möglichkeit** der exportierten Kopie, und genau die nennt der
               * Filter unten.
               */
              setPendingPlaintextExport({
                kind: 'recipient_package',
                subject: vaultPlaintextExportSubject('recipient_package', {
                  documentTitle: document.title,
                  extension: extensionForDocumentKind(document.kind),
                }),
                run: () => exportVaultQuickBackup(document, vaultData.keyPolicy ?? DEFAULT_VAULT_KEY_POLICY, activeDocumentPin, activeDocumentPassword, vaultStatus),
              });
              return Promise.resolve(null);
            }}
            showToast={showToast}
          />}
          {/*
            **Cross-App-Picker (V-023).** Der Dialog filtert mit der Zugriffsautorität: was die aufrufende
            Anwendung nicht öffnen darf, erscheint gar nicht erst. Er ist hier am Vault verdrahtet, damit
            eine andere Anwendung ihn über denselben Vertrag öffnen kann, ohne die Dateiliste nachzubauen.
          */}
          {!runtimeLocked && <VaultPickerModal
            isOpen={pickerApp !== null}
            requestingApp={pickerApp ?? 'Writer'}
            action="open"
            files={vaultData.files}
            grants={vaultData.shareGrants}
            onSelect={(candidate) => {
              const file = vaultData.files.find((entry) => entry.id === candidate.fileId);
              setPickerApp(null);
              if (file) void handleOpenVaultFile(file, { action: 'workspace', app: file.kind, label: `Open with ${file.kind}` });
            }}
            onCancel={() => setPickerApp(null)}
          />}
          <VaultFreeSearchPanel
            unlocked={!runtimeLocked}
            files={runtimeLocked ? [] : vaultData.files}
            folders={runtimeLocked ? [] : vaultData.folders}
            index={runtimeLocked ? undefined : vaultData.searchIndex}
            policy={search.policy}
            onUpdatePolicy={search.updatePolicy}
            onRebuild={search.rebuild}
            showToast={showToast}
          />
          {!runtimeLocked && <VaultStorageHealthPanel state={storageHealth.state} scan={storageHealth.scan} runIntegrityAndScan={storageHealth.runIntegrityAndScan} cleanupIncomplete={storageHealth.cleanupIncomplete} setReadOnly={storageHealth.setReadOnly} showToast={showToast} />}
          {!runtimeLocked && <VaultIntegrityPanel files={vaultData.files} audits={vaultData.integrityAudits ?? []} onVerifyVault={integrity.verifyVault} onRepairFromBackup={integrity.repairFromBackup} showToast={showToast} />}
          {!runtimeLocked && <VaultVersionHistoryPanel
            files={vaultData.files}
            versions={vaultData.versions ?? []}
            retention={versions.retention}
            onCaptureNamed={versions.captureNamed}
            onPreview={versions.preview}
            onRestore={versions.restore}
            onDownload={versions.download}
            onHold={versions.setHold}
            onCompare={versions.compare}
            onUpdateRetention={versions.updateRetention}
            showToast={showToast}
          />}
          {!runtimeLocked && <VaultTrashRecoveryPanel
            trash={vaultData.trash}
            folders={vaultData.folders}
            retention={recovery.retention}
            recoverySnapshots={recovery.recoverySnapshots}
            onRestoreOne={recovery.restoreOne}
            onRestoreBulk={recovery.restoreBulk}
            onPurgeOne={recovery.purgeOne}
            onEmptyTrash={recovery.emptyTrash}
            onUpdateRetention={recovery.updateRetention}
            onApplyRetention={recovery.applyRetentionNow}
            onCreateSnapshot={recovery.createSnapshot}
            onRestoreSnapshot={recovery.restoreSnapshot}
            showToast={showToast}
          />}
          {!runtimeLocked && <VaultBackupPanel
            /* **V-012.** Die Bündelgrenze wird **vor** dem Lauf genannt, nicht erst beim Abbruch. */
            bundlePlan={planVaultBackupBundle(documents)}
            policy={vaultData.backupPolicy}
            catalog={vaultData.backupCatalog ?? []}
            networkCapability={networkCapability}
            vaultPin={activeDocumentPin}
            vaultPassword={activeDocumentPassword}
            onUpdatePolicy={backup.updatePolicy}
            onCreateBackup={backup.createBackup}
            onPreview={backup.previewCatalogEntry}
            onRestoreAll={backup.restoreCatalogEntry}
            onRestoreFiles={(entryId, adapter, secrets, fileIds) => backup.restoreSelectedFiles(entryId, adapter, secrets, document, fileIds)}
            onApplyDisasterRecovery={(recovered) => {
              const current = new Map(documents.map((doc) => [doc.id, doc]));
              for (const restored of recovered) {
                const existing = current.get(restored.id);
                if (existing) onUpdateDocument({ ...restored, version: existing.version + 1, modified_at: Date.now() });
                else onCreateDerivedDocument(restored);
              }
            }}
            onApplyFileRecovery={onUpdateDocument}
          />}
          {/*
            **Paket 1 / AST-1126 / AST-1127 — der sichtbare Einstieg für die Ersteinrichtung.**
            Gemessen gab es ihn nicht (`firstRun|onboarding|welcome|setup|erstmalig` → 0 Treffer); bei leerem
            Tresor zeigte die Liste nur einen **Filter**hinweis. Die Komponente steht **vor** dem
            Dateibereich und nur bei entsperrtem, leerem, nie eingerichtetem Tresor — sonst wäre der Einstieg
            eine Daueranzeige statt eines Einstiegs.
          */}
          {!runtimeLocked && <VaultFirstRunPanel
            facts={vaultFirstRunFactsFrom({
              policy: vaultData.keyPolicy,
              fileCount: vaultData.files.length,
              folderCount: vaultData.folders.length,
              // `?? null`: der Laufzeitpfad führt die Ausweise als `string | null | undefined`, die Fakten
              // verlangen eine entschiedene Aussage. Ein fehlender Wert **ist** „kein Ausweis".
              activePin: activeDocumentPin ?? null,
              activePassword: activeDocumentPassword ?? null,
            })}
            /**
             * **Akzeptanzhandlung:** Tresor erzeugen, Schlüssel bestätigen, Dateibereich öffnen.
             * Policy und Ausweis entstehen **gemeinsam** — die Prüfung liegt in `validateVaultFirstRunDraft`,
             * das den atomaren `resolveVaultProtectionChange` benutzt. Es gibt keine zweite Schlüsselregel.
             */
            onCreate={({ name, policy, pin, password }) => {
              if (pin !== (activeDocumentPin ?? null)) onSetActiveDocumentPin?.(pin);
              if (password !== (activeDocumentPassword ?? null)) onSetActiveDocumentPassword?.(password);
              persistVaultData({ keyPolicy: policy });
              if (!document.title?.trim()) onUpdateDocument({ ...document, title: name });
            }}
            /*
             * **Kein `onOpenFiles` — und das ist Absicht.** Der Dateibereich (`VaultFilesTab`) wird direkt
             * unter diesem Einstieg ohnehin gerendert. Ein Rückruf, der dorthin „öffnet", wäre eine
             * Attrappe: er hätte nichts zu tun. Der dritte Schritt der Akzeptanzhandlung ist damit
             * **sichtbar erfüllt**, ohne einen zweiten Mechanismus zu erfinden. (Mein erster Entwurf rief
             * hier `setAdvancedSectionHint('files')` — gemessen existiert diese Funktion **nicht**; ich
             * hatte sie erfunden. Entfernt.)
             */
          />}
          {<VaultFilesTab locked={runtimeLocked}
            files={vaultData.files}
            folders={vaultData.folders}
            documents={documents.filter((candidate) => candidate.id !== document.id)}
            onAddLocalFiles={handleAddLocalFiles}
            onAddWorkspaceDocument={handleAddWorkspaceDocument}
            onUpdateFileSystem={handleUpdateVaultFileSystem}
            onDeleteFile={recovery.deleteFile}
            onVerifyFile={integrity.verifyFile}
            onOpenWith={handleOpenVaultFile}
            /*
             * Der Picker fragt für die **eigene** Dokumentart an: der Tresor wählt ein Asset, das diese
             * Anwendung öffnen darf. Damit ist der Einstieg erreichbar, und der Picker bleibt gleichzeitig
             * der typisierte Vertrag, den eine andere Anwendung aufrufen kann (V-023).
             */
            onOpenPicker={() => setPickerApp(document.kind)}
          />}
        </div>
      </main>

      {/*
        **V-039.** Die eine Warnpforte für jeden Klartext-Austritt. Sie steht hier — nicht in jedem Weg
        einzeln —, damit ein künftiger dritter Weg den Text nicht vergessen **kann**, sondern ihn holen muss.
      */}
      {pendingPlaintextExport && !runtimeLocked && <VaultPlaintextExportGate
        kind={pendingPlaintextExport.kind}
        subject={pendingPlaintextExport.subject}
        onCancel={() => setPendingPlaintextExport(null)}
        onConfirm={() => {
          const pending = pendingPlaintextExport;
          setPendingPlaintextExport(null);
          if (!pending) return;
          void pending.run()
            .then((delivery) => showToast(delivery.mode === 'file'
              ? `${delivery.fileName} written outside the Vault.`
              : `Download started: ${delivery.fileName} (browser mode – no write confirmation).`))
            .catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Export failed.'));
        }}
      />}

      {/*
        **Sperr-Revokation (Beta-Härtung):** Der Dialog wird nur bei entsperrter Sitzung montiert. Zusätzlich
        erhält er `locked`, damit auch ein künftiger Aufrufer ihn nicht gegen den Sperrzustand öffnen kann.
      */}
      {!runtimeLocked && (
        <VaultAdvancedModal
          isOpen={isAdvancedModalOpen}
          locked={runtimeLocked}
          onClose={() => setIsAdvancedModalOpen(false)}
        vaultFiles={vaultData.files}
        /*
         * **V-039.** Der Backup-Export schrieb über `anchor.download` **ohne jede Warnung** und **ohne
         * Pfadwahl** — dieselbe Lücke wie V-001, nur an einem zweiten Ort. Er läuft jetzt durch **dieselbe**
         * Warnpforte wie der Datei-Download, und der Dateiname wird **vorher** genannt, weil der Browser den
         * Speicherort nicht abfragt: der Nutzer erfährt so, wonach er suchen muss.
         */
        onExportEncryptedBackup={async () => {
          setPendingPlaintextExport({
            kind: 'backup',
            subject: vaultPlaintextExportSubject('backup', {
              documentTitle: document.title,
              extension: extensionForDocumentKind(document.kind),
            }),
            run: () => exportVaultQuickBackup(document, vaultData.keyPolicy ?? DEFAULT_VAULT_KEY_POLICY, activeDocumentPin, activeDocumentPassword, vaultStatus),
          });
          // `null`: angefordert, aber noch nicht geschrieben — die Warnpforte meldet den Vollzug.
          return null;
        }}
        showToast={showToast}
        peerSyncPolicy={peerSync.policy}
        peerDevices={peerSync.peers}
        vaultFolders={vaultData.folders}
        networkCapability={networkCapability}
        onPeerSyncPolicyChange={peerSync.updatePolicy}
        onTrustPeer={peerSync.trustPeer}
        onRemovePeer={peerSync.removePeer}
      />
      )}
      {toastMessage && <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-purple-500/40 px-4 py-2.5 text-xs font-medium text-purple-200 shadow-2xl glass-dropdown">
        <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-purple-500" />
        <span role="status">{toastMessage}</span>
      </div>}
    </div>
  );
};

export default VaultFreeRuntime;
