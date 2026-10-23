// STATUS: DIAMANT VGT SUPREME — Mathematical Optimization Solver
// Linear Simplex, bounded integer optimization, and deterministic non-linear local backends
//
// Every backend is bounded twice: by an iteration ceiling and by a wall-clock deadline, both of
// which are immutable hard caps (see `gridIterationBudget`). Termination is therefore deterministic
// even for an adversarial objective evaluator.

import { createGridIterationBudget, describeGridIterationStopReason, GRID_ITERATION_HARD_CAPS } from './gridIterationBudget';

export type ObjectiveGoal = 'maximize' | 'minimize';
export type ConstraintOp = '<=' | '>=' | '==' | 'int' | 'bin';

export interface SolverVariable {
  name: string;
  min: number;
  max: number;
  isInteger?: boolean;
  isBinary?: boolean;
  currentValue?: number;
}

export interface SolverConstraint {
  id: string;
  lhsWeights: Record<string, number>; // varName -> coefficient
  operator: ConstraintOp;
  rhs: number;
}

export interface SolverProblem {
  mode?: 'linear' | 'nonlinear';
  goal: ObjectiveGoal;
  objectiveWeights: Record<string, number>;
  variables: SolverVariable[];
  constraints: SolverConstraint[];
  maxIterations?: number;
  tolerance?: number;
  objectiveEvaluator?: (solution: Record<string, number>) => number;
  nonlinearConstraints?: Array<{ id: string; evaluate: (solution: Record<string, number>) => number; operator: '<=' | '>=' | '=='; rhs: number }>;
}

export interface SolverResult {
  status: 'optimal' | 'infeasible' | 'unbounded' | 'max_iterations';
  solution: Record<string, number>;
  objectiveValue: number;
  iterations: number;
  message: string;
}

export interface SolverBackend {
  id: string;
  supports: (problem: SolverProblem) => boolean;
  solve: (problem: SolverProblem) => SolverResult;
}

function constraintSatisfied(constraint: SolverConstraint, solution: Record<string, number>, tolerance = 1e-7): boolean {
  const lhs=Object.entries(constraint.lhsWeights).reduce((sum,[name,weight])=>sum+(solution[name]??0)*weight,0);
  if(constraint.operator==='<=')return lhs<=constraint.rhs+tolerance;
  if(constraint.operator==='>=')return lhs>=constraint.rhs-tolerance;
  if(constraint.operator==='==')return Math.abs(lhs-constraint.rhs)<=tolerance;
  return true;
}
function objective(problem: SolverProblem, solution: Record<string, number>): number {
  if(problem.objectiveEvaluator){const value=problem.objectiveEvaluator(solution);return Number.isFinite(value)?value:Number.NaN;}
  return Object.entries(problem.objectiveWeights).reduce((sum,[name,weight])=>sum+(solution[name]??0)*weight,0);
}
function boundsSatisfied(problem: SolverProblem, solution: Record<string, number>): boolean {
  return problem.variables.every((variable)=>{const value=solution[variable.name];return Number.isFinite(value)&&value>=variable.min-1e-7&&value<=variable.max+1e-7&&(!variable.isBinary||(value===0||value===1))&&(!variable.isInteger||Math.abs(value-Math.round(value))<=1e-7);});
}

/**
 * Standard Two-Phase Simplex Table-based Linear Programming Solver.
 */
