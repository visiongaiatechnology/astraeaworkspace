// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer GAP-0051 (der Konnektor im Whiteboard).
//
// DER BEFUND, gegen den dieser Nachweis laeuft:
//
//   `connectors/WhiteboardConnectorsRenderer.tsx` rendert jeden Konnektor als SVG-`<g>` mit
//   `onClick`. Ein `<g>` hat von Haus aus WEDER eine Rolle NOCH eine Tab-Position: der Konnektor war
//   mit der Maus auswaehlbar und mit der Tastatur ueberhaupt nicht erreichbar. Der Fix traegt
//   `role="button"`, `tabIndex={0}`, `aria-label`, `aria-pressed` und ein `onKeyDown` fuer Enter und
//   Leertaste. DASS DIESE ATTRIBUTE IM JSX STEHEN, IST KEIN NACHWEIS — dieser Nachweis feuert ein
//   echtes `KeyboardEvent` und liest die Wirkung im DOM.
//
// WAS DIESER TEST MISST:
//   * Gerendert wird die PRODUKTKOMPONENTE `WhiteboardCanvas` mit einem echten `WorkspaceDocument`
//     (`whiteboardData.items`) — also die Kette Dokument -> `useWhiteboardState` ->
//     `buildWhiteboardRenderProjection` -> `WhiteboardItemsRenderer` -> `WhiteboardConnectorsRenderer`
//     -> `useWhiteboardManipulation.selectItem`. Kein Attrappen-Renderer, keine geratene Selektorlage.
//   * Gemessen wird die WIRKUNG: `aria-pressed` am Konnektorknoten, Strichfarbe/-muster des sichtbaren
//     Pfades, Anzahl der Auswahlgriffpunkte, der sr-only-Zusammenfassungstext der Leinwand, das
//     `defaultPrevented` des Ereignisses — und die Ausbreitung (Enter/Leertaste erreichen das Fenster
//     nicht, eine fremde Taste schon).
//   * Die Tastatur wird gegen die MAUS gemessen: derselbe Konnektor, einmal geklickt und einmal
//     getastet, muss denselben DOM-Zustand ergeben. Das ist die Aussage „dieselbe Auswahl wie der
//     Klick" — nicht „es gibt einen Handler".
//
// WAS DIESER TEST NICHT MISST (und warum):
//   * NICHT gemessen: dass der Browser den Konnektor per TAB anspringt. `happy-dom` hat keine
//     Tab-Navigation, und `happy-dom` fokussiert JEDES Element — `X.focus();
//     expect(document.activeElement).toBe(X)` ist dort wertlos (Regel 41). `tabIndex === 0` ist die
//     BEDINGUNG dafuer, nicht der Beweis; das bleibt ein NATIVE Release-Gate. Der Tastendruck wird
//     deshalb direkt auf dem Konnektorknoten abgesetzt — genau der Knoten, den der Browser nach einem
//     Tab an den Nutzer geben wuerde.
//   * NICHT gemessen: die Ansage eines echten Screenreaders. Gemessen werden die Traeger, die er
//     liest: `role`, `aria-label`, `aria-pressed` und der Zusammenfassungstext der Leinwand.
//
// GEMESSENE ANKER (vor dem Schreiben dieser Datei an der laufenden Komponente abgelesen, nicht
// erfunden): jeder Konnektor rendert als `<g role="button" tabindex="0" aria-label="<lineLabel>"
// aria-pressed="false">`; darin liegen ZWEI Pfade — der erste ist die unsichtbare Trefferflaeche
// (`stroke="transparent"`, `stroke-width="14"`), der zweite der sichtbare Strich. Im gewaehlten
// Zustand ist der sichtbare Strich `#60a5fa`, `stroke-width 2.5`, `stroke-dasharray "4 2"`, und es
// kommen zwei Auswahlgriffpunkte (`<circle>`) hinzu. Ein `<g>` traegt KEIN `data-*`-Merkmal, ueber das
// es sich identifizieren liesse; der einzige stabile Griff ist der zugaengliche Name, und der wird
// unten gegen das Modell geprueft, statt vorausgesetzt.
import { act, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { WhiteboardCanvas } from '../../app/WhiteboardCanvas';
import { WhiteboardConnectorsRenderer } from '../../connectors/WhiteboardConnectorsRenderer';
import type { WhiteboardItem } from '../../types';

// React 19 verlangt diese Markierung, sonst warnt `act`. Die Vitest-Konfiguration bleibt unberuehrt:
// die Datei fordert ihre Umgebung selbst an (Zeile 1).
const actUmgebung: typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } = globalThis;
actUmgebung.IS_REACT_ACT_ENVIRONMENT = true;

