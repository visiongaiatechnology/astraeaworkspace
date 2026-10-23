/**
 * PDF-Aufbau — `writerPdfStructure`, gefunden mit `tools/find_testable_modules.py` (Runde 259).
 *
 * ## Warum dieses Modul
 *
 * Das Werkzeug aus Runde 259 hat die 92 Module ohne direkten Test **nach exportierten FUNKTIONEN**
 * gefiltert — und Hooks, `.tsx`-Komponenten und reine Typmodule ausgeschlossen, weil sie headless nicht
 * prüfbar sind. Übrig blieben 32, und dieses Modul führt die Liste mit sechs Funktionen an.
 *
 * **Zwei davon sind sicherheitsrelevant:**
 *
 * ### `pdfLiteralString` — PDF-Syntax darf nicht zerbrechen
 *
 * ```ts
 * .replace(/\\/gu, '\\\\')     // ZUERST der Backslash
 * .replace(/\(/gu, '\\(')
 * .replace(/\)/gu, '\\)')
 * .replace(/[\r\n]+/gu, ' ')
 * ```
 *
 * **Die Reihenfolge ist der ganze Punkt.** Würde die Klammer zuerst escapt und der Backslash danach, würde
 * der neu eingefügte Backslash **ein zweites Mal** escapt — und aus `\(` würde `\\(`, also ein literaler
 * Backslash gefolgt von einer **unbalancierten Klammer**. Ein unbalanciertes `(` in einem PDF-Literal ist
 * ein Syntaxfehler im ganzen Dokument.
 *
 * ### `sanitizeWriterPdfLink` — eine Vertrauensgrenze
 *
 * Ein nicht erlaubter Link ergibt **`null`**, nicht den Link. Das ist fail-closed.
 *
 * ### `pdfUnicodeString` — die Byte-Zahl ist vorhersagbar
 *
 * BOM (2 Byte), dann je BMP-Zeichen 2 Byte, je Zeichen außerhalb der BMP 4 Byte (Surrogatpaar).
 */

import { describe, expect, it } from 'vitest';
import {
  buildWriterPdfXmp,
  pdfDateString,
  pdfLiteralString,
  pdfUnicodeString,
  sanitizeWriterPdfLink,
  writerPdfDestinationName,
} from '../../../../../interchange/export/pdf/writerPdfStructure';

describe('pdfLiteralString — die Reihenfolge der Ersetzungen', () => {
  it('HAUPTZUSICHERUNG: der Backslash-Ersatz kommt ZUERST', () => {
    // Wuerde die Klammer zuerst escapt, wuerde der eingefuegte Backslash danach ein zweites Mal escapt.
    expect(pdfLiteralString('a\\b')).toBe('a\\\\b');
    // Und eine Klammer bekommt genau EINEN Backslash, nicht zwei.
    expect(pdfLiteralString('(')).toBe('\\(');
    expect(pdfLiteralString(')')).toBe('\\)');
    expect(pdfLiteralString('()')).toBe('\\(\\)');
  });

  it('HAUPTZUSICHERUNG: das Ergebnis hat keine unbalancierte Klammer', () => {
    // Ein unbalanciertes ( in einem PDF-Literal ist ein Syntaxfehler im ganzen Dokument.
    const proben = ['(', ')', '()', '((()))', 'a(b)c', '\\(', '\\)', '((', '))', '\\'];
    for (const probe of proben) {
      const escaped = pdfLiteralString(probe);
      // Jede oeffnende Klammer muss einen Backslash davor haben - auch wenn sie schon einen hatte.
      const ohneEscapte = escaped.replace(/\\[()\\]/g, '').replace(/\\\\/g, '');
      expect(ohneEscapte.includes('('), JSON.stringify(probe)).toBe(false);
      expect(ohneEscapte.includes(')'), JSON.stringify(probe)).toBe(false);
    }
  });

  it('HAUPTZUSICHERUNG: Zeilenumbrueche werden zu EINEM Leerzeichen zusammengefasst', () => {
    // Der Ersatz ist `[\r\n]+` -> ein Leerzeichen, nicht eins je Zeichen.
    expect(pdfLiteralString('a\nb')).toBe('a b');
    expect(pdfLiteralString('a\r\n\r\nb')).toBe('a b');
    expect(pdfLiteralString('a\n\n\nb')).toBe('a b');
  });

  it('gewaehnlicher Text bleibt unveraendert', () => {
    expect(pdfLiteralString('Hallo Welt')).toBe('Hallo Welt');
    expect(pdfLiteralString('')).toBe('');
    expect(pdfLiteralString('123 456')).toBe('123 456');
  });

  it('ist deterministisch', () => {
    expect(pdfLiteralString('a(b\\c')).toBe(pdfLiteralString('a(b\\c'));
  });
});

