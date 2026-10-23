// STATUS: PLATIN — locale coverage for new software-key creation safeguards.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyVaultStatus } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { WorkspaceLocaleProvider } from '../../localization/workspaceLocale';
import { KeyVaultModal } from '../KeyVaultModal';
import { KEY_VAULT_MODAL_COPY } from '../keyVaultModalLocale';

class LocaleStorage {
  private readonly values = new Map<string, string>();
  constructor(locale: string) { this.values.set('astraea.workspace.locale.v1', locale); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const status: KeyVaultStatus = {
  isLocked: true,
  hasPin: false,
  platform: 'SoftwareEncrypted',
  privacyMode: false,
  coreConnected: true,
  softwareProviderConfigured: false,
};

const lossWarningByLocale: Readonly<Record<WorkspaceLocale, string>> = {
  'de-DE': 'Bewahre diese Passphrase sicher auf.',
  'en-US': 'Store this passphrase safely.',
  'ru-RU': 'Храните парольную фразу в надёжном месте.',
  'it-IT': 'Conserva la passphrase in un luogo sicuro.',
  'es-ES': 'Guarda esta frase de contraseña en un lugar seguro.',
  'ja-JP': 'パスフレーズは安全に保管してください。',
  'zh-CN': '请妥善保存此口令。',
};

const confirmationByLocale: Readonly<Record<WorkspaceLocale, string>> = {
  'de-DE': 'Passphrase bestätigen',
  'en-US': 'Confirm passphrase',
  'ru-RU': 'Подтвердите парольную фразу',
  'it-IT': 'Conferma la passphrase',
  'es-ES': 'Confirma la frase de contraseña',
  'ja-JP': 'パスフレーズを確認',
  'zh-CN': '确认口令',
};

afterEach(() => vi.unstubAllGlobals());

function escapeRenderedText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

describe('KeyVault software-key setup copy', () => {
  it('renders confirmation and passphrase-loss guidance in all supported locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.stubGlobal('window', { localStorage: new LocaleStorage(locale) });
      const markup = renderToStaticMarkup(
        <WorkspaceLocaleProvider>
          <KeyVaultModal
            isOpen
            onClose={() => undefined}
            status={status}
            onSetPin={() => undefined}
            onSetPortablePassword={() => undefined}
            onTogglePrivacyMode={() => undefined}
            onLockKeyVault={() => undefined}
          />
        </WorkspaceLocaleProvider>,
      );

      expect(markup).toContain('id="keyvault-software-passphrase"');
      expect(markup).toContain('id="keyvault-software-passphrase-loss-warning"');
      expect(markup).toContain('type="password"');
      expect(markup).toContain(lossWarningByLocale[locale]);
      expect(markup).toContain(`aria-label="${confirmationByLocale[locale]}"`);
      expect(markup.length).toBeGreaterThan(1000);
    }
  });

  it('localizes all KeyVault sections and controls across supported locales', () => {
    const keys = Object.keys(KEY_VAULT_MODAL_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = KEY_VAULT_MODAL_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(keys);
      for (const [key, value] of Object.entries(copy)) expect(value.trim(), `${locale}.${key}`).not.toBe('');
      vi.stubGlobal('window', { localStorage: new LocaleStorage(locale) });
      const markup = renderToStaticMarkup(
        <WorkspaceLocaleProvider>
          <KeyVaultModal
            isOpen
            onClose={() => undefined}
            status={status}
            onSetPin={() => undefined}
            onSetPortablePassword={() => undefined}
            onTogglePrivacyMode={() => undefined}
            onLockKeyVault={() => undefined}
          />
        </WorkspaceLocaleProvider>,
      );
      for (const label of [copy.title, copy.summary, copy.activeProvider, copy.softwareProviderTitle, copy.securityDomains, copy.topSecretAccessTitle, copy.setPin, copy.portablePassword, copy.privacyTitle, copy.done]) {
        expect(markup).toContain(escapeRenderedText(label));
      }
      expect(markup).toContain(escapeRenderedText(copy.passphraseCreatePlaceholder));
      expect(markup).toContain(escapeRenderedText(copy.passphraseLossWarning));
      expect(markup).toContain(escapeRenderedText(copy.issueOfflineFactor));
    }
  });
});
