import { HeartHandshake, Keyboard, Languages, Mail, MonitorCog, Settings2, type LucideIcon } from 'lucide-react';
import type { WorkspaceChromeMessage, WorkspaceLocalePreference } from '../localization/workspaceLocale';
import { normalizeWorkspaceLocale } from '../localization/workspaceLocale';
import type { ShellAppearancePreference, ShellShortcutCommand, ShellStorageLike } from '../platform/workspaceShellPlatform';
import { canUseConnectKeyVault, deleteConnectCredential, hasConnectCredential, storeConnectCredential } from '../../platform/connectors/secrets/connectKeyVaultSecrets';
import { loadConnectMailAccounts, saveConnectMailAccounts } from '../../shell/settings/connectSettingsCore';
import type { ConnectAccount } from '../../platform/connectors/connectCoreTypes';
import { loadStartSidebarPreference, setStartSidebarCollapsed } from '../../shell/start-center/navigation/startSidebarPreference';

export const WORKSPACE_SETTINGS_SECTIONS = [
  { id: 'general', label: 'settings.general', icon: Settings2 },
  { id: 'appearance', label: 'settings.appearance', icon: MonitorCog },
  { id: 'language', label: 'settings.language', icon: Languages },
  { id: 'connect', label: 'settings.connect', icon: Mail },
  { id: 'shortcuts', label: 'settings.shortcuts', icon: Keyboard },
  { id: 'support', label: 'settings.support', icon: HeartHandshake },
] as const satisfies ReadonlyArray<{
  id: WorkspaceSettingsSectionId;
  label: WorkspaceChromeMessage;
  icon: LucideIcon;
}>;

export type WorkspaceSettingsSectionId = 'general' | 'appearance' | 'language' | 'connect' | 'shortcuts' | 'support';

export const WORKSPACE_SETTINGS_BINDING_IDS = {
  startCenterSidebarCollapsed: 'general.start-center-sidebar-collapsed',
  theme: 'appearance.theme',
  accent: 'appearance.accent',
  surfaceIntensity: 'appearance.surface-intensity',
  direction: 'appearance.direction',
  scale: 'appearance.scale',
  highContrast: 'appearance.high-contrast',
  reducedMotion: 'appearance.reduced-motion',
  language: 'language.preference',
  connectProfile: 'connect.mail-profile',
} as const;

type ShortcutBindingId = `shortcuts.${ShellShortcutCommand}`;
export type WorkspaceSettingsBindingId =
  | (typeof WORKSPACE_SETTINGS_BINDING_IDS)[keyof typeof WORKSPACE_SETTINGS_BINDING_IDS]
  | ShortcutBindingId;

type WorkspaceSettingsBindingSource =
  | 'start-center-sidebar-local-preference'
  | 'shell-appearance-callback'
  | 'workspace-locale-context'
  | 'connect-mail-profile-storage-and-key-vault'
  | 'shell-shortcut-callback';

interface WorkspaceSettingsBindingDefinition {
  id: WorkspaceSettingsBindingId;
  section: WorkspaceSettingsSectionId;
  source: WorkspaceSettingsBindingSource;
}

const APPEARANCE_SOURCE = 'shell-appearance-callback' as const;
const CONNECT_SOURCE = 'connect-mail-profile-storage-and-key-vault' as const;
const SHORTCUT_SOURCE = 'shell-shortcut-callback' as const;

export const WORKSPACE_SETTINGS_BINDINGS = {
  'general.start-center-sidebar-collapsed': { id: 'general.start-center-sidebar-collapsed', section: 'general', source: 'start-center-sidebar-local-preference' },
  'appearance.theme': { id: 'appearance.theme', section: 'appearance', source: APPEARANCE_SOURCE },
  'appearance.accent': { id: 'appearance.accent', section: 'appearance', source: APPEARANCE_SOURCE },
  'appearance.surface-intensity': { id: 'appearance.surface-intensity', section: 'appearance', source: APPEARANCE_SOURCE },
  'appearance.direction': { id: 'appearance.direction', section: 'appearance', source: APPEARANCE_SOURCE },
  'appearance.scale': { id: 'appearance.scale', section: 'appearance', source: APPEARANCE_SOURCE },
  'appearance.high-contrast': { id: 'appearance.high-contrast', section: 'appearance', source: APPEARANCE_SOURCE },
  'appearance.reduced-motion': { id: 'appearance.reduced-motion', section: 'appearance', source: APPEARANCE_SOURCE },
  'language.preference': { id: 'language.preference', section: 'language', source: 'workspace-locale-context' },
  'connect.mail-profile': { id: 'connect.mail-profile', section: 'connect', source: CONNECT_SOURCE },
  'shortcuts.command-palette': { id: 'shortcuts.command-palette', section: 'shortcuts', source: SHORTCUT_SOURCE },
  'shortcuts.save': { id: 'shortcuts.save', section: 'shortcuts', source: SHORTCUT_SOURCE },
  'shortcuts.quick-add-task': { id: 'shortcuts.quick-add-task', section: 'shortcuts', source: SHORTCUT_SOURCE },
  'shortcuts.start-center': { id: 'shortcuts.start-center', section: 'shortcuts', source: SHORTCUT_SOURCE },
  'shortcuts.workspace-explorer': { id: 'shortcuts.workspace-explorer', section: 'shortcuts', source: SHORTCUT_SOURCE },
  'shortcuts.new-window': { id: 'shortcuts.new-window', section: 'shortcuts', source: SHORTCUT_SOURCE },
} as const satisfies Readonly<Record<WorkspaceSettingsBindingId, WorkspaceSettingsBindingDefinition>>;

export function workspaceShortcutBindingId(command: ShellShortcutCommand): ShortcutBindingId {
  return `shortcuts.${command}`;
}

export interface WorkspaceSettingsBindingDependencies {
  storage: ShellStorageLike | null;
  onAppearanceChange: (next: ShellAppearancePreference) => void;
  onLocalePreferenceChange: (next: WorkspaceLocalePreference) => void;
  onShortcutChange: (command: ShellShortcutCommand, binding: string) => void;
}

export function createWorkspaceSettingsBindingFacade(dependencies: WorkspaceSettingsBindingDependencies) {
  const { storage, onAppearanceChange, onLocalePreferenceChange, onShortcutChange } = dependencies;
  return {
    general: {
      loadStartSidebarPreference: () => loadStartSidebarPreference(storage),
      setStartSidebarCollapsed: (collapsed: boolean) => setStartSidebarCollapsed(storage, collapsed),
    },
    appearance: {
      apply: onAppearanceChange,
    },
    language: {
      apply(value: unknown): WorkspaceLocalePreference {
        const preference = normalizeWorkspaceLocale(value);
        onLocalePreferenceChange(preference);
        return preference;
      },
    },
    connect: {
      loadMailProfiles: (): ConnectAccount[] => loadConnectMailAccounts(storage),
      saveMailProfiles: (accounts: readonly ConnectAccount[]): ConnectAccount[] => saveConnectMailAccounts(storage, accounts),
      hasCredential: hasConnectCredential,
      storeCredential: storeConnectCredential,
      deleteCredential: deleteConnectCredential,
      checkKeyVault: canUseConnectKeyVault,
    },
    shortcuts: {
      apply: onShortcutChange,
    },
  };
}
