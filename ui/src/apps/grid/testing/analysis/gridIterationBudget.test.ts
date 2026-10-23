// STATUS: PLATIN — counter-checks for Grid Paket 44 (What-if Goal Seek und Solver).
//
// Hand-written oracle for "Gesuchte Zielgröße durch Zellvariation finden, Ergebnis und Grenzen
// erklären": every iterative backend must terminate deterministically with a hard iteration,
// evaluation and wall-clock budget, and must report a budget stop instead of a fake optimum.
import { describe, expect, it } from 'vitest';
import {
  createGridIterationBudget,
  describeGridIterationStopReason,
  GRID_ITERATION_HARD_CAPS,
  resolveGridIterationBudget,
} from '../../analysis/gridIterationBudget';
import {
  executeSolver,
  solveIntegerProgramming,
  solveLinearProgramming,
  solveNonlinearProgramming,
  type SolverProblem,
} from '../../analysis/gridSolver';
import {
  GRID_MONTE_CARLO_MAX_BINS,
  GRID_MONTE_CARLO_MAX_ITERATIONS,
  GRID_MONTE_CARLO_MAX_VARIABLES,
  runMonteCarloSimulation,
  sampleDistribution,
  createGridSeededRandom,
  type StochasticVariable,
} from '../../analysis/gridMonteCarlo';

describe('Grid iteration budget: hard caps, deterministic stops', () => {
  it('cannot be raised above the immutable hard caps', () => {
    const resolved = resolveGridIterationBudget({
      maxIterations: 1e12,
      maxEvaluations: 1e12,
      maxDurationMs: 1e12,
    });
    expect(resolved.maxIterations).toBe(GRID_ITERATION_HARD_CAPS.maxIterations);
    expect(resolved.maxEvaluations).toBe(GRID_ITERATION_HARD_CAPS.maxEvaluations);
    expect(resolved.maxDurationMs).toBe(GRID_ITERATION_HARD_CAPS.maxDurationMs);
  });

  it('ignores non-finite or non-positive budgets and applies its own default', () => {
    expect(resolveGridIterationBudget({ maxIterations: Number.NaN }).maxIterations).toBe(500);
    expect(resolveGridIterationBudget({ maxIterations: -5 }).maxIterations).toBe(500);
    expect(resolveGridIterationBudget({ maxIterations: 0 }).maxIterations).toBe(500);
    expect(resolveGridIterationBudget({ maxIterations: 12.9 }).maxIterations).toBe(12);
  });

  it('stops at the iteration limit and names the reason', () => {
    const budget = createGridIterationBudget({ maxIterations: 3, maxDurationMs: 60_000 });
    let runs = 0;
    while (budget.beginIteration()) runs += 1;
    expect(runs).toBe(3);
    expect(budget.iterations).toBe(3);
    expect(budget.stopReason).toBe('iteration_limit');
    expect(budget.beginIteration()).toBe(false);
    expect(describeGridIterationStopReason(budget.stopReason)).toMatch(/Iterationslimit/u);
  });

  it('stops at the evaluation limit and at the injected wall-clock limit', () => {
    const evaluations = createGridIterationBudget({ maxIterations: 100, maxEvaluations: 4, maxDurationMs: 60_000 });
    let spent = 0;
    while (evaluations.spendEvaluation()) spent += 1;
    expect(spent).toBe(4);
    expect(evaluations.stopReason).toBe('evaluation_limit');

    let fake = 0;
    const timed = createGridIterationBudget({ maxIterations: 1_000, maxEvaluations: 1_000, maxDurationMs: 10, now: () => (fake += 5) });
    let iterations = 0;
    while (timed.beginIteration()) iterations += 1;
    expect(iterations).toBeLessThan(1_000);
    expect(timed.stopReason).toBe('time_limit');
    expect(describeGridIterationStopReason(timed.stopReason)).toMatch(/Zeitlimit/u);
  });

  it('reports a natural settlement as "within budget"', () => {
    const budget = createGridIterationBudget({ maxIterations: 10, maxDurationMs: 60_000 });
    budget.beginIteration();
    budget.settle();
    expect(budget.stopReason).toBeNull();
    expect(describeGridIterationStopReason(null)).toMatch(/Innerhalb des Budgets/u);
  });
});

