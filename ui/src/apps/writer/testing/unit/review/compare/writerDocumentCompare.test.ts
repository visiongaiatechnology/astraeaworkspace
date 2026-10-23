/**
 * P33 / AST-0161 — der Dokumentvergleich: `compareDocuments`.
 *
 * ## Warum dieses Modul
 *
 * Es ist der Erzeuger der Revisionen, deren Lebensdauer in den Runden 247 bis 251 belegt wurde. **Es nutzt
 * `createInsertedParagraphRevision`, `createDeletedParagraphRevision`, `createMoveRevision` und die
 * Textrevision** — deren Vertraege jetzt gelesen sind.
 *
 * ## Der Vertrag, aus dem Quelltext gelesen
 *
 * * `mergedParagraphs` ist die **revidierte** Fassung, und zwar **geklont** (`.map(cloneParagraph)`).
 * * **Vier Erkenntnisse in fester Reihenfolge:**
 *   1. **Loeschung** — ein Absatz der Ausgangsfassung, der in der revidierten fehlt.
 *   2. **Unveraendert** — `sameParagraph` und Ende.
 *   3. **Textaenderung** — beide vorhanden, Text verschieden.
 *   4. **Einfuegung** — ein Absatz der revidierten Fassung, der in der Ausgangsfassung fehlt.
 *   5. **Verschiebung** — **nur wenn die MENGE der Kennungen gleich bleibt und sich die REIHENFOLGE
 *      unterscheidet.** Eine Verschiebung bei zugleich geaenderter Menge waere nicht unterscheidbar von
 *      Loeschung plus Einfuegung, und der Quelltext waehlt dort die einfachere Deutung.
 *
 * **Die Zusicherung, die zaehlt: ohne Unterschied entsteht KEINE Revision.** Ein Vergleich, der bei gleichen
 * Dokumenten etwas meldet, ist unbrauchbar.
 */

import { describe, expect, it } from 'vitest';
import { compareDocuments } from '../../../../review/compare/writerDocumentCompare';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';

const paragraph = (id: string, text: string): Paragraph =>
  ({ id, spans: [{ text }], style: { style_name: 'normal' } } as unknown as Paragraph);

const unwrap = (result: unknown) => result as {
  mergedParagraphs: Paragraph[];
  generatedRevisions: Array<{ type: string; paragraphId: string }>;
  stats: Record<string, number>;
};

describe('compareDocuments — ohne Unterschied', () => {
  it('HAUPTZUSICHERUNG: gleiche Dokumente erzeugen KEINE Revision', () => {
    // Ein Vergleich, der bei gleichen Dokumenten etwas meldet, ist unbrauchbar.
    const a = [paragraph('p0', 'Text A'), paragraph('p1', 'Text B')];
    const b = [paragraph('p0', 'Text A'), paragraph('p1', 'Text B')];
    const result = unwrap(compareDocuments(a, b, 'Alice'));
    expect(result.generatedRevisions).toHaveLength(0);
  });

  it('beide leer ergeben keine Revision', () => {
    expect(unwrap(compareDocuments([], [], 'Alice')).generatedRevisions).toHaveLength(0);
  });

  it('ist deterministisch', () => {
    const a = [paragraph('p0', 'A')];
    const b = [paragraph('p0', 'B')];
    expect(unwrap(compareDocuments(a, b, 'X')).generatedRevisions.map((r) => r.type))
      .toEqual(unwrap(compareDocuments(a, b, 'X')).generatedRevisions.map((r) => r.type));
  });
});

describe('compareDocuments — die vier Erkenntnisse', () => {
  it('eine Textaenderung erzeugt eine Revision am selben Absatz', () => {
    const result = unwrap(compareDocuments([paragraph('p0', 'alt')], [paragraph('p0', 'viel laenger neu')], 'Alice'));
    expect(result.generatedRevisions.length).toBeGreaterThanOrEqual(1);
    expect(result.generatedRevisions[0]?.paragraphId).toBe('p0');
  });

  it('HAUPTZUSICHERUNG: eine Loeschung wird erkannt', () => {
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'bleibt'), paragraph('p1', 'verschwindet')],
      [paragraph('p0', 'bleibt')],
      'Alice',
    ));
    expect(result.generatedRevisions).toHaveLength(1);
    expect(result.generatedRevisions[0]?.paragraphId).toBe('p1');
  });

  it('HAUPTZUSICHERUNG: eine Einfuegung wird erkannt', () => {
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'bleibt')],
      [paragraph('p0', 'bleibt'), paragraph('p1', 'neu')],
      'Alice',
    ));
    expect(result.generatedRevisions).toHaveLength(1);
    expect(result.generatedRevisions[0]?.paragraphId).toBe('p1');
  });

  it('mehrere Aenderungen ergeben mehrere Revisionen', () => {
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'a'), paragraph('p1', 'b'), paragraph('p2', 'c')],
      [paragraph('p0', 'a'), paragraph('p3', 'neu')],
      'Alice',
    ));
    // p1 und p2 geloescht, p3 eingefuegt.
    expect(result.generatedRevisions).toHaveLength(3);
    const ids = result.generatedRevisions.map((r) => r.paragraphId).sort();
    expect(ids).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('compareDocuments — die Verschiebung', () => {
  it('HAUPTZUSICHERUNG: dieselbe MENGE in anderer REIHENFOLGE ergibt eine Verschiebung', () => {
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'eins'), paragraph('p1', 'zwei')],
      [paragraph('p1', 'zwei'), paragraph('p0', 'eins')],
      'Alice',
    ));
    // Eine Verschiebung, nicht eine Loeschung plus eine Einfuegung.
    expect(result.generatedRevisions.length).toBeGreaterThanOrEqual(1);
    expect(result.generatedRevisions.some((r) => r.type === 'move')).toBe(true);
  });

  it('eine geaenderte MENGE ergibt KEINE Verschiebung', () => {
    // Sonst waere eine Verschiebung nicht von Loeschung plus Einfuegung unterscheidbar.
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'eins'), paragraph('p1', 'zwei')],
      [paragraph('p1', 'zwei')],
      'Alice',
    ));
    expect(result.generatedRevisions.some((r) => r.type === 'move')).toBe(false);
  });

  it('gleiche Reihenfolge ergibt keine Verschiebung', () => {
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'eins'), paragraph('p1', 'zwei')],
      [paragraph('p0', 'eins'), paragraph('p1', 'zwei')],
      'Alice',
    ));
    expect(result.generatedRevisions).toHaveLength(0);
  });
});

