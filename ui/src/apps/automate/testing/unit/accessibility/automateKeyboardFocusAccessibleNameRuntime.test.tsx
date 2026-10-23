// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der ausfuehrende Nachweis fuer M20-Z3627 (ASR-2056), Modul 20 Astraea Automate.
//
// DIE ANFORDERUNG (audit/coverage_3334.csv, Point_ID `M20-Z3627`, Impl_State IMPLEMENTED_UNVERIFIED,
// Gap leer, Native_State NOT_TESTED):
//
//   „- Barrierefreiheit, Tastaturbedienung, High-Contrast, Skalierung und Screenreader-Semantik
//     gehoeren zum Definition-of-Done."
//   Quelle: docs/module-specifications/20_Astraea_Automate_Full_Module_Spec.md:L96
//
// DIE ZUGEHOERIGE ASR-ZEILE war bis hierher `**KEIN BELEG**`:
//   ui/src/apps/automate/testing/ASR_BELEGZUORDNUNG.md:71 -> `ASR-2056`
//   „Keyboard-/Focus-/Accessible-Name-Smoke ausfuehren."
//   (docs/plans/2700PLAN.md:2166)
//
// WAS VORHER DA WAR: ein Markup-Vertrag. `automateInteraction.test.tsx` rendert mit
// `renderToStaticMarkup` und prueft Zeichenketten im HTML-String. Es sagt in seinem eigenen
// Kommentar (:10-12), was es nicht kann: „a `.tsx` test has no Node type declarations" — und vor
// allem: es fuehrt NICHTS aus. Kein `document`, kein Fokus, kein Tastendruck, kein Klick.
//
// WAS DIESE DATEI TUT: sie rendert die ECHTE `AutomateView` mit `createRoot` und `act` in ein
// lebendes DOM, setzt den Fokus, schickt echte `KeyboardEvent`s und echte Klicks und liest die
// Wirkung am DOM-Knoten (`document.activeElement`, `defaultPrevented`, `style.fontSize`,
// `aria-label`, `aria-pressed`, Live-Region-Text).
//
// GEMESSEN, BEVOR ES BENUTZT WURDE (happy-dom 21, en-US-Vorgabekontext aus
// `WorkspaceLocaleContext`; `AutomatePalette` und `AutomateView` liefern genau das):
//   * Leinwand            -> role="application"  aria-label="Automate visual flow designer"  tabindex="0"
//   * Werkzeugleiste      -> role="toolbar"      aria-label="Automate edit and run controls"
//   * Knoten              -> role="button"       tabindex="0"  aria-pressed  aria-label="<Typ>: <Titel>"
//   * Rueckmeldung        -> <span aria-live="polite"> im <header>  „0 graph issues · 0 accessibility issues"
//                            (das Modul hat ZWEI hoefliche Live-Regionen: diese Statuszeile und den
//                             Validierungshinweis der Leinwand `AutomateCanvas.tsx:236`)
//   * Wurzel              -> data-vgt-automate-root="true"  style="font-size: 1rem;"
//   * Skalierungstext     -> .automate-zoom-label  „100%"
//
// WAS NICHT BELEGT WERDEN KANN (Werkzeuggrenze, nicht Codegrenze): High-Contrast. happy-dom hat
// keine CSS-Engine und wertet `@media (forced-colors: active)` nicht aus — deshalb bleibt
// `ASR-2057` (Reduced-Motion-/High-Contrast-Smoke) unberuehrt und `KEIN BELEG`.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { DEFAULT_AUTOMATE_MODEL, type AutomateDocumentModel } from '../../../model/types';
import { AutomateView } from '../../../app/AutomateView';

/** Ein vollstaendiges Workspace-Dokument aus dem Produktionsvertrag — kein `as unknown as`. */
function dokument(automateData: AutomateDocumentModel): WorkspaceDocument {
  return {
    id: 'automate-m20-z3627-runtime',
    title: 'Automate Bedienbarkeit im Betrieb',
    kind: 'Automate',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    automateData,
  };
}