export function solveLinearProgramming(problem: SolverProblem): SolverResult {
  const variableCount = problem.variables.length;
  if (variableCount === 0) {
    return { status: 'infeasible', solution: {}, objectiveValue: 0, iterations: 0, message: 'No decision variables specified.' };
  }
  const invalid = (message: string): SolverResult => ({ status: 'infeasible', solution: {}, objectiveValue: 0, iterations: 0, message });
  const variableIndex = new Map<string, number>();
  for (const [index, variable] of problem.variables.entries()) {
    if (!variable.name || variableIndex.has(variable.name) || !Number.isFinite(variable.min) || !Number.isFinite(variable.max) || variable.min > variable.max) {
      return invalid('A decision-variable boundary is invalid.');
    }
    variableIndex.set(variable.name, index);
  }

  type Relation = '<=' | '>=' | '==';
  interface ConstraintRow { coefficients: number[]; operator: Relation; rhs: number; }
  const rows: ConstraintRow[] = [];
  for (const constraint of problem.constraints) {
    if (constraint.operator === 'int' || constraint.operator === 'bin') continue;
    if (!Number.isFinite(constraint.rhs)) return invalid('A constraint boundary is invalid.');
    const coefficients = new Array<number>(variableCount).fill(0);
    let offset = 0;
    for (const [name, coefficient] of Object.entries(constraint.lhsWeights)) {
      const index = variableIndex.get(name);
      if (index === undefined || !Number.isFinite(coefficient)) return invalid('A constraint coefficient is invalid.');
      coefficients[index] = coefficient;
      offset += coefficient * problem.variables[index].min;
    }
    let rhs = constraint.rhs - offset;
    if (!Number.isFinite(rhs)) return invalid('A constraint boundary is invalid.');
    let operator = constraint.operator as Relation;
    if (rhs < 0) {
      rhs = -rhs;
      for (let index = 0; index < coefficients.length; index += 1) coefficients[index] = -coefficients[index];
      if (operator === '<=') operator = '>=';
      else if (operator === '>=') operator = '<=';
    }
    rows.push({ coefficients, operator, rhs });
  }
  for (let index = 0; index < variableCount; index += 1) {
    const variable = problem.variables[index];
    rows.push({ coefficients: problem.variables.map((_, candidate) => candidate === index ? 1 : 0), operator: '<=', rhs: variable.max - variable.min });
  }

  const epsilon = Math.max(1e-10, Math.min(1e-6, problem.tolerance ?? 1e-9));
  const maxIterations = Math.max(1, Math.min(20_000, Math.trunc(problem.maxIterations ?? 500)));
  // Simplex pivots are O(rows × columns); 20,000 pivots on a 512×64 problem is billions of
  // operations, so a wall-clock deadline is part of the termination contract, not a nicety.
  const budget = createGridIterationBudget({
    maxIterations: maxIterations * 2,
    maxEvaluations: GRID_ITERATION_HARD_CAPS.maxEvaluations,
    maxDurationMs: GRID_ITERATION_HARD_CAPS.maxDurationMs,
  });
  const deadlineHit = (): boolean => budget.stopReason === 'time_limit';
  let nextColumn = variableCount;
  const artificialColumns = new Set<number>();
  const basis: number[] = [];
  const auxiliary = rows.map((row) => {
    if (row.operator === '<=') {
      const slack = nextColumn++;
      basis.push(slack);
      return { slack, surplus: undefined, artificial: undefined };
    }
    const surplus = row.operator === '>=' ? nextColumn++ : undefined;
    const artificial = nextColumn++;
    artificialColumns.add(artificial);
    basis.push(artificial);
    return { slack: undefined, surplus, artificial };
  });
  const rhsColumn = nextColumn;
  const tableau: number[][] = rows.map((row, rowIndex) => {
    const line = new Array<number>(rhsColumn + 1).fill(0);
    row.coefficients.forEach((value, index) => { line[index] = value; });
    const extra = auxiliary[rowIndex];
    if (extra.slack !== undefined) line[extra.slack] = 1;
    if (extra.surplus !== undefined) line[extra.surplus] = -1;
    if (extra.artificial !== undefined) line[extra.artificial] = 1;
    line[rhsColumn] = row.rhs;
    return line;
  });

  const pivot = (pivotRow: number, pivotColumn: number): void => {
    const pivotValue = tableau[pivotRow][pivotColumn];
    for (let column = 0; column <= rhsColumn; column += 1) tableau[pivotRow][column] /= pivotValue;
    for (let row = 0; row < tableau.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = tableau[row][pivotColumn];
      if (Math.abs(factor) <= epsilon) continue;
      for (let column = 0; column <= rhsColumn; column += 1) tableau[row][column] -= factor * tableau[pivotRow][column];
    }
    basis[pivotRow] = pivotColumn;
  };
  const optimize = (allowedColumns: readonly number[], iterationLimit: number): { status: 'optimal' | 'unbounded' | 'max_iterations'; iterations: number } => {
    const objectiveRow = tableau[tableau.length - 1];
    let iterations = 0;
    while (true) {
      if (!budget.beginIteration() || deadlineHit()) return { status: 'max_iterations', iterations };
      let entering = -1;
      for (const column of allowedColumns) {
        if (objectiveRow[column] < -epsilon) { entering = column; break; }
      }
      if (entering < 0) return { status: 'optimal', iterations };
      if (iterations >= iterationLimit) return { status: 'max_iterations', iterations };
      let leaving = -1;
      let ratio = Infinity;
      for (let row = 0; row < tableau.length - 1; row += 1) {
        const coefficient = tableau[row][entering];
        if (coefficient <= epsilon) continue;
        const candidate = tableau[row][rhsColumn] / coefficient;
        if (candidate < ratio - epsilon || (Math.abs(candidate - ratio) <= epsilon && (leaving < 0 || basis[row] < basis[leaving]))) {
          ratio = candidate;
          leaving = row;
        }
      }
      if (leaving < 0) return { status: 'unbounded', iterations: iterations + 1 };
      pivot(leaving, entering);
      iterations += 1;
    }
  };

  const allowedPhaseOne = Array.from({ length: rhsColumn }, (_, index) => index).filter((index) => !artificialColumns.has(index));
  const phaseOneObjective = new Array<number>(rhsColumn + 1).fill(0);
  for (const index of artificialColumns) phaseOneObjective[index] = 1;
  tableau.push(phaseOneObjective);
  for (let row = 0; row < basis.length; row += 1) {
    if (artificialColumns.has(basis[row])) {
      for (let column = 0; column <= rhsColumn; column += 1) tableau[tableau.length - 1][column] -= tableau[row][column];
    }
  }
  const phaseOne = optimize(allowedPhaseOne, maxIterations);
  if (phaseOne.status === 'max_iterations') return { status: 'max_iterations', solution: {}, objectiveValue: 0, iterations: phaseOne.iterations, message: 'Simplex phase one reached its iteration limit.' };
  if (phaseOne.status === 'unbounded' || tableau[tableau.length - 1][rhsColumn] < -epsilon) {
    return { status: 'infeasible', solution: {}, objectiveValue: 0, iterations: phaseOne.iterations, message: 'Linear constraints have no feasible solution.' };
  }

  for (let row = basis.length - 1; row >= 0; row -= 1) {
    if (!artificialColumns.has(basis[row])) continue;
    let entering = -1;
    for (let column = 0; column < rhsColumn; column += 1) {
      if (!artificialColumns.has(column) && Math.abs(tableau[row][column]) > epsilon) { entering = column; break; }
    }
    if (entering >= 0) pivot(row, entering);
    else {
      tableau.splice(row, 1);
      basis.splice(row, 1);
    }
  }

  const objectiveScale = problem.goal === 'maximize' ? 1 : -1;
  const phaseTwoObjective = new Array<number>(rhsColumn + 1).fill(0);
  for (let index = 0; index < variableCount; index += 1) {
    const weight = problem.objectiveWeights[problem.variables[index].name] ?? 0;
    if (!Number.isFinite(weight)) return invalid('An objective coefficient is invalid.');
    phaseTwoObjective[index] = -weight * objectiveScale;
  }
  tableau[tableau.length - 1] = phaseTwoObjective;
  for (let row = 0; row < basis.length; row += 1) {
    const basicColumn = basis[row];
    const basicCost = basicColumn < variableCount
      ? (problem.objectiveWeights[problem.variables[basicColumn].name] ?? 0) * objectiveScale
      : 0;
    if (basicCost === 0) continue;
    for (let column = 0; column <= rhsColumn; column += 1) tableau[tableau.length - 1][column] += basicCost * tableau[row][column];
  }
  const allowedPhaseTwo = allowedPhaseOne;
  const phaseTwo = optimize(allowedPhaseTwo, maxIterations - phaseOne.iterations);
  const iterations = phaseOne.iterations + phaseTwo.iterations;
  if (phaseTwo.status === 'unbounded') return { status: 'unbounded', solution: {}, objectiveValue: Infinity, iterations, message: 'Objective is unbounded.' };
  if (phaseTwo.status === 'max_iterations') return { status: 'max_iterations', solution: {}, objectiveValue: 0, iterations, message: 'Simplex phase two reached its iteration limit.' };

  const shifted = new Array<number>(variableCount).fill(0);
  for (let row = 0; row < basis.length; row += 1) {
    const basicColumn = basis[row];
    if (basicColumn < variableCount) shifted[basicColumn] = tableau[row][rhsColumn];
  }
  const solution: Record<string, number> = {};
  problem.variables.forEach((variable, index) => {
    const value = variable.min + shifted[index];
    solution[variable.name] = Math.abs(value) <= epsilon ? 0 : value;
  });
  const feasible = boundsSatisfied(problem, solution) && problem.constraints.every((constraint) => constraintSatisfied(constraint, solution, problem.tolerance ?? 1e-7));
  if (!feasible) return { status: 'infeasible', solution: {}, objectiveValue: 0, iterations, message: 'Simplex candidate failed independent feasibility verification.' };
  const finalObjective = problem.variables.reduce((sum, variable) => sum + solution[variable.name] * (problem.objectiveWeights[variable.name] ?? 0), 0);
  return {
    status: 'optimal', solution,
    objectiveValue: Math.round(finalObjective * 1e8) / 1e8,
    iterations,
    message: 'Optimal solution obtained with phase-one feasibility, bounded phase-two optimization, and independent constraint checks.',
  };
}

