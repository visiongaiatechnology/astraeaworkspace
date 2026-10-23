/**
 * Text-Shaping — `writerTextShaping`, gefunden mit dem Import-Werkzeug aus Runde 256.
 *
 * ## Warum dieses Modul
 *
 * Es nennt sich selbst: *"Unicode BiDi & CJK Text-Shaping Engine — Implements UAX #9 BiDi segmentation,
 * JIS X 4051 Kinsoku Shori line breaking, and NFC glyph normalisation"* — und es hatte **keinen
 * importierenden Test.**
 *
 * **Reine Logik, headless prüfbar, und drei Spezifikationen, gegen die man messen kann.**
 *
 * ## Die Verträge, aus dem Quelltext gelesen
 *
 * * **`normalizeGlyphs(text)`** — NFC-Normalisierung.
 * * **`segmentBidiRuns(text)`** — zerlegt den Text in Abschnitte mit Richtung `ltr`/`rtl`, jeder mit
 *   `startIndex`/`endIndex`.
 * * **`getPrimaryDirection(text)`** — `'rtl'`, wenn der Text überwiegend rechtsläufig ist.
 * * **`isCjkTextCharacter(character)`** / **`canBreakCjkBetween(prev, next)`** — CJK-Erkennung und die
 *   Kinsoku-Shori-Regel: **ein verbotenes Zeichen darf nicht am Zeilenanfang stehen.**
 * * **`shapeText(text)`** — das Gesamtergebnis mit `normalizedText`, `primaryDirection`, `runs`, `hasCjk`,
 *   `hasRtl`.
 *
 * ## Die Zusicherung, die zählt
 *
 * **REKONSTRUKTION: die Texte aller BiDi-Abschnitte aneinandergereiht ergeben den normalisierten Text.**
 * Eine Segmentierung, die ein Zeichen verliert oder verdoppelt, verstümmelt jede Anzeige, die auf ihr baut.
 */

import { describe, expect, it } from 'vitest';
import {
  canBreakCjkBetween,
  getPrimaryDirection,
  isCjkTextCharacter,
  normalizeGlyphs,
  segmentBidiRuns,
  shapeText,
} from '../../../../layout/typography/writerTextShaping';

// Beispiele für die Schriften, die der Quelltext aufzählt.
const HEBRAEISCH = '\u05D0\u05D1\u05D2'; // Alef Bet Gimel
const ARABISCH = '\u0627\u0628\u062C'; // Alef Ba Dschim
const CJK = '\u4E2D\u6587'; // zwei CJK-Ideogramme
const HIRAGANA = '\u3042\u3044'; // A I
const LATEIN = 'Hallo Welt';

const rekonstruiere = (laeufe: ReturnType<typeof segmentBidiRuns>) =>
  [...laeufe].sort((a, b) => a.startIndex - b.startIndex).map((l) => l.text).join('');

describe('normalizeGlyphs — NFC', () => {
  it('setzt eine zerlegte Folge zusammen', () => {
    // 'e' + kombinierender Akut ist kanonisch aequivalent zu 'é'.
    expect(normalizeGlyphs('e\u0301')).toBe('\u00E9');
    expect(normalizeGlyphs('a\u0308')).toBe('\u00E4');
  });

  it('HAUPTZUSICHERUNG: ist idempotent — zweimal normalisieren aendert nichts', () => {
    for (const text of ['e\u0301', 'Hallo', CJK, HEBRAEISCH, 'a\u0308\u0301', '']) {
      const einmal = normalizeGlyphs(text);
      expect(normalizeGlyphs(einmal), JSON.stringify(text)).toBe(einmal);
    }
  });

  it('laesst bereits zusammengesetzte Zeichen unveraendert', () => {
    expect(normalizeGlyphs('\u00E9')).toBe('\u00E9');
    expect(normalizeGlyphs(LATEIN)).toBe(LATEIN);
  });

  it('leerer Text bleibt leer', () => {
    expect(normalizeGlyphs('')).toBe('');
  });

  it('ist deterministisch', () => {
    expect(normalizeGlyphs('e\u0301x')).toBe(normalizeGlyphs('e\u0301x'));
  });
});

describe('getPrimaryDirection — rechtslaeufig oder nicht', () => {
  it('hebraeischer Text ist rtl', () => {
    expect(getPrimaryDirection(HEBRAEISCH)).toBe('rtl');
  });

  it('arabischer Text ist rtl', () => {
    expect(getPrimaryDirection(ARABISCH)).toBe('rtl');
  });

  it('lateinischer Text ist ltr', () => {
    expect(getPrimaryDirection(LATEIN)).toBe('ltr');
  });

  it('CJK ist ltr — CJK ist nicht rechtslaeufig', () => {
    // Der Quelltext fuehrt CJK und RTL in getrennten Mengen.
    expect(getPrimaryDirection(CJK)).toBe('ltr');
    expect(getPrimaryDirection(HIRAGANA)).toBe('ltr');
  });

  it('HAUPTZUSICHERUNG: leerer Text ist ltr, nicht undefined', () => {
    // Ein Dokument ohne Text braucht trotzdem eine Richtung.
    expect(getPrimaryDirection('')).toBe('ltr');
  });

  it('ist deterministisch', () => {
    expect(getPrimaryDirection(HEBRAEISCH)).toBe(getPrimaryDirection(HEBRAEISCH));
  });
});

