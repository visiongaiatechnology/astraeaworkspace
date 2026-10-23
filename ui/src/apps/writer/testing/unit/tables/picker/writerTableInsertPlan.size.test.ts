// STATUS: PLATIN — Zeuge (AST-0106): der Einfüge-Handler baut heute eine **feste 3 × 1**-Tabelle.
//
// Das Literal stand zweimal im Baum (`WriterEditor.tsx:161`, `WriterEditorContextMenu.tsx:83`). Damit der
// Zeuge die feste Größe **ausführen** kann, statt sie nur zu lesen, ist sie zuvor verhaltensneutral in
// **eine** Funktion gezogen worden (`writerTableInsertPlan.ts`). Dieser Zeuge fragt diese eine Funktion
// nach einer Größe — und bekommt vor der Reparatur **nicht** die gefragte Größe zurück.
import { describe, expect, it } from 'vitest';
import { buildWriterTableBlock } from '../../../../tables/picker/writerTableInsertPlan';

describe('AST-0106 — die angeforderte Größe wird nicht gebaut', () => {
  it('baut genau so viele Zeilen wie angefordert', () => {
    const table = buildWriterTableBlock({ size: { rows: 2, cols: 5 }, anchorParagraphId: 'p-1' });
    expect(table.rows).toHaveLength(2);
  });

  it('baut genau so viele Spalten wie angefordert', () => {
    const table = buildWriterTableBlock({ size: { rows: 2, cols: 5 }, anchorParagraphId: 'p-1' });
    expect(table.columns).toHaveLength(5);
    for (const row of table.rows) {
      expect(row.cells).toHaveLength(5);
    }
  });

  it('baut die kleinste und die größte Größe des Rasters', () => {
    const smallest = buildWriterTableBlock({ size: { rows: 1, cols: 1 } });
    expect(smallest.rows).toHaveLength(1);
    expect(smallest.rows[0]?.cells).toHaveLength(1);
    const largest = buildWriterTableBlock({ size: { rows: 8, cols: 10 } });
    expect(largest.rows).toHaveLength(8);
    expect(largest.columns).toHaveLength(10);
    expect(largest.rows.every((row) => row.cells.length === 10)).toBe(true);
  });

  it('verankert die Tabelle am übergebenen Absatz', () => {
    expect(buildWriterTableBlock({ size: { rows: 1, cols: 2 }, anchorParagraphId: 'p-7' }).anchorParagraphId).toBe('p-7');
    expect(buildWriterTableBlock({ size: { rows: 1, cols: 2 } }).anchorParagraphId).toBeUndefined();
  });

  it('vergibt für jede Zelle eine eigene Kennung — keine geteilte Zelle', () => {
    const table = buildWriterTableBlock({ size: { rows: 4, cols: 6 } });
    const ids = table.rows.flatMap((row) => row.cells.map((cell) => cell.id));
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    expect(new Set([table.id, ...table.rows.map((row) => row.id)]).size).toBe(5);
  });

  it('legt keine Beispielinhalte der alten festen Tabelle mehr an', () => {
    const table = buildWriterTableBlock({ size: { rows: 3, cols: 3 } });
    const contents = table.rows.flatMap((row) => row.cells.map((cell) => cell.content));
    expect(contents).toEqual(['', '', '', '', '', '', '', '', '']);
    expect(contents).not.toContain('Eintrag A');
    expect(contents).not.toContain('100');
    expect(contents).not.toContain('Aktiv');
  });
});
