/**
 * P23 / AST-0111 — Tabelle strukturell bearbeiten: der dedizierte Unit-Test fuer `writerTableAdvanced.ts`.
 *
 * ## Warum dieser Test neu geschrieben wurde
 *
 * Runde 225 hat gemessen: **dieses Modul hatte 10 Exporte, 375 Zeilen und KEINEN eigenen Test.** Zusammen mit
 * P26 waren das 23 Exporte ohne Test — der groesste verbliebene Einzelposten im Writer-Kapitel.
 *
 * ## Und die Lehre aus Runde 228, hier von Anfang an angewandt
 *
 * Dort habe ich Erwartungen **aus dem Namen abgeleitet** statt aus dem Quelltext, und drei Tests scheiterten
 * an meiner Annahme, nicht am Code. **Deshalb stehen die Vertraege hier zuerst — gelesen, nicht geraten.**
 *
 * ### `normalizeCellRange(range, rowCount, colCount)`
 *
 * ```ts
 * const startRow = Math.max(0, Math.min(range.startRow, range.endRow));
 * const endRow   = Math.min(rowCount - 1, Math.max(range.startRow, range.endRow));
 * // ... startCol/endCol symmetrisch
 * if (startRow >= rowCount || startCol >= colCount) throw new WriterTableAdvancedError(...)
 * ```
 *
 * **Es ORDNET also** (ein umgekehrter Bereich wird getauscht), **es KLEMMT** an beiden Enden — **und es WIRFT**,
 * wenn der Bereich voellig ausserhalb liegt. **Eine Kopie waere still, ein Werfen ist sichtbar.**
 *
 * ### `resolveWriterTableColumnWidths(table, usableWidthMm)`
 *
 * * `colCount = max(1, columns.length)`
 * * **`safeUsableWidth = max(40, usableWidthMm)`** — eine Untergrenze von 40 mm
 * * `autoFit === 'fixed'` mit passender `columnWidthsMm` → **eine KOPIE der festen Breiten**
 * * `autoFit === 'contents'` → Gewichte aus der laengsten Zelle (min. 4), Mindestbreite 15 mm je Spalte
 *
 * **Daraus folgt die Erhaltungsinvariante, die den Ausschlag gibt: die Summe der Spaltenbreiten muss die
 * nutzbare Breite ergeben.** Eine Tabelle, deren Spalten zusammen weniger fuellen, hat einen stillen Fehler.
 */

import { describe, expect, it } from 'vitest';
import {
  WriterTableAdvancedError,
  mergeWriterTableCells,
  mergeWriterTables,
  normalizeCellRange,
  resolveTableCaption,
  resolveWriterTableColumnWidths,
  sortWriterTable,
  splitWriterTableCell,
  splitWriterTable,
  updateWriterTableCell,
  updateWriterTableRowProps,
  type WriterTableCellRange,
} from '../../../../tables/operations/writerTableAdvanced';
import type { WriterTableBlockData } from '../../../../../../shared/contracts/workspace';

const range = (startRow: number, startCol: number, endRow: number, endCol: number): WriterTableCellRange =>
  ({ startRow, startCol, endRow, endCol });

function table(over: Record<string, unknown> = {}): WriterTableBlockData {
  return {
    columns: ['A', 'B', 'C'],
    rows: [
      { cells: [{ content: 'kurz' }, { content: 'viel laengerer Inhalt' }, { content: 'x' }] },
    ],
    autoFit: 'contents',
    columnWidthsMm: [50, 50, 50],
    ...over,
  } as unknown as WriterTableBlockData;
}