describe('Grid solver: bounded, deterministic termination', () => {
  const linearProblem: SolverProblem = {
    goal: 'maximize',
    objectiveWeights: { A1: 40, B1: 30 },
    variables: [{ name: 'A1', min: 0, max: 100 }, { name: 'B1', min: 0, max: 100 }],
    constraints: [
      { id: 'c1', lhsWeights: { A1: 2, B1: 3 }, operator: '<=', rhs: 120 },
      { id: 'c2', lhsWeights: { A1: 4, B1: 1 }, operator: '<=', rhs: 100 },
    ],
    maxIterations: 1_000,
  };

  it('solves the reference linear program exactly', () => {
    const result = solveLinearProgramming(linearProblem);
    expect(result.status).toBe('optimal');
    // 2A+3B<=120, 4A+B<=100, max 40A+30B -> A=18, B=28 -> 1560
    expect(result.solution.A1).toBeCloseTo(18, 6);
    expect(result.solution.B1).toBeCloseTo(28, 6);
    expect(result.objectiveValue).toBeCloseTo(1_560, 4);
  });

  it('is deterministic: the same problem yields the identical result on every run', () => {
    const first = solveLinearProgramming(linearProblem);
    const second = solveLinearProgramming(linearProblem);
    expect(second).toEqual(first);
  });

  it('honours a tiny iteration budget instead of running to completion', () => {
    const constrained = solveLinearProgramming({ ...linearProblem, maxIterations: 1 });
    expect(constrained.iterations).toBeLessThanOrEqual(2);
    expect(constrained.status === 'max_iterations' || constrained.status === 'optimal').toBe(true);
    if (constrained.status !== 'optimal') expect(constrained.message).toMatch(/limit/u);
  });

  it('clamps an absurd iteration request to the hard cap', () => {
    const clamped = solveLinearProgramming({ ...linearProblem, maxIterations: 10_000_000 });
    expect(clamped.status).toBe('optimal');
    expect(clamped.iterations).toBeLessThanOrEqual(GRID_ITERATION_HARD_CAPS.maxIterations);
  });

  it('keeps an exhaustive integer search inside its combination budget', () => {
    const integerProblem: SolverProblem = {
      goal: 'maximize',
      objectiveWeights: { X: 3, Y: 2 },
      variables: [
        { name: 'X', min: 0, max: 20, isInteger: true },
        { name: 'Y', min: 0, max: 20, isInteger: true },
      ],
      constraints: [{ id: 'c', lhsWeights: { X: 2, Y: 1 }, operator: '<=', rhs: 30 }],
    };
    const result = solveIntegerProgramming(integerProblem);
    expect(result.status).toBe('optimal');
    // max 3X+2Y s.t. 2X+Y<=30 with X,Y in 0..20: X=5, Y=20 -> 2*5+20=30, objective 55.
    expect(result.solution.X).toBe(5);
    expect(result.solution.Y).toBe(20);
    expect(result.objectiveValue).toBe(55);
    expect(result.iterations).toBeLessThanOrEqual(21 * 21);

    const tooWide: SolverProblem = {
      ...integerProblem,
      variables: [
        { name: 'X', min: 0, max: 1_000, isInteger: true },
        { name: 'Y', min: 0, max: 1_000, isInteger: true },
      ],
    };
    expect(() => solveIntegerProgramming(tooWide)).toThrow('solver_integer_combination_limit');

    const domainTooWide: SolverProblem = {
      ...integerProblem,
      variables: [{ name: 'X', min: 0, max: 20_000, isInteger: true }],
    };
    expect(() => solveIntegerProgramming(domainTooWide)).toThrow('solver_integer_domain_limit');
  });

  it('never reports an optimum when the objective evaluator is not finite', () => {
    const broken: SolverProblem = {
      mode: 'nonlinear',
      goal: 'maximize',
      objectiveWeights: {},
      variables: [{ name: 'A1', min: 0, max: 10 }],
      constraints: [],
      objectiveEvaluator: () => Number.NaN,
      maxIterations: 50,
    };
    const result = solveNonlinearProgramming(broken);
    expect(result.status).toBe('infeasible');
    expect(result.solution).toEqual({});
  });

  it('terminates a non-linear problem that has no improving step', () => {
    const flat: SolverProblem = {
      mode: 'nonlinear',
      goal: 'maximize',
      objectiveWeights: {},
      variables: [{ name: 'A1', min: 0, max: 10 }],
      constraints: [],
      objectiveEvaluator: () => 5,
      maxIterations: 5_000,
      tolerance: 1e-7,
    };
    const result = solveNonlinearProgramming(flat);
    expect(result.status).toBe('optimal');
    expect(result.iterations).toBeLessThan(5_000);
    expect(result.objectiveValue).toBe(5);
  });

  it('rejects an over-large problem at the facade and enforces unique variable names', () => {
    // Zero decision variables is reported as infeasible, never as a silent success.
    const empty = executeSolver({ goal: 'maximize', objectiveWeights: {}, variables: [], constraints: [] });
    expect(empty.status).toBe('infeasible');
    expect(empty.solution).toEqual({});
    expect(empty.message).toMatch(/No decision variables/u);
    expect(() => executeSolver({
      goal: 'maximize', objectiveWeights: {},
      variables: Array.from({ length: 65 }, (_, index) => ({ name: `V${index}`, min: 0, max: 1 })),
      constraints: [],
    })).toThrow('solver_problem_limit');
    expect(() => executeSolver({
      goal: 'maximize', objectiveWeights: {},
      variables: [{ name: 'X', min: 0, max: 1 }, { name: 'X', min: 0, max: 1 }],
      constraints: [],
    })).toThrow('solver_variable_invalid');
  });
});