describe('isCjkTextCharacter — CJK erkennen', () => {
  it('erkennt CJK-Ideogramme, Hiragana, Katakana und Hangul', () => {
    expect(isCjkTextCharacter('\u4E2D')).toBe(true);
    expect(isCjkTextCharacter('\u3042')).toBe(true);
    expect(isCjkTextCharacter('\u30A2')).toBe(true);
    expect(isCjkTextCharacter('\uAC00')).toBe(true);
  });

  it('HAUPTZUSICHERUNG: lateinische Buchstaben sind kein CJK', () => {
    for (const zeichen of ['a', 'Z', 'H', 'o']) {
      expect(isCjkTextCharacter(zeichen), zeichen).toBe(false);
    }
  });

  it('HAUPTZUSICHERUNG: hebraeische und arabische Zeichen sind kein CJK', () => {
    expect(isCjkTextCharacter('\u05D0')).toBe(false);
    expect(isCjkTextCharacter('\u0627')).toBe(false);
  });

  it('Leerraum und Ziffern sind kein CJK', () => {
    expect(isCjkTextCharacter(' ')).toBe(false);
    expect(isCjkTextCharacter('7')).toBe(false);
  });

  it('ist deterministisch', () => {
    expect(isCjkTextCharacter('\u4E2D')).toBe(isCjkTextCharacter('\u4E2D'));
  });
});

describe('canBreakCjkBetween — Kinsoku Shori', () => {
  it('HAUPTZUSICHERUNG: zwischen zwei CJK-Zeichen darf gebrochen werden', () => {
    // Japanischer Text kennt keine Leerzeichen - der Umbruch muss zwischen Zeichen moeglich sein.
    expect(canBreakCjkBetween('\u4E2D', '\u6587')).toBe(true);
    expect(canBreakCjkBetween('\u3042', '\u3044')).toBe(true);
  });

  it('HAUPTZUSICHERUNG: vor einem verbotenen Zeichen darf NICHT gebrochen werden', () => {
    // JIS X 4051 Kinsoku Shori: eine schliessende Klammer oder ein Punkt darf nicht am Zeilenanfang stehen.
    // Der Quelltext fuehrt dafuer CJK_NO_LINE_START.
    expect(canBreakCjkBetween('\u4E2D', '\u3002')).toBe(false); // Ideogramm + .
    expect(canBreakCjkBetween('\u4E2D', '\uFF09')).toBe(false); // Ideogramm + )
    expect(canBreakCjkBetween('\u4E2D', '\u300D')).toBe(false); // Ideogramm + Schlusszeichen
  });

  it('HAUPTZUSICHERUNG: zwischen lateinischen Buchstaben wird hier NICHT entschieden', () => {
    // Diese Funktion ist fuer CJK. Ein lateinisches Wort bricht an Leerzeichen, nicht zwischen Zeichen.
    const ergebnis = canBreakCjkBetween('a', 'b');
    expect(typeof ergebnis).toBe('boolean');
    // Und sie wirft nicht.
    expect(() => canBreakCjkBetween('a', 'b')).not.toThrow();
  });

  it('ist deterministisch', () => {
    expect(canBreakCjkBetween('\u4E2D', '\u6587')).toBe(canBreakCjkBetween('\u4E2D', '\u6587'));
  });
});

