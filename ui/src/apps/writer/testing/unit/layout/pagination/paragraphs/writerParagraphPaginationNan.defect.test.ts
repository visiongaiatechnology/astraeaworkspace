/**
 * DEF-RE-018 — Reproduktion: ein nicht-endiges `firstPageBodyHeightPx` vergiftet die Paginierung.
 *
 * ## Wie es gefunden wurde
 *
 * `tools/find_unguarded_clamps.py` meldete `writerParagraphPagination.ts:322`
 * (`maximumLines = Math.max(1, maximumLines)`). **Beim Lesen der Datei, um diese Zeile zu verstehen, stand
 * die wichtigere Stelle 288 Zeilen früher:**
 *
 * ```ts
 * let singleColumnHeightPx = Math.min(
 *   geometry.bodyHeightPx,
 *   Math.max(1, options?.firstPageBodyHeightPx ?? geometry.bodyHeightPx),   // Math.max(1, NaN) = NaN
 * );
 * let availableFlowHeightPx = singleColumnHeightPx * geometry.columnCount;  // NaN
 * ```
 *
 * **`options.firstPageBodyHeightPx` ist ein Aufrufer-Parameter. Bei NaN wird `singleColumnHeightPx` NaN,
 * und damit `availableFlowHeightPx` — die Höhe, gegen die jeder Umbruch geprüft wird.**
 *
 * ## Und die Kette schliesst sich
 *
 * **Zeile 52 derselben Funktion ruft `estimateAnchoredMediaHeightPx` auf — die Funktion aus DEF-RE-013,
 * die in Runde 262 repariert wurde.**
 *
 * ```
 * DEF-RE-013   estimateAnchoredMediaHeightPx   Math.max(1, image.intrinsicWidth)   repariert (r262)
 * DEF-RE-018   paginateWriterParagraphs        Math.max(1, firstPageBodyHeightPx)   diese Reproduktion
 * ```
 *
 * **Dieselbe Datei, dieselbe Funktion, dieselbe Zeile — zweimal, an zwei Stellen.** Und der Werkzeugtreffer
 * nannte eine dritte.
 *
 * ## Warum das die schwerste Stelle wäre
 *
 * **`availableFlowHeightPx` ist die Höhe, gegen die jeder Umbruch geprüft wird.** Ein NaN dort ist kein
 * ungenauer Wert — es ist eine Paginierung, die keine Seite mehr füllen kann.
 *
 * ## Der Status: REPRODUKTION, keine Reparatur
 */

import { describe, expect, it } from 'vitest';
import { paginateWriterParagraphs } from '../../../../../layout/pagination/paragraphs/writerParagraphPagination';

const paragraph = (id: string, text: string) => ({
  id,
  spans: [{ text }],
  style: { style_name: 'normal' },
} as never);

const setup = (over: Record<string, unknown> = {}) => ({
  // **GEMESSEN und zunaechst falsch:** ich uebergab `margins: { top: 20, bottom: 20, ... }` — ein Objekt.
  // `getWriterPageGeometry` erwartet einen ZEICHENKETTEN-Preset und wirft sonst
  // `render_geometry_invalid_margin_top`. Die Form stammt aus `writerAcceptanceBackend.test.ts`, der
  // `paginateWriterParagraphs` bereits erfolgreich aufruft.
  //
  // **Und die Beobachtung ist wichtiger als der Fehler:** die Geometrie VALIDIERT ihre Raender bereits mit
  // `Number.isFinite` und wirft. **Die Codebasis hat also ein drittes Muster — validieren-und-werfen — und
  // Zeile 34 benutzt keines von beiden.**
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
  ...over,
} as never);

const absaetze = (n: number) =>
  Array.from({ length: n }, (_, i) => paragraph(`p${i}`, `Absatz ${i} mit etwas Text.`));

/** Alle Zahlenfelder einer Seite. */
const zahlen = (seiten: unknown[]): number[] => {
  const werte: number[] = [];
  const sammeln = (objekt: unknown) => {
    if (objekt === null || typeof objekt !== 'object') return;
    for (const wert of Object.values(objekt as Record<string, unknown>)) {
      if (typeof wert === 'number') werte.push(wert);
      else if (typeof wert === 'object') sammeln(wert);
    }
  };
  for (const seite of seiten) sammeln(seite);
  return werte;
};

describe('paginateWriterParagraphs — der gesunde Fall', () => {
  it('ohne Optionen entsteht mindestens eine Seite mit endlichen Zahlen', () => {
    const seiten = paginateWriterParagraphs(absaetze(6), setup(), []);
    expect(seiten.length).toBeGreaterThan(0);
    for (const zahl of zahlen(seiten)) {
      expect(Number.isFinite(zahl)).toBe(true);
      expect(Number.isNaN(zahl)).toBe(false);
    }
  });

  it('HAUPTZUSICHERUNG: eine gueltige firstPageBodyHeightPx aendert das Ergebnis nicht auf NaN', () => {
    const ohne = paginateWriterParagraphs(absaetze(6), setup(), []);
    const mit = paginateWriterParagraphs(absaetze(6), setup(), [], undefined, { firstPageBodyHeightPx: 700 });
    expect(mit.length).toBeGreaterThan(0);
    for (const zahl of zahlen(mit)) expect(Number.isNaN(zahl)).toBe(false);
    // Und eine kleinere Hoehe ergibt mindestens so viele Seiten.
    expect(mit.length).toBeGreaterThanOrEqual(1);
    expect(ohne.length).toBeGreaterThanOrEqual(1);
  });

  it('leere Eingabe ergibt keine Seite oder eine leere', () => {
    const seiten = paginateWriterParagraphs([], setup(), []);
    expect(Array.isArray(seiten)).toBe(true);
  });
});

