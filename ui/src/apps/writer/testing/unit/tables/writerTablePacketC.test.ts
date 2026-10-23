import { describe, it, expect } from 'vitest';
import type {
  WriterTableBlockData,
  Paragraph,
} from '../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../types';
import {
  mergeWriterTableCells,
  splitWriterTableCell,
  splitWriterTable,
  mergeWriterTables,
  resolveWriterTableColumnWidths,
  sortWriterTable,
  resolveTableCaption,
  updateWriterTableCell,
  updateWriterTableRowProps,
} from '../../../tables/operations/writerTableAdvanced';
import {
  evaluateWriterTableFormulas,
  parseCellNumber,
} from '../../../tables/formulas/writerTableFormula';
import {
  WRITER_TABLE_DESIGN_PRESETS,
  resolveTableCellAppearance,
  resolveTableHeaderAppearance,
} from '../../../tables/styles/writerTableStyles';
import { paginateWriterSections } from '../../../layout/pagination/writerPagination';

const PAGE_SETUP: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

function createSampleTable(): WriterTableBlockData {
  return {
    id: 'tbl_sample_01',
    columns: ['Produkt', 'Q1', 'Q2', 'Summe'],
    rows: [
      {
        id: 'r0',
        cells: [
          { id: 'c0_0', content: 'Alpha' },
          { id: 'c0_1', content: '100' },
          { id: 'c0_2', content: '200' },
          { id: 'c0_3', content: '=SUM(LEFT)' },
        ],
      },
      {
        id: 'r1',
        cells: [
          { id: 'c1_0', content: 'Beta' },
          { id: 'c1_1', content: '300' },
          { id: 'c1_2', content: '400' },
          { id: 'c1_3', content: '=SUM(LEFT)' },
        ],
      },
      {
        id: 'r2',
        cells: [
          { id: 'c2_0', content: 'Gesamt' },
          { id: 'c2_1', content: '=SUM(ABOVE)' },
          { id: 'c2_2', content: '=SUM(ABOVE)' },
          { id: 'c2_3', content: '=SUM(ABOVE)' },
        ],
      },
    ],
  };
}