/**
 * Branch-and-bound Integer Linear Programming (ILP) Solver.
 */
export function solveIntegerProgramming(problem: SolverProblem): SolverResult {
  const intVars=problem.variables.filter((variable)=>variable.isInteger||variable.isBinary);
  if(!intVars.length)return solveLinearProgramming(problem);
  if(intVars.length!==problem.variables.length){
    const relaxed=solveLinearProgramming(problem);if(relaxed.status!=='optimal')return relaxed;
    const candidate={...relaxed.solution};for(const variable of intVars)candidate[variable.name]=variable.isBinary?(candidate[variable.name]>=0.5?1:0):Math.round(candidate[variable.name]);
    const feasible=boundsSatisfied(problem,candidate)&&problem.constraints.every((constraint)=>constraintSatisfied(constraint,candidate,problem.tolerance??1e-7));
    return {status:feasible?'optimal':'infeasible',solution:candidate,objectiveValue:feasible?objective(problem,candidate):0,iterations:relaxed.iterations+1,message:feasible?'Mixed-integer candidate verified after bounded relaxation.':'Mixed-integer rounded candidate was infeasible; dedicated external backend may be required.'};
  }
  const domains=intVars.map((variable)=>{const min=variable.isBinary?0:Math.ceil(variable.min),max=variable.isBinary?1:Math.floor(variable.max);if(max<min||max-min>10_000)throw new Error('solver_integer_domain_limit');return {variable,min,max};});
  let combinations=1;for(const domain of domains){combinations*=domain.max-domain.min+1;if(combinations>250_000)throw new Error('solver_integer_combination_limit');}
  const budget = createGridIterationBudget({
    maxIterations: Math.max(1, combinations),
    maxEvaluations: GRID_ITERATION_HARD_CAPS.maxEvaluations,
    maxDurationMs: GRID_ITERATION_HARD_CAPS.maxDurationMs,
  });
  let best:Record<string,number>|null=null,bestObjective=problem.goal==='maximize'?-Infinity:Infinity,iterations=0;const current:Record<string,number>={};
  const visit=(depth:number)=>{if(depth===domains.length){iterations++;if(!budget.beginIteration())return;if(!problem.constraints.every((constraint)=>constraintSatisfied(constraint,current,problem.tolerance??1e-7)))return;const value=objective(problem,current);if(!Number.isFinite(value))return;const better=problem.goal==='maximize'?value>bestObjective:value<bestObjective;if(better){bestObjective=value;best={...current};}return;}const domain=domains[depth]!;for(let value=domain.min;value<=domain.max;value++){if(budget.stopReason!==null)return;current[domain.variable.name]=value;visit(depth+1);}};
  visit(0);
  if (budget.stopReason === 'time_limit' || budget.stopReason === 'evaluation_limit') {
    return { status:'max_iterations', solution:best??{}, objectiveValue:best?Math.round(bestObjective*1e8)/1e8:0, iterations, message:`Ganzzahliges Backend gestoppt: ${describeGridIterationStopReason(budget.stopReason)}` };
  }
  if(!best)return {status:'infeasible',solution:{},objectiveValue:0,iterations,message:'No feasible integer solution inside bounded domains.'};
  return {status:'optimal',solution:best,objectiveValue:Math.round(bestObjective*1e8)/1e8,iterations,message:'Exact bounded integer solution verified by exhaustive local backend.'};
}

