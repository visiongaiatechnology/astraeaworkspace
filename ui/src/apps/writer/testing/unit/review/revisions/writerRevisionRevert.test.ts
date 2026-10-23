/**
 * P33 / AST-0161 — Kommentare und Aenderungsverfolgung: `revertWriterRevision`.
 *
 * ## Warum dieses Modul zaehlt
 *
 * Runde 247 hat gemessen: **`review/` hat 46 Exporte und KEINEN einzigen dedizierten Test** — darunter die
 * Aenderungsverfolgung mit 14 Exporten. Das ist die groesste Testluecke, die der Reaudit bisher gefunden hat.
 *
 * ## Der Vertrag, aus dem Quelltext gelesen
 *
 * Das Modul nennt sich selbst *"Fail-Closed Reversible Writer Revision Engine"* — und der Quelltext haelt das:
 *
 * * **Jede Verweigerung ist ein benanntes `{ ok: false, reason }`** — kein Wurf, kein stiller Erfolg.
 * * **Jede Erfolgsbahn prueft zuerst, ob der Zustand noch der erwartete ist.**
 *   Eine Revision, deren Zielabsatz inzwischen weiterbearbeitet wurde, wird **nicht** angewendet — sonst
 *   wuerde sie eine spaetere Aenderung ueberschreiben.
 * * `status !== 'pending'` wird verweigert: eine bereits entschiedene Revision ist nicht erneut ablehnbar.
 * * Ein fehlender Payload ohne `originalText` wird verweigert.
 *
 * **Der Test prueft die Verweigerungen zuerst** — denn ein fail-closed-Modul, dessen Verweigerungen nicht
 * getestet sind, ist nur ein Modul, das zufaellig nicht abstuerzt.
 */

import { describe, expect, it } from 'vitest';
import { revertWriterRevision } from '../../../../review/revisions/writerRevisionRevertEngine';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';

const paragraph = (id: string, text: string): Paragraph =>
  ({ id, spans: [{ text }], style: { style_name: 'normal' } } as unknown as Paragraph);

const state = (...texts: string[]) => ({
  paragraphs: texts.map((text, index) => paragraph(`p${index}`, text)),
  tables: [],
  pageSetup: {},
  sections: [],
  styleCatalog: {},
} as never);

const revision = (over: Record<string, unknown> = {}) =>
  ({ id: 'r1', status: 'pending', paragraphId: 'p0', type: 'text', ...over } as never);

