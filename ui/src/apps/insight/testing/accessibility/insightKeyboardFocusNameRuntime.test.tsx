// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer M18-Z3468 im Betrieb.
//
// Die Anforderungszeile lautet:
//   „- Barrierefreiheit, Tastaturbedienung, High-Contrast, Skalierung und Screenreader-Semantik
//     gehören zum Definition-of-Done."
//   (`docs/module-specifications/18_Astraea_Insight_Full_Module_Spec.md:L97 -> Z3468`, ASR-1916)
//
// Der bisherige Zustand war ein Quelltextvertrag. `testing/InsightView.locale.test.tsx` rendert nach
// `renderToStaticMarkup` und prueft `aria-label="..."` als ZEICHENKETTE in einem String. Dieselbe
// Technik kann per Bauart nicht sehen, ob ein Tastendruck etwas bewirkt, wohin der Fokus faellt oder
// ob die Ankuendigung dem Bedienschritt folgt.
//
// Diese Datei rendert die **echte** `InsightView` in ein DOM, schickt **echte** `keydown`-Ereignisse und
// liest die Wirkung am lebenden Knoten: `document.activeElement`, `defaultPrevented`, `aria-pressed`
// und den Text der `aria-live`-Region. Faellt die Tastaturverdrahtung in
// `views/InsightView.tsx:177-187`, faellt die `aria-label`-Verdrahtung oder der Zoom, wird diese Datei rot.

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { DEFAULT_INSIGHT_MODEL } from '../../domain/types';
import { formatInsightUsd, insightRegionSegments } from '../../interactions/insightCrossFilter';
import { insightCopy } from '../../locale/insightLocale';
import { InsightView } from '../../views/InsightView';

/** Ohne `WorkspaceLocaleProvider` ist die Vorgabe `en-US`; der Katalog ist damit die eine Quelle der Namen. */
const EN: WorkspaceLocale = 'en-US';
const copy = insightCopy(EN);

const DOKUMENT: WorkspaceDocument = {
  id: 'insight-keyboard-focus-witness',
  title: 'Insight Tastatur- und Fokuswitness',
  kind: 'Insight',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  insightData: structuredClone(DEFAULT_INSIGHT_MODEL),
};

const OHNE_WIRKUNG = (): void => undefined;

/** Die Ankuendigung, die der Katalog fuer den uebergebenen Filterstand vorschreibt. */
function erwarteteAnkuendigung(aktiveFilter: number): string {
  const seite = DEFAULT_INSIGHT_MODEL.report.pages.find((page) => page.id === DEFAULT_INSIGHT_MODEL.report.activePageId);
  if (!seite) throw new Error('das Vorgabemodell hat keine aktive Seite');
  return copy.screenReaderSummary(
    DEFAULT_INSIGHT_MODEL.datasetName,
    seite.name,
    seite.visuals.filter((visual) => visual.visible).length,
    aktiveFilter,
  );
}

interface Gerendert {
  readonly container: HTMLElement;
  readonly abbauen: () => Promise<void>;
}

