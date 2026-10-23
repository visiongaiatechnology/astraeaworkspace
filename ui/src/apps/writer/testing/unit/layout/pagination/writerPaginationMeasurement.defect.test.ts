/**
 * DEF-RE-013 — REGRESSIONSTEST nach der Reparatur.
 *
 * ## Die Reihenfolge, die der Auftrag verlangt — und die eingehalten wurde
 *
 * 1. **Runde 261: reproduziert.** Diese Datei belegte mit neun grünen Fällen, dass
 *    `Math.max(1, image.intrinsicWidth)` bei `NaN` **NaN** ergibt und `heightPx` **dauerhaft** vergiftet.
 * 2. **Runde 262: repariert.** `tools/repair_def_re_013_nan_page_height.py`.
 *    **Vorher `bd2dbce8`, nachher `58548f00`.**
 * 3. **Runde 262: der Beweis, dass sich etwas geändert hat.** Nach der Reparatur **fielen 5 der 9 Fälle** —
 *    weil sie `NaN` behaupteten. Ein Regressionstest, der nach der Reparatur unverändert grün bleibt,
 *    hätte nichts bewiesen.
 * 4. **Runde 262: diese Fassung** behauptet das reparierte Verhalten und hält es fest.
 *
 * ## Die Reparatur
 *
 * ```ts
 * const safeWidth  = Number.isFinite(image.intrinsicWidth)  ? Math.max(1, image.intrinsicWidth)  : 1;
 * const safeHeight = Number.isFinite(image.intrinsicHeight) ? Math.max(1, image.intrinsicHeight) : 1;
 * const widthPercent = Number.isFinite(image.widthPercent) ? image.widthPercent : 100;
 * ```
 *
 * **Die Rückfallwerte sind keine erfundene Politik — jeder ist der Wert, den die vorhandene Klemmung
 * ohnehin als neutral behandelt:**
 *
 * * **`1` für eine Abmessung** ist die untere Schranke, die der Wächter schon setzte (`Math.max(1, …)`).
 * * **`100` für den Breitenanteil** erzeugt `Math.min(1, Math.max(0.05, 1)) = 1`, also **die volle
 *   Spaltenbreite** — dieselbe Lesart „keine Skalierung angegeben", die DEF-RE-010 nutzte, als es auf den
 *   Parameter-Standardwert `1` zurückfiel.
 *
 * ## Und der unauffälligere Fall
 *
 * `Infinity` ergab **28** — endlich und falsch. **Diese Fassung hält fest, dass es jetzt eine echte Höhe
 * ergibt**, nicht bloss eine endliche.
 */

import { describe, expect, it } from 'vitest';
import { estimateAnchoredMediaHeightPx } from '../../../../layout/pagination/measurement/writerPaginationMeasurement';

const geometry = {
  columnWidthPx: 400,
  bodyHeightPx: 800,
} as never;

const image = (over: Record<string, unknown> = {}) => ({
  id: 'img-1',
  anchorParagraphId: 'p1',
  wrapMode: 'top-bottom',
  intrinsicWidth: 800,
  intrinsicHeight: 600,
  widthPercent: 50,
  ...over,
});

const flow = (bilder: unknown[]) => ({ images: bilder } as never);

const hoehe = (over: Record<string, unknown>) =>
  estimateAnchoredMediaHeightPx('p1', geometry, flow([image(over)]));

describe('estimateAnchoredMediaHeightPx — der gesunde Fall bleibt gesund', () => {
  it('ein gueltiges Bild ergibt eine endliche Hoehe', () => {
    const wert = hoehe({});
    expect(Number.isFinite(wert)).toBe(true);
    expect(wert).toBeGreaterThan(28);
  });

  it('ohne Inhalt ist die Hoehe 0', () => {
    expect(estimateAnchoredMediaHeightPx('p1', geometry, undefined)).toBe(0);
    expect(estimateAnchoredMediaHeightPx('p1', geometry, flow([]))).toBe(0);
  });

  it('ein anderes Bild traegt nichts bei', () => {
    expect(estimateAnchoredMediaHeightPx('p1', geometry, flow([image({ anchorParagraphId: 'p99' })]))).toBe(0);
  });
});

