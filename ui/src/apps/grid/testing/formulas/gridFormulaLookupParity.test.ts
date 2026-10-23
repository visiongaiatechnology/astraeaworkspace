// STATUS: DIAMANT VGT SUPREME
// XLOOKUP / XMATCH / INDEX / MATCH parity: Paket 22 (AST-0346..0350).
//
// Two defects are counter-checked here:
//   1. exact-match lookups coerced types, so the number 1 matched the text "1";
//   2. approximate lookups returned the *first* value satisfying the inequality instead
//      of the closest one, and INDEX could not read a horizontal vector.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';
import { matchesCriteria } from '../../formulas/gridFormulaMath';
import { formulaStrictEquals } from '../../formulas/gridFormulaExpressionUtils';

function grid(data: Record<string, Partial<GridCell>>): Record<string, GridCell> {
  const result: Record<string, GridCell> = {};
  for (const [coord, cell] of Object.entries(data)) {
    result[coord] = { value: cell.value ?? '', formula: cell.formula };
  }
  return result;
}

function evaluate(formula: string, cells: Record<string, GridCell> = {}): unknown {
  return evaluateGridFormulaLocal(formula, cells);
}

describe('Paket 22 — product table lookup (acceptance scenario)', () => {
  const products = grid({
    A2: { value: 'P-100' },
    A3: { value: 'P-200' },
    A4: { value: 'P-300' },
    B2: { value: 19.9 },
    B3: { value: 29.9 },
    B4: { value: 39.9 },
    D2: { value: 'P-200' },
  });

  it('joins a product row by its unique key with XLOOKUP', () => {
    expect(evaluate('=XLOOKUP(D2, A2:A4, B2:B4)', products)).toBe(29.9);
    expect(evaluate('=XLOOKUP("P-300", A2:A4, B2:B4)', products)).toBe(39.9);
    expect(evaluate('=XLOOKUP("P-100", A2:A4, B2:B4)', products)).toBe(19.9);
  });

  it('handles a missing key in a controlled way', () => {
    expect(evaluate('=XLOOKUP("P-999", A2:A4, B2:B4)', products)).toBe('#N/A');
    expect(evaluate('=XLOOKUP("P-999", A2:A4, B2:B4, "nicht gefunden")', products)).toBe('nicht gefunden');
    expect(evaluate('=IFNA(XLOOKUP("P-999", A2:A4, B2:B4), "nicht gefunden")', products)).toBe('nicht gefunden');
  });

  it('supports INDEX/MATCH as an equivalent join', () => {
    expect(evaluate('=INDEX(B2:B4, MATCH(D2, A2:A4, 0))', products)).toBe(29.9);
    expect(evaluate('=INDEX(B2:B4, MATCH("P-999", A2:A4, 0))', products)).toBe('#N/A');
    expect(evaluate('=IFERROR(INDEX(B2:B4, MATCH("P-999", A2:A4, 0)), 0)', products)).toBe(0);
  });
});

describe('Paket 22 — INDEX vector and whole row/column forms', () => {
  const cells = grid({
    A1: { value: 10 },
    B1: { value: 20 },
    C1: { value: 30 },
    A2: { value: 40 },
    B2: { value: 50 },
    C2: { value: 60 },
    A3: { value: 70 },
    B3: { value: 80 },
    C3: { value: 90 },
  });

  it('reads the n-th element of a horizontal vector', () => {
    // Old behaviour: INDEX(A1:C1, 2) resolved against the row axis and returned #REF!.
    expect(evaluate('=INDEX(A1:C1, 1)', cells)).toBe(10);
    expect(evaluate('=INDEX(A1:C1, 2)', cells)).toBe(20);
    expect(evaluate('=INDEX(A1:C1, 3)', cells)).toBe(30);
    expect(evaluate('=INDEX(A1:C1, 4)', cells)).toBe('#REF!');
  });

  it('reads the n-th element of a vertical vector', () => {
    expect(evaluate('=INDEX(A1:A3, 1)', cells)).toBe(10);
    expect(evaluate('=INDEX(A1:A3, 3)', cells)).toBe(70);
    expect(evaluate('=INDEX(A1:A3, 4)', cells)).toBe('#REF!');
    expect(evaluate('=INDEX(A1:A3, 0)', cells)).toEqual([[10], [40], [70]]);
  });

  it('returns whole rows and columns for an index of zero', () => {
    expect(evaluate('=INDEX(A1:C3, 2, 0)', cells)).toEqual([[40, 50, 60]]);
    expect(evaluate('=INDEX(A1:C3, 0, 2)', cells)).toEqual([[20], [50], [80]]);
    expect(evaluate('=INDEX(A1:C3, 0, 0)', cells)).toEqual([
      [10, 20, 30],
      [40, 50, 60],
      [70, 80, 90],
    ]);
  });

  it('validates indices and reports #REF! for out-of-range access', () => {
    expect(evaluate('=INDEX(A1:C3, 4, 1)', cells)).toBe('#REF!');
    expect(evaluate('=INDEX(A1:C3, 1, 4)', cells)).toBe('#REF!');
    expect(evaluate('=INDEX(A1:C3, 0, 4)', cells)).toBe('#REF!');
    expect(evaluate('=INDEX(A1:C3, 0)', cells)).toEqual([
      [10, 20, 30],
      [40, 50, 60],
      [70, 80, 90],
    ]);
  });
});