/** Die Vorgabe des Moduls, je Aufbau frisch — die Ansicht darf ihr Eingabedokument nicht teilen. */
function vorgabe(): AutomateDocumentModel {
  return structuredClone(DEFAULT_AUTOMATE_MODEL);
}

const OHNE_WIRKUNG = (): void => undefined;

interface GerendertesAutomate {
  readonly container: HTMLElement;
  /** Die Wurzel aus `AutomateView.tsx:74` — traegt den Skalierungsgrad. */
  readonly wurzel: HTMLElement;
  /** Die Leinwand aus `AutomateCanvas.tsx:102-113` — das erklaerte Tastaturziel. */
  readonly leinwand: HTMLElement;
  /** Der sichtbare Skalierungstext aus `AutomateView.tsx:87`. */
  readonly skalierung: HTMLElement;
  readonly knoten: (id: string) => HTMLElement;
  readonly knotenZahl: () => number;
  readonly knopf: (ariaLabel: string) => HTMLButtonElement;
  /** Ein Baustein der Palette, ueber seinen sichtbaren Text gefunden. */
  readonly paletteBlock: (text: string) => HTMLButtonElement;
  readonly abbaue: () => Promise<void>;
}

/** Ein Element, das existieren MUSS: sonst ist der Test aus dem falschen Grund rot. */
function pflicht<T extends Element>(element: T | null, was: string): T {
  if (element === null) throw new Error(`Das Automate-Modul hat ${was} nicht gerendert.`);
  return element;
}

/** Rendert die echte Anwendung in ein lebendes DOM und laesst React und die Effekte durchlaufen. */
async function rendereAutomate(model: AutomateDocumentModel = vorgabe()): Promise<GerendertesAutomate> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactWurzel = createRoot(container);

  await act(async () => {
    reactWurzel.render(<AutomateView document={dokument(model)} onUpdateDocument={OHNE_WIRKUNG} />);
  });
  // Zweiter Durchlauf: Zustand aus Effekten (Verlauf, Normalisierung) wird nachgereicht.
  await act(async () => {
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });

  const wurzel = pflicht(container.querySelector<HTMLElement>('[data-vgt-automate-root="true"]'), 'seine Wurzel');
  const leinwand = pflicht(container.querySelector<HTMLElement>('[data-vgt-automate-canvas="true"]'), 'seine Leinwand');
  const skalierung = pflicht(container.querySelector<HTMLElement>('.automate-zoom-label'), 'seinen Skalierungstext');

  return {
    container,
    wurzel,
    leinwand,
    skalierung,
    knoten: (id) => pflicht(container.querySelector<HTMLElement>(`[data-automate-node-id="${id}"]`), `den Knoten ${id}`),
    knotenZahl: () => container.querySelectorAll('[data-automate-node-id]').length,
    knopf: (ariaLabel) => {
      const gefunden = Array.from(container.querySelectorAll('button'))
        .find((kandidat) => kandidat.getAttribute('aria-label') === ariaLabel);
      if (!gefunden) throw new Error(`Das Automate-Modul hat keinen Knopf mit dem Namen „${ariaLabel}" gerendert.`);
      return gefunden;
    },
    paletteBlock: (text) => {
      const palette = pflicht(container.querySelector<HTMLElement>('aside[aria-label="Automation node palette"]'), 'seine Bausteinpalette');
      const gefunden = Array.from(palette.querySelectorAll('button'))
        .find((kandidat) => (kandidat.textContent ?? '').includes(text));
      if (!gefunden) throw new Error(`Die Palette hat keinen Baustein „${text}" angeboten.`);
      return gefunden;
    },
    abbaue: async () => {
      await act(async () => {
        reactWurzel.unmount();
      });
      container.remove();
    },
  };
}

