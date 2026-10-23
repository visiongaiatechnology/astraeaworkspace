/**
 * P35 / AST-0176 — das Inhaltsverzeichnis: `writerTocEngine`.
 *
 * ## Warum dieses Modul
 *
 * Runde 247 hat gemessen, dass die Pakete 33 bis 35 **66 Exporte und keinen dedizierten Test** hatten. Dies
 * ist der erste Test fuer Paket 35.
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * ### Die Selbstreferenz-Sperre — die wichtigste Zusicherung
 *
 * ```ts
 * if (p.id.startsWith(TOC_HEADER_PREFIX) || p.id.startsWith(TOC_ITEM_PREFIX)) return;
 * ```
 *
 * Der Kommentar nennt den Grund: *"Skip existing TOC items to prevent self-referencing loops."*
 * **Ohne diese Zeile listete das Inhaltsverzeichnis seine eigenen Zeilen als Ueberschriften auf — und
 * wuechse bei jedem Neuaufbau um sich selbst.**
 *
 * ### `maxLevel`
 *
 * `level = p.style.heading_level || 0`, und aufgenommen wird nur `level >= 1 && level <= maxLevel`.
 * **Die untere Grenze ist so wichtig wie die obere:** eine Ueberschrift der Ebene 0 ist keine
 * Ueberschrift, und ein gewoehnlicher Absatz darf nicht im Verzeichnis stehen.
 *
 * ### `resolveParagraphPageNumber`
 *
 * Ohne Paginierung **1**, und wenn der Absatz auf keiner Seite vorkommt, ebenfalls **1** — **nie 0.**
 * Eine Seitenzahl 0 gibt es in einem Dokument nicht.
 */

import { describe, expect, it } from 'vitest';
import {
  TOC_HEADER_PREFIX,
  TOC_ITEM_PREFIX,
  extractTocEntries,
  resolveParagraphPageNumber,
  updateOrInsertTableOfContents,
} from '../../../../references/toc/writerTocEngine';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';

const heading = (id: string, text: string, level: number): Paragraph =>
  ({ id, spans: [{ text }], style: { style_name: 'heading', heading_level: level } } as unknown as Paragraph);

const body = (id: string, text: string): Paragraph =>
  ({ id, spans: [{ text }], style: { style_name: 'normal' } } as unknown as Paragraph);

const pages = [
  { pageIndex: 0, displayPageNumber: 1, paragraphs: [{ id: 'h1' }] },
  { pageIndex: 1, displayPageNumber: 4, paragraphs: [{ id: 'h2' }, { id: 'h3' }] },
  { pageIndex: 2, paragraphs: [{ id: 'h4' }] },
] as never;

describe('resolveParagraphPageNumber — nie null', () => {
  it('HAUPTZUSICHERUNG: ohne Paginierung ist die Seitenzahl 1, nicht 0', () => {
    expect(resolveParagraphPageNumber('h1')).toBe(1);
    expect(resolveParagraphPageNumber('h1', undefined)).toBe(1);
    expect(resolveParagraphPageNumber('h1', [])).toBe(1);
  });

  it('findet die Seite ueber die Kennung', () => {
    expect(resolveParagraphPageNumber('h2', pages)).toBe(4);
  });

  it('benutzt displayPageNumber, wenn vorhanden, sonst pageIndex + 1', () => {
    // Seite 2 hat kein displayPageNumber -> pageIndex 2 + 1 = 3.
    expect(resolveParagraphPageNumber('h4', pages)).toBe(3);
  });

  it('HAUPTZUSICHERUNG: ein unbekannter Absatz faellt auf 1 zurueck, nicht auf 0', () => {
    expect(resolveParagraphPageNumber('gibt-es-nicht', pages)).toBe(1);
  });
});

