// STATUS: DIAMANT VGT SUPREME
// Shared, hard-bounded iteration/evaluation budget for every iterative Grid analysis backend
// (goal seek, iterative solver, Monte-Carlo simulation).
//
// Why this exists: an iterative backend driven by user input must terminate deterministically. A
// budget that is only "usually" respected is not a budget, so the caps here are immutable and every
// counter is checked *before* the expensive operation.

export interface GridIterationHardCaps {
  maxIterations: number;
  maxEvaluations: number;
  maxDurationMs: number;
}

/** Immutable ceilings. No caller can raise these; a caller can only ask for less. */
export const GRID_ITERATION_HARD_CAPS: Readonly<GridIterationHardCaps> = Object.freeze({
  maxIterations: 200_000,
  maxEvaluations: 250_000,
  maxDurationMs: 5_000,
});

export type GridIterationStopReason = 'iteration_limit' | 'evaluation_limit' | 'time_limit' | null;

export interface GridIterationBudget {
  readonly maxIterations: number;
  readonly maxEvaluations: number;
  readonly maxDurationMs: number;
  readonly iterations: number;
  readonly evaluations: number;
  readonly elapsedMs: number;
  readonly stopReason: GridIterationStopReason;
  /** Consumes one iteration. Returns false when the budget is exhausted (the caller must stop). */
  beginIteration(): boolean;
  /** Consumes one expensive evaluation. Returns false when the budget is exhausted. */
  spendEvaluation(): boolean;
  /** A natural (non-budget) termination happened. */
  settle(reason?: Exclude<GridIterationStopReason, null>): void;
}

export interface GridIterationBudgetOptions {
  maxIterations?: number;
  maxEvaluations?: number;
  maxDurationMs?: number;
  now?: () => number;
}

function boundedPositive(value: unknown, fallback: number, cap: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.min(cap, Math.trunc(value)));
}

export function resolveGridIterationBudget(options: GridIterationBudgetOptions = {}): {
  maxIterations: number;
  maxEvaluations: number;
  maxDurationMs: number;
} {
  return {
    maxIterations: boundedPositive(options.maxIterations, 500, GRID_ITERATION_HARD_CAPS.maxIterations),
    maxEvaluations: boundedPositive(options.maxEvaluations, 5_000, GRID_ITERATION_HARD_CAPS.maxEvaluations),
    maxDurationMs: boundedPositive(options.maxDurationMs, 2_000, GRID_ITERATION_HARD_CAPS.maxDurationMs),
  };
}

export function createGridIterationBudget(options: GridIterationBudgetOptions = {}): GridIterationBudget {
  const resolved = resolveGridIterationBudget(options);
  const clock = options.now ?? (() => Date.now());
  const startedAt = clock();
  let iterations = 0;
  let evaluations = 0;
  let stopReason: GridIterationStopReason = null;

  const elapsed = (): number => Math.max(0, clock() - startedAt);

  const exhausted = (includeIterationCap: boolean): GridIterationStopReason => {
    // Within one iteration the iteration counter is already at its cap, so only the iteration gate
    // may test it. Otherwise the last permitted iteration would lose its own evaluations.
    if (includeIterationCap && iterations >= resolved.maxIterations) return 'iteration_limit';
    if (evaluations >= resolved.maxEvaluations) return 'evaluation_limit';
    if (elapsed() >= resolved.maxDurationMs) return 'time_limit';
    return null;
  };

  return {
    maxIterations: resolved.maxIterations,
    maxEvaluations: resolved.maxEvaluations,
    maxDurationMs: resolved.maxDurationMs,
    get iterations() { return iterations; },
    get evaluations() { return evaluations; },
    get elapsedMs() { return elapsed(); },
    get stopReason() { return stopReason; },
    beginIteration() {
      if (stopReason) return false;
      const remaining = exhausted(true);
      if (remaining) { stopReason = remaining; return false; }
      iterations += 1;
      return true;
    },
    spendEvaluation() {
      if (stopReason) return false;
      const remaining = exhausted(false);
      if (remaining) { stopReason = remaining; return false; }
      evaluations += 1;
      return true;
    },
    settle(reason) { if (reason && !stopReason) stopReason = reason; },
  };
}

export function describeGridIterationStopReason(reason: GridIterationStopReason): string {
  switch (reason) {
    case 'iteration_limit': return 'Das Iterationslimit wurde erreicht.';
    case 'evaluation_limit': return 'Das Auswertungslimit wurde erreicht.';
    case 'time_limit': return 'Das Zeitlimit wurde erreicht.';
    default: return 'Innerhalb des Budgets abgeschlossen.';
  }
}