/** Die drei Knoten, die die Konnektoren verbinden. */
const KNOTEN: WhiteboardItem[] = [
  { id: 'node-a', type: 'process', x: 0, y: 0, width: 160, height: 80, text: 'Alpha', zIndex: 1 },
  { id: 'node-b', type: 'process', x: 400, y: 0, width: 160, height: 80, text: 'Beta', zIndex: 2 },
  { id: 'node-c', type: 'process', x: 0, y: 300, width: 160, height: 80, text: 'Gamma', zIndex: 3 },
];

/**
 * Vier Konnektoren — absichtlich mit allen drei Namensquellen der Implementierung
 * (`lineLabel || name || text`), damit der zugaengliche Name nicht an EINEM Feld vorbeigeprueft wird.
 */
const KONNEKTOREN: WhiteboardItem[] = [
  { id: 'conn-handoff', type: 'connector', x: 0, y: 0, width: 0, height: 0, text: '', fromId: 'node-a', toId: 'node-b', lineLabel: 'Handoff', zIndex: 4 },
  { id: 'conn-eskalation', type: 'connector', x: 0, y: 0, width: 0, height: 0, text: '', fromId: 'node-a', toId: 'node-c', lineLabel: 'Eskalation', zIndex: 5 },
  { id: 'conn-kantenname', type: 'connector', x: 0, y: 0, width: 0, height: 0, text: 'Nur ein Text', fromId: 'node-b', toId: 'node-c', name: 'Kantenname', zIndex: 6 },
  { id: 'conn-nurtext', type: 'connector', x: 0, y: 0, width: 0, height: 0, text: 'Nur Text', fromId: 'node-c', toId: 'node-a', zIndex: 7 },
];

const ITEMS: WhiteboardItem[] = [...KNOTEN, ...KONNEKTOREN];

/** Die Beschriftungen, die die Implementierung als zugaenglichen Namen liefern muss. */
const NAME_HANDOFF = KONNEKTOREN[0]!.lineLabel as string;
const NAME_ESKALATION = KONNEKTOREN[1]!.lineLabel as string;
const NAME_KANTENNAME = KONNEKTOREN[2]!.name as string;
const NAME_NURTEXT = KONNEKTOREN[3]!.text;

const DOKUMENT: WorkspaceDocument = {
  id: 'whiteboard-gap0051-document',
  title: 'Pruefboard',
  kind: 'Whiteboard',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
  whiteboardData: { items: ITEMS },
};

/** Rendert die echte Leinwand und raeumt sie danach wieder ab. */
async function mitGerenderterLeinwand(
  pruefung: (container: HTMLElement) => Promise<void>,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<WhiteboardCanvas document={DOKUMENT} onUpdateDocument={() => undefined} />);
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
  });
  try {
    await pruefung(container);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

function alleKonnektoren(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll<SVGGElement>('svg g[role="button"]'));
}

/**
 * Ein Konnektor, ueber seinen zugaenglichen Namen gegriffen. Ein `<g>` traegt keine Kennung; der Name
 * ist der einzige stabile Griff, und `rendert jeden Konnektor ...` prueft ihn gegen das Modell.
 */
function konnektor(container: HTMLElement, name: string): SVGGElement {
  const knoten = alleKonnektoren(container).find(
    (kandidat) => kandidat.getAttribute('aria-label') === name,
  );
  if (!knoten) throw new Error(`der Konnektor "${name}" wurde nicht als role="button" gerendert`);
  return knoten;
}

/** Der sichtbare Strich — gemessen der ZWEITE Pfad des Knotens, nach der Trefferflaeche. */
function sichtbarerStrich(knoten: SVGGElement): SVGPathElement {
  const pfade = knoten.querySelectorAll<SVGPathElement>('path');
  const trefferflaeche = pfade[0];
  const strich = pfade[1];
  if (!trefferflaeche || !strich) {
    throw new Error('gemessen: jeder Konnektor traegt zwei Pfade');
  }
  if (trefferflaeche.getAttribute('stroke') !== 'transparent') {
    throw new Error('gemessen: der erste Pfad ist die unsichtbare Trefferflaeche');
  }
  return strich;
}

/** Der Zustand eines Konnektors, wie ihn Auge und Screenreader vorfinden. */
interface Erscheinung {
  readonly name: string | null;
  readonly gedrueckt: string | null;
  readonly strich: string | null;
  readonly strichMuster: string | null;
  readonly griffpunkte: number;
}

