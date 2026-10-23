// @vitest-environment happy-dom
// STATUS: PLATIN — ASR-2034 (Speichern/Wiederoeffnen von Astraea Automate), Modul 20.
//
// DIE ANFORDERUNG, WOERTLICH (docs/plans/2700PLAN.md:2144):
//   „- [ ] **ASR-2034** Automate: Persistenztest ablegen, sofern die App persistiert."
//
// UND DIE APP PERSISTIERT — gemessen, nicht angenommen:
//   * `app/AutomateView.tsx:28` schreibt bei jeder Aenderung:
//       `const persist=(next)=>onUpdateDocument({...document,modified_at:Date.now(),automateData:next})`
//   * `app/AutomateView.tsx:30-31` ruft `persist` aus `update`, `undo` und `redo`.
//   * Gelesen wird derselbe Ort: `:18` und `:29` ziehen
//       `normalizeAutomateModel(document.automateData, DEFAULT_AUTOMATE_MODEL)`.
//   * Das Modul hat eine Dokumentendung (`.vauto`, `shared/contracts`, Edition-Katalog).
//
// WARUM ES DIESE DATEI TROTZDEM NOCH NICHT GAB: die Belegzuordnung fuehrte `ASR-2034` bis hierher als
// `**KEIN BELEG**` (`testing/ASR_BELEGZUORDNUNG.md:49`). Der naechstliegende Test
// (`testing/unit/accessibility/automateKeyboardFocusAccessibleNameRuntime.test.tsx`) fahrt `undo`/`redo`
// ueber ECHTE Tastendruecke — also genau die Aufrufer von `persist` — uebergibt aber
// `onUpdateDocument={OHNE_WIRKUNG}` (Zeile 68/99). Er fuehrt den Schreibpfad AUS und VERWIRFT ihn. Damit
// belegt er Tastaturbedienung, aber keine Persistenz: kein Test hat je in das geschriebene Dokument
// gesehen und keiner hat je daraus wieder geoeffnet.
//
// WAS DIESER ZEUGE TUT — und was er ausdruecklich nicht tut:
//   1. Er rendert die ECHTE `AutomateView` in ein lebendes DOM (`createRoot` + `act`, happy-dom 21).
//   2. Er ZEICHNET das Dokument auf, das die Ansicht an `onUpdateDocument` uebergibt.
//   3. Er OEFFNET aus genau diesem aufgezeichneten Dokument eine FRISCHE Ansicht wieder.
//   4. Er fuehrt eine GEGENPROBE: dieselbe frische Ansicht aus dem UNVERAENDERTEN Dokument muss die
//      alte Knotenzahl zeigen. Ohne sie waere „5 Knoten nach dem Wiedereroeffnen" auch dann wahr, wenn
//      die Zahl gar nicht aus dem gespeicherten Dokument kaeme.
//   5. Er prueft, dass die Ansicht ihr EINGABEDOKUMENT nicht veraendert (geteilter Zustand).
//   NICHT geprueft: die native Ablage der Datei auf der Platte, der Wiederaufbau nach einem
//   Prozessneustart und die Verschluesselung des `.vautomate`-Speichers. Das bleibt `NOT_TESTED`;
//   dieser Zeuge belegt den Dokumentpfad, nicht das Dateisystem.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { DEFAULT_AUTOMATE_MODEL, type AutomateDocumentModel } from '../../model/types';
import { AutomateView } from '../../app/AutomateView';