describe('Grid Monte Carlo: bounded allocation and degenerate-RNG refusal', () => {
  const variables: StochasticVariable[] = [{ id: 'r', name: 'Revenue', distribution: 'normal', p1: 100, p2: 10 }];

  it('clamps the histogram bin count instead of allocating an unbounded array', () => {
    const started = Date.now();
    const result = runMonteCarloSimulation(variables, (map) => map.Revenue, 500, 10_000_000, createGridSeededRandom(7), 7);
    expect(result.histogram.length).toBe(GRID_MONTE_CARLO_MAX_BINS);
    // Would have allocated 10,000,000 bins before the fix.
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('clamps the iteration count to the documented ceiling', () => {
    let calls = 0;
    const result = runMonteCarloSimulation(variables, (map) => { calls += 1; return map.Revenue; }, 10_000_000, 20, createGridSeededRandom(3), 3);
    expect(result.iterations).toBe(GRID_MONTE_CARLO_MAX_ITERATIONS);
    expect(calls).toBe(GRID_MONTE_CARLO_MAX_ITERATIONS);
  });

  it('refuses a degenerate random source instead of looping forever', () => {
    expect(() => sampleDistribution({ id: 'n', name: 'N', distribution: 'normal', p1: 0, p2: 1 }, () => 0))
      .toThrow('monte_carlo_rng_degenerate');
    expect(() => runMonteCarloSimulation(variables, (map) => map.Revenue, 200, 20, () => 0, 1))
      .toThrow('monte_carlo_rng_degenerate');
    expect(() => sampleDistribution({ id: 'n', name: 'N', distribution: 'normal', p1: 0, p2: 1 }, () => Number.NaN))
      .toThrow('monte_carlo_rng_non_finite');
  });

  it('rejects invalid distributions before sampling', () => {
    const bad: Array<[StochasticVariable, string]> = [
      [{ id: 'a', name: 'A', distribution: 'normal', p1: 0, p2: -1 }, 'monte_carlo_stddev_invalid'],
      [{ id: 'b', name: 'B', distribution: 'uniform', p1: 4, p2: 4 }, 'monte_carlo_uniform_degenerate'],
      [{ id: 'c', name: 'C', distribution: 'triangular', p1: 5, p2: 4, p3: 6 }, 'monte_carlo_triangular_invalid'],
      [{ id: 'd', name: 'D', distribution: 'triangular', p1: 5, p2: 5, p3: 5 }, 'monte_carlo_triangular_degenerate'],
      [{ id: 'e', name: 'E', distribution: 'uniform', p1: Number.NaN, p2: 1 }, 'monte_carlo_parameter_invalid'],
    ];
    for (const [variable, code] of bad) {
      expect(() => runMonteCarloSimulation([variable], (map) => map[variable.name] ?? 0, 200, 20, createGridSeededRandom(1), 1)).toThrow(code);
    }
    expect(() => runMonteCarloSimulation(Array.from({ length: GRID_MONTE_CARLO_MAX_VARIABLES + 1 }, (_, index) => ({ id: `v${index}`, name: `V${index}`, distribution: 'uniform' as const, p1: 0, p2: 1 })), (map) => Object.values(map)[0] ?? 0, 200, 20, createGridSeededRandom(1), 1))
      .toThrow('monte_carlo_variable_limit');
    expect(() => runMonteCarloSimulation(variables, (map) => map.Revenue, 200, 20, createGridSeededRandom(1), 1, ))
      .not.toThrow();
    expect(() => runMonteCarloSimulation(variables, (map) => map.Revenue, Number.NaN, 20, createGridSeededRandom(1)))
      .toThrow('monte_carlo_iterations_invalid');
    expect(() => runMonteCarloSimulation(variables, (map) => map.Revenue, 200, Number.NaN, createGridSeededRandom(1)))
      .toThrow('monte_carlo_bin_count_invalid');
  });

  it('produces a reproducible result for a given seed', () => {
    const first = runMonteCarloSimulation(variables, (map) => map.Revenue, 1_000, 10, createGridSeededRandom(42), 42);
    const second = runMonteCarloSimulation(variables, (map) => map.Revenue, 1_000, 10, createGridSeededRandom(42), 42);
    expect(second.mean).toBe(first.mean);
    expect(second.stdDev).toBe(first.stdDev);
    expect(second.percentiles).toEqual(first.percentiles);
  });

  it('refuses a non-finite evaluator result instead of silently storing NaN', () => {
    expect(() => runMonteCarloSimulation(variables, () => Number.POSITIVE_INFINITY, 200, 20, createGridSeededRandom(1), 1))
      .toThrow('monte_carlo_evaluator_non_finite');
  });
});