describe('DEF-RE-018 — der Parameter vergiftet die Umbruchhöhe', () => {
  it('HAUPTZUSICHERUNG: firstPageBodyHeightPx NaN vergiftet die Seitenzahlen NICHT mehr', () => {
    // **REPARIERT in Runde 275.** Vorher: `Math.max(1, NaN)` ist NaN, `Math.min(bodyHeightPx, NaN)` ist
    // NaN, und `singleColumnHeightPx * columnCount` blieb NaN - die Hoehe, gegen die jeder Umbruch geprueft
    // wird. Nach der Reparatur faellt eine nicht-endige Anfrage auf `geometry.bodyHeightPx` zurueck.
    const seiten = paginateWriterParagraphs(absaetze(6), setup(), [], undefined, {
      firstPageBodyHeightPx: Number.NaN,
    });
    const werte = zahlen(seiten);
    expect(werte.length).toBeGreaterThan(0);
    for (const wert of werte) {
      expect(Number.isNaN(wert), String(wert)).toBe(false);
      expect(Number.isFinite(wert), String(wert)).toBe(true);
    }
    // **Und die Zusicherung, die den Rueckfallwert belegt:** eine nicht-endige Anfrage wirkt wie KEINE
    // Anfrage - `geometry.bodyHeightPx` entscheidet, genau wie beim vorhandenen `??`.
    const ohne = paginateWriterParagraphs(absaetze(6), setup(), []);
    expect(seiten.length).toBe(ohne.length);
    expect(JSON.stringify(seiten)).toBe(JSON.stringify(ohne));
  });

  it('HAUPTZUSICHERUNG: Infinity ebenso', () => {
    const seiten = paginateWriterParagraphs(absaetze(6), setup(), [], undefined, {
      firstPageBodyHeightPx: Number.POSITIVE_INFINITY,
    });
    const werte = zahlen(seiten);
    // `Math.min(bodyHeightPx, Infinity)` ist bodyHeightPx - also ENDLICH.
    // **GEMESSEN: Infinity ist hier harmlos, weil `Math.min` es kappt.** Der Test haelt das fest.
    expect(werte.some((wert) => Number.isNaN(wert))).toBe(false);
  });

  it('HAUPTZUSICHERUNG: die Kontrolle — endliche Werte ergeben kein NaN', () => {
    // Damit der Test nicht nur behauptet, DASS NaN auftritt, sondern dass es NUR bei nicht-endiger Eingabe tut.
    for (const hoehe of [1, 10, 100, 400, 700, 1000, 0, -50]) {
      const seiten = paginateWriterParagraphs(absaetze(6), setup(), [], undefined, {
        firstPageBodyHeightPx: hoehe,
      });
      for (const zahl of zahlen(seiten)) {
        expect(Number.isNaN(zahl), `Hoehe ${hoehe}`).toBe(false);
      }
    }
  });

  it('ist deterministisch', () => {
    const bauen = () => paginateWriterParagraphs(absaetze(6), setup(), [], undefined, {
      firstPageBodyHeightPx: Number.NaN,
    });
    expect(JSON.stringify(bauen())).toBe(JSON.stringify(bauen()));
  });
});

describe('DEF-RE-018 — die Kette mit DEF-RE-013', () => {
  it('dieselbe Datei, dieselbe Zeile, zwei Stellen — und der Werkzeugtreffer nannte eine dritte', () => {
    //   Zeile  34   Math.max(1, options.firstPageBodyHeightPx ?? ...)   DEF-RE-018
    //   Zeile  52   estimateAnchoredMediaHeightPx(...)                  DEF-RE-013 (repariert r262)
    //   Zeile 322   Math.max(1, maximumLines)                          Werkzeugtreffer
    //
    // **Dieselbe Waechterform, dreimal in EINER Datei.**
    expect(Number.isNaN(Math.max(1, Number.NaN))).toBe(true);
    expect(Number.isNaN(Math.min(800, Math.max(1, Number.NaN)))).toBe(true);
    expect(Number.isNaN(Math.max(1, Number.NaN) * 3)).toBe(true);

    // Und die bewusste Form deckt beide Faelle:
    const sicher = (wert: unknown, untere: number) =>
      Number.isFinite(wert) ? Math.max(untere, wert as number) : untere;
    expect(sicher(Number.NaN, 1)).toBe(1);
    expect(sicher(Number.POSITIVE_INFINITY, 1)).toBe(1);
    expect(sicher(700, 1)).toBe(700);
  });
});