/** Rendert die echte Anwendung in ein haengendes DOM und laesst React und die Effekte durchlaufen. */
async function rendereInsight(): Promise<Gerendert> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactWurzel = createRoot(container);
  await act(async () => {
    reactWurzel.render(<InsightView document={DOKUMENT} onUpdateDocument={OHNE_WIRKUNG} />);
  });
  await act(async () => {
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  if (!container.querySelector('[data-vgt-insight-root="true"]')) {
    throw new Error('die InsightView hat ihre Wurzel nicht gerendert.');
  }
  return {
    container,
    abbauen: async () => {
      await act(async () => {
        reactWurzel.unmount();
      });
      container.remove();
    },
  };
}

/** Schickt einen echten Tastendruck und laesst React durchlaufen. */
async function taste(ziel: EventTarget, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ereignis = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    ziel.dispatchEvent(ereignis);
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  return ereignis;
}

/** Klickt einen echten Knoten und laesst React durchlaufen. */
async function klicke(ziel: Element | null | undefined): Promise<void> {
  if (!(ziel instanceof HTMLElement)) throw new Error('der zu klickende Knoten fehlt');
  await act(async () => {
    ziel.click();
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
}

function knopfMitNamen(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((knopf) => knopf.getAttribute('aria-label') === name);
}

/** Der Aktualisieren-Knopf traegt den Zustand der Quelle als Attribut — der Modellstand, nicht die Meldung. */
function quellzustand(container: HTMLElement): string | null {
  return container.querySelector('[data-insight-refresh-state]')?.getAttribute('data-insight-source-state') ?? null;
}

/** Der Refresh-Knopf. */
function refreshKnopf(container: HTMLElement): HTMLButtonElement {
  const knopf = container.querySelector<HTMLButtonElement>('[data-insight-refresh-state]');
  if (!knopf) throw new Error('der Refresh-Knopf fehlt');
  return knopf;
}

/** Die Segmente des Querverweisfilters (ohne den „Filter loeschen"-Knopf). */
function segmente(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-insight-cross-filter="region"] button'))
    .filter((knopf) => knopf.getAttribute('aria-pressed') !== null);
}

/** Der „Filter loeschen"-Knopf des Querverweisfilters — er traegt kein `aria-pressed`. */
function loeschKnoepfe(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-insight-cross-filter="region"] button'))
    .filter((knopf) => knopf.textContent === copy.clearFilter);
}

/** Die stille Ankuendigung fuer den Screenreader. */
function ankuendigung(container: HTMLElement): string {
  return container.querySelector('p.sr-only[aria-live="polite"]')?.textContent ?? '';
}

describe('M18-Z3468 — Tastatur, Fokus, Namen und Skalierung wirken im Betrieb', () => {
  it('nimmt mit Strg+Z eine Aenderung wirklich zurueck und laesst den Fokus stehen', async () => {
    const insight = await rendereInsight();
    try {
      // AUSGANGSZUSTAND BELEGEN: ohne einen wirklichen Modellwechsel waere „Strg+Z hat zurueckgenommen"
      // aus dem falschen Grund wahr.
      expect(quellzustand(insight.container)).toBe('stale');
      await klicke(refreshKnopf(insight.container));
      expect(quellzustand(insight.container)).toBe('fresh');

      // Der Nutzer steht mit der Tastatur auf dem Rueckgaengig-Knopf.
      const undoKnopf = knopfMitNamen(insight.container, copy.undo);
      expect(undoKnopf).toBeDefined();
      undoKnopf?.focus();
      expect(document.activeElement).toBe(undoKnopf);

      // Das Ereignis steigt vom fokussierten Knopf zum Fenster auf — genau der Weg des echten Nutzers.
      const ereignis = await taste(document.activeElement ?? window, { key: 'z', ctrlKey: true });

      expect(ereignis.defaultPrevented).toBe(true);
      expect(quellzustand(insight.container)).toBe('stale');
      // Die Anwendung hat den Fokus nicht gestohlen.
      expect(document.activeElement).toBe(undoKnopf);
    } finally {
      await insight.abbauen();
    }
  });

  it('stellt mit Strg+Y und mit Strg+Umschalt+Z wirklich wieder her', async () => {
    const insight = await rendereInsight();
    try {
      await klicke(refreshKnopf(insight.container));
      expect(quellzustand(insight.container)).toBe('fresh');

      // Der Ausgangszustand wird ueber den KNOPF hergestellt, damit dieser Test nicht die
      // Strg+Z-Verdrahtung mitprueft, sondern nur die Wiederherstellung.
      await klicke(knopfMitNamen(insight.container, copy.undo));
      expect(quellzustand(insight.container)).toBe('stale');

      const mitY = await taste(window, { key: 'y', ctrlKey: true });
      expect(mitY.defaultPrevented).toBe(true);
      expect(quellzustand(insight.container)).toBe('fresh');

      await klicke(knopfMitNamen(insight.container, copy.undo));
      expect(quellzustand(insight.container)).toBe('stale');

      const mitUmschalt = await taste(window, { key: 'Z', ctrlKey: true, shiftKey: true });
      expect(mitUmschalt.defaultPrevented).toBe(true);
      expect(quellzustand(insight.container)).toBe('fresh');
    } finally {
      await insight.abbauen();
    }
  });

  it('entfernt den Querverweisfilter mit Escape und die Ankuendigung folgt dem Schritt', async () => {
    const insight = await rendereInsight();
    try {
      const ohneFilter = erwarteteAnkuendigung(0);
      expect(ankuendigung(insight.container)).toBe(ohneFilter);

      const erster = segmente(insight.container)[0];
      expect(erster).toBeDefined();
      expect(erster?.getAttribute('aria-pressed')).toBe('false');
      await klicke(erster);

      // Der Filter ist gesetzt: das Segment sagt es, der Loeschknopf erscheint, die Ankuendigung zaehlt.
      const gesetzt = segmente(insight.container);
      expect(gesetzt).toHaveLength(2);
      expect(gesetzt[0]?.getAttribute('aria-pressed')).toBe('true');
      expect(loeschKnoepfe(insight.container)).toHaveLength(1);
      expect(ankuendigung(insight.container)).toBe(erwarteteAnkuendigung(1));

      const escape = await taste(window, { key: 'Escape' });

      expect(escape.defaultPrevented).toBe(true);
      expect(segmente(insight.container)[0]?.getAttribute('aria-pressed')).toBe('false');
      expect(loeschKnoepfe(insight.container)).toHaveLength(0);
      expect(ankuendigung(insight.container)).toBe(ohneFilter);
    } finally {
      await insight.abbauen();
    }
  });

  it('loest eine IME-Komposition die Anwendung nicht aus (die Tastatur gehoert dem Eingabefeld)', async () => {
    const insight = await rendereInsight();
    try {
      await klicke(refreshKnopf(insight.container));
      expect(quellzustand(insight.container)).toBe('fresh');

      const waehrendKomposition = await taste(window, { key: 'z', ctrlKey: true, isComposing: true });

      // Vorbedingung: die Umgebung traegt das Kennzeichen wirklich — sonst pruefte der Test nichts.
      expect(waehrendKomposition.isComposing).toBe(true);
      expect(waehrendKomposition.defaultPrevented).toBe(false);
      expect(quellzustand(insight.container)).toBe('fresh');
    } finally {
      await insight.abbauen();
    }
  });

  it('traegt die zugaenglichen Namen und Rollen am lebenden Knoten', async () => {
    const insight = await rendereInsight();
    try {
      const wurzel = insight.container.querySelector('[data-vgt-insight-root="true"]');
      expect(wurzel?.getAttribute('role')).toBe('region');
      expect(wurzel?.getAttribute('aria-label')).toBe(copy.workspaceLabel);
      expect(wurzel?.getAttribute('data-insight-load-state')).toBe('document');

      const werkzeugleiste = insight.container.querySelector('[role="toolbar"]');
      expect(werkzeugleiste?.getAttribute('aria-label')).toBe(copy.toolbarLabel);
      expect(knopfMitNamen(insight.container, copy.undo)).toBeDefined();
      expect(knopfMitNamen(insight.container, copy.redo)).toBeDefined();

      const liste = insight.container.querySelector('[role="list"]');
      expect(liste?.getAttribute('aria-label')).toBe(copy.kpiList);
      const karten = Array.from(insight.container.querySelectorAll('[role="listitem"]'));
      expect(karten).toHaveLength(DEFAULT_INSIGHT_MODEL.kpis.length);
      karten.forEach((karte, index) => {
        const titel = DEFAULT_INSIGHT_MODEL.kpis[index]?.title ?? '';
        const name = karte.getAttribute('aria-label') ?? '';
        expect(titel.length).toBeGreaterThan(0);
        expect(name.startsWith(`${titel}: `)).toBe(true);
        expect(name.length).toBeGreaterThan(titel.length + 2);
      });

      // Der Segmentname kommt aus dem Katalog — die Werte aus derselben reinen Auslegung wie die Ansicht.
      const segmenteDerAnsicht = segmente(insight.container);
      expect(segmenteDerAnsicht).toHaveLength(insightRegionSegments(DEFAULT_INSIGHT_MODEL.records).length);
      insightRegionSegments(DEFAULT_INSIGHT_MODEL.records).forEach((segment, index) => {
        expect(segmenteDerAnsicht[index]?.getAttribute('aria-label')).toBe(
          `${copy.filterToRegion(segment.region, Math.round(segment.share * 100))} · ${formatInsightUsd(segment.revenue, EN)}`,
        );
      });
    } finally {
      await insight.abbauen();
    }
  });

  it('skaliert die Berichtsflaeche mit dem Zoom wirklich', async () => {
    const insight = await rendereInsight();
    try {
      const flaeche = insight.container.querySelector('[data-insight-cross-filter="region"]')?.parentElement;
      expect(flaeche).not.toBeNull();
      expect(flaeche?.style.transform).toBe('scale(1)');
      expect(flaeche?.style.width).toBe('100%');

      const hinein = knopfMitNamen(insight.container, copy.zoomIn);
      const hinaus = knopfMitNamen(insight.container, copy.zoomOut);
      expect(hinein).toBeDefined();
      expect(hinaus).toBeDefined();
      // Bei 100 % ist Verkleinern nicht moeglich — der Ausgangszustand ist belegt.
      expect(hinaus?.disabled).toBe(true);

      await klicke(hinein);
      await klicke(hinein);
      expect(flaeche?.style.transform).toBe('scale(1.5)');
      expect(flaeche?.style.width).toBe('66.66666666666667%');
      expect(hinaus?.disabled).toBe(false);

      await klicke(hinaus);
      await klicke(hinaus);
      expect(flaeche?.style.transform).toBe('scale(1)');
      expect(flaeche?.style.width).toBe('100%');
      expect(hinaus?.disabled).toBe(true);
    } finally {
      await insight.abbauen();
    }
  });
});
