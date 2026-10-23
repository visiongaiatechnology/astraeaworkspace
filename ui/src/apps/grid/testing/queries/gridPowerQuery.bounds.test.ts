import { describe, expect, it } from 'vitest';
import { executeQueryPipeline, queryResultToGridCells, type QueryColumn, type QueryStep } from '../../queries/gridPowerQuery';

describe('Grid query transformation resource boundaries', () => {
  it('rejects aggregate cell expansion before accepting a dense source', () => {
    const columns: QueryColumn[] = Array.from({ length: 256 }, (_, index) => ({ name: `C${index}`, type: 'text' }));
    const rows = Array.from({ length: 1_000 }, () => Array.from({ length: 256 }, () => 'x'));
    expect(() => executeQueryPipeline(columns, rows, [])).toThrow('query_source_cell_limit');
  });

  it('preflights unpivot amplification before allocating expanded rows', () => {
    const columns: QueryColumn[] = Array.from({ length: 250 }, (_, index) => ({ name: `C${index}`, type: 'text' }));
    const rows = Array.from({ length: 1_000 }, () => Array.from({ length: 250 }, () => 'x'));
    const step: QueryStep = { id: 'u', type: 'unpivot', description: 'bounded unpivot', params: {
      fixedColIndices: [0], unpivotColIndices: Array.from({ length: 249 }, (_, index) => index + 1),
    } };
    expect(() => executeQueryPipeline(columns, rows, [step])).toThrow('query_source_row_limit');
  });

  it('preflights Cartesian join expansion before constructing joined rows', () => {
    const columns: QueryColumn[] = [{ name: 'Key', type: 'text' }];
    const rows = Array.from({ length: 500 }, () => ['same']);
    const step: QueryStep = { id: 'j', type: 'join', description: 'bounded join', params: {
      joinType: 'left', leftKeyIndex: 0, rightKeyIndex: 0, rightTable: { columns, rows },
    } };
    expect(() => executeQueryPipeline(columns, rows, [step])).toThrow('query_join_result_limit');
  });

  it('rejects a load whose header plus rows exceed the Grid history-safe cell budget', () => {
    const columns: QueryColumn[] = Array.from({ length: 4 }, (_, index) => ({ name: `C${index}`, type: 'text' }));
    const rows = Array.from({ length: 2_500 }, () => ['a', 'b', 'c', 'd']);
    expect(() => queryResultToGridCells(0, 0, columns, rows)).toThrow('query_load_cell_limit');
  });

  it('rejects query steps with oversized persisted text before transformation', () => {
    const columns: QueryColumn[] = [{ name: 'Value', type: 'text' }];
    const step: QueryStep = { id: 'f', type: 'filter', description: 'filter', params: { value: 'x'.repeat(128_001) } };
    expect(() => executeQueryPipeline(columns, [['x']], [step])).toThrow('query_step_text_limit');
  });

  it('preflights replacement output text before allocating expanded result strings', () => {
    const columns: QueryColumn[] = [{ name: 'Value', type: 'text' }];
    const value = 'x'.repeat(125_000);
    const rows = Array.from({ length: 133 }, () => [value]);
    const step: QueryStep = { id: 'r', type: 'replace', description: 'bounded replace', params: {
      colIndex: 0, find: 'x', replacement: 'y'.repeat(2_048), matchCase: true,
    } };
    expect(() => executeQueryPipeline(columns, rows, [step])).toThrow('query_replace_text_limit');
  });
});
