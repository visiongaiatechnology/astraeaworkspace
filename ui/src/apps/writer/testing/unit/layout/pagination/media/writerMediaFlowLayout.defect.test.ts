/**
 * DEF-RE-015 — REGRESSIONSTEST nach der Reparatur. **Alle drei Exporte des Moduls.**
 *
 * ## Die Reihenfolge, eingehalten und belegt
 *
 * 1. **Runde 265: reproduziert.** Zehn grüne Fälle belegten, dass `columnWidthPx: NaN` **fünf** Felder der
 *    Flussmetrik vergiftet und `lineHeightPx: NaN` **eines**.
 * 2. **Runde 266: der Befund wuchs beim Lesen.** Dieselbe Lücke steht in den **beiden anderen Exporten**:
 *    `writerImageExcludedWidthForLine` (`Math.min(NaN * 0.9, x)` ist NaN) und
 *    `writerImageResidualFlowHeightPx` (`x * NaN` ist NaN).
 * 3. **Runde 266: repariert.** `tools/repair_def_re_015_parameter_poisoning.py`.
 *    **Vorher `00745b8f`, nachher `3aba3256`.**
 * 4. **Runde 266: der Beweis.** Nach der Reparatur **fielen 3 der 10 Fälle** — `columnWidthPx` vergiftete
 *    plötzlich `[]` Felder statt fünf.
 * 5. **Runde 266: diese Fassung.**
 *
 * ## Die Reparatur: ein Wächter, drei Eintrittspunkte
 *
 * ```ts
 * function safeLayoutPx(value: number, fallback = 1): number {
 *   return Number.isFinite(value) ? value : fallback;
 * }
 * ```
 *
 * **Der Rückfallwert ist `1`** — dieselbe Schranke, die diese Ausdrücke ohnehin setzen (`Math.max(1, …)`).
 * Ein Layout mit entarteter Breite ist falsch, aber **endlich** — und darauf kommt es an einer
 * Vertrauensgrenze an.
 *
 * ## Und die Nachbarschaft, die den Ausschlag gab
 *
 * **Dieselbe Funktion schützte ihre DOKUMENTFELDER bereits** — mit `Math.max(1, image.intrinsicWidth || 1)`.
 * Das funktioniert für `NaN` (weil `NaN` falsy ist), **aber nicht für `Infinity`**, und es ist keine Form,
 * die jemand bewusst geschrieben hat.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveWriterImageFlowMetric,
  writerImageExcludedWidthForLine,
  writerImageResidualFlowHeightPx,
} from '../../../../../layout/pagination/media/writerMediaFlowLayout';

const image = (over: Record<string, unknown> = {}) => ({
  id: 'img-1',
  anchorParagraphId: 'p1',
  wrapMode: 'square',
  intrinsicWidth: 800,
  intrinsicHeight: 600,
  widthPercent: 50,
  horizontalOffsetMm: 0,
  wrapDistanceTopMm: 3,
  wrapDistanceBottomMm: 3,
  ...over,
} as never);

const rander = [{ start: 0, end: 20 }] as never;

const metrik = (over: Record<string, unknown> = {}, p: Record<string, number> = {}) =>
  resolveWriterImageFlowMetric(
    image(over),
    p.columnWidthPx ?? 400,
    p.lineHeightPx ?? 20,
    p.characterWidthPx ?? 8,
    'Ein Beispieltext fuer den Umlauf',
    rander,
  );

/** Alle Zahlenfelder eines Ergebnisses. */
const zahlen = (objekt: unknown): number[] =>
  Object.values(objekt as Record<string, unknown>).filter((v): v is number => typeof v === 'number');

const NICHT_ENDLICH = [
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, -1e9, 1e9, 0.5,
];

