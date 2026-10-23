// STATUS: PLATIN — composes the workspace shell surfaces from explicit controller state and callbacks.
import { useEffect, useRef, useState } from 'react';
import { Header } from '../shell/header/Header';
import { TabBar } from '../shell/tabs/TabBar';
import { AdaptiveToolbar } from '../shell/adaptive-toolbar/AdaptiveToolbar';
import { GRID_NUMBER_FORMAT_PRESETS, type GridNumberFormatId } from '../apps/grid/formatting/gridNumberFormat';
import type { GridToolbarFormatActions } from '../apps/grid/formatting/gridToolbarFormatContract';
import { AppWorkspaceView } from '../shell/workspace/AppWorkspaceView';
import { StartCenter } from '../shell/start-center/StartCenter';
import { SecurityProfileModal } from '../shell/security/SecurityProfileModal';
import { TopSecretProgressModal } from '../shell/security/top-secret/TopSecretProgressModal';
import { ShellStatusBar } from '../shell/status/ShellStatusBar';
import { ModuleRecoveryBoundary } from '../shell/recovery/ModuleRecoveryBoundary';
import { ShortcutCheatsheet } from '../shell/help/ShortcutCheatsheet';
import { DirtyCloseDialog } from '../shell/workspace/DirtyCloseDialog';
import { AccessibleTooltipLayer } from '../shell/accessibility/AccessibleTooltipLayer';
import { WorkspaceKeyboardA11yBridge } from '../shell/accessibility/WorkspaceKeyboardA11yBridge';
import { WorkspaceVisibilityGovernor } from '../shell/lifecycle/WorkspaceVisibilityGovernor';
import { WorkspaceExplorer } from '../shell/explorer';
import { WorkspaceAppOverlayLayer } from './WorkspaceAppOverlayLayer';
import { WorkspaceSaveIntegrityBanner } from './WorkspaceSaveIntegrityBanner';
import type { WorkspaceApplicationFrameProps } from './WorkspaceApplicationFrame.types';
import { useWorkspaceLocale } from '../shell/localization/workspaceLocale';
import { FirstRunSetupWizard } from '../shell/onboarding/FirstRunSetupWizard';
import { loadFirstRunSetupState } from '../shell/onboarding/firstRunSetupPersistence';
import { AppGuideLibrary, isOpenCoreAppGuideKind, markAppGuideAutoShown, shouldAutoShowAppGuide, type AppGuideTarget } from '../shell/onboarding/AppGuidePanel';
import { AppGuidePopover } from '../shell/onboarding/AppGuidePopover';
import { APP_GUIDE_INTERFACE_COPY } from '../shell/onboarding/appGuideCatalog';
import { ACTIVE_EDITION_REGISTRY } from '../edition/activeEdition';
import { contentSurfaceColorPolicy } from '../shell/home/workspaceShellHomeCore';
import { listStoredDocumentIdPage } from '../platform/workspace/persistence/workspaceStorage';
import { cancelTopSecretOperation, initializeTopSecretIdentity } from '../platform/security/topSecretEngine';
import { workspaceFrameCopy } from '../shell/i18n/workspaceFrameLocale';
import { shellSurfaceCopy } from '../shell/i18n/shellSurfaceLocale';
import { readVaultLockRecord } from '../shared/vault/persistence/vaultPersistenceEngine';
import {
  applyVaultCredentialRevocation,
  noVaultLockTransition,
  vaultCredentialLifecycleTransition,
  vaultCredentialStateFor,
  vaultLockTransitionOf,
  type VaultCredentialLifecycleEvent,
  type VaultLockTransition,
} from '../shared/vault/security/vaultCredentialLifecycle';

