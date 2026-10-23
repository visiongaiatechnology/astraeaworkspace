/**
 * P34 / AST-0171 — Fussnoten und Endnoten: die reinen Funktionen aus `writerNotesEngine`.
 *
 * ## Warum dieses Modul
 *
 * Die Pakete 33 bis 35 hatten laut Runde 247 **66 Exporte und keinen dedizierten Test.** Dies ist der erste
 * Test fuer Paket 34.
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * ### `writerNoteReferenceOffset(note)` — die Reihenfolge innerhalb eines Absatzes
 *
 * ```ts
 * const raw = note.referenceTextOffset ?? note.referenceSpanIndex;
 * if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
 * return Math.max(0, Math.trunc(raw));
 * ```
 *
 * * **Zwei Feldnamen, ein Begriff.** Der Kommentar sagt: `referenceTextOffset` ist das, was das Einfuegen
 *   heute schreibt; `referenceSpanIndex` ist der **fruehere Name** — *"nothing ever wrote it, so it is read
 *   only so a hand-authored file that used it still orders correctly."* **Eine Kompatibilitaetslesung.**
 * * **0 bedeutet „unbekannt"** und ueberlaesst die Reihenfolge dem Register.
 * * **`Number.isFinite` ist da** — und wieder einmal ist das der Waechter, dessen Fehlen DEF-RE-009 und
 *   DEF-RE-010 ausmachte.
 *
 * ### `toRomanNumeral(num)` — und die Kuriositaet
 *
 * ```ts
 * if (num <= 0) return '1';
 * ```
 *
 * **Bei einer ungueltigen Eingabe wechselt die Funktion das Zahlensystem:** sie gibt die **arabische** `'1'`
 * zurueck, nicht `'i'`. Das ist kein Fehler im Sinne eines Absturzes, aber es ist eine Regel, die aus dem
 * Namen nicht ableitbar ist — **und der Test haelt sie fest.**
 *
 * ### `toAlphaLetter(num)` — bijektive Basis 26
 *
 * `a..z, aa, ab, ...` — **wie Spalten in einer Tabellenkalkulation.** Bei 26 ist es `z`, bei 27 `aa`:
 * das ist die bijektive Variante, nicht die gewoehnliche Basis-26-Darstellung (die bei 26 `ba` ergaebe).
 */

import { describe, expect, it } from 'vitest';
import {
  toAlphaLetter,
  toRomanNumeral,
  writerNoteReferenceOffset,
} from '../../../../references/notes/writerNotesEngine';

describe('toRomanNumeral — kleine roemische Zahlen', () => {
  it('bildet die Grundzahlen ab', () => {
    expect(toRomanNumeral(1)).toBe('i');
    expect(toRomanNumeral(2)).toBe('ii');
    expect(toRomanNumeral(3)).toBe('iii');
    expect(toRomanNumeral(5)).toBe('v');
    expect(toRomanNumeral(10)).toBe('x');
  });

  it('HAUPTZUSICHERUNG: die subtraktiven Formen sind korrekt', () => {
    // Eine naive Additivschreibung ergaebe hier iiii, viiii und xxxx.
    expect(toRomanNumeral(4)).toBe('iv');
    expect(toRomanNumeral(9)).toBe('ix');
    expect(toRomanNumeral(40)).toBe('xl');
    expect(toRomanNumeral(90)).toBe('xc');
    expect(toRomanNumeral(400)).toBe('cd');
    expect(toRomanNumeral(900)).toBe('cm');
  });

  it('ist durchgehend klein geschrieben', () => {
    for (const num of [1, 4, 9, 14, 40, 1990]) {
      expect(toRomanNumeral(num)).toBe(toRomanNumeral(num).toLowerCase());
    }
  });

  it('setzt laengere Zahlen richtig zusammen', () => {
    expect(toRomanNumeral(14)).toBe('xiv');
    expect(toRomanNumeral(1987)).toBe('mcmlxxxvii');
    expect(toRomanNumeral(2024)).toBe('mmxxiv');
  });

  it('HAUPTZUSICHERUNG: eine ungueltige Zahl ergibt die ARABISCHE 1 — nicht i', () => {
    // Gemessen, nicht angenommen. Die Funktion wechselt bei ungueltiger Eingabe das Zahlensystem.
    // Festgehalten, weil es aus dem Namen nicht ableitbar ist.
    expect(toRomanNumeral(0)).toBe('1');
    expect(toRomanNumeral(-1)).toBe('1');
    expect(toRomanNumeral(-1000)).toBe('1');
    // Zum Kontrast: die kleinste gueltige Zahl ist roemisch.
    expect(toRomanNumeral(1)).toBe('i');
  });

  it('ist deterministisch', () => {
    expect(toRomanNumeral(1987)).toBe(toRomanNumeral(1987));
  });
});