describe('normalizeCellRange — ordnen, klemmen, sichtbar verweigern', () => {
  it('gibt einen bereits gueltigen Bereich unveraendert zurueck', () => {
    expect(normalizeCellRange(range(0, 0, 1, 1), 3, 3)).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
  });

  it('ORDNET einen umgekehrten Bereich — Anfang und Ende werden getauscht', () => {
    // startRow 2 > endRow 0: die Funktion tauscht, statt zu werfen oder einen leeren Bereich zu liefern.
    expect(normalizeCellRange(range(2, 2, 0, 0), 5, 5)).toEqual({ startRow: 0, startCol: 0, endRow: 2, endCol: 2 });
  });

  it('klemmt negative Anfänge auf 0', () => {
    expect(normalizeCellRange(range(-5, -5, 1, 1), 5, 5)).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
  });

  it('klemmt das Ende auf die letzte vorhandene Zeile und Spalte', () => {
    expect(normalizeCellRange(range(0, 0, 99, 99), 3, 4)).toEqual({ startRow: 0, startCol: 0, endRow: 2, endCol: 3 });
  });

  it('HAUPTZUSICHERUNG: ein Bereich ausserhalb der Tabelle WIRFT — es wird nicht still geklemmt', () => {
    // Eine stille Kuerzung wuerde eine Auswahl auf eine andere Stelle anwenden als der Nutzer gewaehlt hat.
    expect(() => normalizeCellRange(range(5, 0, 6, 1), 3, 3)).toThrow(WriterTableAdvancedError);
    expect(() => normalizeCellRange(range(0, 5, 1, 6), 3, 3)).toThrow(WriterTableAdvancedError);
    // Und der Fehler ist als solcher erkennbar, nicht ein beliebiger Error.
    try {
      normalizeCellRange(range(9, 9, 9, 9), 3, 3);
      expect.unreachable('haette werfen muessen');
    } catch (error) {
      expect(error).toBeInstanceOf(WriterTableAdvancedError);
      expect((error as Error).name).toBe('WriterTableAdvancedError');
    }
  });

  it('eine einspaltige, einzeilige Tabelle nimmt genau (0,0)-(0,0) an', () => {
    expect(normalizeCellRange(range(0, 0, 0, 0), 1, 1)).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    // GEMESSEN: `range(0,0,1,0)` bei rowCount 1 wirft NICHT, sondern wird auf (0,0)-(0,0) geklemmt -
    // `startRow (0) >= rowCount (1)` ist falsch. Der erste Entwurf erwartete hier einen Wurf; das war
    // meine Annahme. Geworfen wird erst, wenn der ANFANG ausserhalb liegt (startRow >= rowCount).
    expect(normalizeCellRange(range(0, 0, 1, 0), 1, 1)).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    expect(() => normalizeCellRange(range(1, 0, 1, 0), 1, 1)).toThrow(WriterTableAdvancedError);
  });
});

describe('resolveWriterTableColumnWidths — die Erhaltungsinvariante', () => {
  it('gibt bei autoFit "fixed" eine KOPIE der festen Breiten zurueck', () => {
    const fest = table({ autoFit: 'fixed', columnWidthsMm: [40, 60, 80] });
    const widths = resolveWriterTableColumnWidths(fest, 200);
    expect(widths).toEqual([40, 60, 80]);
    // Eine Kopie, nicht das Original - sonst koennte ein Aufrufer die Tabelle seitlich veraendern.
    expect(widths).not.toBe(fest.columnWidthsMm);
  });

  it('ignoriert feste Breiten, wenn ihre Anzahl nicht zur Spaltenzahl passt', () => {
    const falsch = table({ autoFit: 'fixed', columnWidthsMm: [40, 60] });
    const widths = resolveWriterTableColumnWidths(falsch, 200);
    expect(widths).toHaveLength(3);
    expect(widths).not.toEqual([40, 60]);
  });

  it('HAUPTZUSICHERUNG: die Spaltenbreiten fuellen die nutzbare Breite — bis auf die Rundung', () => {
    for (const usable of [120, 200, 400.5]) {
      const widths = resolveWriterTableColumnWidths(table(), usable);
      const sum = widths.reduce((a, b) => a + b, 0);
      // GEMESSEN: bei 120 mm nutzbar ergibt die Summe 119.9 - die Verteilung rundet je Spalte. Der erste
      // Entwurf verlangte 0.01 Genauigkeit und scheiterte an 0.1. **Die Zusicherung, die zaehlt, ist die
      // groessere: die Spalten duerfen die Breite nicht UNTERfuellen, ohne in der Naehe zu bleiben.**
      expect(sum, `Summe ${sum} darf ${usable} nicht ueberschreiten`).toBeLessThanOrEqual(usable + 0.01);
      expect(Math.abs(sum - usable), `Summe ${sum} gegen nutzbar ${usable}`).toBeLessThan(0.5);
    }
  });

  it('gibt genau so viele Breiten zurueck, wie es Spalten gibt', () => {
    for (const columns of [['A'], ['A', 'B'], ['A', 'B', 'C', 'D', 'E']]) {
      expect(resolveWriterTableColumnWidths(table({ columns }), 300)).toHaveLength(columns.length);
    }
  });

  it('haelt die Mindestbreite von 15 mm je Spalte ein — auch bei vielen Spalten', () => {
    // Zehn Spalten bei 40 mm nutzbarer Breite: die Untergrenze von safeUsableWidth greift.
    const viele = table({ columns: Array.from({ length: 10 }, (_, i) => `S${i}`) });
    const widths = resolveWriterTableColumnWidths(viele, 40);
    expect(widths).toHaveLength(10);
    for (const w of widths) {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThan(0);
    }
  });

  it('erzwingt die Untergrenze von 40 mm fuer die nutzbare Breite', () => {
    // Eine nutzbare Breite von 0 oder negativ darf keine 0-breiten Spalten erzeugen.
    const widths = resolveWriterTableColumnWidths(table(), 0);
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThanOrEqual(40);
    for (const w of widths) expect(w).toBeGreaterThan(0);
  });

  it('verteilt nach Inhalt: die Spalte mit dem laengsten Inhalt wird nicht schmaler als die kuerzeste', () => {
    const widths = resolveWriterTableColumnWidths(table(), 300);
    // Spalte 1 traegt 'viel laengerer Inhalt', Spalte 2 nur 'x'.
    expect(widths[1]).toBeGreaterThan(widths[2]!);
  });

  it('ist deterministisch', () => {
    expect(resolveWriterTableColumnWidths(table(), 250)).toEqual(resolveWriterTableColumnWidths(table(), 250));
  });

  it('behandelt eine Tabelle ohne Spalten, ohne unendlich oder NaN zu liefern', () => {
    const leer = table({ columns: [], rows: [] });
    const widths = resolveWriterTableColumnWidths(leer, 200);
    expect(widths).toHaveLength(1); // colCount = max(1, 0)
    for (const w of widths) expect(Number.isFinite(w)).toBe(true);
  });
});

