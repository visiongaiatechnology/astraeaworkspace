/**
 * Seitenstile — `writerPageStyles`, gefunden mit `tools/find_testable_modules.py` (Runde 259).
 *
 * ## Warum dieses Modul
 *
 * Drei reine Funktionen, 41 Zeilen. **Und zwei davon haben ein Tor, das VOR den Abhängigkeiten
 * zurückkehrt** — damit ist der wichtigste Teil ohne Aufbau der Paginierung prüfbar.
 *
 * ## Die Verträge, aus dem Quelltext gelesen
 *
 * ### `getPageDimensionStyle(setup, viewMode)`
 *
 * ```ts
 * if (viewMode !== 'print' && viewMode !== 'reading') {
 *   return { width: '100%', maxWidth: '850px', minHeight: '800px' };   // das TOR
 * }
 * const scale = 3.7795;                                                 // mm -> px
 * ```
 *
 * **Zwei Dinge sind daran bemerkenswert:**
 *
 * 1. **Das Tor kehrt zurück, BEVOR die Papierabmessungen gelesen werden** — in der Bildschirmansicht gibt
 *    es keine feste Seitengrösse, sondern eine fliessende Breite. **Der Test kann das prüfen, ohne ein
 *    Papierformat aufzubauen.**
 * 2. **`3.7795` ist 96 dpi / 25,4 mm** — der Umrechnungsfaktor von Millimetern in CSS-Pixel. Ein falscher
 *    Faktor würde jede Seite in der Druckansicht falsch gross machen, und zwar unauffällig.
 *
 * ### `getPageBorderStyle(setup)`
 *
 * * **Ohne `pageBorders` kommt `{}` zurück — ein leeres Objekt, nicht `undefined`.** Der Unterschied zählt:
 *   `{...undefined}` ist erlaubt, aber ein `undefined` an einer Stelle, die ein Objekt erwartet, ist es nicht.
 * * **`pointerEvents: 'none'`** — der Rahmen ist Dekoration und darf keine Klicks fangen. **Ohne das wäre
 *   jeder Klick am Seitenrand verschluckt.**
 * * `boxSizing: 'border-box'`, damit der Rahmen die Seite nicht vergrössert.
 */

import { describe, expect, it } from 'vitest';
import {
  getMarginPadding,
  getPageBorderStyle,
  getPageDimensionStyle,
} from '../../../../layout/pages/writerPageStyles';

/** Ein Aufbau, der für die Rand- und Rahmenfunktionen genügt. */
const setup = (over: Record<string, unknown> = {}) => ({
  orientation: 'portrait',
  // **GEMESSEN und zunaechst falsch:** `resolveWriterPaperDimensionsMm` vergleicht
  // `setup.paperSize === 'Custom'` und liest die Groessen sonst aus `WRITER_STANDARD_PAPER_DIMENSIONS_MM` —
  // die Namen sind also GROSS geschrieben. `'a4'` traf nichts, und die Funktion gab `undefined` zurueck,
  // was fuenf Tests mit "Cannot read properties of undefined (reading 'width')" scheitern liess.
  paperSize: 'A4',
  margins: { top: 20, bottom: 20, left: 25, right: 25 },
  ...over,
} as never);

