// STATUS: PLATIN — counter-checks for Grid Paket 43 (Power-Query-artige Transformationen).
//
// Hand-written oracle for "CSV laden, Spalten typisieren, filtern und Transformationsschritte
// wiederholen" plus the trust-boundary rule that user input drives the transformations, so step
// counts, indices, operators, regex/parse work and source sizes must all be bounded and explicit.
import { describe, expect, it } from 'vitest';
import {
  executeQueryPipeline,
  parseCsvToQueryTable,
  compareGridQueryValues,
  toGridQueryNumber,
  type QueryColumn,
  type QueryStep,
} from '../../queries/gridPowerQuery';
import {
  GRID_QUERY_MAX_CALCULATED_FORMULA_CHARS,
  GRID_QUERY_STEP_TYPES,
} from '../../queries/gridQueryStepValidation';
import { GRID_QUERY_MAX_STEPS } from '../../queries/gridQueryLimits';

const COLUMNS: QueryColumn[] = [
  { name: 'Ort', type: 'text' },
  { name: 'Umsatz', type: 'number' },
  { name: 'Kunde', type: 'text' },
];

function step(type: QueryStep['type'], params: Record<string, unknown>, id: string = type): QueryStep {
  return { id, type, description: type, params };
}

describe('Grid query pipeline: unknown steps and invalid parameters are rejected, never no-ops', () => {
  it('rejects an unknown step type instead of silently counting it as applied', () => {
    const rows = [['A', 1, 'x']];
    expect(() => executeQueryPipeline(COLUMNS, rows, [step('bogus' as QueryStep['type'], {})]))
      .toThrow('query_step_type_unsupported');
  });

  it('accepts every declared step type at the validation boundary', () => {
    for (const type of GRID_QUERY_STEP_TYPES) {
      expect(() => executeQueryPipeline(COLUMNS, [['A', 1, 'x']], [step(type, type === 'source' ? {} : invalidFor(type))]))
        .not.toThrow('query_step_type_unsupported');
    }
  });

  it('rejects a non-integer, negative or out-of-range column index', () => {
    const rows = [['A', 1, 'x']];
    for (const colIndex of [3, -1, 1.5, '1']) {
      expect(() => executeQueryPipeline(COLUMNS, rows, [step('sort', { colIndex, ascending: true })]))
        .toThrow('query_sort_column_invalid');
    }
    // NaN is rejected even earlier by the step-shape preflight.
    expect(() => executeQueryPipeline(COLUMNS, rows, [step('sort', { colIndex: Number.NaN, ascending: true })]))
      .toThrow('query_step_number_invalid');
  });

  it('rejects an unknown filter operator and an unknown aggregation function', () => {
    const rows = [['A', 1, 'x']];
    expect(() => executeQueryPipeline(COLUMNS, rows, [step('filter', { colIndex: 0, operator: 'matches', value: 'A' })]))
      .toThrow('query_filter_operator_invalid');
    expect(() => executeQueryPipeline(COLUMNS, rows, [step('groupBy', { groupColIndex: 0, aggColIndex: 1, aggFunction: 'median' })]))
      .toThrow('query_aggregation_invalid');
  });

  it('rejects removing every column and a merge of a column with itself', () => {
    expect(() => executeQueryPipeline(COLUMNS, [['A', 1, 'x']], [step('removeColumns', { colIndices: [0, 1, 2] })]))
      .toThrow('query_remove_columns_would_empty_schema');
    expect(() => executeQueryPipeline(COLUMNS, [['A', 1, 'x']], [step('merge', { leftColIndex: 0, rightColIndex: 0, newName: 'M' })]))
      .toThrow('query_merge_same_column');
  });

  it('bounds the calculated-column formula and the step count', () => {
    const rows = [['A', 1, 'x']];
    expect(() => executeQueryPipeline(COLUMNS, rows, [step('addCalculated', { newName: 'N', formula: 'a'.repeat(GRID_QUERY_MAX_CALCULATED_FORMULA_CHARS + 1) })]))
      .toThrow('query_calculated_formula_limit');
    expect(() => executeQueryPipeline(COLUMNS, rows, [step('addCalculated', { newName: 'N', formula: '   ' })]))
      .toThrow('query_calculated_formula_empty');

    const tooMany = Array.from({ length: GRID_QUERY_MAX_STEPS + 1 }, (_, index) => step('sort', { colIndex: 1, ascending: true }, `s${index}`));
    expect(() => executeQueryPipeline(COLUMNS, rows, tooMany)).toThrow('query_step_limit');
  });

  it('refuses a join with an out-of-range right key instead of joining on undefined', () => {
    const right = { columns: [{ name: 'K', type: 'text' as const }], rows: [['A']] };
    expect(() => executeQueryPipeline(COLUMNS, [['A', 1, 'x']], [step('join', { joinType: 'left', leftKeyIndex: 2, rightTable: right, rightKeyIndex: 5 })]))
      .toThrow('query_join_key_invalid');
    expect(() => executeQueryPipeline(COLUMNS, [['A', 1, 'x']], [step('join', { joinType: 'sideways', leftKeyIndex: 2, rightTable: right, rightKeyIndex: 0 })]))
      .toThrow('query_join_type_invalid');
    expect(() => executeQueryPipeline(COLUMNS, [['A', 1, 'x']], [step('append', {})]))
      .toThrow('query_append_table_invalid');
  });
});

