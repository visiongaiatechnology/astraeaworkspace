// STATUS: GOLD — localized step confirmation and visible-target gating coverage.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppGuidePersistenceWarning, AppGuidePopover, appGuidePersistenceWarning } from '../AppGuidePopover';
import { APP_GUIDE_APP_STEP_COUNT, APP_GUIDE_INTERFACE_COPY, appGuideSteps } from '../appGuideCatalog';
import { WORKSPACE_LOCALES } from '../../localization/workspaceLocaleTypes';
import { appGuideTargetKey } from '../AppGuidePanel';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

afterEach(() => vi.unstubAllGlobals());

describe('interactive app guide action confirmation', () => {
  it('renders localized action acknowledgements for every supported locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.stubGlobal('window', { localStorage: new MemoryStorage() });
      const markup = renderToStaticMarkup(
        <AppGuidePopover
          locale={locale}
          target={{ type: 'app', kind: 'Writer' }}
          currentAppKind="Writer"
          onOpenApp={() => undefined}
          onClose={() => undefined}
        />,
      );

      expect(markup).toContain(`>${APP_GUIDE_INTERFACE_COPY[locale].confirmStep}</span>`);
      expect(markup).toMatch(/<button type="button" class="vgt-app-guide-popover__primary" disabled="">[^<]+<\/button>/u);
    }
  });

  it('announces seven steps and shows the first explained point', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.stubGlobal('window', { localStorage: new MemoryStorage() });
      const markup = renderToStaticMarkup(
        <AppGuidePopover
          locale={locale}
          target={{ type: 'app', kind: 'Writer' }}
          currentAppKind="Writer"
          onOpenApp={() => undefined}
          onClose={() => undefined}
        />,
      );
      expect(markup).toContain(APP_GUIDE_INTERFACE_COPY[locale].progress(1, APP_GUIDE_APP_STEP_COUNT));
      expect(markup).toContain(appGuideSteps(locale, 'Writer')[0].title);
      expect(markup).toContain(`data-guide-availability`);
    }
  });

  it('treats steps 3–7 as explained features: no fake target, confirmation is enough to advance', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const storage = new MemoryStorage();
      // Persistierter Fortschritt: Schritt-Index 3 (vierter Schritt) — ein erklärender Schritt ohne Anker.
      storage.setItem(`astraea.shell.onboarding-guide.v1:${appGuideTargetKey({ type: 'app', kind: 'Writer' })}`, JSON.stringify({
        version: 2,
        stepIndex: 3,
        completed: false,
        skipped: false,
        optedOut: false,
        autoShown: true,
        confirmedSteps: [],
      }));
      vi.stubGlobal('window', { localStorage: storage });
      const markup = renderToStaticMarkup(
        <AppGuidePopover
          locale={locale}
          target={{ type: 'app', kind: 'Writer' }}
          currentAppKind="Writer"
          onOpenApp={() => undefined}
          onClose={() => undefined}
        />,
      );
      expect(markup, locale).toContain(APP_GUIDE_INTERFACE_COPY[locale].progress(4, APP_GUIDE_APP_STEP_COUNT));
      expect(markup, locale).toContain(appGuideSteps(locale, 'Writer')[3].title);
      expect(markup, locale).toContain(APP_GUIDE_INTERFACE_COPY[locale].explanationStep);
      expect(markup, locale).toContain('data-guide-explanation-step="true"');
      // Kein falscher „Ziel nicht sichtbar"-Hinweis für einen erklärenden Schritt.
      expect(markup, locale).not.toContain(APP_GUIDE_INTERFACE_COPY[locale].targetUnavailable);
    }
  });

  it('keeps the storage warning visible with an explicit close action in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const markup = renderToStaticMarkup(
        <AppGuidePersistenceWarning
          message={appGuidePersistenceWarning(locale)}
          closeLabel={APP_GUIDE_INTERFACE_COPY[locale].close}
          onClose={() => undefined}
        />,
      );

      expect(markup).toContain('role="status"');
      expect(markup).toContain(appGuidePersistenceWarning(locale));
      expect(markup).toContain(`>${APP_GUIDE_INTERFACE_COPY[locale].close}</button>`);
    }
  });
});
