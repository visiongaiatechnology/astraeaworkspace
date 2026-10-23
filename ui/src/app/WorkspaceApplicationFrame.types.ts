// STATUS: PLATIN — explicit state and callback contract for the workspace shell surfaces.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { KeyVaultStatus, NetworkAuditEntry, NetworkCapability, WorkspaceDocument } from '../shared/contracts/workspace';
import type { RecoverySnapshotInfo } from '../platform/recovery/recovery';
import type { TopSecretProgressEvent, TopSecretRuntimeStatus } from '../platform/security/topSecretEngine';
import type { WorkspaceOperationEngine } from '../platform/workspace/operations/workspaceOperationEngine';
import type { useWorkspaceActions } from '../shell/workspace/useWorkspaceActions';
import type { useWorkspaceAutosave } from '../shell/persistence/useWorkspaceAutosave';
import type { useWorkspaceShellLifecycle } from '../shell/lifecycle/useWorkspaceShellLifecycle';
import type { useWorkspaceFabricActions } from '../shell/fabric/useWorkspaceFabricActions';
import type { useWorkspaceAppNotifications } from './useWorkspaceAppNotifications';
import type { useWorkspaceExternalNavigation } from './useWorkspaceExternalNavigation';
import type { WorkspaceLibrarySourceDocument, projectWorkspaceIntegrationSourceMetadata } from '../shell/library/workspaceLibrary';

export type StateSetter<T> = Dispatch<SetStateAction<T>>;

export interface WorkspaceApplicationFrameProps {
  readonly root: {
    readonly shellRootRef: MutableRefObject<HTMLDivElement | null>;
    readonly isZenMode: boolean;
    readonly zenChromeReveal: boolean;
    readonly setZenChromeReveal: StateSetter<boolean>;
  };
  readonly workspace: {
    readonly documents: Record<string, WorkspaceDocument>;
    readonly activeDocId: string;
    readonly activeDoc: WorkspaceDocument | null;
    readonly activeSelectionType: 'text' | 'cell' | 'shape' | 'chart';
    readonly setActiveSelectionType: StateSetter<'text' | 'cell' | 'shape' | 'chart'>;
    readonly isClassicRibbon: boolean;
    readonly setIsClassicRibbon: StateSetter<boolean>;
    readonly isWorkspaceExplorerOpen: boolean;
    readonly setIsWorkspaceExplorerOpen: StateSetter<boolean>;
    readonly explorerDocuments: Record<string, WorkspaceLibrarySourceDocument>;
    readonly explorerOpenDocumentIds: Set<string>;
    readonly writerWorkspaceSourceDocuments: ReturnType<typeof projectWorkspaceIntegrationSourceMetadata>;
  };
  readonly actions: ReturnType<typeof useWorkspaceActions>;
  readonly shell: ReturnType<typeof useWorkspaceShellLifecycle>;
  readonly autosave: ReturnType<typeof useWorkspaceAutosave>;
  readonly operationEngine: WorkspaceOperationEngine;
  readonly fabric: ReturnType<typeof useWorkspaceFabricActions>;
  readonly notifications: ReturnType<typeof useWorkspaceAppNotifications>;
  readonly recovery: {
    readonly snapshots: RecoverySnapshotInfo[];
    readonly isStartCenterOpen: boolean;
    readonly setIsStartCenterOpen: StateSetter<boolean>;
    readonly startCenterSearchQuery: string;
    readonly setStartCenterSearchQuery: StateSetter<string>;
  };
  readonly security: {
    readonly networkCapability: NetworkCapability;
    readonly setNetworkCapability: StateSetter<NetworkCapability>;
    readonly auditLogs: NetworkAuditEntry[];
    readonly vaultStatus: KeyVaultStatus;
    readonly setVaultStatus: StateSetter<KeyVaultStatus>;
    readonly documentPins: Record<string, string>;
    readonly setDocumentPins: StateSetter<Record<string, string>>;
    readonly documentPasswords: Record<string, string>;
    readonly setDocumentPasswords: StateSetter<Record<string, string>>;
    readonly activeDocumentPin: string | null;
    readonly activeDocumentPassword: string | null;
    readonly topSecretProgress: TopSecretProgressEvent | null;
    readonly topSecretStatus: TopSecretRuntimeStatus;
    readonly setTopSecretStatus: StateSetter<TopSecretRuntimeStatus>;
  };
  readonly modals: {
    readonly isAppLauncherOpen: boolean;
    readonly setIsAppLauncherOpen: StateSetter<boolean>;
    readonly appLauncherReturnFocusTarget: HTMLElement | null;
    readonly isCommandPaletteOpen: boolean;
    readonly setIsCommandPaletteOpen: StateSetter<boolean>;
    readonly isNetGateOpen: boolean;
    readonly setIsNetGateOpen: StateSetter<boolean>;
    readonly isVaultOpen: boolean;
    readonly setIsVaultOpen: StateSetter<boolean>;
    readonly isFabricOpen: boolean;
    readonly setIsFabricOpen: StateSetter<boolean>;
    readonly isPlatformModalOpen: boolean;
    readonly setIsPlatformModalOpen: StateSetter<boolean>;
    readonly isWorkspaceSettingsOpen: boolean;
    readonly setIsWorkspaceSettingsOpen: StateSetter<boolean>;
    readonly isSecurityProfileOpen: boolean;
    readonly setIsSecurityProfileOpen: StateSetter<boolean>;
    readonly isShortcutCheatsheetOpen: boolean;
    readonly setIsShortcutCheatsheetOpen: StateSetter<boolean>;
  };
  readonly callbacks: {
    readonly handleUpdateDocument: (document: WorkspaceDocument) => void;
    readonly handleOpenExternalUrl: ReturnType<typeof useWorkspaceExternalNavigation>;
    readonly handleSaveVwc: () => Promise<void>;
    /** Native "Speichern unter…": save dialog + atomic sandbox export of the encrypted container. */
    readonly handleSaveVwcAs: () => Promise<void>;
    /** Bundle all loaded documents into one real ZIP backup (encrypted containers + manifest). */
    readonly handleWorkspaceBackup: () => Promise<void>;
    /** Restore a workspace backup (newer local documents win; locked entries are reported). */
    readonly handleWorkspaceRestore: () => Promise<void>;
    readonly handleShellUndo: () => void;
    readonly handleShellRedo: () => void;
    readonly openAppLauncher: (trigger?: HTMLElement) => void;
  };
}

export type WorkspaceAppOverlayProps = Pick<WorkspaceApplicationFrameProps,
  'workspace' | 'actions' | 'shell' | 'fabric' | 'notifications' | 'recovery' | 'security' | 'modals' | 'callbacks'> & {
    readonly onOpenSetup: () => void;
  };