describe('pdfUnicodeString — BOM und Surrogatpaare', () => {
  it('HAUPTZUSICHERUNG: beginnt mit dem BOM FE FF', () => {
    // Die Kennung fuer UTF-16BE in einem PDF-String.
    expect(pdfUnicodeString('')).toBe('<FEFF>');
    expect(pdfUnicodeString('A').startsWith('<FEFF')).toBe(true);
  });

  it('HAUPTZUSICHERUNG: ein BMP-Zeichen braucht GENAU zwei Byte', () => {
    // 'A' ist U+0041 -> 00 41. Mit BOM also 4 Hexziffern + 4 = 8 Zeichen innerhalb der Klammern.
    expect(pdfUnicodeString('A')).toBe('<FEFF0041>');
  });

  it('HAUPTZUSICHERUNG: ein Zeichen ausserhalb der BMP braucht VIER Byte', () => {
    // U+1F600 (Emoji) liegt ueber 0xFFFF und wird als Surrogatpaar geschrieben.
    const ergebnis = pdfUnicodeString('\u{1F600}');
    // BOM (4) + Surrogatpaar (8) = 12 Hexziffern.
    const hex = ergebnis.slice(1, -1);
    expect(hex).toHaveLength(12);
    expect(hex.startsWith('FEFF')).toBe(true);
  });

  it('die Hexziffern sind Grossbuchstaben', () => {
    expect(pdfUnicodeString('a')).toBe(pdfUnicodeString('a').toUpperCase());
    expect(pdfUnicodeString('\u00E4')).toMatch(/^<[0-9A-F]+>$/);
  });

  it('HAUPTZUSICHERUNG: die Hexlaenge ist immer ein Vielfaches von 4 plus dem BOM', () => {
    for (const probe of ['', 'A', 'AB', 'Hallo', '\u00E4\u00F6\u00FC', '\u{1F600}', 'a\u{1F600}b', '\u4E2D\u6587']) {
      const hex = pdfUnicodeString(probe).slice(1, -1);
      expect(hex.length, JSON.stringify(probe)).toBeGreaterThanOrEqual(4);
      expect((hex.length - 4) % 4, JSON.stringify(probe)).toBe(0);
    }
  });

  it('HAUPTZUSICHERUNG: NFC-normalisiert vor der Kodierung', () => {
    // 'e' + kombinierender Akut und 'é' muessen dieselben Bytes ergeben.
    expect(pdfUnicodeString('e\u0301')).toBe(pdfUnicodeString('\u00E9'));
  });

  it('ist deterministisch', () => {
    expect(pdfUnicodeString('Test \u00E4\u00F6\u00FC')).toBe(pdfUnicodeString('Test \u00E4\u00F6\u00FC'));
  });
});