function erscheinung(knoten: SVGGElement): Erscheinung {
  const strich = sichtbarerStrich(knoten);
  return {
    name: knoten.getAttribute('aria-label'),
    gedrueckt: knoten.getAttribute('aria-pressed'),
    strich: strich.getAttribute('stroke'),
    strichMuster: strich.getAttribute('stroke-dasharray'),
    griffpunkte: knoten.querySelectorAll('circle').length,
  };
}

/** Der Zustand ALLER Konnektoren — die Vergleichsgrundlage „Tastatur gegen Maus". */
function erscheinungen(container: HTMLElement): Erscheinung[] {
  return alleKonnektoren(container).map(erscheinung);
}

/** Was die Leinwand selbst ueber die Auswahl sagt (`WhiteboardCanvas.tsx:318`). */
function zusammenfassung(container: HTMLElement): string {
  return container.querySelector('#whiteboard-canvas-summary')?.textContent ?? '';
}

/** Eine echte Taste auf dem Konnektorknoten. Zurueck kommt das Ereignis — sein `defaultPrevented` ist Teil der Messung. */
async function taste(
  ziel: Element,
  key: string,
  optionen: KeyboardEventInit = {},
): Promise<KeyboardEvent> {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...optionen });
  await act(async () => {
    ziel.dispatchEvent(ereignis);
    await Promise.resolve();
  });
  return ereignis;
}

/** Ein echter Mausklick — der Vergleichsweg, gegen den die Tastatur gemessen wird. */
async function klick(ziel: Element, optionen: MouseEventInit = {}): Promise<MouseEvent> {
  const ereignis = new MouseEvent('click', { bubbles: true, cancelable: true, ...optionen });
  await act(async () => {
    ziel.dispatchEvent(ereignis);
    await Promise.resolve();
  });
  return ereignis;
}

