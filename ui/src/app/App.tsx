// STATUS: DIAMANT VGT SUPREME — Sovereign Workspace Shell & Application Coordinator
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  WorkspaceDocument,
  KeyVaultStatus,
  NetworkCapability,
  NetworkAuditEntry,
} from '../shared/contracts/workspace';
import { useWorkspaceAppNotifications } from './useWorkspaceAppNotifications';
import { useWorkspaceDocumentUpdates } from './useWorkspaceDocumentUpdates';
import { useWorkspaceExternalNavigation } from './useWorkspaceExternalNavigation';
import { useWorkspaceRecoverySnapshots } from './useWorkspaceRecoverySnapshots';
import { WorkspaceApplicationFrame } from './WorkspaceApplicationFrame';
import { installWriterWorkspaceIntegrationHost } from '../apps/writer/public/workspace/writerWorkspaceIntegrationHostAdapter';
import { installWriterDocumentPdfExportHost } from '../apps/writer/interchange/export/pdf/documentPdfExportHostAdapter';
import { installWriterWorkspaceSnapshotHost } from '../apps/writer/interchange/workspace/workspaceSnapshotHostAdapter';
import { installPdfActiveContentPolicyHost } from '../apps/pdf/interchange/security/pdfActiveContentPolicyHostAdapter';
import { installPdfWorkspaceImportHost } from '../apps/pdf/interchange/workspace/pdfWorkspaceImportHostAdapter';
import { installPdfStructuredExportHost } from '../apps/pdf/interchange/structuredPdfExportHostAdapter';
import { installPdfJsWorkerInspectionHost } from '../apps/pdf-studio/integrations/pdfJsWorkerInspectionHostAdapter';
import { installPresentWorkspaceIntegrationHost } from '../apps/present/integrations/presentWorkspaceIntegrationHostAdapter';
import { executeSaveVwc, fetchKeyVaultRuntimeStatus, resolveVwcSaveFailureMessage } from '../platform/operations/appContainerOps';
import { initialDocs } from './bootstrap/seedData';
import { ACTIVE_EDITION_REGISTRY, filterDocumentsForEdition } from '../edition/activeEdition';
import { useWorkspaceAutosave } from '../shell/persistence/useWorkspaceAutosave';
import { useWorkspaceActions } from '../shell/workspace/useWorkspaceActions';
import { persistActiveDocId } from '../platform/workspace/persistence/workspaceStorage';
import { useWorkspaceShellLifecycle } from '../shell/lifecycle/useWorkspaceShellLifecycle';
import { beginWorkspaceSession, installWorkspaceSessionLifecycle } from '../shell/lifecycle/workspaceRecoverySession';
import { fetchTopSecretStatus, listenTopSecretProgress, type TopSecretProgressEvent, type TopSecretRuntimeStatus } from '../platform/security/topSecretEngine';
import { WorkspaceOperationEngine } from '../platform/workspace/operations/workspaceOperationEngine';
import { syncWorkspaceSearchIndex } from '../platform/search/services/workspaceSearchClient';
import { installLogicalDialogFocusManager, shouldProcessWorkspaceShortcut } from '../shared/accessibility/accessibilityPlatform';
import { projectWorkspaceIntegrationSourceMetadata, projectWorkspaceLibraryDocuments } from '../shell/library/workspaceLibrary';
import { useWorkspaceFabricActions } from '../shell/fabric/useWorkspaceFabricActions';
import { securityPolicyForDocument } from '../platform/security/securityProfiles';
import { useWorkspaceLocale } from '../shell/localization/workspaceLocale';
import { shellChromeCopy } from '../shell/i18n/shellChromeLocale';
import { workspaceSaveProofCopy } from '../shell/persistence/workspaceSaveProof';
import {
  createWorkspaceBackupArchive,
  mergeRestoredWorkspaceDocuments,
  readWorkspaceBackupArchive,
} from '../platform/workspace/backup/workspaceBackupArchive';
import { deliverExportBytes } from '../shared/interchange/exportDelivery';
import { DEFAULT_SHELL_NATIVE_POLICY, nativeShellOpenFile } from '../platform/native/nativeShellServices';
import { isNativeDesktop } from '../platform/native/nativeBridge';
import { workspaceFilePersistenceFailureDetail } from '../shell/persistence/workspaceSaveFailure';

