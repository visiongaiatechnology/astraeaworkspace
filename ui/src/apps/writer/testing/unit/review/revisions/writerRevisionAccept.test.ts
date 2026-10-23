/**
 * P33 / AST-0161 — die Annahme-Seite der Aenderungsverfolgung.
 *
 * ## Warum diese Seite
 *
 * `revertWriterRevision` ist bereits geprueft (Runde 247). Dies sind die Gegenstuecke: **Annehmen statt
 * Ablehnen.** Damit ist die Lebensdauer einer Revision von beiden Seiten belegt.
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * ### `acceptRevision(revisionId, revisions)`
 *
 * ```ts
 * ? { ...revision, status: 'accepted', conflictReason: undefined }
 * ```
 *
 * **Nur eine OFFENE Revision kann angenommen werden.** Der Quelltext begruendet es selbst:
 * *"Accepting a rejected one would claim a change was kept while the document already has it reverted — the
 * document and the register would contradict each other. **The guard keeps that property at the source, where
 * a future caller cannot miss it.**"*
 *
 * **Und `conflictReason` wird geloescht** — ein angenommener Konflikt ist kein Konflikt mehr.
 *
 * ### `sortWriterRevisionsNewestFirst(revisions)`
 *
 * ```ts
 * .sort((l, r) => (r.timestamp - l.timestamp) || (r.index - l.index))
 * ```
 *
 * Neueste zuerst, **und bei gleichem Zeitstempel die im Eingang SPAETERE zuerst.** Der zweite Teil ist der
 * interessante: ohne ihn waere die Reihenfolge bei gleichen Zeitstempeln von der Sortierimplementierung
 * abhaengig — und damit nicht reproduzierbar.
 *
 * ### `WRITER_MAX_TRACKED_REVISIONS` = 2000
 *
 * Der Kommentar nennt den behobenen Defekt: *"The register grew without bound: accepted and rejected
 * revisions stayed forever, so a long review process kept every intermediate state of every edit in the
 * file."*
 */

import { describe, expect, it } from 'vitest';
import {
  WRITER_MAX_TRACKED_REVISIONS,
  acceptAllRevisions,
  acceptRevision,
  sortWriterRevisionsNewestFirst,
} from '../../../../review/revisions/track-changes/writerTrackChangesEngine';

const revision = (id: string, status: string, timestamp = 0, conflictReason?: string) =>
  ({ id, status, timestamp, paragraphId: 'p0', type: 'text', conflictReason } as never);

const statusOf = (list: readonly unknown[], id: string) =>
  (list as Array<{ id: string; status: string }>).find((r) => r.id === id)?.status;

describe('acceptRevision — nur offene Revisionen', () => {
  it('HAUPTZUSICHERUNG: eine offene Revision wird angenommen', () => {
    const result = acceptRevision('r1', [revision('r1', 'pending')]);
    expect(statusOf(result, 'r1')).toBe('accepted');
  });

  it('HAUPTZUSICHERUNG: eine bereits abgelehnte Revision wird NICHT angenommen', () => {
    // Sonst behauptete das Register, eine Aenderung sei behalten worden, waehrend das Dokument sie
    // bereits zurueckgenommen hat - Dokument und Register wuerden sich widersprechen.
    const result = acceptRevision('r1', [revision('r1', 'rejected')]);
    expect(statusOf(result, 'r1')).toBe('rejected');
  });

  it('eine bereits angenommene Revision bleibt angenommen', () => {
    expect(statusOf(acceptRevision('r1', [revision('r1', 'accepted')]), 'r1')).toBe('accepted');
  });

  it('HAUPTZUSICHERUNG: der Konfliktgrund wird GELOESCHT — auf undefined, nicht auf einen Text', () => {
    const result = acceptRevision('r1', [revision('r1', 'pending', 0, 'Absatz verschoben')]) as Array<
      { id: string; conflictReason?: unknown }
    >;
    const angenommen = result.find((r) => r.id === 'r1');
    expect(angenommen?.conflictReason).toBeUndefined();
  });

  it('nur die adressierte Revision aendert sich, die anderen behalten ihre Objektidentitaet', () => {
    const original = [revision('r1', 'pending'), revision('r2', 'pending'), revision('r3', 'rejected')];
    const result = acceptRevision('r1', original);
    expect(result[1]).toBe(original[1]);
    expect(result[2]).toBe(original[2]);
    expect(result[0]).not.toBe(original[0]);
  });

  it('eine unbekannte Kennung aendert nichts', () => {
    const original = [revision('r1', 'pending')];
    const result = acceptRevision('gibt-es-nicht', original);
    expect(result[0]).toBe(original[0]);
    expect(statusOf(result, 'r1')).toBe('pending');
  });

  it('die Eingabe wird nicht veraendert', () => {
    const original = [revision('r1', 'pending')];
    const vorher = JSON.stringify(original);
    acceptRevision('r1', original);
    expect(JSON.stringify(original)).toBe(vorher);
  });

  it('eine leere Liste bleibt leer', () => {
    expect(acceptRevision('r1', [])).toEqual([]);
  });
});

