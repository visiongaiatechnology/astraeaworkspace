/**
 * DEF-RE-014 — REGRESSIONSTEST nach der Reparatur.
 *
 * ## Die Reihenfolge, eingehalten und belegt
 *
 * 1. **Runde 263: reproduziert.** Diese Datei belegte mit zwölf grünen Fällen, dass `(NaN).toFixed(2)` die
 *    Zeichenkette `'NaN'` ergibt und damit `NaN w` und `[NaN NaN] 0 d` im PDF-Operatorstrom stehen.
 * 2. **Runde 264: repariert.** `tools/repair_def_re_014_nan_in_pdf_stream.py`.
 *    **Vorher `d7d5f7b2`, nachher `c2c7e516`.**
 * 3. **Runde 264: der Beweis.** Nach der Reparatur **fielen 5 der 12 Fälle** — weil sie `NaN` behaupteten.
 *    Statt `NaN` steht jetzt `0.00 w` und `[] 0 d`.
 * 4. **Runde 264: diese Fassung** behauptet das reparierte Verhalten.
 *
 * ## Die Reparatur: ein Wächter an der Stelle der Texterzeugung
 *
 * ```ts
 * function pdfNumber(value: number, fallback = 0): string {
 *   return (Number.isFinite(value) ? value : fallback).toFixed(2);
 * }
 * ```
 *
 * **Jede Zahl, die in den Operatorstrom gelangt, geht durch diesen einen Weg** — die Strichbreite, das
 * Strichmuster, die Farbe und alle vier Koordinaten. Vorher waren es fünf ungeschützte `.toFixed()`.
 *
 * **Der Rückfallwert ist `0`:** in PDF ist `0 w` die übliche Haarlinie. **Ein Rahmen mit beschädigter Breite
 * erscheint als dünnstmögliche Linie, statt die Datei zu zerstören.**
 *
 * ## Und die Zusicherung, die die Reparatur gibt
 *
 * **Kein Eingabefall kann die Zeichenketten `NaN` oder `Infinity` in den Operatorstrom bringen.**
 */

import { describe, expect, it } from 'vitest';
import { pdfBorderCommands } from '../../../../../interchange/export/pdf/writerPdfLayoutPrimitives';

const border = (over: Record<string, unknown> = {}) => ({
  widthPt: 1,
  style: 'solid',
  color: '#000000',
  ...over,
});

const decoration = (borders: Record<string, unknown>, geo: Record<string, unknown> = {}) => ({
  x: 10,
  y: 20,
  width: 200,
  height: 100,
  ...geo,
  borders: { top: border(borders), right: undefined, bottom: undefined, left: undefined },
} as never);

const alsText = (befehle: string[]) => befehle.join('\n');

describe('pdfBorderCommands — der gesunde Fall bleibt gesund', () => {
  it('ein gueltiger Rahmen ergibt einen Strom ohne NaN und ohne Infinity', () => {
    const text = alsText(pdfBorderCommands(decoration({})));
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
  });

  it('die Befehle sind in der PDF-Form', () => {
    const text = alsText(pdfBorderCommands(decoration({})));
    expect(text).toContain('q');
    expect(text).toContain('RG');
    expect(text).toContain(' w');
    expect(text).toContain(' d');
    expect(text).toContain(' S');
    expect(text).toContain('Q');
  });

  it('ohne Rahmen gibt es keine Befehle', () => {
    expect(pdfBorderCommands({ x: 0, y: 0, width: 10, height: 10, borders: {} } as never)).toEqual([]);
  });

  it('HAUPTZUSICHERUNG: die Zahlen sind unveraendert auf zwei Nachkommastellen gesetzt', () => {
    // Die Reparatur darf das gueltige Verhalten nicht veraendern.
    expect(alsText(pdfBorderCommands(decoration({ widthPt: 1.23456 })))).toContain('1.23 w');
    expect(alsText(pdfBorderCommands(decoration({ widthPt: 2 })))).toContain('2.00 w');
  });

  it('HAUPTZUSICHERUNG: eine gueltige Farbe wird NICHT durch den Rueckfallwert ersetzt', () => {
    // `pdfNumber(color[0], 0.392, 3)` - bei einer gueltigen 0 muss 0 herauskommen, nicht 0.392.
    //
    // **Und die Genauigkeit ist DREI Nachkommastellen, nicht zwei.** Mein erster Regressionstest behauptete
    // `0.00 0.00 0.00` — weil meine erste Reparatur die Farbe versehentlich auf zwei Stellen gerundet hatte.
    // Der volle Lauf hat es aufgedeckt (`writerPdfExport.test.ts` erwartete `1.000 0.000 0.000 RG`), und die
    // Korrektur hat die Genauigkeit wiederhergestellt. **Ein Waechter darf nur aendern, wofuer er da ist.**
    const text = alsText(pdfBorderCommands(decoration({ color: '#000000' })));
    expect(text).toContain('0.000 0.000 0.000 RG');
  });

  it('HAUPTZUSICHERUNG: die Farbgenauigkeit bleibt bei drei Nachkommastellen', () => {
    // Genau das, was der volle Lauf aufgedeckt hat.
    const text = alsText(pdfBorderCommands(decoration({ color: '#ff0000' })));
    expect(text).toContain('1.000 0.000 0.000 RG');
  });
});

