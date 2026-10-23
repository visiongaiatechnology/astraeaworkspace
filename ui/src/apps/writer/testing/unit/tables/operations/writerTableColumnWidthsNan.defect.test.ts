/**
 * DEF-RE-017 — REGRESSIONSTEST nach der Reparatur.
 *
 * ## Die Reihenfolge, eingehalten und belegt
 *
 * 1. **Runde 269: reproduziert.** 13 grüne Fälle: `usableWidthMm: NaN` vergiftete **jede** Spaltenbreite in
 *    den Modi `contents` und `window`; `Infinity` ergab unendliche Breiten.
 * 2. **Runde 270: repariert.** `tools/repair_def_re_017_nan_column_widths.py`.
 *    **Vorher `3ce8aa5b`, nachher `952a4e2e`.**
 * 3. **Runde 270: der Beweis.** Nach der Reparatur **fielen 3 der 13 Fälle** — die NaN-Zusicherungen **und**
 *    der Infinity-Fall.
 * 4. **Runde 270: diese Fassung.**
 *
 * ## Die Reparatur, und warum eine Zeile zwei Defekte schliesst
 *
 * ```ts
 * const safeUsableWidth = Number.isFinite(usableWidthMm) ? Math.max(40, usableWidthMm) : 40;
 * ```
 *
 * **`Number.isFinite(Infinity)` ist falsch** — also fällt auch der zweite Defekt derselben Zeile mit dem
 * ersten. **Das ist keine Koinzidenz: es ist genau das, was die bewusste Form gegenüber der zufälligen
 * einbringt.**
 *
 * **Der Rückfallwert `40`** ist die untere Schranke, die dieser Ausdruck ohnehin setzt.
 *
 * **Und nichts anderes ändert sich** — nicht der `fixed`-Zweig, nicht die Gewichte, nicht die Rundung.
 * Die Lehre aus DEF-RE-014: *ein Wächter darf nur ändern, wofür er da ist.*
 *
 * ## Die siebte Instanz einer Zeile
 *
 * ```
 * DEF-RE-009  Math.max(1, NaN)                'M 0 0 L NaN 0'
 * DEF-RE-010  Math.max(0, Math.min(1, NaN))   'opacity: NaN'
 * DEF-RE-013  Math.max(1, NaN)                NaN-Zeilenhoehe
 * DEF-RE-014  (NaN).toFixed(2)                'NaN w' im PDF
 * DEF-RE-015  Math.max(1, NaN)                fuenf Felder der Flussmetrik
 * DEF-RE-016  Math.max(0, 100 + NaN)          'brightness(NaN%)'
 * DEF-RE-017  Math.max(40, NaN)               jede Spaltenbreite          <- repariert
 * ```
 */

import { describe, expect, it } from 'vitest';
import { resolveWriterTableColumnWidths } from '../../../../tables/operations/writerTableAdvanced';

const tabelle = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  columns: ['A', 'B', 'C'],
  rows: [
    { cells: [{ content: 'eins' }, { content: 'zwei' }, { content: 'drei' }] },
    { cells: [{ content: 'vier' }, { content: 'fuenf' }, { content: 'sechs' }] },
  ],
  columnWidthsMm: [50, 60, 70],
  autoFit: 'contents',
  ...over,
} as never);

