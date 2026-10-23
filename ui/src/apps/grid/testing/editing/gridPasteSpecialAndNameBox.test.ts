// STATUS: DIAMANT VGT SUPREME
// Astraea Grid Paste Special planning/preview and name box resolver tests.

import { describe, expect, it } from 'vitest';
import type { GridCell, GridNamedRange } from '../../../../shared/contracts/workspace';
import { buildGridPasteSpecialPreview, planGridPasteSpecial } from '../../editing/gridPasteSpecialPlan';
import { applyPasteSpecial } from '../../clipboard/gridPasteSpecial';
import { captureGridClipboard } from '../../editing/gridClipboard';
import { resolveGridNameBoxInput } from '../../editing/gridNameBox';

describe('Grid Paste Special engine', () => {
  it('never writes cell content for a column-widths paste', () => {
    const result = applyPasteSpecial(
      { A1: { value: 'quelle' } },
      ['A1'],
      'C1',
      { C1: { value: 'ziel' } },
      { mode: 'column-widths', operation: 'none' },
    );
    expect(result.affectedCoords).toEqual([]);
    expect(result.updatedCells.C1?.value).toBe('ziel');
  });

  it('fails closed for a paste mode outside the contract', () => {
    expect(() => applyPasteSpecial(
      { A1: { value: 'quelle' } },
      ['A1'],
      'C1',
      {},
      { mode: 'unknown-mode' as never, operation: 'none' },
    )).toThrow(/Unsupported Grid paste mode/);
  });
});

describe('Grid Paste Special planning', () => {
  const cells: Record<string, GridCell> = { A1: { formula: '=B1*2', value: 4 }, C1: { value: 'ziel' } };

  it('copies column widths without touching any cell (regression: full paste overwrote data)', () => {
    const clipboard = { ...captureGridClipboard(cells, 'A1:A2', false), columnWidths: { 0: 180, 1: 130 } };
    const plan = planGridPasteSpecial({ cells, clipboard, targetAnchor: 'C1', options: { mode: 'column-widths', operation: 'none' } });
    expect(plan.kind).toBe('apply');
    if (plan.kind !== 'apply') return;
    expect(plan.changedCoords).toEqual([]);
    expect(plan.columnWidths).toEqual({ 2: 180, 3: 130 });
    expect(plan.updatedCells.C1?.value).toBe('ziel');
  });

  it('rejects a column-width paste when no widths were captured', () => {
    const clipboard = captureGridClipboard(cells, 'A1', false);
    const plan = planGridPasteSpecial({ cells, clipboard, targetAnchor: 'C1', options: { mode: 'column-widths', operation: 'none' } });
    expect(plan.kind).toBe('rejected');
  });

  it('shifts relative formula references for formulas and all modes', () => {
    const clipboard = captureGridClipboard(cells, 'A1', false);
    for (const mode of ['formulas', 'all'] as const) {
      const plan = planGridPasteSpecial({ cells, clipboard, targetAnchor: 'C3', options: { mode, operation: 'none' } });
      expect(plan.kind).toBe('apply');
      if (plan.kind !== 'apply') continue;
      expect(plan.updatedCells.C3?.formula).toBe('=D3*2');
    }
  });

  it('reports an empty clipboard instead of failing silently', () => {
    const plan = planGridPasteSpecial({ cells, clipboard: null, targetAnchor: 'C1', options: { mode: 'all', operation: 'none' } });
    expect(plan.kind).toBe('rejected');
    if (plan.kind === 'rejected') expect(plan.reason).toContain('Zwischenablage ist leer');
  });

  it('applies arithmetic operations to numbers only', () => {
    const clipboard = captureGridClipboard({ A1: { value: 10 } }, 'A1', false);
    const plan = planGridPasteSpecial({
      cells: { B1: { value: 5 } },
      clipboard,
      targetAnchor: 'B1',
      options: { mode: 'values', operation: 'add' },
    });
    expect(plan.kind).toBe('apply');
    if (plan.kind === 'apply') expect(plan.updatedCells.B1?.value).toBe(15);
  });
});