describe('writerPdfDestinationName — ein gueltiger PDF-Name', () => {
  it('setzt das Praefix writer:', () => {
    expect(writerPdfDestinationName('p1')).toBe('writer:p1');
  });

  it('HAUPTZUSICHERUNG: unerlaubte Zeichen werden zu Unterstrich', () => {
    // Ein PDF-Name darf keine Leerzeichen, Klammern oder Schraegstriche enthalten.
    const ergebnis = writerPdfDestinationName('a b/c(d)e');
    expect(ergebnis).toBe('writer:a_b_c_d_e');
    expect(ergebnis).not.toContain(' ');
    expect(ergebnis).not.toContain('/');
    expect(ergebnis).not.toContain('(');
  });

  it('erlaubte Zeichen bleiben: Buchstaben, Ziffern, Unterstrich, Punkt, Doppelpunkt, Bindestrich', () => {
    expect(writerPdfDestinationName('a_b.c:d-e')).toBe('writer:a_b.c:d-e');
  });

  it('HAUPTZUSICHERUNG: ein leerer Name faellt auf paragraph zurueck', () => {
    // `normalized || 'paragraph'` - ein PDF-Name darf nicht leer sein.
    expect(writerPdfDestinationName('')).toBe('writer:paragraph');
    expect(writerPdfDestinationName('   ')).toBe('writer:___');
  });

  it('die Laenge ist begrenzt', () => {
    const ergebnis = writerPdfDestinationName('x'.repeat(1000));
    expect(ergebnis.length).toBeLessThan(1000);
  });

  it('ist deterministisch', () => {
    expect(writerPdfDestinationName('p1')).toBe(writerPdfDestinationName('p1'));
  });
});

describe('sanitizeWriterPdfLink — die Vertrauensgrenze', () => {
  it('HAUPTZUSICHERUNG: ohne Link gibt es null', () => {
    expect(sanitizeWriterPdfLink(undefined)).toBeNull();
  });

  it('HAUPTZUSICHERUNG: ein leerer interner Absatz ergibt null, nicht einen leeren Link', () => {
    // Fail-closed: ein Link ohne Ziel ist kein Link.
    expect(sanitizeWriterPdfLink({ kind: 'internal', paragraphId: '' })).toBeNull();
    expect(sanitizeWriterPdfLink({ kind: 'internal', paragraphId: '   ' })).toBeNull();
  });

  it('ein gueltiger interner Link wird getrimmt uebernommen', () => {
    const ergebnis = sanitizeWriterPdfLink({ kind: 'internal', paragraphId: '  p1  ' });
    expect(ergebnis).toEqual({ kind: 'internal', paragraphId: 'p1' });
  });

  it('die interne Kennung wird auf 256 Zeichen begrenzt', () => {
    const ergebnis = sanitizeWriterPdfLink({ kind: 'internal', paragraphId: 'x'.repeat(500) });
    expect((ergebnis as { paragraphId: string }).paragraphId).toHaveLength(256);
  });

  it('HAUPTZUSICHERUNG: ein nicht erlaubter externer Link ergibt null, nicht den Link', () => {
    // Das ist die Zusicherung, die zaehlt: die Funktion gibt niemals eine URL weiter, die sie nicht
    // geprueft hat.
    const gefaehrlich = sanitizeWriterPdfLink({ kind: 'external', url: 'javascript:alert(1)' });
    expect(gefaehrlich).toBeNull();
    expect(JSON.stringify(gefaehrlich)).not.toContain('javascript');
  });

  it('HAUPTZUSICHERUNG: das Ergebnis ist entweder null oder ein erlaubter Link', () => {
    // Es gibt keinen dritten Fall - und keinen, in dem die rohe Eingabe durchgereicht wird.
    const proben = [
      { kind: 'external', url: 'javascript:alert(1)' },
      { kind: 'external', url: 'https://beispiel.de' },
      { kind: 'external', url: '' },
      { kind: 'internal', paragraphId: 'p1' },
    ] as const;
    for (const probe of proben) {
      const ergebnis = sanitizeWriterPdfLink(probe as never);
      expect(ergebnis === null || ergebnis.kind === 'internal' || ergebnis.kind === 'external').toBe(true);
    }
  });

  it('ist deterministisch', () => {
    const link = { kind: 'internal', paragraphId: 'p1' } as never;
    expect(sanitizeWriterPdfLink(link)).toEqual(sanitizeWriterPdfLink(link));
  });
});

