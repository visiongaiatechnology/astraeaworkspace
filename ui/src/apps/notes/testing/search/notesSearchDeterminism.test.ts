// STATUS: PLATIN — Notes · W-429/W-369: der Rang liest den Zeitgeber **einmal**, nicht je Seite
//
// ## Der Defekt, den diese Datei festhält
//
// `search/notesSearchEngine.ts` berechnete den Aktualitätsanteil des Rangs mit `Date.now()` **innerhalb** der
// Seitenschleife (`scorePage`). *Der Rang zweier inhaltlich gleicher Seiten hing damit davon ab, wie viele
// Millisekunden zwischen ihrem Besuch lagen* ✗ — und kein Aufrufer konnte eine Reihenfolge reproduzieren, weil
// es keinen Eingang dafür gab. Register: W-429 (Notes) und W-369 (dieselbe Sache, ältere Zeile).
//
// ## Warum hier eine **Uhr mit tickendem Zeiger** benutzt wird
//
// Eine Uhr, die bei jedem Lesen weiterspringt, ist die **positivste** Form des Zeugen: *sie macht aus „zwei
// Läufe können sich unterscheiden" ein messbares „dieser Aufruf liest die Uhr N-mal".* Mit einer festen Uhr
// wäre derselbe Fehler unsichtbar geblieben.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteNotebook, NotePage } from '../../../../shared/contracts/workspace';
import { searchNotesDetailed } from '../../search/notesSearchEngine';

const DAY = 86_400_000;
/** Der Zeiger springt bei **jedem** Lesen um 40 Tage — groß genug, um eine Rangfolge wirklich umzudrehen. */
const TICK = 40 * DAY;

function page(id: string, title: string, content: string, lastModified: number): NotePage {
  return { id, title, content, tags: [], backlinks: [], last_modified: lastModified };
}

/**
 * Zwei Seiten mit **gleichem** Inhalt und **gleichem** Gewicht; nur die Änderungszeit unterscheidet sie.
 * `page-fresh` ist 1 ms neuer als `page-stale` — *der Unterschied ist absichtlich winzig, damit nur die
 * Aktualität zählt.*
 */
function twoPages(base: number): NoteNotebook {
  return {
    id: 'nb-clock',
    title: 'Uhr',
    sections: [
      {
        id: 'sec-clock',
        title: 'S',
        pages: [
          page('page-stale', 'Uhr', 'gemeinsamer text', base - 2_000),
          page('page-fresh', 'Uhr', 'gemeinsamer text', base - 1_000),
        ],
      },
    ],
  };
}

/** Eine tickende Uhr: jeder Lesezugriff liefert einen um 40 Tage höheren Wert. */
function tickingClock(start = 1_000_000_000_000) {
  let ticks = 0;
  return vi.spyOn(Date, 'now').mockImplementation(() => start + (ticks += 1) * TICK);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('W-429/W-369 — der Zeitgeber wird **einmal** gelesen', () => {
  it('ein Aufruf liest `Date.now` genau **einmal** (vorher: einmal je Seite)', () => {
    const spy = tickingClock();
    searchNotesDetailed([twoPages(1_000_000_000_000)], { query: 'gemeinsamer', scope: 'all' });
    // Der Kern: **nicht** `1 + Seitenzahl`, sondern **1**. Ein tickender Zeiger kann so keinen Rang mehr drehen.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('die **neuere** Seite steht vorn — auch wenn die Uhr zwischen den Seiten springt', () => {
    tickingClock();
    const results = searchNotesDetailed([twoPages(1_000_000_000_000)], { query: 'gemeinsamer', scope: 'all' });
    expect(results.map((result) => result.page.id)).toEqual(['page-fresh', 'page-stale']);
  });

  it('der Bezugszeitpunkt ist ein **Eingang**: mit festem `now` ist die Reihenfolge reproduzierbar', () => {
    const notebooks = [twoPages(1_000_000_000_000)];
    const now = 1_000_000_000_000;
    const first = searchNotesDetailed(notebooks, { query: 'gemeinsamer', scope: 'all', now });
    // **Hundert** Wiederholungen — dieselbe Eingabe, dieselbe Ausgabe. Vorher war das nicht zusicherbar.
    for (let run = 0; run < 100; run += 1) {
      const again = searchNotesDetailed(notebooks, { query: 'gemeinsamer', scope: 'all', now });
      expect(again.map((result) => result.page.id), `Lauf ${run}`).toEqual(first.map((result) => result.page.id));
      expect(again.map((result) => result.score), `Lauf ${run}`).toEqual(first.map((result) => result.score));
    }
  });

  it('und ein **festes** `now` liest die Uhr überhaupt nicht mehr', () => {
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Die Uhr durfte hier nicht gelesen werden.'); });
    const results = searchNotesDetailed([twoPages(1_000_000_000_000)], { query: 'gemeinsamer', scope: 'all', now: 1_000_000_000_000 });
    expect(results).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('W-429/W-369 — die Aktualität bleibt eine echte Eigenschaft (kein stillgelegtes Merkmal)', () => {
  it('bei **gleichem** `now` gewinnt weiterhin die neuere Notiz', () => {
    const base = 1_000_000_000_000;
    const results = searchNotesDetailed([twoPages(base)], { query: 'gemeinsamer', scope: 'all', now: base });
    expect(results[0]?.page.id).toBe('page-fresh');
    // Und der Abstand ist **winzig**, aber vorhanden — das Merkmal ist nicht abgeschaltet, nur eindeutig.
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    expect(results[0]!.score - results[1]!.score).toBeLessThan(0.001);
  });

  it('eine **alte** Notiz verliert gegen eine neue, wenn beide sonst gleich sind', () => {
    const now = 1_000_000_000_000;
    const notebooks: NoteNotebook = {
      id: 'nb-alt',
      title: 'Alt',
      sections: [{
        id: 'sec', title: 'S',
        pages: [
          page('page-old', 'Uhr', 'gemeinsamer text', now - 400 * DAY),
          page('page-new', 'Uhr', 'gemeinsamer text', now - 1 * DAY),
        ],
      }],
    };
    const results = searchNotesDetailed([notebooks], { query: 'gemeinsamer', scope: 'all', now });
    expect(results.map((result) => result.page.id)).toEqual(['page-new', 'page-old']);
    // Die 400 Tage alte Seite bekommt den Aktualitätsanteil gar nicht mehr (er ist auf 4 begrenzt und fällt auf 0).
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });
});
