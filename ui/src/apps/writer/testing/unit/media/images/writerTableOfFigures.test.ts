/**
 * P25 / AST-0121 — das Abbildungsverzeichnis: `generateTableOfFigures`.
 *
 * ## Der Vertrag, aus dem Quelltext gelesen
 *
 * ```ts
 * images.forEach((img, idx) => {
 *   const figureIndex = idx + 1;                 // EINS-basiert
 *   const label = `Abbildung ${figureIndex}`;
 *   const cleanCaption = img.caption
 *     ? stripAbbildungPrefix(img.caption)        // entfernt ein vorhandenes Praefix
 *     : img.name;                                // Rueckfall auf den Namen
 *   let pageNumber = 1;                          // Standard
 *   if (pages && pages.length > 0) { ... pageNumber = page.displayPageNumber ?? (page.pageIndex + 1); }
 * });
 * ```
 *
 * **Und eine Falle, in die ich beim Schreiben dieses Kommentars getappt bin:** der Quelltext entfernt das
 * Praefix mit einem regulaeren Ausdruck, dessen Literal die Zeichenfolge `*` `/` enthaelt. **Wortwoertlich in
 * einem Blockkommentar zitiert beendet sie ihn vorzeitig** — der Test liess sich nicht einmal uebersetzen.
 * Deshalb steht hier `stripAbbildungPrefix(...)` statt des Literals.
 *
 * **Vier Zusicherungen, die den Ausschlag geben:**
 *   1. **Kein Bild geht verloren** — die Liste ist genau so lang wie die Eingabe, und die Indizes laufen
 *      luecken- und dopplungsfrei von 1 bis n.
 *   2. **Ein vorhandenes Praefix wird entfernt** — sonst stuende „Abbildung 1: Abbildung 9: Text" im
 *      Verzeichnis. Dieselbe Regel wie in `resolveFigureCaption`.
 *   3. **Ohne Beschriftung greift der Name**, und ohne beides bleibt nur das Praefix.
 *   4. **Die Seitenzahl faellt auf 1 zurueck**, wenn keine Paginierung vorliegt oder der Ankerabsatz auf
 *      keiner Seite vorkommt — nie auf 0 und nie auf undefined.
 */

import { describe, expect, it } from 'vitest';
import { generateTableOfFigures } from '../../../../media/images/operations/writerMediaOperations';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/workspace';

const image = (over: Record<string, unknown> = {}): WriterImageBlockData =>
  ({ id: 'img', dataUrl: 'data:image/png;base64,AA', ...over } as unknown as WriterImageBlockData);

describe('generateTableOfFigures — die Indizes', () => {
  it('eine leere Liste ergibt ein leeres Verzeichnis', () => {
    expect(generateTableOfFigures([])).toEqual([]);
  });

  it('HAUPTZUSICHERUNG: kein Bild geht verloren, die Indizes laufen von 1 bis n', () => {
    const images = [image({ id: 'a' }), image({ id: 'b' }), image({ id: 'c' })];
    const result = generateTableOfFigures(images);
    expect(result).toHaveLength(3);
    // Eins-basiert, luecken- und dopplungsfrei.
    const labels = result.map((item) => (item as unknown as { label?: string }).label);
    expect(labels).toEqual(['Abbildung 1', 'Abbildung 2', 'Abbildung 3']);
  });

  it('die Reihenfolge der Eingabe bleibt erhalten', () => {
    const result = generateTableOfFigures([
      image({ id: 'erst', caption: 'Erster' }),
      image({ id: 'zweit', caption: 'Zweiter' }),
    ]);
    const texte = JSON.stringify(result);
    expect(texte.indexOf('Erster')).toBeLessThan(texte.indexOf('Zweiter'));
  });

  it('ist deterministisch', () => {
    const images = [image({ id: 'a', caption: 'X' }), image({ id: 'b', caption: 'Y' })];
    expect(generateTableOfFigures(images)).toEqual(generateTableOfFigures(images));
  });
});