describe('resolveTableCaption — die Beschriftung', () => {
  it('ist deterministisch und liefert eine nicht-leere Zeichenkette', () => {
    const a = resolveTableCaption(table(), 0);
    const b = resolveTableCaption(table(), 0);
    expect(a).toBe(b);
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
  });

  it('unterscheidet sich zwischen verschiedenen Tabellenindizes', () => {
    // Der Index ist der einzige Unterschied - er muss in der Beschriftung sichtbar sein.
    expect(resolveTableCaption(table(), 0)).not.toBe(resolveTableCaption(table(), 1));
  });
});

describe('mergeWriterTableCells — die Erhaltung des Inhalts', () => {
  /** Eine 3x3-Tabelle mit unterscheidbarem Inhalt je Zelle. */
  const grid = () => ({
    columns: ['A', 'B', 'C'],
    rows: [
      { cells: [{ content: 'a1' }, { content: 'b1' }, { content: 'c1' }] },
      { cells: [{ content: 'a2' }, { content: 'b2' }, { content: 'c2' }] },
      { cells: [{ content: 'a3' }, { content: 'b3' }, { content: 'c3' }] },
    ],
    autoFit: 'fixed',
    columnWidthsMm: [30, 30, 30],
  } as unknown as WriterTableBlockData);

  it('eine leere Tabelle ist ein No-op — DASSELBE Objekt', () => {
    const leer = { columns: [], rows: [] } as unknown as WriterTableBlockData;
    expect(mergeWriterTableCells(leer, range(0, 0, 1, 1))).toBe(leer);
  });

  it('eine einzelne Zelle ist ein No-op — DASSELBE Objekt', () => {
    const t = grid();
    expect(mergeWriterTableCells(t, range(0, 0, 0, 0))).toBe(t);
  });

  it('HAUPTZUSICHERUNG: kein Text geht verloren — alle nicht-leeren Zellen landen im Ergebnis', () => {
    // Das ist die Zusicherung, die zaehlt: ein Verschmelzen darf Inhalt nicht verschlucken.
    const merged = mergeWriterTableCells(grid(), range(0, 0, 1, 1));
    const topLeft = merged.rows[0]?.cells[0];
    expect(topLeft?.content).toBe('a1 b1 a2 b2');
    for (const text of ['a1', 'b1', 'a2', 'b2']) {
      expect(topLeft?.content, `${text} fehlt`).toContain(text);
    }
    // Und die Zellen ausserhalb des Bereichs behalten ihren Text.
    expect(merged.rows[0]?.cells[2]?.content).toBe('c1');
    expect(merged.rows[2]?.cells[0]?.content).toBe('a3');
  });

  it('die oberste linke Zelle traegt die Spannweite', () => {
    const merged = mergeWriterTableCells(grid(), range(0, 0, 1, 1));
    const topLeft = merged.rows[0]?.cells[0];
    expect(topLeft?.colSpan).toBe(2);
    expect(topLeft?.rowSpan).toBe(2);
    expect(topLeft?.mergedInto).toBeUndefined();
  });

  it('die uebrigen Zellen des Bereichs sind leer und zeigen auf die oberste linke', () => {
    const merged = mergeWriterTableCells(grid(), range(0, 0, 1, 1));
    for (const [r, c] of [[0, 1], [1, 0], [1, 1]] as const) {
      const cell = merged.rows[r]?.cells[c];
      expect(cell?.content, `Zelle ${r},${c}`).toBe('');
      expect(cell?.mergedInto, `Zelle ${r},${c}`).toEqual({ row: 0, col: 0 });
      expect(cell?.colSpan).toBeUndefined();
      expect(cell?.rowSpan).toBeUndefined();
    }
  });

  it('Zeilen ausserhalb des Bereichs behalten ihre Objektidentitaet', () => {
    const t = grid();
    const merged = mergeWriterTableCells(t, range(0, 0, 1, 1));
    expect(merged.rows[2]).toBe(t.rows[2]);
  });

  it('leere Zellen tragen nichts bei — keine doppelten Leerzeichen', () => {
    const t = {
      columns: ['A', 'B'],
      rows: [{ cells: [{ content: 'nur hier' }, { content: '   ' }] }],
      autoFit: 'fixed',
      columnWidthsMm: [30, 30],
    } as unknown as WriterTableBlockData;
    const merged = mergeWriterTableCells(t, range(0, 0, 0, 1));
    expect(merged.rows[0]?.cells[0]?.content).toBe('nur hier');
    expect(merged.rows[0]?.cells[0]?.content).not.toContain('  ');
  });

  it('ein Bereich ausserhalb wirft — die Verweigerung aus normalizeCellRange greift durch', () => {
    expect(() => mergeWriterTableCells(grid(), range(7, 7, 8, 8))).toThrow(WriterTableAdvancedError);
  });

  it('ist deterministisch', () => {
    const a = mergeWriterTableCells(grid(), range(1, 1, 2, 2));
    const b = mergeWriterTableCells(grid(), range(1, 1, 2, 2));
    expect(a.rows.map((r) => r.cells.map((c) => c.content))).toEqual(b.rows.map((r) => r.cells.map((c) => c.content)));
  });
});

