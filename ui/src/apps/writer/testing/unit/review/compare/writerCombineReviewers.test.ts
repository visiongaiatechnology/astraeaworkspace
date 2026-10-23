/**
 * P33 / AST-0161 — das Zusammenfuehren mehrerer Autoren: `combineReviewerDocuments`.
 *
 * ## Warum dieses Modul ein P0-Kandidat ist
 *
 * Es fasst die Aenderungen **mehrerer Autoren** an **demselben Dokument** zusammen. Ein Fehler hier ist
 * **Datenverlust**: die Arbeit eines Autors verschwindet, ohne dass jemand es merkt.
 *
 * ## Der Vertrag, aus dem Quelltext gelesen
 *
 * ```ts
 * const kinds = new Set(paragraphChanges.map((c) => c.kind));
 * const serializedTargets = new Set(changes.filter(c => c.paragraph).map(c => JSON.stringify(c.paragraph)));
 *
 * if (kinds.size > 1) { conflicts.push({... reason: kinds.has('delete') ? 'delete-vs-edit' : 'concurrent-edit'}); continue; }
 * if (serializedTargets.size > 1) { conflicts.push({... reason: first.kind === 'insert' ? 'concurrent-insert' : 'concurrent-edit'}); continue; }
 * ```
 *
 * **Drei Zusicherungen geben den Ausschlag:**
 *
 * 1. **`continue` nach einem Konflikt.** Der Absatz wird **nicht** zusammengefuehrt — er behaelt die
 *    **Basisfassung**. Das ist fail-closed: **kein Teilstand, keine willkuerliche Gewinnerwahl.**
 * 2. **`delete-vs-edit` ist ein eigener Grund.** Wuerde die Loeschung gewinnen, waere die Bearbeitung des
 *    anderen Autors verloren — genau der Datenverlust, den diese Funktion verhindern soll.
 * 3. **Zwei Autoren mit DERSELBEN Aenderung sind KEIN Konflikt.** `kinds.size === 1` und
 *    `serializedTargets.size === 1` — die Uebereinstimmung wird erkannt, nicht als Streit gedeutet.
 *
 * **Und Verschiebungen werden von der Konfliktpruefung ausgenommen** (`if (change.kind === 'move') continue;`)
 * — sie betreffen die Reihenfolge, nicht den Inhalt eines Absatzes.
 */

import { describe, expect, it } from 'vitest';
import { combineReviewerDocuments } from '../../../../review/compare/writerDocumentCompare';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';

const paragraph = (id: string, text: string): Paragraph =>
  ({ id, spans: [{ text }], style: { style_name: 'normal' } } as unknown as Paragraph);

const unwrap = (result: unknown) => result as {
  mergedParagraphs: Paragraph[];
  generatedRevisions: Array<{ paragraphId: string }>;
  conflicts: Array<{ paragraphId: string; reviewers: string[]; reason: string }>;
  stats: Record<string, number>;
};

const textOf = (list: readonly Paragraph[], id: string) =>
  list.find((p) => p.id === id)?.spans[0]?.text;

const BASE = [paragraph('p0', 'Basis A'), paragraph('p1', 'Basis B')];

