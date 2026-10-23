// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer GAP-0051 (Runde 280).
//
// DIE DREI STELLEN, DIE DIESE DATEI MISST
// ---------------------------------------
// GAP-0051 hat drei Stellen im Writer tastaturbedienbar gemacht. Danach trugen
// alle drei die RICHTIGEN ATTRIBUTE im Quelltext — und das ist kein Nachweis:
//
//   1. `navigation/toc/WriterTocSidebar.tsx:423-431`        Kommentarzeile
//   2. `navigation/toc/WriterTocSidebar.tsx:552-560`        Revisionszeile
//   3. `editor/blocks/shapes/WriterShapeCanvas.tsx:118-138` Form im SVG
//
// `role="button"` im JSX beweist nicht, dass ein Enter-Ereignis die Aktion
// ausloest; es beweist nur, dass jemand die Zeichenkette geschrieben hat.
// Ein Strukturnachweis ist kein Verhaltensnachweis. Jede der drei Stellen wird
// hier darum mit einem ECHTEN `KeyboardEvent` bedient, und gelesen wird die
// WIRKUNG: der gemeldete Sprungabsatz beziehungsweise `aria-pressed` im DOM.
//
// WAS GEMESSEN WIRD — und was nicht
// ---------------------------------
//   * Gemessen: ein `keydown` mit `Enter` beziehungsweise `' '` auf dem
//     jeweiligen Element loest die Aktion aus; `' '` wird dabei abgefangen
//     (`defaultPrevented`), damit die Seite nicht scrollt statt zu handeln.
//   * Gemessen: die Wirkung ist UNTERSCHEIDBAR. Jede Zeile zeigt auf einen
//     eigenen Absatz, jede Form traegt einen eigenen zugaenglichen Namen —
//     sonst waere "irgendetwas hat reagiert" nicht von "DIESE Zeile hat
//     reagiert" zu trennen.
//   * NICHT gemessen: dass der Browser per TAB dorthin springt. happy-dom hat
//     keine sequenzielle Fokusnavigation. `tabIndex === 0` ist die BEDINGUNG
//     dafuer, nicht der Beweis. REGEL 41, in dieser Sitzung gemessen:
//     happy-dom fokussiert JEDES Element — auch ein `<span>` ohne tabindex —,
//     deshalb steht in dieser Datei NIRGENDS `X.focus(); expect(document.
//     activeElement).toBe(X)`. Gelesen werden Attribute und DOM-Wirkungen.
//   * NICHT gemessen: die native Tastenaktivierung. Ein `<div role="button">`
//     und ein `<g role="button">` sind KEINE nativen Bedienelemente; der
//     Browser loest fuer sie von sich aus nichts aus. Genau deshalb ist der
//     eigene `onKeyDown`-Weg die Behauptung, die hier geprueft wird.
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import type { WriterShapeBlockData } from '../../../../../shared/contracts/writer/workspaceWriterMedia';
import { WriterShapeCanvas } from '../../../editor/blocks/shapes/WriterShapeCanvas';
import { WriterTocSidebar } from '../../../navigation/toc/WriterTocSidebar';
import type { WriterComment, WriterRevision } from '../../../types';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Die Vorgabemodelle. Die Absatz-Ids sind ABSICHTLICH verschieden: nur so ist
// "diese Zeile hat reagiert" von "irgendeine Zeile hat reagiert" zu trennen.
// ---------------------------------------------------------------------------

