// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer GAP-0051 (die Verstosszeile des
// Prepress-Berichts in `prepress/PublishAdvancedModal.tsx:313-345`).
//
// DIE STELLE: im Reiter „Navigable Preflight Audit" rendert jeder Verstoss eine Zeile mit
// `cursor-pointer` und `onClick={() => handleNavigateToFrame(v.frameId, v.pageIndex)}`. Seit
// Runde 280 traegt sie zusaetzlich `role="button"`, `tabIndex={0}` und ein `onKeyDown`, das bei
// Enter UND bei der Leertaste `preventDefault` ruft und dieselbe Aktion ausfuehrt.
//
// Ein Attribut im Quelltext ist eine STRUKTUR, kein Verhalten. Diese Datei loest deshalb einen
// ECHTEN Tastendruck auf der Zeile aus und liest die Wirkung.
//
// WAS DIESER TEST WIRKLICH MISST:
//   * die Wirkung eines echten `keydown`: `handleNavigateToFrame` uebergibt `activePageIndex` und
//     `selectedFrameId` des Verstosses an `onUpdateModel`. Gelesen wird das an zwei unabhaengigen
//     Stellen im DOM — an einer Pruefsonde, die den Modellzustand rendert, und an der Meldung
//     (`showToast`).
//   * das `preventDefault` bei Enter und bei der Leertaste (ohne das die Leertaste scrollt).
//   * die Struktur: `role="button"` und `tabIndex === 0` an der Zeile — aber erst NACH dem
//     Verhaltensnachweis und nur als Bedingung, nicht als Beweis.
//   * die Gegenprobe: eine fremde Taste und ein anderes Bedienelement im selben Dialog bewegen nichts.
//
// WAS DIESER TEST NICHT MISST:
//   * die Tab-Navigation des Browsers (happy-dom hat keine); `tabIndex === 0` ist die Bedingung
//     dafuer, nicht der Beweis.
//   * FOKUS. `happy-dom` fokussiert JEDES Element (Regel 41), ein `focus()`-Nachweis waere wertlos.
//     Deshalb gibt es hier keinen einzigen `activeElement`-Vergleich.
//
// WARUM `analyzePublishPrepress` ERSETZT IST — GEMESSEN, nicht angenommen:
//   Der Bericht erzeugt einen Verstoss nur, wenn `hexToCmyk(fillColor).totalInk` STRENG GROESSER
//   ist als `profile.maxTicPercent` (`prepress/publishPrepressEngine.ts:71`). Die kleinste
//   Profilgrenze der vier Profile ist 300 (`publishPrepressEngine.ts:12-17`: 330/300/300/320).
//   Eine erschoepfende Messung ueber ALLE 16 777 216 Hex-Farben mit genau der Formel aus
//   `rgbToCmyk` ergibt: Maximum totalInk = 300 (bei `#000001`), Anzahl Farben mit totalInk > 300
//   = 0. Der Zweig `violations.length > 0` ist mit dem echten Motor also UNERREICHBAR; ohne
//   Ersetzen der Datenquelle liesse sich die Zeile ueberhaupt nicht rendern.
//   Ersetzt wird deshalb NUR `analyzePublishPrepress` (die Datenquelle). Die Zeile selbst, ihr
//   `onClick`, ihr `onKeyDown`, `handleNavigateToFrame`, `onUpdateModel` und `showToast` sind echt.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { creativePersonalText } from '../../../creativePersonalLocale';
import { DEFAULT_PUBLISH_MODEL, type PublishDocumentModel } from '../../contracts/types';
import { PublishAdvancedModal } from '../../prepress/PublishAdvancedModal';
import type { TicViolation } from '../../prepress/publishPrepressEngine';
import { publishTicViolationText } from '../../publishAdvancedLocale';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Ohne `WorkspaceLocaleProvider` ist die Vorgabe `en-US`; der Katalog ist die eine Quelle der Namen. */
const EN: WorkspaceLocale = 'en-US';

const OHNE_WIRKUNG = (): void => undefined;

/**
 * Der Bericht, den der Dialog sieht. Zwei Verstoesse auf ZWEI VERSCHIEDENEN Seiten, damit die
 * Wirkung nicht mit dem Ausgangszustand (`activePageIndex: 0`, `selectedFrameId: null`)
 * verwechselt werden kann.
 */
const BERICHT = vi.hoisted(() => ({
  timestamp: 1,
  profile: {
    id: 'FOGRA51',
    name: 'PSO Coated v3 / FOGRA51',
    standard: 'ISO 12647-2:2013',
    maxTicPercent: 300,
    description: 'Modern European offset profile with OBA compensation.',
    colorSpace: 'CMYK' as const,
  },
  maxTicMeasured: 341,
  ticViolationsCount: 2,
  violations: [
    {
      id: 'tic-frame-umschlag-1',
      pageIndex: 1,
      frameId: 'frame-umschlag',
      xMm: 12.5,
      yMm: 99.25,
      measuredTic: 322,
      limitTic: 300,
      description: 'Total Ink Coverage exceeds limit (322% > 300%).',
    },
    {
      id: 'tic-frame-innen-2',
      pageIndex: 2,
      frameId: 'frame-innen',
      xMm: 7,
      yMm: 4.5,
      measuredTic: 341,
      limitTic: 300,
      description: 'Total Ink Coverage exceeds limit (341% > 300%).',
    },
  ],
  separations: [],
  findings: [],
  pdfXCompliant: false,
  summary: 'Prepress detected 0 blocking issue(s) and 2 TIC violation(s).',
}));

