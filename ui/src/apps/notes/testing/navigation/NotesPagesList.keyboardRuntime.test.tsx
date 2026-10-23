// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer M04-Z0887: echte Tastaturbedienung im Notizbaum.
//
// DER QUELLTEXTVERTRAG, DEN DIESE DATEI ERSETZT, IST GEMESSEN:
//   `ui/src/apps/notes/testing/editor/NotesEditor.entry.contract.test.mjs:52-60` ("AST-0651/AST-0654 tree
//   wiring") liest `navigation/NotesPagesList.tsx` als Text und behauptet:
//     expect(pagesList).toContain('onKeyDown={(event) => !page.trashedAt && handleRowKeyDown(event, page.id)}');
//   `ui/src/apps/notes/testing/navigation/notesPageTree.test.ts:46-80` prueft `resolveNoteTreeCommand` als
//   reine Funktion, und `ui/src/apps/notes/testing/navigation/NotesPagesList.render.test.tsx` prueft
//   `renderToStaticMarkup` — also eine Zeichenkette, kein laufendes DOM.
//
//   Damit war die zugesagte Wirkung — "per Baum navigieren" mit den Pfeiltasten — NICHT belegt:
//   1. der Vertrag beweist nur, dass die Zeichenkette `onKeyDown={...}` im Quelltext steht,
//   2. die reine Funktion beweist nur, dass sie RICHTIG antworten WUERDE,
//   3. niemand bewies, dass die Antwort das DOM erreicht (`itemRefs.current.get(...).focus()`).
//      Faellt `itemRefs.current.get(command.pageId)?.focus();` weg, bleibt JEDER der drei Nachweise gruen.
//
// DIESER Test rendert die Liste in happy-dom, setzt den Fokus wie ein Mensch (Tab bzw. `.focus()`),
// schickt echte `KeyboardEvent`s und liest `document.activeElement` — die Wirkung, nicht den Quelltext.

import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { NotePage, NoteSection } from '../../../../shared/contracts/workspace';
import { NotesPagesList } from '../../navigation/NotesPagesList';

const noop = (): void => undefined;
const formatTime = (): string => 'just now';

function page(id: string, title: string, parentPageId: string | null = null): NotePage {
  return { id, title, content: `${title} body`, tags: [], backlinks: [], last_modified: 1_700_000_000_000, parentPageId };
}

// Reihenfolge der Geschwister ist die sichtbare Reihenfolge: p1 (Wurzel), p2 (Kind von p1), p3 (Wurzel), p4 (Kind von p3).
const parent = page('p1', 'Parent');
const child = page('p2', 'Child', 'p1');
const sibling = page('p3', 'Sibling');
const nested = page('p4', 'Nested', 'p3');
const sectionPages = [parent, child, sibling, nested];
const activeSection: NoteSection = {
  id: 'sec', title: 'Evidence', createdAt: 1, updatedAt: 1, trashedAt: null, pages: sectionPages,
};

interface Harness {
  /** Die Baumzeilen in genau der Reihenfolge, in der sie im DOM stehen. */
  rows: () => HTMLElement[];
  /** Die Baumzeile einer Seite. Die Zeile traegt kein eigenes Datenmerkmal; der Elternwahlschalter
   *  `aria-label="Set subpage parent of <Titel>"` ist der einzige seitenfeste Anker im DOM, deshalb wird
   *  vom Schalter aus die umgebende `treeitem`-Zeile gesucht — ohne den Quelltext dafuer zu aendern. */
  rowFor: (pageId: string) => HTMLElement;
  /** Die Seite, auf der der Tastaturfokus gerade liegt — als Name, damit eine rote Pruefung lesbar ist. */
  aktiveSeite: () => string;
  /** Fokussiert eine Zeile wie ein Mensch und schickt ein echtes Tastenereignis darauf. */
  press: (pageId: string, init: KeyboardEventInit) => boolean;
  unmount: () => Promise<void>;
}

const TITEL: Record<string, string> = { p1: 'Parent', p2: 'Child', p3: 'Sibling', p4: 'Nested' };

