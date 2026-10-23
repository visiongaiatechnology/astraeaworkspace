// Astraea Grid — Paket 18/19: the conditional-format preview and the structured-table
// style patch. Both must be pure and share the engine's evaluation instead of a copy.

import { describe, expect, it } from 'vitest';
import type { GridCell, GridStructuredTable } from '../../../../shared/contracts/workspace';
import {
  GRID_CELL_STYLES,
  GRID_STRUCTURED_TABLE_HEADER_TEXT,
  applyGridCellStyle,
  conditionalVisualForCell,
  gridStructuredTablePalette,
  gridStructuredTableStylePatch,
  normalizeConditionalPriorities,
  structuredTableVisualForCell,
  type GridStructuredTableTheme,
} from '../../formatting/gridFormattingEngine';
import {
  buildGridConditionalPreview,
  defaultGridConditionalRange,
  hasVisualEffect,
} from '../../formatting/gridConditionalPreview';
import { GRID_FORMAT_MAX_PREVIEW_CELLS } from '../../formatting/gridFormatValidation';

const cells: Record<string, GridCell> = {
  A1: { value: 5 }, A2: { value: 50 }, A3: { value: 150 }, A4: { value: 'text' },
};

function table(overrides: Partial<GridStructuredTable> = {}): GridStructuredTable {
  return {
    id: 'table-1', name: 'Table1', sheetId: 'sheet-1', range: 'A1:B3',
    hasHeaders: true, hasTotalsRow: false, styleTheme: 'blue',
    columns: [{ name: 'A' }, { name: 'B' }],
    ...overrides,
  };
}

describe('Grid conditional-format preview (Paket 18)', () => {
  it('samples the rule range and reuses the engine evaluation', () => {
    const rule = { id: 'cf-1', range: 'A1:A4', kind: 'cell' as const, operator: 'greater-than' as const, value: 40, priority: 1 };
    const preview = buildGridConditionalPreview({ rule, cells });
    expect(preview.available).toBe(true);
    expect(preview.cells.map((cell) => cell.coord)).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(preview.cells.map((cell) => cell.matched)).toEqual([false, true, true, false]);
    // The preview must agree with the renderer for the same cell, rule and data.
    for (const sample of preview.cells) {
      expect(sample.visual).toEqual(conditionalVisualForCell(sample.coord, cells[sample.coord], [rule], cells));
    }
  });

  it('is unavailable instead of inventing a result for an invalid rule', () => {
    expect(buildGridConditionalPreview({ rule: null, cells })).toEqual({ cells: [], available: false, anyMatch: false });
    expect(buildGridConditionalPreview({ rule: { id: 'x', range: 'banana' }, cells }).available).toBe(false);
  });

  it('bounds the number of sampled cells', () => {
    const rule = { id: 'cf-1', range: 'A1:Z100', kind: 'cell' as const, operator: 'greater-than' as const, value: 0, priority: 1 };
    expect(buildGridConditionalPreview({ rule, cells }).cells).toHaveLength(GRID_FORMAT_MAX_PREVIEW_CELLS);
    expect(buildGridConditionalPreview({ rule, cells, maxCells: 3 }).cells).toHaveLength(3);
  });

  it('still previews a rule on an empty sheet by using the active cell value', () => {
    const rule = { id: 'cf-1', range: 'A1:A3', kind: 'cell' as const, operator: 'greater-than' as const, value: 0, priority: 1 };
    const preview = buildGridConditionalPreview({ rule, cells: {}, fallbackValue: 7 });
    expect(preview.cells).toHaveLength(3);
    expect(preview.anyMatch).toBe(true);
  });

  it('reports a match only for visuals that change the rendering', () => {
    expect(hasVisualEffect({})).toBe(false);
    expect(hasVisualEffect({ bold: false })).toBe(false);
    expect(hasVisualEffect({ bold: true })).toBe(true);
    expect(hasVisualEffect({ background: '#fff' })).toBe(true);
    expect(hasVisualEffect({ dataBarPercent: 0 })).toBe(true);
    expect(hasVisualEffect({ icon: '↑' })).toBe(true);
  });

  it('previews colour scales and data bars as well as cell rules', () => {
    const scale = { id: 'cf-s', range: 'A1:A3', kind: 'color-scale' as const, priority: 1 };
    const preview = buildGridConditionalPreview({ rule: scale, cells });
    expect(preview.available).toBe(true);
    expect(preview.cells.every((cell) => cell.visual.background !== undefined)).toBe(true);

    const bar = { id: 'cf-b', range: 'A1:A3', kind: 'data-bar' as const, priority: 1, dataBarColor: '#123456' };
    const barPreview = buildGridConditionalPreview({ rule: bar, cells });
    expect(barPreview.cells.map((cell) => cell.visual.dataBarColor)).toEqual(['#123456', '#123456', '#123456']);
  });

  it('defaults a new rule to the selection, then to the active cell', () => {
    expect(defaultGridConditionalRange('A1:B8', 'C3')).toBe('A1:B8');
    expect(defaultGridConditionalRange('banana', 'C3')).toBe('C3');
    expect(defaultGridConditionalRange('', 'C3')).toBe('C3');
  });

  it('keeps normalizing priorities stable so the displayed order is the applied order', () => {
    const normalized = normalizeConditionalPriorities([
      { id: 'b', range: 'A1:A2', priority: 2 },
      { id: 'a', range: 'A1:A2', priority: 1 },
      { id: 'c', range: 'A1:A2' },
    ]);
    expect(normalized.map((rule) => rule.id)).toEqual(['a', 'b', 'c']);
    expect(normalized.map((rule) => rule.priority)).toEqual([1, 2, 3]);
  });
});