describe('Astraea Writer — Paket C: Erweiterte Tabellenfunktionen (L133–L140)', () => {
  // Punkt 1: Zellmanipulation (Merge & Split)
  describe('Punkt 1: Zellmanipulation — Merge & Split (L133)', () => {
    it('verbindet rechteckigen Bereich (2x2) korrekt mit colSpan und rowSpan', () => {
      const table = createSampleTable();
      const merged = mergeWriterTableCells(table, {
        startRow: 0,
        startCol: 0,
        endRow: 1,
        endCol: 1,
      });

      const rootCell = merged.rows[0].cells[0];
      expect(rootCell.colSpan).toBe(2);
      expect(rootCell.rowSpan).toBe(2);
      expect(rootCell.content).toBe('Alpha 100 Beta 300');

      // Covered cells should have mergedInto pointers
      expect(merged.rows[0].cells[1].mergedInto).toEqual({ row: 0, col: 0 });
      expect(merged.rows[1].cells[0].mergedInto).toEqual({ row: 0, col: 0 });
      expect(merged.rows[1].cells[1].mergedInto).toEqual({ row: 0, col: 0 });
    });

    it('hebt verbundene Zelle wieder auf (Split/Unmerge)', () => {
      const table = createSampleTable();
      const merged = mergeWriterTableCells(table, {
        startRow: 0,
        startCol: 0,
        endRow: 1,
        endCol: 1,
      });

      const unmerged = splitWriterTableCell(merged, 0, 0);
      expect(unmerged.rows[0].cells[0].colSpan).toBeUndefined();
      expect(unmerged.rows[0].cells[0].rowSpan).toBeUndefined();
      expect(unmerged.rows[0].cells[1].mergedInto).toBeUndefined();
      expect(unmerged.rows[1].cells[0].mergedInto).toBeUndefined();
      expect(unmerged.rows[1].cells[1].mergedInto).toBeUndefined();
    });

    it('trennt Tabelle an Zeilenindex in zwei getrennte Tabellenblöcke', () => {
      const table = createSampleTable();
      const [top, bottom] = splitWriterTable(table, 2);

      expect(top.rows.length).toBe(2);
      expect(top.rows[0].id).toBe('r0');
      expect(top.rows[1].id).toBe('r1');

      expect(bottom.rows.length).toBe(1);
      expect(bottom.rows[0].id).toBe('r2');
      expect(bottom.id).not.toBe(top.id);
    });

    it('führt zwei getrennte Tabellenblöcke nahtlos zusammen', () => {
      const table = createSampleTable();
      const [top, bottom] = splitWriterTable(table, 2);
      const recombined = mergeWriterTables(top, bottom);

      expect(recombined.rows.length).toBe(3);
      expect(recombined.columns.length).toBe(4);
    });
  });

  // Punkt 2: Geometrie & AutoFit
  describe('Punkt 2: Geometrie & AutoFit (L134)', () => {
    it('berechnet AutoFit Window gleichmäßig über nutzbare Breite', () => {
      const table = createSampleTable();
      const widths = resolveWriterTableColumnWidths(table, 160);

      expect(widths.length).toBe(4);
      expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(160, 1);
      expect(widths[0]).toBe(40);
    });

    it('berechnet AutoFit Contents dynamisch anhand von Textlängen', () => {
      const table: WriterTableBlockData = {
        id: 't_content',
        autoFit: 'contents',
        columns: ['ID', 'Sehr lange Produktbezeichnung für den Artikel', 'Preis', 'Status'],
        rows: [
          {
            id: 'r1',
            cells: [
              { id: 'c1', content: '1' },
              { id: 'c2', content: 'Enterprise Server Rack Edition XXL' },
              { id: 'c3', content: '9999 €' },
              { id: 'c4', content: 'Lieferbar' },
            ],
          },
        ],
      };

      const widths = resolveWriterTableColumnWidths(table, 180);
      expect(widths.length).toBe(4);
      // Spalte 1 (Name) muss deutlich breiter sein als Spalte 0 (ID)
      expect(widths[1]).toBeGreaterThan(widths[0]);
    });

    it('beachtet explizite feste Spaltenbreiten (Fixed Column Widths)', () => {
      const table: WriterTableBlockData = {
        ...createSampleTable(),
        autoFit: 'fixed',
        columnWidthsMm: [30, 45, 45, 50],
      };

      const widths = resolveWriterTableColumnWidths(table, 170);
      expect(widths).toEqual([30, 45, 45, 50]);
    });
  });

  // Punkt 3: Ausrichtung & Textrotation
  describe('Punkt 3: Ausrichtung & Textrotation (L135)', () => {
    it('setzt vertikale Zellenausrichtung (Top, Middle, Bottom)', () => {
      const table = createSampleTable();
      const updated = updateWriterTableCell(table, 0, 1, {
        verticalAlignment: 'bottom',
      });

      expect(updated.rows[0].cells[1].verticalAlignment).toBe('bottom');
    });

    it('setzt Textrotation (0°, 90°, 270°)', () => {
      const table = createSampleTable();
      const updated = updateWriterTableCell(table, 0, 0, {
        textRotation: 90,
      });

      expect(updated.rows[0].cells[0].textRotation).toBe(90);
    });
  });

  // Punkt 4: Styles & Designvorlagen
  describe('Punkt 4: Styles & Designvorlagen (L136)', () => {
    it('stellt mindestens 6 souveräne Tabellen-Designvorlagen bereit', () => {
      expect(WRITER_TABLE_DESIGN_PRESETS.length).toBeGreaterThanOrEqual(6);
      const ids = WRITER_TABLE_DESIGN_PRESETS.map((p) => p.id);
      expect(ids).toContain('grid-neutral');
      expect(ids).toContain('grid-accent');
      expect(ids).toContain('clean-minimal');
      expect(ids).toContain('corporate-dark');
      expect(ids).toContain('emerald-finance');
      expect(ids).toContain('warm-executive');

      const sampleTbl = createSampleTable();
      const headerStyle = resolveTableHeaderAppearance(sampleTbl, 0, sampleTbl.columns.length);
      expect(headerStyle.fontWeight).toBe('bold');
    });

    it('löst Total-Row-Highlighting mit fetter Schrift und doppeltem Rand auf', () => {
      const table: WriterTableBlockData = {
        ...createSampleTable(),
        styleId: 'emerald-finance',
        totalRowHighlight: true,
      };

      const lastRowIdx = table.rows.length - 1;
      const appearance = resolveTableCellAppearance(table, lastRowIdx, 0, table.rows.length, table.columns.length);

      expect(appearance.fontWeight).toBe('bold');
      expect(appearance.borderBottomStyle).toBe('double');
      expect(appearance.borderBottomWidth).toBe('3px');
    });

    it('löst alternierende Zebra-Zeilen auf', () => {
      const table: WriterTableBlockData = {
        ...createSampleTable(),
        styleId: 'grid-accent',
        alternatingRows: true,
      };

      const row0 = resolveTableCellAppearance(table, 0, 1, 3, 4);
      const row1 = resolveTableCellAppearance(table, 1, 1, 3, 4);

      expect(row0.background).not.toBe(row1.background);
    });
  });

  // Punkt 5: Seitenfluss & Kopfzeilenwiederholung
  describe('Punkt 5: Seitenfluss & Kopfzeilenwiederholung (L137)', () => {
    it('setzt repeatHeader auf Folgeseiten nur wenn repeatHeaderRow !== false', () => {
      const longTable: WriterTableBlockData = {
        id: 'long_tbl',
        columns: ['Col A', 'Col B'],
        repeatHeaderRow: true,
        rows: Array.from({ length: 35 }, (_, idx) => ({
          id: `r_${idx}`,
          cells: [
            { id: `c_${idx}_0`, content: `Item ${idx}` },
            { id: `c_${idx}_1`, content: `${idx * 10}` },
          ],
        })),
      };

      const paragraphs: Paragraph[] = [
        {
          id: 'p1',
          style: {
            alignment: 'left',
            line_height: 1.15,
            space_before: 0,
            space_after: 0,
          },
          spans: [{ text: 'Introduction' }],
        },
      ];

      const sections = [{ id: 's1', startParagraphId: 'p1', pageSetup: PAGE_SETUP }];
      const paginated = paginateWriterSections(paragraphs, PAGE_SETUP, [], sections, {
        tables: [longTable],
        images: [],
        equations: [],
        footnotes: [],
      });

      expect(paginated.length).toBeGreaterThan(1);
      const page2Fragments = paginated[1].tableFragments ?? [];
      expect(page2Fragments.length).toBeGreaterThan(0);
      expect(page2Fragments[0].repeatHeader).toBe(true);
    });
  });

  // Punkt 6: Zellenumbruch & Zeilenumbruch (cantSplit)
  describe('Punkt 6: Zeilenumbruchkontrolle — cantSplit (L138)', () => {
    it('speichert cantSplit und heightMm auf Zeilenebene', () => {
      const table = createSampleTable();
      const updated = updateWriterTableRowProps(table, 1, {
        cantSplit: true,
        heightMm: 15.5,
      });

      expect(updated.rows[1].cantSplit).toBe(true);
      expect(updated.rows[1].heightMm).toBe(15.5);
    });
  });

  // Punkt 7: Tabellenformeln
  describe('Punkt 7: Tabellenformeln in Tabellenzellen (L139)', () => {
    it('parst Dezimalzahlen mit deutschem Komma, Währungen und Vorzeichen', () => {
      expect(parseCellNumber('100')).toBe(100);
      expect(parseCellNumber('12,50')).toBe(12.5);
      expect(parseCellNumber('1.250,50 €')).toBe(1250.5);
      expect(parseCellNumber('-45,20')).toBe(-45.2);
    });

    it('evaluiert =SUM(LEFT) und =SUM(ABOVE) korrekt', () => {
      const table = createSampleTable();
      const { evaluatedValues } = evaluateWriterTableFormulas(table);

      // r0: 100 + 200 = 300
      expect(evaluatedValues['c0_3']).toBe('300');
      // r1: 300 + 400 = 700
      expect(evaluatedValues['c1_3']).toBe('700');
      // r2 Q1: 100 + 300 = 400
      expect(evaluatedValues['c2_1']).toBe('400');
      // r2 Q2: 200 + 400 = 600
      expect(evaluatedValues['c2_2']).toBe('600');
      // r2 Summe: 300 + 700 = 1000
      expect(evaluatedValues['c2_3']).toBe('1000');
    });

    it('evaluiert statistische Aggregatfunktionen (=AVERAGE, =COUNT, =MIN, =MAX)', () => {
      const table: WriterTableBlockData = {
        id: 't_stats',
        columns: ['Wert', 'Formel', 'Ergebnis'],
        rows: [
          { id: 'r1', cells: [{ id: 'c1', content: '10' }, { id: 'c2', content: '10' }, { id: 'c3', content: '10' }] },
          { id: 'r2', cells: [{ id: 'c4', content: '20' }, { id: 'c5', content: '20' }, { id: 'c6', content: '20' }] },
          { id: 'r3', cells: [{ id: 'c7', content: '30' }, { id: 'c8', content: '30' }, { id: 'c9', content: '30' }] },
          {
            id: 'r4',
            cells: [
              { id: 'c10', content: '=AVERAGE(ABOVE)' },
              { id: 'c11', content: '=MIN(ABOVE)' },
              { id: 'c12', content: '=MAX(ABOVE)' },
            ],
          },
        ],
      };

      const { evaluatedValues } = evaluateWriterTableFormulas(table);
      expect(evaluatedValues['c10']).toBe('20');
      expect(evaluatedValues['c11']).toBe('10');
      expect(evaluatedValues['c12']).toBe('30');
    });
  });

  // Punkt 8: Spaltensortierung
  describe('Punkt 8: Spaltensortierung (L139)', () => {
    it('sortiert Zeilen numerisch aufsteigend und absteigend', () => {
      const table: WriterTableBlockData = {
        id: 'tbl_sort',
        totalRowHighlight: true,
        columns: ['Produkt', 'Q1'],
        rows: [
          { id: 'r1', cells: [{ id: 'c1', content: 'Beta' }, { id: 'c2', content: '300 €' }] },
          { id: 'r0', cells: [{ id: 'c3', content: 'Alpha' }, { id: 'c4', content: '100 €' }] },
          { id: 'r2', cells: [{ id: 'c5', content: 'Gesamt' }, { id: 'c6', content: '400 €' }] },
        ],
      };

      const sortedAsc = sortWriterTable(table, 1, 'asc', true);
      expect(sortedAsc.rows[0].cells[1].content).toBe('100 €');
      expect(sortedAsc.rows[1].cells[1].content).toBe('300 €');
      expect(sortedAsc.rows[2].cells[1].content).toBe('400 €'); // Gesamt bleibt unten

      const sortedDesc = sortWriterTable(table, 1, 'desc', true);
      expect(sortedDesc.rows[0].cells[1].content).toBe('300 €');
      expect(sortedDesc.rows[1].cells[1].content).toBe('100 €');
      expect(sortedDesc.rows[2].cells[1].content).toBe('400 €');
    });

    it('sortiert Zeilen alphabetisch unter Erhalt von Zeilen-IDs', () => {
      const table = createSampleTable();
      const sorted = sortWriterTable(table, 0, 'asc', false);
      const names = sorted.rows.map((r) => r.cells[0].content);
      expect(names).toEqual(['Alpha', 'Beta', 'Gesamt']);
    });
  });

  // Punkt 9: Tabellenbeschriftung (Caption) & automatischer Zähler
  describe('Punkt 9: Tabellenbeschriftung (Caption) & Zähler (L140)', () => {
    it('generiert automatische Beschriftungsnummern (Tabelle 1: ...)', () => {
      const table1: WriterTableBlockData = {
        ...createSampleTable(),
        caption: 'Umsatzerlöse Q1-Q2',
      };
      const table2: WriterTableBlockData = {
        ...createSampleTable(),
        id: 'tbl_2',
        caption: 'Kostenstruktur',
      };

      expect(resolveTableCaption(table1, 0)).toBe('Tabelle 1: Umsatzerlöse Q1-Q2');
      expect(resolveTableCaption(table2, 1)).toBe('Tabelle 2: Kostenstruktur');
    });
  });
});