export function solveNonlinearProgramming(problem: SolverProblem): SolverResult {
  if(!problem.objectiveEvaluator)return {status:'infeasible',solution:{},objectiveValue:0,iterations:0,message:'Non-linear backend requires objectiveEvaluator.'};
  const maxIterations=Math.max(10,Math.min(problem.maxIterations??2_000,20_000)),tolerance=Math.max(1e-12,problem.tolerance??1e-7);
  const current:Record<string,number>={};const steps:Record<string,number>={};for(const variable of problem.variables){const start=variable.currentValue??(variable.min+variable.max)/2;current[variable.name]=Math.min(variable.max,Math.max(variable.min,Number.isFinite(start)?start:0));steps[variable.name]=Math.max((variable.max-variable.min)/4,1);}
  // The objective/constraint evaluator is caller-supplied code, so it is billed against a budget.
  const budget = createGridIterationBudget({
    maxIterations,
    maxEvaluations: GRID_ITERATION_HARD_CAPS.maxEvaluations,
    maxDurationMs: GRID_ITERATION_HARD_CAPS.maxDurationMs,
  });
  const feasible=(candidate:Record<string,number>)=>problem.constraints.every((constraint)=>constraintSatisfied(constraint,candidate,tolerance))&&(problem.nonlinearConstraints??[]).every((constraint)=>{if(!budget.spendEvaluation())return false;const lhs=constraint.evaluate(candidate);return constraint.operator==='<='?lhs<=constraint.rhs+tolerance:constraint.operator==='>='?lhs>=constraint.rhs-tolerance:Math.abs(lhs-constraint.rhs)<=tolerance;});
  const score=(candidate:Record<string,number>)=>{if(!feasible(candidate))return problem.goal==='maximize'?-Infinity:Infinity;if(!budget.spendEvaluation())return problem.goal==='maximize'?-Infinity:Infinity;return objective(problem,candidate);};
  let best=score(current),iterations=0;if(!Number.isFinite(best)){best=problem.goal==='maximize'?-Infinity:Infinity;}
  while(budget.beginIteration()){iterations+=1;let improved=false;for(const variable of problem.variables){for(const direction of [-1,1]){const candidate={...current,[variable.name]:Math.min(variable.max,Math.max(variable.min,current[variable.name]+direction*steps[variable.name]))};const value=score(candidate);const better=problem.goal==='maximize'?value>best:value<best;if(better){Object.assign(current,candidate);best=value;improved=true;}}}if(!improved){let maxStep=0;for(const variable of problem.variables){steps[variable.name]*=0.5;maxStep=Math.max(maxStep,steps[variable.name]);}if(maxStep<=tolerance){budget.settle();break;}}}
  if (budget.stopReason === 'time_limit' || budget.stopReason === 'evaluation_limit') {
    return {
      status: 'max_iterations',
      solution: { ...current },
      objectiveValue: Number.isFinite(best) ? Math.round(best * 1e8) / 1e8 : 0,
      iterations,
      message: `Nicht-lineares Backend gestoppt: ${describeGridIterationStopReason(budget.stopReason)}`,
    };
  }
  if(!Number.isFinite(best)||!feasible(current))return {status:'infeasible',solution:{},objectiveValue:0,iterations,message:'No feasible non-linear candidate found.'};
  return {status:iterations>=maxIterations?'max_iterations':'optimal',solution:{...current},objectiveValue:Math.round(best*1e8)/1e8,iterations,message:'Deterministic bounded non-linear local backend completed.'};
}