describe('generateTableOfFigures — die Beschriftung', () => {
  it('HAUPTZUSICHERUNG: ein vorhandenes Praefix wird entfernt, nicht verdoppelt', () => {
    const result = generateTableOfFigures([image({ caption: 'Abbildung 9: Quartalsbericht' })]);
    const text = JSON.stringify(result);
    expect(text).toContain('Quartalsbericht');
    // „Abbildung" darf genau einmal vorkommen - das ist der ganze Punkt.
    expect((text.match(/Abbildung/g) ?? [])).toHaveLength(1);
  });

  it('das Entfernen ist tolerant gegen Schreibweise und Leerzeichen', () => {
    for (const caption of ['abbildung 9: Text', 'ABBILDUNG 9:Text', 'Abbildung  9  :  Text']) {
      const text = JSON.stringify(generateTableOfFigures([image({ caption })]));
      expect((text.match(/Abbildung/gi) ?? []), caption).toHaveLength(1);
    }
  });

  it('ohne Beschriftung greift der Name des Bildes', () => {
    const result = generateTableOfFigures([image({ caption: undefined, name: 'Diagramm A' })]);
    expect(JSON.stringify(result)).toContain('Diagramm A');
  });

  it('ohne Beschriftung UND ohne Namen bleibt nur das Praefix', () => {
    const result = generateTableOfFigures([image({ caption: undefined, name: undefined })]);
    expect(result).toHaveLength(1);
    expect(JSON.stringify(result)).toContain('Abbildung 1');
  });
});

describe('generateTableOfFigures — die Seitenzahl', () => {
  const pages = [
    { pageIndex: 0, displayPageNumber: 1, paragraphs: [{ id: 'p0' }] },
    { pageIndex: 1, displayPageNumber: 4, paragraphs: [{ id: 'p1' }, { id: 'p2' }] },
    { pageIndex: 2, paragraphs: [{ id: 'p3' }] },
  ] as never;

  it('HAUPTZUSICHERUNG: ohne Paginierung ist die Seitenzahl 1 — nie 0, nie undefined', () => {
    const result = generateTableOfFigures([image({ anchorParagraphId: 'p1' })]);
    expect(JSON.stringify(result)).toContain('"pageNumber":1');
    const ohne = generateTableOfFigures([image({ anchorParagraphId: 'p1' })], undefined);
    expect(JSON.stringify(ohne)).toContain('"pageNumber":1');
  });

  it('findet die Seite ueber den Ankerabsatz', () => {
    const result = generateTableOfFigures([image({ anchorParagraphId: 'p1' })], pages);
    // Seite 1 traegt displayPageNumber 4.
    expect(JSON.stringify(result)).toContain('"pageNumber":4');
  });

  it('benutzt displayPageNumber, wenn vorhanden, sonst pageIndex + 1', () => {
    // Seite 2 hat kein displayPageNumber -> pageIndex 2 + 1 = 3.
    const result = generateTableOfFigures([image({ anchorParagraphId: 'p3' })], pages);
    expect(JSON.stringify(result)).toContain('"pageNumber":3');
  });

  it('HAUPTZUSICHERUNG: ein Anker, den es nicht gibt, faellt auf 1 zurueck', () => {
    const result = generateTableOfFigures([image({ anchorParagraphId: 'gibt-es-nicht' })], pages);
    expect(JSON.stringify(result)).toContain('"pageNumber":1');
  });

  it('ein Bild ohne Ankerabsatz faellt ebenfalls auf 1 zurueck', () => {
    const result = generateTableOfFigures([image({ anchorParagraphId: undefined })], pages);
    expect(JSON.stringify(result)).toContain('"pageNumber":1');
  });

  it('mehrere Bilder auf verschiedenen Seiten bekommen ihre eigene Zahl', () => {
    const result = generateTableOfFigures(
      [image({ id: 'a', anchorParagraphId: 'p1' }), image({ id: 'b', anchorParagraphId: 'p3' })],
      pages,
    );
    const text = JSON.stringify(result);
    expect(text).toContain('"pageNumber":4');
    expect(text).toContain('"pageNumber":3');
  });
});
