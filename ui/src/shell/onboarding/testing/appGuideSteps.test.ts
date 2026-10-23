// STATUS: PLATIN — sieben erklärte Punkte je App in allen sieben Sprachen (Beta 0.1).
//
// **Nutzeranforderung:** Jede App braucht mindestens sieben erklärte Punkte im App-Rundgang — nicht nur
// zwei erste Aktionen. Dieser Test hält die Zusage als Vertrag fest:
//   • exakt sieben Schritte je App und Sprache (7-Tupel im Katalog, hier nachgezählt),
//   • jeder Schritt hat nicht-leeren Titel und Beschreibung,
//   • Titel sind je App unterscheidbar (keine sieben Kopien),
//   • der Writer-Punkt „Live-Grid-Tabelle" erklärt die **Live-Verknüpfung** mit dem Grid-Dokument,
//   • keine Platzhalter (`{…}`) und keine leeren Schritte.
import { describe, expect, it } from 'vitest';
import { APP_GUIDE_APP_STEP_COUNT, APP_GUIDE_STEPS, appGuideSteps } from '../appGuideCatalog';
import { OPEN_CORE_APP_KINDS } from '../../../edition/contracts';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';

const LIVE_GRID_TERMS: Readonly<Record<WorkspaceLocale, readonly string[]>> = {
  'de-DE': ['live', 'Grid'],
  'en-US': ['live', 'Grid'],
  'es-ES': ['vivo', 'Grid'],
  'it-IT': ['live', 'Grid'],
  'ja-JP': ['ライブ', 'Grid'],
  'ru-RU': ['вживую', 'Grid'],
  'zh-CN': ['实时', 'Grid'],
};

describe('App-Rundgang: sieben erklärte Punkte je App', () => {
  it('liefert für jede App und jede Sprache exakt sieben Schritte', () => {
    expect(APP_GUIDE_APP_STEP_COUNT).toBe(7);
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(APP_GUIDE_STEPS[locale]).sort()).toEqual([...OPEN_CORE_APP_KINDS].sort());
      for (const kind of OPEN_CORE_APP_KINDS) {
        const steps = appGuideSteps(locale, kind);
        expect(steps, `${locale}.${kind}`).toHaveLength(APP_GUIDE_APP_STEP_COUNT);
      }
    }
  });

  it('hat in jedem Schritt nicht-leeren Titel und Beschreibung — in allen Sprachen', () => {
    // CJK-Sprachen sind dichter: 19 Zeichen sind dort ein vollständiger Satz. Der Mindestwert hängt
    // deshalb an der Schrift, nicht an einer pauschalen Zeichenzahl.
    const minimumDescriptionLength = (locale: WorkspaceLocale): number => (
      locale === 'ja-JP' || locale === 'zh-CN' ? 10 : 20
    );
    for (const locale of WORKSPACE_LOCALES) {
      for (const kind of OPEN_CORE_APP_KINDS) {
        appGuideSteps(locale, kind).forEach((step, index) => {
          expect(step.title.trim(), `${locale}.${kind}.${index}.title`).not.toBe('');
          expect(step.description.trim(), `${locale}.${kind}.${index}.description`).not.toBe('');
          expect(step.title, `${locale}.${kind}.${index}`).not.toMatch(/\{[^}]+\}/u);
          expect(step.description, `${locale}.${kind}.${index}`).not.toMatch(/\{[^}]+\}/u);
          // Ein Satz, keine Stichwort-Attrappe: die Beschreibung erklärt tatsächlich etwas.
          expect(step.description.length, `${locale}.${kind}.${index}`).toBeGreaterThanOrEqual(minimumDescriptionLength(locale));
        });
      }
    }
  });

  it('gibt jedem Schritt einen eigenen Titel je App (keine sieben Kopien)', () => {
    for (const locale of WORKSPACE_LOCALES) {
      for (const kind of OPEN_CORE_APP_KINDS) {
        const titles = appGuideSteps(locale, kind).map((step) => step.title.trim());
        expect(new Set(titles).size, `${locale}.${kind}`).toBe(APP_GUIDE_APP_STEP_COUNT);
      }
    }
  });

  it('erklärt beim Writer ausdrücklich die Live-Verknüpfung zur Grid-Tabelle', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const liveStep = appGuideSteps(locale, 'Writer')[3];
      const text = `${liveStep.title} ${liveStep.description}`;
      for (const term of LIVE_GRID_TERMS[locale]) {
        expect(text.toLowerCase(), `${locale} Writer-Live-Schritt`).toContain(term.toLowerCase());
      }
      // Der Schritt ist ein erklärender Punkt (Index 3) und damit bewusst ohne Coachmark-Anker.
      expect(liveStep.title.trim()).not.toBe(appGuideSteps(locale, 'Writer')[0].title.trim());
    }
  });

  it('deckt die realen Werkzeuge der Kern-Apps mit konkreten Themen ab', () => {
    const expectations: Array<[locale: WorkspaceLocale, kind: (typeof OPEN_CORE_APP_KINDS)[number], terms: string[]]> = [
      ['en-US', 'Writer', ['table', 'export', 'save']],
      ['en-US', 'Grid', ['formula', 'format', 'chart']],
      ['en-US', 'Present', ['slide', 'present', 'animation']],
      ['en-US', 'Notes', ['markdown', 'search', 'graph']],
      ['en-US', 'Tasks', ['task', 'view', 'export']],
      ['de-DE', 'Writer', ['Tabelle', 'Export', 'Speichern']],
      ['de-DE', 'Grid', ['Formel', 'Format', 'Diagramm']],
    ];
    for (const [locale, kind, terms] of expectations) {
      const text = appGuideSteps(locale, kind).map((step) => `${step.title} ${step.description}`).join(' ').toLowerCase();
      for (const term of terms) expect(text, `${locale}.${kind}`).toContain(term.toLowerCase());
    }
  });

  it('hält die alten zwei Aktionen als Rückwärtsvertrag im Katalog, ohne sie als die sieben Punkte auszugeben', async () => {
    const { APP_GUIDE_CATALOG } = await import('../appGuideCatalog');
    for (const locale of WORKSPACE_LOCALES) {
      for (const kind of OPEN_CORE_APP_KINDS) {
        expect(APP_GUIDE_CATALOG[locale][kind].firstAction.trim()).not.toBe('');
        expect(APP_GUIDE_CATALOG[locale][kind].followUp.trim()).not.toBe('');
        // Die sieben Punkte sind die neue, tiefere Ebene — nicht nur die zwei Aktionen.
        expect(appGuideSteps(locale, kind).length).toBeGreaterThan(2);
      }
    }
  });
});
