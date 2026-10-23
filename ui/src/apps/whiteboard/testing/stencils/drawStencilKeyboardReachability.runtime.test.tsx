// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer GAP-0052 (die Stencil-Karte in Draw).
//
// DER BEFUND, gemessen mit `tools/parse-mouse-only.mjs` (TypeScript-Compiler-API, nicht Heuristik):
//
//   `whiteboard/tools/DrawAdvancedModal.tsx:360` rendert jede Karte des Stencil-Katalogs als
//       <div key={stencil.id} onClick={() => handleAddStencil(stencil)}
//            className="... cursor-pointer ...">
//   — mit `cursor-pointer`, aber OHNE `role`, OHNE `tabIndex` und OHNE `onKeyDown`. Die Karte
//   SIEHT bedienbar aus und ist es mit der Maus; mit der Tastatur ist sie es nicht. Seit dem Fix
//   traegt sie `role="button"`, `tabIndex={0}` und ein `onKeyDown`, das bei Enter UND bei der
//   Leertaste `preventDefault` ruft und dieselbe Handlung ausfuehrt.
//
// DASS DIESE ATTRIBUTE IM JSX STEHEN, IST KEIN NACHWEIS. Diese Datei loest deshalb ein ECHTES
// `keydown` auf der Karte aus und liest die Wirkung — an ZWEI unabhaengigen Stellen im DOM.
//
// WAS DIESER TEST WIRKLICH MISST:
//   * die Wirkung eines echten Tastenereignisses: `handleAddStencil` haengt ein neues Objekt an
//     `items` und meldet es per `showToast`. Gelesen wird beides: der Objektbestand an einer
//     Pruefsonde, die den echten React-Zustand rendert, und die Meldung in `meldungen`.
//   * dass die TASTATUR DASSELBE bewirkt wie die MAUS: derselbe Stencil, einmal geklickt und
//     einmal getastet, muss dieselbe Aenderung ergeben. Die zufaelligen Felder (`id`, `x`, `y`)
//     werden dabei ausgenommen und ausdruecklich benannt, statt die Gleichheit zu behaupten.
//   * dass die Karte IHREN EIGENEN Stencil anlegt: Enter auf einer ZWEITEN Karte haengt die zweite
//     an, nicht die erste (die Wirkung kommt von der Karte, nicht von einem Modulzustand).
//   * das `defaultPrevented` des Ereignisses (ohne das die Leertaste scrollt).
//   * die Struktur (`role="button"`, `tabIndex === 0`) — aber erst NACH dem Verhaltensnachweis und
//     nur als BEDINGUNG, nicht als Beweis.
//   * die Gegenprobe: eine fremde Taste und ein ANDERES Bedienelement desselben Dialogs bewegen
//     nichts (es gibt also keinen globalen Tastenhorcher, der die Wirkung erklaert).
//
// WAS DIESER TEST NICHT MISST (und warum):
//   * NICHT gemessen: dass der Browser die Karte per TAB anspringt. `happy-dom` hat keine
//     Tab-Navigation, und `happy-dom` fokussiert JEDES Element — `X.focus();
//     expect(document.activeElement).toBe(X)` ist dort wertlos (Regel 41). Deshalb gibt es in
//     dieser Datei KEINEN einzigen `activeElement`-Vergleich. `tabIndex === 0` ist die Bedingung
//     dafuer, nicht der Beweis; das bleibt ein NATIVE Release-Gate. Die Taste wird direkt auf der
//     Karte abgesetzt — genau dem Knoten, den ein Tab dem Nutzer geben wuerde.
//   * NICHT gemessen: die Ansage eines echten Screenreaders. Gemessen werden die Traeger, die er
//     liest: `role` und der sichtbare Text der Karte (Titel + Beschreibung).
//   * NICHT gemessen: das Verhalten im echten Browser. `happy-dom` fuehrt keine Standardaktion
//     aus; `preventDefault` wird deshalb am Ereignis selbst gelesen.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WhiteboardItem } from '../../types';
import { DrawAdvancedModal } from '../../tools/DrawAdvancedModal';
import { BUILTIN_STENCIL_LIBRARY, type DrawStencilItem } from '../../tools/drawRoundtripTestSuite';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Der Reiter, der den Stencil-Katalog traegt (`DrawAdvancedModal.tsx:217-225`). */
const TAB_BESCHRIFTUNG = 'Stencil Packs & Taxonomy';

