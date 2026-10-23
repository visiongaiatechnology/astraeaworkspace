// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer GAP-0052 (Runde 289).
//
// DIE VIER STELLEN, DIE DIESE DATEI MISST
// ---------------------------------------
// `tools/parse-mouse-only.mjs` (TypeScript-Compiler-API, KEINE Zeilenheuristik)
// hat in Runde 289 vier Stellen im Writer als maus-only gemeldet — je ein
// `<div>` mit `onClick`, ohne `role`, ohne `tabIndex`, ohne `onKeyDown`:
//
//   1. `equations/WriterEquationBlock.tsx`             Renderflaeche der Formel
//   2. `layout/special-views/WriterSpecialViews.tsx`   Kopfzeile eines Gliederungsabschnitts
//   3. `references/citations/WriterCitationModal.tsx`  Quellenzeile
//   4. `review/WriterReviewPane.tsx`                   Revisionszeile
//
// Der Parser nennt die Zeile des OEFFNENDEN TAGS, nicht die des `onClick`.
// `role`, `tabIndex` und `onKeyDown` im Quelltext sind danach kein Nachweis —
// das ist eine Zeichenkette im JSX. Jede der vier Stellen wird hier mit einem
// ECHTEN `KeyboardEvent` bedient, und gelesen wird die WIRKUNG: der gemeldete
// Rueckruf, das Attribut im DOM, der umgeklappte Abschnitt.
//
// WAS GEMESSEN WIRD — und was nicht
// ---------------------------------
//   * Gemessen: Enter und Leertaste loesen die Aktion aus; die Leertaste wird
//     dabei abgefangen (`defaultPrevented`), damit die Seite nicht scrollt
//     statt zu handeln.
//   * Gemessen: die Wirkung ist UNTERSCHEIDBAR. Zwei Quellen, zwei Absaetze,
//     zwei Gliederungsabschnitte — sonst waere "irgendetwas hat reagiert" nicht
//     von "DIESE Zeile hat reagiert" zu trennen.
//   * Gemessen: die Attribute im DOM (`role`, `tabIndex`, `aria-selected`,
//     `aria-expanded`) und die Wirkung im DOM (der Abschnitt klappt zu, die
//     Quellenauswahl wandert in die eingefuegte Zitation).
//   * NICHT gemessen: dass der Browser per TAB dorthin springt. happy-dom hat
//     keine sequenzielle Fokusnavigation. `tabIndex === 0` ist die BEDINGUNG
//     dafuer, nicht der Beweis; das bleibt ein NATIVE Release-Gate.
//   * NICHT gemessen: die native Tastenaktivierung. `<div role="button">` ist
//     kein natives Bedienelement; der Browser loest dafuer von sich aus nichts
//     aus. Genau deshalb ist der eigene `onKeyDown`-Weg die Behauptung.
//   * REGEL 41, in dieser Sitzung gemessen: happy-dom fokussiert JEDES Element —
//     auch ein `<span>` ohne tabindex. `X.focus(); expect(activeElement).toBe(X)`
//     ist darum WERTLOS und steht in dieser Datei NIRGENDS.
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type {
  Paragraph,
  WriterEquationBlockData,
  WriterStyleCatalog,
} from '../../../../../shared/contracts/workspace';
import { WriterEquationBlock } from '../../../equations/WriterEquationBlock';
import { WriterSpecialViews } from '../../../layout/special-views/WriterSpecialViews';
import { WriterCitationModal } from '../../../references/citations/WriterCitationModal';
import { WriterReviewPane } from '../../../review/WriterReviewPane';
import type { WriterCitationSource, WriterRevision } from '../../../types';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
 * DIE Taste. Es gibt hier keinen Aufruf einer Implementierungsfunktion — es gibt
 * ein `KeyboardEvent`, das den Baum hinaufsteigt, und danach wird gelesen, was
 * im DOM und in der Aufzeichnung steht. Zurueckgegeben wird `defaultPrevented`,
 * weil die Leertaste sonst scrollt statt zu handeln.
 */
