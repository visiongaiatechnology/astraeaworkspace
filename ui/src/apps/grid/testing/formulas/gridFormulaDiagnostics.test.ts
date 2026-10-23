// STATUS: DIAMANT VGT SUPREME
// Typed error diagnosis for the raster: Paket 28 (AST-0376..0380).
//
// The raster needs three things from the engine: a stable error code, a human
// explanation with a hint, and the reference path for trace arrows. All three are
// asserted here against hand-written expectations.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import { FORMULA_ERRORS, type FormulaError } from '../../formulas/gridFormulaTypes';
import {
  GRID_FORMULA_ERROR_DOCS,
  buildGridFormulaReferenceArrows,
  describeFormulaError,
  diagnoseFormula,
  formulaErrorTypeCode,
  isKnownFormulaErrorCode,
  scanFormulaCallSites,
  stripFormulaStringLiterals,
  summarizeFormulaDiagnostics,
} from '../../formulas/gridFormulaDiagnostics';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';

function grid(data: Record<string, Partial<GridCell>>): Record<string, GridCell> {
  const result: Record<string, GridCell> = {};
  for (const [coord, cell] of Object.entries(data)) {
    result[coord] = { value: cell.value ?? '', formula: cell.formula };
  }
  return result;
}

describe('Paket 28 — error documentation is exhaustive', () => {
  it('documents every typed error code the project can emit', () => {
    for (const code of FORMULA_ERRORS) {
      const documented = GRID_FORMULA_ERROR_DOCS[code as FormulaError];
      expect(documented, `missing documentation for ${code}`).toBeDefined();
      expect(documented.title.length).toBeGreaterThan(0);
      expect(documented.message.length).toBeGreaterThan(0);
      expect(documented.hint.length).toBeGreaterThan(0);
    }
    expect(Object.keys(GRID_FORMULA_ERROR_DOCS).sort()).toEqual([...FORMULA_ERRORS].sort());
  });

  it('describes known errors and ignores non-errors', () => {
    const diagnostic = describeFormulaError('#REF!');
    expect(diagnostic?.code).toBe('#REF!');
    expect(diagnostic?.severity).toBe('error');
    expect(diagnostic?.hint).toContain('Bezuege');
    expect(describeFormulaError(42)).toBeNull();
    expect(describeFormulaError('normal text')).toBeNull();
    expect(describeFormulaError(null)).toBeNull();
    expect(isKnownFormulaErrorCode('#SPILL!')).toBe(true);
    expect(isKnownFormulaErrorCode('#NOPE!')).toBe(false);
  });

  it('maps every error to a unique numeric ERROR.TYPE code', () => {
    expect(formulaErrorTypeCode('#NULL!')).toBe(1);
    expect(formulaErrorTypeCode('#DIV/0!')).toBe(2);
    expect(formulaErrorTypeCode('#VALUE!')).toBe(3);
    expect(formulaErrorTypeCode('#REF!')).toBe(4);
    expect(formulaErrorTypeCode('#NAME?')).toBe(5);
    expect(formulaErrorTypeCode('#NUM!')).toBe(6);
    expect(formulaErrorTypeCode('#N/A')).toBe(7);
    expect(formulaErrorTypeCode('#SPILL!')).toBe(8);
    expect(formulaErrorTypeCode('#CALC!')).toBe(9);
    expect(formulaErrorTypeCode('#CIRCULAR!')).toBe(10);
    expect(formulaErrorTypeCode('not an error')).toBe(0);
  });

  it('evaluates ERROR.TYPE through the engine for the dynamic-array codes', () => {
    expect(evaluateGridFormulaLocal('=ERROR.TYPE(NA())', {})).toBe(7);
    expect(evaluateGridFormulaLocal('=ERROR.TYPE("#SPILL!")', {})).toBe(8);
    expect(evaluateGridFormulaLocal('=ERROR.TYPE("#CIRCULAR!")', {})).toBe(10);
  });
});