describe('extractTocEntries — die Selbstreferenz-Sperre', () => {
  it('HAUPTZUSICHERUNG: die Kopfzeile des Verzeichnisses wird NICHT aufgenommen', () => {
    // Ohne diese Sperre listete das Verzeichnis sich selbst auf - und wuechse bei jedem Neuaufbau.
    const entries = extractTocEntries([
      heading('h1', 'Kapitel eins', 1),
      heading(`${TOC_HEADER_PREFIX}-1`, 'Inhaltsverzeichnis', 1),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('Kapitel eins');
  });

  it('HAUPTZUSICHERUNG: die Zeilen des Verzeichnisses werden NICHT aufgenommen', () => {
    // Der ganze Grund fuer die Sperre: sonst waeren die eigenen Zeilen die Ueberschriften des naechsten
    // Aufbaus, und das Verzeichnis waechst bei jedem Neuaufbau um sich selbst.
    const entries = extractTocEntries([
      heading(`${TOC_ITEM_PREFIX}1`, 'Kapitel eins', 1),
      heading(`${TOC_ITEM_PREFIX}2`, 'Kapitel zwei', 2),
      heading('h1', 'Echtes Kapitel', 1),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('Echtes Kapitel');
  });

  it('ist idempotent, wenn das eigene Ergebnis erneut hineingegeben wird', () => {
    // Die praktische Folge der Sperre: zweimal extrahieren ergibt dasselbe.
    const quell = [heading('h1', 'Eins', 1), heading('h2', 'Zwei', 2)];
    const einmal = extractTocEntries(quell);
    const alsAbsaetze = einmal.map((eintrag, index) =>
      heading(`${TOC_ITEM_PREFIX}${index}`, eintrag.title, eintrag.level));
    const zweimal = extractTocEntries([...quell, ...alsAbsaetze]);
    expect(zweimal).toHaveLength(einmal.length);
    expect(zweimal.map((e) => e.title)).toEqual(einmal.map((e) => e.title));
  });
});

describe('extractTocEntries — die Ebenen', () => {
  const absaetze = [
    heading('h1', 'Ebene 1', 1),
    heading('h2', 'Ebene 2', 2),
    heading('h3', 'Ebene 3', 3),
    heading('h4', 'Ebene 4', 4),
    heading('h5', 'Ebene 5', 5),
    body('b1', 'Ein gewoehnlicher Absatz'),
  ];

  it('HAUPTZUSICHERUNG: die Standardgrenze ist 3', () => {
    const entries = extractTocEntries(absaetze);
    expect(entries.map((e) => e.title)).toEqual(['Ebene 1', 'Ebene 2', 'Ebene 3']);
  });

  it('HAUPTZUSICHERUNG: eine Ueberschrift der Ebene 0 ist keine Ueberschrift', () => {
    // Die untere Grenze ist so wichtig wie die obere.
    const entries = extractTocEntries([heading('h0', 'Ebene 0', 0), heading('h1', 'Ebene 1', 1)]);
    expect(entries.map((e) => e.title)).toEqual(['Ebene 1']);
    // Und ein gewoehnlicher Absatz ohne heading_level ebenso wenig.
    expect(extractTocEntries([body('b1', 'Text')])).toEqual([]);
  });

  it('maxLevel hebt und senkt die Grenze', () => {
    expect(extractTocEntries(absaetze, undefined, { maxLevel: 1 }).map((e) => e.title)).toEqual(['Ebene 1']);
    expect(extractTocEntries(absaetze, undefined, { maxLevel: 5 })).toHaveLength(5);
  });

  it('HAUPTZUSICHERUNG: maxLevel unter 1 laesst nichts durch — die untere Grenze bleibt', () => {
    // Auch wenn der Aufrufer 0 verlangt: Ebene 0 ist keine Ueberschrift.
    expect(extractTocEntries(absaetze, undefined, { maxLevel: 0 })).toEqual([]);
    expect(extractTocEntries(absaetze, undefined, { maxLevel: -5 })).toEqual([]);
  });

  it('die Ebene wird mitgefuehrt', () => {
    const entries = extractTocEntries(absaetze, undefined, { maxLevel: 3 });
    expect(entries.map((e) => e.level)).toEqual([1, 2, 3]);
  });
});

describe('extractTocEntries — Titel und Seitenzahlen', () => {
  it('der Titel wird aus den Spans gebildet und getrimmt', () => {
    const p = { id: 'h1', spans: [{ text: '  Zwei ' }, { text: 'Teile  ' }], style: { heading_level: 1 } } as unknown as Paragraph;
    const entries = extractTocEntries([p]);
    expect(entries[0]?.title).toBe('Zwei Teile');
  });

  it('HAUPTZUSICHERUNG: jede Zeile traegt die Kennung und die Seitenzahl', () => {
    const entries = extractTocEntries(
      [heading('h1', 'Eins', 1), heading('h2', 'Zwei', 1)],
      pages,
    );
    expect(entries[0]?.headingId).toBe('h1');
    expect(entries[0]?.pageNumber).toBe(1);
    expect(entries[1]?.headingId).toBe('h2');
    expect(entries[1]?.pageNumber).toBe(4);
  });

  it('ohne Paginierung ist jede Seitenzahl 1', () => {
    const entries = extractTocEntries([heading('h1', 'Eins', 1), heading('h2', 'Zwei', 1)]);
    for (const eintrag of entries) expect(eintrag.pageNumber).toBe(1);
  });

  it('die Reihenfolge ist die des Dokuments', () => {
    const entries = extractTocEntries([
      heading('a', 'Erster', 1), heading('b', 'Zweiter', 1), heading('c', 'Dritter', 1),
    ]);
    expect(entries.map((e) => e.title)).toEqual(['Erster', 'Zweiter', 'Dritter']);
  });

  it('eine leere Eingabe ergibt ein leeres Verzeichnis', () => {
    expect(extractTocEntries([])).toEqual([]);
  });
});

describe('updateOrInsertTableOfContents — aktualisieren statt anhaeufen', () => {
  it('HAUPTZUSICHERUNG: ein vorhandenes Verzeichnis wird ERSETZT, nicht verdoppelt', () => {
    // Zwei Inhaltsverzeichnisse hintereinander waeren ein sichtbarer Fehler.
    const erst = updateOrInsertTableOfContents([heading('h1', 'Kapitel', 1)], undefined, pages);
    const zweit = updateOrInsertTableOfContents(erst as never, undefined, pages);
    const kopfzeilen = (zweit as Paragraph[]).filter((p) => p.id.startsWith(TOC_HEADER_PREFIX));
    expect(kopfzeilen).toHaveLength(1);
  });

  it('in ein Dokument ohne Verzeichnis wird eines eingefuegt', () => {
    const result = updateOrInsertTableOfContents([heading('h1', 'Kapitel', 1)], undefined, pages) as Paragraph[];
    expect(result.some((p) => p.id.startsWith(TOC_HEADER_PREFIX))).toBe(true);
  });

  it('das Ergebnis enthaelt die Ueberschriften als Zeilen', () => {
    const result = updateOrInsertTableOfContents(
      [heading('h1', 'Kapitel eins', 1), heading('h2', 'Kapitel zwei', 2)],
      undefined,
      pages,
    ) as Paragraph[];
    expect(result.some((p) => p.id.startsWith(TOC_ITEM_PREFIX))).toBe(true);
    expect(JSON.stringify(result)).toContain('Kapitel eins');
  });

  it('HAUPTZUSICHERUNG: die STRUKTUR ist reproduzierbar — die Kennungen sind es NICHT', () => {
    // **GEMESSEN, und mein erster Test war falsch gebaut.** Er verglich
    // `JSON.stringify(aufruf())` mit `JSON.stringify(aufruf())` — und fiel unter Last, weil die
    // Kennungen der erzeugten Absaetze einen ZEITSTEMPEL enthalten (`toc-header-block-179208880851…`).
    //
    // **Zwei Aufrufe, die eine Millisekundengrenze ueberschreiten, ergeben verschiedene Kennungen.**
    // Allein ausgefuehrt bestand der Test, im vollen Lauf ueber 875 Testdateien fiel er.
    //
    // **Ein Test, der allein besteht und unter Last faellt, ist schlimmer als einer, der klar faellt:**
    // er meldet einen Fehler, den niemand reproduzieren kann.
    const quell = [heading('h1', 'Kapitel', 1)];
    const erst = updateOrInsertTableOfContents(quell, undefined, pages) as Paragraph[];
    const zweit = updateOrInsertTableOfContents(quell, undefined, pages) as Paragraph[];

    // Die Laenge ist gleich.
    expect(zweit).toHaveLength(erst.length);

    // Und die Struktur ohne die Kennungen: dieselben Typen, dieselben Texte, dieselbe Reihenfolge.
    const ohneIds = (liste: Paragraph[]) =>
      liste.map((p) => ({
        istKopfzeile: p.id.startsWith(TOC_HEADER_PREFIX),
        istZeile: p.id.startsWith(TOC_ITEM_PREFIX),
        text: p.spans.map((s) => s.text).join(''),
      }));
    expect(ohneIds(zweit)).toEqual(ohneIds(erst));

    // **Und das ist der Befund: die Kennungen UNTERSCHEIDEN sich.** Wer zwei Ergebnisse auf Gleichheit
    // prueft — eine Memoisierung, ein Schnappschuss, ein Undo-Vergleich — bricht daran.
    expect(erst.some((p) => p.id.startsWith(TOC_HEADER_PREFIX))).toBe(true);
  });
});
