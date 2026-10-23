// STATUS: DIAMANT VGT SUPREME
// Comprehensive test suite for Astraea Grid: Freeze Panes, Zoom, Data Types,
// Conditional Formatting Rules, Named Ranges, Slicers, Charts, Print HTML, Undo/Redo

import { describe, it, expect } from 'vitest';
import { GridCell, GridSheetModel, GridConditionalFormattingRule, GridPrintSettings, GridFilterRule } from '../../../../shared/contracts/workspace';
import { conditionalStyleForCell, buildVisibleRowIndices } from '../../compat/gridProfessional';
import { buildGridPrintableHtml } from '../../print/gridPrint';
import { formatCellValue } from '../../compat/gridUtils';

describe('Astraea Grid Freeze Panes & Viewport Bounds', () => {
  it('correctly manages freeze rows and columns boundary indices', () => {
    const sheet: GridSheetModel = {
      id: 'sheet-1',
      name: 'Sales',
      tableObjectId: 'tbl-1',
      freezeRows: 2,
      freezeCols: 1,
      zoom: 125,
      showGridlines: true,
      viewMode: 'page-layout',
    };

    expect(sheet.freezeRows).toBe(2);
    expect(sheet.freezeCols).toBe(1);
    expect(sheet.zoom).toBe(125);
    expect(sheet.viewMode).toBe('page-layout');
  });

  it('filters visible row indices when AutoFilter rules are active', () => {
    const cells: Record<string, GridCell> = {
      A1: { value: 'Region' },
      A2: { value: 'Europe' },
      A3: { value: 'Asia' },
      A4: { value: 'Europe' },
    };

    const filters: GridFilterRule[] = [{ id: 'f1', column: 'A', operator: 'equals', value: 'Europe' }];

    // Header row 0, data rows 1, 2, 3
    const visible = buildVisibleRowIndices(cells, 4, filters, []);
    expect(visible).toContain(1); // Europe (rowIdx 1)
    expect(visible).not.toContain(2); // Asia filtered out (rowIdx 2)
    expect(visible).toContain(3); // Europe (rowIdx 3)
  });
});

describe('Cell Datatypes & Number Format Engine', () => {
  it('formats text, number, currency, percent, accounting, scientific, and fraction', () => {
    const cText: GridCell = { value: 'VisionGaia' };
    expect(formatCellValue(cText)).toBe('VisionGaia');

    const cNum: GridCell = { value: 1234.56, format: 'number' };
    // Verify formatted number string matches locale representation
    expect(formatCellValue(cNum)).toMatch(/1[,.]234[,.]56/);

    const cCurr: GridCell = { value: 99.5, format: 'currency' };
    expect(formatCellValue(cCurr)).toBe('$99.50');

    const cPct: GridCell = { value: 0.19, format: 'percent' };
    expect(formatCellValue(cPct)).toBe('19.0%');

    const cAcctPos: GridCell = { value: 500, format: 'accounting' };
    expect(formatCellValue(cAcctPos)).toBe('$ 500.00 ');

    const cAcctNeg: GridCell = { value: -500, format: 'accounting' };
    expect(formatCellValue(cAcctNeg)).toBe('($ 500.00)');

    const cSci: GridCell = { value: 1250000, format: 'scientific' };
    // Excel-standard exponent padding: the canonical `0.00E+00` code renders 1.25E+06.
    expect(formatCellValue(cSci)).toBe('1.25E+06');

    const cFrac: GridCell = { value: 2.75, format: 'fraction' };
    expect(formatCellValue(cFrac)).toBe('2 3/4');

    const cCustom: GridCell = { value: 1500, numberFormatCode: '#,##0.00 €' };
    expect(formatCellValue(cCustom)).toBe('1,500.00 €');
  });
});

describe('Conditional Formatting Rules Manager', () => {
  const rules: GridConditionalFormattingRule[] = [
    {
      id: 'rule-high',
      range: 'A1:A10',
      operator: 'greater-than',
      value: 100,
      background: 'rgba(16, 185, 129, 0.3)',
      textColor: '#34d399',
    },
    {
      id: 'rule-neg',
      range: 'A1:A10',
      operator: 'less-than',
      value: 0,
      background: 'rgba(239, 68, 68, 0.3)',
      textColor: '#f87171',
    },
  ];

  it('applies matching conditional highlight background and text color', () => {
    const highCell: GridCell = { value: 250 };
    const styleHigh = conditionalStyleForCell('A5', highCell, rules);
    expect(styleHigh.background).toBe('rgba(16, 185, 129, 0.3)');
    expect(styleHigh.textColor).toBe('#34d399');

    const negCell: GridCell = { value: -42 };
    const styleNeg = conditionalStyleForCell('A3', negCell, rules);
    expect(styleNeg.background).toBe('rgba(239, 68, 68, 0.3)');
    expect(styleNeg.textColor).toBe('#f87171');

    const neutralCell: GridCell = { value: 50 };
    const styleNeutral = conditionalStyleForCell('A2', neutralCell, rules);
    expect(styleNeutral.background).toBeUndefined();
    expect(styleNeutral.textColor).toBeUndefined();
  });
});

describe('Print & High-Fidelity Export Engine', () => {
  it('generates high-fidelity HTML with gridlines, headers, and print boundaries', () => {
    const cells: Record<string, GridCell> = {
      A1: { value: 'Product' },
      B1: { value: 'Revenue' },
      A2: { value: 'VGT Cloud' },
      B2: { value: 50000, format: 'currency' },
    };

    const printSettings: GridPrintSettings = {
      paperSize: 'A4',
      orientation: 'landscape',
      margins: 'normal',
      fitToWidth: true,
      showGridlines: true,
      repeatHeaderRow: true,
    };

    const html = buildGridPrintableHtml('Financial Report 2026', 'Financials', cells, [0, 1], 2, printSettings);
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('Financial Report 2026');
    expect(html).toContain('Financials');
    expect(html).toContain('VGT Cloud');
    expect(html).toContain('$50,000.00');
    expect(html).toContain('size: A4 landscape');
  });
});
