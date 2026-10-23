// BATCH-PRESENT — bounded table editing and fit-to-slide sizing (Paket 13).
import { describe, expect, it } from 'vitest';
import type { PresentTableSceneObject } from '../../../../shared/contracts/workspace';
import {
  PRESENT_TABLE_MAX_CELL_LENGTH,
  PRESENT_TABLE_MAX_COLUMNS,
  PRESENT_TABLE_MAX_ROWS,
  appendPresentTableColumn,
  appendPresentTableRow,
  normalizePresentTable,
  removePresentTableColumn,
  removePresentTableRow,
  setPresentTableCell,
  setPresentTableColumn,
  stretchPresentObjectToSlide,
} from '../../canvas/model/presentTable';

const table = (patch: Partial<PresentTableSceneObject> = {}): PresentTableSceneObject => ({
  id: 'table-1',
  kind: 'table',
  columns: ['Metric', 'Q1'],
  rows: [['Users', '10']],
  headerColor: '#1e3a8a',
  bodyColor: '#0f172a',
  textColor: '#f8fafc',
  xPercent: 10,
  yPercent: 20,
  widthPercent: 50,
  heightPercent: 20,
  zIndex: 5,
  ...patch,
});

describe('normalizePresentTable', () => {
  it('makes a ragged table rectangular instead of letting the renderer guess', () => {
    const normalized = normalizePresentTable(table({ rows: [['a'], ['b', 'c', 'd']] }));
    expect(normalized.rows).toEqual([['a', ''], ['b', 'c']]);
  });

  it('bounds rows, columns, header text and cell text', () => {
    const huge = table({
      columns: Array.from({ length: PRESENT_TABLE_MAX_COLUMNS + 5 }, (_, index) => `C${index}`),
      rows: Array.from({ length: PRESENT_TABLE_MAX_ROWS + 5 }, () => Array.from({ length: 30 }, () => 'x'.repeat(PRESENT_TABLE_MAX_CELL_LENGTH + 50))),
    });
    const normalized = normalizePresentTable(huge);
    expect(normalized.columns).toHaveLength(PRESENT_TABLE_MAX_COLUMNS);
    expect(normalized.rows).toHaveLength(PRESENT_TABLE_MAX_ROWS);
    expect(normalized.rows[0]).toHaveLength(PRESENT_TABLE_MAX_COLUMNS);
    expect(normalized.rows[0][0]).toHaveLength(PRESENT_TABLE_MAX_CELL_LENGTH);
  });

  it('never produces a table without a row, a column or a header name', () => {
    const normalized = normalizePresentTable(table({ columns: [], rows: [] }));
    expect(normalized.columns.length).toBeGreaterThanOrEqual(1);
    expect(normalized.rows.length).toBeGreaterThanOrEqual(1);
    expect(normalized.columns[0]).toBe('Column 1');
    const blankHeader = normalizePresentTable(table({ columns: ['', '  '] }));
    expect(blankHeader.columns).toEqual(['Column 1', 'Column 2']);
  });
});

describe('table editing', () => {
  it('writes a cell, rejects an out-of-range cell and reports no change for an identical value', () => {
    const written = setPresentTableCell(table(), 0, 1, '10');
    expect(written.changed).toBe(false);
    expect(written.reason).toBe('unchanged');
    const updated = setPresentTableCell(table(), 0, 1, '10');
    expect(updated.table.rows[0][1]).toBe('10');
    const outOfRange = setPresentTableCell(table(), 9, 0, 'x');
    expect(outOfRange.changed).toBe(false);
    expect(outOfRange.message).toContain('outside the table');
  });

  it('adds and removes rows and columns with visible refusals at the bounds', () => {
    const oneRow = table({ rows: [['Users', '10']] });
    expect(removePresentTableRow(oneRow, 0).message).toContain('at least one row');
    const twoRows = { ...oneRow, rows: [['a', 'b'], ['c', 'd']] };
    expect(removePresentTableRow(twoRows, 0).table.rows).toEqual([['c', 'd']]);
    expect(appendPresentTableRow(twoRows).table.rows).toHaveLength(3);
    expect(appendPresentTableColumn(twoRows).table.columns).toHaveLength(3);
    expect(appendPresentTableColumn(twoRows).table.rows.every((row) => row.length === 3)).toBe(true);
    const oneColumn = table({ columns: ['Only'], rows: [['a']] });
    expect(removePresentTableColumn(oneColumn, 0).message).toContain('at least one column');
    expect(removePresentTableColumn(twoRows, 5).message).toContain('does not exist');
  });

  it('refuses to grow a table past its documented limits', () => {
    const maxRows = table({ rows: Array.from({ length: PRESENT_TABLE_MAX_ROWS }, () => ['a', 'b']) });
    const rowResult = appendPresentTableRow(maxRows);
    expect(rowResult.changed).toBe(false);
    expect(rowResult.message).toContain(String(PRESENT_TABLE_MAX_ROWS));
    const maxColumns = table({ columns: Array.from({ length: PRESENT_TABLE_MAX_COLUMNS }, (_, i) => `C${i}`) });
    const columnResult = appendPresentTableColumn(maxColumns);
    expect(columnResult.changed).toBe(false);
    expect(columnResult.message).toContain(String(PRESENT_TABLE_MAX_COLUMNS));
  });

  it('renames a header and normalises an empty header name', () => {
    expect(setPresentTableColumn(table(), 0, 'KPI').table.columns[0]).toBe('KPI');
    expect(setPresentTableColumn(table(), 0, '   ').table.columns[0]).toBe('Column 1');
    expect(setPresentTableColumn(table(), 7, 'x').changed).toBe(false);
  });
});

describe('stretchPresentObjectToSlide', () => {
  it('fills the slide on the requested axis only', () => {
    const widened = stretchPresentObjectToSlide(table(), 'width');
    expect(widened).toMatchObject({ xPercent: 0, widthPercent: 100, yPercent: 20, heightPercent: 20 });
    const heightened = stretchPresentObjectToSlide(table(), 'height');
    expect(heightened).toMatchObject({ yPercent: 0, heightPercent: 100, xPercent: 10, widthPercent: 50 });
    const both = stretchPresentObjectToSlide(table(), 'both');
    expect(both).toMatchObject({ xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100 });
  });
});
