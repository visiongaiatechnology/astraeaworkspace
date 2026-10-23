// STATUS: PLATIN
// Counter-checks for Grid Paket 44 — What-if Goal Seek (AST-0456 Frontend/UX + budget hardening).
//
// Hand-written oracle: "Gesuchte Zielgröße durch Zellvariation finden, Ergebnis und Grenzen erklären."
// The formula core is stubbed, so the *search* contract is what is measured: named validation
// failures, a bounded evaluation count, deterministic termination and an honest stop reason.
import { describe, expect, it, vi } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/grid/workspaceGrid';

vi.mock('../../formulas/formula', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../formulas/formula')>();
  return {
    ...actual,
    evaluateFormula: async (formula: string, cells: Record<string, GridCell>) => {
      const normalized = formula.replace(/\s+/gu, '').toUpperCase();
      if (normalized === '=A1*5') return Number(cells.A1?.value ?? 0) * 5;
      if (normalized === '=A1+1000') return Number(cells.A1?.value ?? 0) + 1000;
      if (normalized === '=A1*A1+1000') return Number(cells.A1?.value ?? 0) ** 2 + 1000;
      if (normalized === '=TEXTONLY') return '#VALUE!';
      return '#VALUE!';
    },
  };
});

import { executeGoalSeek } from '../../what-if/gridGoalSeek';

const SOLVABLE: Record<string, GridCell> = {
  A1: { value: 1 },
  B1: { formula: '=A1*5', value: 5 },
};

describe('Grid goal seek: the reference scenario still converges (AST-0456)', () => {
  it('finds the changing value and reports the reached target with its evaluation count', async () => {
    const result = await executeGoalSeek({ setCell: 'B1', targetValue: 100, byChangingCell: 'A1', maxIterations: 100, tolerance: 0.0001 }, SOLVABLE);
    expect(result.success).toBe(true);
    expect(result.converged).toBe(true);
    expect(result.solution).toBeCloseTo(20, 3);
    expect(result.resultingTargetValue).toBeCloseTo(100, 3);
    expect(result.stopReason).toBeNull();
    expect(result.evaluations).toBeGreaterThan(0);
    expect(result.evaluations).toBeLessThanOrEqual(204);
  });

  it('is deterministic: the same input yields the identical solution', async () => {
    const first = await executeGoalSeek({ setCell: 'B1', targetValue: 100, byChangingCell: 'A1' }, SOLVABLE);
    const second = await executeGoalSeek({ setCell: 'B1', targetValue: 100, byChangingCell: 'A1' }, SOLVABLE);
    expect(second.solution).toBe(first.solution);
    expect(second.iterations).toBe(first.iterations);
    expect(second.evaluations).toBe(first.evaluations);
  });

  it('accepts lowercase coordinates and normalises them', async () => {
    const result = await executeGoalSeek({ setCell: ' b1 ', targetValue: 100, byChangingCell: ' a1 ' }, SOLVABLE);
    expect(result.success).toBe(true);
  });
});

describe('Grid goal seek: named validation instead of a misleading failure (AST-0456)', () => {
  it('rejects an invalid target or changing coordinate', async () => {
    for (const config of [
      { setCell: '', targetValue: 10, byChangingCell: 'A1' },
      { setCell: 'B1', targetValue: 10, byChangingCell: '' },
      { setCell: 'nonsense', targetValue: 10, byChangingCell: 'A1' },
      { setCell: 'B1', targetValue: 10, byChangingCell: '1A' },
      { setCell: 'B0', targetValue: 10, byChangingCell: 'A1' },
    ]) {
      const result = await executeGoalSeek(config, SOLVABLE);
      expect(result.success).toBe(false);
      expect(result.error).toContain('gültige Adresse');
      expect(result.evaluations).toBe(0);
    }
  });

  it('rejects the same cell for target and variable', async () => {
    const result = await executeGoalSeek({ setCell: 'A1', targetValue: 10, byChangingCell: 'A1' }, SOLVABLE);
    expect(result.success).toBe(false);
    expect(result.error).toContain('verschieden');
  });

  it('rejects a non-finite target value by name', async () => {
    for (const targetValue of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await executeGoalSeek({ setCell: 'B1', targetValue, byChangingCell: 'A1' }, SOLVABLE);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Zielwert');
    }
  });

  it('rejects an unusable iteration count instead of ending the search instantly', async () => {
    // Before the fix a NaN iteration count produced "target not reached", hiding the real problem.
    for (const maxIterations of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      const result = await executeGoalSeek({ setCell: 'B1', targetValue: 100, byChangingCell: 'A1', maxIterations }, SOLVABLE);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Iterationszahl');
      expect(result.evaluations).toBe(0);
    }
  });

  it('rejects an unusable tolerance by name', async () => {
    for (const tolerance of [Number.NaN, 0, -0.5]) {
      const result = await executeGoalSeek({ setCell: 'B1', targetValue: 100, byChangingCell: 'A1', tolerance }, SOLVABLE);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Toleranz');
    }
  });

  it('reports a missing target formula by naming the cell', async () => {
    const result = await executeGoalSeek({ setCell: 'B1', targetValue: 10, byChangingCell: 'A1' }, { A1: { value: 1 } });
    expect(result.success).toBe(false);
    expect(result.error).toContain('B1');
    expect(result.error).toContain('Formel');
  });
});

describe('Grid goal seek: hard budgets and honest stop reasons', () => {
  it('stops after the requested iteration budget and reports the failure honestly', async () => {
    // =A1*A1+1000 drifts away from the target, so the search must stop after the requested 4 steps
    // rather than continuing until something happens to converge.
    const cells: Record<string, GridCell> = { A1: { value: 5 }, B1: { formula: '=A1*A1+1000', value: 1025 } };
    const result = await executeGoalSeek({ setCell: 'B1', targetValue: 0, byChangingCell: 'A1', maxIterations: 4, tolerance: 0.000001 }, cells);
    expect(result.success).toBe(false);
    expect(result.converged).toBe(false);
    expect(result.iterations).toBeLessThanOrEqual(4);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.evaluations).toBeLessThanOrEqual(12);
    expect(result.error).toContain('nicht erreicht');
    // The requested iteration count was exhausted naturally, so no budget is blamed.
    expect(result.stopReason).toBeNull();
  });

  it('refuses an absurd iteration request instead of running unboundedly', async () => {
    const cells: Record<string, GridCell> = { A1: { value: 5 }, B1: { formula: '=A1+1000', value: 1005 } };
    const started = Date.now();
    const result = await executeGoalSeek({ setCell: 'B1', targetValue: 0, byChangingCell: 'A1', maxIterations: 10_000_000 }, cells);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.iterations).toBeLessThanOrEqual(1_000);
    expect(result.evaluations).toBeLessThanOrEqual(2_004);
  });

  it('reports a non-numeric formula result instead of returning a fake solution', async () => {
    const cells: Record<string, GridCell> = { A1: { value: 1 }, B1: { formula: '=TEXTONLY', value: 'x' } };
    const result = await executeGoalSeek({ setCell: 'B1', targetValue: 10, byChangingCell: 'A1' }, cells);
    expect(result.success).toBe(false);
    expect(result.converged).toBe(false);
    expect(result.solution).toBe(0);
    expect(result.error).toContain('numerischen Wert');
  });

  it('returns immediately when the start value already hits the target', async () => {
    const result = await executeGoalSeek({ setCell: 'B1', targetValue: 5, byChangingCell: 'A1' }, SOLVABLE);
    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.evaluations).toBe(1);
  });
});
