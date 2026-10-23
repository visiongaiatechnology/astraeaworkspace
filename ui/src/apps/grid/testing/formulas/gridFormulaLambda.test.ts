// STATUS: DIAMANT VGT SUPREME
// LET/LAMBDA scope, arity and recursion: Paket 26 (AST-0366..0370).
//
// The old dispatcher accepted any parameter list and silently returned a raw parameter
// name when the arity did not match. Every wrong-arity case below therefore also states
// what used to happen, so the fix is provable.

import { describe, expect, it } from 'vitest';
import {
  bindLambdaParameters,
  invokeLambda,
  parseLambda,
  resolveLambdaArgument,
  resolveNamedLambda,
  splitImmediateLambdaCall,
  validateLambdaArity,
} from '../../formulas/gridFormulaLambda';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';
import type { FormulaEngineOptions } from '../../formulas/gridFormulaEngineTypes';

function evaluate(formula: string, options?: FormulaEngineOptions): unknown {
  return evaluateGridFormulaLocal(formula, {}, new Set(), undefined, 'Sheet1', {}, options);
}

describe('Paket 26 — LAMBDA grammar', () => {
  it('parses parameters and the body', () => {
    expect(parseLambda('LAMBDA(x, x * 2)')).toEqual({ parameters: ['X'], body: 'x * 2' });
    expect(parseLambda('lambda(a, b, a + b)')).toEqual({ parameters: ['A', 'B'], body: 'a + b' });
    expect(parseLambda('SUM(1, 2)')).toBeNull();
    expect(parseLambda('LAMBDA(x, x * 2) + 1')).toBeNull();
  });

  it('rejects illegal parameter lists instead of ignoring them', () => {
    expect(parseLambda('LAMBDA()')).toBe('#VALUE!');
    expect(parseLambda('LAMBDA(x)')).toBe('#VALUE!');
    expect(parseLambda('LAMBDA(x, x, x)')).toBe('#VALUE!');
    expect(parseLambda('LAMBDA(A1, 1)')).toBe('#VALUE!');
    expect(parseLambda('LAMBDA(1, x)')).toBe('#VALUE!');
    expect(parseLambda('LAMBDA(x, )')).toBe('#VALUE!');
    expect(parseLambda('LAMBDA(x, x')).toBe('#VALUE!');
  });

  it('splits an immediately-invoked LAMBDA from its call arguments', () => {
    const immediate = splitImmediateLambdaCall('LAMBDA(x, x * 2)(5)');
    expect(typeof immediate).toBe('object');
    if (immediate === null || typeof immediate === 'string') throw new Error('expected a call split');
    expect(immediate.lambda.parameters).toEqual(['X']);
    expect(immediate.callArgs).toEqual(['5']);
    expect(splitImmediateLambdaCall('LAMBDA(x, x * 2)')).toBeNull();
    expect(splitImmediateLambdaCall('SUM(1)(2)')).toBeNull();
  });

  it('resolves named LAMBDAs case-insensitively', () => {
    const parsed = resolveNamedLambda({ double: '=LAMBDA(x, x * 2)' }, 'DOUBLE');
    expect(typeof parsed).toBe('object');
    expect(resolveNamedLambda({ TOTAL: '=SUM(A1:A3)' }, 'TOTAL')).toBeNull();
    expect(resolveNamedLambda(undefined, 'ANY')).toBeNull();
    expect(resolveLambdaArgument('LAMBDA(x, x)', undefined) as unknown).toMatchObject({ parameters: ['X'] });
    expect(resolveLambdaArgument('DOUBLE', { DOUBLE: '=LAMBDA(x, x * 2)' }) as unknown).toMatchObject({ parameters: ['X'] });
    expect(resolveLambdaArgument('NOT_A_LAMBDA', undefined)).toBeNull();
  });

  it('validates arity strictly', () => {
    const parsed = parseLambda('LAMBDA(x, y, x + y)');
    if (parsed === null || typeof parsed === 'string') throw new Error('expected a parse');
    expect(validateLambdaArity(parsed, 2)).toBeNull();
    expect(validateLambdaArity(parsed, 1)).toBe('#VALUE!');
    expect(validateLambdaArity(parsed, 3)).toBe('#VALUE!');
  });

  it('binds parameters into a closed scope without leaking', () => {
    const parsed = parseLambda('LAMBDA(x, x + outer)');
    if (parsed === null || typeof parsed === 'string') throw new Error('expected a parse');
    const scope = bindLambdaParameters(parsed, [1], { OUTER: 41 });
    expect(scope).toEqual({ OUTER: 41, X: 1 });
    expect(bindLambdaParameters(parsed, [], {})).toBe('#VALUE!');
  });

  it('invokes a lambda through the context it is given', () => {
    const parsed = parseLambda('LAMBDA(x, x * 3)');
    if (parsed === null || typeof parsed === 'string') throw new Error('expected a parse');
    const result = invokeLambda(parsed, {
      evaluate: (_expression, variables) => (variables.X as number) * 3,
      variables: {},
      rawArgs: ['7'],
      evaluateArgument: () => 7,
    });
    expect(result).toBe(21);
  });
});

