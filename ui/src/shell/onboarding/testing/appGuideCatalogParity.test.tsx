// STATUS: PLATIN — all Open Core app-guide catalogs match the runtime edition contract.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OPEN_CORE_APP_KINDS } from '../../../edition/contracts';
import { APP_GUIDE_APP_STEP_COUNT, APP_GUIDE_CATALOG, APP_GUIDE_INTERFACE_COPY, appGuideAvailabilityCopy, appGuideSteps } from '../appGuideCatalog';
import { AppGuideLibrary } from '../AppGuidePanel';
import { WORKSPACE_LOCALES } from '../../localization/workspaceLocaleTypes';

describe('Open Core app guide catalogs', () => {
  it('contains two non-empty actions for every Open Core app in all supported locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(APP_GUIDE_CATALOG[locale]).sort()).toEqual([...OPEN_CORE_APP_KINDS].sort());
      for (const kind of OPEN_CORE_APP_KINDS) {
        const guide = APP_GUIDE_CATALOG[locale][kind];
        expect(guide.firstAction.trim(), `${locale}.${kind}.firstAction`).not.toBe('');
        expect(guide.followUp.trim(), `${locale}.${kind}.followUp`).not.toBe('');
      }
    }
  });

  it('provides localized guide controls and a complete six-step Grid-to-Writer flow', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = APP_GUIDE_INTERFACE_COPY[locale];
      for (const label of [copy.libraryTitle, copy.libraryLabel, copy.connectedLabel, copy.openSetup, copy.guideLabel, copy.connectedTitle, copy.connectedDescription, copy.step, copy.previous, copy.next, copy.confirmStep, copy.finish, copy.skip, copy.replay, copy.close, copy.openApp, copy.interactiveIntro, copy.targetUnavailable, copy.optOut, copy.confirm, copy.cancel]) {
        expect(label.trim().length, `${locale} guide control`).toBeGreaterThan(0);
      }
      expect(copy.stepTitles).toHaveLength(2);
      expect(copy.connectedSteps).toHaveLength(6);
      expect(copy.connectedSteps.map((step) => step.app)).toEqual(['Grid', 'Writer', 'Writer', 'Grid', 'Writer', 'Present']);
      expect(copy.connectedSteps.every((step) => step.title.trim() && step.description.trim())).toBe(true);
    }
  });

  it('renders a selectable entry for all 14 Open Core app guides plus the connected-workspace guide', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const markup = renderToStaticMarkup(
        <AppGuideLibrary
          open
          locale={locale}
          initialKind="Writer"
          onOpenApp={() => undefined}
          onClose={() => undefined}
          onOpenSetup={() => undefined}
        />,
      );
      for (const kind of OPEN_CORE_APP_KINDS) expect(markup).toContain(`>${kind}</span>`);
      expect(markup).toContain(APP_GUIDE_INTERFACE_COPY[locale].connectedLabel);
      expect(markup).toContain(APP_GUIDE_INTERFACE_COPY[locale].openSetup);
      expect(markup.match(/aria-current="page"/gu)).toHaveLength(1);
    }
  });

  it('zeigt für jede App den ersten von sieben Schritten und ein Verfügbarkeits-Badge', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const markup = renderToStaticMarkup(
        <AppGuideLibrary
          open
          locale={locale}
          initialKind="Writer"
          onOpenApp={() => undefined}
          onClose={() => undefined}
          onOpenSetup={() => undefined}
        />,
      );
      // Fortschritt des Panels: Schritt 1 von 7 — nicht mehr „1 von 2".
      expect(markup, locale).toContain(APP_GUIDE_INTERFACE_COPY[locale].progress(1, APP_GUIDE_APP_STEP_COUNT));
      // Der erste erklärte Punkt der ausgewählten App steht im Panel.
      expect(markup, locale).toContain(appGuideSteps(locale, 'Writer')[0].title);
      // Jede App-Zeile in der Bibliothek trägt ein Verfügbarkeits-Badge (ALPHA/IM AUSBAU lokalisiert).
      expect(markup.match(/data-library-availability=/gu), locale).toHaveLength(OPEN_CORE_APP_KINDS.length);
      for (const kind of OPEN_CORE_APP_KINDS) {
        const availability = appGuideAvailabilityCopy(kind, locale);
        expect(markup, `${locale}.${kind}`).toContain(availability.label);
      }
    }
  });

  it('weist jedem Badge eine ehrliche Klasse aus der Release-Registry zu', () => {
    const alphaKinds = ['Writer', 'Grid', 'Present', 'Notes', 'Tasks', 'Vault'] as const;
    const inProgressKinds = ['Whiteboard', 'Draw', 'PdfStudio', 'Publish', 'Insight', 'Connect', 'Automate', 'AdminPolicy'] as const;
    for (const locale of WORKSPACE_LOCALES) {
      for (const kind of alphaKinds) expect(appGuideAvailabilityCopy(kind, locale).className, `${locale}.${kind}`).toBe('alpha');
      for (const kind of inProgressKinds) expect(appGuideAvailabilityCopy(kind, locale).className, `${locale}.${kind}`).toBe('in-progress');
    }
  });
});
