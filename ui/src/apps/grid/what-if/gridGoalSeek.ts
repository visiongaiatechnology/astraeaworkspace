// STATUS: DIAMANT VGT SUPREME
// Goal Seek orchestrates the canonical Rust Formula Core; it never evaluates formulas locally.
//
// Termination is part of the contract, not a side effect: the iteration count, the number of formula
// evaluations and the wall clock are all bounded by the shared `analysis/gridIterationBudget`, and a
// budget stop is reported as such instead of as a converged solution. `maxIterations`/`tolerance`
// coming from the dialog are validated first, so a `NaN` cannot produce a misleading error message.

import { GridCell, GridGoalSeekConfig } from '../../../shared/contracts/grid/workspaceGrid';
import { evaluateFormula } from '../formulas/formula';
import { createGridIterationBudget, describeGridIterationStopReason, GRID_ITERATION_HARD_CAPS } from '../analysis/gridIterationBudget';

export interface GoalSeekResult {
  converged: boolean;
  finalValue: number;
  resultingTargetValue: number;
  iterations: number;
  error?: string;
  success?: boolean;
  solution?: number;
  /** How many formula evaluations the search actually spent. */
  evaluations?: number;
  /** Named budget that ended the search, or `null` when it converged or gave up on its own. */
  stopReason?: 'iteration_limit' | 'evaluation_limit' | 'time_limit' | null;
}

const COORDINATE = /^[A-Z]{1,3}[1-9]\d{0,6}$/u;

function fail(message: string, iterations = 0): GoalSeekResult {
  return { converged: false, success: false, finalValue: 0, solution: 0, resultingTargetValue: 0, iterations, error: message, evaluations: 0, stopReason: null };
}

export async function executeGoalSeek(
  config: GridGoalSeekConfig,
  cells: Record<string, GridCell>,
): Promise<GoalSeekResult> {
  const setCoord = String(config.setCell ?? '').trim().toUpperCase();
  const changeCoord = String(config.byChangingCell ?? '').trim().toUpperCase();
  if (!COORDINATE.test(setCoord) || !COORDINATE.test(changeCoord)) {
    return fail('Ziel- oder veränderbare Zelle ist keine gültige Adresse');
  }
  if (setCoord === changeCoord) {
    return fail('Zielzelle und veränderbare Zelle müssen verschieden sein');
  }

  const target = config.targetValue;
  if (typeof target !== 'number' || !Number.isFinite(target)) {
    return fail('Der Zielwert muss eine endliche Zahl sein');
  }

  // Validate before clamping: a NaN iteration count used to end the loop instantly and report
  // "target not reached", which hides the real problem.
  const requestedIterations = config.maxIterations ?? 100;
  if (typeof requestedIterations !== 'number' || !Number.isFinite(requestedIterations) || requestedIterations < 1) {
    return fail('Die maximale Iterationszahl muss eine positive Zahl sein');
  }
  const requestedTolerance = config.tolerance ?? 0.0001;
  if (typeof requestedTolerance !== 'number' || !Number.isFinite(requestedTolerance) || requestedTolerance <= 0) {
    return fail('Die Toleranz muss eine positive Zahl sein');
  }

  const maxIter = Math.max(1, Math.min(1_000, Math.trunc(requestedIterations)));
  const tol = Math.max(1e-12, Math.min(1, requestedTolerance));
  const targetCell = cells[setCoord];
  if (!targetCell?.formula) return fail(`Zielzelle ${setCoord} enthält keine gültige Formel`);
  const formula = targetCell.formula;

  const budget = createGridIterationBudget({
    maxIterations: maxIter,
    maxEvaluations: maxIter * 2 + 4,
    maxDurationMs: GRID_ITERATION_HARD_CAPS.maxDurationMs,
  });

  const workingCells = { ...cells };
  const evaluateTargetAt = async (x: number): Promise<number> => {
    if (!budget.spendEvaluation()) throw new Error('goal_seek_budget_exhausted');
    workingCells[changeCoord] = { ...(workingCells[changeCoord] ?? { value: 0 }), value: x, formula: undefined };
    const result = await evaluateFormula(formula, workingCells, { volatilePolicy: 'disabled' });
    const numeric = Number(result);
    if (!Number.isFinite(numeric)) throw new Error('goal_seek_formula_not_numeric');
    return numeric;
  };

  const stopped = (iterations: number, solution: number): GoalSeekResult => ({
    converged: false,
    success: false,
    finalValue: solution,
    solution,
    resultingTargetValue: solution,
    iterations,
    evaluations: budget.evaluations,
    stopReason: budget.stopReason,
    error: `Zielwert nicht erreicht: ${describeGridIterationStopReason(budget.stopReason)}`,
  });

  let x0 = typeof cells[changeCoord]?.value === 'number' ? Number(cells[changeCoord]?.value) : 1;
  if (!Number.isFinite(x0) || x0 === 0) x0 = 1;

  try {
    if (!budget.beginIteration()) return stopped(0, x0);
    let y0 = (await evaluateTargetAt(x0)) - target;
    if (Math.abs(y0) <= tol) {
      budget.settle();
      return { converged: true, success: true, finalValue: x0, solution: x0, resultingTargetValue: y0 + target, iterations: 1, evaluations: budget.evaluations, stopReason: null };
    }

    let x1 = x0 * 1.1;
    let y1 = (await evaluateTargetAt(x1)) - target;
    for (let iter = 2; iter <= maxIter; iter += 1) {
      if (!budget.beginIteration()) return stopped(iter - 1, x1);
      if (Math.abs(y1 - y0) < 1e-12) {
        x1 += 0.01;
        y1 = (await evaluateTargetAt(x1)) - target;
      }
      const denominator = y1 - y0;
      if (Math.abs(denominator) < 1e-15) {
        budget.settle();
        break;
      }
      const nextX = x1 - y1 * ((x1 - x0) / denominator);
      if (!Number.isFinite(nextX)) {
        budget.settle();
        break;
      }
      const nextY = (await evaluateTargetAt(nextX)) - target;
      if (Math.abs(nextY) <= tol) {
        const solution = Math.round(nextX * 1e6) / 1e6;
        budget.settle();
        return { converged: true, success: true, finalValue: solution, solution, resultingTargetValue: nextY + target, iterations: iter, evaluations: budget.evaluations, stopReason: null };
      }
      x0 = x1; y0 = y1; x1 = nextX; y1 = nextY;
    }
    const solution = Math.round(x1 * 1e6) / 1e6;
    return {
      converged: false,
      success: false,
      finalValue: solution,
      solution,
      resultingTargetValue: y1 + target,
      iterations: Math.min(maxIter, budget.iterations),
      evaluations: budget.evaluations,
      stopReason: budget.stopReason,
      error: budget.stopReason
        ? `Zielwert nicht erreicht: ${describeGridIterationStopReason(budget.stopReason)}`
        : 'Zielwert konnte innerhalb der max. Iterationen nicht erreicht werden',
    };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '';
    if (message === 'goal_seek_budget_exhausted') {
      return stopped(budget.iterations, x0);
    }
    return {
      converged: false, success: false, finalValue: 0, solution: 0, resultingTargetValue: 0,
      iterations: budget.iterations, evaluations: budget.evaluations, stopReason: budget.stopReason,
      error: message === 'goal_seek_formula_not_numeric'
        ? 'Die Zielformel liefert keinen numerischen Wert'
        : 'Die Zielformel konnte nicht ausgewertet werden',
    };
  }
}
