// STATUS: PLATIN — ZEUGE fuer die Entscheidung `DECISION_FLAT_VECTOR_IN_SCALAR_POSITION.md`,
// Stelle 3 von 3: `planGridFormulaSpill`.
//
// **Was hier bezeugt wird.** Die Entscheidung sagt woertlich:
//
//     `planGridFormulaSpill` — ein flacher Vektor ist **kein** `kind:'scalar'`. Er wird als
//     Vektor geplant, oder die Planung meldet `#VALUE!`. **Nicht** ein Vektor in einem Zellwert.
//
// **Der gemessene Ist-Zustand.** `planGridFormulaSpill` prueft in Zeile 80
// `if (!isFormulaArray(formulaValue))`. `isFormulaArray` gibt fuer einen flachen Vektor
// FALSE zurueck, weil `val[0]` eine Zahl ist. Der flache Vektor faellt damit in den
// Skalar-Zweig und wird als `kind:'scalar'` mit dem **ganzen Vektor als Zellwert** geplant
// und mit `footprint: [origin]`, also einem einzigen Platz. Das ist genau die Form, die
// die Entscheidung verbietet.
//
// **Warum der Zeuge NICHT `kind:'vector'` fordert.** Die Entscheidung laesst **zwei**
// Antworten zu: *„Er wird als Vektor geplant, **oder** die Planung meldet `#VALUE!`."*
// Eine Zusicherung auf `kind:'vector'` wuerde eine der beiden erlaubten Antworten
// verbieten und damit ueber die Entscheidung hinausgehen. Der Zeuge fordert deshalb nur
// das, was die Entscheidung wirklich festlegt: **nicht `'scalar'`** — und wenn geplant
// wird, dann ohne den Vektor in einem einzelnen Zellwert.
//
// **Warum ZWEI Richtungen, und warum `B` hier `it.fails` ist.** Wie bei Stelle 2 ist der
// Ist-Zustand **identisch mit der verbotenen Form**. Ein `B` ohne `it.fails` waere deshalb
// keine zweite Richtung, sondern dieselbe Aussage wie `A`. `B` bleibt stehen, weil es die
// verbotene Form **benennt** statt nur die fehlende Eigenschaft. Der eigentliche Waechter
// ist `C`: er prueft, dass die bestehenden, richtigen Faelle unveraendert bleiben — also
// dass eine Reparatur nicht zuviel wegnimmt.

import { describe, it, expect } from 'vitest';
import { planGridFormulaSpill } from '../../formulas/gridFormulaSpill';

/** Ein flacher Vektor, wie er zur Laufzeit ankommt: kein `FormulaValue`, aber ein Wert. */
function flacherVektor(...werte: number[]): ReturnType<typeof JSON.parse> {
  return JSON.parse(`[${werte.join(',')}]`);
}

describe('ZEUGE GAP-0012 — Stelle 3: planGridFormulaSpill und der flache Vektor', () => {
  it('A: die Entscheidung ist umgesetzt — ein flacher Vektor wird NICHT als scalar geplant', () => {
    // Die Entscheidung: nicht `'scalar'`. Heute ist es `'scalar'`.
    const plan = planGridFormulaSpill('A1', flacherVektor(100, 200, 300), {});
    expect(plan.kind).not.toBe('scalar');
  });

  it('A: genau zwei Antworten sind erlaubt — ein Vektorplan ODER #VALUE!, und eine davon trifft zu', () => {
    // Diese Zusicherung bildet die Entscheidung woertlich ab. Sie ist jetzt rot.
    const plan = planGridFormulaSpill('A1', flacherVektor(100, 200, 300), {});
    const alsVektorGeplant = plan.kind !== 'scalar';
    const alsFehlerGemeldet = plan.error === '#VALUE!';
    expect(alsVektorGeplant || alsFehlerGemeldet).toBe(true);
  });

  it('B: der ganze Vektor steckt NICHT in einem einzigen Zellwert', () => {
    // Die verbotene Form, benannt: `kind:'scalar'` und `value` ist der Vektor selbst.
    const plan = planGridFormulaSpill('A1', flacherVektor(100, 200, 300), {});
    const vektorAlsZellwert = plan.kind === 'scalar' && Array.isArray(plan.value);
    expect(vektorAlsZellwert).toBe(false);
  });

  it('B: der Fussabdruck eines flachen Vektors ist groesser als ein Platz', () => {
    // Ein Vektor von drei Elementen belegt heute `footprint: ['A1']`, also einen Platz.
    // Das ist die zweite Haelfte der verbotenen Form.
    const plan = planGridFormulaSpill('A1', flacherVektor(100, 200, 300), {});
    expect(plan.footprint.length).toBeGreaterThan(1);
  });

  it('C: WÄCHTER — ein echter Skalar bleibt weiterhin kind:"scalar"', () => {
    // Die Gegenprobe gegen die Ueberreparatur: wer den flachen Vektor aus dem
    // Skalar-Zweig herausholt und dabei den Zweig selbst verliert, macht JEDEN Skalar
    // zu einem Vektor. Genau das faengt diese Zusicherung.
    const plan = planGridFormulaSpill('A1', 42, {});
    expect(plan.kind).toBe('scalar');
    expect(plan.value).toBe(42);
    expect(plan.error).toBe(null);
    expect(plan.footprint).toEqual(['A1']);
  });

  it('C: WÄCHTER — ein echter 2D-Array wird weiterhin verschuettet, nicht skalar', () => {
    const plan = planGridFormulaSpill('A1', [[1, 2], [3, 4]], {});
    expect(plan.kind).not.toBe('scalar');
    expect(plan.footprint.length).toBeGreaterThan(1);
  });

  it('C: WÄCHTER — eine 1x1-Matrix bleibt weiterhin kind:"scalar" mit dem inneren Wert', () => {
    const plan = planGridFormulaSpill('B2', [[7]], {});
    expect(plan.kind).toBe('scalar');
    expect(plan.value).toBe(7);
    expect(plan.footprint).toEqual(['B2']);
  });

  it('C: WÄCHTER — die Grenzfaelle aus der bestehenden Suite bleiben unveraendert', () => {
    // Diese drei Faelle stehen woertlich in `gridFormulaSpillPlan.test.ts` und sind
    // dort gruen. Sie duerfen sich durch diese Reparatur NICHT aendern.
    const leer = planGridFormulaSpill('A1', [], {});
    expect(leer.kind).toBe('scalar');
    expect(leer.value).toBe(null);

    const outOfBounds = planGridFormulaSpill('XFD1048576', [[1, 2]], {});
    expect(outOfBounds.kind).toBe('out-of-bounds');

    const skalarAmRand = planGridFormulaSpill('XFD1048576', [[1]], {});
    expect(skalarAmRand.kind).toBe('scalar');
  });
});