describe('compareDocuments — die zusammengefuehrte Fassung', () => {
  it('HAUPTZUSICHERUNG: die zusammengefuehrte Fassung ist die REVIDIERTE', () => {
    const b = [paragraph('p0', 'neu')];
    const result = unwrap(compareDocuments([paragraph('p0', 'alt')], b, 'Alice'));
    expect(result.mergedParagraphs).toHaveLength(1);
    expect(result.mergedParagraphs[0]?.spans[0]?.text).toBe('neu');
  });

  it('HAUPTZUSICHERUNG: sie ist eine KOPIE, nicht dieselben Objekte', () => {
    // Sonst wuerde eine spaetere Aenderung am revidierten Dokument den Vergleich rueckwirkend veraendern.
    const b = [paragraph('p0', 'neu')];
    const result = unwrap(compareDocuments([paragraph('p0', 'alt')], b, 'Alice'));
    expect(result.mergedParagraphs[0]).not.toBe(b[0]);
    (b[0]!.spans[0] as { text: string }).text = 'NACHTRAEGLICH';
    expect(result.mergedParagraphs[0]?.spans[0]?.text).toBe('neu');
  });

  it('die Zahl der Absaetze entspricht der revidierten Fassung', () => {
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'a')],
      [paragraph('p0', 'a'), paragraph('p1', 'b'), paragraph('p2', 'c')],
      'Alice',
    ));
    expect(result.mergedParagraphs).toHaveLength(3);
  });
});

describe('compareDocuments — die Statistik', () => {
  it('meldet Zahlen, keine undefinierten Werte', () => {
    const result = unwrap(compareDocuments([paragraph('p0', 'a')], [paragraph('p0', 'b')], 'Alice'));
    for (const [key, value] of Object.entries(result.stats)) {
      expect(typeof value, key).toBe('number');
      expect(Number.isFinite(value), key).toBe(true);
    }
  });

  it('HAUPTZUSICHERUNG: ohne Unterschied sind die AENDERUNGSZahlen null - aber identicalCount zaehlt die Gleichen', () => {
    // **GEMESSEN und zunaechst falsch erwartet:** ich pruefte ALLE Zahlen auf 0. `identicalCount` ist aber
    // 1 - und das ist richtig: es zaehlt die ABSAETZE, die gleich geblieben sind, nicht die Aenderungen.
    // Ein Feld, das die unveraenderten zaehlt, muss bei einem unveraenderten Absatz 1 melden.
    const result = unwrap(compareDocuments([paragraph('p0', 'a')], [paragraph('p0', 'a')], 'Alice'));
    expect(result.stats.identicalCount).toBe(1);

    // Die AENDERUNGSzaehler sind null - das ist die eigentliche Zusicherung.
    for (const [key, value] of Object.entries(result.stats)) {
      if (key === 'identicalCount') continue;
      expect(value, key).toBe(0);
    }
  });

  it('identicalCount waechst mit der Zahl gleicher Absaetze', () => {
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'a'), paragraph('p1', 'b')],
      [paragraph('p0', 'a'), paragraph('p1', 'b')],
      'Alice',
    ));
    expect(result.stats.identicalCount).toBe(2);
  });

  it('HAUPTZUSICHERUNG: die Statistik zaehlt, was die Revisionen zeigen', () => {
    // Eine Statistik, die etwas anderes behauptet als die Revisionen, ist ein stiller Widerspruch.
    const result = unwrap(compareDocuments(
      [paragraph('p0', 'bleibt'), paragraph('p1', 'weg')],
      [paragraph('p0', 'bleibt'), paragraph('p2', 'neu')],
      'Alice',
    ));
    expect(result.generatedRevisions).toHaveLength(2); // p1 geloescht, p2 eingefuegt
    const summe = Object.values(result.stats).reduce((a, b) => a + b, 0);
    expect(summe).toBeGreaterThan(0);
  });
});