function absatz(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

const ABSAETZE: Paragraph[] = [
  absatz('p-eins', 'Absatz eins'),
  absatz('p-zwei', 'Absatz zwei'),
  absatz('p-drei', 'Absatz drei'),
];

/**
 * EIN Verfasser fuer beide Kommentare. GEMESSEN: der Verfasserfilter wird nur
 * gerendert, wenn `commentAuthors.length > 1` — mit einem Verfasser bleibt die
 * Liste genau die zwei Kommentarzeilen, ohne ein `<select>` dazwischen.
 */
const KOMMENTARE: WriterComment[] = [
  {
    id: 'c1',
    paragraphId: 'p-eins',
    author: 'Alice',
    avatarColor: '#60a5fa',
    text: 'Kommentar eins',
    createdAt: 1,
    resolved: false,
    replies: [],
  },
  {
    id: 'c2',
    paragraphId: 'p-drei',
    author: 'Alice',
    avatarColor: '#60a5fa',
    text: 'Kommentar zwei',
    createdAt: 2,
    resolved: false,
    replies: [],
  },
];

/**
 * Kein `onAcceptRevision`/`onRejectRevision`: sonst rendert die Zeile zwei
 * zusaetzliche `<button>` (Accept/Reject), und die Zeilenauswahl waere nicht
 * mehr eindeutig.
 */
const REVISIONEN: WriterRevision[] = [
  {
    id: 'r1',
    paragraphId: 'p-eins',
    type: 'insert',
    author: 'Bob',
    authorColor: '#f97316',
    newText: 'Neuer Text eins',
    timestamp: 1,
    status: 'pending',
  },
  {
    id: 'r2',
    paragraphId: 'p-drei',
    type: 'delete',
    author: 'Bob',
    authorColor: '#f97316',
    originalText: 'Alter Text zwei',
    timestamp: 2,
    status: 'pending',
  },
];

/**
 * Drei Formen, die je einen anderen Zweig des zugaenglichen Namens treffen
 * (`caption ?? text ?? shapeKind`, `WriterShapeCanvas.tsx:125`). GEMESSEN an
 * einer Sonde: `aria-label` war genau `"Etikett Rechteck"`, `"Text Ellipse"`
 * und `"line"`. Ohne diese Streuung waere "die Form heisst irgendwie" nicht von
 * "die Form heisst nach ihrer Beschriftung" zu trennen.
 */
const FORMEN: WriterShapeBlockData[] = [
  {
    id: 's1',
    shapeKind: 'rectangle',
    xMm: 10,
    yMm: 10,
    widthMm: 30,
    heightMm: 20,
    caption: 'Etikett Rechteck',
    zIndex: 1,
  },
  {
    id: 's2',
    shapeKind: 'ellipse',
    xMm: 60,
    yMm: 40,
    widthMm: 25,
    heightMm: 25,
    text: 'Text Ellipse',
    zIndex: 2,
  },
  {
    id: 's3',
    shapeKind: 'line',
    xMm: 10,
    yMm: 90,
    widthMm: 40,
    heightMm: 1,
    zIndex: 3,
  },
];

// ---------------------------------------------------------------------------
// Die Buehne: ein echtes DOM, kein HTML-String.
// ---------------------------------------------------------------------------

async function mitGrenDOM(
  rendern: () => ReactElement,
  pruefung: (container: HTMLElement) => Promise<void>,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(rendern());
  });
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
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

/**
 * DIE Taste. Es gibt hier keinen Aufruf der Implementierungsfunktion — es gibt
 * ein `KeyboardEvent`, das den Baum hinaufsteigt, und danach wird gelesen, was
 * im DOM und in der Aufzeichnung steht. Zurueckgegeben wird
 * `defaultPrevented`, weil die Leertaste sonst scrollt statt zu handeln.
 */
async function taste(element: Element | null, key: string): Promise<boolean> {
  let verhindert = false;
  await act(async () => {
    const ereignis = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    element?.dispatchEvent(ereignis);
    verhindert = ereignis.defaultPrevented;
    await Promise.resolve();
  });
  return verhindert;
}

// ---------------------------------------------------------------------------
// Die Seitenleiste.
// ---------------------------------------------------------------------------

interface Sprungaufzeichnung {
  readonly absaetze: string[];
}

