import React from 'react';
import {
  WorkspaceDocument,
  DocumentKind,
  KeyVaultStatus,
  NetworkCapability,
  NetworkAuditEntry,
} from '../../shared/contracts/workspace';
import type { FabricLink, FabricTransferChoice } from '../../shared/workspace-interaction/fabric';
import { CommandPalette } from '../command-palette/components/CommandPalette';
import { NetGateModal } from '../security/NetGateModal';
import { KeyVaultModal } from '../security/KeyVaultModal';
import { FabricGraphModal } from '../fabric/FabricGraphModal';
import { AppLauncherDrawer } from '../app-launcher/AppLauncherDrawer';
import { WorkspacePlatformAdvancedModal } from '../platform/WorkspacePlatformAdvancedModal';
import type { EditionRegistry } from '../../edition/contracts';

interface AppModalsProps {
  isAppLauncherOpen: boolean;
  setIsAppLauncherOpen: (open: boolean) => void;
  appLauncherReturnFocusTarget?: HTMLElement | null;
  onSelectApp: (kind: DocumentKind) => void;
  editionRegistry: EditionRegistry;
  onOpenStartCenter?: () => void;
  onOpenSearch?: () => void;
  onOpenExplorer?: () => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  onExecuteCommand: (action: string) => void;
  onOpenDocument?: (documentId: string) => void;
  isNetGateOpen: boolean;
  setIsNetGateOpen: (open: boolean) => void;
  networkCapability: NetworkCapability;
  setNetworkCapability: (cap: NetworkCapability) => void;
  auditLogs: NetworkAuditEntry[];
  onTriggerTestConnection: (target: string, purpose: string) => void | Promise<void>;
  isVaultOpen: boolean;
  setIsVaultOpen: (open: boolean) => void;
  vaultStatus: KeyVaultStatus;
  onSetPin: (pin: string | null) => void;
  onSetPortablePassword: (password: string | null) => void;
  onTogglePrivacyMode: () => void;
  onLockKeyVault: () => void | Promise<void>;
  onTopSecretAccessChanged?: () => void | Promise<void>;
  isFabricOpen: boolean;
  setIsFabricOpen: (open: boolean) => void;
  fabricLinks: FabricLink[];
  documents: Record<string, WorkspaceDocument>;
  activeDocumentId: string;
  onFabricOpenSource: (link: FabricLink) => void;
  onFabricRefresh: (link: FabricLink) => void;
  onFabricFreeze: (link: FabricLink) => void;
  onFabricBreakLink: (link: FabricLink) => void;
  onFabricRelink: (link: FabricLink, sourceDocumentId: string, sourceObjectId: string) => void;
  onFabricInsertFromWorkspace: (sourceDocumentId: string, sourceObjectId: string, choice: FabricTransferChoice) => void;
  isPlatformModalOpen?: boolean;
  setIsPlatformModalOpen?: (open: boolean) => void;
  showToast?: (msg: string) => void;
  onCloseAllDocuments?: () => void;
  onReopenClosedDocument?: () => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  isAppLauncherOpen,
  setIsAppLauncherOpen,
  appLauncherReturnFocusTarget,
  onSelectApp,
  editionRegistry,
  onOpenStartCenter,
  onOpenSearch,
  onOpenExplorer,
  isCommandPaletteOpen,
  setIsCommandPaletteOpen,
  onExecuteCommand,
  onOpenDocument,
  isNetGateOpen,
  setIsNetGateOpen,
  networkCapability,
  setNetworkCapability,
  auditLogs,
  onTriggerTestConnection,
  isVaultOpen,
  setIsVaultOpen,
  vaultStatus,
  onSetPin,
  onSetPortablePassword,
  onTogglePrivacyMode,
  onLockKeyVault,
  onTopSecretAccessChanged,
  isFabricOpen,
  setIsFabricOpen,
  fabricLinks,
  documents,
  activeDocumentId,
  onFabricOpenSource,
  onFabricRefresh,
  onFabricFreeze,
  onFabricBreakLink,
  onFabricRelink,
  onFabricInsertFromWorkspace,
  isPlatformModalOpen = false,
  setIsPlatformModalOpen,
  showToast = () => {},
  onCloseAllDocuments,
  onReopenClosedDocument,
}) => {
  return (
    <>
      <AppLauncherDrawer
        isOpen={isAppLauncherOpen}
        onClose={() => setIsAppLauncherOpen(false)}
        returnFocusTarget={appLauncherReturnFocusTarget}
        onSelectApp={onSelectApp}
        editionRegistry={editionRegistry}
        onOpenStartCenter={onOpenStartCenter}
        onOpenSearch={onOpenSearch}
        onOpenExplorer={onOpenExplorer}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onExecuteCommand={(command) => { if(command.startsWith('open-doc:')){ onOpenDocument?.(command.slice('open-doc:'.length)); return; } if(command==='close-all'){ onCloseAllDocuments?.(); return; } if(command==='reopen-closed'){ onReopenClosedDocument?.(); return; } onExecuteCommand(command); }}
        activeDocument={documents[activeDocumentId] ?? null}
        documents={documents}
        vaultAvailable={vaultStatus.coreConnected !== false}
      />

      <NetGateModal
        isOpen={isNetGateOpen}
        onClose={() => setIsNetGateOpen(false)}
        capability={networkCapability}
        onChangeCapability={setNetworkCapability}
        auditLogs={auditLogs}
        activeDocumentId={activeDocumentId}
        onTriggerTestConnection={onTriggerTestConnection}
      />

      <KeyVaultModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        status={vaultStatus}
        onSetPin={onSetPin}
        onSetPortablePassword={onSetPortablePassword}
        onTogglePrivacyMode={onTogglePrivacyMode}
        onLockKeyVault={onLockKeyVault}
        onTopSecretAccessChanged={onTopSecretAccessChanged}
      />

      <FabricGraphModal
        isOpen={isFabricOpen}
        onClose={() => setIsFabricOpen(false)}
        links={fabricLinks}
        documents={documents}
        activeDocumentId={activeDocumentId}
        onOpenSource={onFabricOpenSource}
        onRefresh={onFabricRefresh}
        onFreeze={onFabricFreeze}
        onBreakLink={onFabricBreakLink}
        onRelink={onFabricRelink}
        onInsertFromWorkspace={onFabricInsertFromWorkspace}
      />

      {setIsPlatformModalOpen && (
        <WorkspacePlatformAdvancedModal
          isOpen={isPlatformModalOpen}
          onClose={() => setIsPlatformModalOpen(false)}
          showToast={showToast}
        />
      )}
    </>
  );
};