describe('acceptAllRevisions — alle offenen', () => {
  it('HAUPTZUSICHERUNG: alle offenen werden angenommen, keine entschiedene wird beruehrt', () => {
    const result = acceptAllRevisions([
      revision('r1', 'pending'), revision('r2', 'pending'),
      revision('r3', 'rejected'), revision('r4', 'accepted'),
    ]);
    expect(statusOf(result, 'r1')).toBe('accepted');
    expect(statusOf(result, 'r2')).toBe('accepted');
    // Die abgelehnte bleibt abgelehnt - sie wurde zurueckgenommen, nicht behalten.
    expect(statusOf(result, 'r3')).toBe('rejected');
    expect(statusOf(result, 'r4')).toBe('accepted');
  });

  it('entschiedene Revisionen behalten ihre Objektidentitaet', () => {
    const original = [revision('r1', 'rejected'), revision('r2', 'accepted')];
    const result = acceptAllRevisions(original);
    expect(result[0]).toBe(original[0]);
    expect(result[1]).toBe(original[1]);
  });

  it('loescht jeden Konfliktgrund', () => {
    const result = acceptAllRevisions([
      revision('r1', 'pending', 0, 'a'), revision('r2', 'pending', 0, 'b'),
    ]) as Array<{ conflictReason?: unknown }>;
    for (const r of result) expect(r.conflictReason).toBeUndefined();
  });

  it('die Eingabe wird nicht veraendert', () => {
    const original = [revision('r1', 'pending')];
    const vorher = JSON.stringify(original);
    acceptAllRevisions(original);
    expect(JSON.stringify(original)).toBe(vorher);
  });

  it('eine leere Liste bleibt leer', () => {
    expect(acceptAllRevisions([])).toEqual([]);
  });
});

describe('sortWriterRevisionsNewestFirst — und der Gleichstand', () => {
  it('sortiert nach Zeitstempel, neueste zuerst', () => {
    const result = sortWriterRevisionsNewestFirst([
      revision('alt', 'pending', 100), revision('neu', 'pending', 300), revision('mitte', 'pending', 200),
    ]);
    expect(result.map((r) => (r as unknown as { id: string }).id)).toEqual(['neu', 'mitte', 'alt']);
  });

  it('HAUPTZUSICHERUNG: bei gleichem Zeitstempel gewinnt der im Eingang SPAETERE', () => {
    // Ohne diesen zweiten Vergleich waere die Reihenfolge von der Sortierimplementierung abhaengig - und
    // damit nicht reproduzierbar.
    const result = sortWriterRevisionsNewestFirst([
      revision('erst', 'pending', 100), revision('zweit', 'pending', 100), revision('dritt', 'pending', 100),
    ]);
    expect(result.map((r) => (r as unknown as { id: string }).id)).toEqual(['dritt', 'zweit', 'erst']);
  });

  it('gemischte Zeitstempel mit Gleichstand bleiben deterministisch', () => {
    const eingabe = [
      revision('a', 'pending', 200), revision('b', 'pending', 300),
      revision('c', 'pending', 200), revision('d', 'pending', 300),
    ];
    const einmal = sortWriterRevisionsNewestFirst(eingabe).map((r) => (r as unknown as { id: string }).id);
    const zweimal = sortWriterRevisionsNewestFirst(eingabe).map((r) => (r as unknown as { id: string }).id);
    expect(zweimal).toEqual(einmal);
    expect(einmal).toEqual(['d', 'b', 'c', 'a']);
  });

  it('es geht keine Revision verloren', () => {
    const eingabe = [revision('a', 'pending', 1), revision('b', 'rejected', 2)];
    expect(sortWriterRevisionsNewestFirst(eingabe)).toHaveLength(2);
  });

  it('die Eingabe wird nicht veraendert', () => {
    const original = [revision('a', 'pending', 1), revision('b', 'pending', 2)];
    const vorher = original.map((r) => (r as unknown as { id: string }).id);
    sortWriterRevisionsNewestFirst(original);
    expect(original.map((r) => (r as unknown as { id: string }).id)).toEqual(vorher);
  });

  it('eine leere Liste bleibt leer', () => {
    expect(sortWriterRevisionsNewestFirst([])).toEqual([]);
  });
});

describe('WRITER_MAX_TRACKED_REVISIONS — die Schranke, die einen behobenen Defekt traegt', () => {
  it('ist 2000', () => {
    expect(WRITER_MAX_TRACKED_REVISIONS).toBe(2_000);
  });

  it('ist eine endliche, positive ganze Zahl', () => {
    // Der Kommentar nennt den behobenen Defekt: das Register wuchs ohne Grenze, und ein langer
    // Pruefprozess behielt jeden Zwischenstand jeder Aenderung in der Datei.
    expect(Number.isSafeInteger(WRITER_MAX_TRACKED_REVISIONS)).toBe(true);
    expect(WRITER_MAX_TRACKED_REVISIONS).toBeGreaterThan(0);
  });
});