function seitenleiste(aufzeichnung: Sprungaufzeichnung): ReactElement {
  return (
    <WriterTocSidebar
      paragraphs={ABSAETZE}
      isOpen
      onClose={() => undefined}
      onJumpToParagraph={(paragraphId: string) => {
        aufzeichnung.absaetze.push(paragraphId);
      }}
      activeParagraphId="p-eins"
      comments={KOMMENTARE}
      revisions={REVISIONEN}
      pages={[]}
      sections={[]}
      footnotes={[]}
      tables={[]}
      images={[]}
      equations={[]}
      namedVersions={[]}
      sessionVersions={[]}
      clipboardHistoryEnabled={false}
      clipboardHistory={[]}
      onSetClipboardHistoryEnabled={() => undefined}
      onClearClipboardHistory={() => undefined}
      onInsertClipboardEntry={() => undefined}
      onCreateNamedVersion={() => ({ ok: true })}
      onRestoreNamedVersion={() => ({ ok: true })}
      onDeleteNamedVersion={() => ({ ok: true })}
      onRestoreSessionVersion={() => ({ ok: true })}
    />
  );
}

async function mitSeitenleiste(
  pruefung: (container: HTMLElement, aufzeichnung: Sprungaufzeichnung) => Promise<void>,
): Promise<void> {
  const aufzeichnung: Sprungaufzeichnung = { absaetze: [] };
  await mitGrenDOM(
    () => seitenleiste(aufzeichnung),
    async (container) => {
      await pruefung(container, aufzeichnung);
    },
  );
}

/**
 * Klickt den Reiter mit dieser Beschriftung.
 *
 * GEMESSEN an einer Sonde: die Seitenleiste traegt im Ausgangszustand genau
 * ZEHN `<button>` — "Close Writer Toc panel", "Outline", "Pages", "Bookmarks",
 * "Comments2", "Search", "Changes2", "Go To", "Clipboard", "Versions"; der
 * Reiter heisst im Text `"Outline"`, `"Pages"`, `"Bookmarks"`, `"Comments2"`,
 * `"Search"`, `"Changes2"` — die angehaengte Ziffer ist der Zaehler. Darum wird
 * mit `startsWith` gesucht, und die Sonde ergab genau EINEN Treffer je
 * Beschriftung. Die Zusicherung auf die Trefferzahl steht im Test, damit ein
 * spaeterer zweiter Treffer nicht stillschweigend den falschen Reiter klickt.
 */
