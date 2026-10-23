// STATUS: PLATIN — ZEUGE fuer die Entscheidung `DECISION_FLAT_VECTOR_IN_SCALAR_POSITION.md`.
//
// **Was hier bezeugt wird.** Die Entscheidung ist gefallen: *„Ein flacher Vektor an einer
// Skalarstelle ist ein FEHLER. Er wird nicht still auf sein erstes Element reduziert."*
// Fuer `toSingleValue` heisst das: das Ergebnis ist der Fehlerwert `#VALUE!`, nicht das
// erste Element und nicht der Vektor selbst.
//
// **Warum es diese Datei gibt.** `audit/feature_gap_register.csv` fuehrt den Punkt als
// `GAP-0012` mit dem Zustand `CONFLICTING` und der Luecke, woertlich:
//
//     Die Entscheidung ist dokumentiert, aber unbezeugt. Aenderungen an den drei
//     Stellen sind bis dahin Behauptungen.
//
// Die Entscheidung selbst verlangt die Reihenfolge **Zeuge zuerst, dann Reparatur**, und
// sagt ausdruecklich, dass sie *keine Erlaubnis ist, jetzt etwas zu aendern*. Diese Datei
// ist der Zeuge. Sie aendert **keine** der drei Stellen.
//
// **Der gemessene Grund.** `isFormulaArray` prueft `Array.isArray(val[0])`. Bei einem
// flachen Vektor ist `val[0]` eine Zahl, also `false`. `toSingleValue` betritt damit die
// Array-Verzweigung nicht und gibt in der letzten Zeile `val` zurueck — der Vektor kommt
// als Vektor heraus. Genau das nennt die Entscheidung „Identitaet".
//
// **Warum ein flacher Vektor kein `FormulaValue` ist.** `FormulaArray` ist
// `SingleFormulaValue[][]`, also zweidimensional, und `FormulaValue` enthaelt deshalb
// keinen flachen Vektor. Er entsteht zur **Laufzeit** aus dynamischen Ergebnissen, nicht
// durch eine typisierte Zuweisung. Deshalb geht der Zeuge ueber `JSON.parse`: das ist der
// reale Weg, auf dem ein solcher Wert ankommt, und es braucht kein `as unknown as`.
//
// **Warum ZWEI Zusicherungen und nicht `it.fails`.** `it.fails` waere hier falsch:
// es besteht, solange die Zusicherung versagt — also auch dann, wenn jemand die **stille
// Reduktion** auf das erste Element einbaut. Der Zeuge wuerde die Reparatur nicht von der
// Fehlreparatur unterscheiden. Er prueft deshalb beide Richtungen getrennt:
//
//   1. `A` ist **jetzt rot** und dokumentiert damit den Ist-Zustand: die Entscheidung ist
//      gefallen, der Code folgt ihr noch nicht. `GAP-0012` bleibt offen, bis `A` ohne
//      `it.fails` besteht.
//   2. `B` ist **jetzt gruen** und bleibt es nur, solange niemand still auf das erste
//      Element reduziert. `B` ist der eigentliche Waechter.
//
// Sobald jemand `#VALUE!` einbaut, wird `A` gruen — und `it.fails` meldet das laut, weil
// ein `it.fails`, das besteht, ein Fehlschlag ist. Dann gehoert `A` auf ein gewoehnliches
// `it` umgestellt und `GAP-0012` auf `IMPLEMENTED_VERIFIED`.

import { describe, it, expect } from 'vitest';
import { toSingleValue, isFormulaError } from '../../formulas/gridFormulaTypes';

/** Ein flacher Vektor, wie er zur Laufzeit ankommt: kein `FormulaValue`, aber ein Wert. */
function flacherVektor(...werte: number[]): ReturnType<typeof JSON.parse> {
  return JSON.parse(`[${werte.join(',')}]`);
}

describe('ZEUGE GAP-0012 — flacher Vektor an einer Skalarstelle (toSingleValue)', () => {
  it('A: die Entscheidung ist umgesetzt — ein flacher Vektor ergibt #VALUE!', () => {
    // **Runde 243: dieses `it.fails` ist auf `it` umgestellt.**
    //
    // Bis Runde 242 war die Zusicherung rot, weil `toSingleValue` den Vektor
    // unveraendert zurueckgab. Das `it.fails` hielt die Suite gruen und meldete
    // den offenen Punkt. Mit der Reparatur besteht sie — und `it.fails` meldete
    // das als Fehlschlag, genau wie entworfen. Damit ist die Umstellung der
    // dokumentierte Abschluss dieses Punktes, nicht ihr Verstecken.
    //
    // Sobald jemand die stille Reduktion auf das erste Element einbaut, versagt
    // diese Zusicherung wieder — jetzt als gewoehnlicher Fehlschlag.
    const ergebnis = toSingleValue(flacherVektor(100, 200, 300));
    expect(isFormulaError(ergebnis)).toBe(true);
    expect(ergebnis).toBe('#VALUE!');
  });

  it('B: WÄCHTER — die stille Reduktion auf das erste Element darf NICHT passieren', () => {
    // Diese Zusicherung ist jetzt gruen: der Vektor kommt als Vektor heraus, nicht als
    // 100. Sie wird rot, sobald jemand `val[0]` einbaut. Damit unterscheidet der Zeuge
    // die entschiedene Reparatur (`#VALUE!`) von der verbotenen (`val[0]`).
    const ergebnis = toSingleValue(flacherVektor(100, 200, 300));
    expect(ergebnis).not.toBe(100);
    expect(ergebnis).not.toBe(200);
    expect(ergebnis).not.toBe(300);
  });

  it('B: WÄCHTER — auch ein zweielementiger flacher Vektor wird nicht reduziert', () => {
    const ergebnis = toSingleValue(flacherVektor(7, 8));
    expect(ergebnis).not.toBe(7);
    expect(ergebnis).not.toBe(8);
  });

  it('C: GEGENPROBE — ein ECHTER zweidimensionaler Array wird weiterhin auf [0][0] reduziert', () => {
    // Ohne diese Zusicherung koennte `#VALUE!` fuer JEDEN Array eingebaut werden, und der
    // Zeuge waere auch dann gruen. `toSingleValue([[5,6],[7,8]])` ist `5` — das ist die
    // bestehende, richtige Regel und darf sich nicht aendern.
    expect(toSingleValue([[5, 6], [7, 8]])).toBe(5);
  });

  it('C: GEGENPROBE — ein Skalar bleibt ein Skalar', () => {
    expect(toSingleValue(42)).toBe(42);
    expect(toSingleValue('text')).toBe('text');
    expect(toSingleValue('#DIV/0!')).toBe('#DIV/0!');
    expect(toSingleValue(null)).toBe(null);
  });

  it('C: GEGENPROBE — ein leeres Array wird weiterhin zu null', () => {
    expect(toSingleValue([])).toBe(null);
    expect(toSingleValue([[]])).toBe(null);
  });
});