describe('combineReviewerDocuments — ohne Konflikt', () => {
  it('ein einzelner Autor mit einer Aenderung wird uebernommen', () => {
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'von Alice geaendert'), paragraph('p1', 'Basis B')] },
    ]));
    expect(result.conflicts).toHaveLength(0);
    expect(textOf(result.mergedParagraphs, 'p0')).toBe('von Alice geaendert');
  });

  it('zwei Autoren an VERSCHIEDENEN Absaetzen werden beide uebernommen', () => {
    // Der Normalfall der Zusammenarbeit: kein Streit, beide Aenderungen bleiben.
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A von Alice'), paragraph('p1', 'Basis B')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p0', 'Basis A'), paragraph('p1', 'B von Bob')] },
    ]));
    expect(result.conflicts).toHaveLength(0);
    expect(textOf(result.mergedParagraphs, 'p0')).toBe('A von Alice');
    expect(textOf(result.mergedParagraphs, 'p1')).toBe('B von Bob');
  });

  it('HAUPTZUSICHERUNG: zwei Autoren mit DERSELBEN Aenderung sind KEIN Konflikt', () => {
    // Uebereinstimmung ist kein Streit. Die Funktion erkennt sie an kinds.size === 1 und
    // serializedTargets.size === 1.
    const gleich = [paragraph('p0', 'dieselbe Aenderung'), paragraph('p1', 'Basis B')];
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: gleich },
      { reviewer: 'Bob', paragraphs: gleich },
    ]));
    expect(result.conflicts).toHaveLength(0);
    expect(textOf(result.mergedParagraphs, 'p0')).toBe('dieselbe Aenderung');
  });

  it('ohne Autoren bleibt die Basisfassung', () => {
    const result = unwrap(combineReviewerDocuments(BASE, []));
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedParagraphs).toHaveLength(2);
    expect(textOf(result.mergedParagraphs, 'p0')).toBe('Basis A');
  });

  it('unveraenderte Dokumente erzeugen keine Konflikte', () => {
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: BASE },
      { reviewer: 'Bob', paragraphs: BASE },
    ]));
    expect(result.conflicts).toHaveLength(0);
  });
});

describe('combineReviewerDocuments — die Konflikte (Datenverlust-Schutz)', () => {
  it('HAUPTZUSICHERUNG: zwei verschiedene Aenderungen am SELBEN Absatz sind ein Konflikt', () => {
    // Ohne diese Erkennung gewaenne stillschweigend einer, und die Arbeit des anderen waere weg.
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A von Alice'), paragraph('p1', 'Basis B')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p0', 'B von Bob'), paragraph('p1', 'Basis B')] },
    ]));
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.paragraphId).toBe('p0');
    expect(result.conflicts[0]?.reason).toBe('concurrent-edit');
    expect(result.conflicts[0]?.reviewers.sort()).toEqual(['Alice', 'Bob']);
  });

  it('HAUPTZUSICHERUNG: eine Loeschung gegen eine Bearbeitung ist delete-vs-edit', () => {
    // Wuerde die Loeschung gewinnen, waere die Bearbeitung verloren - genau der Datenverlust, den diese
    // Funktion verhindern soll.
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A von Alice'), paragraph('p1', 'Basis B')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p1', 'Basis B')] }, // p0 geloescht
    ]));
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.paragraphId).toBe('p0');
    expect(result.conflicts[0]?.reason).toBe('delete-vs-edit');
  });

  it('HAUPTZUSICHERUNG: bei einem Konflikt behaelt der Absatz die BASISFASSUNG', () => {
    // Fail-closed: kein Teilstand, keine willkuerliche Gewinnerwahl. Das `continue` im Quelltext ist der
    // ganze Punkt.
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A von Alice'), paragraph('p1', 'Basis B')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p0', 'B von Bob'), paragraph('p1', 'Basis B')] },
    ]));
    expect(textOf(result.mergedParagraphs, 'p0')).toBe('Basis A'); // NICHT 'A von Alice' und NICHT 'B von Bob'
    expect(result.mergedParagraphs).toHaveLength(2);
  });

  it('ein Konflikt erzeugt KEINE Revision fuer den strittigen Absatz', () => {
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A'), paragraph('p1', 'Basis B')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p0', 'B'), paragraph('p1', 'Basis B')] },
    ]));
    expect(result.generatedRevisions.filter((r) => r.paragraphId === 'p0')).toHaveLength(0);
  });

  it('der Konflikt nennt ALLE Beteiligten, nicht nur zwei', () => {
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A'), paragraph('p1', 'Basis B')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p0', 'B'), paragraph('p1', 'Basis B')] },
      { reviewer: 'Carla', paragraphs: [paragraph('p0', 'C'), paragraph('p1', 'Basis B')] },
    ]));
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.reviewers.sort()).toEqual(['Alice', 'Bob', 'Carla']);
  });

  it('HAUPTZUSICHERUNG: ein Konflikt an einem Absatz blockiert die ANDEREN nicht', () => {
    // Sonst waere ein einziger Streit ein Stillstand des ganzen Zusammenfuehrens.
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A'), paragraph('p1', 'B von Alice')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p0', 'B'), paragraph('p1', 'Basis B')] },
    ]));
    expect(result.conflicts).toHaveLength(1);
    // p1 ist unveraendert von Bob, also wird Alices Aenderung uebernommen.
    expect(textOf(result.mergedParagraphs, 'p1')).toBe('B von Alice');
  });

  it('zwei Konflikte an zwei Absaetzen werden beide gemeldet', () => {
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A0'), paragraph('p1', 'A1')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p0', 'B0'), paragraph('p1', 'B1')] },
    ]));
    expect(result.conflicts).toHaveLength(2);
    expect(result.conflicts.map((c) => c.paragraphId).sort()).toEqual(['p0', 'p1']);
  });
});