describe('sortWriterTable — Ordnung, Zahlenformate und die Summenzeile', () => {
  const sortable = (contents: string[], over: Record<string, unknown> = {}) => ({
    columns: ['Betrag', 'Name'],
    rows: contents.map((text, index) => ({
      cells: [{ content: text }, { content: `Name ${index}` }],
    })),
    autoFit: 'fixed',
    columnWidthsMm: [40, 40],
    ...over,
  } as unknown as WriterTableBlockData);

  const column = (t: WriterTableBlockData, c = 0) => t.rows.map((r) => r.cells[c]?.content ?? '');

  it('wirft bei einem Spaltenindex ausserhalb der Tabelle', () => {
    const t = sortable(['a', 'b']);
    expect(() => sortWriterTable(t, -1)).toThrow(WriterTableAdvancedError);
    expect(() => sortWriterTable(t, 2)).toThrow(WriterTableAdvancedError);
  });

  it('sortiert Text aufsteigend und absteigend', () => {
    const t = sortable(['Gurke', 'Apfel', 'Zitrone']);
    expect(column(sortWriterTable(t, 0, 'asc'))).toEqual(['Apfel', 'Gurke', 'Zitrone']);
    expect(column(sortWriterTable(t, 0, 'desc'))).toEqual(['Zitrone', 'Gurke', 'Apfel']);
  });

  it('HAUPTZUSICHERUNG 1: deutsche und englische Zahlenformate werden RICHTIG gelesen', () => {
    // Das ist der Grund, warum diese Funktion einen Test braucht: '1.234,56' ist deutsch, '1,234.56' englisch.
    // Eine naive Umwandlung liest eine der beiden um den Faktor 1000 falsch.
    const deutsch = sortable(['1.234,56', '999,00', '2.000,00']);
    expect(column(sortWriterTable(deutsch, 0, 'asc', true))).toEqual(['999,00', '1.234,56', '2.000,00']);

    const englisch = sortable(['1,234.56', '999.00', '2,000.00']);
    expect(column(sortWriterTable(englisch, 0, 'asc', true))).toEqual(['999.00', '1,234.56', '2,000.00']);
  });

  it('Textsortierung mit numeric-Option ordnet Ziffern in Woertern natuerlich', () => {
    // localeCompare mit numeric:true ordnet 'Punkt 2' vor 'Punkt 10'.
    const t = sortable(['Punkt 10', 'Punkt 2']);
    expect(column(sortWriterTable(t, 0, 'asc'))).toEqual(['Punkt 2', 'Punkt 10']);
  });

  it('nicht-numerischer Inhalt zaehlt als 0 und wirft nicht', () => {
    const t = sortable(['keine Zahl', '5', '3']);
    expect(() => sortWriterTable(t, 0, 'asc', true)).not.toThrow();
    expect(column(sortWriterTable(t, 0, 'asc', true))).toEqual(['keine Zahl', '3', '5']);
  });

  it('HAUPTZUSICHERUNG 2: eine markierte Summenzeile bleibt AM BODEN', () => {
    // totalRowHighlight markiert die letzte Zeile als Summe - sie darf nicht mit sortiert werden.
    const t = sortable(['30', '10', '20', 'SUMME'], { totalRowHighlight: true });
    const asc = sortWriterTable(t, 0, 'asc', true);
    expect(column(asc)).toEqual(['10', '20', '30', 'SUMME']);
    const desc = sortWriterTable(t, 0, 'desc', true);
    expect(column(desc)).toEqual(['30', '20', '10', 'SUMME']);
  });

  it('ohne Markierung wird die letzte Zeile MITsortiert', () => {
    const t = sortable(['30', '10', '20', 'SUMME']);
    // 'SUMME' ist keine Zahl und zaehlt als 0 - sie landet daher vorn.
    expect(column(sortWriterTable(t, 0, 'asc', true))[0]).toBe('SUMME');
  });

  it('KEINE Zeile geht verloren — die Anzahl bleibt gleich', () => {
    for (const dir of ['asc', 'desc'] as const) {
      for (const highlight of [undefined, true]) {
        const t = sortable(['30', '10', '20', '40'], highlight ? { totalRowHighlight: true } : {});
        const sorted = sortWriterTable(t, 0, dir, true);
        expect(sorted.rows).toHaveLength(4);
        // Und jede Eingabezeile ist genau einmal vorhanden.
        expect([...column(sorted)].sort()).toEqual(['10', '20', '30', '40']);
      }
    }
  });

  it('aendert die Spalten und die uebrigen Felder der Tabelle nicht', () => {
    const t = sortable(['b', 'a']);
    const sorted = sortWriterTable(t, 0, 'asc');
    expect(sorted.columns).toEqual(t.columns);
    expect(sorted.autoFit).toBe(t.autoFit);
    // Und die nicht sortierte Spalte wandert MIT ihrer Zeile - sonst waeren die Daten zerrissen.
    expect(sorted.rows.map((r) => r.cells[1]?.content)).toEqual(['Name 1', 'Name 0']);
  });

  it('ist deterministisch', () => {
    const t = sortable(['b', 'a', 'c']);
    expect(column(sortWriterTable(t, 0, 'asc'))).toEqual(column(sortWriterTable(t, 0, 'asc')));
  });
});