describe('Paket 28 — static diagnosis', () => {
  it('strips string literals before inspecting references', () => {
    expect(stripFormulaStringLiterals('="A1" & A2')).toBe('=     & A2');
    expect(stripFormulaStringLiterals('="a""b" + C3')).toBe('=     + C3');
    expect(scanFormulaCallSites('=SUM(A1, IF(B1,C1,D1))').map((site) => [site.name, site.argCount])).toEqual([
      ['SUM', 2],
      ['IF', 3],
    ]);
  });

  it('reports unknown functions as #NAME?', () => {
    const findings = diagnoseFormula('=FOOBAR(1, 2)');
    expect(findings.map((finding) => finding.kind)).toContain('unknown-function');
    expect(findings[0].code).toBe('#NAME?');
    expect(findings[0].token).toBe('FOOBAR');
  });

  it('accepts every catalogue function without findings', () => {
    expect(diagnoseFormula('=SUM(A1:B9)')).toEqual([]);
    expect(diagnoseFormula('=AVERAGE(B2:B9)')).toEqual([]);
    expect(diagnoseFormula('=XLOOKUP(A2, B2:B9, C2:C9, "fehlt")')).toEqual([]);
    expect(diagnoseFormula('=IF(A1>0, IF(A1>10, "gross", "klein"), "leer")')).toEqual([]);
    expect(diagnoseFormula('=UNIQUE(A2:A30)')).toEqual([]);
    expect(diagnoseFormula('=LET(x, 1, x + 1)')).toEqual([]);
    expect(diagnoseFormula('=LAMBDA(x, x * 2)(5)')).toEqual([]);
    expect(diagnoseFormula('=WORKDAY(TODAY(), 5)')).toEqual([]);
  });

  it('honours named identifiers and extra functions', () => {
    expect(diagnoseFormula('=MYTOTAL(A1:A3)').map((f) => f.kind)).toEqual(['unknown-function']);
    expect(diagnoseFormula('=MYTOTAL(A1:A3)', { namedIdentifiers: ['MYTOTAL'] })).toEqual([]);
    expect(diagnoseFormula('=CUSTOMFN(1)', { extraFunctions: ['CUSTOMFN'] })).toEqual([]);
  });

  it('reports argument-count violations with the expected signature', () => {
    const findings = diagnoseFormula('=SUM()');
    expect(findings.map((finding) => finding.kind)).toEqual(['argument-count']);
    expect(findings[0].code).toBe('#VALUE!');
    expect(findings[0].hint).toContain('SUM(');
    expect(diagnoseFormula('=XLOOKUP(A1, B1:B9)').map((f) => f.code)).toEqual(['#VALUE!']);
    expect(diagnoseFormula('=XLOOKUP(A1, B1:B9, C1:C9, "x", 0, 1, 9)').map((f) => f.code)).toEqual(['#VALUE!']);
    expect(diagnoseFormula('=AVERAGE()').map((f) => f.code)).toEqual(['#VALUE!']);
  });

  it('reports references outside the raster as #REF!', () => {
    const findings = diagnoseFormula('=XFE1 + 1');
    expect(findings.map((finding) => finding.kind)).toEqual(['invalid-reference']);
    expect(findings[0].code).toBe('#REF!');
    expect(findings[0].token).toBe('XFE1');
    expect(diagnoseFormula('=A1048577').map((f) => f.kind)).toEqual(['invalid-reference']);
    expect(diagnoseFormula('=A1048576').map((f) => f.kind)).toEqual([]);
  });

  it('reports structural problems', () => {
    expect(diagnoseFormula('=SUM(A1').map((f) => f.kind)).toContain('unbalanced-parentheses');
    expect(diagnoseFormula('="abc').map((f) => f.kind)).toContain('unterminated-string');
    expect(diagnoseFormula(`=${'A'.repeat(17_000)}`).map((f) => f.kind)).toEqual(['formula-too-long']);
    expect(diagnoseFormula('   ').map((f) => f.kind)).toEqual(['empty-formula']);
    expect(diagnoseFormula('plain text')).toEqual([]);
  });

  it('reports an error literal that survived a deletion', () => {
    const findings = diagnoseFormula('=#REF! + 1');
    expect(findings.map((finding) => finding.kind)).toEqual(['error-value']);
    expect(findings[0].code).toBe('#REF!');
  });

  it('reports a direct self reference as #CIRCULAR!', () => {
    const cells = grid({ A1: { formula: '=A1 + 1' } });
    const findings = diagnoseFormula('=A1 + 1', { coord: 'A1', cells });
    expect(findings.map((finding) => finding.kind)).toContain('circular-reference');
    expect(findings[0].code).toBe('#CIRCULAR!');
    expect(diagnoseFormula('=A1 + 1', { coord: 'B1', cells })).toEqual([]);
  });

  it('never reports a finding for a formula the engine evaluates to a number', () => {
    const cells = grid({ B2: { value: 1 }, B3: { value: 2 }, B9: { value: 3 } });
    const result = evaluateGridFormulaLocal('=SUM(B2:B9)', cells);
    expect(result).toBe(6);
    expect(diagnoseFormula('=SUM(B2:B9)', { coord: 'C1', cells })).toEqual([]);
  });

  it('summarises diagnostics for screen readers', () => {
    expect(summarizeFormulaDiagnostics([])).toBe('');
    const text = summarizeFormulaDiagnostics(diagnoseFormula('=FOOBAR(1)', { coord: 'D4' }));
    expect(text).toContain('D4');
    expect(text).toContain('FOOBAR');
    expect(text).toContain('Hinweis');
  });
});

describe('Paket 28 — reference arrows for the raster', () => {
  it('returns precedents and dependents as bounded arrows', () => {
    const cells = grid({
      A1: { value: 1 },
      B1: { formula: '=A1 + 1' },
      C1: { formula: '=B1 + 1' },
      D1: { value: 9 },
    });
    const arrows = buildGridFormulaReferenceArrows('B1', cells);
    expect(arrows.coord).toBe('B1');
    expect(arrows.arrows).toEqual([
      { from: 'A1', to: 'B1', kind: 'precedent' },
      { from: 'B1', to: 'C1', kind: 'dependent' },
    ]);
    expect(arrows.truncated).toBe(false);
    expect(buildGridFormulaReferenceArrows('D1', cells).arrows).toEqual([]);
  });

  it('marks truncation instead of returning an unbounded list', () => {
    const cells: Record<string, GridCell> = { A1: { value: 1 } };
    for (let index = 0; index < 50; index++) cells[`B${index + 1}`] = { value: '', formula: '=A1' };
    const arrows = buildGridFormulaReferenceArrows('A1', cells, {
      maxFormulaLength: 16 * 1024,
      maxReferenceCells: 50_000,
      maxArrayCells: 50_000,
      maxSpillCells: 50_000,
      maxEvaluationSteps: 250_000,
      maxEvaluationTimeMs: 250,
      maxRecursionDepth: 128,
      maxCellChainDepth: 10_000,
      maxIterations: 1_000,
      maxDependencyNodes: 5,
      maxReportedCycles: 64,
      maxDateSpanDays: 1_000,
    });
    expect(arrows.arrows.length).toBe(5);
    expect(arrows.truncated).toBe(true);
  });
});