describe('revertWriterRevision — die Verweigerungen (fail-closed)', () => {
  it('HAUPTZUSICHERUNG: jede Verweigerung ist benannt, keine wirft', () => {
    // Der ganze Punkt des Moduls: ein Fehlschlag ist ein Ergebnis, keine Ausnahme.
    const faelle = [
      revision({ status: 'accepted' }),
      revision({ status: 'rejected' }),
      revision({ payload: undefined, originalText: undefined }),
      revision({ paragraphId: 'gibt-es-nicht', payload: undefined, originalText: 'x' }),
    ];
    for (const fall of faelle) {
      let ergebnis: { ok: boolean; reason?: string } | undefined;
      expect(() => { ergebnis = revertWriterRevision(state('a'), fall) as never; }, JSON.stringify(fall)).not.toThrow();
      expect(ergebnis?.ok, JSON.stringify(fall)).toBe(false);
      expect(typeof ergebnis?.reason, JSON.stringify(fall)).toBe('string');
      expect((ergebnis?.reason ?? '').length).toBeGreaterThan(0);
    }
  });

  it('eine bereits entschiedene Revision wird nicht erneut abgelehnt', () => {
    const result = revertWriterRevision(state('a'), revision({ status: 'accepted' })) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it('HAUPTZUSICHERUNG: ein inzwischen weiterbearbeiteter Absatz wird NICHT ueberschrieben', () => {
    // Das ist die Zusicherung, die Datenverlust verhindert: die Revision erwartet afterText, der Absatz
    // traegt aber etwas anderes - also wird sie verweigert statt blind angewendet.
    const result = revertWriterRevision(
      state('der Nutzer hat weitergeschrieben'),
      revision({ payload: { kind: 'text', afterText: 'der urspruengliche Text', beforeText: 'vorher' } }),
    ) as { ok: boolean; reason?: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('ver');
  });

  it('ein eingefuegter Absatz, der verschoben oder veraendert wurde, wird verweigert', () => {
    const eingefuegt = paragraph('neu', 'Text');
    const falscherIndex = revertWriterRevision(
      state('a', 'b'),
      revision({ payload: { kind: 'paragraph-insert', index: 0, paragraph: eingefuegt } }),
    ) as { ok: boolean };
    // Bei Index 0 steht 'a', nicht der eingefuegte Absatz.
    expect(falscherIndex.ok).toBe(false);

    const fehlt = revertWriterRevision(
      state('a'),
      revision({ payload: { kind: 'paragraph-insert', index: 0, paragraph: eingefuegt } }),
    ) as { ok: boolean };
    expect(fehlt.ok).toBe(false); // der Absatz existiert gar nicht mehr
  });

  it('ein bereits wieder vorhandener geloeschter Absatz wird verweigert', () => {
    const result = revertWriterRevision(
      state('a'),
      revision({
        paragraphId: 'p0',
        payload: { kind: 'paragraph-delete', index: 0, paragraph: paragraph('p0', 'a') },
      }),
    ) as { ok: boolean };
    // 'p0' ist vorhanden - die Loeschung kann nicht rueckgaengig gemacht werden, indem sie noch einmal
    // angewendet wird.
    expect(result.ok).toBe(false);
  });

  it('eine veraenderte Absatzumgebung verhindert das Wiederherstellen', () => {
    const result = revertWriterRevision(
      state('x', 'y'),
      revision({
        paragraphId: 'geloescht',
        payload: {
          kind: 'paragraph-delete', index: 1,
          paragraph: paragraph('geloescht', 'z'),
          previousParagraphId: 'erwartet-anders',
        },
      }),
    ) as { ok: boolean; reason?: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('umgebung');
  });
});

describe('revertWriterRevision — die Erfolgsbahnen', () => {
  it('der Altweg ohne Payload stellt den Originaltext wieder her', () => {
    const result = revertWriterRevision(
      state('geaenderter Text'),
      revision({ payload: undefined, originalText: 'Original', newText: 'geaenderter Text' }),
    ) as { ok: boolean; state?: { paragraphs: Paragraph[] } };
    expect(result.ok).toBe(true);
    expect(result.state?.paragraphs[0]?.spans[0]?.text).toBe('Original');
  });

  it('eine Textrevision mit vorher/nachher stellt den ganzen Absatz wieder her', () => {
    const vorher = paragraph('p0', 'Original');
    const nachher = paragraph('p0', 'geaendert');
    const result = revertWriterRevision(
      state('geaendert'),
      revision({ payload: { kind: 'text', beforeParagraph: vorher, afterParagraph: nachher } }),
    ) as { ok: boolean; state?: { paragraphs: Paragraph[] } };
    expect(result.ok).toBe(true);
    expect(result.state?.paragraphs[0]?.spans[0]?.text).toBe('Original');
  });

  it('HAUPTZUSICHERUNG: der Erfolg veraendert den uebergebenen Zustand NICHT', () => {
    // Der Zustand ist eine Eingabe, kein Speicher. Ein Modul, das ihn seitlich aendert, waere in einem
    // Undo-Stapel nicht verwendbar.
    const original = state('geaendert');
    const vorher = JSON.stringify(original);
    const result = revertWriterRevision(
      original,
      revision({ payload: { kind: 'text', afterText: 'geaendert', beforeText: 'Original' } }),
    ) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(JSON.stringify(original)).toBe(vorher);
  });

  it('ein eingefuegter Absatz laesst sich entfernen', () => {
    const eingefuegt = paragraph('p1', 'neu');
    const original = { ...(state('a', 'neu') as object) } as never;
    // Bei Index 1 steht genau der eingefuegte Absatz.
    const result = revertWriterRevision(
      original,
      revision({ paragraphId: 'p1', payload: { kind: 'paragraph-insert', index: 1, paragraph: eingefuegt } }),
    ) as { ok: boolean; state?: { paragraphs: Paragraph[] } };
    expect(result.ok).toBe(true);
    expect(result.state?.paragraphs).toHaveLength(1);
    expect(result.state?.paragraphs.map((p) => p.id)).toEqual(['p0']);
  });

  it('ist deterministisch', () => {
    const auf = () => revertWriterRevision(
      state('geaendert'),
      revision({ payload: { kind: 'text', afterText: 'geaendert', beforeText: 'Original' } }),
    ) as { ok: boolean; state?: unknown };
    expect(JSON.stringify(auf().state)).toBe(JSON.stringify(auf().state));
  });
});
