// STATUS: DIAMANT VGT SUPREME
// SUM/AVERAGE over the canonical reference path: Paket 20 (AST-0336..0340 backend).
//
// The central counter-check is that a range containing formula cells must be summed
// through the same resolution path as direct cell references. The previous
// implementation read the *cached* cell value for range arguments, so `=SUM(A1:A3)`
// disagreed with `=A1+A2+A3`.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';
import { GRID_FORMULA_LIMITS } from '../../formulas/gridFormulaLimits';

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

describe('Paket 20 — the acceptance scenario', () => {
  it('computes =SUM(B2:B9) from the formula bar path', () => {
    const cells = grid({
      B2: { value: 10 },
      B3: { value: 20 },
      B4: { value: 30 },
      B5: { value: 40 },
      B6: { value: 50 },
      B7: { value: 60 },
      B8: { value: 70 },
      B9: { value: 80 },
    });
    expect(evaluate('=SUM(B2:B9)', cells)).toBe(360);
    expect(evaluate('=AVERAGE(B2:B9)', cells)).toBe(45);
  });

  it('ignores empty cells inside the range', () => {
    const cells = grid({ B2: { value: 10 }, B5: { value: 30 } });
    expect(evaluate('=SUM(B2:B9)', cells)).toBe(40);
    expect(evaluate('=AVERAGE(B2:B9)', cells)).toBe(20);
    expect(evaluate('=COUNT(B2:B9)', cells)).toBe(2);
    expect(evaluate('=COUNTA(B2:B9)', cells)).toBe(2);
  });
});

describe('Paket 20 — one canonical reference resolution', () => {
  it('sums formula cells through evaluation, not through their cached value', () => {
    const cells = grid({
      A1: { value: 10 },
      A2: { formula: '=B1 * 2' },
      A3: { value: 30 },
      B1: { value: 5 },
    });
    // Legacy behaviour: the range branch read `cells[coord].value`, which is empty for
    // A2, so the range sum was 40 while the arithmetic sum was 50.
    const legacyCachedSum = ['A1', 'A2', 'A3'].reduce((total, coord) => {
      const numeric = Number(cells[coord]?.value);
      return Number.isNaN(numeric) ? total : total + numeric;
    }, 0);
    expect(legacyCachedSum).toBe(40);

    expect(evaluate('=SUM(A1:A3)', cells)).toBe(50);
    expect(evaluate('=A1+A2+A3', cells)).toBe(50);
    expect(evaluate('=AVERAGE(A1:A3)', cells)).toBeCloseTo(16.666666, 5);
  });

  it('propagates an error cell inside a range instead of skipping it', () => {
    const cells = grid({ A1: { value: 10 }, A2: { formula: '=1/0' }, A3: { value: 30 } });
    expect(evaluate('=SUM(A1:A3)', cells)).toBe('#DIV/0!');
  });

  it('resolves cross-sheet ranges through the same path', () => {
    const sheet1 = grid({ A1: { value: 1 } });
    const sheet2 = grid({ A1: { value: 2 }, A2: { value: 3 } });
    const allSheets = { Sheet1: sheet1, Sheet2: sheet2 };
    expect(evaluateGridFormulaLocal('=SUM(Sheet2!A1:A2)', sheet1, new Set(), allSheets, 'Sheet1')).toBe(5);
    expect(evaluateGridFormulaLocal('=SUM(Sheet1:Sheet2!A1)', sheet1, new Set(), allSheets, 'Sheet1')).toBe(3);
  });
});

describe('Paket 20 — text and type handling in numeric slots', () => {
  const cells = grid({ A1: { value: 10 }, A2: { value: 'kein Text' }, A3: { value: 30 }, A4: { value: true } });

  it('skips text reached through a reference', () => {
    expect(evaluate('=SUM(A1:A3)', cells)).toBe(40);
    expect(evaluate('=AVERAGE(A1:A3)', cells)).toBe(20);
  });

  it('counts only numbers with COUNT and all non-empty values with COUNTA', () => {
    expect(evaluate('=COUNT(A1:A4)', cells)).toBe(2);
    expect(evaluate('=COUNTA(A1:A4)', cells)).toBe(4);
    expect(evaluate('=COUNTBLANK(A1:A3)', cells)).toBe(0);
  });

  it('rejects text literals but accepts numeric text literals', () => {
    expect(evaluate('=SUM("abc")', cells)).toBe('#VALUE!');
    expect(evaluate('=AVERAGE("abc")', cells)).toBe('#VALUE!');
    expect(evaluate('=SUM("5")', cells)).toBe(5);
    expect(evaluate('=SUM(A1, "abc")', cells)).toBe('#VALUE!');
    // COUNT never errors on text.
    expect(evaluate('=COUNT("abc")', cells)).toBe(0);
  });

  it('rejects a text literal inside an array constant', () => {
    expect(evaluate('=SUM({1, "abc"})', cells)).toBe('#VALUE!');
    expect(evaluate('=SUM({1, 2, 3})', cells)).toBe(6);
  });

  it('returns #DIV/0! for an empty AVERAGE and 0 for an empty SUM', () => {
    expect(evaluate('=AVERAGE(A1:A3)', grid({}))).toBe('#DIV/0!');
    expect(evaluate('=SUM(A1:A3)', grid({}))).toBe(0);
    expect(evaluate('=MIN(A1:A3)', grid({}))).toBe(0);
    expect(evaluate('=MAX(A1:A3)', grid({}))).toBe(0);
    expect(evaluate('=PRODUCT(A1:A3)', grid({}))).toBe(0);
  });
});

describe('Paket 20 — aggregates stay bounded', () => {
  it('rejects a range that exceeds the canonical cell budget', () => {
    const cells = grid({ A1: { value: 1 }, A1048576: { value: 2 } });
    const started = Date.now();
    expect(evaluate('=SUM(A:A)', cells)).toBe('#REF!');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('honours a caller-supplied reference budget', () => {
    const cells = grid({ A1: { value: 1 }, A2: { value: 2 }, A3: { value: 3 } });
    expect(evaluate('=SUM(A1:A3)', cells)).toBe(6);
    expect(
      evaluateGridFormulaLocal('=SUM(A1:A3)', cells, new Set(), undefined, 'Sheet1', {}, {
        limits: { ...GRID_FORMULA_LIMITS, maxReferenceCells: 2 },
      }),
    ).toBe('#REF!');
  });

  it('survives a large but legal range', () => {
    const cells: Record<string, GridCell> = {};
    for (let row = 1; row <= 5_000; row++) cells[`A${row}`] = { value: 1 };
    expect(evaluate('=SUM(A1:A5000)', cells)).toBe(5_000);
    expect(evaluate('=AVERAGE(A1:A5000)', cells)).toBe(1);
  });

  it('evaluates SUBTOTAL and AGGREGATE consistently with SUM', () => {
    const cells = grid({ A1: { value: 10 }, A2: { value: 20 }, A3: { value: 30 } });
    expect(evaluate('=SUBTOTAL(9, A1:A3)', cells)).toBe(60);
    expect(evaluate('=SUBTOTAL(1, A1:A3)', cells)).toBe(20);
    expect(evaluate('=AGGREGATE(9, 6, A1:A3)', cells)).toBe(60);
    expect(evaluate('=AGGREGATE(1, 6, A1:A3)', cells)).toBe(20);
  });
});
