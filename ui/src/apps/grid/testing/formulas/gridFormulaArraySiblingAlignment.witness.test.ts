// STATUS: PLATIN — ZEUGE fuer die Entscheidung `DECISION_FLAT_VECTOR_IN_SCALAR_POSITION.md`,
// Stelle 2 von 3: `toFormulaArray`.
//
// **Was hier bezeugt wird.** Die Entscheidung sagt woertlich:
//
//     `toFormulaArray` — richtet sich nach `normalizeToArray2D`, weil dieses Geschwister
//     die Frage fuer dieselbe Eingabe schon beantwortet. NICHT `[[vector]]`. Damit
//     verschwindet der Widerspruch, statt dass eine der beiden Antworten gewinnt.
//
// **Der gemessene Widerspruch.** Fuer dieselbe Eingabe, einen flachen Vektor:
//
//     normalizeToArray2D([100,200,300])  ==>  [[100],[200],[300]]   (drei Zeilen)
//     toFormulaArray([100,200,300])      ==>  [[[100,200,300]]]     (eine Zeile, ein Vektor darin)
//
// Zwei exportierte Funktionen, eine Frage, zwei Antworten. Die Entscheidung nennt das die
// **sechste** Instanz des Musters *„eine zweite Regel fuer dieselbe Sache"*. Der Zeuge
// vergleicht die beiden deshalb **direkt** — ein Widerspruch ist nur messbar, wenn beide
// Seiten in derselben Zusicherung stehen.
//
// **Warum das ein `FormulaValue` ist, obwohl der Typ es verneint.** `FormulaArray` ist
// `SingleFormulaValue[][]`, also zweidimensional, und `FormulaValue` enthaelt deshalb keinen
// flachen Vektor. Er entsteht zur Laufzeit. Deshalb geht der Zeuge ueber `JSON.parse`:
// kein `as unknown as`, kein `as any`, und es ist der reale Weg.
//
// **Warum ZWEI Richtungen.** `it.fails` allein waere falsch: es besteht, solange die
// Zusicherung versagt, also auch bei einer falschen Reparatur. Der Zeuge trennt deshalb:
//
//   `A` ist jetzt rot und dokumentiert den Ist-Zustand. `GAP-0012` bleibt offen, bis `A`
//       ohne `it.fails` besteht.
//   `B` ist jetzt gruen und prueft, dass die ANGLEICHUNG an das Geschwister das Ziel ist —
//       nicht eine dritte eigene Antwort.
//
// **Die drei Stellen dieses Zeugen.**
//   1. `toFormulaArray` und `normalizeToArray2D` stimmen bei einem flachen Vektor ueberein.
//   2. Fuer einen echten 2D-Array stimmen sie weiterhin ueberein (Gegenprobe).
//   3. Fuer einen Skalar stimmen sie weiterhin ueberein (Gegenprobe).

import { describe, it, expect } from 'vitest';
import { toFormulaArray, type FormulaValue } from '../../formulas/gridFormulaTypes';
import { normalizeToArray2D } from '../../formulas/gridFormulaArrayUtils';

/** Ein flacher Vektor, wie er zur Laufzeit ankommt: kein `FormulaValue`, aber ein Wert. */
function flacherVektor(...werte: number[]): ReturnType<typeof JSON.parse> {
  return JSON.parse(`[${werte.join(',')}]`);
}