/**
 * Der Ausgangsbestand: GENAU EIN Objekt. Damit ist ein Zuwachs nicht mit einem Ersatz zu
 * verwechseln, und `ids[0]` belegt, dass angehaengt statt ueberschrieben wird.
 */
const BESTAND: readonly WhiteboardItem[] = [
  { id: 'bestand-node', type: 'process', x: 10, y: 20, width: 120, height: 60, text: 'Bestand' },
];

const OHNE_WIRKUNG = (): void => undefined;

/** Ein Stencil aus DERSELBEN Bibliothek, die die Komponente rendert — nicht nachgebaut. */
function stencil(id: string): DrawStencilItem {
  const gefunden = BUILTIN_STENCIL_LIBRARY.find((eintrag) => eintrag.id === id);
  if (!gefunden) throw new Error(`die Vorgabebibliothek kennt keinen Stencil "${id}"`);
  return gefunden;
}

const UML_CLASS = stencil('uml-class');
const UML_ACTOR = stencil('uml-actor');
const NET_FIREWALL = stencil('net-firewall');
const BPMN_START = stencil('bpmn-start-event');

interface Gerendert {
  readonly container: HTMLElement;
  readonly meldungen: string[];
  readonly abbauen: () => Promise<void>;
}

/**
 * Der Pruefstand haelt den Objektbestand wie die Anwendung: `onUpdateItems` ist der ECHTE
 * React-Zustand, und die Pruefsonde rendert ihn ins DOM. Damit ist die Wirkung eines Tastendrucks
 * ablesbar, ohne dass der Test in den Dialog hineingreift.
 */
const Pruefstand: React.FC<{ readonly meldungen: string[] }> = ({ meldungen }) => {
  const [items, setItems] = useState<WhiteboardItem[]>(() => [...BESTAND]);
  const letzter = items[items.length - 1];
  return (
    <>
      <output
        data-pruefsonde="true"
        data-anzahl={String(items.length)}
        data-ids={items.map((eintrag) => eintrag.id).join('|')}
        data-letzter-typ={letzter?.type ?? '(keiner)'}
        data-letzter-text={letzter?.text ?? '(keiner)'}
        data-letzter-farbe={letzter?.color ?? '(keine)'}
        data-letzter-breite={String(letzter?.width ?? -1)}
        data-letzter-hoehe={String(letzter?.height ?? -1)}
      />
      <DrawAdvancedModal
        isOpen
        onClose={OHNE_WIRKUNG}
        documentTitle="Stencil Tastaturwitness"
        items={items}
        onUpdateItems={(neue) => setItems(neue)}
        showToast={(meldung) => {
          meldungen.push(meldung);
        }}
      />
    </>
  );
};

/** Der Zustand des Bestandes, wie er im DOM steht. */
interface Sonde {
  readonly anzahl: number;
  readonly ids: readonly string[];
  readonly letzterTyp: string;
  readonly letzterText: string;
  readonly letzterFarbe: string;
  readonly letzterBreite: number;
  readonly letzterHoehe: number;
}

function leseSonde(container: HTMLElement): Sonde {
  const knoten = container.querySelector<HTMLElement>('[data-pruefsonde]');
  if (!knoten) throw new Error('die Pruefsonde wurde nicht gerendert');
  return {
    anzahl: Number(knoten.getAttribute('data-anzahl')),
    ids: (knoten.getAttribute('data-ids') ?? '').split('|').filter((id) => id.length > 0),
    letzterTyp: knoten.getAttribute('data-letzter-typ') ?? '',
    letzterText: knoten.getAttribute('data-letzter-text') ?? '',
    letzterFarbe: knoten.getAttribute('data-letzter-farbe') ?? '',
    letzterBreite: Number(knoten.getAttribute('data-letzter-breite')),
    letzterHoehe: Number(knoten.getAttribute('data-letzter-hoehe')),
  };
}

