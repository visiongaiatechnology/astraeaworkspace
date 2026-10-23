// STATUS: DIAMANT VGT SUPREME
// IF and nested functions, error propagation and comparison operators: Paket 21
// (AST-0341..0345).
//
// Two defects are counter-checked here:
//   1. conditions were coerced with JavaScript truthiness, so an error condition was
//      "true" and a non-logical text condition was accepted;
//   2. `<=`, `>=` and `<>` were split at their `=`/`<` prefix because the operator table
//      tried the one-character operators first.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';
import { coerceFormulaLogical, findBinaryOperator } from '../../formulas/gridFormulaExpressionUtils';
import { GRID_FORMULA_LIMITS } from '../../formulas/gridFormulaLimits';
import type { FormulaEngineOptions } from '../../formulas/gridFormulaEngineTypes';

function grid(data: Record<string, Partial<GridCell>>): Record<string, GridCell> {
  const result: Record<string, GridCell> = {};
  for (const [coord, cell] of Object.entries(data)) {
    result[coord] = { value: cell.value ?? '', formula: cell.formula };
  }
  return result;
}

function evaluate(formula: string, cells: Record<string, GridCell> = {}, options?: FormulaEngineOptions): unknown {
  return evaluateGridFormulaLocal(formula, cells, new Set(), undefined, 'Sheet1', {}, options);
}

describe('Paket 21 — logical coercion is spreadsheet coercion', () => {
  it('accepts numbers, booleans and the text literals TRUE/FALSE', () => {
    expect(coerceFormulaLogical(true)).toBe(true);
    expect(coerceFormulaLogical(false)).toBe(false);
    expect(coerceFormulaLogical(1)).toBe(true);
    expect(coerceFormulaLogical(0)).toBe(false);
    expect(coerceFormulaLogical(null)).toBe(false);
    expect(coerceFormulaLogical('TRUE')).toBe(true);
    expect(coerceFormulaLogical(' false ')).toBe(false);
  });

  it('rejects text that is not a logical literal', () => {
    expect(coerceFormulaLogical('abc')).toBe('#VALUE!');
    expect(coerceFormulaLogical('1')).toBe('#VALUE!');
    expect(coerceFormulaLogical('')).toBe('#VALUE!');
  });
});

describe('Paket 21 — IF and nested functions', () => {
  const cells = grid({ A1: { value: 15 }, B1: { value: 'note' }, C1: { value: '#DIV/0!' } });

  it('evaluates the acceptance scenario with several conditions', () => {
    expect(evaluate('=IF(A1>20, "gross", IF(A1>10, "mittel", "klein"))', cells)).toBe('mittel');
    expect(evaluate('=IF(A1>10, IF(A1<20, "im Bereich", "zu gross"), "zu klein")', cells)).toBe('im Bereich');
    expect(evaluate('=IF(A1>100, "a", "b")', cells)).toBe('b');
  });

  it('supports the two-argument form and rejects a missing branch', () => {
    expect(evaluate('=IF(1>2, "yes")', cells)).toBe(false);
    expect(evaluate('=IF(TRUE)', cells)).toBe('#VALUE!');
    expect(evaluate('=IF()', cells)).toBe('#VALUE!');
  });

  it('propagates an error condition instead of treating it as true', () => {
    // Old behaviour: Boolean('#DIV/0!') === true, so the true branch was returned.
    expect(evaluate('=IF(1/0>0, "wahr", "falsch")', cells)).toBe('#DIV/0!');
    expect(evaluate('=IF(C1>0, "wahr", "falsch")', cells)).toBe('#DIV/0!');
    expect(evaluate('=IFS(1/0>0, "a", TRUE, "b")', cells)).toBe('#DIV/0!');
  });

  it('propagates errors from the selected branch and ignores the unused one', () => {
    expect(evaluate('=IF(TRUE, NA(), 1)', cells)).toBe('#N/A');
    expect(evaluate('=IF(FALSE, NA(), 1)', cells)).toBe(1);
    // The unused branch must stay unevaluated, so a broken reference there is harmless.
    expect(evaluate('=IF(TRUE, 5, 1/0)', cells)).toBe(5);
  });

  it('rejects a non-logical text condition', () => {
    expect(evaluate('=IF("abc", 1, 2)', cells)).toBe('#VALUE!');
    expect(evaluate('=IF("TRUE", 1, 2)', cells)).toBe(1);
    expect(evaluate('=NOT("abc")', cells)).toBe('#VALUE!');
  });

  it('evaluates IFS pairs in order', () => {
    expect(evaluate('=IFS(1=2, "one", 2=3, "two", 3=3, "three")', cells)).toBe('three');
    expect(evaluate('=IFS(1=2, "one", 2=3, "two")', cells)).toBe('#N/A');
    expect(evaluate('=IFS(TRUE)', cells)).toBe('#VALUE!');
  });

  it('evaluates SWITCH with and without a default', () => {
    expect(evaluate('=SWITCH(2, 1, "One", 2, "Two", "Default")', cells)).toBe('Two');
    expect(evaluate('=SWITCH(9, 1, "One", 2, "Two", "Default")', cells)).toBe('Default');
    expect(evaluate('=SWITCH(9, 1, "One", 2, "Two")', cells)).toBe('#N/A');
    expect(evaluate('=SWITCH(1/0, 1, "One", "Default")', cells)).toBe('#DIV/0!');
  });

  it('does not short-circuit AND/OR past an error argument', () => {
    // Old behaviour: AND(FALSE, 1/0) returned FALSE and OR(TRUE, 1/0) returned TRUE.
    expect(evaluate('=AND(FALSE, 1/0)', cells)).toBe('#DIV/0!');
    expect(evaluate('=OR(TRUE, 1/0)', cells)).toBe('#DIV/0!');
    expect(evaluate('=XOR(1/0>0)', cells)).toBe('#DIV/0!');
  });

  it('evaluates AND/OR/XOR correctly for valid arguments', () => {
    expect(evaluate('=AND(TRUE, 1>0, 5=5)', cells)).toBe(true);
    expect(evaluate('=AND(TRUE, FALSE)', cells)).toBe(false);
    expect(evaluate('=OR(FALSE, 1>2, 5>2)', cells)).toBe(true);
    expect(evaluate('=OR(FALSE, FALSE)', cells)).toBe(false);
    expect(evaluate('=XOR(TRUE, FALSE)', cells)).toBe(true);
    expect(evaluate('=XOR(TRUE, TRUE)', cells)).toBe(false);
    expect(evaluate('=NOT(TRUE)', cells)).toBe(false);
  });

  it('wraps errors with IFERROR and IFNA without swallowing other errors', () => {
    expect(evaluate('=IFERROR(1/0, "ok")', cells)).toBe('ok');
    expect(evaluate('=IFERROR(NA(), "ok")', cells)).toBe('ok');
    expect(evaluate('=IFERROR(42, "ok")', cells)).toBe(42);
    expect(evaluate('=IFNA(NA(), "na")', cells)).toBe('na');
    expect(evaluate('=IFNA(1/0, "na")', cells)).toBe('#DIV/0!');
  });
});

