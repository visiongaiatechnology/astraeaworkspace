/**
 * P25 / AST-0121 — Platzierungsregeln, Bildfilter und Beschriftungen.
 *
 * Drei Vertraege, aus dem Quelltext gelesen:
 *
 * ### `isWriterImageFixedToPage(image)` — fuenf Wege, alle mit demselben Ergebnis
 *
 * ```ts
 * return image.fixPositionOnPage === true
 *   || image.moveWithText === false
 *   || image.anchorTarget === 'page' || 'margin' | 'column';
 * ```
 *
 * **Fuenf Bedingungen, die einzeln wahr werden muessen** — und die heikle: `moveWithText === false` ist nur
 * bei **strikt** `false` wahr, nicht bei `undefined`.
 *
 * ### `resolveImageFilters(adjustments?)` — Prozentwerte, geklemmt
 *
 * `-100..+100` wird zu `0%..200%`, mit `Math.max(0, ...)`. Also **-200 wird auf 0% geklemmt, nicht negativ.**
 * Und ein Ergebnis ohne Filter ist die Zeichenkette `'none'` — **nicht der leere String**, denn der waere in
 * einem CSS-`filter`-Attribut ein anderer Fall.
 *
 * ### `resolveFigureCaption(image, figureIndex)` — idempotent
 *
 * Es **entfernt** ein vorhandenes `Abbildung N:` und setzt das richtige neu. **Zweimal angewendet darf es
 * deshalb nicht "Abbildung 1: Abbildung 1: Text" ergeben** — und genau das prueft der Test.
 */

import { describe, expect, it } from 'vitest';
import { isWriterImageFixedToPage } from '../../../../media/images/operations/writerMediaRules';
import {
  resolveFigureCaption,
  resolveImageFilters,
} from '../../../../media/images/operations/writerMediaOperations';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/workspace';

const image = (over: Record<string, unknown> = {}): WriterImageBlockData =>
  ({ id: 'img-1', dataUrl: 'data:image/png;base64,AA', ...over } as unknown as WriterImageBlockData);

describe('isWriterImageFixedToPage — fuenf Wege zur selben Antwort', () => {
  it('ist false, wenn keine der fuenf Bedingungen greift', () => {
    expect(isWriterImageFixedToPage(image())).toBe(false);
    // Und ausdrueckliche Gegenwerte aendern das nicht.
    expect(isWriterImageFixedToPage(image({ fixPositionOnPage: false, moveWithText: true }))).toBe(false);
  });

  it('fixPositionOnPage === true allein genuegt', () => {
    expect(isWriterImageFixedToPage(image({ fixPositionOnPage: true }))).toBe(true);
  });

  it('HAUPTZUSICHERUNG: moveWithText === false ist NUR bei strikt false wahr', () => {
    // `undefined` ist nicht `false`. Eine truthiness-Pruefung haette hier falsch geantwortet.
    expect(isWriterImageFixedToPage(image({ moveWithText: false }))).toBe(true);
    expect(isWriterImageFixedToPage(image({ moveWithText: true }))).toBe(false);
    expect(isWriterImageFixedToPage(image({ moveWithText: undefined }))).toBe(false);
  });

  it('jeder der drei Ankertypen genuegt einzeln', () => {
    for (const anchorTarget of ['page', 'margin', 'column'] as const) {
      expect(isWriterImageFixedToPage(image({ anchorTarget })), anchorTarget).toBe(true);
    }
  });

  it('andere Ankertypen sind nicht fixiert', () => {
    for (const anchorTarget of ['paragraph', 'character', 'inline', '', 'PAGE']) {
      expect(isWriterImageFixedToPage(image({ anchorTarget })), anchorTarget).toBe(false);
    }
  });

  it('die Bedingungen sind ODER-verknuepft — eine genuegt', () => {
    const alle = image({
      fixPositionOnPage: true, moveWithText: false, anchorTarget: 'page',
    });
    expect(isWriterImageFixedToPage(alle)).toBe(true);
    // Und eine einzelne genuegt, auch wenn die anderen nicht greifen.
    expect(isWriterImageFixedToPage(image({ anchorTarget: 'margin' }))).toBe(true);
  });
});