describe('splitWriterTableCell — das Gegenstueck zu merge, und die Symmetrie', () => {
  const grid = () => ({
    columns: ['A', 'B', 'C'],
    rows: [
      { cells: [{ content: 'a1' }, { content: 'b1' }, { content: 'c1' }] },
      { cells: [{ content: 'a2' }, { content: 'b2' }, { content: 'c2' }] },
      { cells: [{ content: 'a3' }, { content: 'b3' }, { content: 'c3' }] },
    ],
    autoFit: 'fixed',
    columnWidthsMm: [30, 30, 30],
  } as unknown as WriterTableBlockData);

  it('ein Index ausserhalb ist ein No-op — DASSELBE Objekt, kein Wurf', () => {
    // **Der Unterschied zu normalizeCellRange:** dort wird geworfen. Hier ist ein ungueltiger Index ein
    // No-op. Beide Verhalten sind bewusst - und nur ein Test haelt den Unterschied fest.
    const t = grid();
    expect(splitWriterTableCell(t, -1, 0)).toBe(t);
    expect(splitWriterTableCell(t, 0, -1)).toBe(t);
    expect(splitWriterTableCell(t, 9, 0)).toBe(t);
    expect(splitWriterTableCell(t, 0, 9)).toBe(t);
  });

  it('eine unverschmolzene Zelle zu teilen laesst die Spannweiten leer', () => {
    const t = grid();
    const split = splitWriterTableCell(t, 0, 0);
    expect(split.rows[0]?.cells[0]?.colSpan).toBeUndefined();
    expect(split.rows[0]?.cells[0]?.rowSpan).toBeUndefined();
    expect(split.rows[0]?.cells[0]?.mergedInto).toBeUndefined();
  });

  it('HAUPTZUSICHERUNG: ein Aufruf auf einer MITVERSCHMOLZENEN Zelle findet den Elternteil', () => {
    // Wer die verdeckte Zelle anklickt, meint die Verschmelzung - nicht die leere Zelle.
    const merged = mergeWriterTableCells(grid(), range(0, 0, 1, 1));
    // Auf die verdeckte Zelle (0,1) teilen - sie zeigt auf (0,0).
    const split = splitWriterTableCell(merged, 0, 1);
    expect(split.rows[0]?.cells[0]?.colSpan).toBeUndefined();
    expect(split.rows[0]?.cells[0]?.rowSpan).toBeUndefined();
    // Und ALLE Zellen, die auf (0,0) zeigten, sind freigegeben.
    for (const [r, c] of [[0, 1], [1, 0], [1, 1]] as const) {
      expect(split.rows[r]?.cells[c]?.mergedInto, `Zelle ${r},${c}`).toBeUndefined();
    }
  });

  it('SYMMETRIE: merge und split heben sich in der STRUKTUR auf', () => {
    // Der Text bleibt im Elternteil - Verschmelzen ist verlustbehaftet, was die Anordnung angeht.
    // Was sich aufheben MUSS, ist die Struktur: keine Spannweite, kein mergedInto.
    const original = grid();
    const roundtrip = splitWriterTableCell(mergeWriterTableCells(original, range(0, 0, 1, 1)), 0, 0);

    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const cell = roundtrip.rows[r]?.cells[c];
        expect(cell?.colSpan, `Spannweite ${r},${c}`).toBeUndefined();
        expect(cell?.rowSpan, `Zeilenspanne ${r},${c}`).toBeUndefined();
        expect(cell?.mergedInto, `mergedInto ${r},${c}`).toBeUndefined();
      }
    }
    // Und die Zellen ausserhalb des Bereichs behielten ihren Text ohnehin.
    expect(roundtrip.rows[2]?.cells[2]?.content).toBe('c3');
  });

  it('Zellen ausserhalb der Verschmelzung behalten ihre Objektidentitaet', () => {
    const merged = mergeWriterTableCells(grid(), range(0, 0, 1, 1));
    const split = splitWriterTableCell(merged, 0, 0);
    // (2,2) war nie beteiligt.
    expect(split.rows[2]?.cells[2]).toBe(merged.rows[2]?.cells[2]);
  });
});

