/**
 * P20 / AST-0096 — `calculateClampedMenuPosition`: der dedizierte Unit-Test.
 *
 * ## Warum dieser Test neu geschrieben wurde
 *
 * Runde 221 hat gemessen, dass **vier Writer-Funktionen nur in breiten Acceptance-Dateien** auftauchen —
 * `calculateClampedMenuPosition` nur in `writerAcceptanceEditing.test.tsx`. **Damit war Paket P20 nicht
 * probierbar:** eine Mutation in einer 3000-Zeilen-Acceptance-Datei zu messen dauerte Minuten und wuerde den
 * Fehlschlag nicht dem Aufloeser zuordnen.
 *
 * **Dieser Test ist deshalb nicht nur ein Messmittel — er ist die Verbesserung selbst.**
 *
 * ## Der Vertrag, aus dem Quelltext gelesen
 *
 * ```
 * calculateClampedMenuPosition(x, y, menuWidth, menuHeight, viewportWidth, viewportHeight, pad = 12)
 * ```
 *
 * 1. **Vertikal:** ragt das Menue unten heraus (`y + menuHeight + pad > viewportHeight`), dann
 *    - **ueber den Zeiger klappen**, wenn oben Platz ist (`y - menuHeight >= pad`), sonst
 *    - **klemmen** auf `max(pad, viewportHeight - menuHeight - pad)`.
 * 2. **Horizontal:** symmetrisch.
 * 3. **Schlussklammerung** beider Achsen auf `[pad, max(pad, viewport - size - pad)]`.
 * 4. **Runden** der Ergebnisse.
 *
 * ## Die Erwartungswerte sind von Hand aus dem Vertrag gerechnet, nicht aus der Ausgabe abgeschrieben
 *
 * Ein Test, dessen Erwartung aus dem Code stammt, bestaetigt den Code. **Jede Zahl unten folgt aus der
 * Rechnung im Kommentar daneben** — nachpruefbar ohne die Funktion zu lesen.
 */

import { describe, expect, it } from 'vitest';
import { calculateClampedMenuPosition } from '../../../../editor/context-menu/WriterContextMenu';

describe('calculateClampedMenuPosition — der Menue-Vertrag', () => {
  it('laesst ein Menue in Ruhe, das nirgends herausragt', () => {
    // 100 + 150 + 12 = 262 <= 800 (vertikal), 100 + 200 + 12 = 312 <= 1000 (horizontal)
    expect(calculateClampedMenuPosition(100, 100, 200, 150, 1000, 800)).toEqual({ top: 100, left: 100 });
  });

  it('klappt ueber den Zeiger, wenn unten kein Platz ist und oben genug', () => {
    // 700 + 150 + 12 = 862 > 800 -> unten zu eng. 700 - 150 = 550 >= 12 -> oben Platz -> top = 550.
    expect(calculateClampedMenuPosition(100, 700, 200, 150, 1000, 800).top).toBe(550);
  });

  it('klappt nach links, wenn rechts kein Platz ist und links genug', () => {
    // 900 + 200 + 12 = 1112 > 1000 -> rechts zu eng. 900 - 200 = 700 >= 12 -> links Platz -> left = 700.
    expect(calculateClampedMenuPosition(900, 100, 200, 150, 1000, 800).left).toBe(700);
  });

  it('klemmt unten, wenn auch oben kein Platz ist', () => {
    // 100 + 700 + 12 = 812 > 800 -> unten zu eng. 100 - 700 = -600 < 12 -> oben auch nicht.
    // max(12, 800 - 700 - 12) = max(12, 88) = 88.
    expect(calculateClampedMenuPosition(100, 100, 200, 700, 1000, 800).top).toBe(88);
  });

  it('klemmt rechts, wenn auch links kein Platz ist', () => {
    // 100 + 900 + 12 = 1012 > 1000 -> rechts zu eng. 100 - 900 = -800 < 12 -> links auch nicht.
    // max(12, 1000 - 900 - 12) = max(12, 88) = 88.
    expect(calculateClampedMenuPosition(100, 100, 900, 150, 1000, 800).left).toBe(88);
  });

  it('Grenzfall: ein Menue GROESSER als der Bildschirm landet auf der Polsterung, nie im Negativen', () => {
    // 900 > 800: viewportHeight - menuHeight - pad = 800 - 900 - 12 = -112.
    // max(12, -112) = 12 -> beide Klammerungen ergeben 12. Nie negativ, nie ausserhalb.
    const result = calculateClampedMenuPosition(100, 100, 200, 900, 1000, 800);
    expect(result.top).toBe(12);
    expect(result.top).toBeGreaterThanOrEqual(0);
  });

  it('haelt die Polsterung an jeder Kante ein, auch bei einem Zeiger am Rand', () => {
    const pad = 12;
    for (const [x, y] of [[0, 0], [1000, 800], [999, 799], [-50, -50]] as const) {
      const result = calculateClampedMenuPosition(x, y, 200, 150, 1000, 800, pad);
      expect(result.left, `left bei (${x},${y})`).toBeGreaterThanOrEqual(pad);
      expect(result.top, `top bei (${x},${y})`).toBeGreaterThanOrEqual(pad);
      // Und nie ueber die Gegenkante hinaus.
      expect(result.left + 200).toBeLessThanOrEqual(1000 - pad);
      expect(result.top + 150).toBeLessThanOrEqual(800 - pad);
    }
  });

  it('rundet beide Achsen', () => {
    // Kein Ueberlauf: top = 100.4, left = 100.6 -> gerundet 100 und 101.
    expect(calculateClampedMenuPosition(100.6, 100.4, 200, 150, 1000, 800)).toEqual({ top: 100, left: 101 });
  });

  it('benutzt 12 als Standardpolsterung', () => {
    const mitStandard = calculateClampedMenuPosition(0, 0, 200, 150, 1000, 800);
    const mitZwölf = calculateClampedMenuPosition(0, 0, 200, 150, 1000, 800, 12);
    expect(mitStandard).toEqual(mitZwölf);
    expect(mitStandard.left).toBe(12);
  });

  it('ist deterministisch — dieselbe Eingabe, dasselbe Ergebnis', () => {
    const a = calculateClampedMenuPosition(321.5, 654.25, 240, 180, 1280, 720);
    const b = calculateClampedMenuPosition(321.5, 654.25, 240, 180, 1280, 720);
    expect(a).toEqual(b);
  });
});