/**
 * Die Aenderung, die EINE Handlung bewirkt hat — OHNE die zufaelligen Felder. `id` (Zufall) und
 * `x`/`y` (Zufall, `DrawAdvancedModal.tsx:145-146`) sind bewusst ausgenommen und werden
 * stattdessen einzeln geprueft: die Kennung muss mit `stencil-` beginnen.
 */
interface Aenderung {
  readonly anzahlPlus: number;
  readonly angehaengt: boolean;
  readonly neueKennungMitPraefix: boolean;
  readonly typ: string;
  readonly text: string;
  readonly farbe: string;
  readonly breite: number;
  readonly hoehe: number;
}

function aenderung(vorher: Sonde, nachher: Sonde): Aenderung {
  const neu = nachher.ids.filter((id) => !vorher.ids.includes(id));
  const behalten = vorher.ids.every((id, index) => nachher.ids[index] === id);
  return {
    anzahlPlus: nachher.anzahl - vorher.anzahl,
    angehaengt: behalten,
    neueKennungMitPraefix: neu.every((id) => id.startsWith('stencil-')),
    typ: nachher.letzterTyp,
    text: nachher.letzterText,
    farbe: nachher.letzterFarbe,
    breite: nachher.letzterBreite,
    hoehe: nachher.letzterHoehe,
  };
}

/**
 * Die Karte ZU EINEM STENCIL — gesucht ueber ihren INHALT (Titel, Beschreibung, Knopfbeschriftung),
 * NICHT ueber das Attribut, das geprueft wird. Das ist Absicht: der Verhaltensnachweis darf nicht
 * davon abhaengen, dass `role="button"` noch dasteht. Der kleinste Knoten, der alle drei Inhalte
 * traegt, ist die Karte — jeder Vorfahr traegt mehr, jedes Kind nur einen davon.
 */
function karte(container: HTMLElement, gesucht: DrawStencilItem): HTMLElement {
  const beschreibung = gesucht.defaultText.replace(/\n/g, ' ');
  const kandidaten = Array.from(container.querySelectorAll<HTMLElement>('div')).filter((knoten) => {
    const inhalt = knoten.textContent ?? '';
    return (
      inhalt.includes(gesucht.title) &&
      inhalt.includes(beschreibung) &&
      inhalt.includes('+ Add Shape')
    );
  });
  const kleinste = kandidaten.sort(
    (links, rechts) => (links.textContent ?? '').length - (rechts.textContent ?? '').length,
  )[0];
  if (!kleinste) {
    throw new Error(
      `keine Karte fuer "${gesucht.id}" gefunden; erwartet wurden "${gesucht.title}" und "${beschreibung}"`,
    );
  }
  return kleinste;
}

/** Alle Karten des Katalogs — ueber denselben Inhaltsgriff, nicht ueber `role`. */
function alleKarten(container: HTMLElement): readonly HTMLElement[] {
  return BUILTIN_STENCIL_LIBRARY.map((eintrag) => karte(container, eintrag));
}