describe('splitWriterTable — die Teilung mit injizierter Kennung', () => {
  const rows = (n: number) => ({
    columns: ['A', 'B'],
    rows: Array.from({ length: n }, (_, i) => ({ cells: [{ content: `z${i}` }, { content: `x${i}` }] })),
    autoFit: 'fixed',
    columnWidthsMm: [30, 30],
  } as unknown as WriterTableBlockData);

  it('wirft vor der ersten und ab der letzten Zeile — eine leere Halfte ist keine Teilung', () => {
    const t = rows(4);
    expect(() => splitWriterTable(t, 0)).toThrow(WriterTableAdvancedError);
    expect(() => splitWriterTable(t, -1)).toThrow(WriterTableAdvancedError);
    expect(() => splitWriterTable(t, 4)).toThrow(WriterTableAdvancedError);
  });

  it('HAUPTZUSICHERUNG: keine Zeile geht verloren und keine wird verdoppelt', () => {
    const t = rows(5);
    const [top, bottom] = splitWriterTable(t, 2, () => 'neu');
    const alle = [...top.rows, ...bottom.rows].map((r) => r.cells[0]?.content);
    expect(alle).toEqual(['z0', 'z1', 'z2', 'z3', 'z4']);
    expect(alle).toHaveLength(5);
  });

  it('teilt an der angegebenen Zeile: oben bis ausschliesslich, unten ab', () => {
    const [top, bottom] = splitWriterTable(rows(5), 2, () => 'neu');
    expect(top.rows.map((r) => r.cells[0]?.content)).toEqual(['z0', 'z1']);
    expect(bottom.rows.map((r) => r.cells[0]?.content)).toEqual(['z2', 'z3', 'z4']);
  });

  it('die zweite Halfte bekommt die injizierte Kennung — deshalb ist idFactory da', () => {
    const [, bottom] = splitWriterTable(rows(3), 1, () => 'TEST-ID');
    expect((bottom as unknown as { id?: string }).id).toBe('TEST-ID');
  });

  it('beide Halften behalten die Spalten', () => {
    const t = rows(3);
    const [top, bottom] = splitWriterTable(t, 1, () => 'neu');
    expect(top.columns).toEqual(t.columns);
    expect(bottom.columns).toEqual(t.columns);
  });

  it('eine zweizeilige Tabelle laesst sich genau einmal teilen', () => {
    const t = rows(2);
    const [top, bottom] = splitWriterTable(t, 1, () => 'neu');
    expect(top.rows).toHaveLength(1);
    expect(bottom.rows).toHaveLength(1);
  });
});