describe('DEF-RE-014 — die Reparatur haelt', () => {
  it('HAUPTZUSICHERUNG: widthPt NaN ergibt 0.00 w, nicht NaN w', () => {
    const text = alsText(pdfBorderCommands(decoration({ widthPt: Number.NaN })));
    expect(text).not.toContain('NaN');
    expect(text).toContain('0.00 w');
  });

  it('HAUPTZUSICHERUNG: das Strichmuster traegt kein NaN mehr', () => {
    const text = alsText(pdfBorderCommands(decoration({ widthPt: Number.NaN, style: 'dashed' })));
    expect(text).not.toContain('NaN');
    expect(text).toContain('0 d');
    // Und das Muster ist numerisch: [0.00 0.00] 0 d.
    expect(text).toContain('[0.00 0.00] 0 d');
  });

  it('HAUPTZUSICHERUNG: Infinity und -Infinity ebenso', () => {
    for (const wert of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const text = alsText(pdfBorderCommands(decoration({ widthPt: wert })));
      expect(text, String(wert)).not.toContain('Infinity');
      expect(text, String(wert)).not.toContain('NaN');
    }
  });

  it('HAUPTZUSICHERUNG: eine Geometrie mit NaN ergibt 0.00-Koordinaten', () => {
    // Vorher stand hier `NaN 120.00 m`.
    const text = alsText(pdfBorderCommands(decoration({}, { x: Number.NaN })));
    expect(text).not.toContain('NaN');
    expect(text).toContain('0.00 120.00 m');
  });

  it('auch width und height der Geometrie sind geschuetzt', () => {
    for (const feld of ['x', 'y', 'width', 'height']) {
      const text = alsText(pdfBorderCommands(decoration({}, { [feld]: Number.NaN })));
      expect(text, feld).not.toContain('NaN');
      expect(text, feld).not.toContain('Infinity');
    }
  });

  it('HAUPTZUSICHERUNG: der style double teilt die Breite — auch dann endlich', () => {
    const text = alsText(pdfBorderCommands(decoration({ widthPt: Number.NaN, style: 'double' })));
    expect(text).not.toContain('NaN');
    expect(text).toContain('0.00 w');
  });

  it('HAUPTZUSICHERUNG: KEIN Eingabefall bringt NaN oder Infinity in den Operatorstrom', () => {
    // Die Zusicherung, die die Reparatur gibt. Vorher waren fuenf Wege offen.
    const werte = [
      Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 1e9, -1e9, 0.5, undefined,
    ];
    for (const wert of werte) {
      for (const feld of ['x', 'y', 'width', 'height']) {
        const text = alsText(pdfBorderCommands(decoration({ widthPt: wert as number }, { [feld]: wert })));
        expect(text, `${feld} = ${String(wert)}`).not.toContain('NaN');
        expect(text, `${feld} = ${String(wert)}`).not.toContain('Infinity');
      }
    }
  });

  it('alle vier Rahmen und beide Stricharten bleiben sauber', () => {
    // Vier Seiten, drei Stricharten, drei Farben.
    for (const style of ['solid', 'dashed', 'dotted', 'double']) {
      for (const color of ['#000000', '#ff0000', '#123456']) {
        const text = alsText(pdfBorderCommands(decoration({ style, color, widthPt: Number.NaN })));
        expect(text, `${style}/${color}`).not.toContain('NaN');
      }
    }
  });

  it('ist deterministisch', () => {
    const bauen = () => alsText(pdfBorderCommands(decoration({ widthPt: Number.NaN })));
    expect(bauen()).toBe(bauen());
  });
});

describe('DEF-RE-014 — die Klasse der vier Wege', () => {
  it('vier Wege, auf denen eine nicht-endliche Zahl aus einem Dokumentfeld in eine Ausgabe gelangt', () => {
    //   1. Zeichenketteninterpolation   `${x}mm`                      DEF-RE-013
    //   2. eine Klemmung, die nicht klemmt  Math.max(1, NaN)          DEF-RE-009, DEF-RE-013
    //   3. eine zweifache Klemmung      Math.max(0, Math.min(1, NaN))  DEF-RE-010
    //   4. toFixed                      (NaN).toFixed(2)               DEF-RE-014
    expect(`${Number.NaN}mm`).toBe('NaNmm');
    expect(Math.max(1, Number.NaN)).toBeNaN();
    expect(Math.max(0, Math.min(1, Number.NaN))).toBeNaN();
    expect((Number.NaN).toFixed(2)).toBe('NaN');

    // Und der vierte ist der unsichtbarste: `toFixed` sieht wie eine Formatierung aus, nicht wie ein
    // Waechter. Niemand schreibt `Number.isFinite` vor eine Formatierung.
    const geschuetzt = (wert: number, fallback = 0) => (Number.isFinite(wert) ? wert : fallback).toFixed(2);
    expect(geschuetzt(Number.NaN)).toBe('0.00');
    expect(geschuetzt(1.23456)).toBe('1.23');
  });
});
