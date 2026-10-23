/**
 * Roundtrip-Erhalt — `writerRoundtripPreserver`, gefunden mit dem Import-Werkzeug aus Runde 256.
 *
 * ## Warum dieses Modul Datenintegritaet ist
 *
 * Das Modul nennt sich selbst: *"Zero-loss stashing and merging of unknown OOXML/ODF XML parts, themes, and
 * namespaces."* **Ein Fehler hier ist stiller Datenverlust beim Speichern:** Teile, die der Editor nicht
 * kennt, verschwinden — und das Dokument ist nach dem Roundtrip aermer als vorher.
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * ### `calculateChecksum(data)` — FNV-1a, 32 Bit
 *
 * ```ts
 * let hash = 0x811c9dc5;
 * for (...) { hash ^= data.charCodeAt(i); hash = (hash * 0x01000193) >>> 0; }
 * return hash.toString(16).padStart(8, '0');
 * ```
 *
 * **Der Test enthaelt eine UNABHAENGIGE Zweitimplementierung derselben Spezifikation.** Das ist die
 * staerkste Form der Pruefung: nicht „ich glaube, es ist FNV-1a", sondern „meine eigene Rechnung stimmt
 * mit dieser ueberein".
 *
 * ### `compileRoundtripPackage(manifest, modifiedDocumentXml)`
 *
 * ```ts
 * const finalPackage = { ...manifest.stashedParts };       // ALLES bleibt
 * docx -> 'word/document.xml' | odt -> 'content.xml' | sonst 'document.txt'
 * ```
 *
 * **Die Zusicherung, die zaehlt: KEIN gestashtes Teil geht verloren.** Ein einziger verlorener Teil ist der
 * Datenverlust, den das Modul verhindern soll.
 *
 * ### `mergePreservedNamespaces(rootTag, manifest)`
 *
 * Fuegt `xmlns:prefix="uri"` vor der ersten `>` ein — **aber nur, wenn `xmlns:prefix=` noch nicht
 * vorkommt.** Und ohne `>` bleibt der Tag unveraendert.
 */

import { describe, expect, it } from 'vitest';
import {
  calculateChecksum,
  compileRoundtripPackage,
  createRoundtripManifest,
  mergePreservedNamespaces,
  verifyManifestIntegrity,
} from '../../../../interchange/roundtrip/writerRoundtripPreserver';
import type { RoundtripManifest } from '../../../../interchange/roundtrip/writerRoundtripPreserver';

/**
 * UNABHAENGIGE Zweitimplementierung von FNV-1a 32 Bit — nach der Spezifikation, nicht nach dem Quelltext.
 *
 * Offset-Basis 2166136261 (0x811c9dc5), Primzahl 16777619 (0x01000193), XOR vor Multiplikation.
 */