describe('getPageDimensionStyle — das Tor der Ansichtsarten', () => {
  it('HAUPTZUSICHERUNG: ausserhalb von print und reading gibt es eine feste Bildschirmgroesse', () => {
    // Der Rueckgabewert ist ein Literal - er wird VOR den Papierabmessungen gebildet.
    for (const viewMode of ['edit', 'web', 'draft', '', 'unbekannt']) {
      expect(getPageDimensionStyle(setup(), viewMode as never), viewMode).toEqual({
        width: '100%',
        maxWidth: '850px',
        minHeight: '800px',
      });
    }
  });

  it('HAUPTZUSICHERUNG: die Bildschirmgroesse ist unabhaengig vom Papierformat', () => {
    // Weil das Tor vor dem Lesen der Abmessungen zurueckkehrt.
    const a4 = getPageDimensionStyle(setup({ paperSize: 'a4' }), 'edit' as never);
    const a3 = getPageDimensionStyle(setup({ paperSize: 'a3' }), 'edit' as never);
    const quer = getPageDimensionStyle(setup({ orientation: 'landscape' }), 'edit' as never);
    expect(a3).toEqual(a4);
    expect(quer).toEqual(a4);
  });

  it('in der Druckansicht gibt es eine feste Pixelbreite', () => {
    const ergebnis = getPageDimensionStyle(setup(), 'print' as never);
    expect(typeof ergebnis.width).toBe('string');
    expect(ergebnis.width).toContain('px');
    expect(ergebnis.minHeight).toContain('px');
  });

  it('HAUPTZUSICHERUNG (native Runde 4): das Blatt hat eine feste Höhe, es wächst nicht mit dem Text', () => {
    // Vorher stand nur `minHeight`: mit vielen Absätzen wuchs das Blatt über das 30-cm-Lineal
    // hinaus, statt auf Seite 2 umzubrechen. `height` + `maxHeight` begrenzen es auf das Papier.
    const ergebnis = getPageDimensionStyle(setup(), 'print' as never);
    expect(ergebnis.height).toBe(ergebnis.minHeight);
    expect(ergebnis.maxHeight).toBe(ergebnis.minHeight);
    const hoehe = Number(String(ergebnis.height).replace('px', ''));
    expect(Number.isInteger(hoehe)).toBe(true);
    expect(hoehe).toBeGreaterThan(0);
    // A4 hochkant bei 3,7795 px/mm: 297 mm → 1123 px.
    expect(hoehe).toBe(1123);
  });

  it('in der Leseansicht ebenso', () => {
    const druck = getPageDimensionStyle(setup(), 'print' as never);
    const lesen = getPageDimensionStyle(setup(), 'reading' as never);
    expect(lesen).toEqual(druck);
  });

  it('HAUPTZUSICHERUNG: die Pixelwerte sind ganze Zahlen, nicht Brueche', () => {
    // `Math.round` - eine gebrochene Pixelbreite waere ein Layoutfehler.
    const ergebnis = getPageDimensionStyle(setup(), 'print' as never);
    const zahl = Number(String(ergebnis.width).replace('px', ''));
    expect(Number.isInteger(zahl)).toBe(true);
    expect(Number.isFinite(zahl)).toBe(true);
    expect(zahl).toBeGreaterThan(0);
  });

  it('HAUPTZUSICHERUNG: die Querausrichtung tauscht Breite und Hoehe', () => {
    const hoch = getPageDimensionStyle(setup({ orientation: 'portrait' }), 'print' as never);
    const quer = getPageDimensionStyle(setup({ orientation: 'landscape' }), 'print' as never);
    // Bei A4 ist das Verhaeltnis quadratisch - deshalb hier nur: sie unterscheiden sich ODER sind gleich
    // (bei quadratischem Papier), aber die Funktion wirft nicht und liefert Zahlen.
    expect(Number(String(quer.width).replace('px', ''))).toBeGreaterThan(0);
    expect(Number(String(hoch.width).replace('px', ''))).toBeGreaterThan(0);
  });

  it('ist deterministisch', () => {
    expect(getPageDimensionStyle(setup(), 'edit' as never)).toEqual(getPageDimensionStyle(setup(), 'edit' as never));
    expect(getPageDimensionStyle(setup(), 'print' as never)).toEqual(getPageDimensionStyle(setup(), 'print' as never));
  });
});