describe('combineReviewerDocuments — Loeschung, Einfuegung und die Basisfassung', () => {
  it('eine einvernehmliche Loeschung wird ausgefuehrt', () => {
    const ohneP0 = [paragraph('p1', 'Basis B')];
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: ohneP0 },
      { reviewer: 'Bob', paragraphs: ohneP0 },
    ]));
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedParagraphs.map((p) => p.id)).toEqual(['p1']);
  });

  it('eine einvernehmliche Einfuegung wird ausgefuehrt', () => {
    const mitP2 = [...BASE, paragraph('p2', 'neu')];
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: mitP2 },
      { reviewer: 'Bob', paragraphs: mitP2 },
    ]));
    expect(result.conflicts).toHaveLength(0);
    expect(textOf(result.mergedParagraphs, 'p2')).toBe('neu');
  });

  it('HAUPTZUSICHERUNG: zwei verschiedene Einfuegungen mit derselben Kennung sind concurrent-insert', () => {
    const result = unwrap(combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [...BASE, paragraph('p2', 'von Alice')] },
      { reviewer: 'Bob', paragraphs: [...BASE, paragraph('p2', 'von Bob')] },
    ]));
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.paragraphId).toBe('p2');
    expect(result.conflicts[0]?.reason).toBe('concurrent-insert');
  });

  it('HAUPTZUSICHERUNG: die Basisfassung wird nicht veraendert', () => {
    const vorher = JSON.stringify(BASE);
    combineReviewerDocuments(BASE, [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A'), paragraph('p1', 'Basis B')] },
    ]);
    expect(JSON.stringify(BASE)).toBe(vorher);
  });

  it('die zusammengefuehrte Fassung enthaelt Kopien, nicht die Eingabeobjekte', () => {
    const vonAlice = [paragraph('p0', 'A'), paragraph('p1', 'Basis B')];
    const result = unwrap(combineReviewerDocuments(BASE, [{ reviewer: 'Alice', paragraphs: vonAlice }]));
    expect(result.mergedParagraphs[0]).not.toBe(vonAlice[0]);
  });

  it('ist deterministisch', () => {
    const eingabe = [
      { reviewer: 'Alice', paragraphs: [paragraph('p0', 'A'), paragraph('p1', 'Basis B')] },
      { reviewer: 'Bob', paragraphs: [paragraph('p0', 'B'), paragraph('p1', 'Basis B')] },
    ];
    expect(unwrap(combineReviewerDocuments(BASE, eingabe)).conflicts.map((c) => c.reason))
      .toEqual(unwrap(combineReviewerDocuments(BASE, eingabe)).conflicts.map((c) => c.reason));
  });
});