function fnv1aIndependent(data: string): string {
  let hash = 2166136261;
  for (const character of data) {
    hash ^= character.codePointAt(0) ?? 0;
    // Multiplikation modulo 2^32, ohne auf die 32-Bit-Grenze von JavaScript zu bauen.
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const manifest = (over: Partial<RoundtripManifest> = {}): RoundtripManifest => ({
  ...createRoundtripManifest('docx'),
  ...over,
});

describe('calculateChecksum — deterministisch, aber NICHT echtes FNV-1a', () => {
  it('HAUPTZUSICHERUNG: BEFUND — die Pruefsumme weicht von echtem FNV-1a ab', () => {
    // **GEMESSEN, nicht vermutet.** Der Quelltext nennt sich *"Deterministic lightweight FNV-1a 32-bit hex
    // checksum"* — aber:
    //
    //     hash = (hash * 0x01000193) >>> 0
    //
    // **`hash * 0x01000193` ist in JavaScript eine GLEITKOMMA-Multiplikation.** Bei `hash` nahe 2^32
    // (≈ 2,2e9) und `0x01000193` (≈ 1,7e7) ist das Produkt ≈ **3,6e16** — und ueberschreitet damit
    // **2^53 ≈ 9,0e15**, die Grenze exakter Ganzzahlen in JavaScript.
    //
    // **Die Multiplikation verliert also Praezision, und `>>> 0` liefert einen anderen Wert als die
    // Spezifikation.** Die Funktion ist deterministisch und erkennt Aenderungen (siehe unten), aber sie ist
    // **nicht FNV-1a**.
    //
    // Zum Beweis stehen hier beide Werte: der tatsaechliche und die unabhaengige Rechnung.
    expect(calculateChecksum('b')).toBe('e70c2de4');       // der Quelltext
    expect(fnv1aIndependent('b')).toBe('e70c2de5');        // die Spezifikation - EINE Eins Unterschied
    expect(calculateChecksum('b')).not.toBe(fnv1aIndependent('b'));

    // Und der leere Text stimmt ueberein, weil dort nicht multipliziert wird - der einzige Fall ohne
    // Genauigkeitsverlust.
    expect(calculateChecksum('')).toBe(fnv1aIndependent(''));
    expect(calculateChecksum('')).toBe('811c9dc5');
  });

  it('HAUPTZUSICHERUNG: die Abweichung ist EINGABEABHAENGIG, nicht universell', () => {
    // **GEMESSEN, und mein erster Entwurf lag hier falsch:** ich behauptete, beide Rechnungen wichen ab dem
    // ersten Zeichen ab. Das stimmt nicht - manche Eingaben stimmen ueberein, weil das Produkt dann unter
    // 2^53 bleibt.
    //
    //     ''     gleich      (keine Multiplikation)
    //     'a'    gleich      e40c292c / e40c292c
    //     'ab'   gleich      4d2505ca / 4d2505ca
    //     'b'    ABWEICHEND  e70c2de4 / e70c2de5   (um 1)
    //     'abc'  ABWEICHEND  1a47e90c / 1a47e90b   (um 1)
    //     'test' ABWEICHEND  88ab2ffc / afd071e5   (voellig verschieden)
    for (const gleich of ['', 'a', 'ab']) {
      expect(calculateChecksum(gleich), `gleich: ${JSON.stringify(gleich)}`).toBe(fnv1aIndependent(gleich));
    }
    for (const abweichend of ['b', 'abc', 'test', 'Hallo', 'xxxxxxxxxxxx']) {
      expect(calculateChecksum(abweichend), `abweichend: ${JSON.stringify(abweichend)}`)
        .not.toBe(fnv1aIndependent(abweichend));
    }
  });

  it('HAUPTZUSICHERUNG: GEMESSEN weichen 192 der 256 Einzelzeichen ab', () => {
    // Die Zahl macht das Ausmass greifbar: es ist nicht ein Sonderfall, es ist die Mehrheit.
    let gleich = 0;
    for (let code = 0; code < 256; code++) {
      const zeichen = String.fromCharCode(code);
      if (calculateChecksum(zeichen) === fnv1aIndependent(zeichen)) gleich += 1;
    }
    expect(gleich).toBe(64);
    expect(256 - gleich).toBe(192);
  });

  it('bei laengeren Texten sind die Werte VOLLSTAENDIG verschieden, nicht nur um eins', () => {
    // Bei 'b' war die Differenz eins - das koennte man fuer Rundung halten. Bei 'test' sind die Werte
    // vollstaendig verschieden, und damit ist klar: hier wird nicht gerundet, hier gehen Bits verloren.
    expect(calculateChecksum('test')).toBe('88ab2ffc');
    expect(fnv1aIndependent('test')).toBe('afd071e5');
  });

  it('der leere Text ergibt die Offset-Basis', () => {
    // Ohne Schleifendurchlauf bleibt der Startwert stehen: 0x811c9dc5.
    expect(calculateChecksum('')).toBe('811c9dc5');
  });

  it('HAUPTZUSICHERUNG: das Ergebnis ist immer genau acht Zeichen', () => {
    // `padStart(8, '0')` - ein Wert ohne fuehrende Nullen muss aufgefuellt werden.
    for (const probe of ['', 'a', 'b', 'aa', 'ab', 'z', 'zz', 'test', 'x'.repeat(500)]) {
      expect(calculateChecksum(probe), JSON.stringify(probe)).toHaveLength(8);
    }
  });

  it('ist immer klein geschriebener Hexadezimaltext', () => {
    for (const probe of ['', 'a', 'Hallo', 'x'.repeat(100)]) {
      expect(calculateChecksum(probe)).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('HAUPTZUSICHERUNG: die Funktion ist DETERMINISTISCH — das ist trotz des Befunds gewahrt', () => {
    // Der Befund macht die Pruefsumme nicht unbrauchbar: sie ist reproduzierbar. Er macht sie nur zu etwas
    // anderem als dem, was der Kommentar behauptet.
    const probe = 'Ein Dokument mit Inhalt';
    expect(calculateChecksum(probe)).toBe(calculateChecksum(probe));
  });

  it('verschiedene Texte ergeben verschiedene Pruefsummen', () => {
    // Eine schwache Pruefsumme, die alles auf denselben Wert abbildet, waere fuer die Aenderungserkennung
    // wertlos. Eine Stichprobe genuegt, um die Grobheit zu zeigen.
    const werte = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(calculateChecksum));
    expect(werte.size).toBe(8);
  });

  it('erkennt eine einzelne Zeichenaenderung', () => {
    expect(calculateChecksum('word/document.xml')).not.toBe(calculateChecksum('word/document2xml'));
  });
});

describe('createRoundtripManifest — leer, aber vollstaendig', () => {
  it('alle Sammlungen sind vorhanden und leer', () => {
    const m = createRoundtripManifest('docx');
    expect(m.stashedParts).toEqual({});
    expect(m.customProperties).toEqual({});
    expect(m.preservedNamespaces).toEqual({});
    expect(m.unknownParagraphAttributes).toEqual({});
    expect(m.originalChecksum).toBe('');
  });

  it('uebernimmt das Quellformat und hat einen Zeitstempel', () => {
    const m = createRoundtripManifest('odt');
    expect(m.sourceFormat).toBe('odt');
    expect(Number.isFinite(m.timestamp)).toBe(true);
    expect(m.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('das Quellformat ist standardmaessig unknown', () => {
    expect(createRoundtripManifest().sourceFormat).toBe('unknown');
  });

  it('jedes Manifest hat eine eigene Kennung', () => {
    expect(createRoundtripManifest().id).not.toBe(createRoundtripManifest().id);
    expect(createRoundtripManifest().id.length).toBeGreaterThan(0);
  });
});

describe('compileRoundtripPackage — kein gestashtes Teil geht verloren', () => {
  it('HAUPTZUSICHERUNG: ALLE gestashten Teile ueberleben das Zusammensetzen', () => {
    // Ein einziger verlorener Teil ist der Datenverlust, den dieses Modul verhindern soll.
    const m = manifest({
      stashedParts: {
        'word/theme/theme1.xml': '<theme/>',
        'word/numbering.xml': '<numbering/>',
        'docProps/app.xml': '<app/>',
        '[Content_Types].xml': '<types/>',
      },
    });
    const paket = compileRoundtripPackage(m, '<document/>');
    for (const pfad of Object.keys(m.stashedParts)) {
      expect(paket[pfad], pfad).toBe(m.stashedParts[pfad]);
    }
  });

  it('HAUPTZUSICHERUNG: der Dokumentteil wird nach Format benannt', () => {
    expect(compileRoundtripPackage(manifest({ sourceFormat: 'docx' }), 'X')['word/document.xml']).toBe('X');
    expect(compileRoundtripPackage(manifest({ sourceFormat: 'odt' }), 'X')['content.xml']).toBe('X');
    expect(compileRoundtripPackage(manifest({ sourceFormat: 'rtf' }), 'X')['document.txt']).toBe('X');
    expect(compileRoundtripPackage(manifest({ sourceFormat: 'unknown' }), 'X')['document.txt']).toBe('X');
  });

  it('HAUPTZUSICHERUNG: das neue Dokument ersetzt ein gleichnamiges gestashtes Teil', () => {
    // Sonst stuende die alte Fassung im Paket und die Aenderung waere verloren.
    const m = manifest({ stashedParts: { 'word/document.xml': '<alt/>' } });
    expect(compileRoundtripPackage(m, '<neu/>')['word/document.xml']).toBe('<neu/>');
  });

  it('das Ergebnis enthaelt genau die gestashten Teile plus einen Dokumentteil', () => {
    const m = manifest({ stashedParts: { 'a.xml': 'A', 'b.xml': 'B' } });
    const paket = compileRoundtripPackage(m, 'X');
    expect(Object.keys(paket).sort()).toEqual(['a.xml', 'b.xml', 'word/document.xml']);
  });

  it('das Manifest wird nicht veraendert', () => {
    const m = manifest({ stashedParts: { 'a.xml': 'A' } });
    const vorher = JSON.stringify(m);
    compileRoundtripPackage(m, 'X');
    expect(JSON.stringify(m)).toBe(vorher);
  });

  it('ein leeres Manifest ergibt ein Paket mit nur dem Dokumentteil', () => {
    const paket = compileRoundtripPackage(createRoundtripManifest('docx'), 'X');
    expect(Object.keys(paket)).toEqual(['word/document.xml']);
  });
});

describe('mergePreservedNamespaces — einfuegen, aber nicht doppelt', () => {
  it('fuegt eine fehlende Namensraumdeklaration vor der schliessenden Klammer ein', () => {
    const m = manifest({ preservedNamespaces: { w14: 'http://schemas.microsoft.com/office/word/2010/wordml' } });
    const ergebnis = mergePreservedNamespaces('<w:document>', m);
    expect(ergebnis).toContain('xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"');
    expect(ergebnis).toContain('<w:document');
    expect(ergebnis).toContain('>');
  });

  it('HAUPTZUSICHERUNG: eine bereits vorhandene Deklaration wird NICHT erneut eingefuegt', () => {
    // Ein doppeltes Attribut ist ungueltiges XML.
    const m = manifest({ preservedNamespaces: { w14: 'http://beispiel' } });
    const tag = '<w:document xmlns:w14="http://beispiel">';
    const ergebnis = mergePreservedNamespaces(tag, m);
    expect(ergebnis).toBe(tag);
    expect((ergebnis.match(/xmlns:w14=/g) ?? [])).toHaveLength(1);
  });

  it('HAUPTZUSICHERUNG: ohne schliessende Klammer bleibt der Tag unveraendert', () => {
    // Es gibt keine Stelle zum Einfuegen - und ein Anhaengen am Ende waere ungueltiges XML.
    const m = manifest({ preservedNamespaces: { w14: 'http://beispiel' } });
    expect(mergePreservedNamespaces('<w:document', m)).toBe('<w:document');
  });

  it('mehrere Namensraeume werden alle eingefuegt', () => {
    const m = manifest({ preservedNamespaces: { a: 'http://a', b: 'http://b', c: 'http://c' } });
    const ergebnis = mergePreservedNamespaces('<root>', m);
    for (const prefix of ['a', 'b', 'c']) {
      expect(ergebnis).toContain(`xmlns:${prefix}="http://${prefix}"`);
    }
  });

  it('ohne Namensraeume bleibt der Tag unveraendert', () => {
    expect(mergePreservedNamespaces('<root>', createRoundtripManifest())).toBe('<root>');
  });

  it('HAUPTZUSICHERUNG: das Ergebnis bleibt ein einzelner Tag mit GENAU einer schliessenden Klammer', () => {
    // Ein Einfuegen an der falschen Stelle erzeugte zwei Tags oder eine kaputte Struktur.
    const m = manifest({ preservedNamespaces: { a: 'http://a', b: 'http://b' } });
    const ergebnis = mergePreservedNamespaces('<root attr="1">', m);
    expect(ergebnis.startsWith('<root attr="1"')).toBe(true);
    expect(ergebnis.endsWith('>')).toBe(true);
    expect((ergebnis.match(/>/g) ?? [])).toHaveLength(1);
  });

  it('ist deterministisch', () => {
    const m = manifest({ preservedNamespaces: { a: 'http://a', b: 'http://b' } });
    expect(mergePreservedNamespaces('<root>', m)).toBe(mergePreservedNamespaces('<root>', m));
  });
});

describe('verifyManifestIntegrity — die Pruefung selbst', () => {
  it('HAUPTZUSICHERUNG: ohne Kennung ist das Manifest ungueltig', () => {
    // `Boolean(manifest.id && manifest.sourceFormat)` - die Kennung muss wahr sein.
    expect(verifyManifestIntegrity(manifest({ id: '' })).valid).toBe(false);
  });

  it('mit Kennung und Format ist es gueltig', () => {
    expect(verifyManifestIntegrity(createRoundtripManifest('docx')).valid).toBe(true);
  });

  it('HAUPTZUSICHERUNG: es zaehlt die gestashten Teile', () => {
    const m = manifest({ stashedParts: { 'a': '1', 'b': '2', 'c': '3' } });
    expect(verifyManifestIntegrity(m).stashedCount).toBe(3);
    expect(verifyManifestIntegrity(createRoundtripManifest()).stashedCount).toBe(0);
  });

  it('es meldet, ob Namensraeume erhalten wurden', () => {
    expect(verifyManifestIntegrity(manifest({ preservedNamespaces: { a: 'http://a' } })).hasNamespaces).toBe(true);
    expect(verifyManifestIntegrity(createRoundtripManifest()).hasNamespaces).toBe(false);
  });

  it('die Zahl der gestashten Teile passt zu dem, was zusammengesetzt wird', () => {
    // Ein Widerspruch zwischen Pruefung und Zusammensetzung waere ein stiller Fehler.
    const m = manifest({ stashedParts: { 'a.xml': 'A', 'b.xml': 'B' } });
    const paket = compileRoundtripPackage(m, 'X');
    // Ein Dokumentteil kommt hinzu.
    expect(Object.keys(paket).length).toBe(verifyManifestIntegrity(m).stashedCount + 1);
  });
});