export function WorkspaceApplicationFrame(props: WorkspaceApplicationFrameProps) {
  const gridFormatActionRef = useRef<((format: 'currency' | 'percent' | 'number') => void) | null>(null);
  const gridToolbarFormatActionsRef = useRef<GridToolbarFormatActions | null>(null);
  const { locale, preference, setPreference } = useWorkspaceLocale();
  const frameCopy = workspaceFrameCopy(locale);
  const surfaceCopy = shellSurfaceCopy(locale);
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(() => loadFirstRunSetupState() === null);
  const { root, workspace, actions, shell, autosave, operationEngine, notifications, recovery, security, modals, callbacks } = props;
  const { shellRootRef, isZenMode, zenChromeReveal, setZenChromeReveal } = root;
  const {
    documents, activeDocId, activeDoc, activeSelectionType, setActiveSelectionType,
    isClassicRibbon, setIsClassicRibbon, isWorkspaceExplorerOpen, setIsWorkspaceExplorerOpen,
    explorerDocuments, explorerOpenDocumentIds, writerWorkspaceSourceDocuments,
  } = workspace;
  const {
    detachedDocumentId, recentEntries, libraryRecentEntries, storedDocumentIds,
    storedDocumentIdCursor, hasMoreStoredDocumentIds,
    loadStoredWorkspaceDocument, pinnedDocumentIds, recentlyClosedDocumentIds,
    pendingDirtyCloseDocumentId, shellShortcuts, shellAppearance, shellUpdateState,
    nativeDesktop, tabDocuments, handleOpenRecentDocument, handleOpenNewWindow,
    handleDetachDocument, handleRequestCloseDocument, handleResolveDirtyClose,
    handleCloseOtherDocuments, handleCloseDocumentsToRight, handleDuplicateDocument,
    handleCopyDocumentPath, handleTogglePinDocument, handleReorderDocument,
    handleReopenClosedDocument, handleShellAppearanceChange,
    handleShellShortcutChange, handleNativeOpenFile, handleShellDrop,
  } = shell;
  const { toastMessage, toastVisible, showToast, pauseToastDismiss, resumeToastDismiss } = notifications;
  const { snapshots: recoverySnapshots, isStartCenterOpen, setIsStartCenterOpen, startCenterSearchQuery, setStartCenterSearchQuery } = recovery;
  const {
    networkCapability, vaultStatus,
    documentPins, documentPasswords,
    setDocumentPins, setDocumentPasswords,
    activeDocumentPin, activeDocumentPassword, topSecretProgress, topSecretStatus, setTopSecretStatus,
  } = security;
  const {
    setIsCommandPaletteOpen, setIsPlatformModalOpen, setIsWorkspaceSettingsOpen,
    isSecurityProfileOpen, setIsSecurityProfileOpen, isShortcutCheatsheetOpen,
    setIsShortcutCheatsheetOpen,
  } = modals;
  const { handleUpdateDocument, handleOpenExternalUrl, handleSaveVwc, handleSaveVwcAs, handleShellUndo, handleShellRedo, openAppLauncher } = callbacks;
  const [isAppGuideLibraryOpen, setIsAppGuideLibraryOpen] = useState(false);
  const [interactiveGuideTarget, setInteractiveGuideTarget] = useState<AppGuideTarget | null>(null);
  /**
   * Shell ergonomics — the tab bar can give its height back to the page.
   *
   * The state is read from `localStorage` and written back on every change, so a
   * writer who collapsed the bar once does not have to do it again after a restart.
   * Failures (private mode, a full quota, a corrupt value) fall back to "expanded":
   * a missing preference must never hide navigation.
   */
  const TAB_BAR_COLLAPSED_KEY = 'astraea.shell.tabBarCollapsed';
  const [isTabBarCollapsed, setIsTabBarCollapsed] = useState<boolean>(() => {
    try {
      return globalThis.localStorage?.getItem(TAB_BAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const toggleTabBarCollapsed = () => {
    setIsTabBarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        globalThis.localStorage?.setItem(TAB_BAR_COLLAPSED_KEY, next ? 'true' : 'false');
      } catch {
        // The preference is a convenience, not a requirement.
      }
      return next;
    });
  };
  const lastGuideDocumentId = useRef<string | null>(null);

  useEffect(() => {
    if (isSetupWizardOpen || isStartCenterOpen || !activeDoc || !isOpenCoreAppGuideKind(activeDoc.kind) || lastGuideDocumentId.current === activeDocId) return;
    lastGuideDocumentId.current = activeDocId;
    const target = { type: 'app' as const, kind: activeDoc.kind };
    if (shouldAutoShowAppGuide(target)) {
      markAppGuideAutoShown(target);
      setInteractiveGuideTarget(target);
    }
  }, [activeDoc?.kind, activeDocId, isSetupWizardOpen, isStartCenterOpen]);

  /**
   * **P0 — der Ausweis fällt beim Sperren.**
   *
   * Gemessen vor dieser Änderung: der PIN lag als Klartext in `documentPins` (`App.tsx:102-103`) und wurde
   * **nur** dort gelöscht, wo stattdessen der andere Ausweis gesetzt wird (`:211-225`) — vier Löschstellen,
   * alle am SETZEN, keine am SPERREN. Der Sperrpfad selbst existiert und persistiert den Sperrzustand
   * (`VaultFreeRuntime.tsx:375` → `persistVaultLockRecord`), ließ den Ausweis aber stehen. Nach dem Sperren
   * lag der Schlüssel weiter im Speicher.
   *
   * **Warum hier und nicht im Laufzeitpfad:** `documentPins` und `documentPasswords` gehören diesem Rahmen.
   * `VaultFreeRuntime` ist eine Ebene tiefer und hat keinen Zugriff darauf; die Sperre erreicht ihn nur über
   * denselben Dokumentträger, den er beim Sperren schreibt. Der Rahmen liest daher genau diesen Träger und
   * leitet daraus die Richtung ab — **kein zweiter Sperrzustand** (das wäre die Fehlerklasse, die dieser
   * Befund selbst war).
   *
   * Zwei Bedingungen, beide nötig:
   *   1. der **Übergang** `entsperrt → gesperrt` (aus `lockedAt`) — dann fällt der Ausweis;
   *   2. der **Zustand** „der aktive Vault ist gesperrt" — Rückfallschutz für den Fall, dass ein Ausweis
   *      einen Übergang überlebt hat (etwa in derselben Millisekunde entsperrt und wieder gesperrt).
   *
   * `vaultCredentialLifecycle` entscheidet beides als reine Funktion; hier steht nur die Verdrahtung.
   */
  const appliedVaultLock = useRef<VaultLockTransition>(
    noVaultLockTransition(readVaultLockRecord(activeDoc)),
  );
  useEffect(() => {
    // Der Vermerk des **aktiven** Dokuments wird beobachtet — auch wenn gerade eine andere Anwendung sichtbar
    // ist. Ein Vault, der im Hintergrund sperrt, darf seinen Ausweis nicht behalten; der Träger ist derselbe,
    // den `VaultFreeRuntime` beim Sperren schreibt.
    const transition = vaultLockTransitionOf(appliedVaultLock.current.next, readVaultLockRecord(activeDoc));
    appliedVaultLock.current = transition;
    const held = vaultCredentialStateFor(documentPins, documentPasswords, activeDocId);
    if (held === null) return;
    /**
     * **Die Entscheidung liegt in der Zustandsmaschine, nicht in einer Bedingung hier.** Zwei Ereignisse sind
     * möglich, und nur eines lässt fallen:
     *   • `vault.locked` — der Sperrvorgang hat gerade stattgefunden (`transition.locked`) **oder** der Vault
     *     IST gesperrt (`transition.next.lockedAt !== null`, der Rückfallschutz für einen Ausweis, der einen
     *     Übergang überlebt hat).
     *   • `vault.unlocked` — der Ausweis bleibt unangetastet. Ein Entsperren, das ihn verwirft, wäre die
     *     umgekehrte Regel; ein Entsperren, das ihn zurückholt, gäbe es nicht.
     */
    const event: VaultCredentialLifecycleEvent = transition.locked || transition.next.lockedAt !== null
      ? { type: 'vault.locked', documentId: activeDocId }
      : { type: 'vault.unlocked', documentId: activeDocId };
    const afterEvent = vaultCredentialLifecycleTransition(held, event);
    if (afterEvent !== null) return;
    const withoutCredential = applyVaultCredentialRevocation({ pins: documentPins, passwords: documentPasswords }, activeDocId);
    if (withoutCredential.pins !== documentPins) setDocumentPins(withoutCredential.pins);
    if (withoutCredential.passwords !== documentPasswords) setDocumentPasswords(withoutCredential.passwords);
  }, [activeDoc, activeDocId, documentPins, documentPasswords, setDocumentPins, setDocumentPasswords]);



  return (
    <div
      ref={shellRootRef}
      data-astraea-shell-root="true"
      className="h-screen w-screen flex flex-col bg-[#07050d] text-slate-100 overflow-hidden font-sans"
      onMouseMove={(event) => { if (isZenMode) setZenChromeReveal(event.clientY <= 112); }}
      data-zen-mode={isZenMode ? 'true' : 'false'}
      onDragOver={(event) => { if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault(); }}
      onDrop={(event) => {
        event.preventDefault();
        void handleShellDrop(Array.from(event.dataTransfer.files));
      }}
    >
      <a href="#astraea-workspace-main" className="astraea-skip-link">{frameCopy.skipToContent}</a>
      <WorkspaceVisibilityGovernor />
      <WorkspaceKeyboardA11yBridge />
      <AccessibleTooltipLayer />
      {/* 1. Compact workspace header */}
      {/*
        Alpha 0.1: one visible way back from any open document to the start page / app overview.
        Hidden while the Start Center (or the first-run wizard above it) is the active surface.
      */}
      {(!isZenMode || zenChromeReveal) && <Header
        edition={ACTIVE_EDITION_REGISTRY.edition}
        activeDoc={activeDoc}
        onRenameDoc={actions.handleRenameDoc}
        onOpenSettings={() => setIsWorkspaceSettingsOpen(true)}
        onOpenStartCenter={isStartCenterOpen || isSetupWizardOpen ? undefined : () => setIsStartCenterOpen(true)}
        onOpenExplorer={() => { setIsStartCenterOpen(false); setIsWorkspaceExplorerOpen(true); }}
        onOpenAppGuides={() => setIsAppGuideLibraryOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSearch={() => {
          setIsWorkspaceExplorerOpen(false);
          setStartCenterSearchQuery(activeDoc ? `id:${activeDoc.id}` : '');
          setIsStartCenterOpen(true);
        }}
        onOpenAppLauncher={openAppLauncher}
        onSaveVwc={() => { void handleSaveVwc(); }}
        onBackupWorkspace={() => { void callbacks.handleWorkspaceBackup(); }}
        onRestoreWorkspace={() => { void callbacks.handleWorkspaceRestore(); }}
        onExportOffice={activeDoc && ['Writer', 'Grid', 'Present'].includes(activeDoc.kind) ? actions.handleExportOffice : undefined}
        onOpenFile={actions.handleOpenFile}
        onNativeOpenFile={nativeDesktop ? () => { void handleNativeOpenFile(); } : undefined}
      />}

      {/* 2. Document Tab Bar */}
      {(!isZenMode || zenChromeReveal) && <TabBar
        documents={tabDocuments}
        activeDocId={activeDocId}
        onSelectDoc={actions.handleOpenDocument}
        onCloseDoc={(id) => { void handleRequestCloseDocument(id); }}
        onCloseOtherDocs={(id) => { void handleCloseOtherDocuments(id); }}
        onCloseDocsToRight={(id) => { void handleCloseDocumentsToRight(id); }}
        onDuplicateDoc={handleDuplicateDocument}
        onCopyPath={(id) => { void handleCopyDocumentPath(id); }}
        onCreateDoc={actions.handleCreateDocument}
        onDetachDoc={detachedDocumentId ? undefined : (id) => { void handleDetachDocument(id); }}
        onReorderDoc={handleReorderDocument}
        onOpenNewWindow={() => { void handleOpenNewWindow(); }}
        pinnedDocumentIds={pinnedDocumentIds}
        onTogglePin={handleTogglePinDocument}
        canReopenClosed={recentlyClosedDocumentIds.length > 0}
        onReopenClosed={() => { void handleReopenClosedDocument(); }}
        collapsed={isTabBarCollapsed}
        onToggleCollapsed={toggleTabBarCollapsed}
      />}

      {/* 3. Adaptive Toolbar (for non-paginated or quick actions) */}
      {(!isZenMode || zenChromeReveal) && activeDoc && activeDoc.kind !== 'Writer' && activeDoc.kind !== 'PdfStudio' && (
        <AdaptiveToolbar
          documentKind={activeDoc.kind}
          activeSelectionType={activeSelectionType}
          isClassicRibbon={isClassicRibbon}
          onToggleRibbonMode={() => setIsClassicRibbon(!isClassicRibbon)}
          onFormatText={actions.handleFormatText}
          onFormatCell={(format) => {
            if (activeDoc?.kind === 'Grid') {
              // The versioned handle carries date as the fourth quick format; the legacy
              // narrow ref stays populated for older shell consumers only.
              gridToolbarFormatActionsRef.current?.applyQuickFormat(format);
              return;
            }
            if (format !== 'date') actions.handleFormatCell(format);
          }}
          numberFormatPresets={activeDoc?.kind === 'Grid' ? GRID_NUMBER_FORMAT_PRESETS : undefined}
          onApplyNumberFormat={(id) => {
            if (activeDoc?.kind !== 'Grid') return;
            gridToolbarFormatActionsRef.current?.applyNumberFormat(id as GridNumberFormatId);
          }}
          onInsertShape={actions.handleInsertShape}
        />
      )}

      {/* 4. Active Document Viewport: All 14 Apps supported via AppWorkspaceView */}
      <main id="astraea-workspace-main" tabIndex={-1} data-content-color-policy={isWorkspaceExplorerOpen ? 'shell-dark' : activeDoc ? contentSurfaceColorPolicy(activeDoc.kind) : 'shell-dark'} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label={isWorkspaceExplorerOpen ? frameCopy.explorerMain : activeDoc ? frameCopy.activeDocument(surfaceCopy.modules[activeDoc.kind].shortName, activeDoc.title) : frameCopy.activeWorkspace}>
      {isWorkspaceExplorerOpen ? (
        <WorkspaceExplorer
          documents={explorerDocuments}
          storedDocumentIds={storedDocumentIds}
          storedDocumentIdCursor={storedDocumentIdCursor}
          hasMoreStoredDocumentIds={hasMoreStoredDocumentIds}
          loadStoredDocumentIdPage={listStoredDocumentIdPage}
          openDocumentIds={explorerOpenDocumentIds}
          recentEntries={libraryRecentEntries}
          metadataLocked={vaultStatus.isLocked}
          editionRegistry={ACTIVE_EDITION_REGISTRY}
          onClose={() => setIsWorkspaceExplorerOpen(false)}
          onOpenDocument={(documentId) => {
            setIsWorkspaceExplorerOpen(false);
            void handleOpenRecentDocument(documentId);
          }}
          onCreateDocument={(kind) => {
            setIsWorkspaceExplorerOpen(false);
            actions.handleCreateDocument(kind);
          }}
          onPersistenceError={() => showToast(frameCopy.explorerPreferencesError)}
        />
      ) : (
      <ModuleRecoveryBoundary document={activeDoc} locale={locale}>
      <AppWorkspaceView
        saveStatus={autosave.saveStatus}
        saveFailure={autosave.saveFailure}
        activeDoc={activeDoc}
        gridFormatActionRef={gridFormatActionRef}
        gridToolbarFormatActionsRef={gridToolbarFormatActionsRef}
        documents={documents}
        storedWorkspaceDocuments={writerWorkspaceSourceDocuments}
        loadStoredWorkspaceDocument={loadStoredWorkspaceDocument}
        onUpdateDocument={handleUpdateDocument}
        onSelectSelectionType={setActiveSelectionType}
        onCreateDerivedDocument={actions.handleCreateDerivedDocument}
        onInsertChart={actions.handleInsertChart}
        onOpenDocument={(id) => {
          actions.handleOpenDocument(id);
        }}
        onOpenExternalUrl={handleOpenExternalUrl}
        allowBrowserManagedSpeech={networkCapability === 'FullUserApproved'}
        vaultStatus={vaultStatus}
        activeDocumentPin={activeDocumentPin}
        activeDocumentPassword={activeDocumentPassword}
        onSetActiveDocumentPin={(pin) => {
          setDocumentPins((prev) => {
            const next = { ...prev };
            if (pin) next[activeDocId] = pin; else delete next[activeDocId];
            return next;
          });
          if (pin) setDocumentPasswords((prev) => { const next = { ...prev }; delete next[activeDocId]; return next; });
        }}
        onSetActiveDocumentPassword={(password) => {
          setDocumentPasswords((prev) => {
            const next = { ...prev };
            if (password) next[activeDocId] = password; else delete next[activeDocId];
            return next;
          });
          if (password) setDocumentPins((prev) => { const next = { ...prev }; delete next[activeDocId]; return next; });
        }}
        networkCapability={networkCapability}
      />
      </ModuleRecoveryBoundary>
      )}
      </main>

      {(!isZenMode || zenChromeReveal) && !isWorkspaceExplorerOpen && (
        <WorkspaceSaveIntegrityBanner
          saveStatus={autosave.saveStatus}
          saveFailure={autosave.saveFailure}
          busy={autosave.saveStatus === 'saving'}
          fileStoreAvailable={autosave.fileStoreAvailable}
          onRetry={() => { void autosave.retrySave(); }}
          onSaveAs={() => { void handleSaveVwcAs(); }}
          onRevealWorkspaceFiles={autosave.fileStoreAvailable ? () => { void autosave.openWorkspaceFilesFolder(); } : undefined}
        />
      )}
      {(!isZenMode || zenChromeReveal) && !isWorkspaceExplorerOpen && <ShellStatusBar
        document={activeDoc}
        save={autosave.saveStatus}
        saveFailure={autosave.saveFailure}
        saveProof={autosave.saveProof}
        saveWarning={autosave.saveWarning}
        workspaceFileStoreAvailable={autosave.fileStoreAvailable}
        onRevealWorkspaceFiles={autosave.fileStoreAvailable ? () => { void autosave.openWorkspaceFilesFolder(); } : undefined}
        scalePercent={shellAppearance.scalePercent}
        topSecretProviderReady={topSecretStatus.providerReady}
        pqcOperational={Boolean(vaultStatus.pqcUnlocked)}
        onUndo={activeDoc && operationEngine.canUndo(activeDoc.id) ? handleShellUndo : undefined}
        onRedo={activeDoc && operationEngine.canRedo(activeDoc.id) ? handleShellRedo : undefined}
        onScaleChange={(scalePercent) => handleShellAppearanceChange({ ...shellAppearance, scalePercent })}
      />}
      {isZenMode && <div className="pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-[9px] text-slate-400 opacity-0 transition-opacity hover:opacity-100" aria-hidden="true">{frameCopy.zenShortcut}</div>}

      <ShortcutCheatsheet open={isShortcutCheatsheetOpen} kind={activeDoc?.kind ?? null} shortcuts={shellShortcuts} onClose={() => setIsShortcutCheatsheetOpen(false)} />
      <DirtyCloseDialog document={pendingDirtyCloseDocumentId ? documents[pendingDirtyCloseDocumentId] ?? null : null} onResolve={(action) => { void handleResolveDirtyClose(action); }} />

      {/* 5. Start Center */}
      <StartCenter
        isOpen={isStartCenterOpen && !isSetupWizardOpen}
        initialSearchQuery={startCenterSearchQuery}
        onClose={() => setIsStartCenterOpen(false)}
        onCreateDocument={actions.handleCreateDocument}
        onCreateTemplate={actions.handleCreateTemplate}
        onOpenFile={actions.handleOpenFile}
        onOpenVault={() => {
          setIsStartCenterOpen(false);
          actions.handleSelectApp('Vault');
        }}
        onOpenExplorer={() => setIsWorkspaceExplorerOpen(true)}
        editionRegistry={ACTIVE_EDITION_REGISTRY}
        recoverySnapshots={recoverySnapshots}
        onRestoreRecovery={(snapshotId) => { void actions.handleRestoreRecovery(snapshotId); }}
        onDeleteRecovery={(snapshotId) => { void actions.handleDeleteRecovery(snapshotId); }}
        onExportDiagnostics={actions.handleExportDiagnostics}
        onOpenPlatformModal={() => setIsPlatformModalOpen(true)}
        documents={documents}
        recentEntries={recentEntries}
        storedDocumentIds={storedDocumentIds}
        metadataLocked={vaultStatus.isLocked}
        onOpenRecentDocument={(documentId) => { void handleOpenRecentDocument(documentId); }}
        shellAppearance={shellAppearance}
        shellShortcuts={shellShortcuts}
        shellUpdateState={shellUpdateState}
        onShellAppearanceChange={handleShellAppearanceChange}
        onShellShortcutChange={handleShellShortcutChange}
        onOpenNewWindow={() => { void handleOpenNewWindow(); }}
      />

      {isAppGuideLibraryOpen && (
        <aside
          aria-label={APP_GUIDE_INTERFACE_COPY[locale].libraryLabel}
          className="fixed inset-x-3 top-16 bottom-14 z-40 overflow-y-auto rounded-xl border border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-surface-z0)] p-4 text-[var(--vgt-text-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:inset-y-16 md:left-auto md:right-4 md:w-[min(54rem,calc(100vw-2rem))]"
        >
          <AppGuideLibrary
            open={isAppGuideLibraryOpen}
            locale={locale}
            initialKind={activeDoc && isOpenCoreAppGuideKind(activeDoc.kind) ? activeDoc.kind : 'Writer'}
            onOpenApp={(kind) => {
              setIsStartCenterOpen(false);
              actions.handleSelectApp(kind);
            }}
            onClose={() => setIsAppGuideLibraryOpen(false)}
            onOpenSetup={() => setIsSetupWizardOpen(true)}
            onStartInteractive={(target) => {
              setIsAppGuideLibraryOpen(false);
              // A deliberate tour launch takes precedence over first-open app tours.
              // Persist that presentation so selecting its first app cannot replace the flow.
              if (target.type === 'connected-workspace') {
                markAppGuideAutoShown({ type: 'app', kind: 'Grid' });
              } else {
                markAppGuideAutoShown(target);
              }
              setInteractiveGuideTarget(target);
              const targetApp = target.type === 'connected-workspace' ? 'Grid' : target.kind;
              if (activeDoc?.kind !== targetApp) actions.handleSelectApp(targetApp);
            }}
          />
        </aside>
      )}

      {interactiveGuideTarget && (
        <AppGuidePopover
          key={interactiveGuideTarget.type === 'app' ? `app:${interactiveGuideTarget.kind}` : 'connected-workspace'}
          locale={locale}
          target={interactiveGuideTarget}
          currentAppKind={activeDoc && isOpenCoreAppGuideKind(activeDoc.kind) ? activeDoc.kind : null}
          onOpenApp={(kind) => {
            setIsStartCenterOpen(false);
            setIsWorkspaceExplorerOpen(false);
            if (interactiveGuideTarget?.type === 'connected-workspace') {
              markAppGuideAutoShown({ type: 'app', kind });
            }
            if (activeDoc?.kind !== kind) actions.handleSelectApp(kind);
          }}
          onClose={() => setInteractiveGuideTarget(null)}
        />
      )}


      <SecurityProfileModal
        isOpen={isSecurityProfileOpen}
        document={activeDoc}
        vaultStatus={{ ...vaultStatus, hasPin: Boolean(activeDocumentPin), hasPortablePassword: Boolean(activeDocumentPassword) }}
        topSecretStatus={topSecretStatus}
        onClose={() => setIsSecurityProfileOpen(false)}
        onApply={(document) => { handleUpdateDocument(document); showToast(`Security Profile changed to ${document.securityPolicy?.profile ?? 'STANDARD'}; full reseal required on persistence.`); }}
        onInitializeIdentity={async () => {
          try {
            const status = await initializeTopSecretIdentity();
            setTopSecretStatus(status);
            showToast('Pinned VGT Infinity identity initialized inside the Top Secret KeyVault domain.');
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Top Secret identity initialization failed');
          }
        }}
      />
      <TopSecretProgressModal
        event={topSecretProgress}
        onCancel={(operationId) => { void cancelTopSecretOperation(operationId); }}
      />

      <FirstRunSetupWizard
        open={isSetupWizardOpen}
        locale={locale}
        localePreference={preference}
        onLocaleChange={setPreference}
        onOpenKeyVault={() => modals.setIsVaultOpen(true)}
        keyVaultReady={vaultStatus.coreConnected === true && vaultStatus.platform === 'SoftwareEncrypted' && !vaultStatus.isLocked}
        onComplete={() => setIsSetupWizardOpen(false)}
        onSkip={() => setIsSetupWizardOpen(false)}
      />

      {/* 6. Notification Toast */}
      {toastMessage && (() => {
        const critical = /(?:error|failed|failure|denied|blocked|warning|could not|cannot|rejected)/iu.test(toastMessage);
        return <div
          role={critical ? 'alert' : 'status'}
          aria-live={critical ? 'assertive' : 'polite'}
          aria-atomic="true"
          onMouseEnter={pauseToastDismiss}
          onMouseLeave={resumeToastDismiss}
          className={`fixed bottom-14 right-5 z-50 px-4 py-2.5 rounded-xl glass-dropdown border border-purple-500/35 text-purple-200 text-xs font-medium shadow-[0_12px_28px_rgba(0,0,0,0.48)] flex items-center space-x-2 transition-[opacity,transform] duration-200 ease-out ${toastVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
        >
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-purple-400" />
          <span>{toastMessage}</span>
        </div>;
      })()}

      {/* 7. Modals & Drawers */}
      <WorkspaceAppOverlayLayer {...props} onOpenSetup={() => setIsSetupWizardOpen(true)} />
    </div>
  );
}