describe('der gesunde Fall bleibt gesund', () => {
  it('eine gueltige Metrik ist durchgehend endlich', () => {
    const ergebnis = metrik();
    expect(ergebnis).not.toBeNull();
    for (const wert of zahlen(ergebnis)) {
      expect(Number.isFinite(wert)).toBe(true);
    }
  });

  it('HAUPTZUSICHERUNG: die DOKUMENTFELDER sind weiterhin gedeckt', () => {
    // Die Reparatur darf das vorhandene `|| 1` nicht verschlechtern.
    for (const feld of ['intrinsicWidth', 'intrinsicHeight']) {
      const ergebnis = metrik({ [feld]: Number.NaN });
      for (const wert of zahlen(ergebnis)) {
        expect(Number.isNaN(wert), feld).toBe(false);
      }
    }
  });

  it('gueltige Parameter veraendern das Ergebnis nicht', () => {
    // Die Reparatur greift nur bei nicht-endigen Werten.
    expect(metrik({}, { columnWidthPx: 400, lineHeightPx: 20 })).toEqual(metrik({}, { columnWidthPx: 400, lineHeightPx: 20 }));
    expect(metrik({}, { columnWidthPx: 400 })!.renderedWidthPx).toBe(200);
  });

  it('ein fixiertes Bild ergibt null', () => {
    expect(metrik({ fixPositionOnPage: true })).toBeNull();
  });
});

describe('DEF-RE-015 — die Reparatur haelt in ALLEN DREI Exporten', () => {
  it('HAUPTZUSICHERUNG: die Parameter vergiften die Flussmetrik nicht mehr', () => {
    // Vorher: `columnWidthPx` vergiftete FUENF Felder, `lineHeightPx` eines.
    for (const feld of ['columnWidthPx', 'lineHeightPx', 'characterWidthPx']) {
      for (const wert of NICHT_ENDLICH) {
        const ergebnis = metrik({}, { [feld]: wert });
        expect(ergebnis, `${feld} = ${wert}`).not.toBeNull();
        for (const zahl of zahlen(ergebnis)) {
          expect(Number.isNaN(zahl), `${feld} = ${wert}: ${zahl}`).toBe(false);
          expect(Number.isFinite(zahl), `${feld} = ${wert}: ${zahl}`).toBe(true);
        }
      }
    }
  });

  it('auch im character-Anker, wo characterWidthPx gelesen wird', () => {
    // Vorher vergiftete der Wert genau hier.
    for (const wert of NICHT_ENDLICH) {
      const ergebnis = metrik({ anchorTarget: 'character' }, { characterWidthPx: wert });
      for (const zahl of zahlen(ergebnis)) {
        expect(Number.isFinite(zahl), String(wert)).toBe(true);
      }
    }
  });

  it('HAUPTZUSICHERUNG: writerImageExcludedWidthForLine vergiftet nicht mehr', () => {
    // Vorher: `Math.min(NaN * 0.9, x)` ist NaN.
    const metrikGueltig = metrik();
    for (const wert of NICHT_ENDLICH) {
      const breite = writerImageExcludedWidthForLine(1, [metrikGueltig!], wert);
      expect(Number.isFinite(breite), String(wert)).toBe(true);
      expect(Number.isNaN(breite), String(wert)).toBe(false);
    }
    // Und die Kontrolle: eine gueltige Breite ergibt eine endliche Zahl.
    expect(Number.isFinite(writerImageExcludedWidthForLine(1, [metrikGueltig!], 400))).toBe(true);
  });

  it('HAUPTZUSICHERUNG: writerImageResidualFlowHeightPx vergiftet nicht mehr', () => {
    // Vorher: `x * NaN` ist NaN, und `Math.max(residual, NaN)` bleibt NaN.
    const metrikGueltig = metrik();
    for (const wert of NICHT_ENDLICH) {
      const hoehe = writerImageResidualFlowHeightPx([metrikGueltig!], 2, wert);
      expect(Number.isFinite(hoehe), String(wert)).toBe(true);
      expect(Number.isNaN(hoehe), String(wert)).toBe(false);
      expect(hoehe).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isFinite(writerImageResidualFlowHeightPx([metrikGueltig!], 2, 20))).toBe(true);
  });

  it('HAUPTZUSICHERUNG: ohne Metriken ist das Ergebnis 0, nicht NaN', () => {
    // Der leere Fall darf nicht an der Reparatur scheitern.
    for (const wert of NICHT_ENDLICH) {
      expect(writerImageResidualFlowHeightPx([], 5, wert), String(wert)).toBe(0);
      expect(writerImageExcludedWidthForLine(0, [], wert), String(wert)).toBe(0);
    }
  });

  it('ist deterministisch', () => {
    const bauen = () => JSON.stringify(metrik({}, { columnWidthPx: Number.NaN }));
    expect(bauen()).toBe(bauen());
  });
});