describe('Paket 22 — exact matching is type-strict', () => {
  it('does not coerce between numbers and text', () => {
    expect(formulaStrictEquals(1, 1)).toBe(true);
    expect(formulaStrictEquals(1, '1')).toBe(false);
    expect(formulaStrictEquals('a', 'A')).toBe(true);
    expect(formulaStrictEquals(true, 1)).toBe(false);
    // `matchesCriteria` intentionally does coerce; the lookups must not use it.
    expect(matchesCriteria('1', 1)).toBe(true);

    expect(evaluate('=MATCH(1, {"1", "2"}, 0)')).toBe('#N/A');
    expect(evaluate('=MATCH("1", {"1", "2"}, 0)')).toBe(1);
    expect(evaluate('=XMATCH(1, {"1", "2"})')).toBe('#N/A');
    expect(evaluate('=XLOOKUP(1, {"1", "2"}, {"a", "b"}, "miss")')).toBe('miss');
    expect(evaluate('=XLOOKUP("1", {"1", "2"}, {"a", "b"}, "miss")')).toBe('a');
  });

  it('matches numbers and booleans of the same type', () => {
    expect(evaluate('=MATCH(20, {10, 20, 30}, 0)')).toBe(2);
    expect(evaluate('=MATCH(25, {10, 20, 30}, 0)')).toBe('#N/A');
    expect(evaluate('=XMATCH(TRUE, {TRUE, FALSE})')).toBe(1);
  });

  it('supports wildcards in XLOOKUP and XMATCH match mode 2', () => {
    expect(evaluate('=XLOOKUP("P-2*", {"P-100", "P-200"}, {1, 2}, "miss", 2)')).toBe(2);
    expect(evaluate('=XMATCH("P-?00", {"P-100", "P-200", "X"}, 2)')).toBe(1);
    expect(evaluate('=XMATCH("ZZ*", {"P-100"}, 2)')).toBe('#N/A');
  });

  it('honours the search direction for exact matches', () => {
    expect(evaluate('=XMATCH("a", {"a", "b", "a"})')).toBe(1);
    expect(evaluate('=XMATCH("a", {"a", "b", "a"}, 0, -1)')).toBe(3);
    expect(evaluate('=XLOOKUP("a", {"a", "b", "a"}, {10, 20, 30})')).toBe(10);
    expect(evaluate('=XLOOKUP("a", {"a", "b", "a"}, {10, 20, 30}, "miss", 0, -1)')).toBe(30);
  });
});

describe('Paket 22 — approximate matches pick the closest value', () => {
  it('returns the largest value <= the lookup', () => {
    // Old behaviour: the first value satisfying the inequality won, so {10,30,20} with
    // match mode -1 returned 10 instead of 20.
    expect(evaluate('=XLOOKUP(25, {10, 20, 30}, {"a", "b", "c"}, "none", -1)')).toBe('b');
    expect(evaluate('=XLOOKUP(25, {10, 30, 20}, {"a", "b", "c"}, "none", -1)')).toBe('c');
    expect(evaluate('=XLOOKUP(5, {10, 20, 30}, {"a", "b", "c"}, "none", -1)')).toBe('none');
    expect(evaluate('=XMATCH(25, {10, 20, 30}, -1)')).toBe(2);
    expect(evaluate('=XMATCH(5, {10, 20, 30}, -1)')).toBe('#N/A');
  });

  it('returns the smallest value >= the lookup', () => {
    expect(evaluate('=XLOOKUP(25, {10, 20, 30}, {"a", "b", "c"}, "none", 1)')).toBe('c');
    expect(evaluate('=XLOOKUP(25, {30, 10, 20}, {"a", "b", "c"}, "none", 1)')).toBe('a');
    expect(evaluate('=XLOOKUP(99, {10, 20, 30}, {"a", "b", "c"}, "none", 1)')).toBe('none');
    expect(evaluate('=XMATCH(25, {10, 20, 30}, 1)')).toBe(3);
    expect(evaluate('=XMATCH(5, {10, 20, 30}, 1)')).toBe(1);
  });

  it('prefers an exact hit in an approximate mode', () => {
    expect(evaluate('=XLOOKUP(20, {10, 20, 30}, {"a", "b", "c"}, "none", -1)')).toBe('b');
    expect(evaluate('=XLOOKUP(20, {10, 20, 30}, {"a", "b", "c"}, "none", 1)')).toBe('b');
    expect(evaluate('=XMATCH(20, {10, 20, 30}, -1)')).toBe(2);
  });

  it('uses the same closest-match rule for MATCH', () => {
    expect(evaluate('=MATCH(25, {10, 20, 30}, 1)')).toBe(2);
    expect(evaluate('=MATCH(25, {10, 30, 20}, 1)')).toBe(3);
    expect(evaluate('=MATCH(5, {10, 20, 30}, 1)')).toBe('#N/A');
    expect(evaluate('=MATCH(25, {30, 20, 10}, -1)')).toBe(1);
    expect(evaluate('=MATCH(5, {10, 20, 30}, -1)')).toBe(1);
  });

  it('rejects an unknown match mode instead of guessing', () => {
    expect(evaluate('=XLOOKUP(1, {1}, {1}, "n", 7)')).toBe('#VALUE!');
    expect(evaluate('=XMATCH(1, {1}, 7)')).toBe('#VALUE!');
  });
});

describe('Paket 22 — argument validation', () => {
  it('requires the documented minimum arguments', () => {
    expect(evaluate('=XLOOKUP("a", {"a"})')).toBe('#VALUE!');
    expect(evaluate('=XMATCH("a")')).toBe('#VALUE!');
    expect(evaluate('=MATCH("a")')).toBe('#VALUE!');
    expect(evaluate('=INDEX()')).toBe('#VALUE!');
    expect(evaluate('=VLOOKUP("a", {"a"}, 2, FALSE)')).toBe('#REF!');
  });

  it('falls back to #N/A when the return vector is shorter than the lookup vector', () => {
    expect(evaluate('=XLOOKUP("c", {"a", "b", "c"}, {1, 2}, "short")')).toBe('short');
  });
});