describe('Grid Paste Special preview', () => {
  it('shows before and after of the very same plan that will be applied', () => {
    const clipboard = captureGridClipboard({ A1: { value: 'neu' } }, 'A1', false);
    const preview = buildGridPasteSpecialPreview({
      cells: { C3: { value: 'alt' } },
      clipboard,
      targetAnchor: 'C3',
      options: { mode: 'all', operation: 'none' },
    });
    expect(preview.rejectedReason).toBeNull();
    expect(preview.totalChanges).toBe(1);
    expect(preview.rows).toEqual([{ coord: 'C3', before: 'alt', after: 'neu', changed: true }]);
  });

  it('truncates the preview for large pastes instead of rendering unbounded rows', () => {
    const source: Record<string, GridCell> = {};
    for (let row = 0; row < 60; row += 1) source[`A${row + 1}`] = { value: row };
    const clipboard = captureGridClipboard(source, 'A1:A60', false);
    const preview = buildGridPasteSpecialPreview({ cells: {}, clipboard, targetAnchor: 'D1', options: { mode: 'all', operation: 'none' } });
    expect(preview.totalChanges).toBe(60);
    expect(preview.truncated).toBe(true);
    expect(preview.rows).toHaveLength(24);
  });

  it('surfaces the rejection reason and offers no rows for an empty clipboard', () => {
    const preview = buildGridPasteSpecialPreview({ cells: {}, clipboard: null, targetAnchor: 'A1', options: { mode: 'all', operation: 'none' } });
    expect(preview.rows).toHaveLength(0);
    expect(preview.rejectedReason).toContain('Zwischenablage');
  });

  it('previews column widths as a column row', () => {
    const clipboard = { ...captureGridClipboard({ A1: { value: 1 } }, 'A1:A1', false), columnWidths: { 0: 180 } };
    const preview = buildGridPasteSpecialPreview({ cells: {}, clipboard, targetAnchor: 'C1', options: { mode: 'column-widths', operation: 'none' } });
    expect(preview.rows).toEqual([{ coord: 'Spalte C', before: '—', after: '180 px', changed: true }]);
  });
});

describe('Grid name box resolver', () => {
  const namedRanges: GridNamedRange[] = [{ id: 'nr-1', name: 'Umsatz', range: 'B2:B9', sheetId: 'sheet-1' }];
  const context = { namedRanges, sheetId: 'sheet-1', rowCount: 25, colCount: 10 };

  it('resolves a cell and reports the growth needed for B100', () => {
    const resolution = resolveGridNameBoxInput('B100', context);
    expect(resolution.kind).toBe('range');
    if (resolution.kind !== 'range') return;
    expect(resolution.range).toBe('B100');
    expect(resolution.requiredRows).toBe(100);
    expect(resolution.requiredCols).toBe(10);
  });

  it('resolves ranges and named ranges', () => {
    const range = resolveGridNameBoxInput('A1:D20', context);
    expect(range.kind === 'range' && range.range).toBe('A1:D20');
    const named = resolveGridNameBoxInput('umsatz', context);
    expect(named.kind === 'range' && named.range).toBe('B2:B9');
  });

  it('expands whole columns and whole rows to the sheet extent', () => {
    const column = resolveGridNameBoxInput('C', context);
    expect(column.kind === 'range' && column.range).toBe('C1:C25');
    const columns = resolveGridNameBoxInput('B:D', context);
    expect(columns.kind === 'range' && columns.range).toBe('B1:D25');
    const row = resolveGridNameBoxInput('5:6', context);
    expect(row.kind === 'range' && row.range).toBe('A5:J6');
    const grown = resolveGridNameBoxInput('40', context);
    expect(grown.kind === 'range' && grown.range).toBe('A40:J40');
    expect(grown.kind === 'range' && grown.requiredRows).toBe(40);
  });

  it('fails closed with a visible message for everything it cannot resolve', () => {
    for (const input of ['', '   ', 'A0', '???', 'B1:', 'Sheet9!A1']) {
      const resolution = resolveGridNameBoxInput(input, context);
      expect(resolution.kind, `expected rejection for "${input}"`).toBe('invalid');
      if (resolution.kind === 'invalid') expect(resolution.message.length).toBeGreaterThan(0);
    }
  });
});