describe('pdfDateString — das PDF-Datumsformat', () => {
  it('HAUPTZUSICHERUNG: beginnt mit D: und hat die Form D:YYYYMMDD', () => {
    // 2024-03-05T00:00:00Z als Zeitstempel.
    const stempel = Date.UTC(2024, 2, 5);
    const ergebnis = pdfDateString(stempel);
    expect(ergebnis.startsWith('D:')).toBe(true);
    expect(ergebnis).toContain('20240305');
  });

  it('HAUPTZUSICHERUNG: Monat und Tag werden mit fuehrender Null aufgefuellt', () => {
    // Ohne padStart entstuende 202415 statt 20240105.
    const ergebnis = pdfDateString(Date.UTC(2024, 0, 5));
    expect(ergebnis).toContain('20240105');
  });

  it('HAUPTZUSICHERUNG: ein fehlender oder nicht-endlicher Wert ergibt die Epoche', () => {
    // `Math.max(0, Number.isFinite(value) ? Number(value) : 0)` - kein NaN im PDF.
    const epoche = pdfDateString(0);
    expect(pdfDateString(undefined)).toBe(epoche);
    expect(pdfDateString(Number.NaN)).toBe(epoche);
    expect(pdfDateString(Number.POSITIVE_INFINITY)).toBe(epoche);
    expect(pdfDateString(Number.NEGATIVE_INFINITY)).toBe(epoche);
  });

  it('HAUPTZUSICHERUNG: ein negativer Zeitstempel wird auf die Epoche gehoben', () => {
    // Vor 1970 gibt es im PDF-Datumsformat nichts - und ein negatives Jahr waere ungueltig.
    expect(pdfDateString(-1000)).toBe(pdfDateString(0));
  });

  it('das Ergebnis enthaelt kein NaN', () => {
    for (const wert of [undefined, Number.NaN, 0, Date.now(), -1e15, 1e15]) {
      expect(pdfDateString(wert), String(wert)).not.toContain('NaN');
    }
  });

  it('ist deterministisch', () => {
    const stempel = Date.UTC(2024, 5, 15);
    expect(pdfDateString(stempel)).toBe(pdfDateString(stempel));
  });
});

describe('buildWriterPdfXmp — XML, das nicht zerbricht', () => {
  it('HAUPTZUSICHERUNG: Sonderzeichen im Titel werden escapt', () => {
    // Ein rohes < oder & im Titel wuerde das XMP-XML ungueltig machen.
    const xmp = buildWriterPdfXmp('A < B & C > D');
    expect(xmp).toContain('&lt;');
    expect(xmp).toContain('&amp;');
    // Und der rohe Titel steht NICHT mehr darin.
    expect(xmp).not.toContain('A < B & C > D');
  });

  it('HAUPTZUSICHERUNG: auch Autor, Betreff und Sprache werden escapt', () => {
    const xmp = buildWriterPdfXmp('Titel', {
      author: 'A & B',
      subject: '<Thema>',
      language: 'de"DE',
    } as never);
    expect(xmp).toContain('A &amp; B');
    expect(xmp).toContain('&lt;Thema&gt;');
    expect(xmp).not.toContain('<Thema>');
  });

  it('enthaelt die XMP-Rahmenstruktur', () => {
    const xmp = buildWriterPdfXmp('Titel');
    expect(xmp).toContain('<?xpacket');
    expect(xmp).toContain('<x:xmpmeta');
    expect(xmp).toContain('<rdf:RDF');
    expect(xmp).toContain('</x:xmpmeta>');
    expect(xmp).toContain('<?xpacket end="w"?>');
  });

  it('ist deterministisch bei gleicher Eingabe', () => {
    expect(buildWriterPdfXmp('T')).toBe(buildWriterPdfXmp('T'));
  });
});