async function taste(element: Element | null, key: string): Promise<boolean> {
  let verhindert = false;
  await act(async () => {
    const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    element?.dispatchEvent(ereignis);
    verhindert = ereignis.defaultPrevented;
    await Promise.resolve();
  });
  return verhindert;
}

async function klick(element: Element | null): Promise<void> {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

/** Ein Knopf ueber seinen sichtbaren Text — fuer die Zitations-Schaltflaeche. */
function knopfMitText(container: HTMLElement, text: string): HTMLButtonElement | null {
  const treffer = Array.from(container.querySelectorAll('button')).filter(
    (knopf) => (knopf.textContent ?? '').trim() === text,
  );
  expect(treffer.length, `genau ein Knopf "${text}"`).toBe(1);
  return treffer[0] ?? null;
}

// ---------------------------------------------------------------------------
// GAP-0052, Stelle 1: die Renderflaeche der Formel.
//
// Zwei Bloecke nebeneinander — dieselbe Gleichung, einmal schreibbar, einmal
// `readOnly`. Der Grund: ein Test "im Nur-Lese-Modus passiert nichts" ist ohne
// den Vergleichsfall auch dann gruen, wenn die Taste GAR NICHT verdrahtet ist.
// Erst der Schreibmodus im selben Test macht ihn zu einer Aussage ueber die
// `readOnly`-Verzweigung statt ueber Abwesenheit.
// ---------------------------------------------------------------------------

const GLEICHUNG: WriterEquationBlockData = {
  id: 'eq-gap0052',
  latex: 'E = mc^2',
  displayMode: true,
};

interface Editoraufzeichnung {
  readonly schreibbar: string[];
  readonly nurLesen: string[];
}

/** Die Renderflaeche eines Blocks — der Anker ist ihr eigenes Datenattribut. */
function flaeche(wurzel: ParentNode): HTMLElement {
  const gefunden = wurzel.querySelector<HTMLElement>('[data-writer-equation-surface="render"]');
  if (!gefunden) {
    throw new Error('die Renderflaeche muss im DOM stehen, sonst misst der Test nichts');
  }
  return gefunden;
}

async function mitZweiFormelbloecken(
  pruefung: (
    schreibbar: HTMLElement,
    nurLesen: HTMLElement,
    aufzeichnung: Editoraufzeichnung,
  ) => Promise<void>,
): Promise<void> {
  const aufzeichnung: Editoraufzeichnung = { schreibbar: [], nurLesen: [] };
  await mitGrenDOM(
    () => (
      <>
        <div data-fall="schreibbar">
          <WriterEquationBlock
            equation={GLEICHUNG}
            onUpdateEquation={() => undefined}
            onDeleteEquation={() => undefined}
            onOpenEditor={(eq) => {
              aufzeichnung.schreibbar.push(eq.id);
            }}
          />
        </div>
        <div data-fall="nur-lesen">
          <WriterEquationBlock
            equation={GLEICHUNG}
            onUpdateEquation={() => undefined}
            onDeleteEquation={() => undefined}
            readOnly
            onOpenEditor={(eq) => {
              aufzeichnung.nurLesen.push(eq.id);
            }}
          />
        </div>
      </>
    ),
    async (container) => {
      const schreibbar = container.querySelector<HTMLElement>('[data-fall="schreibbar"]');
      const nurLesen = container.querySelector<HTMLElement>('[data-fall="nur-lesen"]');
      if (!schreibbar || !nurLesen) {
        throw new Error('beide Formelbloecke muessen im DOM stehen, sonst misst der Test nichts');
      }
      await pruefung(schreibbar, nurLesen, aufzeichnung);
    },
  );
}

describe('GAP-0052 Stelle 1 — die Renderflaeche der Formel wirkt auf Tastendruck', () => {
  it('weist nur die schreibbare Flaeche als Bedienelement mit Tab-Position und Namen aus', async () => {
    await mitZweiFormelbloecken(async (schreibbar, nurLesen) => {
      const oeffenbar = flaeche(schreibbar);
      expect(
        oeffenbar.getAttribute('role'),
        'die schreibbare Renderflaeche muss ein Bedienelement sein',
      ).toBe('button');
      expect(
        oeffenbar.tabIndex,
        'die schreibbare Renderflaeche muss in der Tab-Reihenfolge liegen',
      ).toBe(0);
      expect(
        (oeffenbar.getAttribute('aria-label') ?? '').length,
        'ein role="button" ohne Namen ist eine stumme Schaltflaeche',
      ).toBeGreaterThan(0);

      // Der Vergleichsfall: im Nur-Lese-Modus gibt es nichts zu oeffnen, also
      // auch kein Bedienelement und keinen Tab-Stopp.
      const gelesen = flaeche(nurLesen);
      expect(
        gelesen.getAttribute('role'),
        'die Nur-Lese-Flaeche darf kein Bedienelement sein',
      ).toBeNull();
      expect(
        gelesen.tabIndex,
        'die Nur-Lese-Flaeche darf keinen Tab-Stopp belegen',
      ).toBe(-1);
      expect(
        Array.from(nurLesen.querySelectorAll('[role="button"]')).length,
        'im Nur-Lese-Block traegt nichts die Rolle einer Schaltflaeche',
      ).toBe(0);
    });
  });

  it('oeffnet per Enter den Editor — und im Nur-Lese-Modus nicht', async () => {
    await mitZweiFormelbloecken(async (schreibbar, nurLesen, aufzeichnung) => {
      expect(aufzeichnung.schreibbar, 'vor der Taste darf nichts geoeffnet sein').toEqual([]);

      await taste(flaeche(schreibbar), 'Enter');
      expect(
        aufzeichnung.schreibbar,
        'Enter auf der Renderflaeche muss den Editor mit GENAU DIESER Gleichung oeffnen',
      ).toEqual([GLEICHUNG.id]);

      // Der Vergleichsfall im selben Test: dieselbe Taste auf derselben Flaeche
      // des Nur-Lese-Blocks. Ohne ihn waere die Haelfte darueber auch dann
      // gruen, wenn `onKeyDown` nur zufaellig nichts tut.
      await taste(flaeche(nurLesen), 'Enter');
      expect(
        aufzeichnung.nurLesen,
        'im Nur-Lese-Modus darf auch ein Enter auf der Flaeche nichts oeffnen',
      ).toEqual([]);
    });
  });

  it('oeffnet per Leertaste, faengt das Scrollen ab und bleibt bei fremden Tasten untatig', async () => {
    await mitZweiFormelbloecken(async (schreibbar, _nurLesen, aufzeichnung) => {
      const fremdeTaste = await taste(flaeche(schreibbar), 'x');
      expect(aufzeichnung.schreibbar, 'die Taste x darf nichts oeffnen').toEqual([]);
      expect(
        fremdeTaste,
        'eine fremde Taste darf das Standardverhalten nicht unterdruecken',
      ).toBe(false);

      const verhindert = await taste(flaeche(schreibbar), ' ');
      expect(verhindert, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(aufzeichnung.schreibbar, 'die Leertaste muss den Editor oeffnen').toEqual([
        GLEICHUNG.id,
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-0052, Stelle 2: die Kopfzeile eines Gliederungsabschnitts.
// ---------------------------------------------------------------------------

function absatz(id: string, text: string, headingLevel?: 1 | 2 | 3): Paragraph {
  return {
    id,
    style: {
      style_name: headingLevel ? `heading${headingLevel}` : 'normal',
      heading_level: headingLevel,
      alignment: 'left',
      line_height: 1.6,
      space_before: 0,
      space_after: 0,
    },
    spans: [{ text }],
  };
}

const GLIEDERUNG: Paragraph[] = [
  absatz('p-h1', 'Kapitel Eins', 1),
  absatz('p-body1', 'Fliesstext eins'),
  absatz('p-h2', 'Kapitel Zwei', 2),
  absatz('p-body2', 'Fliesstext zwei'),
];

const STILKATALOG: WriterStyleCatalog = {
  paragraphStyles: [],
  characterStyles: [],
  listStyles: [],
  tableStyles: [],
  linkedStyles: [],
};

interface Gliederungsaufzeichnung {
  readonly absaetze: string[];
}

/**
 * Die Kopfzeilen der Gliederungsabschnitte.
 *
 * GEMESSEN an einer Sonde: im Modus `outline` sind es genau die zwei Zeilen mit
 * `role="button"` UND `aria-expanded` — die beiden Knoepfe "Alle aufklappen" /
 * "Alle zuklappen" sind native `<button>` ohne `role`-Attribut, und die
 * Fussnotenmarke in `WriterParagraphItem` (ebenfalls `role="button"`) rendert nur
 * bei vorhandenen Fussnoten, von denen dieses Modell keine hat.
 */
function kopfzeilen(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="button"][aria-expanded]'));
}

async function mitGliederung(
  pruefung: (container: HTMLElement, aufzeichnung: Gliederungsaufzeichnung) => Promise<void>,
): Promise<void> {
  const aufzeichnung: Gliederungsaufzeichnung = { absaetze: [] };
  await mitGrenDOM(
    () => (
      <WriterSpecialViews
        viewMode="outline"
        documentTitle="GAP-0052"
        paragraphs={GLIEDERUNG}
        pages={[]}
        zoom={100}
        styles={[]}
        activeParagraphId="p-h1"
        draggedPIdx={null}
        dragOverPIdx={null}
        showNonPrinting={false}
        reviewMode="none"
        revisions={[]}
        onParagraphChange={() => 0}
        onTextSelection={() => undefined}
        onSelectParagraph={(paragraphId) => {
          aufzeichnung.absaetze.push(paragraphId);
        }}
        onAddParagraph={() => undefined}
        onDeleteParagraph={() => undefined}
        onDragStart={() => undefined}
        onDragOver={() => undefined}
        onDrop={() => undefined}
        tables={[]}
        images={[]}
        equations={[]}
        styleCatalog={STILKATALOG}
        onUpdateTable={() => undefined}
        onDeleteTable={() => undefined}
        onUpdateImage={() => undefined}
        onDeleteImage={() => undefined}
        onUpdateEquation={() => undefined}
        onDeleteEquation={() => undefined}
      />
    ),
    async (container) => {
      await pruefung(container, aufzeichnung);
    },
  );
}

describe('GAP-0052 Stelle 2 — die Kopfzeile des Gliederungsabschnitts wirkt auf Tastendruck', () => {
  it('weist jede Kopfzeile als Bedienelement mit Tab-Position, Namen und Klappzustand aus', async () => {
    await mitGliederung(async (container) => {
      const gefunden = kopfzeilen(container);
      expect(gefunden.length, 'die zwei Gliederungsabschnitte des Modells').toBe(2);

      for (const [index, zeile] of gefunden.entries()) {
        expect(
          zeile.tabIndex,
          'jede Kopfzeile muss in der Tab-Reihenfolge liegen',
        ).toBe(0);
        const name = zeile.textContent ?? '';
        expect(
          name.includes(GLIEDERUNG[index === 0 ? 0 : 2].spans[0].text),
          `der Ueberschriftstext ist der Name der Zeile, gelesen: ${JSON.stringify(name)}`,
        ).toBe(true);
        // Zu Beginn ist nichts zugeklappt: `collapsedSections` startet leer.
        expect(
          zeile.getAttribute('aria-expanded'),
          'die Zeile muss ihren Klappzustand tragen',
        ).toBe('true');
      }
    });
  });

  it('waehlt per Enter GENAU DIESEN Absatz und klappt GENAU DIESEN Abschnitt um', async () => {
    await mitGliederung(async (container, aufzeichnung) => {
      expect(aufzeichnung.absaetze, 'vor der Taste darf nichts gewaehlt sein').toEqual([]);

      const zweite = kopfzeilen(container)[1];
      expect(zweite, 'fuer die Unterscheidung braucht es zwei Kopfzeilen').toBeDefined();

      await taste(zweite ?? null, 'Enter');

      expect(
        aufzeichnung.absaetze,
        'Enter auf der ZWEITEN Kopfzeile muss ihren Absatz waehlen',
      ).toEqual(['p-h2']);
      // DIE WIRKUNG IM DOM, nicht nur der Rueckruf: der Abschnitt ist zu.
      const nachher = kopfzeilen(container);
      expect(
        nachher[1]?.getAttribute('aria-expanded'),
        'der bediente Abschnitt muss zugeklappt sein',
      ).toBe('false');
      expect(
        nachher[0]?.getAttribute('aria-expanded'),
        'der andere Abschnitt darf nicht mit umklappen',
      ).toBe('true');
      expect(
        aufzeichnung.absaetze,
        'genau ein Rueckruf — die Zeile darf nicht doppelt ausloesen',
      ).toHaveLength(1);
    });
  });

  it('klappt per Leertaste um, faengt das Scrollen ab und bleibt bei fremden Tasten untatig', async () => {
    await mitGliederung(async (container, aufzeichnung) => {
      const erste = kopfzeilen(container)[0];
      expect(erste).toBeDefined();

      const fremdeTaste = await taste(erste ?? null, 'x');
      expect(aufzeichnung.absaetze, 'die Taste x darf nichts waehlen').toEqual([]);
      expect(fremdeTaste).toBe(false);
      expect(
        kopfzeilen(container)[0]?.getAttribute('aria-expanded'),
        'die Taste x darf nicht umklappen',
      ).toBe('true');

      const verhindert = await taste(erste ?? null, ' ');
      expect(verhindert, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(aufzeichnung.absaetze).toEqual(['p-h1']);
      expect(kopfzeilen(container)[0]?.getAttribute('aria-expanded')).toBe('false');
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-0052, Stelle 3: die Quellenzeile der Zitationsverwaltung.
//
// Die ZWEITE Quelle ist absichtlich die zweite und traegt einen anderen
// Verfasser: nur so ist "diese Zeile wurde gewaehlt" von "irgendeine Zeile wurde
// gewaehlt" zu trennen. Und die Wirkung wird nicht am Attribut allein gelesen,
// sondern an der Zitation, die danach eingefuegt wird.
// ---------------------------------------------------------------------------

const QUELLEN: WriterCitationSource[] = [
  { id: 'src-shannon', type: 'article', author: 'Shannon', title: 'A Mathematical Theory', year: '1948' },
  { id: 'src-turing', type: 'article', author: 'Turing', title: 'Computing Machinery', year: '1950' },
];

/**
 * Was der Test MISST, ist die eingefuegte Quelle. Der Schliessen-Rueckruf des
 * Dialogs wird nicht gemessen — also wird er auch nicht mitgezaehlt: ein
 * `readonly`-Zaehler, den niemand liest, war ein Typfehler ohne Aussage.
 */
interface Zitationsaufzeichnung {
  readonly eingefuegt: string[];
}

function optionen(container: HTMLElement): HTMLElement[] {
  const liste = container.querySelector<HTMLElement>('[role="listbox"]');
  expect(liste, 'die Quellenliste braucht role="listbox"').not.toBeNull();
  return Array.from(liste?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
}

async function mitZitationsverwaltung(
  pruefung: (container: HTMLElement, aufzeichnung: Zitationsaufzeichnung) => Promise<void>,
): Promise<void> {
  const aufzeichnung: Zitationsaufzeichnung = { eingefuegt: [] };
  await mitGrenDOM(
    () => (
      <WriterCitationModal
        isOpen
        onClose={() => undefined}
        sources={QUELLEN}
        onAddSource={() => undefined}
        onInsertCitation={(_text, sourceId) => {
          aufzeichnung.eingefuegt.push(sourceId);
        }}
        onGenerateBibliography={() => undefined}
      />
    ),
    async (container) => {
      await pruefung(container, aufzeichnung);
    },
  );
}

describe('GAP-0052 Stelle 3 — die Quellenzeile wirkt auf Tastendruck', () => {
  it('rendert die Quellen als Auswahlliste mit Tab-Position, Namen und Auswahlzustand', async () => {
    await mitZitationsverwaltung(async (container) => {
      const liste = container.querySelector<HTMLElement>('[role="listbox"]');
      expect(
        (liste?.getAttribute('aria-label') ?? '').length,
        'die Liste braucht einen zugaenglichen Namen',
      ).toBeGreaterThan(0);

      const gefunden = optionen(container);
      expect(gefunden.length, 'die zwei Quellen des Vorgabemodells').toBe(2);
      for (const [index, eintrag] of gefunden.entries()) {
        expect(
          eintrag.tabIndex,
          'jede Quellenzeile muss in der Tab-Reihenfolge liegen',
        ).toBe(0);
        expect(
          (eintrag.textContent ?? '').includes(QUELLEN[index].author),
          'der Verfasser ist der Name der Option',
        ).toBe(true);
      }
      expect(
        gefunden[0]?.getAttribute('aria-selected'),
        'die erste Quelle ist vorgewaehlt',
      ).toBe('true');
      expect(gefunden[1]?.getAttribute('aria-selected')).toBe('false');
    });
  });

  it('waehlt per Enter die zweite Quelle — und genau sie geht in die Zitation', async () => {
    await mitZitationsverwaltung(async (container, aufzeichnung) => {
      // DER AUSGANGSZUSTAND, BELEGT: die Schaltflaeche arbeitet und nimmt die
      // vorgewaehlte erste Quelle. Ohne diesen Beleg waere "danach die zweite"
      // nicht von "immer dieselbe" zu trennen.
      await klick(knopfMitText(container, 'Insert In-text Citation'));
      expect(
        aufzeichnung.eingefuegt,
        'ohne Tastendruck geht die vorgewaehlte Quelle in die Zitation',
      ).toEqual(['src-shannon']);

      const zweite = optionen(container)[1];
      expect(zweite, 'fuer die Unterscheidung braucht es zwei Quellen').toBeDefined();
      await taste(zweite ?? null, 'Enter');

      const nachher = optionen(container);
      expect(
        nachher[1]?.getAttribute('aria-selected'),
        'Enter muss die ZWEITE Quelle auswaehlen',
      ).toBe('true');
      expect(nachher[0]?.getAttribute('aria-selected')).toBe('false');

      await klick(knopfMitText(container, 'Insert In-text Citation'));
      expect(
        aufzeichnung.eingefuegt,
        'die per Taste gewaehlte Quelle muss die eingefuegte sein',
      ).toEqual(['src-shannon', 'src-turing']);
    });
  });

  it('waehlt per Leertaste, faengt das Scrollen ab und bleibt bei fremden Tasten untatig', async () => {
    await mitZitationsverwaltung(async (container) => {
      const zweite = optionen(container)[1];
      expect(zweite).toBeDefined();

      const fremdeTaste = await taste(zweite ?? null, 'x');
      expect(fremdeTaste).toBe(false);
      expect(
        optionen(container)[0]?.getAttribute('aria-selected'),
        'die Taste x darf die Auswahl nicht verschieben',
      ).toBe('true');

      const verhindert = await taste(zweite ?? null, ' ');
      expect(verhindert, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(optionen(container)[1]?.getAttribute('aria-selected')).toBe('true');
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-0052, Stelle 4: die Revisionszeile der Review-Leiste.
// ---------------------------------------------------------------------------

const REVISIONEN: WriterRevision[] = [
  {
    id: 'rev-1',
    paragraphId: 'p-eins',
    type: 'insert',
    author: 'Alice',
    authorColor: '#60a5fa',
    newText: 'Neuer Text eins',
    timestamp: 1,
    status: 'pending',
  },
  {
    id: 'rev-2',
    paragraphId: 'p-zwei',
    type: 'delete',
    author: 'Bob',
    authorColor: '#f97316',
    originalText: 'Alter Text zwei',
    timestamp: 2,
    status: 'pending',
  },
];

interface Reviewaufzeichnung {
  readonly spruenge: string[];
}

function revisionszeilen(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="button"]'));
}

async function mitReviewLeiste(
  pruefung: (container: HTMLElement, aufzeichnung: Reviewaufzeichnung) => Promise<void>,
): Promise<void> {
  const aufzeichnung: Reviewaufzeichnung = { spruenge: [] };
  await mitGrenDOM(
    () => (
      <WriterReviewPane
        isOpen
        onClose={() => undefined}
        revisions={REVISIONEN}
        reviewerFilter="all"
        onChangeReviewerFilter={() => undefined}
        revisionTypeFilter="all"
        onChangeRevisionTypeFilter={() => undefined}
        onAcceptRevision={() => undefined}
        onRejectRevision={() => undefined}
        onAcceptSelected={() => undefined}
        onRejectSelected={() => undefined}
        onAcceptAll={() => undefined}
        onRejectAll={() => undefined}
        onJumpToParagraph={(paragraphId) => {
          aufzeichnung.spruenge.push(paragraphId);
        }}
      />
    ),
    async (container) => {
      await pruefung(container, aufzeichnung);
    },
  );
}

describe('GAP-0052 Stelle 4 — die Revisionszeile wirkt auf Tastendruck', () => {
  it('weist jede Revisionszeile als Bedienelement mit Tab-Position und einem Namen aus', async () => {
    await mitReviewLeiste(async (container) => {
      const gefunden = revisionszeilen(container);
      expect(gefunden.length, 'die zwei Revisionen des Vorgabemodells').toBe(2);

      for (const [index, zeile] of gefunden.entries()) {
        expect(
          zeile.tabIndex,
          'jede Revisionszeile muss in der Tab-Reihenfolge liegen',
        ).toBe(0);
        expect(
          (zeile.textContent ?? '').includes(REVISIONEN[index].author),
          'der Verfasser ist Teil des Namens der Zeile',
        ).toBe(true);
      }
    });
  });

  it('springt per Enter auf den Absatz GENAU DIESER Revisionszeile', async () => {
    await mitReviewLeiste(async (container, aufzeichnung) => {
      expect(aufzeichnung.spruenge, 'vor der Taste darf nichts gesprungen sein').toEqual([]);

      const zweite = revisionszeilen(container)[1];
      expect(zweite, 'fuer die Unterscheidung braucht es zwei Revisionszeilen').toBeDefined();
      await taste(zweite ?? null, 'Enter');

      expect(
        aufzeichnung.spruenge,
        'Enter auf der ZWEITEN Revisionszeile muss auf ihren Absatz springen',
      ).toEqual(['p-zwei']);
    });
  });

  it('springt per Leertaste, faengt das Scrollen ab und bleibt bei fremden Tasten untatig', async () => {
    await mitReviewLeiste(async (container, aufzeichnung) => {
      const erste = revisionszeilen(container)[0];
      expect(erste).toBeDefined();

      const fremdeTaste = await taste(erste ?? null, 'x');
      expect(aufzeichnung.spruenge, 'die Taste x darf nichts ausloesen').toEqual([]);
      expect(fremdeTaste).toBe(false);

      const verhindert = await taste(erste ?? null, ' ');
      expect(verhindert, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(aufzeichnung.spruenge).toEqual(['p-eins']);
    });
  });

  it('laesst die Auswahlbox in der Zeile ihre eigene Taste behalten', async () => {
    await mitReviewLeiste(async (container, aufzeichnung) => {
      const auswahlbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(auswahlbox, 'die Revision ist offen, also traegt sie eine Auswahlbox').not.toBeNull();

      await taste(auswahlbox, 'Enter');
      expect(
        aufzeichnung.spruenge,
        'Enter auf der Auswahlbox darf nicht zusaetzlich zum Absatz springen',
      ).toEqual([]);

      // DER GEGENBEWEIS IM SELBEN TEST: ohne ihn waere die Zeile darueber auch
      // dann gruen, wenn die Zeile GAR KEINEN Tastaturweg hat — "die Auswahlbox
      // springt nicht" ist ohne die verdrahtete Zeile keine Aussage.
      const zweite = revisionszeilen(container)[1];
      await taste(zweite ?? null, 'Enter');
      expect(
        aufzeichnung.spruenge,
        'die Zeile selbst muss auf Enter springen',
      ).toEqual(['p-zwei']);
    });
  });
});