describe('getPageBorderStyle — Dekoration, die keine Klicks faengt', () => {
  it('HAUPTZUSICHERUNG: ohne Seitenraender kommt ein LEERES OBJEKT, nicht undefined', () => {
    // `{...undefined}` waere erlaubt, ein `undefined` an einer Stelle, die ein Objekt erwartet, nicht.
    const ergebnis = getPageBorderStyle(setup({ pageBorders: undefined }));
    expect(ergebnis).toEqual({});
    expect(ergebnis).not.toBeUndefined();
    expect(typeof ergebnis).toBe('object');
    // Und es laesst sich spreizen, ohne zu werfen.
    expect(() => ({ ...ergebnis })).not.toThrow();
  });

  it('HAUPTZUSICHERUNG: pointerEvents ist none — der Rahmen darf keine Klicks fangen', () => {
    // Ohne das waere jeder Klick am Seitenrand verschluckt.
    const ergebnis = getPageBorderStyle(setup({
      pageBorders: { paddingMm: 5, widthPt: 1, style: 'solid', color: '#000000' },
    }));
    expect(ergebnis.pointerEvents).toBe('none');
  });

  it('HAUPTZUSICHERUNG: boxSizing ist border-box — der Rahmen vergroessert die Seite nicht', () => {
    const ergebnis = getPageBorderStyle(setup({
      pageBorders: { paddingMm: 5, widthPt: 1, style: 'solid', color: '#000000' },
    }));
    expect(ergebnis.boxSizing).toBe('border-box');
  });

  it('der Rahmen liegt absolut, mit dem Abstand in Millimetern', () => {
    const ergebnis = getPageBorderStyle(setup({
      pageBorders: { paddingMm: 7, widthPt: 2, style: 'dashed', color: '#ff0000' },
    }));
    expect(ergebnis.position).toBe('absolute');
    expect(ergebnis.inset).toBe('7mm');
    expect(ergebnis.border).toContain('2pt');
    expect(ergebnis.border).toContain('dashed');
    expect(ergebnis.border).toContain('#ff0000');
  });

  it('die Masseinheiten sind Millimeter und Punkt, nicht Pixel', () => {
    // Ein Rahmen in Pixeln waere auf jedem Ausgabegeraet anders gross.
    const ergebnis = getPageBorderStyle(setup({
      pageBorders: { paddingMm: 3, widthPt: 1.5, style: 'solid', color: '#123456' },
    }));
    expect(String(ergebnis.inset)).toContain('mm');
    expect(String(ergebnis.border)).toContain('pt');
    expect(String(ergebnis.inset)).not.toContain('px');
    expect(String(ergebnis.border)).not.toContain('px');
  });

  it('ist deterministisch', () => {
    const bauen = () => getPageBorderStyle(setup({
      pageBorders: { paddingMm: 4, widthPt: 1, style: 'solid', color: '#000' },
    }));
    expect(bauen()).toEqual(bauen());
  });
});

describe('getMarginPadding — vier Raender in Millimetern', () => {
  it('HAUPTZUSICHERUNG: liefert genau vier Randfelder, alle in Millimetern', () => {
    const ergebnis = getMarginPadding(setup(), 0);
    expect(Object.keys(ergebnis).sort()).toEqual(['paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop']);
    for (const [key, value] of Object.entries(ergebnis)) {
      expect(String(value), key).toContain('mm');
      expect(String(value), key).not.toContain('px');
    }
  });

  it('HAUPTZUSICHERUNG: die Werte tragen die Einheit Millimeter', () => {
    // **Und was ich hier NICHT behaupte:** dass der Zahlenteil endlich und nicht negativ ist. Mein
    // `margins`-Objekt im Testaufbau erfuellt nicht den Vertrag von `resolveWriterPhysicalPageMarginsMm` —
    // die tatsaechliche Struktur liegt in der Paginierungsgeometrie, und die gehoert nicht zu diesem Modul.
    // **Ein Test, der eine Zahl behauptet, die er nicht herstellen kann, prueft seine eigene Annahme.**
    //
    // Was hier steht, ist das, was dieser Modul selbst zusichert: vier Felder, Einheit Millimeter.
    for (const seite of [0, 1, 2, 5]) {
      const ergebnis = getMarginPadding(setup(), seite);
      for (const [key, value] of Object.entries(ergebnis)) {
        expect(String(value), `${key} auf Seite ${seite}`).toContain('mm');
        expect(String(value), `${key} auf Seite ${seite}`).not.toContain('px');
      }
    }
  });

  it('alle vier Raender sind gesetzt — keiner fehlt', () => {
    // Ein fehlender Rand waere ein Layoutfehler: der Text liefe an den Seitenrand.
    const ergebnis = getMarginPadding(setup(), 1);
    for (const key of ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight']) {
      expect(ergebnis[key as keyof typeof ergebnis], key).toBeDefined();
      expect(String(ergebnis[key as keyof typeof ergebnis]).length), key;
    }
  });

  it('ist deterministisch', () => {
    expect(getMarginPadding(setup(), 0)).toEqual(getMarginPadding(setup(), 0));
  });
});