describe('Grid query pipeline: deterministic, lossless transformation results', () => {
  it('sorts deterministically by code unit instead of the host locale', () => {
    const rows = [['Öl', 1, 'x'], ['Ost', 2, 'x'], ['Ast', 3, 'x']];
    const result = executeQueryPipeline(COLUMNS, rows, [step('sort', { colIndex: 0, ascending: true })]);
    // Code-unit order puts 'A' < 'O' < 'Ö' ('Ö' = U+00D6 > 'O' = U+004F), independent of locale.
    expect(result.rows.map((row) => row[0])).toEqual(['Ast', 'Ost', 'Öl']);
  });

  it('compares numbers numerically and mixed values consistently', () => {
    expect(compareGridQueryValues(2, 10)).toBeLessThan(0);
    expect(compareGridQueryValues(10, 10)).toBe(0);
    expect(compareGridQueryValues(null, 'a')).toBeLessThan(0);
    expect(compareGridQueryValues('a', null)).toBeGreaterThan(0);
    expect(compareGridQueryValues('a', 'b')).toBeLessThan(0);
    // Never locale dependent: repeat to prove stability.
    for (let attempt = 0; attempt < 5; attempt += 1) expect(compareGridQueryValues('Ö', 'O')).toBeGreaterThan(0);
  });

  it('never fabricates a 0 for a non-numeric value during changeType', () => {
    const rows = [['A', '12', 'x'], ['B', 'n/a', 'x'], ['C', '', 'x']];
    const result = executeQueryPipeline(COLUMNS, rows, [step('changeType', { colIndex: 1, targetType: 'number' })]);
    expect(result.rows.map((row) => row[1])).toEqual([12, null, null]);
    expect(result.conversionReports).toHaveLength(1);
    expect(result.conversionReports[0]).toMatchObject({ column: 'Umsatz', type: 'number', converted: 1, unconvertible: 2 });
    expect(toGridQueryNumber('n/a')).toBeNull();
    expect(toGridQueryNumber('')).toBeNull();
    expect(toGridQueryNumber('007')).toBe(7);
    expect(toGridQueryNumber(true)).toBe(1);
  });

  it('reports a failed calculated expression instead of pushing a silent 0', () => {
    const rows = [['A', 2, 'x']];
    const result = executeQueryPipeline(COLUMNS, rows, [step('addCalculated', { newName: 'Doppelt', formula: 'Umsatz*2' })]);
    expect(result.rows[0]?.[3]).toBe(4);
    expect(result.conversionReports).toHaveLength(0);

    const failing = executeQueryPipeline(COLUMNS, rows, [step('addCalculated', { newName: 'Kaputt', formula: 'Umsatz/(' })]);
    expect(failing.rows[0]?.[3]).toBeNull();
    expect(failing.conversionReports[0]).toMatchObject({ column: 'Kaputt', unconvertible: 1 });
  });

  it('replaces every occurrence in a cell, not only the first', () => {
    const rows = [['aaa', 1, 'x']];
    const result = executeQueryPipeline(COLUMNS, rows, [step('replace', { colIndex: 0, find: 'a', replacement: 'bb', matchCase: true })]);
    expect(result.rows[0]?.[0]).toBe('bbbbbb');
  });

  it('reports how many steps changed the schema and the row count', () => {
    const rows = [['A', 1, 'x'], ['B', 2, 'x']];
    const result = executeQueryPipeline(COLUMNS, rows, [
      step('source', {}, 's0'),
      step('sort', { colIndex: 1, ascending: true }, 's1'),
      step('rename', { colIndex: 0, newName: 'Region' }, 's2'),
      step('filter', { colIndex: 1, operator: 'greater', value: 1 }, 's3'),
    ]);
    expect(result.appliedStepsCount).toBe(4);
    expect(result.schemaChangingSteps).toBe(1);
    expect(result.rowCountChangingSteps).toBe(1);
    expect(result.rowCount).toBe(1);
    expect(result.columns[0]?.name).toBe('Region');
  });

  it('groups with an explicit aggregation and ignores non-numeric aggregate inputs only where documented', () => {
    const rows = [['A', '10', 'x'], ['A', 'n/a', 'x'], ['B', '4', 'x']];
    const result = executeQueryPipeline(COLUMNS, rows, [step('groupBy', { groupColIndex: 0, aggColIndex: 1, aggFunction: 'count' })]);
    expect(result.rows).toEqual([['A', 2], ['B', 1]]);
  });
});