async function aktiviereReiter(container: HTMLElement, beschriftung: string): Promise<void> {
  const treffer = Array.from(container.querySelectorAll('button')).filter((knopf) =>
    (knopf.textContent ?? '').trim().startsWith(beschriftung),
  );
  expect(treffer.length, `genau ein Reiter "${beschriftung}"`).toBe(1);
  const [reiter] = treffer;
  await act(async () => {
    reiter?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

/**
 * Die Zeilen, die GAP-0051 als Bedienelement ausweist.
 *
 * GEMESSEN an einer Sonde: im Reiter `"Comments"` sind es genau die zwei
 * Kommentarzeilen, im Reiter `"Changes"` genau die zwei Revisionszeilen.
 * `WriterNavigationSupplement` und `WriterNavigationActions` tragen im ganzen
 * `navigation`-Verzeichnis KEIN `role="button"` (gemessen per Suche), und
 * Accept/Reject/Resolve/Antworten sind echte `<button>` ohne `role`-Attribut
 * und werden hier auch nicht verdrahtet.
 */
function bedienzeilen(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="button"]'));
}

function zeile(container: HTMLElement, index: number): HTMLElement | null {
  const gefunden = bedienzeilen(container);
  expect(
    gefunden.length,
    `dieser Reiter muss genau seine zwei Zeilen als role="button" ausweisen, gefunden: ${gefunden.length}`,
  ).toBe(2);
  return gefunden[index] ?? null;
}

// ---------------------------------------------------------------------------
// Die Formenleinwand.
// ---------------------------------------------------------------------------

interface Auswahlaufzeichnung {
  /**
   * `WriterShapeCanvasProps.onSelectShape` ist `(shapeId: string | null) => void`
   * (gemessen an der Prop-Signatur). Der Wert wird darum so aufgezeichnet, wie
   * er kommt: Wuerde die Form beim Tastendruck `null` melden, stuende das hier
   * und der Test waere rot — ein `if (shapeId !== null)` wuerde es verschlucken.
   */
  readonly ids: Array<string | null>;
}

function formenIn(wurzel: ParentNode): SVGGElement[] {
  return Array.from(wurzel.querySelectorAll<SVGGElement>('g[role="button"]'));
}

function formMitName(wurzel: ParentNode, name: string): SVGElement | null {
  return (
    formenIn(wurzel).find((form) => form.getAttribute('aria-label') === name) ?? null
  );
}

async function mitFormen(
  pruefung: (
    container: HTMLElement,
    auswahl: Auswahlaufzeichnung,
  ) => Promise<void>,
): Promise<void> {
  const auswahl: Auswahlaufzeichnung = { ids: [] };
  await mitGrenDOM(
    () => (
      <WriterShapeCanvas
        shapes={FORMEN}
        onUpdateShapes={() => undefined}
        onSelectShape={(shapeId) => {
          auswahl.ids.push(shapeId);
        }}
      />
    ),
    async (container) => {
      await pruefung(container, auswahl);
    },
  );
}

interface Doppelaufzeichnung {
  readonly nurLesen: Array<string | null>;
  readonly schreibbar: Array<string | null>;
}

/**
 * Zwei Leinwaende nebeneinander — dieselben Formen, einmal `readOnly`, einmal
 * nicht. Die beiden Huellen sind MEIN Markup (kein Produktionsselektor); sie
 * sind noetig, weil die beiden Baeume sonst nicht auseinanderzuhalten waeren.
 *
 * Der Grund fuer den Doppelaufbau: ein Test "im Nur-Lese-Modus passiert nichts"
 * ist ohne den Vergleichsfall auch dann gruen, wenn die Taste GAR NICHT
 * verdrahtet ist. Erst der Schreibmodus im selben Test macht ihn zu einer
 * Aussage ueber die `readOnly`-Verzweigung statt ueber Abwesenheit.
 */
async function mitZweiLeinwaenden(
  pruefung: (
    nurLesen: HTMLElement,
    schreibbar: HTMLElement,
    aufzeichnung: Doppelaufzeichnung,
  ) => Promise<void>,
): Promise<void> {
  const aufzeichnung: Doppelaufzeichnung = { nurLesen: [], schreibbar: [] };
  await mitGrenDOM(
    () => (
      <>
        <div data-fall="nur-lesen">
          <WriterShapeCanvas
            shapes={FORMEN}
            onUpdateShapes={() => undefined}
            readOnly
            onSelectShape={(shapeId) => {
              aufzeichnung.nurLesen.push(shapeId);
            }}
          />
        </div>
        <div data-fall="schreibbar">
          <WriterShapeCanvas
            shapes={FORMEN}
            onUpdateShapes={() => undefined}
            onSelectShape={(shapeId) => {
              aufzeichnung.schreibbar.push(shapeId);
            }}
          />
        </div>
      </>
    ),
    async (container) => {
      const nurLesen = container.querySelector<HTMLElement>('[data-fall="nur-lesen"]');
      const schreibbar = container.querySelector<HTMLElement>('[data-fall="schreibbar"]');
      if (!nurLesen || !schreibbar) {
        throw new Error('beide Leinwaende muessen im DOM stehen, sonst misst der Test nichts');
      }
      await pruefung(nurLesen, schreibbar, aufzeichnung);
    },
  );
}

// ---------------------------------------------------------------------------
// GAP-0051, Stelle 1: die Kommentarzeile.
// ---------------------------------------------------------------------------

describe('GAP-0051 Stelle 1 — die Kommentarzeile der Gliederung wirkt auf Tastendruck', () => {
  it('weist jede Kommentarzeile als Bedienelement mit Tab-Position und einem Namen aus', async () => {
    await mitSeitenleiste(async (container) => {
      await aktiviereReiter(container, 'Comments');

      const gefunden = bedienzeilen(container);
      expect(gefunden.length, 'die zwei Kommentare des Vorgabemodells').toBe(2);

      for (const [index, eintrag] of gefunden.entries()) {
        // `tabIndex === 0` ist die BEDINGUNG dafuer, dass die sequenzielle
        // Fokusnavigation die Zeile erreicht. Ein negativer Wert waere per
        // Skript fokussierbar, aber nicht per Tab.
        expect(
          eintrag.tabIndex,
          'jede Kommentarzeile muss in der Tab-Reihenfolge liegen',
        ).toBe(0);
        // GEMESSEN: die Zeile traegt KEIN `aria-label`; ihr Name ist der
        // Inhalt. Ohne Namen waere `role="button"` eine unbeschriftete
        // Schaltflaeche — bedienbar und stumm.
        const name = eintrag.textContent ?? '';
        expect(
          name.includes(KOMMENTARE[index].text),
          `der Kommentartext ist der Name der Schaltflaeche, gelesen: ${JSON.stringify(name)}`,
        ).toBe(true);
        expect(name.includes(KOMMENTARE[index].author)).toBe(true);
      }
    });
  });

  it('springt per Enter auf den Absatz GENAU DIESER Kommentarzeile', async () => {
    await mitSeitenleiste(async (container, aufzeichnung) => {
      await aktiviereReiter(container, 'Comments');
      expect(
        aufzeichnung.absaetze,
        'vor der Taste darf nichts gesprungen sein, sonst misst der Test den Klick',
      ).toEqual([]);

      const zweite = zeile(container, 1);
      expect(zweite, 'fuer die Unterscheidung braucht es zwei Kommentarzeilen').not.toBeNull();

      await taste(zweite, 'Enter');

      expect(
        aufzeichnung.absaetze,
        'Enter auf der ZWEITEN Kommentarzeile muss auf ihren Absatz springen',
      ).toEqual([KOMMENTARE[1].paragraphId]);
    });
  });

  it('springt per Leertaste und faengt das Scrollen ab', async () => {
    await mitSeitenleiste(async (container, aufzeichnung) => {
      await aktiviereReiter(container, 'Comments');
      const zweite = zeile(container, 1);
      expect(zweite).not.toBeNull();

      const verhindert = await taste(zweite, ' ');

      // Die Leertaste scrollt von sich aus. Wird sie nicht abgefangen, springt
      // die Liste statt zu springen.
      expect(verhindert, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(aufzeichnung.absaetze).toEqual([KOMMENTARE[1].paragraphId]);
    });
  });

  it('laesst eine fremde Taste untaetig und reagiert danach auf Enter', async () => {
    await mitSeitenleiste(async (container, aufzeichnung) => {
      await aktiviereReiter(container, 'Comments');
      const erste = zeile(container, 0);
      expect(erste).not.toBeNull();

      const verhindert = await taste(erste, 'x');
      expect(aufzeichnung.absaetze, 'die Taste x darf nichts ausloesen').toEqual([]);
      expect(
        verhindert,
        'eine fremde Taste darf das Standardverhalten nicht unterdruecken',
      ).toBe(false);

      // DER GEGENBEWEIS IM SELBEN TEST: ohne diese zweite Haelfte waere die
      // Zusicherung ueber die Abwesenheit auch dann gruen, wenn `onKeyDown`
      // ueberhaupt nicht verdrahtet ist.
      await taste(erste, 'Enter');
      expect(aufzeichnung.absaetze, 'Enter muss danach springen').toEqual([
        KOMMENTARE[0].paragraphId,
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-0051, Stelle 2: die Revisionszeile.
// ---------------------------------------------------------------------------

describe('GAP-0051 Stelle 2 — die Revisionszeile der Gliederung wirkt auf Tastendruck', () => {
  it('weist jede Revisionszeile als Bedienelement mit Tab-Position und einem Namen aus', async () => {
    await mitSeitenleiste(async (container) => {
      await aktiviereReiter(container, 'Changes');

      const gefunden = bedienzeilen(container);
      expect(gefunden.length, 'die zwei Revisionen des Vorgabemodells').toBe(2);

      for (const [index, eintrag] of gefunden.entries()) {
        expect(
          eintrag.tabIndex,
          'jede Revisionszeile muss in der Tab-Reihenfolge liegen',
        ).toBe(0);
        const name = eintrag.textContent ?? '';
        expect(
          name.includes(REVISIONEN[index].author),
          `der Verfasser ist Teil des Namens, gelesen: ${JSON.stringify(name)}`,
        ).toBe(true);
        expect(name.includes(REVISIONEN[index].type)).toBe(true);
      }
    });
  });

  it('springt per Enter auf den Absatz GENAU DIESER Revisionszeile', async () => {
    await mitSeitenleiste(async (container, aufzeichnung) => {
      await aktiviereReiter(container, 'Changes');
      expect(aufzeichnung.absaetze, 'vor der Taste darf nichts gesprungen sein').toEqual([]);

      const zweite = zeile(container, 1);
      expect(zweite, 'fuer die Unterscheidung braucht es zwei Revisionszeilen').not.toBeNull();

      await taste(zweite, 'Enter');

      expect(
        aufzeichnung.absaetze,
        'Enter auf der ZWEITEN Revisionszeile muss auf ihren Absatz springen',
      ).toEqual([REVISIONEN[1].paragraphId]);
    });
  });

  it('springt per Leertaste und faengt das Scrollen ab', async () => {
    await mitSeitenleiste(async (container, aufzeichnung) => {
      await aktiviereReiter(container, 'Changes');
      const zweite = zeile(container, 1);
      expect(zweite).not.toBeNull();

      const verhindert = await taste(zweite, ' ');

      expect(verhindert, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(aufzeichnung.absaetze).toEqual([REVISIONEN[1].paragraphId]);
    });
  });

  it('laesst eine fremde Taste untaetig und reagiert danach auf Enter', async () => {
    await mitSeitenleiste(async (container, aufzeichnung) => {
      await aktiviereReiter(container, 'Changes');
      const erste = zeile(container, 0);
      expect(erste).not.toBeNull();

      const verhindert = await taste(erste, 'x');
      expect(aufzeichnung.absaetze, 'die Taste x darf nichts ausloesen').toEqual([]);
      expect(verhindert).toBe(false);

      await taste(erste, 'Enter');
      expect(aufzeichnung.absaetze, 'Enter muss danach springen').toEqual([
        REVISIONEN[0].paragraphId,
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-0051, Stelle 3: die Form im SVG.
// ---------------------------------------------------------------------------

describe('GAP-0051 Stelle 3 — die Form im SVG wirkt auf Tastendruck', () => {
  it('macht jede Form zu einem benannten Bedienelement mit Auswahlzustand', async () => {
    await mitFormen(async (container) => {
      const gefunden = formenIn(container);
      expect(gefunden.length, 'die drei Vorgabeformen').toBe(3);

      for (const form of gefunden) {
        expect(form.tagName.toLowerCase(), 'die Form ist ein SVG-Gruppenelement').toBe('g');
        expect(
          form.tabIndex,
          'jede Form muss in der Tab-Reihenfolge liegen',
        ).toBe(0);
        expect(
          form.getAttribute('aria-pressed'),
          'jede Form muss ihren Auswahlzustand tragen',
        ).toBe('false');
      }

      // Der zugaengliche Name: `caption` vor `text` vor `shapeKind`. GEMESSEN
      // an einer Sonde waren es genau diese drei Zeichenketten. Ohne die
      // Streuung ueber drei Zweige wuerde der Test auch dann gruen, wenn alle
      // Formen denselben Namen tragen.
      expect(
        formMitName(container, 'Etikett Rechteck'),
        'der Name kommt aus der Beschriftung',
      ).not.toBeNull();
      expect(
        formMitName(container, 'Text Ellipse'),
        'ohne Beschriftung kommt der Name aus dem Text',
      ).not.toBeNull();
      expect(
        formMitName(container, 'line'),
        'ohne Beschriftung und ohne Text kommt der Name aus der Formart',
      ).not.toBeNull();
    });
  });

  it('waehlt per Enter GENAU DIESE Form aus und meldet das im DOM', async () => {
    await mitFormen(async (container, auswahl) => {
      expect(auswahl.ids, 'vor der Taste darf nichts gewaehlt sein').toEqual([]);

      const ellipse = formMitName(container, 'Text Ellipse');
      expect(ellipse, 'die zweite Form muss ueber ihren Namen auffindbar sein').not.toBeNull();

      await taste(ellipse, 'Enter');

      expect(auswahl.ids, 'Enter muss genau diese Form melden').toEqual(['s2']);
      // DIE WIRKUNG IM DOM, nicht nur der Rueckruf: `aria-pressed` wechselt.
      expect(
        formMitName(container, 'Text Ellipse')?.getAttribute('aria-pressed'),
        'die gewaehlte Form muss ihren Zustand im DOM melden',
      ).toBe('true');
      expect(
        formMitName(container, 'Etikett Rechteck')?.getAttribute('aria-pressed'),
        'die andere Form darf nicht gewaehlt sein',
      ).toBe('false');
      expect(formMitName(container, 'line')?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('waehlt per Leertaste aus und faengt das Scrollen ab', async () => {
    await mitFormen(async (container, auswahl) => {
      const rechteck = formMitName(container, 'Etikett Rechteck');
      expect(rechteck).not.toBeNull();

      const verhindert = await taste(rechteck, ' ');

      expect(verhindert, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(auswahl.ids).toEqual(['s1']);
      expect(formMitName(container, 'Etikett Rechteck')?.getAttribute('aria-pressed')).toBe(
        'true',
      );
    });
  });

  it('nimmt die Form im Nur-Lese-Modus aus der Tab-Reihenfolge und laesst sie untatig', async () => {
    await mitZweiLeinwaenden(async (nurLesen, schreibbar, aufzeichnung) => {
      const formenNurLesen = formenIn(nurLesen);
      expect(formenNurLesen.length, 'auch im Nur-Lese-Modus werden die Formen gezeichnet').toBe(3);
      for (const form of formenNurLesen) {
        expect(
          form.tabIndex,
          'eine Form im Nur-Lese-Modus darf keinen Tab-Stopp belegen',
        ).toBe(-1);
        expect(form.getAttribute('role'), 'die Rolle bleibt, damit die Form ansagbar ist').toBe(
          'button',
        );
      }

      const gelesen = formMitName(nurLesen, 'Text Ellipse');
      expect(gelesen).not.toBeNull();
      const enterImNurLesenModus = await taste(gelesen, 'Enter');
      expect(
        aufzeichnung.nurLesen,
        'im Nur-Lese-Modus darf Enter keine Form auswaehlen',
      ).toEqual([]);
      expect(
        formMitName(nurLesen, 'Text Ellipse')?.getAttribute('aria-pressed'),
        'auch der Auswahlzustand darf sich nicht aendern',
      ).toBe('false');
      expect(
        enterImNurLesenModus,
        'im Nur-Lese-Modus gibt es nichts abzufangen',
      ).toBe(false);

      // DER VERGLEICHSFALL IM SELBEN TEST: dieselbe Taste auf derselben Form
      // in der schreibbaren Leinwand wirkt. Ohne ihn waere die Haelfte darueber
      // auch dann gruen, wenn `onKeyDown` gar nicht verdrahtet ist.
      const geschrieben = formMitName(schreibbar, 'Text Ellipse');
      expect(geschrieben).not.toBeNull();
      await taste(geschrieben, 'Enter');
      expect(aufzeichnung.schreibbar, 'im Schreibmodus muss dieselbe Taste wirken').toEqual([
        's2',
      ]);
      expect(
        formMitName(schreibbar, 'Text Ellipse')?.getAttribute('aria-pressed'),
      ).toBe('true');
    });
  });
});