/**
 * Baut ein VOLLSTAENDIGES Anpassungsobjekt.
 *
 * **Warum das noetig ist, und was der erste Entwurf falsch machte:** ich uebergab Teilobjekte wie
 * `{ contrast: -30 }`. Der Quelltext prueft aber `adjustments.brightness !== 0` — und `undefined !== 0` ist
 * **wahr**, also entstand `brightness(NaN%)`. Vier Tests scheiterten daran.
 *
 * **Die Ursache ist mein Test, nicht der Code:** der Typ verlangt alle Felder, und meine `as never`-Casts
 * umgingen genau diese Zusicherung. Der Fall mit Teilobjekten steht trotzdem weiter unten als eigener,
 * GEMESSENER Fall — denn das Ergebnis `NaN%` ist ungueltiges CSS, und das soll sichtbar sein.
 */
const adjustments = (over: Partial<Record<'brightness' | 'contrast' | 'saturation' | 'grayscale' | 'sepia' | 'invert', number | boolean>> = {}) => ({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  grayscale: false,
  sepia: false,
  invert: false,
  ...over,
});

describe('resolveImageFilters — Prozentwerte und das Wort "none"', () => {
  it('ohne Anpassungen ist das Ergebnis die Zeichenkette none', () => {
    // Nicht der leere String: in einem CSS-`filter`-Attribut sind das zwei verschiedene Faelle.
    expect(resolveImageFilters()).toBe('none');
    expect(resolveImageFilters(undefined)).toBe('none');
  });

  it('Anpassungen ohne Wirkung ergeben ebenfalls none', () => {
    expect(resolveImageFilters(adjustments() as never)).toBe('none');
  });

  it('Helligkeit, Kontrast und Saettigung werden um 100 versetzt', () => {
    expect(resolveImageFilters(adjustments({ brightness: 20 }) as never)).toBe('brightness(120%)');
    expect(resolveImageFilters(adjustments({ contrast: -30 }) as never)).toBe('contrast(70%)');
    expect(resolveImageFilters(adjustments({ saturation: 100 }) as never)).toBe('saturate(200%)');
  });

  it('HAUPTZUSICHERUNG: ein Wert unter -100 wird auf 0% geklemmt, nie negativ', () => {
    // `Math.max(0, 100 + brightness)` - ein negativer Prozentwert waere ungueltiges CSS.
    expect(resolveImageFilters(adjustments({ brightness: -200 }) as never)).toBe('brightness(0%)');
    expect(resolveImageFilters(adjustments({ contrast: -1000 }) as never)).toBe('contrast(0%)');
    for (const value of [-100, -150, -5000]) {
      expect(resolveImageFilters(adjustments({ brightness: value }) as never)).not.toContain('-');
    }
  });

  it('die Schalter erzeugen feste 100%-Werte', () => {
    expect(resolveImageFilters(adjustments({ grayscale: true }) as never)).toBe('grayscale(100%)');
    expect(resolveImageFilters(adjustments({ sepia: true }) as never)).toBe('sepia(100%)');
    expect(resolveImageFilters(adjustments({ invert: true }) as never)).toBe('invert(100%)');
  });

  it('mehrere Filter werden mit Leerzeichen verbunden, in fester Reihenfolge', () => {
    const result = resolveImageFilters(adjustments({ brightness: 10, grayscale: true, invert: true }) as never);
    expect(result).toBe('brightness(110%) grayscale(100%) invert(100%)');
    expect(result.split(' ')).toHaveLength(3);
  });

  it('ist deterministisch', () => {
    const a = resolveImageFilters(adjustments({ brightness: 5, sepia: true }) as never);
    expect(resolveImageFilters(adjustments({ brightness: 5, sepia: true }) as never)).toBe(a);
  });

  it('REPARIERT (DEF-RE-016): ein Teilobjekt erzeugt KEIN NaN mehr', () => {
    // **Die Geschichte dieses Falls, weil sie lehrreich ist.**
    //
    // In Runde 240 stand hier: *„GEMESSEN: ein Teilobjekt erzeugt NaN% — der Code prueft `!== 0`, nicht auf
    // Endlichkeit"*, und der Test behauptete `expect(result).toContain('NaN')`.
    //
    // **Die Messung war richtig, die Einordnung falsch.** Ich habe es als Problem eines unvollstaendigen
    // Testobjekts gelesen. In Wahrheit war es dieselbe Klasse wie DEF-RE-009 bis DEF-RE-015: eine
    // nicht-endliche Zahl aus einem DOKUMENTFELD erreicht eine Ausgabe — `image.adjustments` kommt aus dem
    // Dokument, und `undefined !== 0` ist ebenso wahr wie `NaN !== 0`.
    //
    // Runde 268 hat es repariert: der Waechter sitzt jetzt auf dem Wert, den der Zweig PRUEFT.
    const teil = { contrast: -30 } as never;
    const result = resolveImageFilters(teil);
    expect(result).toBe('contrast(70%)');
    expect(result).not.toContain('NaN');
    expect(result).not.toContain('Infinity');
    // Und das vollstaendige Objekt ergibt dasselbe - der Unterschied ist verschwunden.
    expect(resolveImageFilters(adjustments({ contrast: -30 }) as never)).toBe(result);
  });
});