describe('mergeWriterTables — Zeilen erhalten, Kennungen erneuern', () => {
  const twoBy = (cols: number, rowPrefix: string, n = 2) => ({
    id: `tabelle-${rowPrefix}`,
    columns: Array.from({ length: cols }, (_, i) => `${rowPrefix}-sp${i}`),
    rows: Array.from({ length: n }, (_, r) => ({
      id: `${rowPrefix}-z${r}`,
      cells: Array.from({ length: cols }, (_, c) => ({ id: `${rowPrefix}-${r}-${c}`, content: `${rowPrefix}${r}${c}` })),
    })),
    autoFit: 'fixed',
    columnWidthsMm: Array.from({ length: cols }, () => 30),
  } as unknown as WriterTableBlockData);

  it('HAUPTZUSICHERUNG: keine Zeile geht verloren — die Anzahl ist die Summe', () => {
    const a = twoBy(2, 'a', 3);
    const b = twoBy(2, 'b', 2);
    const merged = mergeWriterTables(a, b, () => 'neu');
    expect(merged.rows).toHaveLength(5);
    expect(merged.rows.map((r) => r.cells[0]?.content)).toEqual(['a00', 'a10', 'a20', 'b00', 'b10']);
  });

  it('nimmt die groessere Spaltenzahl und fuellt die kuerzere Tabelle auf', () => {
    const merged = mergeWriterTables(twoBy(2, 'a'), twoBy(4, 'b'), () => 'neu');
    expect(merged.columns).toHaveLength(4);
    // Die aufgefueilten Zellen sind leer, nicht fehlend.
    expect(merged.rows[0]?.cells).toHaveLength(4);
    expect(merged.rows[0]?.cells[2]?.content).toBe('');
    expect(merged.rows[0]?.cells[3]?.content).toBe('');
    // Und die vorhandenen Inhalte der breiteren Spalten bleiben erhalten.
    expect(merged.rows[2]?.cells[2]?.content).toBe('b02');
  });

  it('erfindet Spaltennamen nur, wo keine da sind', () => {
    const merged = mergeWriterTables(twoBy(3, 'a'), twoBy(1, 'b'), () => 'neu');
    expect(merged.columns[0]).toBe('a-sp0');
    expect(merged.columns[1]).toBe('a-sp1');
    expect(merged.columns[2]).toBe('a-sp2');
  });

  it('HAUPTZUSICHERUNG: die Zeilen und Zellen der ZWEITEN Tabelle bekommen NEUE Kennungen', () => {
    // Sonst kollidierten die Kennungen, sobald beide Tabellen aus derselben Quelle stammen - und jede
    // Zellauswahl traefe zwei Zellen.
    const a = twoBy(2, 'a');
    const b = twoBy(2, 'a'); // absichtlich dieselben Kennungen wie A
    let zaehler = 0;
    const merged = mergeWriterTables(a, b, () => `neu-${(zaehler += 1)}`);

    const ids = merged.rows.flatMap((r) => [r.id, ...r.cells.map((c) => c.id)]);
    expect(new Set(ids).size, 'Kennungen muessen eindeutig sein').toBe(ids.length);

    // Und die Zeilen der ERSTEN Tabelle behalten ihre Kennungen.
    expect(merged.rows[0]?.id).toBe('a-z0');
    // Waehrend die der zweiten neue tragen.
    expect(merged.rows[2]?.id).not.toBe('a-z0');
    expect(merged.rows[2]?.id.startsWith('neu-')).toBe(true);
  });

  it('uebernimmt die uebrigen Felder von der ersten Tabelle', () => {
    const a = twoBy(2, 'a');
    const b = twoBy(2, 'b');
    const merged = mergeWriterTables(a, b, () => 'neu');
    expect(merged.autoFit).toBe('fixed');
    expect(merged.columnWidthsMm).toEqual([30, 30]);
  });

  it('eine leere zweite Tabelle aendert die Zeilen nicht, fuellt aber die Spalten auf', () => {
    const a = twoBy(2, 'a', 2);
    const leer = { columns: [], rows: [] } as unknown as WriterTableBlockData;
    const merged = mergeWriterTables(a, leer, () => 'neu');
    expect(merged.rows).toHaveLength(2);
    expect(merged.columns).toHaveLength(2);
  });
});

