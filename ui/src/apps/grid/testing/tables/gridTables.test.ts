// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Structured Tables test suite

import { describe, it, expect } from 'vitest';
import { GridCell, GridStructuredTable } from '../../../../shared/contracts/grid/workspaceGrid';
import {
  createStructuredTable,
  toggleTableTotalsRow,
  resolveStructuredReference,
  autoExpandStructuredTablesForEdits,
} from '../../tables/gridStructuredTables';

describe('Astraea Grid — Structured Tables Engine (Ctrl+T)', () => {
  it('applies a multi-cell import as one bounded table expansion while retaining every imported value', () => {
    const table: GridStructuredTable = {
      id: 'sales', name: 'Sales', sheetId: 'sheet-1', range: 'A1:B2', hasHeaders: true, hasTotalsRow: false,
      columns: [{ name: 'Product', totalFunction: 'none' }, { name: 'Price', totalFunction: 'sum' }],
    };
    const result = autoExpandStructuredTablesForEdits([table], { A1: { value: 'Product' }, B1: { value: 'Price' } }, [
      { coord: 'A3', cell: { value: 'Widget' } },
      { coord: 'B3', cell: { value: '10' } },
    ]);

    expect(result.tables[0].range).toBe('A1:B3');
    expect(result.cells.A3.value).toBe('Widget');
    expect(result.cells.B3.value).toBe('10');
  });

  it('moves a totals row once and retains all imported data cells beneath it', () => {
    const table: GridStructuredTable = {
      id: 'sales', name: 'Sales', sheetId: 'sheet-1', range: 'A1:B3', hasHeaders: true, hasTotalsRow: true,
      columns: [{ name: 'Product', totalFunction: 'none' }, { name: 'Price', totalFunction: 'sum' }],
    };
    const result = autoExpandStructuredTablesForEdits([table], {
      A1: { value: 'Product' }, B1: { value: 'Price' }, A3: { value: 'Total', bold: true }, B3: { value: 0, formula: '=SUM(B2:B2)' },
    }, [
      { coord: 'A3', cell: { value: 'Widget' } },
      { coord: 'B3', cell: { value: '10' } },
    ]);

    expect(result.tables[0].range).toBe('A1:B4');
    expect(result.cells.A3.value).toBe('Widget');
    expect(result.cells.B3.value).toBe('10');
    expect(result.cells.A4.value).toBe('Total');
    expect(result.cells.B4.formula).toBe('=SUM(B2:B3)');
  });

  it('creates structured table with headers and columns inferred from cells', () => {
    const cells: Record<string, GridCell> = {
      A1: { value: 'Product' },
      B1: { value: 'Price' },
      C1: { value: 'Quantity' },
      A2: { value: 'Widget' },
      B2: { value: 10 },
      C2: { value: 5 },
      A3: { value: 'Gadget' },
      B3: { value: 20 },
      C3: { value: 2 },
    };

    const { table, updatedCells } = createStructuredTable(
      { range: 'A1:C3', name: 'SalesTable', hasHeaders: true, styleTheme: 'emerald' },
      cells,
      [],
      'sheet-1'
    );

    expect(table.name).toBe('SalesTable');
    expect(table.hasHeaders).toBe(true);
    expect(table.hasTotalsRow).toBe(false);
    expect(table.styleTheme).toBe('emerald');
    expect(table.columns.map((c) => c.name)).toEqual(['Product', 'Price', 'Quantity']);

    // Check bold header styling
    expect(updatedCells.A1.bold).toBe(true);
    expect(updatedCells.B1.bold).toBe(true);
    expect(updatedCells.C1.bold).toBe(true);
  });

  it('toggles totals row on and adds aggregate formulas', () => {
    const cells: Record<string, GridCell> = {
      A1: { value: 'Product' },
      B1: { value: 'Price' },
      A2: { value: 'A' },
      B2: { value: 100 },
      A3: { value: 'B' },
      B3: { value: 200 },
    };

    const { table } = createStructuredTable(
      { range: 'A1:B3', name: 'InvTable', hasHeaders: true },
      cells,
      [],
      'sheet-1'
    );

    // Toggle Totals ON
    const toggledOn = toggleTableTotalsRow(table, cells);
    expect(toggledOn.table.hasTotalsRow).toBe(true);
    expect(toggledOn.table.range).toBe('A1:B4');
    expect(toggledOn.updatedCells.A4?.value).toBe('Total');
    expect(toggledOn.updatedCells.B4?.formula).toBe('=SUM(B2:B3)');

    // Toggle Totals OFF
    const toggledOff = toggleTableTotalsRow(toggledOn.table, toggledOn.updatedCells);
    expect(toggledOff.table.hasTotalsRow).toBe(false);
    expect(toggledOff.table.range).toBe('A1:B3');
    expect(toggledOff.updatedCells.A4).toBeUndefined();
    expect(toggledOff.updatedCells.B4).toBeUndefined();
  });

  describe('resolveStructuredReference', () => {
    const table: GridStructuredTable = {
      id: 'tbl-1',
      name: 'DeptSales',
      sheetId: 'sheet-1',
      range: 'B2:D10',
      hasHeaders: true,
      hasTotalsRow: true,
      columns: [
        { name: 'Rep' },
        { name: 'Region' },
        { name: 'Revenue' },
      ],
    };
    const tables = [table];

    it('resolves Table[#All] to entire table range', () => {
      expect(resolveStructuredReference('DeptSales[#All]', tables)).toBe('B2:D10');
    });

    it('resolves Table[#Data] to data rows only (excluding headers & totals)', () => {
      // B2:D10 with headers at row 2 and totals at row 10 -> data rows 3 to 9
      expect(resolveStructuredReference('DeptSales[#Data]', tables)).toBe('B3:D9');
    });

    it('resolves Table[#Headers] to header row', () => {
      expect(resolveStructuredReference('DeptSales[#Headers]', tables)).toBe('B2:D2');
    });

    it('resolves Table[#Totals] to totals row', () => {
      expect(resolveStructuredReference('DeptSales[#Totals]', tables)).toBe('B10:D10');
    });

    it('resolves Table[ColumnName] to data column range', () => {
      // Rep is col B
      expect(resolveStructuredReference('DeptSales[Rep]', tables)).toBe('B3:B9');
      // Revenue is col D
      expect(resolveStructuredReference('DeptSales[Revenue]', tables)).toBe('D3:D9');
    });

    it('resolves Table[@ColumnName] (this row reference)', () => {
      // Current cell is at row 5
      expect(resolveStructuredReference('DeptSales[@Revenue]', tables, 'C5')).toBe('D5');
      // Current cell is at row 8
      expect(resolveStructuredReference('DeptSales[@Rep]', tables, 'B8')).toBe('B8');
    });

    it('returns null for unknown table or column', () => {
      expect(resolveStructuredReference('UnknownTable[Rep]', tables)).toBeNull();
      expect(resolveStructuredReference('DeptSales[UnknownCol]', tables)).toBeNull();
      expect(resolveStructuredReference('NotAStructuredRef', tables)).toBeNull();
    });
  });
});
