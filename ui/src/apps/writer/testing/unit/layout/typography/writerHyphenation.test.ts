/**
 * P35-nahe Ergänzung — die Silbentrennung: `writerHyphenation`.
 *
 * ## Warum dieses Modul, und warum JETZT
 *
 * Runde 256 hat die Testabdeckung **nach IMPORT** gemessen (DEF-RE-011: der frühere Vergleich nach
 * Dateinamen war ein Falsch-Negativ). Ergebnis: **238 Produktionsmodule, 146 importiert, 92 ohne
 * importierenden Test.**
 *
 * **Diese 92 sind überwiegend UI-Komponenten und Hooks — aber darunter ist reine Logik, die headless
 * prüfbar ist.** Dieses Modul ist der wertvollste Fall: **falsche Silbentrennung ist falscher Text.**
 *
 * ## Der Vertrag, aus dem Quelltext gelesen
 *
 * ```ts
 * if (len < options.minLeft + options.minRight) return [];      // zu kurz: keine Trennung
 * // Liang: levels[pos] = max(levels[pos], scores[j])
 * for (let i = options.minLeft; i <= len - options.minRight; i++)
 *   if (levels[i] % 2 === 1) points.push(i);                    // ungerade Stufe = Trennung
 * ```
 *
 * **Drei Zusicherungen geben den Ausschlag:**
 *
 * 1. **REKONSTRUKTION: entfernt man die weichen Trennzeichen wieder, kommt das Wort EXAKT zurück.**
 *    Eine Trennung, die ein Zeichen verliert oder verdoppelt, ist Datenverzerrung.
 * 2. **Beide Raender werden eingehalten:** jeder Trennpunkt `p` erfuellt
 *    `minLeft <= p <= len - minRight`. **Kein Trennpunkt am Wortanfang und keiner am Wortende.**
 * 3. **Ein zu kurzes Wort wird nicht getrennt** — die Summe der Raender ist die Schwelle.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HYPHEN_OPTIONS,
  getHyphenationPoints,
  hyphenateText,
  hyphenateWord,
} from '../../../../layout/typography/hyphenation/writerHyphenation';

const SOFT = '\u00AD';
const strip = (value: string) => value.split(SOFT).join('');

const EN = { language: 'en' as const, minLeft: 2, minRight: 2, hyphenChar: SOFT };
const DE = { language: 'de' as const, minLeft: 2, minRight: 2, hyphenChar: SOFT };

describe('DEFAULT_HYPHEN_OPTIONS', () => {
  it('trennt englisch, mit zwei Zeichen an beiden Raendern, mit weichem Trennzeichen', () => {
    expect(DEFAULT_HYPHEN_OPTIONS.language).toBe('en');
    expect(DEFAULT_HYPHEN_OPTIONS.minLeft).toBe(2);
    expect(DEFAULT_HYPHEN_OPTIONS.minRight).toBe(2);
    expect(DEFAULT_HYPHEN_OPTIONS.hyphenChar).toBe(SOFT);
  });

  it('das Standard-Trennzeichen ist ein WEICHES Trennzeichen, kein Bindestrich', () => {
    // Ein gewoehnlicher Bindestrich wuerde im Text sichtbar bleiben.
    expect(DEFAULT_HYPHEN_OPTIONS.hyphenChar).not.toBe('-');
    expect(DEFAULT_HYPHEN_OPTIONS.hyphenChar).toBe('\u00AD');
  });
});

describe('getHyphenationPoints — die Raender', () => {
  it('HAUPTZUSICHERUNG: ein zu kurzes Wort ergibt keine Trennstelle', () => {
    // Die Schwelle ist die SUMME der Raender.
    expect(getHyphenationPoints('ab', EN)).toEqual([]);
    expect(getHyphenationPoints('abc', EN)).toEqual([]);
    // Genau an der Schwelle (4 Zeichen) ist es nicht mehr "zu kurz".
    expect(getHyphenationPoints('abcd', EN).every((p) => p >= 2 && p <= 2)).toBe(true);
  });

  it('HAUPTZUSICHERUNG: jeder Trennpunkt haelt BEIDE Raender ein', () => {
    // Kein Trennpunkt am Wortanfang und keiner am Wortende.
    const woerter = [
      'hyphenation', 'internationalization', 'understanding', 'architecture',
      'Systemarchitektur', 'Verantwortlichkeit', 'Geschwindigkeit',
    ];
    for (const wort of woerter) {
      for (const options of [EN, DE]) {
        for (const punkt of getHyphenationPoints(wort, options)) {
          expect(punkt, `${wort} (${options.language}) bei ${punkt}`).toBeGreaterThanOrEqual(options.minLeft);
          expect(punkt, `${wort} (${options.language}) bei ${punkt}`).toBeLessThanOrEqual(wort.length - options.minRight);
        }
      }
    }
  });

  it('eine groessere Randvorgabe ergibt hoechstens so viele Punkte', () => {
    const eng = getHyphenationPoints('internationalization', { ...EN, minLeft: 2, minRight: 2 });
    const weit = getHyphenationPoints('internationalization', { ...EN, minLeft: 6, minRight: 6 });
    expect(weit.length).toBeLessThanOrEqual(eng.length);
  });

  it('Trennpunkte liegen innerhalb des Wortes und sind aufsteigend', () => {
    const punkte = getHyphenationPoints('understanding', EN);
    for (const punkt of punkte) {
      expect(punkt).toBeGreaterThan(0);
      expect(punkt).toBeLessThan('understanding'.length);
    }
    expect([...punkte].sort((a, b) => a - b)).toEqual(punkte);
  });

  it('HAUPTZUSICHERUNG: die Trennung ist unabhängig von der Gross-/Kleinschreibung der PUNKTE', () => {
    // Der Quelltext misst am kleingeschriebenen Wort; die Punkte sind Indizes und damit gleich.
    expect(getHyphenationPoints('Understanding', EN)).toEqual(getHyphenationPoints('understanding', EN));
    expect(getHyphenationPoints('VERANTWORTLICHKEIT', DE)).toEqual(getHyphenationPoints('verantwortlichkeit', DE));
  });

  it('ist deterministisch', () => {
    expect(getHyphenationPoints('internationalization', EN)).toEqual(getHyphenationPoints('internationalization', EN));
  });

  it('ein leeres Wort ergibt keine Punkte', () => {
    expect(getHyphenationPoints('', EN)).toEqual([]);
  });
});

describe('hyphenateWord — die Rekonstruktion', () => {
  it('HAUPTZUSICHERUNG: entfernt man die weichen Trennzeichen, kommt das Wort EXAKT zurueck', () => {
    // Die wichtigste Zusicherung dieses Moduls: eine Trennung, die ein Zeichen verliert oder verdoppelt,
    // ist Datenverzerrung. Sie muss sich verlustfrei rueckgaengig machen lassen.
    const woerter = [
      'hyphenation', 'internationalization', 'understanding', 'architecture', 'government',
      'Systemarchitektur', 'Verantwortlichkeit', 'Geschwindigkeit', 'Wahrscheinlichkeit',
      'a', 'ab', 'abc', 'abcd', 'Hafen', 'Haustuer',
    ];
    for (const wort of woerter) {
      for (const options of [EN, DE]) {
        const getrennt = hyphenateWord(wort, options);
        expect(strip(getrennt), `${wort} (${options.language})`).toBe(wort);
      }
    }
  });

  it('HAUPTZUSICHERUNG: ohne Trennstelle bleibt das Wort unveraendert', () => {
    expect(hyphenateWord('ab', EN)).toBe('ab');
    expect(hyphenateWord('Hafen', EN)).toBe('Hafen');
    expect(hyphenateWord('', EN)).toBe('');
  });

  it('die Zahl der Trennzeichen entspricht der Zahl der Trennstellen', () => {
    const punkte = getHyphenationPoints('internationalization', EN);
    const getrennt = hyphenateWord('internationalization', EN);
    expect(getrennt.split(SOFT).length - 1).toBe(punkte.length);
  });

  it('HAUPTZUSICHERUNG: ein eigenes Trennzeichen wird benutzt', () => {
    const getrennt = hyphenateWord('internationalization', { ...EN, hyphenChar: '|' });
    expect(getrennt).toContain('|');
    expect(getrennt).not.toContain(SOFT);
    // Und die Rekonstruktion gilt auch dann.
    expect(getrennt.split('|').join('')).toBe('internationalization');
  });

  it('ist deterministisch', () => {
    expect(hyphenateWord('internationalization', EN)).toBe(hyphenateWord('internationalization', EN));
  });
});

describe('hyphenateText — nur Buchstaben', () => {
  it('HAUPTZUSICHERUNG: Ziffern und Satzzeichen bleiben unberuehrt', () => {
    // Das Muster erfasst nur Buchstaben. Eine Ziffernfolge darf nicht getrennt werden.
    const text = '2026 und 1.234,56';
    expect(hyphenateText(text, EN)).toBe(text);
  });

  it('HAUPTZUSICHERUNG: der ganze Text laesst sich verlustfrei rekonstruieren', () => {
    const text = 'Die Internationalisierung der Systemarchitektur erfordert Verantwortlichkeit.';
    const getrennt = hyphenateText(text, DE);
    expect(strip(getrennt)).toBe(text);
  });

  it('Satzzeichen und Leerraum bleiben an ihrem Platz', () => {
    const text = 'hyphenation, understanding; government!';
    const getrennt = hyphenateText(text, EN);
    expect(strip(getrennt)).toBe(text);
    expect(getrennt).toContain(',');
    expect(getrennt).toContain(';');
    expect(getrennt).toContain('!');
  });

  it('leerer Text bleibt leer', () => {
    expect(hyphenateText('', EN)).toBe('');
  });

  it('ein Text ohne Buchstaben bleibt unveraendert', () => {
    expect(hyphenateText('123 456 ---', EN)).toBe('123 456 ---');
  });

  it('ist deterministisch', () => {
    const text = 'Internationalisierung der Systemarchitektur';
    expect(hyphenateText(text, DE)).toBe(hyphenateText(text, DE));
  });
});