describe('toAlphaLetter — bijektive Basis 26', () => {
  it('bildet die ersten Buchstaben ab', () => {
    expect(toAlphaLetter(1)).toBe('a');
    expect(toAlphaLetter(2)).toBe('b');
    expect(toAlphaLetter(26)).toBe('z');
  });

  it('HAUPTZUSICHERUNG: nach z folgt aa, nicht ba', () => {
    // Das ist die bijektive Variante. Eine gewoehnliche Basis-26-Darstellung ergaebe bei 27 'ba' und bei 52
    // 'bz' - hier muss 'aa' und 'az' stehen.
    expect(toAlphaLetter(27)).toBe('aa');
    expect(toAlphaLetter(28)).toBe('ab');
    expect(toAlphaLetter(52)).toBe('az');
    expect(toAlphaLetter(53)).toBe('ba');
  });

  it('geht auch bei dreistelligen Folgen weiter', () => {
    // 26 + 26*26 = 702 -> 'zz', 703 -> 'aaa'.
    expect(toAlphaLetter(702)).toBe('zz');
    expect(toAlphaLetter(703)).toBe('aaa');
  });

  it('HAUPTZUSICHERUNG: eine ungueltige Zahl ergibt a', () => {
    expect(toAlphaLetter(0)).toBe('a');
    expect(toAlphaLetter(-5)).toBe('a');
  });

  it('ist durchgehend klein geschrieben', () => {
    for (const num of [1, 26, 27, 702, 703]) {
      expect(toAlphaLetter(num)).toBe(toAlphaLetter(num).toLowerCase());
    }
  });

  it('ist deterministisch', () => {
    expect(toAlphaLetter(703)).toBe(toAlphaLetter(703));
  });
});

describe('writerNoteReferenceOffset — zwei Feldnamen, ein Begriff', () => {
  const note = (over: Record<string, unknown>) => ({ id: 'n1', ...over } as never);

  it('liest das heutige Feld', () => {
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: 42 }))).toBe(42);
  });

  it('HAUPTZUSICHERUNG: liest auch den FRUEHEREN Feldnamen', () => {
    // Eine Kompatibilitaetslesung: "nothing ever wrote it, so it is read only so a hand-authored file that
    // used it still orders correctly."
    expect(writerNoteReferenceOffset(note({ referenceSpanIndex: 7 }))).toBe(7);
  });

  it('HAUPTZUSICHERUNG: das heutige Feld hat Vorrang', () => {
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: 5, referenceSpanIndex: 99 }))).toBe(5);
  });

  it('HAUPTZUSICHERUNG: ein fehlender oder unbrauchbarer Wert ergibt 0 — „unbekannt"', () => {
    // 0 ueberlaesst die Reihenfolge dem Register, statt eine falsche Position zu behaupten.
    expect(writerNoteReferenceOffset(note({}))).toBe(0);
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: undefined }))).toBe(0);
  });

  it('HAUPTZUSICHERUNG: nicht-endliche Werte ergeben 0 statt NaN durchzureichen', () => {
    // Genau der Waechter, dessen Fehlen DEF-RE-009 und DEF-RE-010 ausmachte. Hier ist Number.isFinite da.
    for (const wert of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(writerNoteReferenceOffset(note({ referenceTextOffset: wert })), String(wert)).toBe(0);
    }
  });

  it('ein Wert des falschen Typs ergibt 0', () => {
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: '42' }))).toBe(0);
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: null }))).toBe(0);
  });

  it('HAUPTZUSICHERUNG: negative Werte werden auf 0 gehoben, nie negativ durchgereicht', () => {
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: -5 }))).toBe(0);
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: -0.5 }))).toBe(0);
  });

  it('gebrochene Werte werden abgeschnitten, nicht gerundet', () => {
    // `Math.trunc` schneidet ab: 7.9 -> 7, nicht 8.
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: 7.9 }))).toBe(7);
    expect(writerNoteReferenceOffset(note({ referenceTextOffset: 7.1 }))).toBe(7);
  });

  it('ist deterministisch', () => {
    const n = note({ referenceTextOffset: 3 });
    expect(writerNoteReferenceOffset(n)).toBe(writerNoteReferenceOffset(n));
  });
});