/** Ein vollstaendiges Workspace-Dokument aus dem Produktionsvertrag — kein `as unknown as`. */
function dokument(automateData: AutomateDocumentModel, modifiedAt = 0): WorkspaceDocument {
  return {
    id: 'automate-asr-2034-persistenz',
    title: 'Automate Persistenz und Wiedereroeffnung',
    kind: 'Automate',
    created_at: 0,
    modified_at: modifiedAt,
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

/**
 * Der einzige Zugriff auf das geschriebene Modell. `WorkspaceDocument` deklariert `automateData?: any`
 * (`shared/contracts/workspaceCommon.ts:103`) — hier wird daraus ein BENANNTER Typ, nicht `any`.
 */
function gespeichertesModell(document: WorkspaceDocument): AutomateDocumentModel | undefined {
  return (document as WorkspaceDocument & { automateData?: AutomateDocumentModel }).automateData;
}

/** Zeichnet jedes Dokument auf, das die Ansicht speichern will. */
interface Aufzeichnung {
  /** Nur zum Lesen — geschrieben wird ausschliesslich ueber `merke`. */
  readonly aufrufe: readonly WorkspaceDocument[];
  readonly merke: (naechstes: WorkspaceDocument) => void;
  readonly letztes: () => WorkspaceDocument;
}

function aufzeichnung(): Aufzeichnung {
  const aufrufe: WorkspaceDocument[] = [];
  return {
    aufrufe,
    merke: (naechstes) => {
      aufrufe.push(naechstes);
    },
    letztes: () => {
      const letztes = aufrufe[aufrufe.length - 1];
      if (letztes === undefined) throw new Error('Die Ansicht hat nichts gespeichert.');
      return letztes;
    },
  };
}

interface GerendertesAutomate {
  readonly container: HTMLElement;
  readonly knotenZahl: () => number;
  readonly knotenIds: () => string[];
  /** Ein Baustein der Palette, ueber seinen sichtbaren Text gefunden. */
  readonly paletteBlock: (text: string) => HTMLButtonElement;
  readonly leinwand: HTMLElement;
  readonly abbaue: () => Promise<void>;
}

/** Ein Element, das existieren MUSS: sonst ist der Test aus dem falschen Grund rot. */
function pflicht<T extends Element>(element: T | null, was: string): T {
  if (element === null) throw new Error(`Das Automate-Modul hat ${was} nicht gerendert.`);
  return element;
}

async function rendereAutomate(
  document: WorkspaceDocument,
  speichere: (naechstes: WorkspaceDocument) => void,
): Promise<GerendertesAutomate> {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const reactWurzel = createRoot(container);

  await act(async () => {
    reactWurzel.render(<AutomateView document={document} onUpdateDocument={speichere} />);
  });
  // Zweiter Durchlauf: Zustand aus Effekten (Verlauf, Normalisierung) wird nachgereicht.
  await act(async () => {
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });

  return {
    container,
    knotenZahl: () => container.querySelectorAll('[data-automate-node-id]').length,
    knotenIds: () => Array.from(container.querySelectorAll('[data-automate-node-id]'))
      .map((knoten) => knoten.getAttribute('data-automate-node-id') ?? ''),
    paletteBlock: (text) => {
      const palette = pflicht(container.querySelector<HTMLElement>('aside[aria-label="Automation node palette"]'), 'seine Bausteinpalette');
      const gefunden = Array.from(palette.querySelectorAll('button'))
        .find((kandidat) => (kandidat.textContent ?? '').includes(text));
      if (!gefunden) throw new Error(`Die Palette hat keinen Baustein „${text}" angeboten.`);
      return gefunden;
    },
    leinwand: pflicht(container.querySelector<HTMLElement>('[data-vgt-automate-canvas="true"]'), 'seine Leinwand'),
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
async function taste(ziel: HTMLElement, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    ziel.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
}

describe('ASR-2034 — Astraea Automate speichert in das Dokument und oeffnet daraus wieder', () => {
  it('eine Aenderung wird in das DOKUMENT geschrieben, nicht nur in der Ansicht gehalten', async () => {
    const eingabe = dokument(vorgabe());
    const protokoll = aufzeichnung();
    const view = await rendereAutomate(eingabe, protokoll.merke);
    try {
      // DER AUSGANGSZUSTAND MUSS BELEGT SEIN, sonst ist die Wirkung nicht messbar.
      expect(view.knotenZahl()).toBe(4);
      expect(protokoll.aufrufe.length, 'ohne Aenderung darf nichts gespeichert werden').toBe(0);

      await klicke(view.paletteBlock('Scheduled Trigger'));

      // Es wurde gespeichert — und zwar mit dem geaenderten Modell.
      expect(view.knotenZahl()).toBe(5);
      expect(protokoll.aufrufe.length).toBeGreaterThan(0);
      const gespeichert = protokoll.letztes();
      const modell = gespeichertesModell(gespeichert);
      if (modell === undefined) throw new Error('Das gespeicherte Dokument traegt kein automateData.');
      expect(modell.nodes.length).toBe(5);
      // Die Identitaet des Ablaufs ueberlebt das Speichern.
      expect(modell.flowId).toBe('flow-security-response');
      expect(modell.schemaVersion).toBe(2);

      // Der Speicherzeitpunkt wird gesetzt — das Dokument traegt danach eine Aenderung.
      expect(gespeichert.modified_at).toBeGreaterThan(0);
      // Und der Rest des Dokuments wird uebernommen, nicht ersetzt.
      expect(gespeichert.id).toBe(eingabe.id);
      expect(gespeichert.title).toBe(eingabe.title);
      expect(gespeichert.kind).toBe('Automate');

      // DIE ANSICHT DARF IHR EINGABEDOKUMENT NICHT VERAENDERN: sonst waere „gespeichert" nicht von
      // „an Ort und Stelle veraendert" zu unterscheiden, und ein Aufrufer mit geteiltem Zustand
      // saehe die Aenderung auch ohne Speichern.
      expect(gespeichertesModell(eingabe)?.nodes.length, 'die Ansicht hat ihr Eingabedokument veraendert').toBe(4);
    } finally {
      await view.abbaue();
    }
  });

  it('eine FRISCHE Ansicht aus dem gespeicherten Dokument zeigt den gespeicherten Stand', async () => {
    const eingabe = dokument(vorgabe());
    const protokoll = aufzeichnung();
    const erste = await rendereAutomate(eingabe, protokoll.merke);
    try {
      await klicke(erste.paletteBlock('Scheduled Trigger'));
      expect(erste.knotenZahl()).toBe(5);
    } finally {
      await erste.abbaue();
    }

    // WIEDEREROEFFNEN: eine voellig neue Ansicht, gespeist aus dem gespeicherten Dokument.
    const gespeichert = protokoll.letztes();
    const zweite = await rendereAutomate(gespeichert, () => undefined);
    try {
      expect(zweite.knotenZahl()).toBe(5);
      // Und die vier urspruenglichen Knoten sind namentlich noch da.
      expect(zweite.knotenIds()).toEqual(expect.arrayContaining(['node-trigger', 'node-condition', 'node-action', 'node-finally']));
    } finally {
      await zweite.abbaue();
    }

    // GEGENPROBE IM TEST SELBST: dieselbe frische Ansicht aus dem UNVERAENDERTEN Dokument zeigt 4.
    // Ohne diese Zeile belegte „5 nach dem Wiedereroeffnen" nichts, weil die Zahl dann auch aus der
    // Vorgabe stammen koennte.
    const kontrolle = await rendereAutomate(dokument(vorgabe()), () => undefined);
    try {
      expect(kontrolle.knotenZahl()).toBe(4);
    } finally {
      await kontrolle.abbaue();
    }
  });

  it('auch Rueckgaengig wird gespeichert — der gespeicherte Stand folgt dem sichtbaren', async () => {
    const eingabe = dokument(vorgabe());
    const protokoll = aufzeichnung();
    const view = await rendereAutomate(eingabe, protokoll.merke);
    try {
      await klicke(view.paletteBlock('Scheduled Trigger'));
      expect(view.knotenZahl()).toBe(5);
      expect(gespeichertesModell(protokoll.letztes())?.nodes.length).toBe(5);

      view.leinwand.focus();
      await taste(view.leinwand, { key: 'z', ctrlKey: true });

      // Sichtbar 4 ...
      expect(view.knotenZahl()).toBe(4);
      // ... und gespeichert ebenfalls 4. Ein Speichern, das dem sichtbaren Zustand nicht folgt, waere
      // ein stiller Datenverlust beim naechsten Oeffnen.
      expect(gespeichertesModell(protokoll.letztes())?.nodes.length).toBe(4);
      expect(protokoll.aufrufe.length).toBeGreaterThanOrEqual(2);
    } finally {
      await view.abbaue();
    }
  });
});