describe('Paket 21 — comparison operators', () => {
  it('splits two-character operators before their prefixes', () => {
    expect(findBinaryOperator('n <= 1')).toEqual({ op: '<=', left: 'n', right: '1' });
    expect(findBinaryOperator('n >= 1')).toEqual({ op: '>=', left: 'n', right: '1' });
    expect(findBinaryOperator('a <> b')).toEqual({ op: '<>', left: 'a', right: 'b' });
    expect(findBinaryOperator('a < b')).toEqual({ op: '<', left: 'a', right: 'b' });
    expect(findBinaryOperator('a = b')).toEqual({ op: '=', left: 'a', right: 'b' });
  });

  it('evaluates every comparison operator', () => {
    expect(evaluate('=1<=2', {})).toBe(true);
    expect(evaluate('=2<=2', {})).toBe(true);
    expect(evaluate('=3<=2', {})).toBe(false);
    expect(evaluate('=3>=2', {})).toBe(true);
    expect(evaluate('=1>=2', {})).toBe(false);
    expect(evaluate('=1<>2', {})).toBe(true);
    expect(evaluate('=2<>2', {})).toBe(false);
    expect(evaluate('=1<2', {})).toBe(true);
    expect(evaluate('=1>2', {})).toBe(false);
    expect(evaluate('=2=2', {})).toBe(true);
  });

  it('drives IF with the fixed operators', () => {
    const cells = grid({ A1: { value: 10 } });
    expect(evaluate('=IF(A1<=10, "kleiner-gleich", "groesser")', cells)).toBe('kleiner-gleich');
    expect(evaluate('=IF(A1>=10, "groesser-gleich", "kleiner")', cells)).toBe('groesser-gleich');
    expect(evaluate('=IF(A1<>10, "anders", "gleich")', cells)).toBe('gleich');
    expect(evaluate('=IF(A1>10, "groesser", "nicht groesser")', cells)).toBe('nicht groesser');
  });
});

describe('Paket 21 — recursion limits for nested functions', () => {
  it('bounds deeply nested IF expressions with a typed error', () => {
    const depth = 400;
    const nested = `${'IF(TRUE, '.repeat(depth)}1${')'.repeat(depth)}`;
    let result: unknown;
    expect(() => {
      result = evaluate(`=${nested}`);
    }).not.toThrow();
    expect(result).toBe('#CALC!');
  });

  it('still evaluates nesting up to the documented limit', () => {
    const depth = 20;
    const nested = `${'IF(TRUE, '.repeat(depth)}7${')'.repeat(depth)}`;
    expect(evaluate(`=${nested}`)).toBe(7);
  });

  it('honours a caller-supplied lower nesting budget', () => {
    const nested = `${'IF(TRUE, '.repeat(30)}7${')'.repeat(30)}`;
    expect(evaluate(`=${nested}`)).toBe(7);
    expect(evaluate(`=${nested}`, {}, { limits: { ...GRID_FORMULA_LIMITS, maxRecursionDepth: 8 } })).toBe('#CALC!');
  });

  it('bounds the evaluation step budget', () => {
    const cells = grid({ A1: { value: 1 } });
    expect(evaluate('=SUM(A1)', cells)).toBe(1);
    expect(evaluate('=SUM(A1)', cells, { limits: { ...GRID_FORMULA_LIMITS, maxEvaluationSteps: 2 } })).toBe('#CALC!');
  });
});
