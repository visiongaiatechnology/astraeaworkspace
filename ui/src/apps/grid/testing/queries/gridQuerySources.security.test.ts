import { describe, expect, it } from 'vitest';
import { GRID_QUERY_MAX_SOURCE_BYTES } from '../../queries/gridQueryLimits';
import { queryTableFromText } from '../../queries/sources/gridQuerySources';

describe('Grid query source trust boundaries', () => {
  it('rejects oversized UTF-8 input before parsing', () => {
    expect(() => queryTableFromText('x'.repeat(GRID_QUERY_MAX_SOURCE_BYTES + 1))).toThrow('query_source_size_limit');
  });

  it('rejects excessive columns while scanning a delimited row', () => {
    const row = Array.from({ length: 257 }, () => 'x').join(',');
    expect(() => queryTableFromText(row)).toThrow('query_source_column_limit');
  });

  it('rejects aggregate row-by-column expansion before allocating a dense table', () => {
    const row = Array.from({ length: 256 }, () => 'x').join(',');
    expect(() => queryTableFromText(Array.from({ length: 1_000 }, () => row).join('\n'))).toThrow('query_source_cell_limit');
  });

  it('rejects JSON matrix expansion beyond the aggregate cell ceiling', () => {
    const matrix = Array.from({ length: 1_000 }, () => Array.from({ length: 256 }, () => 1));
    expect(() => queryTableFromText(JSON.stringify(matrix), 'bounded.json')).toThrow('query_source_cell_limit');
  });

  it('rejects an oversized quoted cell and unterminated quoted fields', () => {
    expect(() => queryTableFromText(`Header\n"${'x'.repeat(128_001)}"`)).toThrow('query_source_cell_limit');
    expect(() => queryTableFromText('Header\n"unfinished')).toThrow('query_source_unclosed_quote');
  });

  it('preserves a bounded UTF-8 source as a typed table', () => {
    const result = queryTableFromText('Region,Revenue\nWest,120\nEast,95');
    expect(result.table.columns.map((column) => column.name)).toEqual(['Region', 'Revenue']);
    expect(result.table.rows).toEqual([['West', '120'], ['East', '95']]);
  });
});
