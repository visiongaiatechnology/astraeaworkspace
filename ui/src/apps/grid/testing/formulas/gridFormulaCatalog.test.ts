// STATUS: DIAMANT VGT SUPREME
// Function catalogue, formula-bar autocomplete and the function assistant:
// Pakete 20 and 29 (AST-0336, AST-0381..0385).

import { describe, expect, it } from 'vitest';
import {
  GRID_FORMULA_FUNCTIONS,
  buildFormulaCall,
  formulaFunctionSignature,
  getFormulaFunctionEntry,
  isKnownFormulaFunction,
  listFormulaFunctionCategories,
  listFormulaFunctions,
  suggestFormulaFunctions,
  validateFormulaFunctionArity,
} from '../../formulas/gridFormulaCatalog';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';

describe('Paket 20 — SUM/AVERAGE autocomplete', () => {
  it('suggests the aggregate functions for their prefixes', () => {
    const sumSuggestions = suggestFormulaFunctions('SU', 8).map((entry) => entry.name);
    expect(sumSuggestions[0]).toBe('SUM');
    expect(sumSuggestions).toEqual(expect.arrayContaining(['SUM', 'SUMIF', 'SUMIFS', 'SUBTOTAL']));

    const averageSuggestions = suggestFormulaFunctions('AVER', 5).map((entry) => entry.name);
    // Closest completion first; `DAVERAGE` also contains the query.
    expect(averageSuggestions.slice(0, 3)).toEqual(['AVERAGE', 'AVERAGEIF', 'AVERAGEIFS']);
    expect(averageSuggestions).toContain('DAVERAGE');
  });

  it('is case-insensitive and ranks exact matches first', () => {
    expect(suggestFormulaFunctions('average')[0].name).toBe('AVERAGE');
    expect(suggestFormulaFunctions('Average')[0].name).toBe('AVERAGE');
    const contains = suggestFormulaFunctions('VERA', 3).map((entry) => entry.name);
    expect(contains[0]).toBe('AVERAGE');
  });

  it('returns the whole catalogue for an empty query and clamps the limit', () => {
    expect(suggestFormulaFunctions('', 500).length).toBe(GRID_FORMULA_FUNCTIONS.length);
    expect(suggestFormulaFunctions('')).toHaveLength(8);
    expect(suggestFormulaFunctions('', 3)).toHaveLength(3);
    expect(suggestFormulaFunctions('A', 0)).toEqual([]);
    expect(suggestFormulaFunctions('A', 1_000).length).toBeLessThanOrEqual(500);
  });

  it('documents SUM and AVERAGE with parameter metadata', () => {
    const sum = getFormulaFunctionEntry('sum');
    expect(sum?.category).toBe('math');
    expect(sum?.minArgs).toBe(1);
    expect(sum?.maxArgs).toBeNull();
    expect(formulaFunctionSignature(sum!)).toBe('SUM(number1; [number2, ...])');

    const average = getFormulaFunctionEntry('AVERAGE');
    expect(average?.category).toBe('statistics');
    expect(average?.dynamicArrayResult).toBe(false);
    expect(getFormulaFunctionEntry('NOT_A_FUNCTION')).toBeNull();
    expect(isKnownFormulaFunction('average')).toBe(true);
  });

  it('keeps the catalogue internally consistent', () => {
    const names = GRID_FORMULA_FUNCTIONS.map((entry) => entry.name);
    expect([...names].sort()).toEqual(names);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of GRID_FORMULA_FUNCTIONS) {
      const required = entry.parameters.filter((parameter) => parameter.required).length;
      expect(required, `${entry.name} required-vs-minArgs`).toBe(entry.minArgs);
      if (entry.maxArgs !== null) {
        expect(entry.maxArgs, `${entry.name} maxArgs >= minArgs`).toBeGreaterThanOrEqual(entry.minArgs);
        expect(entry.parameters.length).toBeLessThanOrEqual(entry.maxArgs);
      }
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it('covers every category the assistant groups by', () => {
    const categories = listFormulaFunctionCategories();
    expect(categories).toEqual([...categories].sort());
    expect(categories).toEqual([
      'array',
      'date',
      'financial',
      'information',
      'logical',
      'lookup',
      'math',
      'statistics',
      'text',
    ]);
    expect(listFormulaFunctions('math').every((entry) => entry.category === 'math')).toBe(true);
  });
});

describe('Paket 20 — SUM and AVERAGE evaluation end to end', () => {
  it('computes the acceptance scenario =SUM(B2:B9)', () => {
    const cells = {
      B2: { value: 10 },
      B3: { value: 20 },
      B4: { value: 30 },
      B5: { value: 40 },
      B6: { value: 50 },
      B7: { value: 60 },
      B8: { value: 70 },
      B9: { value: 80 },
    };
    expect(evaluateGridFormulaLocal('=SUM(B2:B9)', cells)).toBe(360);
    expect(evaluateGridFormulaLocal('=AVERAGE(B2:B9)', cells)).toBe(45);
  });
});

describe('Paket 29 — function assistant formula assembly', () => {
  it('validates arity before assembly', () => {
    expect(validateFormulaFunctionArity('SUM', 1)).toBeNull();
    expect(validateFormulaFunctionArity('SUM', 0)?.code).toBe('#VALUE!');
    expect(validateFormulaFunctionArity('XLOOKUP', 2)?.code).toBe('#VALUE!');
    expect(validateFormulaFunctionArity('XLOOKUP', 6)).toBeNull();
    expect(validateFormulaFunctionArity('XLOOKUP', 7)?.code).toBe('#VALUE!');
    expect(validateFormulaFunctionArity('NOT_A_FUNCTION', 1)?.code).toBe('#NAME?');
  });

  it('assembles a valid formula from assistant input', () => {
    const assembled = buildFormulaCall('XLOOKUP', ['A2', 'B2:B9', 'C2:C9']);
    expect(assembled.violation).toBeNull();
    expect(assembled.formula).toBe('=XLOOKUP(A2, B2:B9, C2:C9)');
    // The assembled text must be evaluable, not just well-shaped.
    expect(
      evaluateGridFormulaLocal(assembled.formula, {
        A2: { value: 'P-2' },
        B2: { value: 'P-1' },
        B3: { value: 'P-2' },
        C2: { value: 'Schraube' },
        C3: { value: 'Mutter' },
      }),
    ).toBe('Mutter');
  });

  it('omits trailing blank optional arguments but keeps interior blanks', () => {
    expect(buildFormulaCall('SUM', ['A1:A3', '']).formula).toBe('=SUM(A1:A3)');
    expect(buildFormulaCall('IF', ['A1>0', '', '"n"']).formula).toBe('=IF(A1>0, , "n")');
    expect(buildFormulaCall('IF', ['A1>0', '"y"']).formula).toBe('=IF(A1>0, "y")');
  });

  it('reports the arity violation it found alongside the assembled text', () => {
    const assembled = buildFormulaCall('XLOOKUP', ['A2', 'B2:B9']);
    expect(assembled.violation?.code).toBe('#VALUE!');
    expect(assembled.violation?.expected).toContain('XLOOKUP(');
    expect(assembled.formula).toBe('=XLOOKUP(A2, B2:B9)');
  });

  it('refuses to build an over-long formula', () => {
    const assembled = buildFormulaCall('CONCAT', Array.from({ length: 20 }, () => 'A'.repeat(1_000)), {
      maxLength: 1_000,
    });
    expect(assembled.formula).toBe('#CALC!');
    expect(assembled.violation?.code).toBe('#CALC!');
  });

  it('assembles formulas for every documented function without throwing', () => {
    for (const entry of GRID_FORMULA_FUNCTIONS) {
      const args = entry.parameters.map(() => '1');
      const assembled = buildFormulaCall(entry.name, args);
      expect(assembled.formula.startsWith(`=${entry.name}(`), `${entry.name} prefix`).toBe(true);
      expect(assembled.violation, `${entry.name} arity`).toBeNull();
    }
  });
});