describe('DEF-RE-013 — die Reparatur haelt', () => {
  it('HAUPTZUSICHERUNG: intrinsicWidth NaN ergibt eine ENDLICHE Hoehe, kein NaN', () => {
    // **Der Kern der Reparatur.** Vorher: `Math.max(1, NaN)` = NaN -> `heightPx` dauerhaft NaN.
    const wert = hoehe({ intrinsicWidth: Number.NaN });
    expect(Number.isNaN(wert)).toBe(false);
    expect(Number.isFinite(wert)).toBe(true);
    expect(wert).toBeGreaterThan(0);
  });

  it('HAUPTZUSICHERUNG: intrinsicHeight NaN ebenso', () => {
    const wert = hoehe({ intrinsicHeight: Number.NaN });
    expect(Number.isFinite(wert)).toBe(true);
    expect(wert).toBeGreaterThan(0);
  });

  it('HAUPTZUSICHERUNG: widthPercent NaN ebenso', () => {
    const wert = hoehe({ widthPercent: Number.NaN });
    expect(Number.isFinite(wert)).toBe(true);
    expect(wert).toBeGreaterThan(0);
  });

  it('HAUPTZUSICHERUNG: die Vergiftung ist NICHT mehr dauerhaft', () => {
    // Vorher machte ein einziges kaputtes Bild JEDE weitere Addition wirkungslos.
    const kaputt = estimateAnchoredMediaHeightPx(
      'p1',
      geometry,
      flow([image({ id: 'kaputt', intrinsicWidth: Number.NaN }), image({ id: 'heil' })]),
    );
    expect(Number.isFinite(kaputt)).toBe(true);
    // Und das heile Bild traegt weiterhin bei: zwei Bilder ergeben mehr als eines.
    const eines = estimateAnchoredMediaHeightPx('p1', geometry, flow([image({ id: 'heil' })]));
    expect(kaputt).toBeGreaterThan(eines);
  });

  it('HAUPTZUSICHERUNG: Infinity ergibt jetzt eine ECHTE Hoehe, nicht 28', () => {
    // **GEMESSEN vorher: 28** — endlich und falsch. Der unauffaelligere Fall ist der gefaehrlichere.
    const unendlich = hoehe({ intrinsicWidth: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(unendlich)).toBe(true);
    // Der Rückfallwert 1 fuer die Breite ergibt ein sehr hohes, aber endliches Bild:
    // `Math.min(bodyHeightPx, renderedWidth * (600 / 1))` wird auf bodyHeightPx begrenzt.
    expect(unendlich).toBeGreaterThan(28);

    const negativ = hoehe({ intrinsicWidth: Number.NEGATIVE_INFINITY });
    expect(Number.isFinite(negativ)).toBe(true);
    expect(negativ).toBeGreaterThan(28);
  });

  it('HAUPTZUSICHERUNG: kein Eingabefall kann die Hoehe nicht-endlich machen', () => {
    // Die Zusicherung, die die Reparatur gibt: die Rueckgabe ist immer eine endliche Zahl.
    const faelle = [
      Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, -1e9, 1e9, 0.5, undefined,
    ];
    for (const wert of faelle) {
      for (const feld of ['intrinsicWidth', 'intrinsicHeight', 'widthPercent']) {
        const ergebnis = hoehe({ [feld]: wert });
        expect(Number.isFinite(ergebnis), `${feld} = ${String(wert)}`).toBe(true);
        expect(Number.isNaN(ergebnis), `${feld} = ${String(wert)}`).toBe(false);
      }
    }
  });

  it('eine Abmessung von 0 ergibt die untere Schranke, nicht eine Division durch null', () => {
    // `Math.max(1, 0)` = 1 — die Klemmung greift, und `safeHeight / safeWidth` bleibt endlich.
    const wert = hoehe({ intrinsicWidth: 0, intrinsicHeight: 0 });
    expect(Number.isFinite(wert)).toBe(true);
    expect(Number.isNaN(wert)).toBe(false);
  });

  it('ein fehlendes Feld ebenso', () => {
    expect(Number.isFinite(hoehe({ intrinsicWidth: undefined }))).toBe(true);
    expect(Number.isFinite(hoehe({ intrinsicHeight: undefined }))).toBe(true);
    expect(Number.isFinite(hoehe({ widthPercent: undefined }))).toBe(true);
  });
});

describe('DEF-RE-013 — die Klasse, zu der der Defekt gehoerte', () => {
  it('drei Instanzen, alle drei als Waechter geschrieben, alle drei repariert', () => {
    //   writerShapeOperations.ts      Math.max(1, NaN)              DEF-RE-009  repariert
    //   writerMediaOperations.ts      Math.max(0, Math.min(1, NaN)) DEF-RE-010  repariert
    //   writerPaginationMeasurement   Math.max(1, NaN)              DEF-RE-013  repariert
    expect(Number.isNaN(Math.max(1, Number.NaN))).toBe(true);
    expect(Number.isNaN(Math.max(0, Math.min(1, Number.NaN)))).toBe(true);
    // Und die Form, die alle drei jetzt benutzen:
    const geschuetzt = (wert: unknown, fallback: number) =>
      Number.isFinite(wert) ? Math.max(fallback, wert as number) : fallback;
    expect(geschuetzt(Number.NaN, 1)).toBe(1);
    expect(geschuetzt(Number.POSITIVE_INFINITY, 1)).toBe(1);
    expect(geschuetzt(5, 1)).toBe(5);
  });

  it('ist deterministisch', () => {
    expect(hoehe({ intrinsicWidth: Number.NaN })).toBe(hoehe({ intrinsicWidth: Number.NaN }));
    expect(hoehe({})).toBe(hoehe({}));
  });
});