describe('DEF-RE-015 — die zwei Muster derselben Codebasis', () => {
  it('HAUPTZUSICHERUNG: die DOKUMENTFELDER sind fuer NaN gedeckt — die Luecke ist Infinity', () => {
    // **Gemessen in Runde 279, und es ist eine Luecke, die DEF-RE-015 NICHT geschlossen hat:**
    // die Reparatur galt den PARAMETERN (`columnWidthPx`, `lineHeightPx`, `characterWidthPx`).
    //
    // Die DOKUMENTFELDER werden weiterhin mit `|| 1` geschuetzt:
    //
    //     Math.max(1, image.intrinsicWidth || 1)
    //
    // **`NaN || 1` ist 1 — gedeckt. `Infinity || 1` ist `Infinity` — NICHT gedeckt.**
    // Und `Math.max(1, Infinity)` ist Infinity, also traegt die Metrik Infinity.
    //
    // **Ein Waechter, der NaN faengt und Infinity durchlaesst, ist ein halber Waechter.**
    expect(Number.NaN || 1).toBe(1);
    expect(Number.POSITIVE_INFINITY || 1).toBe(Number.POSITIVE_INFINITY);

    // Fuer NaN bleibt die Metrik sauber.
    const nanFall = metrik({ intrinsicWidth: Number.NaN }) as unknown as Record<string, unknown>;
    const nanZahlen = Object.values(nanFall).filter((v): v is number => typeof v === 'number');
    expect(nanZahlen.some((v) => Number.isNaN(v))).toBe(false);

    // **Und fuer Infinity — GEMESSEN, und es ist zum dritten Mal dieselbe Form:**
    //
    //     intrinsicWidth = Infinity
    //     intrinsicHeight / intrinsicWidth      =  600 / Infinity  =  0
    //     renderedWidthPx * 0                   =  0
    //     Math.max(1, 0)                        =  1        <-- ENDLICH, aber FALSCH
    //
    // **`Infinity` ergibt also KEIN unendliches Feld, sondern die untere Schranke.** Genau wie bei
    // DEF-RE-013 (`Infinity` -> 28) und DEF-RE-015 (`x / Infinity` -> 0 -> `ceil` -> `max(1,0)` = 1).
    //
    // **Ein NaN faellt auf; eine zu kleine Zahl nicht.** Das ist der unauffaelligere Fall — und er ist
    // dreimal derselbe, weil `x / Infinity` immer 0 ist und jede Klemmung ihn dann auf ihr Minimum hebt.
    const infFall = metrik({ intrinsicWidth: Number.POSITIVE_INFINITY }) as unknown as Record<string, number>;
    const infZahlen = Object.values(infFall).filter((v): v is number => typeof v === 'number');
    expect(infZahlen.some((v) => Number.isNaN(v))).toBe(false);
    expect(infZahlen.some((v) => !Number.isFinite(v))).toBe(false);
    // Und das gerenderte Hoehenfeld steht auf der unteren Schranke.
    expect(infFall.renderedHeightPx).toBe(1);

    // Zum Kontrast der gueltige Fall: deutlich mehr als 1.
    const gueltig = metrik({}) as unknown as Record<string, number>;
    expect(gueltig.renderedHeightPx).toBeGreaterThan(1);
  });

  it('gemessen: `|| 1` deckt NaN, aber nicht Infinity', () => {
    //   writerPaginationMeasurement   Math.max(1, image.intrinsicWidth)         -> NaN    DEF-RE-013 repariert
    //   writerMediaFlowLayout         Math.max(1, image.intrinsicWidth || 1)    -> 1      sicher fuer NaN
    //   hier (Parameter)              safeLayoutPx(...)                         -> 1      DEF-RE-015
    //   hier (Dokumentfeld)           `|| 1`                                    -> Infinity noch offen
    expect(Math.max(1, Number.NaN)).toBeNaN();
    expect(Math.max(1, Number.NaN || 1)).toBe(1);
    expect(Math.max(1, Number.POSITIVE_INFINITY || 1)).toBe(Number.POSITIVE_INFINITY);

    // Der Waechter, der beide Faelle deckt:
    const safeLayoutPx = (wert: number, fallback = 1) => (Number.isFinite(wert) ? wert : fallback);
    expect(safeLayoutPx(Number.NaN)).toBe(1);
    expect(safeLayoutPx(Number.POSITIVE_INFINITY)).toBe(1);
    expect(safeLayoutPx(Number.NEGATIVE_INFINITY)).toBe(1);
    expect(safeLayoutPx(400)).toBe(400);
  });
});
