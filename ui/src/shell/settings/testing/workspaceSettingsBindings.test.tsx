import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSettingsModal } from '../WorkspaceSettingsModal';
import {
  createWorkspaceSettingsBindingFacade,
  WORKSPACE_SETTINGS_BINDINGS,
  WORKSPACE_SETTINGS_SECTIONS,
  workspaceShortcutBindingId,
  type WorkspaceSettingsSectionId,
} from '../workspaceSettingsBindings';
import {
  DEFAULT_SHELL_APPEARANCE,
  DEFAULT_SHELL_SHORTCUTS,
  loadShellAppearance,
  loadShellShortcuts,
  saveShellAppearance,
  saveShellShortcuts,
  setShortcutBinding,
  shortcutMatches,
  type ShellStorageLike,
} from '../../platform/workspaceShellPlatform';
import { loadWorkspaceLocale, resolveWorkspaceLocale, saveWorkspaceLocale } from '../../localization/workspaceLocale';
import { buildConnectMailAccount, loadConnectMailAccounts } from '../connectSettingsCore';
import { saveStartSidebarPreference } from '../../start-center/navigation/startSidebarPreference';

function memoryStorage(): ShellStorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function renderSettingsSection(section: WorkspaceSettingsSectionId): string {
  return renderToStaticMarkup(createElement(WorkspaceSettingsModal, {
    isOpen: true,
    initialSection: section,
    onClose: vi.fn(),
    appearance: DEFAULT_SHELL_APPEARANCE,
    shortcuts: DEFAULT_SHELL_SHORTCUTS,
    onAppearanceChange: vi.fn(),
    onShortcutChange: vi.fn(),
  }));
}

function renderedControlBindings(section: WorkspaceSettingsSectionId): string[] {
  // Support is a read-only donation surface by design: its buttons copy addresses and are not
  // persistent settings bindings, so it is excluded from the "every control is bound" rule.
  if (section === 'support') return [];
  const html = renderSettingsSection(section);
  const region = html.indexOf(`data-settings-control-region="${section}"`);
  expect(region).toBeGreaterThanOrEqual(0);
  const controls = html.slice(region).match(/<(?:button|input|select)\b[^>]*>/g) ?? [];
  expect(controls.length).toBeGreaterThan(0);
  const registeredIds = new Set(Object.keys(WORKSPACE_SETTINGS_BINDINGS));
  return controls.map((control) => {
    const binding = control.match(/data-setting-binding="([^"]+)"/)?.[1];
    expect(binding, `Unbound Settings control in ${section}: ${control}`).toBeDefined();
    expect(registeredIds.has(binding ?? ''), `Unknown Settings binding ${binding}`).toBe(true);
    return binding ?? '';
  });
}

