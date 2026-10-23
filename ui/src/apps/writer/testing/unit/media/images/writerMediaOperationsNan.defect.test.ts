/**
 * DEF-RE-016 — REGRESSIONSTEST nach der Reparatur.
 *
 * ## Die Reihenfolge, eingehalten und belegt
 *
 * 1. **Runde 267: reproduziert.** 13 grüne Fälle belegten `brightness(NaN%)` und `inset(1% NaN% 0% 0%)`.
 * 2. **Runde 268: repariert.** `tools/repair_def_re_016_nan_in_css.py`.
 *    **Vorher `97004bbe`, nachher `3e414bfa`.**
 * 3. **Runde 268: der Beweis.** Nach der Reparatur **fielen 5 der 13 Fälle** — alle fünf NaN-Zusicherungen.
 * 4. **Runde 268: diese Fassung.**
 *
 * ## Und eine Selbstkorrektur aus Runde 240, die hier steht
 *
 * **In Runde 240 habe ich `brightness(NaN%)` GEMESSEN und als Problem eines unvollständigen *Testobjekts*
 * eingeordnet.** Es ist dieselbe Klasse wie DEF-RE-009 bis DEF-RE-015: **eine nicht-endliche Zahl aus einem
 * DOKUMENTFELD erreicht eine Ausgabe.** `image.adjustments` kommt aus dem Dokument.
 *
 * **Der Test war nicht falsch — die Einordnung war es.**
 *
 * ## Die Reparatur
 *
 * **Bei den Filtern sitzt der Wächter auf dem Wert, den der Zweig PRÜFT** — eine nicht-endige Anpassung
 * betritt den Zweig also gar nicht, und der vorhandene `'none'`-Rückfall greift. **Bei jedem der drei Werte
 * einzeln.**
 *
 * **Beim Zuschnitt geht jeder Rand durch EINE geschützte Klemmung.**
 *
 * **Der Rückfallwert ist `0`** — bei einer Helligkeitsverschiebung „keine Anpassung", bei einem
 * Zuschnittrand „kein Beschnitt von dieser Seite". **Beides ist das neutrale Element der Operation, keine
 * erfundene Politik**, und beide behalten die vorhandenen Schranken.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveImageFilters,
  resolveImageTransforms,
} from '../../../../media/images/operations/writerMediaOperations';

const anpassungen = (over: Record<string, unknown> = {}) => ({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  grayscale: false,
  sepia: false,
  invert: false,
  ...over,
});

const zuschnitt = (over: Record<string, unknown> = {}) => ({
  topPercent: 0,
  rightPercent: 0,
  bottomPercent: 0,
  leftPercent: 0,
  ...over,
});

const NICHT_ENDLICH = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe('resolveImageFilters — das gueltige Verhalten ist unveraendert', () => {
  it('die Verschiebung um 100 und die Klemmung bleiben', () => {
    // Die Reparatur darf nichts davon aendern.
    expect(resolveImageFilters(anpassungen({ brightness: 20 }) as never)).toBe('brightness(120%)');
    expect(resolveImageFilters(anpassungen({ contrast: -30 }) as never)).toBe('contrast(70%)');
    expect(resolveImageFilters(anpassungen({ saturation: 100 }) as never)).toBe('saturate(200%)');
    expect(resolveImageFilters(anpassungen({ brightness: -200 }) as never)).toBe('brightness(0%)');
    expect(resolveImageFilters(anpassungen() as never)).toBe('none');
  });

  it('die Schalter und die Reihenfolge bleiben', () => {
    expect(resolveImageFilters(anpassungen({ grayscale: true }) as never)).toBe('grayscale(100%)');
    expect(resolveImageFilters(anpassungen({ sepia: true }) as never)).toBe('sepia(100%)');
    expect(resolveImageFilters(anpassungen({ invert: true }) as never)).toBe('invert(100%)');
    expect(resolveImageFilters(anpassungen({ brightness: 10, grayscale: true, invert: true }) as never))
      .toBe('brightness(110%) grayscale(100%) invert(100%)');
  });
});

describe('DEF-RE-016 — die Reparatur haelt', () => {
  it('HAUPTZUSICHERUNG: kein nicht-endiger Wert erreicht den Filtertext', () => {
    for (const wert of NICHT_ENDLICH) {
      for (const feld of ['brightness', 'contrast', 'saturation']) {
        const text = resolveImageFilters(anpassungen({ [feld]: wert }) as never);
        expect(text, `${feld} = ${wert}`).not.toContain('NaN');
        expect(text, `${feld} = ${wert}`).not.toContain('Infinity');
      }
    }
  });

  it('HAUPTZUSICHERUNG: eine nicht-endige Anpassung ergibt none — sie betritt den Zweig nicht', () => {
    // Der Waechter sitzt auf dem Wert, den der Zweig PRUEFT. Also greift der vorhandene 'none'-Rueckfall.
    expect(resolveImageFilters(anpassungen({ brightness: Number.NaN }) as never)).toBe('none');
    expect(resolveImageFilters(anpassungen({ contrast: Number.NaN }) as never)).toBe('none');
    expect(resolveImageFilters(anpassungen({ saturation: Number.NaN }) as never)).toBe('none');
    expect(resolveImageFilters(anpassungen({ brightness: Number.POSITIVE_INFINITY }) as never)).toBe('none');
  });

  it('HAUPTZUSICHERUNG: eine nicht-endige Anpassung loescht die ANDEREN nicht', () => {
    // Sie faellt auf 0 zurueck, also bleibt der Rest wirksam.
    expect(resolveImageFilters(anpassungen({ brightness: Number.NaN, grayscale: true }) as never))
      .toBe('grayscale(100%)');
    expect(resolveImageFilters(anpassungen({ brightness: Number.NaN, contrast: 20 }) as never))
      .toBe('contrast(120%)');
  });

  it('die Kontrolle: endliche Werte ergeben kein NaN', () => {
    for (const wert of [0, 1, -1, 50, -100, -200, 1e6]) {
      for (const feld of ['brightness', 'contrast', 'saturation']) {
        const text = resolveImageFilters(anpassungen({ [feld]: wert }) as never);
        expect(text, `${feld} = ${wert}`).not.toContain('NaN');
        expect(text, `${feld} = ${wert}`).not.toContain('Infinity');
      }
    }
  });
});

describe('DEF-RE-016 — der Zuschnitt', () => {
  it('HAUPTZUSICHERUNG: ein einzelner NaN-Rand bleibt inert — NaN > 0 ist falsch', () => {
    // Das war schon vorher so, durch Zufall statt Absicht. Die Reparatur aendert es nicht.
    for (const feld of ['topPercent', 'rightPercent', 'bottomPercent', 'leftPercent']) {
      expect(resolveImageTransforms(zuschnitt({ [feld]: Number.NaN }) as never).clipPath, feld).toBeUndefined();
    }
  });

  it('HAUPTZUSICHERUNG: der GEMISCHTE Fall — der vorher vergiftete — traegt kein NaN mehr', () => {
    const ergebnis = resolveImageTransforms(zuschnitt({ topPercent: 1, rightPercent: Number.NaN }) as never);
    expect(ergebnis.clipPath).toBeDefined();
    expect(ergebnis.clipPath).not.toContain('NaN');
    expect(ergebnis.clipPath).not.toContain('Infinity');
    // Und der gueltige Rand bleibt wirksam: unten rechts wird auf 0% zurueckgefallen.
    expect(ergebnis.clipPath).toBe('inset(1% 0% 0% 0%)');
  });

  it('HAUPTZUSICHERUNG: jeder der vier Raender einzeln, mit einem Oeffner', () => {
    const faelle: Array<[string, number]> = [
      ['topPercent', 0], ['rightPercent', 1], ['bottomPercent', 2], ['leftPercent', 3],
    ];
    for (const [feld, position] of faelle) {
      const oeffner = feld === 'topPercent' ? { rightPercent: 1 } : { topPercent: 1 };
      const ergebnis = resolveImageTransforms(zuschnitt({ ...oeffner, [feld]: Number.NaN }) as never);
      expect(ergebnis.clipPath, feld).not.toContain('NaN');
      const werte = String(ergebnis.clipPath).replace('inset(', '').replace(')', '').split(' ');
      expect(werte[position], feld).toBe('0%');
      // Das Ergebnis ist immer ein gueltiges inset mit vier Prozentwerten.
      expect(werte, feld).toHaveLength(4);
      for (const wert of werte) expect(wert, feld).toMatch(/^\d+(\.\d+)?%$/);
    }
  });

  it('HAUPTZUSICHERUNG: die vorhandenen Klemmungen bleiben wirksam', () => {
    // `Math.max(0, Math.min(100, x))` - die Reparatur behaelt beide Schranken.
    const ueber = resolveImageTransforms(zuschnitt({ topPercent: 500, rightPercent: 200, bottomPercent: -50 }) as never);
    expect(ueber.clipPath).toBe('inset(100% 100% 0% 0%)');
    const gueltig = resolveImageTransforms(zuschnitt({ topPercent: 10, rightPercent: 20, bottomPercent: 30, leftPercent: 40 }) as never);
    expect(gueltig.clipPath).toBe('inset(10% 20% 30% 40%)');
  });

  it('HAUPTZUSICHERUNG: kein Eingabefall bringt NaN in den clipPath', () => {
    const werte = [...NICHT_ENDLICH, 0, 1, 50, 100, -1, 500];
    for (const top of werte) {
      for (const right of werte) {
        const ergebnis = resolveImageTransforms(zuschnitt({ topPercent: top, rightPercent: right }) as never);
        expect(String(ergebnis.clipPath ?? ''), `top=${top} right=${right}`).not.toContain('NaN');
      }
    }
  });

  it('die Deckkraft bleibt repariert (DEF-RE-010)', () => {
    // Dieselbe Funktion, wenige Zeilen entfernt - und der Waechter ist da.
    expect(resolveImageTransforms(undefined, 0, false, false, Number.NaN).opacity).toBe(1);
    expect(resolveImageTransforms(undefined, 0, false, false, Number.POSITIVE_INFINITY).opacity).toBe(1);
  });

  it('ist deterministisch', () => {
    const bauen = () => resolveImageFilters(anpassungen({ brightness: Number.NaN }) as never);
    expect(bauen()).toBe(bauen());
  });
});