describe('Paket 26 — engine behaviour', () => {
  it('invokes an immediately-invoked LAMBDA', () => {
    expect(evaluate('=LAMBDA(x, x * 2)(5)')).toBe(10);
    expect(evaluate('=LAMBDA(a, b, a + b)(2, 3)')).toBe(5);
    expect(evaluate('=LAMBDA(x, x)(1, 2)')).toBe('#VALUE!');
    expect(evaluate('=LAMBDA(x, x)')).toBe('#CALC!');
  });

  it('evaluates nested LET scopes with earlier bindings visible', () => {
    expect(evaluate('=LET(x, 10, y, 25, x * y)')).toBe(250);
    expect(evaluate('=LET(a, 5, b, LET(c, 3, a * c), a + b)')).toBe(20);
    expect(evaluate('=LET(x, 1, x + 1)')).toBe(2);
  });

  it('rejects illegal LET names and duplicate bindings', () => {
    expect(evaluate('=LET(A1, 5, A1 + 1)')).toBe('#VALUE!');
    expect(evaluate('=LET(x, 1, x, 2, x)')).toBe('#VALUE!');
    expect(evaluate('=LET(2x, 1, 2)')).toBe('#VALUE!');
    expect(evaluate('=LET(x, 1)')).toBe('#VALUE!');
    expect(evaluate('=LET(x, 1, y, 2)')).toBe('#VALUE!');
  });

  it('propagates an error from a LET binding instead of hiding it', () => {
    expect(evaluate('=LET(x, 1/0, 5)')).toBe('#DIV/0!');
  });

  it('invokes named LAMBDAs including recursion', () => {
    const options: FormulaEngineOptions = {
      namedFormulas: { DOUBLE: '=LAMBDA(x, x * 2)', ADD: '=LAMBDA(a, b, a + b)' },
    };
    expect(evaluate('=DOUBLE(21)', options)).toBe(42);
    expect(evaluate('=ADD(20, 22)', options)).toBe(42);
    expect(evaluate('=DOUBLE(1, 2)', options)).toBe('#VALUE!');

    const recursive: FormulaEngineOptions = {
      namedFormulas: { FACT: '=LAMBDA(n, IF(n <= 1, 1, n * FACT(n - 1)))' },
    };
    expect(evaluate('=FACT(5)', recursive)).toBe(120);
    expect(evaluate('=FACT(1)', recursive)).toBe(1);
  });

  it('stops runaway recursion with a typed error instead of a stack overflow', () => {
    const options: FormulaEngineOptions = { namedFormulas: { LOOP: '=LAMBDA(n, LOOP(n))' } };
    const started = Date.now();
    let result: unknown;
    expect(() => {
      result = evaluate('=LOOP(1)', options);
    }).not.toThrow();
    expect(result).toBe('#CALC!');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('rejects a MAP lambda whose parameter count does not match the arrays', () => {
    // The old implementation ignored the second parameter and returned the raw text.
    expect(evaluate('=MAP({1, 2}, LAMBDA(x, y, x))')).toBe('#VALUE!');
    expect(evaluate('=MAP({1, 2}, LAMBDA(x, x * 10))')).toEqual([[10, 20]]);
    expect(evaluate('=MAP({1, 2}, {10, 20}, LAMBDA(a, b, a + b))')).toEqual([[11, 22]]);
    expect(evaluate('=MAP({1, 2}, {10, 20}, LAMBDA(a, a))')).toBe('#VALUE!');
    expect(evaluate('=MAP({1, 2}, {10}, LAMBDA(a, b, a + b))')).toBe('#VALUE!');
  });

  it('enforces arity for REDUCE, SCAN, BYROW and BYCOL', () => {
    expect(evaluate('=REDUCE(0, {1, 2, 3}, LAMBDA(acc, value, acc + value))')).toBe(6);
    expect(evaluate('=REDUCE(0, {1, 2}, LAMBDA(acc, acc))')).toBe('#VALUE!');
    expect(evaluate('=SCAN(0, {1, 2, 3}, LAMBDA(acc, value, acc + value))')).toEqual([[1, 3, 6]]);
    expect(evaluate('=BYROW({1, 2; 3, 4}, LAMBDA(row, SUM(row)))')).toEqual([[3], [7]]);
    expect(evaluate('=BYROW({1, 2}, LAMBDA(a, b, a))')).toBe('#VALUE!');
    expect(evaluate('=BYCOL({1, 2; 3, 4}, LAMBDA(col, SUM(col)))')).toEqual([[4, 6]]);
    expect(evaluate('=BYCOL({1, 2}, LAMBDA(a, b, a))')).toBe('#VALUE!');
  });

  it('accepts a named LAMBDA as a higher-order function argument', () => {
    const options: FormulaEngineOptions = { namedFormulas: { TRIPLE: '=LAMBDA(x, x * 3)' } };
    expect(evaluate('=MAP({1, 2}, TRIPLE)', options)).toEqual([[3, 6]]);
    expect(evaluate('=REDUCE(0, {1, 2}, LAMBDA(acc, v, acc + v))', options)).toBe(3);
    expect(evaluate('=MAP({1, 2}, MISSING)', options)).toBe('#VALUE!');
  });

  it('does not leak a lambda parameter into the surrounding scope', () => {
    expect(evaluate('=LET(x, 100, MAP({1}, LAMBDA(x, x)) + x)')).toBe(101);
  });
});