describe('Grid structured-table styles (Paket 19)', () => {
  it('paints header, stripe and totals rows onto the real cells', () => {
    const withTotals = table({ range: 'A1:B3', hasHeaders: true, hasTotalsRow: true });
    const patched = gridStructuredTableStylePatch(withTotals, { A1: { value: 'Head' }, A2: { value: 1 } });
    const palette = gridStructuredTablePalette('blue');
    expect(patched.A1).toMatchObject({ background: palette[0], text_color: GRID_STRUCTURED_TABLE_HEADER_TEXT, bold: true });
    expect(patched.A3).toMatchObject({ background: palette[0], bold: true });
    expect(patched.A2).toMatchObject({ background: palette[2] });
    // The stripe is per row, so both cells of the first data row carry the same fill.
    expect(patched.B2).toMatchObject({ background: palette[2] });
    // The data area keeps its value; a style patch never rewrites content.
    expect(patched.A2.value).toBe(1);
  });

  it('stripes data rows identically to the renderer, with and without a header row', () => {
    for (const hasHeaders of [true, false]) {
      const definition = table({ range: 'A1:B4', hasHeaders, hasTotalsRow: false });
      const patched = gridStructuredTableStylePatch(definition, { A2: { value: 2 } });
      for (let row = 1; row <= 4; row++) {
        for (const col of ['A', 'B']) {
          const coord = `${col}${row}`;
          const visual = structuredTableVisualForCell(coord, [definition]);
          expect(patched[coord]?.background, `${coord} hasHeaders=${hasHeaders}`).toBe(visual.background);
        }
      }
    }
  });

  it('does not delete a cell that was empty before the style was applied', () => {
    const patched = gridStructuredTableStylePatch(table({ range: 'A1:B2' }), {});
    expect(patched.A2).toMatchObject({ value: '' });
  });

  it('keeps an explicit per-cell fill overridable afterwards', () => {
    const patched = gridStructuredTableStylePatch(table({ range: 'A1:B2' }), {});
    const restyled = applyGridCellStyle(patched.A2, 'Bad');
    expect(restyled.background).toBe('#fee2e2');
    expect(restyled.value).toBe('');
  });

  it('reports an unusable table range instead of painting nothing silently', () => {
    expect(() => gridStructuredTableStylePatch(table({ range: 'nonsense' }), {})).toThrow(/invalid range/);
  });

  it('maps every declared theme to a distinct palette and rejects unknown ones at compile time', () => {
    const themes: readonly GridStructuredTableTheme[] = ['blue', 'dark', 'emerald', 'purple', 'amber'];
    const palettes = themes.map((theme) => gridStructuredTablePalette(theme)[0]);
    expect(new Set(palettes).size).toBe(themes.length);
  });

  it('renders the same colours the patch writes, for every theme', () => {
    for (const theme of ['blue', 'dark', 'emerald', 'purple', 'amber'] as const) {
      const visual = structuredTableVisualForCell('B2', [table({ range: 'A1:B3', styleTheme: theme, hasTotalsRow: false })]);
      expect(visual.background, theme).toBe(gridStructuredTablePalette(theme)[2]);
    }
    expect(structuredTableVisualForCell('Z9', [table()])).toEqual({});
  });

  it('offers editable named cell styles that keep the cell value', () => {
    const styled = applyGridCellStyle({ value: 42 }, 'Title');
    expect(styled.value).toBe(42);
    expect(styled.bold).toBe(true);
    expect(GRID_CELL_STYLES.every((preset) => typeof preset.name === 'string' && preset.name.length > 0)).toBe(true);
    expect(() => applyGridCellStyle({ value: 1 }, 'Nope')).toThrow(/Unknown Grid cell style/);
  });
});