describe('typed Workspace Settings bindings', () => {
  it('registers the current sections and binds every server-rendered control', () => {
    expect(WORKSPACE_SETTINGS_SECTIONS.map(({ id }) => id)).toEqual(['general', 'appearance', 'language', 'connect', 'shortcuts', 'support']);

    const controlsBySection = new Map<WorkspaceSettingsSectionId, string[]>(
      WORKSPACE_SETTINGS_SECTIONS.map(({ id }) => [id, renderedControlBindings(id)]),
    );
    expect(new Set(controlsBySection.get('appearance'))).toEqual(new Set([
      'appearance.theme', 'appearance.accent', 'appearance.surface-intensity',
      'appearance.direction', 'appearance.scale', 'appearance.high-contrast', 'appearance.reduced-motion',
    ]));
    expect(controlsBySection.get('general')).toEqual(['general.start-center-sidebar-collapsed']);
    expect(controlsBySection.get('language')).toEqual(['language.preference']);
    expect(controlsBySection.get('connect')).toContain('connect.mail-profile');
    // Support is a read-only donation surface: it has no bindable control by design.
    expect(controlsBySection.get('support')).toEqual([]);
    expect(controlsBySection.get('shortcuts')).toEqual(Object.keys(DEFAULT_SHELL_SHORTCUTS).flatMap((command) => [
      workspaceShortcutBindingId(command as keyof typeof DEFAULT_SHELL_SHORTCUTS),
      workspaceShortcutBindingId(command as keyof typeof DEFAULT_SHELL_SHORTCUTS),
    ]));

    for (const definition of Object.values(WORKSPACE_SETTINGS_BINDINGS)) {
      expect(WORKSPACE_SETTINGS_SECTIONS.some((section) => section.id === definition.section)).toBe(true);
      expect(definition.id).toBeDefined();
    }
  });

  it('routes Appearance, Language, and Shortcuts through persistent consumers', () => {
    const storage = memoryStorage();
    const facade = createWorkspaceSettingsBindingFacade({
      storage,
      onAppearanceChange: (next) => { saveShellAppearance(storage, next); },
      onLocalePreferenceChange: (next) => { saveWorkspaceLocale(storage, next); },
      onShortcutChange: (command, binding) => {
        const next = setShortcutBinding(loadShellShortcuts(storage), command, binding);
        saveShellShortcuts(storage, next);
      },
    });

    facade.appearance.apply({ ...DEFAULT_SHELL_APPEARANCE, themeId: 'sovereign-gold', scalePercent: 150 });
    expect(loadShellAppearance(storage)).toMatchObject({ themeId: 'sovereign-gold', scalePercent: 150 });

    facade.language.apply('ja-JP');
    expect(loadWorkspaceLocale(storage)).toBe('ja-JP');
    expect(resolveWorkspaceLocale(loadWorkspaceLocale(storage))).toBe('ja-JP');

    facade.shortcuts.apply('workspace-explorer', 'Ctrl+Alt+X');
    const shortcuts = loadShellShortcuts(storage);
    expect(shortcuts['workspace-explorer']).toBe('Ctrl+Alt+X');
    expect(shortcutMatches({ key: 'x', ctrlKey: true, metaKey: false, altKey: true, shiftKey: false }, shortcuts['workspace-explorer'])).toBe(true);
  });

  it('routes the Start Center sidebar setting through its shared local preference while preserving width', () => {
    const storage = memoryStorage();
    saveStartSidebarPreference(storage, { collapsed: false, width: 236 });
    const facade = createWorkspaceSettingsBindingFacade({
      storage,
      onAppearanceChange: vi.fn(),
      onLocalePreferenceChange: vi.fn(),
      onShortcutChange: vi.fn(),
    });

    expect(facade.general.loadStartSidebarPreference()).toEqual({ collapsed: false, width: 236 });
    expect(facade.general.setStartSidebarCollapsed(true)).toEqual({ collapsed: true, width: 236 });
    expect(facade.general.loadStartSidebarPreference()).toEqual({ collapsed: true, width: 236 });
  });

  it('routes Connect profile reads and writes to the existing validated profile store', () => {
    const storage = memoryStorage();
    const facade = createWorkspaceSettingsBindingFacade({
      storage,
      onAppearanceChange: vi.fn(),
      onLocalePreferenceChange: vi.fn(),
      onShortcutChange: vi.fn(),
    });
    let id = 0;
    const profile = buildConnectMailAccount({
      accountName: 'Astraea test mailbox',
      displayName: 'Astraea User',
      address: 'user@example.com',
      username: 'user@example.com',
      imapHost: 'imap.example.com',
      imapPort: 993,
      imapTls: 'tls',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpTls: 'starttls-required',
    }, undefined, 1_800_000_000_000, () => `fixture-${++id}`);

    expect(facade.connect.saveMailProfiles([profile])).toEqual([profile]);
    expect(facade.connect.loadMailProfiles()).toEqual([profile]);
    expect(loadConnectMailAccounts(storage)).toEqual([profile]);
    expect(storage.values.get('astraea.connect.accounts.v1')).not.toContain('password');
    expect(storage.values.get('astraea.connect.accounts.v1')).not.toContain('secret');
  });
});