describe('ZEUGE GAP-0012 — Stelle 2: toFormulaArray richtet sich nach normalizeToArray2D', () => {
  it('A: die zwei Geschwister stimmen jetzt ueberein — die Entscheidung ist umgesetzt', () => {
    // Die Entscheidung: `toFormulaArray` folgt `normalizeToArray2D`.
    // Heute liefert `toFormulaArray` `[[vector]]`, das Geschwister `[[v],[v],[v]]`.
    // Diese Zusicherung ist deshalb JETZT rot.
    const v = flacherVektor(100, 200, 300);
    expect(toFormulaArray(v)).toEqual(normalizeToArray2D(v));
  });

  it('A: und das Ziel ist genau ein Element pro Zeile, nicht eine dritte Antwort', () => {
    const v = flacherVektor(100, 200, 300);
    expect(toFormulaArray(v)).toEqual([[100], [200], [300]]);
  });

  it('B: der flache Vektor erscheint NICHT als ein einzelner Zellwert', () => {
    // **Warum dieses `B` ebenfalls `it.fails` ist, und warum das hier richtig ist.**
    //
    // Beim ersten Zeugen (`toSingleValue`) war der Ist-Zustand `return val` — die
    // Identitaet. Das ist NICHT die verbotene stille Reduktion (`val[0]`), sondern eine
    // offene Frage. Dort war `B` deshalb ein echter Waechter gegen die Zukunft: es war
    // gruen, weil die verbotene Form fehlte, und es waere rot geworden, sobald jemand
    // sie einbaut.
    //
    // Hier ist es anders. Die Entscheidung verbietet `[[vector]]` **ausdruecklich**, und
    // `toFormulaArray` liefert heute genau das. Der Ist-Zustand IST die verbotene Form.
    // Ein `B` ohne `it.fails` waere also keine zweite Richtung, sondern dieselbe Aussage
    // wie `A` — und es wuerde nur die Suite rot machen, ohne etwas hinzuzufuegen.
    //
    // `B` bleibt trotzdem stehen, weil es die verbotene Form **benennt** statt nur die
    // fehlende Uebereinstimmung: `A` sagt „die Geschwister widersprechen sich", `B` sagt
    // „der ganze Vektor steckt in einer Zelle". Sobald jemand `normalizeToArray2D` folgt,
    // bestehen beide — und beide `it.fails` melden das laut.
    const v = flacherVektor(100, 200, 300);
    const alsArray = toFormulaArray(v);
    const ersteZeile = alsArray[0];
    expect(Array.isArray(ersteZeile)).toBe(true);
    // Genau das ist die verbotene Form: eine Zeile, deren erstes Element ein Array ist.
    const stecktImZellwert = Array.isArray(ersteZeile[0]);
    expect(stecktImZellwert).toBe(false);
  });

  it('B: die Zeilenzahl eines flachen Vektors ist seine Elementzahl', () => {
    // Vier Elemente muessen vier Zeilen ergeben. Heute ergibt es eine.
    // Dieselbe Begruendung wie oben: der Ist-Zustand ist die verbotene Form.
    const v = flacherVektor(1, 2, 3, 4);
    expect(toFormulaArray(v).length).toBe(4);
  });

  it('C: GEGENPROBE — ein echter 2D-Array bleibt bei beiden unveraendert', () => {
    const echt = [[1, 2], [3, 4]];
    expect(toFormulaArray(echt)).toEqual([[1, 2], [3, 4]]);
    expect(normalizeToArray2D(echt)).toEqual([[1, 2], [3, 4]]);
    expect(toFormulaArray(echt)).toEqual(normalizeToArray2D(echt));
  });

  it('C: GEGENPROBE — ein Skalar wird bei beiden zu einer 1x1-Matrix', () => {
    expect(toFormulaArray(42)).toEqual([[42]]);
    expect(normalizeToArray2D(42)).toEqual([[42]]);
    expect(toFormulaArray(42)).toEqual(normalizeToArray2D(42));
    expect(toFormulaArray('text')).toEqual(normalizeToArray2D('text'));
  });

  it('C: GEGENPROBE — die Geschwister stimmen heute bei ALLEM ueberein, ausser beim flachen Vektor', () => {
    // Das grenzt den Widerspruch exakt ein: er existiert nur fuer den flachen Vektor.
    // Ohne diese Zusicherung koennte der Zeuge auch dann gruen sein, wenn die beiden
    // Funktionen bei Skalaren und 2D-Arrays auseinanderliefen.
    //
    // Runde 244: Die Liste stand als `unknown[]` und der Compiler lehnte sie ab
    // (`TS2345: Argument of type 'unknown' is not assignable to parameter of type
    // 'FormulaValue'`). Das war **mein** Fehler und kein zu breiter Fall: alle sechs
    // Werte sind `FormulaValue`, weil `SingleFormulaValue` `string | number | boolean |
    // null` ist. Die Liste war also inhaltlich richtig und nur untypisiert.
    const faelle: FormulaValue[] = [42, 'text', null, true, [[1, 2], [3, 4]], [[7]]];
    for (const fall of faelle) {
      expect(toFormulaArray(fall)).toEqual(normalizeToArray2D(fall));
    }
  });
});