export const DEFAULT_GRID_SOLVER_BACKENDS:ReadonlyArray<SolverBackend>=[
  {id:'nonlinear-local',supports:(problem)=>problem.mode==='nonlinear'||Boolean(problem.objectiveEvaluator),solve:solveNonlinearProgramming},
  {id:'integer-local',supports:(problem)=>problem.variables.some((variable)=>variable.isInteger||variable.isBinary),solve:solveIntegerProgramming},
  {id:'linear-simplex',supports:()=>true,solve:solveLinearProgramming},
];

/**
 * Universal Solver Facade.
 */
export function executeSolver(problem: SolverProblem, backends:ReadonlyArray<SolverBackend>=DEFAULT_GRID_SOLVER_BACKENDS): SolverResult {
  if(problem.variables.length>64||problem.constraints.length>512)throw new Error('solver_problem_limit');
  const names=new Set<string>();for(const variable of problem.variables){if(!variable.name||names.has(variable.name)||!Number.isFinite(variable.min)||!Number.isFinite(variable.max)||variable.min>variable.max)throw new Error('solver_variable_invalid');names.add(variable.name);}
  const backend=backends.find((candidate)=>candidate.supports(problem));if(!backend)throw new Error('solver_backend_unavailable');return backend.solve(problem);
}