vi.mock('../../prepress/publishPrepressEngine', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../prepress/publishPrepressEngine')>();
  return { ...echt, analyzePublishPrepress: () => BERICHT };
});

interface Gerendert {
  readonly container: HTMLElement;
  readonly meldungen: string[];
  readonly abbauen: () => Promise<void>;
}

/**
 * Der Pruefstand haelt das Modell wie die Anwendung: `onUpdateModel` ist der ECHTE React-Zustand,
 * und die Pruefsonde rendert ihn ins DOM. Damit ist die Wirkung des Tastendrucks ablesbar, ohne
 * dass der Test in den Dialog hineingreift.
 */
const Pruefstand: React.FC<{ readonly meldungen: string[] }> = ({ meldungen }) => {
  const [modell, setModell] = useState<PublishDocumentModel>(() => ({ ...DEFAULT_PUBLISH_MODEL }));
  return (
    <>
      <output
        data-pruefsonde="true"
        data-aktive-seite={String(modell.activePageIndex)}
        data-ausgewaehlter-rahmen={modell.selectedFrameId ?? '(keiner)'}
      />
      <PublishAdvancedModal
        isOpen
        onClose={OHNE_WIRKUNG}
        documentTitle="Prepress Tastaturwitness"
        model={modell}
        onUpdateModel={(aktualisiere) => setModell(aktualisiere)}
        showToast={(meldung) => {
          meldungen.push(meldung);
        }}
      />
    </>
  );
};

interface Sonde {
  readonly seite: number;
  readonly rahmen: string | null;
}

function leseSonde(container: HTMLElement): Sonde {
  const knoten = container.querySelector<HTMLElement>('[data-pruefsonde]');
  if (!knoten) throw new Error('die Pruefsonde wurde nicht gerendert');
  const rahmen = knoten.getAttribute('data-ausgewaehlter-rahmen');
  return {
    seite: Number(knoten.getAttribute('data-aktive-seite')),
    rahmen: rahmen === '(keiner)' ? null : rahmen,
  };
}

/** Schickt einen echten Tastendruck und laesst React und die Wirkung durchlaufen. */
async function taste(ziel: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ereignis = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    ziel.dispatchEvent(ereignis);
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  return ereignis;
}

