// STATUS: DIAMANT VGT SUPREME
// Mathematical optimization solver tests: Simplex Linear Programming & Branch-and-bound Integer Programming

import { describe, it, expect } from 'vitest';
import {
  solveLinearProgramming,
  solveIntegerProgramming,
  executeSolver,
  SolverProblem,
} from '../../analysis/gridSolver';

describe('Simplex Linear Programming (LP) Solver', () => {
  it('maximizes linear objective function under inequality constraints', () => {
    // Maximize Z = 3*x1 + 5*x2
    // Subject to:
    // x1 <= 4
    // 2*x2 <= 12  =>  x2 <= 6
    // 3*x1 + 2*x2 <= 18
    // x1, x2 >= 0
    // Optimal: x1 = 2, x2 = 6 => Z = 3*2 + 5*6 = 36
    const problem: SolverProblem = {
      goal: 'maximize',
      objectiveWeights: { x1: 3, x2: 5 },
      variables: [
        { name: 'x1', min: 0, max: 100 },
        { name: 'x2', min: 0, max: 100 },
      ],
      constraints: [
        { id: 'c1', lhsWeights: { x1: 1 }, operator: '<=', rhs: 4 },
        { id: 'c2', lhsWeights: { x2: 2 }, operator: '<=', rhs: 12 },
        { id: 'c3', lhsWeights: { x1: 3, x2: 2 }, operator: '<=', rhs: 18 },
      ],
    };

    const result = solveLinearProgramming(problem);
    expect(result.status).toBe('optimal');
    expect(Math.round(result.solution['x1'])).toBe(2);
    expect(Math.round(result.solution['x2'])).toBe(6);
    expect(Math.round(result.objectiveValue)).toBe(36);
  });

  it('minimizes linear objective function', () => {
    // Minimize Z = 2*x1 + 3*x2
    // Convert to maximize -Z = -2*x1 - 3*x2
    // Subject to:
    // x1 + x2 >= 4  (written with <= as -x1 - x2 <= -4 or operator >=)
    // x1 <= 5, x2 <= 5
    // Optimal: x1 = 4, x2 = 0 => Z = 8
    const problem: SolverProblem = {
      goal: 'minimize',
      objectiveWeights: { x1: 2, x2: 3 },
      variables: [
        { name: 'x1', min: 0, max: 10 },
        { name: 'x2', min: 0, max: 10 },
      ],
      constraints: [
        { id: 'c1', lhsWeights: { x1: 1, x2: 1 }, operator: '>=', rhs: 4 },
        { id: 'c2', lhsWeights: { x1: 1 }, operator: '<=', rhs: 5 },
      ],
    };

    const result = solveLinearProgramming(problem);
    expect(result.status).toBe('optimal');
    expect(result.solution['x1']).toBeCloseTo(4, 6);
    expect(result.solution['x2']).toBeCloseTo(0, 6);
    expect(result.objectiveValue).toBeCloseTo(8, 6);
  });

  it('detects empty variable problem correctly', () => {
    const problem: SolverProblem = {
      goal: 'maximize',
      objectiveWeights: {},
      variables: [],
      constraints: [],
    };
    const result = solveLinearProgramming(problem);
    expect(result.status).toBe('infeasible');
  });
});

describe('Branch-and-Bound Integer Linear Programming (ILP) Solver', () => {
  it('solves knapsack / integer optimization problem with integer constraints', () => {
    // Maximize Z = 5*x1 + 4*x2
    // Subject to:
    // x1 + x2 <= 5
    // 10*x1 + 6*x2 <= 45
    // x1, x2 are integers
    const problem: SolverProblem = {
      goal: 'maximize',
      objectiveWeights: { x1: 5, x2: 4 },
      variables: [
        { name: 'x1', min: 0, max: 10, isInteger: true },
        { name: 'x2', min: 0, max: 10, isInteger: true },
      ],
      constraints: [
        { id: 'c1', lhsWeights: { x1: 1, x2: 1 }, operator: '<=', rhs: 5 },
        { id: 'c2', lhsWeights: { x1: 10, x2: 6 }, operator: '<=', rhs: 45 },
      ],
    };

    const result = solveIntegerProgramming(problem);
    expect(result.status).toBe('optimal');
    expect(Number.isInteger(result.solution['x1'])).toBe(true);
    expect(Number.isInteger(result.solution['x2'])).toBe(true);
    expect(result.objectiveValue).toBeGreaterThan(0);
  });

  it('routes to ILP solver via executeSolver when integer variables are present', () => {
    const problem: SolverProblem = {
      goal: 'maximize',
      objectiveWeights: { x: 10 },
      variables: [{ name: 'x', min: 0, max: 5, isInteger: true }],
      constraints: [{ id: 'c1', lhsWeights: { x: 1 }, operator: '<=', rhs: 4.8 }],
    };
    const result = executeSolver(problem);
    expect(result.status).toBe('optimal');
    expect(result.solution['x']).toBe(4); // The 4.8 constraint remains binding after integer optimization.
  });
});