installWriterDocumentPdfExportHost();
installWriterWorkspaceSnapshotHost();
installWriterWorkspaceIntegrationHost();
installPdfActiveContentPolicyHost();
installPdfWorkspaceImportHost();
installPdfStructuredExportHost();
installPdfJsWorkerInspectionHost();
installPresentWorkspaceIntegrationHost();

/** Browser fallback for choosing a workspace backup file (the desktop uses the native open dialog). */
function pickWorkspaceBackupFileInBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    }, { once: true });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    }, { once: true });
    input.click();
  });
}

export const App: React.FC = () => {
  const shellRootRef = useRef<HTMLDivElement | null>(null);
  const operationEngineRef = useRef<WorkspaceOperationEngine | null>(null);
  if (!operationEngineRef.current) operationEngineRef.current = new WorkspaceOperationEngine();
  const operationEngine = operationEngineRef.current;

  // Primary Workspace Document State
  const [documents, setDocuments] = useState<Record<string, WorkspaceDocument>>(() =>
    filterDocumentsForEdition(initialDocs, ACTIVE_EDITION_REGISTRY),
  );
  const [activeDocId, setActiveDocId] = useState<string>('strategy-writer');
  const [activeSelectionType, setActiveSelectionType] = useState<'text' | 'cell' | 'shape' | 'chart'>('text');
  const [isClassicRibbon, setIsClassicRibbon] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [zenChromeReveal, setZenChromeReveal] = useState(false);

  // Modals & Trays State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNetGateOpen, setIsNetGateOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isFabricOpen, setIsFabricOpen] = useState(false);
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [isWorkspaceSettingsOpen, setIsWorkspaceSettingsOpen] = useState(false);
  const [isWorkspaceExplorerOpen, setIsWorkspaceExplorerOpen] = useState(false);
  const [isSecurityProfileOpen, setIsSecurityProfileOpen] = useState(false);
  const [topSecretProgress, setTopSecretProgress] = useState<TopSecretProgressEvent | null>(null);
  const [topSecretStatus, setTopSecretStatus] = useState<TopSecretRuntimeStatus>({ connected: false, providerReady: false, identityReady: false, topSecretUnlocked: false, outerSuite: 'VGT-ASTRAEA-TS-1', infinitySuite: 'VGT-INFINITY-1', infinityCommit: '55b05a697a189d0ec583cdcf340beeba1efc9130', assurance: 'Native Top Secret provider unavailable', errorCode: 'TS_PROVIDER_UNAVAILABLE' });
  const [isAppLauncherOpen, setIsAppLauncherOpen] = useState(false);
  const appLauncherReturnFocusRef = useRef<HTMLElement | null>(null);
  const openAppLauncher = useCallback((trigger?: HTMLElement) => {
    const activeElement = trigger ?? document.activeElement;
    appLauncherReturnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setIsAppLauncherOpen(true);
  }, []);
  const [isShortcutCheatsheetOpen, setIsShortcutCheatsheetOpen] = useState(false);
  const [recoverySession] = useState(() => beginWorkspaceSession());
  const [isStartCenterOpen, setIsStartCenterOpen] = useState(() => recoverySession.abnormalPreviousTermination || new URLSearchParams(window.location.search).get('start') !== 'false');
  const [startCenterSearchQuery, setStartCenterSearchQuery] = useState('');
  const { recoverySnapshots, refreshRecoverySnapshots } = useWorkspaceRecoverySnapshots({
    recoverySession,
    setIsStartCenterOpen,
  });

  // Security & Vault State
  const [networkCapability, setNetworkCapability] = useState<NetworkCapability>('None');
  const [auditLogs, setAuditLogs] = useState<NetworkAuditEntry[]>([]);
  const [vaultStatus, setVaultStatus] = useState<KeyVaultStatus>({
    isLocked: true,
    hasPin: false,
    platform: 'Rust Workspace Core not connected',
    privacyMode: false,
    coreConnected: false,
    hardwareBacked: false,
    softwareProviderConfigured: false,
  });
  const [documentPins, setDocumentPins] = useState<Record<string, string>>({});
  const [documentPasswords, setDocumentPasswords] = useState<Record<string, string>>({});
  const activeDocumentPin = documentPins[activeDocId] ?? null;
  const activeDocumentPassword = documentPasswords[activeDocId] ?? null;

  useEffect(() => {
    const root = shellRootRef.current;
    if (!root) return;
    return installLogicalDialogFocusManager(root);
  }, []);

  useEffect(() => {
    const active = documents[activeDocId];
    const blocked = active ? securityPolicyForDocument(active).profile === 'VGT_TOP_SECRET' : false;
    document.body.dataset.vgtTopSecretPrintBlocked = blocked ? 'true' : 'false';
    return () => { delete document.body.dataset.vgtTopSecretPrintBlocked; };
  }, [activeDocId, documents]);

  useEffect(() => installWorkspaceSessionLifecycle(recoverySession.sessionId), [recoverySession.sessionId]);

  const notifications = useWorkspaceAppNotifications();
  const { showToast } = notifications;
  const { locale } = useWorkspaceLocale();
  const handleOpenExternalUrl = useWorkspaceExternalNavigation({
    documents,
    activeDocumentId: activeDocId,
    networkCapability,
    setAuditLogs,
    showToast,
  });


  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void syncWorkspaceSearchIndex(documents, controller.signal).catch(() => {
        // Search is derived state. Abort/failure must never block authoritative document editing/opening.
      });
    }, 750);
    return () => {
      window.clearTimeout(timer);
      controller.abort(new DOMException('Superseded workspace search generation', 'AbortError'));
    };
  }, [documents]);

    // Sovereign Real-Time Autosave Hook (guarantees persistence within 10s of any change)
  const autosave = useWorkspaceAutosave({
    documents,
    activeDocId,
    documentPins,
    documentPasswords,
    onSaveToast: showToast,
  });

  const handleUpdateDocument = useWorkspaceDocumentUpdates({
    operationEngine,
    markDocumentDirty: autosave.markDocumentDirty,
    setDocuments,
    showToast,
  });

  // Actions coordinator hook
  const actions = useWorkspaceActions({
    editionRegistry: ACTIVE_EDITION_REGISTRY,
    documents,
    setDocuments,
    activeDocId,
    setActiveDocId: (id) => {
      setActiveDocId(id);
      persistActiveDocId(id);
    },
    vaultStatus,
    networkCapability,
    setAuditLogs,
    setDocumentPins,
    setDocumentPasswords,
    setIsStartCenterOpen,
    setIsAppLauncherOpen,
    recoverySnapshots,
    refreshRecoverySnapshots,
    showToast,
    markDocumentDirty: autosave.markDocumentDirty,
    handleUpdateDocument,
  });

  useEffect(() => {
    let disposed = false;
    void fetchTopSecretStatus().then((status) => { if (!disposed) setTopSecretStatus(status); });
    let unlisten: (() => void) | null = null;
    void listenTopSecretProgress((event) => {
      if (disposed) return;
      setTopSecretProgress(event);
      if (event.phase === 'COMPLETE') window.setTimeout(() => setTopSecretProgress((current) => current?.operation_id === event.operation_id ? null : current), 1200);
    }).then((dispose) => { unlisten = dispose; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchKeyVaultRuntimeStatus().then((runtime) => {
      if (cancelled) return;
      setVaultStatus((prev) => ({
        ...prev,
        isLocked: !runtime.isUnlocked,
        platform: runtime.platform,
        providerName: runtime.providerName,
        providerAvailable: runtime.providerAvailable,
        securePersistence: runtime.securePersistence,
        hardwareInterfaceDetected: runtime.hardwareInterfaceDetected,
        hardwareSlotSupported: runtime.hardwareSlotSupported,
        providerCapabilities: runtime.providerCapabilities,
        providerDetail: runtime.providerDetail,
        coreConnected: runtime.connected,
        hardwareBacked: runtime.hardwareBacked,
        hardwareAttestationVerified: runtime.hardwareAttestationVerified,
        softwareProviderConfigured: runtime.softwareProviderConfigured,
        pqcUnlocked: runtime.pqcUnlocked,
        topSecretEnrolled: runtime.topSecretEnrolled,
        topSecretUnlocked: runtime.topSecretUnlocked,
      }));
    });
    return () => { cancelled = true; };
  }, []);

  // Sovereign save: the durable layer decides, the status bar reports what was confirmed.
  //
  // Release Beta 0.1 (blocker #1): "Gespeichert" now means the encrypted container was written as a
  // real file and the desktop confirmed it (`file proof`). The browser build keeps the cache-only
  // fallback and says so. `handleSaveVwcAs` is the portable "Speichern unter…" path through the save
  // dialog + atomic sandbox export.
  const handleSaveVwc = useCallback(async () => {
    const active = documents[activeDocId];
    if (!active) return;
    await autosave.triggerImmediateSave();
    const copy = workspaceSaveProofCopy(locale);
    const proof = autosave.getSaveProof(active.id);
    if (proof?.kind === 'file') {
      showToast(copy.savedFileToast(proof.fileName, proof.sizeBytes));
      return;
    }
    if (proof?.kind === 'browser-cache') {
      showToast(copy.savedBrowserToast);
      return;
    }
    const failure = autosave.getSaveFailure();
    if (failure) {
      showToast(failure.detail ? copy.failure[failure.detail] : shellChromeCopy(locale).saveFailure[failure.code]);
      return;
    }
    showToast(copy.storeUnavailableToast);
  }, [autosave, documents, activeDocId, locale, showToast]);

  const handleSaveVwcAs = useCallback(async () => {
    const active = documents[activeDocId];
    if (!active) return;
    await autosave.triggerImmediateSave();
    const copy = workspaceSaveProofCopy(locale);
    await executeSaveVwc({
      activeDoc: active,
      vaultStatus: { ...vaultStatus, hasPin: Boolean(activeDocumentPin), hasPortablePassword: Boolean(activeDocumentPassword) },
      activeDocumentPin,
      activeDocumentPassword,
      // Success is only announced after the desktop confirmed the written file (mode `file`). In the
      // browser the download link merely starts and the message says exactly that (WR-041/beta honesty).
      onSuccess: (fileName, mode) => showToast(mode === 'file' ? copy.saveAsSucceeded(fileName) : copy.saveAsBrowserStarted),
      onError: (error) => {
        // The reason, not a constant: a missing provider, a refused dialog and a sandbox rejection
        // are three different problems. File-store errors carry a precise stage; native dialog
        // messages are already user-facing and path-free.
        const detail = workspaceFilePersistenceFailureDetail(error);
        if (detail) { showToast(copy.failure[detail]); return; }
        const message = error instanceof Error && /^(Die Datei|Der Speicherdialog|„)/u.test(error.message)
          ? error.message
          : resolveVwcSaveFailureMessage(error);
        showToast(message);
      },
    });
  }, [autosave, documents, activeDocId, vaultStatus, activeDocumentPin, activeDocumentPassword, locale, showToast]);

  /**
   * Release Beta 0.1 (B5): one honest workspace backup. It bundles the already encrypted VWC
   * containers of all loaded documents into one ZIP; documents that cannot be packed are named in
   * the manifest instead of being silently dropped. Delivery uses the central export rule: a real
   * file is reported only after the desktop confirmed the write.
   */
  const handleWorkspaceBackup = useCallback(async () => {
    try {
      const backup = await createWorkspaceBackupArchive({
        documents: Object.values(documents),
        credentialsFor: (documentId) => ({ pin: documentPins[documentId], password: documentPasswords[documentId] }),
        appVersion: '0.1.0-alpha.1',
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const delivered = await deliverExportBytes(backup.bytes, {
        suggestedName: `Astraea-Workspace-Backup-${stamp}.zip`,
        extensions: ['zip'],
        mimeType: 'application/zip',
      });
      const skippedNote = backup.skippedCount > 0
        ? ` ${backup.skippedCount} gesperrte/fehlerhafte Dokument(e) wurden nicht eingeschlossen.`
        : '';
      showToast(delivered.mode === 'file'
        ? `Workspace-Backup gespeichert: ${delivered.fileName} (${backup.documentCount} Dokumente).${skippedNote}`
        : `Download gestartet: ${delivered.fileName} — Browser-Modus, keine Schreibbestätigung.${skippedNote}`);
    } catch (error) {
      showToast(error instanceof Error && error.message
        ? error.message
        : 'Workspace-Backup fehlgeschlagen — es wurde keine Datei geschrieben.');
    }
  }, [documents, documentPins, documentPasswords, showToast]);

  /**
   * Restores a workspace backup. The newer `modified_at` wins per document (local wins a tie), so an
   * old backup can never roll back newer local work; adopted documents are marked dirty and are
   * written back as real files by the normal autosave path. Locked/unreadable entries are reported.
   */
  const handleWorkspaceRestore = useCallback(async () => {
    try {
      let file: File | null = null;
      if (isNativeDesktop()) file = await nativeShellOpenFile(DEFAULT_SHELL_NATIVE_POLICY);
      else file = await pickWorkspaceBackupFileInBrowser();
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const restored = await readWorkspaceBackupArchive(bytes, {
        credentialsFor: (documentId) => ({ pin: documentPins[documentId], password: documentPasswords[documentId] }),
      });
      const merged = mergeRestoredWorkspaceDocuments(documents, restored.documents);
      if (merged.adoptedDocumentIds.length === 0) {
        showToast(`Backup enthält keine neueren Dokumente (${merged.keptLocalDocumentIds.length} lokal neuere beibehalten, ${restored.skipped.length} gesperrt/fehlerhaft).`);
        return;
      }
      setDocuments(merged.documents);
      for (const documentId of merged.adoptedDocumentIds) autosave.markDocumentDirty(documentId);
      setActiveDocId(merged.adoptedDocumentIds[0]!);
      showToast(`Backup wiederhergestellt: ${merged.adoptedDocumentIds.length} Dokument(e) übernommen, ${merged.keptLocalDocumentIds.length} lokal neuere beibehalten${restored.skipped.length ? `, ${restored.skipped.length} gesperrt/fehlerhaft` : ''}.`);
    } catch (error) {
      showToast(error instanceof Error && error.message
        ? error.message
        : 'Backup konnte nicht wiederhergestellt werden — es wurden keine Daten verändert.');
    }
  }, [autosave, documents, documentPins, documentPasswords, setActiveDocId, setDocuments, showToast]);

  const shell = useWorkspaceShellLifecycle({
    editionRegistry: ACTIVE_EDITION_REGISTRY,
    documents,
    setDocuments,
    activeDocId,
    setActiveDocId,
    setIsStartCenterOpen,
    setIsCommandPaletteOpen,
    setIsWorkspaceExplorerOpen,
    handleOpenFile: actions.handleOpenFile,
    handleCloseDocument: actions.handleCloseDocument,
    handleSaveVwc,
    autosavedDocumentIds: autosave.persistedDocumentIds,
    showToast,
    isDocumentDirty: autosave.isDocumentDirty,
    documentCredentials: (documentId) => ({
      pin: documentPins[documentId],
      password: documentPasswords[documentId],
    }),
  });

  const {
    libraryRecentEntries,
    storedDocumentIds,
    libraryDocuments,
    shellAppearance,
    tabDocuments,
    handleRequestCloseDocument,
    handleShellAppearanceChange,
  } = shell;

  const explorerDocuments = useMemo(() => ({
    ...libraryDocuments,
    ...projectWorkspaceLibraryDocuments(documents, ACTIVE_EDITION_REGISTRY),
  }), [documents, libraryDocuments]);
  const explorerOpenDocumentIds = useMemo(() => new Set(Object.keys(documents)), [documents]);
  const writerWorkspaceSourceDocuments = useMemo(() => projectWorkspaceIntegrationSourceMetadata({
    documents: explorerDocuments,
    storedDocumentIds,
    openDocumentIds: explorerOpenDocumentIds,
    recentEntries: libraryRecentEntries,
    metadataLocked: vaultStatus.isLocked,
    editionRegistry: ACTIVE_EDITION_REGISTRY,
  }), [explorerDocuments, explorerOpenDocumentIds, libraryRecentEntries, storedDocumentIds, vaultStatus.isLocked]);

  const activeDoc = documents[activeDocId] || null;

  const handleShellUndo = useCallback(() => {
    if (!activeDocId) return;
    setDocuments((previous) => {
      try {
        const result = operationEngine.undoDocumentMap(previous, activeDocId);
        for (const documentId of result.touchedDocumentIds) autosave.markDocumentDirty(documentId);
        return result.documents;
      } catch (error) {
        if (!(error instanceof Error) || !/history is empty/i.test(error.message)) showToast(error instanceof Error ? error.message : 'Undo failed.');
        return previous;
      }
    });
  }, [activeDocId, autosave, operationEngine, showToast]);

  const handleShellRedo = useCallback(() => {
    if (!activeDocId) return;
    setDocuments((previous) => {
      try {
        const result = operationEngine.redoDocumentMap(previous, activeDocId);
        for (const documentId of result.touchedDocumentIds) autosave.markDocumentDirty(documentId);
        return result.documents;
      } catch (error) {
        if (!(error instanceof Error) || !/history is empty/i.test(error.message)) showToast(error instanceof Error ? error.message : 'Redo failed.');
        return previous;
      }
    });
  }, [activeDocId, autosave, operationEngine, showToast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!shouldProcessWorkspaceShortcut(event)) return;
      const primary = event.ctrlKey || event.metaKey;
      const key = event.key.toLocaleLowerCase();
      if (primary && !event.shiftKey && !event.altKey && event.code === 'Space') {
        event.preventDefault();
        openAppLauncher(event.target instanceof HTMLElement ? event.target : undefined);
        return;
      }
      if ((primary && key === '/') || (!primary && !event.altKey && !event.shiftKey && event.key === '?')) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target || (!target.isContentEditable && !/^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName))) { event.preventDefault(); setIsShortcutCheatsheetOpen((open) => !open); return; }
      }
      const zenEligible = activeDoc && ['Writer', 'Notes', 'Present'].includes(activeDoc.kind);
      if (zenEligible && (event.key === 'F11' || (primary && event.shiftKey && key === 'f'))) {
        event.preventDefault();
        setIsZenMode((current) => !current);
        setZenChromeReveal(false);
        return;
      }
      if (!primary || event.altKey) return;
      // Release Beta 0.1: an explicit portable save ("Speichern unter…") without leaving the editor.
      if (event.shiftKey && key === 's') { event.preventDefault(); void handleSaveVwcAs(); return; }
      if (key === '+' || key === '=') { event.preventDefault(); handleShellAppearanceChange({ ...shellAppearance, scalePercent: Math.min(400, shellAppearance.scalePercent + 25) }); return; }
      if (key === '-') { event.preventDefault(); handleShellAppearanceChange({ ...shellAppearance, scalePercent: Math.max(25, shellAppearance.scalePercent - 25) }); return; }
      if (key === '0') { event.preventDefault(); handleShellAppearanceChange({ ...shellAppearance, scalePercent: 100 }); return; }
      if (key === 'tab') {
        event.preventDefault();
        if (!tabDocuments.length) return;
        const current = Math.max(0, tabDocuments.findIndex((document) => document.id === activeDocId));
        const delta = event.shiftKey ? -1 : 1;
        const next = tabDocuments[(current + delta + tabDocuments.length) % tabDocuments.length];
        if (next) actions.handleOpenDocument(next.id);
        return;
      }
      if (key === 'w' && !event.shiftKey) {
        event.preventDefault();
        if (activeDocId) void handleRequestCloseDocument(activeDocId);
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName))) return;
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); handleShellUndo(); return; }
      if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.metaKey)) { event.preventDefault(); handleShellRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeDoc, activeDocId, handleRequestCloseDocument, handleSaveVwcAs, handleShellAppearanceChange, handleShellRedo, handleShellUndo, openAppLauncher, setActiveDocId, shellAppearance, tabDocuments]);

  const {
    fabricLinks,
    handleFabricOpenSource,
    handleFabricRefresh,
    handleFabricFreeze,
    handleFabricBreakLink,
    handleFabricRelink,
    handleFabricInsertFromWorkspace,
  } = useWorkspaceFabricActions({
    documents,
    setDocuments,
    activeDocumentId: activeDocId,
    operationEngine,
    markDocumentDirty: autosave.markDocumentDirty,
    openDocument: actions.handleOpenDocument,
    setFabricOpen: setIsFabricOpen,
    showToast,
  });

  return (
    <WorkspaceApplicationFrame
      root={{ shellRootRef, isZenMode, zenChromeReveal, setZenChromeReveal }}
      workspace={{
        documents,
        activeDocId,
        activeDoc,
        activeSelectionType,
        setActiveSelectionType,
        isClassicRibbon,
        setIsClassicRibbon,
        isWorkspaceExplorerOpen,
        setIsWorkspaceExplorerOpen,
        explorerDocuments,
        explorerOpenDocumentIds,
        writerWorkspaceSourceDocuments,
      }}
      actions={actions}
      shell={shell}
      autosave={autosave}
      operationEngine={operationEngine}
      fabric={{
        fabricLinks,
        handleFabricOpenSource,
        handleFabricRefresh,
        handleFabricFreeze,
        handleFabricBreakLink,
        handleFabricRelink,
        handleFabricInsertFromWorkspace,
      }}
      notifications={notifications}
      recovery={{
        snapshots: recoverySnapshots,
        isStartCenterOpen,
        setIsStartCenterOpen,
        startCenterSearchQuery,
        setStartCenterSearchQuery,
      }}
      security={{
        networkCapability,
        setNetworkCapability,
        auditLogs,
        vaultStatus,
        setVaultStatus,
        documentPins,
        setDocumentPins,
        documentPasswords,
        setDocumentPasswords,
        activeDocumentPin,
        activeDocumentPassword,
        topSecretProgress,
        topSecretStatus,
        setTopSecretStatus,
      }}
      modals={{
        isAppLauncherOpen,
        setIsAppLauncherOpen,
        appLauncherReturnFocusTarget: appLauncherReturnFocusRef.current,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        isNetGateOpen,
        setIsNetGateOpen,
        isVaultOpen,
        setIsVaultOpen,
        isFabricOpen,
        setIsFabricOpen,
        isPlatformModalOpen,
        setIsPlatformModalOpen,
        isWorkspaceSettingsOpen,
        setIsWorkspaceSettingsOpen,
        isSecurityProfileOpen,
        setIsSecurityProfileOpen,
        isShortcutCheatsheetOpen,
        setIsShortcutCheatsheetOpen,
      }}
      callbacks={{
        handleUpdateDocument,
        handleOpenExternalUrl,
        handleSaveVwc,
        handleSaveVwcAs,
        handleWorkspaceBackup,
        handleWorkspaceRestore,
        handleShellUndo,
        handleShellRedo,
        openAppLauncher,
      }}
    />
  );
};

export default App;
