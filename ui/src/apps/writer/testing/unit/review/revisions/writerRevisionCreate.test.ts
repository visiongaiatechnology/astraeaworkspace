/**
 * P33 / AST-0161 — die Erzeugung von Revisionen: die `create*`-Familie.
 *
 * ## Warum diese Seite
 *
 * `revertWriterRevision` (Runde 247) und `acceptRevision` (Runde 250) sind geprueft. **Dies ist der Anfang
 * der Lebensdauer** — damit ist sie von der Erzeugung bis zur Entscheidung belegt.
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * ### `createRevision(type, paragraphId, author, originalText?, newText?, details?, payload?)`
 *
 * * **`status` ist immer `'pending'`** — eine neue Revision ist eine offene Frage.
 * * **`authorColor` kommt aus einer Tabelle:** `You` `#3b82f6`, `Alice` `#10b981`, `Bob` `#f59e0b`,
 *   `Reviewer` `#ec4899` — **und jeder andere Autor bekommt `#8b5cf6`.**
 * * `id` ist ein `crypto.randomUUID()`, also **fuer jede Revision verschieden**.
 *
 * ### `createTextRevision(paragraphId, beforeText, afterText, ...)`
 *
 * ```ts
 * afterText.length >= beforeText.length ? 'insert' : 'delete'
 * ```
 *
 * **Der Typ wird nach LAENGE abgeleitet, nicht nach Inhalt.** Ein Ersetzen gleicher Laenge gilt damit als
 * `insert`. Das ist eine Regel, die ein Test festhalten muss — aus dem Namen der Funktion waere sie nicht
 * ableitbar.
 *
 * ### `createParagraphTextRevision(beforeParagraph, afterParagraph, ...)`
 *
 * * **Wirft, wenn die Absatz-IDs sich unterscheiden** — eine Textrevision braucht denselben Absatz.
 * * **`structuredClone` auf beide Absaetze:** der Payload traegt **tiefe Kopien**. Wer den Quellabsatz
 *   spaeter aendert, darf die Revision nicht mitveraendern — sonst waere die Aenderungsverfolgung wertlos.
 */

import { describe, expect, it } from 'vitest';
import {
  createParagraphTextRevision,
  createRevision,
  createTextRevision,
  paragraphText,
} from '../../../../review/revisions/track-changes/writerTrackChangesEngine';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';

const paragraph = (id: string, text: string): Paragraph =>
  ({ id, spans: [{ text }], style: { style_name: 'normal' } } as unknown as Paragraph);