/** Der Seitenname einer Baumzeile — dieselbe Herleitung wie `rowFor`, nur in der Gegenrichtung.
 *  Damit nennt eine fehlgeschlagene Fokuspruefung die Seite beim Namen statt `<div role="treeitem">`. */
function seiteVon(element: Element): string {
  const row = element.closest('[role="treeitem"]');
  const wahl = row?.querySelector<HTMLElement>('select[aria-label^="Set subpage parent of "]');
  const label = wahl?.getAttribute('aria-label') ?? '';
  const treffer = Object.entries(TITEL).find(([, titel]) => label === `Set subpage parent of ${titel}`);
  return treffer ? treffer[0] : `unbekannt (${label || 'ohne Elternwahlschalter'})`;
}

/**
 * Rendert die Liste, wartet einen Durchlauf ab (die Zeilen haengen ueber Ref-Callbacks in `itemRefs`)
 * und raeumt am Ende wieder auf. Der Fokus wird ueber `document.activeElement` gelesen, nicht geraten.
 */
async function mitListe(
  overrides: { activePageId?: string; onSelectPage?: (id: string) => void } = {},
  pruefung: (harness: Harness) => void | Promise<void>,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSelectPage: (id: string) => void = overrides.onSelectPage ?? noop;
  await act(async () => {
    root.render(
      <NotesPagesList
        activeSection={activeSection}
        activePageId={overrides.activePageId ?? 'p1'}
        filteredPages={sectionPages}
        searchQuery=""
        onSearchChange={noop}
        searchScope="section"
        onSearchScopeChange={noop}
        showArchived={false}
        onShowArchivedChange={noop}
        favoritesOnly={false}
        onFavoritesOnlyChange={noop}
        searchDateFrom=""
        onSearchDateFromChange={noop}
        searchDateTo=""
        onSearchDateToChange={noop}
        searchResultsByPageId={new Map()}
        savedSearches={[]}
        selectedSavedSearchId={null}
        onApplySavedSearch={noop}
        onSaveSearch={noop}
        onDeleteSavedSearch={noop}
        pageCollection="pages"
        onPageCollectionChange={noop}
        onSelectPage={onSelectPage}
        onCreatePage={noop}
        onCreateDailyNote={noop}
        onDeletePage={noop}
        onRestorePage={noop}
        onSetPageParent={() => null}
        customPageTemplates={[]}
        formatTime={formatTime}
      />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 40); });
  });
  const harness: Harness = {
    rows: () => Array.from(container.querySelectorAll<HTMLElement>('[role="treeitem"]')),
    rowFor: (pageId) => {
      const wahl = container.querySelector<HTMLElement>(`[aria-label="Set subpage parent of ${TITEL[pageId]}"]`);
      const row = wahl?.closest<HTMLElement>('[role="treeitem"]') ?? null;
      if (!row) throw new Error(`die Baumzeile ${pageId} wurde nicht gerendert`);
      return row;
    },
    aktiveSeite: () => {
      const aktiv = document.activeElement;
      if (!(aktiv instanceof HTMLElement)) return 'kein Element';
      return aktiv === document.body ? 'body' : seiteVon(aktiv);
    },
    press: (pageId, init) => {
      const dispatched = harness.rowFor(pageId).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
      // `dispatchEvent` liefert `false`, sobald ein Handler `preventDefault()` gerufen hat.
      return dispatched;
    },
    unmount: async () => {
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
  try {
    await pruefung(harness);
  } finally {
    await harness.unmount();
  }
}

describe('M04-Z0887 der Notizbaum ist mit der Tastatur bedienbar (happy-dom, echtes DOM)', () => {
  it('verschiebt den Tastaturfokus mit ArrowDown/ArrowUp wirklich auf die Nachbarzeile', async () => {
    await mitListe({}, (harness) => {
      const [first, second, third, fourth] = harness.rows();
      // Die sichtbare Reihenfolge des DOM ist die Reihenfolge der reinen Baumfunktion: p1, p2 (Kind), p3, p4 (Kind).
      expect(harness.rows().map(seiteVon)).toEqual(['p1', 'p2', 'p3', 'p4']);
      first.focus();
      expect(harness.aktiveSeite()).toBe('p1');

      harness.press('p1', { key: 'ArrowDown' });
      expect(harness.aktiveSeite(), 'ArrowDown muss den Fokus auf die naechste sichtbare Zeile legen').toBe('p2');
      expect(document.activeElement).toBe(second);

      harness.press('p2', { key: 'ArrowDown' });
      expect(harness.aktiveSeite(), 'ArrowDown muss auch ueber eine Kindzeile hinaus weiterlaufen').toBe('p3');
      expect(document.activeElement).toBe(third);

      harness.press('p3', { key: 'ArrowUp' });
      expect(harness.aktiveSeite()).toBe('p2');

      // An den Raendern wird nicht umgebrochen: der Fokus bleibt auf der Randzeile.
      harness.press('p1', { key: 'ArrowUp' });
      expect(harness.aktiveSeite(), 'die erste Zeile darf nicht ans Ende umbrechen').toBe('p1');
      expect(document.activeElement).toBe(first);
      harness.press('p4', { key: 'ArrowDown' });
      expect(harness.aktiveSeite(), 'die letzte Zeile darf nicht an den Anfang umbrechen').toBe('p4');
      expect(document.activeElement).toBe(fourth);
    });
  });

  it('springt mit Home/End auf die erste bzw. letzte sichtbare Zeile', async () => {
    await mitListe({}, (harness) => {
      const [first, , , fourth] = harness.rows();
      fourth.focus();
      expect(harness.aktiveSeite()).toBe('p4');
      harness.press('p4', { key: 'Home' });
      expect(harness.aktiveSeite(), 'Home muss auf die erste sichtbare Zeile springen').toBe('p1');
      expect(document.activeElement).toBe(first);
      harness.press('p1', { key: 'End' });
      expect(harness.aktiveSeite(), 'End muss auf die letzte sichtbare Zeile springen').toBe('p4');
      expect(document.activeElement).toBe(fourth);
    });
  });

  it('nimmt die Tastatur als echten Weg: die Baumtaste wird verbraucht, eine fremde Taste nicht', async () => {
    await mitListe({}, (harness) => {
      const [first] = harness.rows();
      first.focus();
      const baumtaste = harness.press('p1', { key: 'ArrowDown' });
      expect(baumtaste, 'ArrowDown im Baum muss preventDefault() rufen').toBe(false);
      const fremdeTaste = harness.press('p1', { key: 'x' });
      expect(fremdeTaste, 'eine taste ohne Baumbedeutung darf das Ereignis nicht schlucken').toBe(true);
      const modifikator = harness.press('p1', { key: 'ArrowDown', ctrlKey: true });
      expect(modifikator, 'ein Browser-Kurzbefehl darf nicht als Baumtaste gelten').toBe(true);
    });
  });

  it('oeffnet die fokussierte Seite mit Enter und mit Leertaste ueber den echten Rueckruf', async () => {
    const geoeffnet: string[] = [];
    await mitListe({ onSelectPage: (id) => { geoeffnet.push(id); } }, (harness) => {
      harness.press('p1', { key: 'Enter' });
      harness.press('p3', { key: ' ' });
      expect(geoeffnet, 'Enter und Space muessen die Seite oeffnen').toEqual(['p1', 'p3']);
    });
  });

  it('laesst den Fokus waehrend einer IME-Komposition in Ruhe', async () => {
    await mitListe({}, (harness) => {
      const [first] = harness.rows();
      first.focus();
      const composing = harness.press('p1', { key: 'ArrowDown', isComposing: true });
      expect(harness.aktiveSeite(), 'eine laufende Komposition darf den Fokus nicht wegziehen').toBe('p1');
      expect(composing, 'waehrend einer Komposition darf nichts geschluckt werden').toBe(true);
      harness.press('p1', { key: 'ArrowDown' });
      expect(harness.aktiveSeite()).toBe('p2');
    });
  });
});
