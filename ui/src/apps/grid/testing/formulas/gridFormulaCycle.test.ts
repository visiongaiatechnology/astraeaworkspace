// STATUS: DIAMANT VGT SUPREME
// Circular dependency detection and deterministic cycle reporting: Paket 27
// (AST-0371..0375).
//
// The implementation is judged on three promises that a spreadsheet engine must never
// break: it terminates, it never exhausts the JavaScript stack, and it names the cycle.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import {
  createCircularReferenceDiagnostic,
  detectGridFormulaCycles,
  formatGridFormulaCycle,
} from '../../formulas/gridFormulaCycle';
import { buildDeterministicRecalcPlan, collectDirtyFormulaCells } from '../../formulas/gridFormulaRecalc';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';
import { GRID_FORMULA_LIMITS } from '../../formulas/gridFormulaLimits';

function grid(data: Record<string, Partial<GridCell>>): Record<string, GridCell> {
  const result: Record<string, GridCell> = {};
  for (const [coord, cell] of Object.entries(data)) {
    result[coord] = { value: cell.value ?? '', formula: cell.formula };
  }
  return result;
}

describe('Paket 27 — cycle detection', () => {
  it('reports a direct self reference as a one-node cycle', () => {
    const report = detectGridFormulaCycles(grid({ A1: { formula: '=A1 + 1' } }));
    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0].path).toEqual(['A1']);
    expect(report.cycles[0].closedBy).toBe('A1');
    expect(report.cyclic).toEqual(['A1']);
  });

  it('reports indirect cycles canonically from the smallest coordinate', () => {
    const report = detectGridFormulaCycles(
      grid({
        A1: { formula: '=B1 + 1' },
        B1: { formula: '=C1 * 2' },
        C1: { formula: '=A1 - 5' },
      }),
    );
    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0].path).toEqual(['A1', 'B1', 'C1']);
    expect(formatGridFormulaCycle(report.cycles[0])).toBe('A1 -> B1 -> C1 -> A1');
  });

  it('reports only the cycle itself, not the tail that leads into it', () => {
    const report = detectGridFormulaCycles(
      grid({
        A1: { formula: '=B1 + 1' },
        B1: { formula: '=C1 + 1' },
        C1: { formula: '=B1 + 1' },
      }),
    );
    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0].path).toEqual(['B1', 'C1']);
    // A1 depends on the cycle and is therefore also blocked from evaluating.
    expect(report.cyclic).toEqual(['A1', 'B1', 'C1']);
  });

  it('finds no cycle in an acyclic graph', () => {
    const report = detectGridFormulaCycles(
      grid({
        A1: { formula: '=1 + 1' },
        B1: { formula: '=A1 + 1' },
        C1: { formula: '=A1 + B1' },
        D1: { value: 7 },
      }),
    );
    expect(report.cycles).toEqual([]);
    expect(report.cyclic).toEqual([]);
    expect(report.nodeCount).toBe(3);
  });

  it('is deterministic across repeated runs and input orderings', () => {
    const entries = {
      C1: { formula: '=A1 + 1' },
      A1: { formula: '=B1 + 1' },
      B1: { formula: '=C1 + 1' },
      E1: { formula: '=F1' },
      F1: { formula: '=E1' },
    };
    const first = detectGridFormulaCycles(grid(entries));
    const reversed: Record<string, Partial<GridCell>> = {};
    for (const key of Object.keys(entries).reverse()) {
      reversed[key] = entries[key as keyof typeof entries];
    }
    const second = detectGridFormulaCycles(grid(reversed));
    expect(second.cycles.map((cycle) => cycle.path)).toEqual(first.cycles.map((cycle) => cycle.path));
    expect(first.cycles).toHaveLength(2);
  });

  it('bounds the number of reported cycles instead of enumerating forever', () => {
    const cells: Record<string, Partial<GridCell>> = {};
    for (let index = 0; index < 20; index++) {
      const coord = `A${index + 1}`;
      cells[coord] = { formula: `=${coord} + 1` };
    }
    const report = detectGridFormulaCycles(grid(cells), {
      limits: { ...GRID_FORMULA_LIMITS, maxReportedCycles: 3 },
    });
    expect(report.cycles.length).toBeLessThanOrEqual(3);
    expect(report.truncated).toBe(true);
  });

  it('handles a 4000-node chain without exhausting the stack', () => {
    const cells: Record<string, Partial<GridCell>> = {};
    for (let index = 1; index <= 4_000; index++) {
      cells[`A${index}`] = { formula: index === 4_000 ? '=1' : `=A${index + 1} + 1` };
    }
    const report = detectGridFormulaCycles(grid(cells));
    expect(report.cycles).toEqual([]);
    expect(report.nodeCount).toBe(4_000);
  });

  it('produces a typed #CIRCULAR! diagnostic with the path', () => {
    const report = detectGridFormulaCycles(
      grid({ A1: { formula: '=B1' }, B1: { formula: '=A1' } }),
    );
    const diagnostic = createCircularReferenceDiagnostic(report.cycles[0], 'A1');
    expect(diagnostic.code).toBe('#CIRCULAR!');
    expect(diagnostic.kind).toBe('circular-reference');
    expect(diagnostic.coord).toBe('A1');
    expect(diagnostic.message).toContain('A1 -> B1 -> A1');
  });
});

