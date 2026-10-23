// Contract test: the DOM renderer must apply persisted axis sizes, merged spans
// and frozen panes, and it must expose a visible fill handle and resize grips.

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GridTableCanvas } from '../../canvas/GridTableCanvas';

const sheet = {
  id: 'sheet-1',
  name: 'Sheet 1',
  tableObjectId: 'grid-table-1',
  colWidths: { 0: 180 },
  rowHeights: { 0: 60 },
  mergedCells: ['A1:B2'],
  freezeRows: 1,
  freezeCols: 1,
  showGridlines: true,
  zoom: 100,
};

const render = (overrides = {}) => renderToStaticMarkup(createElement(GridTableCanvas, {
  sheet,
  cells: { A1: { value: 'origin' }, C1: { value: 'x' }, C2: { value: 'y' } },
  colCount: 6,
  rowCount: 8,
  visibleRowIndices: [0, 1, 2, 3, 4, 5, 6, 7],
  selectedCell: 'C2',
  selectedRange: 'C2',
  selectedRanges: ['C2'],
  isEditing: false,
  formulaInput: '',
  dragOverCoord: null,
  inlineInputRef: { current: null },
  onChangeFormulaInput: vi.fn(),
  onCellClick: vi.fn(),
  onCellDoubleClick: vi.fn(),
  onCellMouseDown: vi.fn(),
  onCellMouseEnter: vi.fn(),
  onDragStartCell: vi.fn(),
  onDragOverCell: vi.fn(),
  onDropCell: vi.fn(),
  onSelectColumn: vi.fn(),
  onSelectRow: vi.fn(),
  onSelectAll: vi.fn(),
  onResizeTable: vi.fn(),
  // Required since AST-0391: the column-header AutoFilter entry needs the active rules and their writer.
  filterRules: [],
  onUpdateFilters: vi.fn(),
  ...overrides,
}));

describe('GridTableCanvas rendering contract', () => {
  it('renders merged ranges as a single spanning origin cell', () => {
    const html = render();
    expect(html).toContain('data-vgt-grid-merged-origin="A1"');
    expect(html).toMatch(/colspan="2"/i);
    expect(html).toMatch(/rowspan="2"/i);
    // Covered coordinates are owned by the origin and must not be painted again.
    expect(html).not.toContain('data-vgt-grid-merged-origin="B1"');
    expect(html).not.toContain('data-vgt-grid-merged-origin="B2"');
  });

  it('applies persisted column widths and row heights', () => {
    const html = render();
    expect(html).toContain('width:180px');
    expect(html).toContain('height:60px');
  });

  it('marks frozen rows and columns and keeps them sticky below the header', () => {
    const html = render();
    expect(html).toContain('data-vgt-grid-frozen-row="true"');
    expect(html).toContain('data-vgt-grid-frozen-column="true"');
    expect(html).toContain('data-vgt-grid-freeze-rows="1"');
    expect(html).toContain('data-vgt-grid-freeze-cols="1"');
    expect(html).toContain('position:sticky');
  });

  it('exposes a visible fill handle and per axis resize grips', () => {
    const html = render();
    expect(html).toContain('data-vgt-grid-selection-handle="true"');
    expect(html).toContain('bg-blue-500');
    expect(html).toContain('data-vgt-grid-column-resizer="0"');
    expect(html).toContain('data-vgt-grid-row-resizer="0"');
    expect(html).toContain('aria-label="Spaltenbreite A"');
  });

  it('does not render a freeze marker when nothing is frozen', () => {
    const html = render({ sheet: { ...sheet, freezeRows: 0, freezeCols: 0 } });
    expect(html).not.toContain('data-vgt-grid-frozen-row="true"');
    expect(html).not.toContain('data-vgt-grid-frozen-column="true"');
  });

  it('no longer ignores the persisted geometry in the component source', () => {
    const source = readFileSync(new URL('../../canvas/GridTableCanvas.tsx', import.meta.url), 'utf8');
    expect(source).toContain('buildGridAxisScale');
    expect(source).toContain('buildGridMergeIndex');
    expect(source).toContain('computeGridFreezeLayout');
    expect(source).not.toContain('const freezeRows = sheet.freezeRows');
  });
});