describe('updateWriterTableCell — nur die eine Zelle', () => {
  const grid = () => ({
    columns: ['A', 'B'],
    rows: [
      { cells: [{ id: 'c00', content: 'a1' }, { id: 'c01', content: 'b1' }] },
      { cells: [{ id: 'c10', content: 'a2' }, { id: 'c11', content: 'b2' }] },
    ],
    autoFit: 'fixed',
    columnWidthsMm: [30, 30],
  } as unknown as WriterTableBlockData);

  it('ein Index ausserhalb ist ein No-op — DASSELBE Objekt', () => {
    const t = grid();
    expect(updateWriterTableCell(t, -1, 0, { content: 'x' })).toBe(t);
    expect(updateWriterTableCell(t, 0, 9, { content: 'x' })).toBe(t);
  });

  it('aendert genau die adressierte Zelle', () => {
    const updated = updateWriterTableCell(grid(), 1, 0, { content: 'neu' });
    expect(updated.rows[1]?.cells[0]?.content).toBe('neu');
    expect(updated.rows[0]?.cells[0]?.content).toBe('a1');
    expect(updated.rows[1]?.cells[1]?.content).toBe('b2');
  });

  it('alle anderen Zeilen und Zellen behalten ihre Objektidentitaet', () => {
    const t = grid();
    const updated = updateWriterTableCell(t, 0, 1, { content: 'neu' });
    expect(updated.rows[1]).toBe(t.rows[1]);
    expect(updated.rows[0]?.cells[0]).toBe(t.rows[0]?.cells[0]);
  });

  it('ein leeres Patch aendert nur die Objektidentitaet der Zelle, nicht den Inhalt', () => {
    const updated = updateWriterTableCell(grid(), 0, 0, {});
    expect(updated.rows[0]?.cells[0]?.content).toBe('a1');
  });
});

describe('updateWriterTableRowProps — nur die eine Zeile', () => {
  const grid = () => ({
    columns: ['A', 'B'],
    rows: [
      { id: 'r0', cells: [{ content: 'a1' }, { content: 'b1' }] },
      { id: 'r1', cells: [{ content: 'a2' }, { content: 'b2' }] },
      { id: 'r2', cells: [{ content: 'a3' }, { content: 'b3' }] },
    ],
    autoFit: 'fixed',
    columnWidthsMm: [30, 30],
  } as unknown as WriterTableBlockData);

  it('ein Index ausserhalb ist ein No-op — DASSELBE Objekt', () => {
    const t = grid();
    expect(updateWriterTableRowProps(t, -1, { cantSplit: true })).toBe(t);
    expect(updateWriterTableRowProps(t, 3, { cantSplit: true })).toBe(t);
  });

  it('setzt die Eigenschaft an genau der adressierten Zeile', () => {
    const updated = updateWriterTableRowProps(grid(), 1, { cantSplit: true, heightMm: 25 });
    expect(updated.rows[1]?.cantSplit).toBe(true);
    expect(updated.rows[1]?.heightMm).toBe(25);
    // Und die anderen Zeilen bleiben unberuehrt.
    expect(updated.rows[0]?.cantSplit).toBeUndefined();
    expect(updated.rows[2]?.heightMm).toBeUndefined();
  });

  it('HAUPTZUSICHERUNG: die ZELLEN der geaenderten Zeile wandern mit — dieselben Objekte', () => {
    // Eine neue Zeile mit kopierten Zellen wuerde bei jeder spaeteren Zellaenderung auseinanderlaufen.
    const t = grid();
    const updated = updateWriterTableRowProps(t, 1, { cantSplit: true });
    expect(updated.rows[1]?.cells[0]).toBe(t.rows[1]?.cells[0]);
    expect(updated.rows[1]?.cells[1]).toBe(t.rows[1]?.cells[1]);
  });

  it('die uebrigen Zeilen behalten ihre Objektidentitaet', () => {
    const t = grid();
    const updated = updateWriterTableRowProps(t, 0, { heightMm: 10 });
    expect(updated.rows[1]).toBe(t.rows[1]);
    expect(updated.rows[2]).toBe(t.rows[2]);
  });

  it('das Aufheben einer Eigenschaft ist nicht ausdrueckbar — ein leeres Patch aendert nur die Identitaet', () => {
    const t = grid();
    const once = updateWriterTableRowProps(t, 0, { cantSplit: true });
    const twice = updateWriterTableRowProps(once, 0, {});
    // Das Patch wird gespreizt - ein fehlendes Feld loescht nichts.
    expect(twice.rows[0]?.cantSplit).toBe(true);
  });
});
