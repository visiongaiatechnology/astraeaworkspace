// @vitest-environment happy-dom
// STATUS: PLATIN — der Bausteinpalette von Astraea Automate fehlt ein EINDEUTIGER Schluessel.
//
// DER BEFUND, GEMESSEN (nicht vermutet) — er kam aus `automateSaveReopenRoundtrip.test.tsx`, als dort
// zum ersten Mal eine zweite Vorlage desselben Typs in ein lebendes DOM gerendert wurde:
//
//     Encountered two children with the same key, `trigger`. Keys should be unique so that components
//     maintain their identity across updates. Non-unique keys may cause children to be duplicated
//     and/or omitted — the behavior is unsupported and could change in a future version.
//
// DIE URSACHE, WOERTLICH:
//   * `toolbar/AutomatePalette.tsx:23` — `{ type: 'trigger', title: 'Scheduled Trigger', … }`
//   * `toolbar/AutomatePalette.tsx:24` — `{ type: 'trigger', title: 'Workspace Event',   … }`
//   * `toolbar/AutomatePalette.tsx:93` — `<button key={template.type} …>`
// Zwei der elf Vorlagen tragen also denselben `type`, und der Render schluesselt nach genau diesem
// `type`. Der Konflikt besteht damit ab dem ERSTEN Rendern, nicht erst nach einer Aktion.
//
// WARUM DAS BISHER NIEMAND SAH: der naechstliegende Test (`testing/automateInteraction.test.tsx`)
// rendert mit `renderToStaticMarkup`. Ein statischer Markup-Durchlauf gleicht KEINE Kinderliste ab, es
// gibt dort keine Schluesselaufloesung — der Konflikt kann gar nicht auftreten. Nur ein Render ueber
// `createRoot` sieht ihn.
//
// WAS HIER GEPRUEFT WIRD:
//   1. Nicht-Trivialitaet aus den DATEN: es muss mindestens einen `type` geben, der mehrfach vorkommt.
//      Ohne diese Zeile koennte der Test gruen sein, weil es den Konfliktfall gar nicht mehr gibt.
//   2. Die Palette rendert jeden Baustein GENAU EINMAL. Reacts eigene Formulierung nennt beide
//      moeglichen Folgen — „duplicated and/or omitted" —, deshalb wird die Anzahl geprueft und nicht
//      nur die Warnung.
//   3. React meldet keinen doppelten Schluessel (weder ueber `console.error` noch `console.warn`).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTOMATE_BLOCK_TEMPLATES, AutomatePalette } from '../../../toolbar/AutomatePalette';

/** Die Vorgabe des Aufrufers: die Palette darf den Motor nicht brauchen, um zu rendern. */
const OHNE_WIRKUNG = (): void => undefined;

interface Gerendert {
  readonly container: HTMLElement;
  readonly meldungen: readonly string[];
  readonly bausteine: () => number;
  readonly abbaue: () => Promise<void>;
}

async function renderePalette(): Promise<Gerendert> {
  const meldungen: string[] = [];
  const fehler = vi.spyOn(console, 'error').mockImplementation((...teile: unknown[]) => {
    meldungen.push(teile.map((teil) => String(teil)).join(' '));
  });
  const warnung = vi.spyOn(console, 'warn').mockImplementation((...teile: unknown[]) => {
    meldungen.push(teile.map((teil) => String(teil)).join(' '));
  });

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const reactWurzel = createRoot(container);
  try {
    await act(async () => {
      reactWurzel.render(<AutomatePalette onUpdateModel={OHNE_WIRKUNG} />);
    });
    await act(async () => {
      await new Promise((erfuellt) => setTimeout(erfuellt, 0));
    });
  } finally {
    fehler.mockRestore();
    warnung.mockRestore();
  }

  return {
    container,
    meldungen,
    bausteine: () => container.querySelectorAll('.automate-palette-item').length,
    abbaue: async () => {
      await act(async () => {
        reactWurzel.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Astraea Automate — die Bausteinpalette braucht eindeutige Schluessel', () => {
  it('der Konfliktfall existiert wirklich: mindestens ein Typ kommt mehrfach vor', () => {
    /*
     * Diese Zusicherung ist die Nicht-Trivialitaet DIESES Tests. Sie wird aus der ausgelieferten
     * Vorlagenliste berechnet und nicht hier abgeschrieben — wer die Palette aendert, sieht sofort, ob
     * der geprüfte Fall noch existiert.
     */
    const jeTyp = new Map<string, number>();
    for (const vorlage of AUTOMATE_BLOCK_TEMPLATES) {
      jeTyp.set(vorlage.type, (jeTyp.get(vorlage.type) ?? 0) + 1);
    }
    const mehrfach = [...jeTyp.entries()].filter(([, anzahl]) => anzahl > 1);
    expect(
      mehrfach.length,
      `ohne mehrfach vorkommenden Typ prüft dieser Test nichts (Typen: ${[...jeTyp.keys()].join(', ')})`,
    ).toBeGreaterThan(0);
  });

  it('rendert jeden Baustein genau einmal — keiner wird verdoppelt oder weggelassen', async () => {
    const view = await renderePalette();
    try {
      // „duplicated and/or omitted": beide Folgen werden an der Anzahl gemessen.
      expect(view.bausteine()).toBe(AUTOMATE_BLOCK_TEMPLATES.length);
    } finally {
      await view.abbaue();
    }
  });

  it('React meldet keinen doppelten Schluessel', async () => {
    const view = await renderePalette();
    try {
      const doppelte = view.meldungen.filter((meldung) => /same key/i.test(meldung));
      expect(doppelte, `React meldet doppelte Schluessel:\n${doppelte.join('\n')}`).toEqual([]);
      // Gegenprobe: die Palette ist wirklich gerendert worden, sonst waere „keine Meldung" auch dann
      // wahr, wenn gar nichts gerendert wurde.
      expect(view.bausteine()).toBeGreaterThan(0);
    } finally {
      await view.abbaue();
    }
  });
});