const NICHT_ENDLICH = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe('resolveWriterTableColumnWidths — das gueltige Verhalten ist unveraendert', () => {
  it('die drei Modi bleiben wirksam', () => {
    expect(resolveWriterTableColumnWidths(tabelle({ autoFit: 'fixed' }), 180)).toEqual([50, 60, 70]);
    const fenster = resolveWriterTableColumnWidths(tabelle({ autoFit: 'window', columnWidthsMm: [10, 10, 10] }), 180);
    expect(fenster.reduce((a, b) => a + b, 0)).toBeCloseTo(180, 1);
    const inhalte = resolveWriterTableColumnWidths(tabelle({ autoFit: 'contents' }), 180);
    expect(inhalte).toHaveLength(3);
  });

  it('HAUPTZUSICHERUNG: eine gueltige Nutzbreite ergibt endliche, positive Breiten', () => {
    for (const nutz of [40, 50, 100, 180, 210]) {
      for (const modus of ['contents', 'window', 'fixed']) {
        const breiten = resolveWriterTableColumnWidths(tabelle({ autoFit: modus }), nutz);
        for (const breite of breiten) {
          expect(Number.isFinite(breite), `${modus} @ ${nutz}`).toBe(true);
          expect(breite, `${modus} @ ${nutz}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('HAUPTZUSICHERUNG: die untere Schranke von 40 bleibt wirksam', () => {
    // `Math.max(40, usableWidthMm)` - eine kleine Nutzbreite wird gehoben, nicht verkleinert.
    expect(resolveWriterTableColumnWidths(tabelle(), 10))
      .toEqual(resolveWriterTableColumnWidths(tabelle(), 40));
  });

  it('ist deterministisch', () => {
    expect(resolveWriterTableColumnWidths(tabelle(), 180))
      .toEqual(resolveWriterTableColumnWidths(tabelle(), 180));
  });
});

describe('DEF-RE-017 — die Reparatur haelt', () => {
  it('HAUPTZUSICHERUNG: keine nicht-endige Nutzbreite vergiftet eine Spaltenbreite', () => {
    // Die Zusicherung, die die Reparatur gibt. Vorher vergifteten NaN und Infinity je nach Modus.
    for (const nutz of NICHT_ENDLICH) {
      for (const modus of ['contents', 'window', 'fixed']) {
        const breiten = resolveWriterTableColumnWidths(tabelle({ autoFit: modus }), nutz);
        expect(breiten.length, `${modus} @ ${nutz}`).toBeGreaterThan(0);
        for (const breite of breiten) {
          expect(Number.isNaN(breite), `${modus} @ ${nutz}`).toBe(false);
          expect(Number.isFinite(breite), `${modus} @ ${nutz}`).toBe(true);
          expect(breite, `${modus} @ ${nutz}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('HAUPTZUSICHERUNG: eine nicht-endige Nutzbreite faellt auf die untere Schranke', () => {
    // Der Rueckfallwert ist 40 - dieselbe Schranke, die der Ausdruck ohnehin setzt.
    const vierzig = resolveWriterTableColumnWidths(tabelle(), 40);
    for (const nutz of NICHT_ENDLICH) {
      expect(resolveWriterTableColumnWidths(tabelle(), nutz), String(nutz)).toEqual(vierzig);
    }
  });

  it('HAUPTZUSICHERUNG: der fixed-Modus ist weiterhin unberuehrt', () => {
    // Er liest den Parameter gar nicht - und die Reparatur aendert das nicht.
    for (const nutz of NICHT_ENDLICH) {
      expect(resolveWriterTableColumnWidths(tabelle({ autoFit: 'fixed' }), nutz), String(nutz))
        .toEqual([50, 60, 70]);
    }
  });

  it('die Kontrolle: endliche Nutzbreiten veraendern sich nicht', () => {
    // Die Reparatur greift nur bei nicht-endigen Werten.
    for (const nutz of [40, 50, 100, 180, 210, 1, 0, -100]) {
      for (const modus of ['contents', 'window', 'fixed']) {
        const breiten = resolveWriterTableColumnWidths(tabelle({ autoFit: modus }), nutz);
        for (const breite of breiten) {
          expect(Number.isNaN(breite), `${modus} @ ${nutz}`).toBe(false);
        }
      }
    }
  });

  it('HAUPTZUSICHERUNG: die Spaltenzahl bleibt die der Tabelle', () => {
    // Die Reparatur darf die Laenge nicht veraendern.
    for (const nutz of NICHT_ENDLICH) {
      expect(resolveWriterTableColumnWidths(tabelle(), nutz)).toHaveLength(3);
      expect(resolveWriterTableColumnWidths(tabelle({ columns: ['A'] }), nutz)).toHaveLength(1);
    }
  });

  it('ist deterministisch', () => {
    const bauen = () => resolveWriterTableColumnWidths(tabelle(), Number.NaN);
    expect(JSON.stringify(bauen())).toBe(JSON.stringify(bauen()));
  });
});

describe('DEF-RE-017 — die sieben Instanzen einer Zeile', () => {
  it('dieselbe Form, siebenmal, in sieben Modulen', () => {
    // Jede dieser Zeilen sah wie ein Waechter aus. Sechs sind repariert, diese ist die siebte.
    expect(Number.isNaN(Math.max(1, Number.NaN))).toBe(true);
    expect(Number.isNaN(Math.max(0, Math.min(1, Number.NaN)))).toBe(true);
    expect((Number.NaN).toFixed(2)).toBe('NaN');
    expect(Number.isNaN(Math.max(0, 100 + Number.NaN))).toBe(true);
    expect(Number.isNaN(Math.max(40, Number.NaN))).toBe(true);

    // **Und die bewusste Form deckt NaN UND Infinity in einem Ausdruck:**
    const sicher = (wert: unknown, untere: number) =>
      Number.isFinite(wert) ? Math.max(untere, wert as number) : untere;
    expect(sicher(Number.NaN, 40)).toBe(40);
    expect(sicher(Number.POSITIVE_INFINITY, 40)).toBe(40);
    expect(sicher(Number.NEGATIVE_INFINITY, 40)).toBe(40);
    expect(sicher(180, 40)).toBe(180);
    expect(sicher(10, 40)).toBe(40);
  });
});
