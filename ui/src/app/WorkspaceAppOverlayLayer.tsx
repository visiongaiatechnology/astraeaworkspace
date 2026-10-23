// STATUS: PLATIN — composes workspace command, KeyVault, Fabric, and settings overlays from the app controller contract.
import { AppModals } from '../shell/overlays/AppModals';
import { WorkspaceSettingsModal } from '../shell/settings/WorkspaceSettingsModal';
import { ACTIVE_EDITION_REGISTRY } from '../edition/activeEdition';
import { fetchKeyVaultRuntimeStatus, lockKeyVaultRuntime } from '../platform/operations/appContainerOps';
import { fetchTopSecretStatus } from '../platform/security/topSecretEngine';
import type { WorkspaceDocument } from '../shared/contracts/workspace';
import type { WorkspaceAppOverlayProps } from './WorkspaceApplicationFrame.types';

export function WorkspaceAppOverlayLayer(props: WorkspaceAppOverlayProps) {
  const { onOpenSetup } = props;
  const { workspace, actions, shell, fabric, notifications, recovery, security, modals, callbacks } = props;
  const { documents, activeDocId, setIsWorkspaceExplorerOpen } = workspace;
  const { shellAppearance, shellShortcuts, handleShellAppearanceChange, handleShellShortcutChange,
    handleCloseAllDocuments, handleReopenClosedDocument } = shell;
  const { showToast } = notifications;
  const { setIsStartCenterOpen, setStartCenterSearchQuery } = recovery;
  const { networkCapability, setNetworkCapability, auditLogs, vaultStatus, setVaultStatus,
    setDocumentPins, setDocumentPasswords, activeDocumentPin,
    activeDocumentPassword, setTopSecretStatus } = security;
  const { isAppLauncherOpen, setIsAppLauncherOpen, appLauncherReturnFocusTarget,
    isCommandPaletteOpen, setIsCommandPaletteOpen, isNetGateOpen, setIsNetGateOpen,
    isVaultOpen, setIsVaultOpen, isFabricOpen, setIsFabricOpen, isPlatformModalOpen,
    setIsPlatformModalOpen, isWorkspaceSettingsOpen, setIsWorkspaceSettingsOpen } = modals;
  const { fabricLinks, handleFabricOpenSource, handleFabricRefresh, handleFabricFreeze,
    handleFabricBreakLink, handleFabricRelink, handleFabricInsertFromWorkspace } = fabric;
  const { handleSaveVwc, handleWorkspaceBackup, handleWorkspaceRestore } = callbacks;


  return (
    <>
      <AppModals
        isAppLauncherOpen={isAppLauncherOpen}
        setIsAppLauncherOpen={setIsAppLauncherOpen}
        appLauncherReturnFocusTarget={appLauncherReturnFocusTarget}
        onSelectApp={actions.handleSelectApp}
        editionRegistry={ACTIVE_EDITION_REGISTRY}
        onOpenStartCenter={() => setIsStartCenterOpen(true)}
        onOpenSearch={() => { setStartCenterSearchQuery(''); setIsStartCenterOpen(true); }}
        onOpenExplorer={() => { setIsStartCenterOpen(false); setIsWorkspaceExplorerOpen(true); }}
        isCommandPaletteOpen={isCommandPaletteOpen}
        setIsCommandPaletteOpen={setIsCommandPaletteOpen}
        onOpenDocument={actions.handleOpenDocument}
        onExecuteCommand={(action) => {
          const createMap: Partial<Record<string, WorkspaceDocument['kind']>> = {
            'new-writer': 'Writer',
            'new-grid': 'Grid',
            'new-present': 'Present',
            'new-notes': 'Notes',
            'new-pdf': 'PdfStudio',
            'new-tasks': 'Tasks',
            'new-planner': 'Planner',
            'new-projects': 'Projects',
            'new-whiteboard': 'Whiteboard',
            'new-forms': 'Forms',
            'new-database': 'Database',
            'new-vault': 'Vault',
            'new-publish': 'Publish',
            'new-insight': 'Insight',
            'new-connect': 'Connect',
            'new-automate': 'Automate',
            'new-admin-policy': 'AdminPolicy',
            'new-draw': 'Draw',
            'new-spaces': 'Spaces',
          };
          const documentKind = createMap[action];
          if (documentKind) {
            actions.handleCreateDocument(documentKind);
            return;
          }
          if (action === 'save-vwc') void handleSaveVwc();
          else if (action === 'backup-workspace') void handleWorkspaceBackup();
          else if (action === 'restore-workspace') void handleWorkspaceRestore();
          else if (action === 'open-explorer') { setIsStartCenterOpen(false); setIsWorkspaceExplorerOpen(true); }
          else if (action === 'open-vault') setIsVaultOpen(true);
          else if (action === 'open-netgate') setIsNetGateOpen(true);
          else if (action === 'open-fabric') setIsFabricOpen(true);
          else if (action === 'insert-chart') actions.handleInsertChart();
          else if (action === 'open-platform') setIsPlatformModalOpen(true);
          else if (action === 'toggle-privacy') {
            setVaultStatus((prev) => ({ ...prev, privacyMode: !prev.privacyMode }));
            showToast('Privacy Mode toggled');
          }
        }}
        isNetGateOpen={isNetGateOpen}
        setIsNetGateOpen={setIsNetGateOpen}
        networkCapability={networkCapability}
        setNetworkCapability={setNetworkCapability}
        auditLogs={auditLogs}
        onTriggerTestConnection={actions.handleTriggerTestConnection}
        isVaultOpen={isVaultOpen}
        setIsVaultOpen={setIsVaultOpen}
        vaultStatus={{ ...vaultStatus, hasPin: Boolean(activeDocumentPin), hasPortablePassword: Boolean(activeDocumentPassword) }}
        onSetPin={(pin) => {
          setDocumentPins((prev) => {
            if (pin) return { ...prev, [activeDocId]: pin };
            if (!(activeDocId in prev)) return prev;
            const copy = { ...prev };
            delete copy[activeDocId];
            return copy;
          });
          if (pin) setDocumentPasswords((prev) => { const copy = { ...prev }; delete copy[activeDocId]; return copy; });
          showToast(pin ? 'PIN protection enabled for this document' : 'PIN protection removed from this document');
        }}
        onSetPortablePassword={(password) => {
          setDocumentPasswords((prev) => {
            if (password) return { ...prev, [activeDocId]: password };
            if (!(activeDocId in prev)) return prev;
            const copy = { ...prev };
            delete copy[activeDocId];
            return copy;
          });
          if (password) setDocumentPins((prev) => { const copy = { ...prev }; delete copy[activeDocId]; return copy; });
          showToast(password ? 'Portable password enabled for this document' : 'Portable password removed from this document');
        }}
        onTogglePrivacyMode={() => {
          setVaultStatus((prev) => ({ ...prev, privacyMode: !prev.privacyMode }));
          showToast('Privacy Mode toggled');
        }}
        onLockKeyVault={async () => {
          const runtime = await lockKeyVaultRuntime();
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
          setDocumentPins({});
          setDocumentPasswords({});
          showToast(runtime.connected ? 'KeyVault relocked and session credentials cleared' : 'KeyVault Core unavailable');
        }}
        onTopSecretAccessChanged={async () => {
          const runtime = await fetchKeyVaultRuntimeStatus();
          setVaultStatus((prev) => ({ ...prev, isLocked: !runtime.isUnlocked, platform: runtime.platform, providerName: runtime.providerName, providerAvailable: runtime.providerAvailable, securePersistence: runtime.securePersistence, hardwareInterfaceDetected: runtime.hardwareInterfaceDetected, hardwareSlotSupported: runtime.hardwareSlotSupported, providerCapabilities: runtime.providerCapabilities, providerDetail: runtime.providerDetail, coreConnected: runtime.connected, hardwareBacked: runtime.hardwareBacked, hardwareAttestationVerified: runtime.hardwareAttestationVerified, softwareProviderConfigured: runtime.softwareProviderConfigured, pqcUnlocked: runtime.pqcUnlocked, topSecretEnrolled: runtime.topSecretEnrolled, topSecretUnlocked: runtime.topSecretUnlocked }));
          setTopSecretStatus(await fetchTopSecretStatus());
        }}
        isFabricOpen={isFabricOpen}
        setIsFabricOpen={setIsFabricOpen}
        fabricLinks={fabricLinks}
        documents={documents}
        activeDocumentId={activeDocId}
        onFabricOpenSource={handleFabricOpenSource}
        onFabricRefresh={handleFabricRefresh}
        onFabricFreeze={handleFabricFreeze}
        onFabricBreakLink={handleFabricBreakLink}
        onFabricRelink={handleFabricRelink}
        onFabricInsertFromWorkspace={handleFabricInsertFromWorkspace}
        isPlatformModalOpen={isPlatformModalOpen}
        setIsPlatformModalOpen={setIsPlatformModalOpen}
        showToast={showToast}
        onCloseAllDocuments={() => { void handleCloseAllDocuments(); }}
        onReopenClosedDocument={() => { void handleReopenClosedDocument(); }}
      />
      <WorkspaceSettingsModal
        isOpen={isWorkspaceSettingsOpen}
        onClose={() => setIsWorkspaceSettingsOpen(false)}
        appearance={shellAppearance}
        shortcuts={shellShortcuts}
        onAppearanceChange={handleShellAppearanceChange}
        onShortcutChange={handleShellShortcutChange}
        showToast={showToast}
        onOpenSetup={onOpenSetup}
      />
    </>
  );
}
