// STATUS: PLATIN — first-run dialog labels and language options cover every supported locale.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { COPY, FirstRunSetupPersistenceRecoveryNotice, FirstRunSetupWizard } from '../FirstRunSetupWizard';

const dialogLabels: Readonly<Record<WorkspaceLocale, string>> = {
  'de-DE': 'Astraea Workspace Ersteinrichtung',
  'en-US': 'Astraea Workspace first-run setup',
  'ru-RU': 'Первоначальная настройка Astraea Workspace',
  'it-IT': 'Configurazione iniziale di Astraea Workspace',
  'es-ES': 'Configuración inicial de Astraea Workspace',
  'ja-JP': 'Astraea Workspace の初回設定',
  'zh-CN': 'Astraea Workspace 首次设置',
};

describe('first-run setup wizard locale coverage', () => {
  it('renders the localized dialog and all language choices for each supported locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const markup = renderToStaticMarkup(
        <FirstRunSetupWizard
          open
          locale={locale}
          localePreference={locale}
          onLocaleChange={() => undefined}
          onOpenKeyVault={() => undefined}
          keyVaultReady={false}
          onComplete={() => undefined}
          onSkip={() => undefined}
        />,
      );

      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain(`aria-label="${dialogLabels[locale]}"`);
      for (const supportedLocale of WORKSPACE_LOCALES) expect(markup).toContain(`value="${supportedLocale}"`);
      expect(markup).toContain('value="system"');
    }
  });

  it('can be closed without leaving a hidden dialog in the document', () => {
    const markup = renderToStaticMarkup(
      <FirstRunSetupWizard
        open={false}
        locale="en-US"
        onLocaleChange={() => undefined}
        onOpenKeyVault={() => undefined}
        keyVaultReady={false}
        onComplete={() => undefined}
        onSkip={() => undefined}
      />,
    );
    expect(markup).toBe('');
  });

  it('renders localized persistence recovery actions for every supported locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const labels = COPY[locale].labels;
      const markup = renderToStaticMarkup(
        <FirstRunSetupPersistenceRecoveryNotice
          message={labels.persistenceError}
          retryLabel={labels.retrySave}
          continueLabel={labels.continueWithoutSaving}
          onRetry={() => undefined}
          onContinue={() => undefined}
        />,
      );

      expect(markup).toContain('role="alert"');
      expect(markup).toContain(labels.persistenceError);
      expect(markup).toContain(`>${labels.retrySave}</button>`);
      expect(markup).toContain(`>${labels.continueWithoutSaving}</button>`);
    }
  });
});