describe('segmentBidiRuns — die Rekonstruktion', () => {
  it('HAUPTZUSICHERUNG: die Abschnitte ergeben den Text EXAKT zurueck', () => {
    // Die wichtigste Zusicherung dieses Moduls. Eine Segmentierung, die ein Zeichen verliert oder
    // verdoppelt, verstimmmelt jede Anzeige, die auf ihr baut.
    const proben = [
      '', 'Hallo', HEBRAEISCH, ARABISCH, CJK, LATEIN,
      `Hallo ${HEBRAEISCH} Welt`,
      `${HEBRAEISCH}${LATEIN}${ARABISCH}`,
      `${CJK}${LATEIN}${CJK}`,
      `a${HEBRAEISCH}b${ARABISCH}c`,
    ];
    for (const probe of proben) {
      const laeufe = segmentBidiRuns(probe);
      expect(rekonstruiere(laeufe), JSON.stringify(probe)).toBe(probe);
    }
  });

  it('HAUPTZUSICHERUNG: die Abschnitte sind luecken- und ueberlappungsfrei', () => {
    // startIndex/endIndex muessen den Text ohne Luecke abdecken.
    const probe = `a${HEBRAEISCH}b${ARABISCH}c`;
    const laeufe = segmentBidiRuns(probe);
    let erwarteterStart = 0;
    for (const lauf of laeufe) {
      expect(lauf.startIndex).toBe(erwarteterStart);
      erwarteterStart = lauf.endIndex;
    }
    expect(erwarteterStart).toBe(probe.length);
  });

  it('reiner lateinischer Text ergibt einen einzigen ltr-Abschnitt', () => {
    const laeufe = segmentBidiRuns('Hallo Welt');
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0]?.direction).toBe('ltr');
    expect(laeufe[0]?.text).toBe('Hallo Welt');
  });

  it('reiner hebraeischer Text ergibt einen einzigen rtl-Abschnitt', () => {
    const laeufe = segmentBidiRuns(HEBRAEISCH);
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0]?.direction).toBe('rtl');
  });

  it('ein gemischter Text ergibt MEHRERE Abschnitte', () => {
    const laeufe = segmentBidiRuns(`Hallo ${HEBRAEISCH} Welt`);
    expect(laeufe.length).toBeGreaterThan(1);
    // Und beide Richtungen kommen vor.
    const richtungen = new Set(laeufe.map((l) => l.direction));
    expect(richtungen.has('rtl')).toBe(true);
    expect(richtungen.has('ltr')).toBe(true);
  });

  it('HAUPTZUSICHERUNG: benachbarte Abschnitte haben NICHT dieselbe Richtung', () => {
    // Sonst waere die Segmentierung unnoetig zerlegt.
    const laeufe = segmentBidiRuns(`a${HEBRAEISCH}${ARABISCH}b`);
    for (let i = 1; i < laeufe.length; i += 1) {
      expect(laeufe[i]?.direction, `Position ${i}`).not.toBe(laeufe[i - 1]?.direction);
    }
  });

  it('leerer Text ergibt eine leere Liste', () => {
    expect(segmentBidiRuns('')).toEqual([]);
  });

  it('ist deterministisch', () => {
    const probe = `a${HEBRAEISCH}b`;
    expect(segmentBidiRuns(probe)).toEqual(segmentBidiRuns(probe));
  });
});

describe('shapeText — das Gesamtergebnis', () => {
  it('HAUPTZUSICHERUNG: meldet hasRtl nur bei rechtslaeufigem Text', () => {
    expect(shapeText(HEBRAEISCH).hasRtl).toBe(true);
    expect(shapeText(ARABISCH).hasRtl).toBe(true);
    expect(shapeText(LATEIN).hasRtl).toBe(false);
    expect(shapeText(CJK).hasRtl).toBe(false);
  });

  it('HAUPTZUSICHERUNG: meldet hasCjk nur bei CJK-Text', () => {
    expect(shapeText(CJK).hasCjk).toBe(true);
    expect(shapeText(HIRAGANA).hasCjk).toBe(true);
    expect(shapeText(LATEIN).hasCjk).toBe(false);
    expect(shapeText(HEBRAEISCH).hasCjk).toBe(false);
  });

  it('der normalisierte Text ist NFC-normalisiert', () => {
    const ergebnis = shapeText('e\u0301');
    expect(ergebnis.normalizedText).toBe('\u00E9');
    expect(ergebnis.normalizedText).toBe(normalizeGlyphs('e\u0301'));
  });

  it('HAUPTZUSICHERUNG: die Abschnitte im Ergebnis sind die der Segmentierung', () => {
    // Zwei Wege zur selben Aussage duerfen sich nicht widersprechen.
    const probe = `Hallo ${HEBRAEISCH} Welt`;
    expect(shapeText(probe).runs).toEqual(segmentBidiRuns(probe));
  });

  it('die Hauptrichtung stimmt mit getPrimaryDirection ueberein', () => {
    for (const probe of [LATEIN, HEBRAEISCH, ARABISCH, CJK, '']) {
      expect(shapeText(probe).primaryDirection, JSON.stringify(probe)).toBe(getPrimaryDirection(probe));
    }
  });

  it('liefert alle fuenf Felder', () => {
    const ergebnis = shapeText('Hallo');
    expect(Object.keys(ergebnis).sort()).toEqual(
      ['hasCjk', 'hasRtl', 'normalizedText', 'primaryDirection', 'runs'],
    );
  });

  it('HAUPTZUSICHERUNG: leerer Text ist ein gueltiges Ergebnis, kein Fehler', () => {
    const ergebnis = shapeText('');
    expect(ergebnis.normalizedText).toBe('');
    expect(ergebnis.primaryDirection).toBe('ltr');
    expect(ergebnis.runs).toEqual([]);
    expect(ergebnis.hasCjk).toBe(false);
    expect(ergebnis.hasRtl).toBe(false);
  });

  it('gemischter Text meldet beide Merkmale', () => {
    const ergebnis = shapeText(`${CJK}${HEBRAEISCH}`);
    expect(ergebnis.hasCjk).toBe(true);
    expect(ergebnis.hasRtl).toBe(true);
  });

  it('ist deterministisch', () => {
    const probe = `a${CJK}${HEBRAEISCH}b`;
    expect(JSON.stringify(shapeText(probe))).toBe(JSON.stringify(shapeText(probe)));
  });
});