describe('Grid query CSV loading is bounded and quote-aware', () => {
  it('keeps a quoted delimiter inside one column', () => {
    const { columns, rows } = parseCsvToQueryTable('Ort,Umsatz\n"Berlin, Mitte",1200');
    expect(columns.map((column) => column.name)).toEqual(['Ort', 'Umsatz']);
    expect(rows[0]?.[0]).toBe('Berlin, Mitte');
    expect(rows[0]?.[1]).toBe(1200);
  });

  it('does not convert a leading-zero column into numbers', () => {
    const { columns, rows } = parseCsvToQueryTable('PLZ,Menge\n00123,5\n01067,7');
    expect(columns.map((column) => column.type)).toEqual(['text', 'number']);
    expect(rows[0]?.[0]).toBe('00123');
    expect(rows[1]?.[0]).toBe('01067');
    expect(rows[0]?.[1]).toBe(5);
  });

  it('bounds the source, the row count and the column count', () => {
    expect(() => parseCsvToQueryTable('x'.repeat(17 * 1024 * 1024))).toThrow('query_source_size_limit');
    const wide = Array.from({ length: 260 }, (_, index) => `c${index}`).join(',');
    expect(() => parseCsvToQueryTable(`${wide}\n${wide}`)).toThrow('query_source_column_limit');
    expect(() => parseCsvToQueryTable('a,"unterminated')).toThrow('query_csv_unclosed_quote');
  });

  it('returns an empty schema for empty input instead of throwing', () => {
    expect(parseCsvToQueryTable('')).toEqual({ columns: [], rows: [] });
  });
});

function invalidFor(type: string): Record<string, unknown> {
  switch (type) {
    case 'filter': return { colIndex: 0, operator: 'equals', value: 'A' };
    case 'rename': return { colIndex: 0, newName: 'Neu' };
    case 'changeType': return { colIndex: 0, targetType: 'text' };
    case 'addCalculated': return { newName: 'N', formula: '1+1' };
    case 'split': return { colIndex: 0, delimiter: ' ' };
    case 'sort': return { colIndex: 0, ascending: true };
    case 'groupBy': return { groupColIndex: 0, aggColIndex: 1, aggFunction: 'sum' };
    case 'removeColumns': return { colIndices: [2] };
    case 'unpivot': return { fixedColIndices: [0], unpivotColIndices: [1], attributeColName: 'A', valueColName: 'V' };
    case 'pivot': return { keyColIndex: 0, attributeColIndex: 1, valueColIndex: 2 };
    case 'merge': return { leftColIndex: 0, rightColIndex: 1, newName: 'M', delimiter: ' ' };
    case 'replace': return { colIndex: 0, find: 'A', replacement: 'B' };
    case 'join': return { joinType: 'left', leftKeyIndex: 0, rightKeyIndex: 0, rightTable: { columns: [{ name: 'Ort', type: 'text' }], rows: [['A']] } };
    case 'append': return { table: { columns: [{ name: 'Ort', type: 'text' }, { name: 'Umsatz', type: 'number' }, { name: 'Kunde', type: 'text' }], rows: [['C', 3, 'y']] } };
    default: return {};
  }
}