/** Ein echter Klick auf ein Element, mit React-Durchlauf. */
async function klicke(ziel: HTMLElement): Promise<void> {
  await act(async () => {
    ziel.click();
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
}

/** Ein echter Tastendruck auf ein Element; `bubbles` traegt ihn bis zum Fensterzuhoerer. */
async function taste(ziel: HTMLElement, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ereignis = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    ziel.dispatchEvent(ereignis);
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  return ereignis;
}

describe('M20-Z3627 — Astraea Automate ist im Betrieb tastaturbedienbar und benannt', () => {
  it('bedient Rueckgaengig und Wiederholen ueber echte Tastendruecke auf dem fokussierten Ziel', async () => {
    const view = await rendereAutomate();
    try {
      // DER AUSGANGSZUSTAND MUSS BELEGT SEIN, sonst ist die Wirkung nicht messbar: ohne Aenderung
      // gibt es nichts rueckgaengig zu machen.
      expect(view.knotenZahl()).toBe(4);
      expect(view.knopf('Undo').disabled).toBe(true);

      await klicke(view.paletteBlock('Scheduled Trigger'));
      expect(view.knotenZahl()).toBe(5);
      expect(view.knopf('Undo').disabled).toBe(false);

      view.leinwand.focus();
      expect(document.activeElement).toBe(view.leinwand);

      // Strg+Z wird vom Ablauf BEANSPRUCHT (defaultPrevented) ...
      const rueckgaengig = await taste(view.leinwand, { key: 'z', ctrlKey: true });
      expect(rueckgaengig.defaultPrevented).toBe(true);
      // ... UND es wirkt: der hinzugefuegte Knoten ist wieder weg.
      expect(view.knotenZahl()).toBe(4);
      expect(view.knopf('Undo').disabled).toBe(true);

      const wiederholen = await taste(view.leinwand, { key: 'z', ctrlKey: true, shiftKey: true });
      expect(wiederholen.defaultPrevented).toBe(true);
      expect(view.knotenZahl()).toBe(5);

      // GEGENPROBE IM TEST SELBST: ohne Modifikatortaste passiert nichts. Ohne diese Zeile waere
      // „Strg+Z wirkt" auch dann wahr, wenn JEDER Tastendruck den Ablauf umschaltet.
      const ohneModifikator = await taste(view.leinwand, { key: 'z' });
      expect(ohneModifikator.defaultPrevented).toBe(false);
      expect(view.knotenZahl()).toBe(5);
    } finally {
      await view.abbaue();
    }
  });

  it('nimmt den Tastaturfokus an und traegt die Rollen der Bedienoberflaeche', async () => {
    const view = await rendereAutomate();
    try {
      // GEMESSEN: happy-dom setzt `document.activeElement` auch fuer ein Element ohne `tabindex`.
      // Die Zusicherung „die Leinwand IST ein Tastaturziel" traegt deshalb die Auszeichnung am
      // lebenden Knoten; der Fokuswechsel darunter belegt, dass er dort auch ankommt.
      expect(view.leinwand.getAttribute('role')).toBe('application');
      expect(view.leinwand.getAttribute('aria-label')).toBe('Automate visual flow designer');
      expect(view.leinwand.getAttribute('tabindex')).toBe('0');

      // Ein echter Fokuswechsel: der Fokus steht auf einem Bedienelement und wandert dann zur Flaeche.
      const vergroessern = view.knopf('Increase interface scale');
      vergroessern.focus();
      expect(document.activeElement).toBe(vergroessern);
      view.leinwand.focus();
      expect(document.activeElement).toBe(view.leinwand);

      // Die Werkzeugleiste ist als Leiste ausgezeichnet und benannt, nicht als lose Knopfreihe.
      const leiste = pflicht(view.container.querySelector<HTMLElement>('[role="toolbar"]'), 'seine Werkzeugleiste');
      expect(leiste.getAttribute('aria-label')).toBe('Automate edit and run controls');
    } finally {
      await view.abbaue();
    }
  });

  it('traegt die zugaenglichen Namen und den Auswahlzustand am lebenden Knoten', async () => {
    const view = await rendereAutomate();
    try {
      const trigger = view.knoten('node-trigger');
      expect(trigger.getAttribute('role')).toBe('button');
      expect(trigger.getAttribute('tabindex')).toBe('0');
      expect(trigger.getAttribute('aria-pressed')).toBe('false');
      // Der zugaengliche Name ist Typ UND Titel — gemessen, nicht erfunden.
      expect(trigger.getAttribute('aria-label')).toBe('Trigger: Workspace security event');

      expect(view.knoten('node-condition').getAttribute('aria-label')).toBe('Condition: Severity is critical');
      expect(view.knoten('node-action').getAttribute('aria-label')).toBe('Action: Create incident task');
      expect(view.knoten('node-finally').getAttribute('aria-label')).toBe('Finally: Flow end');

      // Der Auswahlzustand haengt nicht an der Farbe: ein echter Klick setzt ihn am Knoten selbst.
      await klicke(view.knoten('node-condition'));
      expect(view.knoten('node-condition').getAttribute('aria-pressed')).toBe('true');
      expect(view.knoten('node-trigger').getAttribute('aria-pressed')).toBe('false');
      // Genau EIN Knoten ist als ausgewaehlt ausgezeichnet.
      expect(view.container.querySelectorAll('[data-automate-node-id][aria-pressed="true"]').length).toBe(1);
    } finally {
      await view.abbaue();
    }
  });

  it('meldet einen Knoten ohne zugaenglichen Namen in der Live-Region', async () => {
    const sauber = await rendereAutomate();
    try {
      // GEMESSEN: das Modul hat ZWEI hoefliche Live-Regionen — diese Statuszeile im Kopf und den
      // Validierungshinweis der Leinwand (`AutomateCanvas.tsx:236`). `[aria-live="polite"]` allein
      // traefe die erste im Baum; der Selektor nennt deshalb sein Element.
      const region = pflicht(sauber.container.querySelector<HTMLElement>('header [aria-live="polite"]'), 'seine Live-Region im Kopf');
      expect(region.textContent).toContain('0 accessibility issues');
    } finally {
      await sauber.abbaue();
    }

    // Ein Knoten, dessen Titel nur Leerraum ist, hat keinen zugaenglichen Namen mehr.
    const ohneNamen = vorgabe();
    ohneNamen.nodes = ohneNamen.nodes.map((knoten) => (knoten.id === 'node-action' ? { ...knoten, title: '   ' } : knoten));
    const stumm = await rendereAutomate(ohneNamen);
    try {
      const region = pflicht(stumm.container.querySelector<HTMLElement>('header [aria-live="polite"]'), 'seine Live-Region im Kopf');
      expect(region.textContent).toContain('1 accessibility issue');
      // Der Grund steht am Knoten selbst: sein Name traegt nur noch den Typ.
      expect(stumm.knoten('node-action').getAttribute('aria-label')?.trim()).toBe('Action:');
    } finally {
      await stumm.abbaue();
    }
  });

  it('skaliert die Oberflaeche ueber die echten Bedienelemente', async () => {
    const view = await rendereAutomate();
    try {
      expect(view.wurzel.style.fontSize).toBe('1rem');
      expect(view.skalierung.textContent).toBe('100%');

      await klicke(view.knopf('Increase interface scale'));
      await klicke(view.knopf('Increase interface scale'));
      expect(view.wurzel.style.fontSize).toBe('1.2rem');
      expect(view.skalierung.textContent).toBe('120%');

      await klicke(view.knopf('Decrease interface scale'));
      expect(view.wurzel.style.fontSize).toBe('1.1rem');
      expect(view.skalierung.textContent).toBe('110%');
    } finally {
      await view.abbaue();
    }
  });
});