describe('createRevision — eine neue Revision ist immer offen', () => {
  it('HAUPTZUSICHERUNG: status ist pending, nie etwas anderes', () => {
    // Eine neue Revision ist eine offene Frage. Waere sie vorab entschieden, wuerde sie nie gestellt.
    for (const type of ['insert', 'delete', 'format', 'move']) {
      expect(createRevision(type as never, 'p0').status).toBe('pending');
    }
  });

  it('die Kennung ist fuer jede Revision verschieden', () => {
    const a = createRevision('insert' as never, 'p0');
    const b = createRevision('insert' as never, 'p0');
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThan(0);
  });

  it('HAUPTZUSICHERUNG: die Autorfarben kommen aus der Tabelle, mit Rueckfall', () => {
    const farbe = (author: string) => createRevision('insert' as never, 'p0', author).authorColor;
    expect(farbe('You')).toBe('#3b82f6');
    expect(farbe('Alice')).toBe('#10b981');
    expect(farbe('Bob')).toBe('#f59e0b');
    expect(farbe('Reviewer')).toBe('#ec4899');
    // Und jeder unbekannte Autor bekommt denselben Rueckfall - nicht undefined und nicht eine Zufallsfarbe.
    for (const unbekannt of ['Carla', '', 'niemand']) {
      expect(farbe(unbekannt), unbekannt).toBe('#8b5cf6');
    }
  });

  it('der Standardautor ist You', () => {
    expect(createRevision('insert' as never, 'p0').author).toBe('You');
  });

  it('die uebergebenen Felder landen in der Revision', () => {
    const payload = { kind: 'text', beforeText: 'a', afterText: 'b' } as never;
    const revision = createRevision('insert' as never, 'p7', 'Alice', 'alt', 'neu', 'Notiz', payload);
    expect(revision.paragraphId).toBe('p7');
    expect(revision.type).toBe('insert');
    expect(revision.originalText).toBe('alt');
    expect(revision.newText).toBe('neu');
    expect(revision.details).toBe('Notiz');
    expect(revision.payload).toBe(payload);
  });

  it('der Zeitstempel ist eine endliche Zahl in der Vergangenheit oder Gegenwart', () => {
    const revision = createRevision('insert' as never, 'p0');
    expect(Number.isFinite(revision.timestamp)).toBe(true);
    expect(revision.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('kein Konfliktgrund bei der Erzeugung', () => {
    expect(createRevision('insert' as never, 'p0').conflictReason).toBeUndefined();
  });
});

describe('createTextRevision — der Typ nach Laenge', () => {
  it('laengerer Text ergibt insert', () => {
    expect(createTextRevision('p0', 'abc', 'abcdef').type).toBe('insert');
  });

  it('kuerzerer Text ergibt delete', () => {
    expect(createTextRevision('p0', 'abcdef', 'abc').type).toBe('delete');
  });

  it('HAUPTZUSICHERUNG: GLEICHE Laenge gilt als insert — die Regel folgt der Laenge, nicht dem Inhalt', () => {
    // Aus dem Namen der Funktion waere das nicht ableitbar. `>=` entscheidet, nicht ein Vergleich des Inhalts.
    expect(createTextRevision('p0', 'abc', 'xyz').type).toBe('insert');
    expect(createTextRevision('p0', '', '').type).toBe('insert');
  });

  it('der Payload traegt beide Texte', () => {
    const revision = createTextRevision('p0', 'vorher', 'nachher');
    expect(revision.payload).toEqual({ kind: 'text', beforeText: 'vorher', afterText: 'nachher' });
  });

  it('originalText und newText werden mitgegeben', () => {
    const revision = createTextRevision('p0', 'vorher', 'nachher');
    expect(revision.originalText).toBe('vorher');
    expect(revision.newText).toBe('nachher');
  });

  it('der Standardautor ist You, ein anderer wird uebernommen', () => {
    expect(createTextRevision('p0', 'a', 'b').author).toBe('You');
    expect(createTextRevision('p0', 'a', 'b', 'Bob').author).toBe('Bob');
  });
});

describe('createParagraphTextRevision — dieselbe ID und tiefe Kopien', () => {
  it('HAUPTZUSICHERUNG: unterschiedliche Absatz-IDs werfen', () => {
    // Eine Textrevision braucht denselben Absatz fuer Vorher und Nachher.
    expect(() => createParagraphTextRevision(paragraph('p0', 'a'), paragraph('p1', 'b'))).toThrow();
    expect(() => createParagraphTextRevision(paragraph('p0', 'a'), paragraph('p0', 'b'))).not.toThrow();
  });

  it('der Text wird aus den Spans gebildet, nicht aus einem Feld', () => {
    const p = { id: 'p0', spans: [{ text: 'zwei' }, { text: ' Teile' }], style: {} } as unknown as Paragraph;
    expect(paragraphText(p)).toBe('zwei Teile');
    const revision = createParagraphTextRevision(p, paragraph('p0', 'neu'));
    expect(revision.originalText).toBe('zwei Teile');
  });

  it('HAUPTZUSICHERUNG: der Payload traegt TIEFE KOPIEN — eine spaetere Aenderung erreicht ihn nicht', () => {
    // Ohne structuredClone wuerde eine spaetere Bearbeitung des Quellabsatzes die Revision mitveraendern -
    // und die Aenderungsverfolgung waere wertlos.
    const vorher = paragraph('p0', 'Original');
    const nachher = paragraph('p0', 'geaendert');
    const revision = createParagraphTextRevision(vorher, nachher);
    const payload = revision.payload as unknown as { beforeParagraph: Paragraph };

    // Den Quellabsatz nachtraeglich veraendern.
    (vorher.spans[0] as { text: string }).text = 'NACHTRAEGLICH VERAENDERT';

    expect(payload.beforeParagraph.spans[0]?.text).toBe('Original');
    expect(payload.beforeParagraph).not.toBe(vorher);
  });

  it('auch der nachher-Absatz ist eine Kopie', () => {
    const nachher = paragraph('p0', 'geaendert');
    const revision = createParagraphTextRevision(paragraph('p0', 'a'), nachher);
    const payload = revision.payload as unknown as { afterParagraph: Paragraph };
    (nachher.spans[0] as { text: string }).text = 'VERAENDERT';
    expect(payload.afterParagraph.spans[0]?.text).toBe('geaendert');
  });

  it('der Typ folgt der Laenge des Textes', () => {
    expect(createParagraphTextRevision(paragraph('p0', 'kurz'), paragraph('p0', 'viel laenger')).type).toBe('insert');
    expect(createParagraphTextRevision(paragraph('p0', 'viel laenger'), paragraph('p0', 'kurz')).type).toBe('delete');
  });

  it('die Absatz-ID der Revision ist die des Nachher-Absatzes', () => {
    expect(createParagraphTextRevision(paragraph('p0', 'a'), paragraph('p0', 'b')).paragraphId).toBe('p0');
  });
});