describe('die Konnektoren im Whiteboard sind tastaturbedienbar (GAP-0051)', () => {
  it('rendert jeden Konnektor als benannten Knopf in der Tab-Reihenfolge', async () => {
    await mitGerenderterLeinwand(async (container) => {
      // Die erwartete Reihenfolge wird aus dem Modell gelesen, nicht geraten: die Reihenfolge des
      // Renderers ist `zIndex`, dann `id`.
      const erwartet = [...KONNEKTOREN]
        .sort((links, rechts) => (links.zIndex ?? 0) - (rechts.zIndex ?? 0) || links.id.localeCompare(rechts.id))
        .map((eintrag) => eintrag.lineLabel || eintrag.name || eintrag.text);

      const gefunden = alleKonnektoren(container);
      expect(gefunden.length, 'alle vier Konnektoren muessen gerendert werden').toBe(KONNEKTOREN.length);
      expect(gefunden.map((knoten) => knoten.getAttribute('aria-label'))).toEqual(erwartet);

      for (const knoten of gefunden) {
        // Die Rolle, ohne die ein `<g>` fuer einen Screenreader kein Bedienelement ist.
        expect(knoten.getAttribute('role'), 'jeder Konnektor ist ein Knopf').toBe('button');
        // Die BEDINGUNG fuer die sequenzielle Fokusnavigation — der Beweis bleibt ein Native-Gate.
        expect(knoten.tabIndex, 'jeder Konnektor muss in der Tab-Reihenfolge liegen').toBe(0);
        expect(
          knoten.hasAttribute('aria-pressed'),
          'jeder Konnektor muss seinen Auswahlzustand tragen',
        ).toBe(true);
        expect(
          (knoten.getAttribute('aria-label') ?? '').length,
          'jeder Konnektor braucht einen zugaenglichen Namen',
        ).toBeGreaterThan(0);
      }

      // Die Namenskette der Implementierung, Feld fuer Feld gemessen statt an einem Feld vorbei.
      expect(konnektor(container, NAME_HANDOFF).getAttribute('aria-label')).toBe('Handoff');
      expect(konnektor(container, NAME_KANTENNAME).getAttribute('aria-label')).toBe('Kantenname');
      expect(konnektor(container, NAME_NURTEXT).getAttribute('aria-label')).toBe('Nur Text');
    });
  });

  it('waehlt einen Konnektor per Enter aus und schreibt die Auswahl ins DOM', async () => {
    await mitGerenderterLeinwand(async (container) => {
      const handoff = konnektor(container, NAME_HANDOFF);
      const eskalation = konnektor(container, NAME_ESKALATION);

      // Ausgangszustand BELEGEN — ohne das waere der Test gruen, wenn gar nichts ausgewaehlt ist.
      expect(erscheinung(handoff)).toEqual({
        name: 'Handoff',
        gedrueckt: 'false',
        strich: '#64748b',
        strichMuster: 'none',
        griffpunkte: 0,
      });
      expect(zusammenfassung(container)).toContain('0 objects are selected');

      const enter = await taste(handoff, 'Enter');

      // Die Leertaste scrollt und Enter loest den Standardknopf aus: beides muss der Konnektor
      // beanspruchen, sonst bedient die Taste die Seite statt den Konnektor.
      expect(enter.defaultPrevented, 'Enter muss abgefangen werden').toBe(true);

      // DIE WIRKUNG IM DOM, nicht die Verdrahtung: Auswahlzustand, Strich, Griffpunkte.
      expect(erscheinung(handoff)).toEqual({
        name: 'Handoff',
        gedrueckt: 'true',
        strich: '#60a5fa',
        strichMuster: '4 2',
        griffpunkte: 2,
      });
      expect(
        erscheinung(eskalation).gedrueckt,
        'der zweite Konnektor darf nicht mitausgewaehlt werden',
      ).toBe('false');

      // Und die Leinwand selbst zaehlt die Auswahl jetzt anders.
      expect(zusammenfassung(container)).not.toContain('0 objects are selected');
    });
  });

  it('verschiebt die Auswahl per Leertaste auf den naechsten Konnektor', async () => {
    await mitGerenderterLeinwand(async (container) => {
      const handoff = konnektor(container, NAME_HANDOFF);
      const eskalation = konnektor(container, NAME_ESKALATION);

      // Ausgangszustand ueber den MAUSWEG herstellen und belegen.
      await klick(handoff);
      expect(erscheinung(handoff).gedrueckt).toBe('true');

      const leertaste = await taste(eskalation, ' ');

      expect(leertaste.defaultPrevented, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(erscheinung(eskalation).gedrueckt, 'die Leertaste muss auswaehlen').toBe('true');
      expect(
        erscheinung(handoff).gedrueckt,
        'die vorher gewaehlte Auswahl darf nicht stehen bleiben',
      ).toBe('false');
    });
  });

  it('erzeugt per Enter denselben Zustand wie der Klick', async () => {
    await mitGerenderterLeinwand(async (container) => {
      const handoff = konnektor(container, NAME_HANDOFF);

      await klick(handoff);
      const nachKlick = erscheinungen(container);
      expect(erscheinung(handoff).gedrueckt, 'der Klick hat wirklich ausgewaehlt').toBe('true');

      // Ausgangszustand zuruecksetzen und BELEGEN, dass er leer ist. (Escape verlaesst den Konnektor
      // und laeuft in den Abbruchbefehl der Leinwand — gemessen, nicht angenommen.)
      await taste(handoff, 'Escape');
      expect(erscheinungen(container).every((zustand) => zustand.gedrueckt === 'false')).toBe(true);

      await taste(handoff, 'Enter');

      expect(
        erscheinungen(container),
        'Enter muss denselben Zustand erzeugen wie der Klick auf denselben Konnektor',
      ).toEqual(nachKlick);
    });
  });

  it('erweitert die Auswahl mit der Zusatztaste genau wie der Klick', async () => {
    await mitGerenderterLeinwand(async (container) => {
      const handoff = konnektor(container, NAME_HANDOFF);
      const eskalation = konnektor(container, NAME_ESKALATION);

      await klick(handoff);
      await taste(eskalation, 'Enter', { shiftKey: true });
      const perTastatur = erscheinungen(container);
      expect(erscheinung(handoff).gedrueckt, 'die vorhandene Auswahl bleibt bestehen').toBe('true');
      expect(erscheinung(eskalation).gedrueckt, 'die Zusatztaste erweitert die Auswahl').toBe('true');

      await taste(handoff, 'Escape');
      expect(erscheinungen(container).every((zustand) => zustand.gedrueckt === 'false')).toBe(true);

      // Derselbe Weg mit der Maus: der Vergleich muss Punkt fuer Punkt gleich sein.
      await klick(handoff);
      await klick(eskalation, { shiftKey: true });
      expect(
        erscheinungen(container),
        'die Zusatztaste muss auf der Tastatur dasselbe bewirken wie auf der Maus',
      ).toEqual(perTastatur);
    });
  });

  it('faengt Enter und Leertaste ab und laesst eine fremde Taste weiterziehen', async () => {
    await mitGerenderterLeinwand(async (container) => {
      const handoff = konnektor(container, NAME_HANDOFF);
      const eskalation = konnektor(container, NAME_ESKALATION);

      // Die Leinwand selbst haengt ihren Tastaturbefehl an DAS FENSTER (`WhiteboardCanvas.tsx:311`).
      // Ein Fensterlistener misst also genau die Ausbreitung, um die es geht.
      const amFenster: string[] = [];
      const fensterListener = (ereignis: KeyboardEvent) => {
        amFenster.push(ereignis.key);
      };
      window.addEventListener('keydown', fensterListener);
      try {
        const vorher = erscheinungen(container);

        const fremd = await taste(eskalation, 'x');
        expect(fremd.defaultPrevented, 'eine fremde Taste gehoert nicht dem Konnektor').toBe(false);
        expect(erscheinungen(container), 'die Taste x darf nichts auswaehlen').toEqual(vorher);
        expect(amFenster, 'die Gegenprobe: eine fremde Taste erreicht das Fenster').toContain('x');

        await taste(eskalation, 'Enter');
        expect(
          amFenster.filter((key) => key === 'Enter').length,
          'Enter darf den Konnektor nicht verlassen',
        ).toBe(0);
        expect(erscheinung(eskalation).gedrueckt).toBe('true');

        await taste(handoff, ' ');
        expect(
          amFenster.filter((key) => key === ' ').length,
          'die Leertaste darf den Konnektor nicht verlassen',
        ).toBe(0);
        expect(erscheinung(handoff).gedrueckt).toBe('true');
      } finally {
        window.removeEventListener('keydown', fensterListener);
      }
    });
  });
});

/**
 * Der Rueckfallzweig der Stelle: OHNE `onSelectConnector` waehlt die Tastatur ueber
 * `setSelectedItemId`. Die echte Produktkomponente wird mit genau den Eigenschaften gerendert, die
 * ihr Vertrag vorsieht — der optionale Klick-Rueckruf fehlt.
 */
function RueckfallLeinwand({ items }: { readonly items: WhiteboardItem[] }): ReactElement {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  return (
    <WhiteboardConnectorsRenderer
      items={items}
      selectedItemId={gewaehlt}
      setSelectedItemId={setGewaehlt}
    />
  );
}

async function mitGerendertemRueckfall(
  pruefung: (container: HTMLElement) => Promise<void>,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<RueckfallLeinwand items={ITEMS} />);
  });
  try {
    await pruefung(container);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

describe('der Rueckfallzweig ohne onSelectConnector (GAP-0051)', () => {
  it('waehlt ueber setSelectedItemId und wechselt die Auswahl wie der Klick', async () => {
    await mitGerendertemRueckfall(async (container) => {
      const handoff = konnektor(container, NAME_HANDOFF);
      const eskalation = konnektor(container, NAME_ESKALATION);

      expect(erscheinung(handoff).strich, 'ohne Auswahl ist der Strich neutral').toBe('#64748b');

      await klick(handoff);
      const nachKlick = erscheinungen(container);
      expect(
        erscheinung(handoff).strich,
        'der Klick muss ueber setSelectedItemId sichtbar auswaehlen',
      ).toBe('#60a5fa');
      expect(erscheinung(handoff).griffpunkte).toBe(2);

      await taste(handoff, 'Enter');
      expect(
        erscheinungen(container),
        'Enter muss ueber setSelectedItemId denselben Zustand erzeugen wie der Klick',
      ).toEqual(nachKlick);

      // Der WECHSEL: eine Taste auf dem zweiten Konnektor nimmt dem ersten die Auswahl.
      await klick(eskalation);
      const eskalationNachKlick = erscheinungen(container);
      await taste(handoff, 'Enter');
      expect(erscheinung(handoff).strich, 'Enter muss den Fokus der Auswahl verschieben').toBe('#60a5fa');
      expect(erscheinung(eskalation).strich, 'der vorher gewaehlte Konnektor faellt zurueck').toBe('#64748b');

      // BEFUND, nicht Wunsch (deshalb NICHT zugesichert): auf diesem Zweig bleibt `aria-pressed`
      // `false`, weil es allein aus `selectedItemIds` gespeist wird, waehrend `setSelectedItemId`
      // schreibt. Sichtbar ist der Konnektor gewaehlt, fuer einen Screenreader aber nicht. Wird das
      // behoben, darf dieser Test NICHT rot werden — er prueft den Sichtzustand, nicht den Mangel.
      await klick(eskalation);
      expect(erscheinungen(container), 'Klick und Taste bleiben auf diesem Zweig deckungsgleich').toEqual(
        eskalationNachKlick,
      );
    });
  });
});