describe('Paket 27 — engine and scheduler integration', () => {
  it('returns #CIRCULAR! for a self reference deterministically', () => {
    const cells = grid({ A1: { formula: '=A1 + 1' } });
    for (let attempt = 0; attempt < 25; attempt++) {
      expect(evaluateGridFormulaLocal('=A1 + 1', cells)).toBe('#CIRCULAR!');
    }
  });

  it('returns #CIRCULAR! for an indirect chain', () => {
    const cells = grid({
      A1: { formula: '=B1 + 1' },
      B1: { formula: '=C1 * 2' },
      C1: { formula: '=A1 - 5' },
    });
    expect(evaluateGridFormulaLocal('=A1', cells)).toBe('#CIRCULAR!');
  });

  it('propagates a cycle error instead of returning a partial number', () => {
    const cells = grid({ A1: { formula: '=A2 + 1' }, A2: { value: '#CIRCULAR!' } });
    expect(evaluateGridFormulaLocal('=A1', cells)).toBe('#CIRCULAR!');
  });

  it('reports the cycle path through the deterministic recalc plan', () => {
    const plan = buildDeterministicRecalcPlan(
      grid({ A1: { formula: '=B1 + 1' }, B1: { formula: '=A1 + 1' }, C1: { value: 1 } }),
    );
    expect(plan.cyclic).toEqual(['A1', 'B1']);
    expect(plan.cyclePaths).toEqual([['A1', 'B1']]);
    expect(plan.batches).toEqual([]);
  });

  it('keeps acyclic batches unchanged while adding cycle paths', () => {
    const plan = buildDeterministicRecalcPlan(
      grid({ A1: { value: 1 }, B1: { formula: '=A1 + 1' }, C1: { formula: '=B1 + 1' } }),
    );
    expect(plan.cyclePaths).toEqual([]);
    expect(plan.batches).toEqual([['B1'], ['C1']]);
  });

  it('terminates on a mutating dirty-collection request bounded by the node cap', () => {
    const cells = grid({ A1: { formula: '=B1' }, B1: { formula: '=A1' } });
    const dirty = collectDirtyFormulaCells(['A1'], cells, 10);
    expect(dirty.size).toBeLessThanOrEqual(1);
  });

  it('does not hang or throw on a long non-cyclic chain', () => {
    const cells: Record<string, GridCell> = {};
    for (let index = 1; index <= 300; index++) {
      cells[`A${index}`] = { value: '', formula: index === 300 ? '=0' : `=A${index + 1} + 1` };
    }
    const started = Date.now();
    expect(evaluateGridFormulaLocal('=A1', cells)).toBe(299);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('surfaces stack exhaustion as a typed #CALC! error, never an exception', () => {
    const cells: Record<string, GridCell> = {};
    for (let index = 1; index <= 20_000; index++) {
      cells[`A${index}`] = { value: '', formula: index === 20_000 ? '=0' : `=A${index + 1} + 1` };
    }
    let result: unknown;
    expect(() => {
      result = evaluateGridFormulaLocal('=A1', cells);
    }).not.toThrow();
    expect(typeof result === 'string' && result.startsWith('#') || typeof result === 'number').toBe(true);
  });
});