describe('resolveFigureCaption — die Beschriftung und ihre Idempotenz', () => {
  it('ohne Beschriftung bleibt nur das Praefix', () => {
    expect(resolveFigureCaption(image(), 1)).toBe('Abbildung 1');
    expect(resolveFigureCaption(image({ caption: '   ' }), 2)).toBe('Abbildung 2');
  });

  it('setzt Praefix und Text zusammen', () => {
    expect(resolveFigureCaption(image({ caption: 'Quartalsbericht' }), 3))
      .toBe('Abbildung 3: Quartalsbericht');
  });

  it('HAUPTZUSICHERUNG: ein vorhandenes Praefix wird ERSETZT, nicht verdoppelt', () => {
    // Ohne das Entfernen entstuende "Abbildung 1: Abbildung 1: Text".
    expect(resolveFigureCaption(image({ caption: 'Abbildung 9: Quartalsbericht' }), 1))
      .toBe('Abbildung 1: Quartalsbericht');
  });

  it('das Entfernen ist tolerant gegen Schreibweise und Leerzeichen', () => {
    for (const caption of [
      'abbildung 9: Text', 'ABBILDUNG 9:Text', 'Abbildung  9  :  Text', 'Abbildung 9:Text',
    ]) {
      expect(resolveFigureCaption(image({ caption }), 1), caption).toBe('Abbildung 1: Text');
    }
  });

  it('und deshalb ist die Funktion IDEMPOTENT', () => {
    // Zweimal angewendet darf sich nichts aendern.
    const einmal = resolveFigureCaption(image({ caption: 'Quartalsbericht' }), 4);
    const zweimal = resolveFigureCaption(image({ caption: einmal }), 4);
    expect(zweimal).toBe(einmal);
    expect(zweimal).toBe('Abbildung 4: Quartalsbericht');
  });

  it('eine Zahl im Text, die kein Praefix ist, bleibt erhalten', () => {
    expect(resolveFigureCaption(image({ caption: 'Umsatz 2026 in Zahlen' }), 1))
      .toBe('Abbildung 1: Umsatz 2026 in Zahlen');
  });

  it('der Index erscheint genau einmal', () => {
    const result = resolveFigureCaption(image({ caption: 'Abbildung 7: Text' }), 2);
    expect((result.match(/Abbildung/g) ?? [])).toHaveLength(1);
    expect(result).toContain('Abbildung 2');
  });
});