/** Wechselt auf den Reiter, der die Verstossliste traegt (`PublishAdvancedModal.tsx:184-192`). */
async function oeffnePreflightReiter(container: HTMLElement): Promise<void> {
  const beschriftung = creativePersonalText('Navigable Preflight Audit', EN);
  const knoepfe = Array.from(container.querySelectorAll('button'));
  const reiter = knoepfe.find((knopf) => (knopf.textContent ?? '').includes(beschriftung));
  if (!reiter) {
    const gefunden = knoepfe.map((knopf) => (knopf.textContent ?? '').trim()).join(' | ');
    throw new Error(`den Reiter "${beschriftung}" gibt es nicht; gefundene Knoepfe: ${gefunden}`);
  }
  await act(async () => {
    reiter.click();
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
}

async function rendereVerstossliste(): Promise<Gerendert> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const meldungen: string[] = [];
  const wurzel = createRoot(container);
  await act(async () => {
    wurzel.render(<Pruefstand meldungen={meldungen} />);
  });
  await act(async () => {
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  await oeffnePreflightReiter(container);
  return {
    container,
    meldungen,
    abbauen: async () => {
      await act(async () => {
        wurzel.unmount();
      });
      container.remove();
    },
  };
}

/**
 * Die Verstosszeile ZU EINEM VERSTOSS — gesucht ueber ihren INHALT (Beschreibung, Koordinaten,
 * Sprungbeschriftung), NICHT ueber das Attribut, das geprueft wird. Das ist Absicht: der
 * Verhaltensnachweis darf nicht davon abhaengen, dass `role="button"` noch dasteht. Der kleinste
 * Knoten, der alle drei Inhalte traegt, ist die Zeile — jedes Kind traegt nur einen davon, jeder
 * Vorfahr traegt mehr.
 */
function verstosszeile(container: HTMLElement, verstoss: TicViolation): HTMLElement {
  const beschreibung = publishTicViolationText(verstoss.description, EN);
  const ort = `${creativePersonalText('Coordinates: X:', EN)} ${verstoss.xMm}mm, ${creativePersonalText('Y:', EN)} ${verstoss.yMm}mm`;
  const sprung = creativePersonalText('Jump to Frame →', EN);
  const kandidaten = Array.from(container.querySelectorAll<HTMLElement>('div, button')).filter((knoten) => {
    const text = knoten.textContent ?? '';
    return text.includes(beschreibung) && text.includes(ort) && text.includes(sprung);
  });
  const kleinster = kandidaten.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
  if (!kleinster) {
    throw new Error(
      `keine Verstosszeile fuer ${verstoss.frameId} gefunden; erwartet wurden "${beschreibung}" und "${ort}"`,
    );
  }
  return kleinster;
}

describe('die Verstosszeilen des Prepress-Berichts sind tastaturbedienbar (GAP-0051)', () => {
  it('gibt jedem Verstoss eine Zeile mit role="button" und einer Tab-Position', async () => {
    const publish = await rendereVerstossliste();
    try {
      for (const verstoss of BERICHT.violations) {
        const zeile = verstosszeile(publish.container, verstoss);
        expect(zeile.getAttribute('role'), 'die Verstosszeile braucht role="button"').toBe('button');
        // `tabIndex === 0` ist die BEDINGUNG dafuer, dass die sequenzielle Fokusnavigation die
        // Zeile erreicht. Ein negativer Wert waere per Skript fokussierbar, aber nicht per Tab.
        expect(zeile.tabIndex, 'die Verstosszeile muss in der Tab-Reihenfolge liegen').toBe(0);
      }
    } finally {
      await publish.abbauen();
    }
  });

  it('springt mit Enter zum Rahmen des Verstosses', async () => {
    const publish = await rendereVerstossliste();
    try {
      // Ausgangszustand BELEGEN: ohne ihn waere der Test gruen, wenn gar nichts passiert.
      expect(leseSonde(publish.container), 'der Ausgangszustand muss der leere sein').toEqual({
        seite: 0,
        rahmen: null,
      });

      const zweiter = BERICHT.violations[1];
      if (!zweiter) throw new Error('dieser Nachweis braucht mindestens zwei Verstoesse');
      const zweiteZeile = verstosszeile(publish.container, zweiter);

      const ereignis = await taste(zweiteZeile, { key: 'Enter' });

      expect(ereignis.defaultPrevented, 'Enter muss den Vorgabewert abfangen').toBe(true);
      expect(leseSonde(publish.container), 'Enter muss Seite und Rahmen des Verstosses setzen').toEqual({
        seite: zweiter.pageIndex,
        rahmen: zweiter.frameId,
      });
      // Zweite, unabhaengige Wirkung derselben Handlung: die Meldung nennt das Sprungziel.
      expect(
        publish.meldungen.some((meldung) => meldung.includes(zweiter.frameId)),
        `die Meldung muss das Ziel ${zweiter.frameId} nennen; gemeldet wurde: ${publish.meldungen.join(' / ')}`,
      ).toBe(true);
    } finally {
      await publish.abbauen();
    }
  });

  it('springt mit der Leertaste und faengt das Scrollen ab', async () => {
    const publish = await rendereVerstossliste();
    try {
      expect(leseSonde(publish.container)).toEqual({ seite: 0, rahmen: null });

      const erster = BERICHT.violations[0];
      if (!erster) throw new Error('dieser Nachweis braucht mindestens einen Verstoss');
      const ersteZeile = verstosszeile(publish.container, erster);

      const ereignis = await taste(ersteZeile, { key: ' ' });

      // Die Leertaste scrollt von sich aus. Wird sie nicht abgefangen, springt die Liste statt
      // zum Rahmen.
      expect(ereignis.defaultPrevented, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(leseSonde(publish.container), 'die Leertaste muss denselben Sprung ausloesen').toEqual({
        seite: erster.pageIndex,
        rahmen: erster.frameId,
      });
    } finally {
      await publish.abbauen();
    }
  });

  it('laesst eine fremde Taste und ein fremdes Bedienelement ohne Wirkung', async () => {
    const publish = await rendereVerstossliste();
    try {
      const erster = BERICHT.violations[0];
      if (!erster) throw new Error('dieser Nachweis braucht mindestens einen Verstoss');
      const ausgang = leseSonde(publish.container);

      const fremdeTaste = await taste(verstosszeile(publish.container, erster), { key: 'a' });
      expect(fremdeTaste.defaultPrevented, 'die Taste a ist keine Aktivierung').toBe(false);
      expect(leseSonde(publish.container), 'die Taste a darf nichts verschieben').toEqual(ausgang);

      // Dasselbe Enter, aber auf einem ANDEREN Bedienelement desselben Dialogs: die Wirkung darf
      // nicht von einem globalen Tastenhorcher kommen, sondern von der Zeile.
      const reiter = Array.from(publish.container.querySelectorAll('button')).find((knopf) =>
        (knopf.textContent ?? '').includes(creativePersonalText('Navigable Preflight Audit', EN)),
      );
      if (!reiter) throw new Error('der Preflight-Reiter fehlt');
      const amReiter = await taste(reiter, { key: 'Enter' });
      expect(amReiter.defaultPrevented, 'der Reiter faengt Enter nicht ab').toBe(false);
      expect(leseSonde(publish.container), 'Enter auf dem Reiter darf nicht springen').toEqual(ausgang);
    } finally {
      await publish.abbauen();
    }
  });
});