/** Schickt einen echten Tastendruck und laesst React durchlaufen. Zurueck kommt das Ereignis. */
async function taste(ziel: Element, key: string): Promise<KeyboardEvent> {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => {
    ziel.dispatchEvent(ereignis);
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  return ereignis;
}

/** Ein echter Mausklick — der Vergleichsweg, gegen den die Tastatur gemessen wird. */
async function klick(ziel: Element): Promise<void> {
  await act(async () => {
    ziel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
}

/** Wechselt auf den Reiter, der den Stencil-Katalog traegt. */
async function oeffneStencilReiter(container: HTMLElement): Promise<void> {
  const knoepfe = Array.from(container.querySelectorAll('button'));
  const reiter = knoepfe.find((knopf) => (knopf.textContent ?? '').includes(TAB_BESCHRIFTUNG));
  if (!reiter) {
    const gefunden = knoepfe.map((knopf) => (knopf.textContent ?? '').trim()).join(' | ');
    throw new Error(`den Reiter "${TAB_BESCHRIFTUNG}" gibt es nicht; gefundene Knoepfe: ${gefunden}`);
  }
  await act(async () => {
    reiter.click();
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
}

async function rendereKatalog(): Promise<Gerendert> {
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
  await oeffneStencilReiter(container);
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

describe('die Stencil-Karten in Draw sind tastaturbedienbar (GAP-0052)', () => {
  it('gibt jeder Karte role="button" und eine Tab-Position', async () => {
    const draw = await rendereKatalog();
    try {
      const karten = alleKarten(draw.container);
      expect(
        karten.length,
        'der Katalog muss alle Vorgabe-Stencils zeigen — sonst prueft dieser Test nichts',
      ).toBe(BUILTIN_STENCIL_LIBRARY.length);

      for (const [index, karteGefunden] of karten.entries()) {
        const eintrag = BUILTIN_STENCIL_LIBRARY[index];
        expect(
          karteGefunden.getAttribute('role'),
          `die Karte "${eintrag?.id ?? index}" braucht role="button"`,
        ).toBe('button');
        // `tabIndex === 0` ist die BEDINGUNG dafuer, dass die sequenzielle Fokusnavigation die
        // Karte erreicht. Ein negativer Wert waere per Skript fokussierbar, aber nicht per Tab.
        expect(
          karteGefunden.tabIndex,
          `die Karte "${eintrag?.id ?? index}" muss in der Tab-Reihenfolge liegen`,
        ).toBe(0);
      }
    } finally {
      await draw.abbauen();
    }
  });

  it('legt mit Enter genau den Stencil der Karte an und meldet ihn', async () => {
    const draw = await rendereKatalog();
    try {
      // Ausgangszustand BELEGEN — ohne ihn waere der Test gruen, wenn gar nichts passiert.
      const ausgang = leseSonde(draw.container);
      expect(ausgang.anzahl, 'der Pruefstand startet mit genau einem Objekt').toBe(1);
      expect(ausgang.ids).toEqual(['bestand-node']);

      const ereignis = await taste(karte(draw.container, NET_FIREWALL), 'Enter');

      expect(ereignis.defaultPrevented, 'Enter muss den Vorgabewert abfangen').toBe(true);
      const nachher = leseSonde(draw.container);
      expect(nachher.anzahl, 'Enter muss GENAU EIN Objekt hinzufuegen').toBe(2);
      expect(aenderung(ausgang, nachher), 'Enter muss die Felder DIESES Stencils anlegen').toEqual({
        anzahlPlus: 1,
        angehaengt: true,
        neueKennungMitPraefix: true,
        typ: 'process',
        text: NET_FIREWALL.defaultText,
        farbe: 'purple',
        breite: NET_FIREWALL.defaultWidth,
        hoehe: NET_FIREWALL.defaultHeight,
      });
      // Zweite, unabhaengige Wirkung derselben Handlung: die Meldung nennt den Stencil.
      expect(
        draw.meldungen,
        `die Meldung muss den Stencil nennen; gemeldet wurde: ${draw.meldungen.join(' / ')}`,
      ).toContain(`Added ${NET_FIREWALL.title} to canvas`);
    } finally {
      await draw.abbauen();
    }
  });

  it('legt mit der Leertaste an und faengt das Scrollen ab', async () => {
    const draw = await rendereKatalog();
    try {
      const ausgang = leseSonde(draw.container);
      expect(ausgang.anzahl).toBe(1);

      // Ein ANDERER Stencil als im Enter-Test: die Wirkung darf nicht von einer festen Kennung
      // kommen, und die Farbzuordnung (uml -> cyan) unterscheidet sich messbar.
      const ereignis = await taste(karte(draw.container, UML_CLASS), ' ');

      // Die Leertaste scrollt von sich aus. Wird sie nicht abgefangen, springt die Seite statt
      // den Stencil anzulegen.
      expect(ereignis.defaultPrevented, 'die Leertaste muss abgefangen werden').toBe(true);
      const nachher = leseSonde(draw.container);
      expect(aenderung(ausgang, nachher)).toEqual({
        anzahlPlus: 1,
        angehaengt: true,
        neueKennungMitPraefix: true,
        typ: 'process',
        text: UML_CLASS.defaultText,
        farbe: 'cyan',
        breite: UML_CLASS.defaultWidth,
        hoehe: UML_CLASS.defaultHeight,
      });
    } finally {
      await draw.abbauen();
    }
  });

  it('erzeugt per Enter dieselbe Aenderung wie der Klick und trifft die zweite Karte', async () => {
    const perMaus = await rendereKatalog();
    const perTastatur = await rendereKatalog();
    try {
      const mausAusgang = leseSonde(perMaus.container);
      await klick(karte(perMaus.container, UML_ACTOR));
      const mausAenderung = aenderung(mausAusgang, leseSonde(perMaus.container));
      // Der Vergleichsweg muss SELBST gewirkt haben, sonst waere die Gleichheit unten nichtssagend.
      expect(mausAenderung.anzahlPlus, 'der Klick muss wirklich anlegen').toBe(1);

      const tastaturAusgang = leseSonde(perTastatur.container);
      await taste(karte(perTastatur.container, UML_ACTOR), 'Enter');
      const tastaturAenderung = aenderung(tastaturAusgang, leseSonde(perTastatur.container));

      expect(
        tastaturAenderung,
        'Enter muss auf demselben Stencil dieselbe Aenderung erzeugen wie der Klick',
      ).toEqual(mausAenderung);
      expect(tastaturAenderung.anzahlPlus, 'auch die Tastatur muss wirklich anlegen').toBe(1);

      // DER WECHSEL: eine Taste auf einer ZWEITEN Karte legt die zweite an, nicht die erste.
      const vorZweiter = leseSonde(perTastatur.container);
      await taste(karte(perTastatur.container, BPMN_START), ' ');
      const nachZweiter = leseSonde(perTastatur.container);
      expect(nachZweiter.anzahl, 'die zweite Karte muss ein drittes Objekt anlegen').toBe(3);
      expect(
        aenderung(vorZweiter, nachZweiter),
        'die Taste muss den Stencil DIESER Karte anlegen (bpmn-start-event -> terminal/yellow)',
      ).toEqual({
        anzahlPlus: 1,
        angehaengt: true,
        neueKennungMitPraefix: true,
        typ: 'terminal',
        text: BPMN_START.defaultText,
        farbe: 'yellow',
        breite: BPMN_START.defaultWidth,
        hoehe: BPMN_START.defaultHeight,
      });
    } finally {
      await perTastatur.abbauen();
      await perMaus.abbauen();
    }
  });

  it('laesst eine fremde Taste und ein fremdes Bedienelement ohne Wirkung', async () => {
    const draw = await rendereKatalog();
    try {
      const ausgang = leseSonde(draw.container);
      const ziel = karte(draw.container, NET_FIREWALL);

      const fremdeTaste = await taste(ziel, 'x');
      expect(fremdeTaste.defaultPrevented, 'die Taste x ist keine Aktivierung').toBe(false);
      expect(leseSonde(draw.container), 'die Taste x darf nichts anlegen').toEqual(ausgang);
      expect(draw.meldungen, 'die Taste x darf nichts melden').toEqual([]);

      // Dasselbe Enter, aber auf einem ANDEREN Bedienelement desselben Dialogs: die Wirkung darf
      // nicht von einem globalen Tastenhorcher kommen, sondern von der Karte.
      const knoepfe = Array.from(draw.container.querySelectorAll('button'));
      const reiter = knoepfe.find((knopf) => (knopf.textContent ?? '').includes(TAB_BESCHRIFTUNG));
      if (!reiter) throw new Error('der Stencil-Reiter fehlt');
      const amReiter = await taste(reiter, 'Enter');
      expect(amReiter.defaultPrevented, 'der Reiter faengt Enter nicht ab').toBe(false);
      expect(leseSonde(draw.container), 'Enter auf dem Reiter darf nichts anlegen').toEqual(ausgang);
      expect(draw.meldungen, 'Enter auf dem Reiter darf nichts melden').toEqual([]);
    } finally {
      await draw.abbauen();
    }
  });
});
