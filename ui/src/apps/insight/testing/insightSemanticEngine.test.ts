// STATUS: PLATIN — BATCH-INSIGHT-7: the semantic expression engine has ONE aggregation definition.
//
// MEASURED FACT (D-INSIGHT-AGG-02): `semantic/insightSemanticEngine.ts:10` held a second aggregation
// switch over the same function names with a different behaviour - its AVG divided by every row
// (including rows whose cell was not a number) and its SUM coerced non-numeric cells to 0. It was
// unreachable, so nothing broke; that is exactly why it had to be deleted rather than noted.
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type InsightRow } from '../domain/types';
import { InsightError } from '../core/insightCore';
import {
  addRelationship,
  applyCalculatedColumns,
  applyRls,
  createDateTable,
  evaluateInsightExpression,
  evaluateMeasure,
  inferSchemaTopology,
  validateHierarchy,
  validateSemanticModel,
} from '../semantic/insightSemanticEngine';
import { aggregateInsightScalars } from '../core/insightCore';

const rows = (): InsightRow[] => [{ v:1 }, { v:2 }, { v:'x' }, { v:null }];
const evaluator = (expression: string, data: InsightRow[] = rows(), context: InsightRow = {}) => evaluateInsightExpression(expression, context, data);

describe('Insight expression evaluation (pure)', () => {
  it('evaluates arithmetic, precedence, parentheses and unary minus', () => {
    expect(evaluator('1+2*3')).toBe(7);
    expect(evaluator('(1+2)*3')).toBe(9);
    expect(evaluator('-4+1')).toBe(-3);
    expect(evaluator('7/2')).toBe(3.5);
    expect(evaluator("'a'+'b'")).toBe('ab');
    // Division by zero is defined as 0 instead of Infinity, so a measure can never publish an unbounded number.
    expect(evaluator('1/0')).toBe(0);
  });

  it('evaluates comparisons, AND, OR and NOT', () => {
    expect(evaluator('2 > 1')).toBe(true);
    expect(evaluator('2 <= 1')).toBe(false);
    expect(evaluator("'a' = 'a'")).toBe(true);
    expect(evaluator('1 < 2 AND 2 < 3')).toBe(true);
    expect(evaluator('1 > 2 OR 2 > 1')).toBe(true);
    expect(evaluator('NOT 1 > 2')).toBe(true);
  });

  it('reads a column from the row and returns null for an unknown column', () => {
    expect(evaluator('region', [], { region:'Europe' })).toBe('Europe');
    expect(evaluator('missing', [], { region:'Europe' })).toBeNull();
  });

  it('aggregates a column through the ONE shared aggregation definition', () => {
    // AVG divides by the numeric values only (1 and 2), not by every row: the removed switch produced 1.
    expect(evaluator('AVG(v)')).toBe(1.5);
    // SUM ignores the non-numeric cell instead of coercing it to 0 (the sum happens to be the same here).
    expect(evaluator('SUM(v)')).toBe(3);
    expect(evaluator('MIN(v)')).toBe(1);
    expect(evaluator('MAX(v)')).toBe(2);
    // COUNT counts the non-null values, which is the call site's documented null policy.
    expect(evaluator('COUNT(v)')).toBe(3);
    // The same numbers as the shared definition, so a measure and a matrix cell cannot disagree.
    expect(evaluator('AVG(v)')).toBe(aggregateInsightScalars([1, 2], 'AVG'));
    expect(evaluator('SUM(v)')).toBe(aggregateInsightScalars([1, 2], 'SUM'));
    expect(evaluator('AVG(v)')).toBe(evaluator('SUM(v)/2'));
    // A column without numbers yields 0 for the numeric aggregates, never NaN.
    expect(evaluator('AVG(x)', [{ x:'a' }])).toBe(0);
  });

  it('names every syntax refusal instead of returning a wrong number', () => {
    expect(() => evaluator('1+')).toThrowError('expression-unexpected-end');
    expect(() => evaluator('(1+2')).toThrowError('expression-paren');
    expect(() => evaluator('SUM(v')).toThrowError(InsightError);
    expect(() => evaluator('SUM()')).toThrowError('expression-call');
    expect(() => evaluator('1 2')).toThrowError('expression-trailing-token');
    expect(() => evaluator('1 $ 2')).toThrowError('expression-token-invalid');
    expect(() => evaluator('1'.repeat(5000))).toThrowError('expression-length-limit');
    expect(() => evaluator(Array.from({ length:1200 }, () => '1').join('+'))).toThrowError(InsightError);
  });

  it('evaluates a measure and applies calculated columns and RLS through the same evaluator', () => {
    const data = [{ revenue:100, region:'Europe' }, { revenue:200, region:'North' }];
    expect(evaluateMeasure('SUM(revenue)', data)).toBe(300);
    const table = { id:'t1', name:'T', hidden:false, columns:[{ id:'c1', name:'margin', dataType:'number' as const, hidden:false, calculatedExpression:'revenue/100' }] };
    expect(applyCalculatedColumns(table, data).map((row) => row.margin)).toEqual([1, 2]);
    expect(applyRls(data, [{ id:'r1', role:'viewer', tableId:'t1', expression:"region = 'Europe'" }], 't1', new Set(['viewer']))).toEqual([{ revenue:100, region:'Europe' }]);
    // Without a matching role no rule applies and every row survives.
    expect(applyRls(data, [{ id:'r1', role:'modeler', tableId:'t1', expression:"region = 'Europe'" }], 't1', new Set(['viewer']))).toHaveLength(2);
  });
});

describe('Insight semantic model validation (pure)', () => {
  it('validates relationships, hierarchies and the model shape', () => {
    const empty = { tables:[], relationships:[], measures:[], kpis:[], hierarchies:[], rls:[], ols:[] };
    expect(validateSemanticModel(empty)).toEqual([]);
    expect(inferSchemaTopology(empty)).toBe('flat');
    const model = structuredClone(DEFAULT_INSIGHT_MODEL.semanticModel);
    expect(validateSemanticModel(model)).toEqual([]);
    expect(inferSchemaTopology(model)).toBe('flat');
    const broken = { ...model, measures:[{ id:'m-x', name:'X', tableId:'no-such-table', expression:'SUM(revenue)' }] };
    expect(validateSemanticModel(broken)).toContain('measure-table-missing:m-x');
    // A relationship that points at objects which do not exist is refused when it is added.
    expect(() => addRelationship(model, { id:'rel-x', fromTableId:'no-such', fromColumnId:'c', toTableId:'tbl-ops', toColumnId:'col-region', cardinality:'one-to-many', filterDirection:'single', active:true })).toThrowError(InsightError);
    const hierarchy = { id:'h1', name:'Geo', tableId:'tbl-ops', levels:[{ id:'l1', columnId:'col-region', name:'Region' }] };
    expect(() => validateHierarchy(hierarchy, model)).not.toThrow();
    expect(() => validateHierarchy({ ...hierarchy, levels:[{ id:'l1', columnId:'nope', name:'X' }] }, model)).toThrowError('hierarchy-column-missing');
  });

  it('refuses an invalid date table instead of building a wrong calendar', () => {
    expect(createDateTable('d1', 'Date', '2026-01-01', '2026-03-31').columns.map((column) => column.name)).toEqual(['Date', 'Year', 'Month', 'Day']);
    expect(() => createDateTable('d1', 'Date', '2026-03-31', '2026-01-01')).toThrowError('date-table-range-invalid');
    expect(() => createDateTable('d1', 'Date', 'nonsense', '2026-01-01')).toThrowError('date-table-range-invalid');
  });
});
