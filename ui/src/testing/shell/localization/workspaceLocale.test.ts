import { describe, expect, it } from 'vitest';
import { loadWorkspaceLocale, normalizeWorkspaceLocale, resolveWorkspaceLocale, saveWorkspaceLocale, workspaceText, WORKSPACE_LOCALES, type WorkspaceLocalePreference } from '../../../shell/localization/workspaceLocale';
import type { ShellStorageLike } from '../../../shell/platform/workspaceShellPlatform';

class MemoryStorage implements ShellStorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('workspace locale preference', () => {
  it('normalizes every supported interface language and rejects unknown values', () => {
    for (const locale of WORKSPACE_LOCALES) expect(normalizeWorkspaceLocale(locale)).toBe(locale);
    expect(normalizeWorkspaceLocale('fr-FR')).toBe('system');
    expect(normalizeWorkspaceLocale({ language: 'de-DE' })).toBe('system');
  });

  it('stores explicit choices and resolves all seven supported system languages', () => {
    const storage = new MemoryStorage();
    expect(loadWorkspaceLocale(storage)).toBe('system');
    expect(saveWorkspaceLocale(storage, 'de-DE')).toBe('de-DE');
    expect(loadWorkspaceLocale(storage)).toBe('de-DE');
    expect(resolveWorkspaceLocale('system', 'de-AT')).toBe('de-DE');
    expect(resolveWorkspaceLocale('system', 'en-GB')).toBe('en-US');
    expect(resolveWorkspaceLocale('system', 'ru_RU')).toBe('ru-RU');
    expect(resolveWorkspaceLocale('system', 'it-IT')).toBe('it-IT');
    expect(resolveWorkspaceLocale('system', 'es-MX')).toBe('es-ES');
    expect(resolveWorkspaceLocale('system', 'ja-JP')).toBe('ja-JP');
    expect(resolveWorkspaceLocale('system', 'zh-Hant-TW')).toBe('zh-CN');
    expect(resolveWorkspaceLocale('system', 'fr-FR')).toBe('en-US');
    expect(resolveWorkspaceLocale('en-US', 'de-DE')).toBe('en-US');
  });

  it('uses the selected language for header and settings labels', () => {
    const locales: WorkspaceLocalePreference[] = [...WORKSPACE_LOCALES];
    expect(locales.map((locale) => workspaceText('header.settings', resolveWorkspaceLocale(locale)))).toEqual([
      'Einstellungen', 'Settings', 'Настройки', 'Impostazioni', 'Ajustes', '設定', '设置',
    ]);
    expect(workspaceText('settings.connect', 'de-DE')).toBe('Astraea Connect');
    for (const locale of WORKSPACE_LOCALES) {
      expect(workspaceText('settings.interfaceLanguage', locale).length).toBeGreaterThan(0);
      expect(workspaceText('explorer.openDocument', locale).length).toBeGreaterThan(0);
      expect(workspaceText('explorer.openProtectedDocument', locale).length).toBeGreaterThan(0);
      expect(workspaceText('workspace.restore.integrityFailure', locale).length).toBeGreaterThan(0);
      expect(workspaceText('workspace.restore.multipleIntegrityFailures', locale).length).toBeGreaterThan(0);
      expect(workspaceText('workspace.restore.libraryUnavailable', locale).length).toBeGreaterThan(0);
    }
  });

  it('provides theme descriptions, accent names, and surface intensity labels in every supported language', () => {
    const themeAndAccentMessages = [
      'settings.themeSystemDescription', 'settings.themeCosmicDescription', 'settings.themeGoldDescription',
      'settings.themeEmeraldDescription', 'settings.themeSapphireDescription', 'settings.themeCrimsonDescription',
      'settings.themeArcticDescription', 'settings.accentPreset', 'settings.accentViolet', 'settings.accentSapphire',
      'settings.accentCyan', 'settings.accentEmerald', 'settings.accentGold', 'settings.accentRuby',
      'settings.accentFuchsia', 'settings.accentSilver', 'settings.intensityOled', 'settings.intensityObsidian',
      'settings.intensitySlate', 'settings.intensityOledDescription', 'settings.intensityObsidianDescription',
      'settings.intensitySlateDescription', 'settings.darkSurfaceScope', 'settings.themeScope',
    ] as const;
    for (const locale of WORKSPACE_LOCALES) {
      for (const message of themeAndAccentMessages) {
        expect(workspaceText(message, locale).trim().length, `${locale} ${message}`).toBeGreaterThan(0);
      }
    }
  });

  it('provides Explorer availability and date copy in every supported language', () => {
    for (const locale of WORKSPACE_LOCALES) {
      for (const message of [
        'settings.general', 'settings.generalDescription', 'settings.startCenterSidebar',
        'settings.startCenterSidebarDescription', 'settings.collapsed', 'settings.expanded',
        'explorer.closeDetails',
        'explorer.resultCount', 'explorer.statusOpen', 'explorer.statusSaved',
        'explorer.statusProtected', 'explorer.statusUnavailable', 'explorer.statusPremium',
        'explorer.dateProtected', 'explorer.dateUnavailable', 'explorer.loadMore',
        'explorer.previousPage', 'explorer.nextPage', 'explorer.pageNavigation', 'explorer.pageOf',
      ] as const) {
        expect(workspaceText(message, locale).trim().length, `${locale} ${message}`).toBeGreaterThan(0);
      }
    }
    expect(workspaceText('explorer.statusSaved', 'ja-JP')).toBe('ローカルに保存済み');
    expect(workspaceText('explorer.loadMore', 'zh-CN')).toBe('加载更多文档');
    expect(workspaceText('explorer.pageOf', 'de-DE').replace('{current}', '2').replace('{total}', '7')).toBe('Seite 2 von 7');
  });
});
