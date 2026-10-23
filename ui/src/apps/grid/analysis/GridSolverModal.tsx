// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded local Solver UI for linear, integer and nonlinear optimization.

import React, { useMemo, useState } from 'react';
import { Sliders, X, Play, Check, Plus, Trash2 } from 'lucide-react';
import type { GridCell } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_SOLVER_COPY, gridSolverFailureCopy } from '../locale/gridSolverLocale';
import { executeSolver, type SolverProblem, type SolverResult, type SolverConstraint, type SolverVariable } from './gridSolver';
import { evaluateGridSafeExpression } from '../../../shared/expressions/gridSafeExpression';

interface GridSolverModalProps {
  isOpen: boolean;
  onClose: () => void;
  cells?: Record<string, GridCell>;
  selectedCell?: string;
  onApplySolution: (payload: { solution: Record<string, number>; problem: SolverProblem; result: SolverResult; auditInput: unknown }) => boolean | Promise<boolean>;
}

type UiConstraint = { id: string; expression: string; operator: '<=' | '>=' | '=='; rhs: number };
const CELL_RE = /^[A-Z]{1,3}[1-9]\d{0,6}$/;

export const GridSolverErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300 break-words">{message}</div>
);

function parseVariableNames(raw: string): string[] {
  const names = raw.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (!names.length || names.length > 32 || names.some((name) => !CELL_RE.test(name)) || new Set(names).size !== names.length) throw new Error('solver_variable_cells_invalid');
  return names;
}

function parseLinearWeights(expression: string, variables: string[]): Record<string, number> {
  const allowed = new Set(variables);
  const compact = expression.replace(/\s+/g, '').replace(/-/g, '+-');
  const weights: Record<string, number> = {};
  for (const raw of compact.split('+').filter(Boolean)) {
    const term = raw.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))?\*?([A-Z]{1,3}[1-9]\d{0,6})$/i);
    if (!term) throw new Error('solver_linear_expression_invalid');
    const name = term[2].toUpperCase();
    if (!allowed.has(name)) throw new Error('solver_unknown_variable');
    const coefficient = term[1] === undefined || term[1] === '' || term[1] === '+' ? 1 : term[1] === '-' ? -1 : Number(term[1]);
    if (!Number.isFinite(coefficient)) throw new Error('solver_coefficient_invalid');
    weights[name] = (weights[name] ?? 0) + coefficient;
  }
  if (!Object.keys(weights).length) throw new Error('solver_linear_expression_empty');
  return weights;
}

export const GridSolverModal: React.FC<GridSolverModalProps> = ({ isOpen, onClose, cells = {}, selectedCell = 'C1', onApplySolution }) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_SOLVER_COPY[locale];
  const [mode, setMode] = useState<'linear' | 'integer' | 'nonlinear'>('linear');
  const [goal, setGoal] = useState<'maximize' | 'minimize'>('maximize');
  const [varNamesInput, setVarNamesInput] = useState('A1, B1');
  const [objectiveExpression, setObjectiveExpression] = useState('40*A1 + 30*B1');
  const [bounds, setBounds] = useState<Record<string, { min: number; max: number }>>({ A1: { min: 0, max: 100 }, B1: { min: 0, max: 100 } });
  const [constraints, setConstraints] = useState<UiConstraint[]>([
    { id: 'c-1', expression: '2*A1 + 3*B1', operator: '<=', rhs: 120 },
    { id: 'c-2', expression: '4*A1 + B1', operator: '<=', rhs: 100 },
  ]);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [lastProblem, setLastProblem] = useState<SolverProblem | null>(null);
  const [error, setError] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const variableNames = useMemo(() => { try { return parseVariableNames(varNamesInput); } catch { return []; } }, [varNamesInput]);
  if (!isOpen) return null;

  const makeProblem = (): SolverProblem => {
    const names = parseVariableNames(varNamesInput);
    const variables: SolverVariable[] = names.map((name) => {
      const existing = bounds[name] ?? { min: 0, max: 100 };
      const initial = Number(cells[name]?.value ?? existing.min);
      if (!Number.isFinite(existing.min) || !Number.isFinite(existing.max) || existing.min > existing.max) throw new Error('solver_bounds_invalid');
      return { name, min: existing.min, max: existing.max, currentValue: Number.isFinite(initial) ? initial : existing.min, isInteger: mode === 'integer' };
    });
    if (mode === 'nonlinear') {
      const nonlinearConstraints = constraints.map((constraint) => ({
        id: constraint.id,
        operator: constraint.operator,
        rhs: constraint.rhs,
        evaluate: (solution: Record<string, number>) => evaluateGridSafeExpression(constraint.expression, solution),
      }));
      return {
        mode: 'nonlinear', goal, variables, constraints: [], objectiveWeights: {}, nonlinearConstraints,
        objectiveEvaluator: (solution) => evaluateGridSafeExpression(objectiveExpression, solution), maxIterations: 2000, tolerance: 1e-7,
      };
    }
    const linearConstraints: SolverConstraint[] = constraints.map((constraint) => ({ id: constraint.id, lhsWeights: parseLinearWeights(constraint.expression, names), operator: constraint.operator, rhs: constraint.rhs }));
    return { mode: 'linear', goal, variables, constraints: linearConstraints, objectiveWeights: parseLinearWeights(objectiveExpression, names), maxIterations: 5000, tolerance: 1e-7 };
  };

  const run = () => {
    try {
      const problem = makeProblem();
      const solved = executeSolver(problem);
      setLastProblem(problem); setResult(solved); setError('');
    } catch (cause) {
      setResult(null); setLastProblem(null); setError(gridSolverFailureCopy(locale, cause));
    }
  };
  const apply = async () => {
    if (result?.status !== 'optimal' || !lastProblem || isApplying) return;
    setIsApplying(true);
    setError('');
    try {
      const committed = await onApplySolution({
        solution: result.solution,
        problem: lastProblem,
        result,
        auditInput: {
          mode,
          goal,
          variables: lastProblem.variables.map(({ name, min, max, isInteger, isBinary }) => ({ name, min, max, isInteger, isBinary })),
          objectiveExpression,
          constraints,
        },
      });
      setIsApplying(false);
      if (committed) {
        onClose();
        return;
      }
      setError(gridSolverFailureCopy(locale, undefined, 'apply'));
    } catch {
      setIsApplying(false);
      setError(gridSolverFailureCopy(locale, undefined, 'commit'));
    }
  };
  const addConstraint = () => setConstraints((previous) => [...previous, { id: `c-${Date.now()}`, expression: variableNames[0] ?? 'A1', operator: '<=', rhs: 100 }]);

  return <div role="dialog" aria-modal="true" aria-labelledby="grid-solver-title" className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 text-slate-200 max-h-[92vh] overflow-auto">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10"><div className="flex min-w-0 items-center gap-2 text-purple-400"><Sliders className="w-5 h-5 shrink-0"/><h3 id="grid-solver-title" className="text-sm font-bold text-slate-100 break-words">{copy.title(selectedCell)}</h3></div><button aria-label={copy.close} type="button" disabled={isApplying} onClick={onClose} className="shrink-0 p-1 rounded-md text-slate-400 hover:bg-white/10 disabled:opacity-40"><X className="w-4 h-4"/></button></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{(['linear','integer','nonlinear'] as const).map((item)=><button key={item} type="button" onClick={()=>{setMode(item);setResult(null);}} className={`min-w-0 whitespace-normal rounded-lg border px-3 py-2 text-xs font-semibold ${mode===item?'border-purple-400/50 bg-purple-500/20 text-purple-200':'border-white/10 bg-slate-800 text-slate-400'}`}>{copy.modes[item]}</button>)}</div>
      <div className="grid md:grid-cols-2 gap-3 p-3.5 bg-slate-800/50 rounded-xl border border-white/5">
        <label className="min-w-0 space-y-1"><span className="text-xs font-semibold">{copy.decisionCells}</span><input aria-label={copy.decisionCells} value={varNamesInput} onChange={(e)=>setVarNamesInput(e.target.value)} className="w-full min-w-0 bg-slate-900 border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono" /></label>
        <label className="min-w-0 space-y-1"><span className="text-xs font-semibold">{copy.objectiveExpression}</span><input aria-label={copy.objectiveExpression} value={objectiveExpression} onChange={(e)=>setObjectiveExpression(e.target.value)} className="w-full min-w-0 bg-slate-900 border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono" /></label>
        <div className="md:col-span-2 flex flex-wrap gap-4 text-xs"><span className="text-slate-400">{copy.goal}:</span>{(['maximize','minimize'] as const).map((item)=><label key={item} className="flex items-center gap-1"><input type="radio" name="solver-goal" checked={goal===item} onChange={()=>setGoal(item)} className="accent-purple-500"/>{copy[item]}</label>)}</div>
      </div>
      <div className="space-y-2"><span className="text-xs font-semibold text-slate-300">{copy.bounds}</span><div className="grid md:grid-cols-2 gap-2">{variableNames.map((name)=>{const value=bounds[name]??{min:0,max:100};return <div key={name} className="grid grid-cols-[minmax(2rem,auto)_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center rounded-lg bg-slate-800/40 p-2 text-xs"><span className="font-mono text-cyan-300">{name}</span><input aria-label={copy.minimum(name)} type="number" value={value.min} onChange={(e)=>setBounds((prev)=>({...prev,[name]:{...value,min:Number(e.target.value)}}))} className="min-w-0 bg-slate-900 border border-white/10 rounded px-2 py-1"/><input aria-label={copy.maximum(name)} type="number" value={value.max} onChange={(e)=>setBounds((prev)=>({...prev,[name]:{...value,max:Number(e.target.value)}}))} className="min-w-0 bg-slate-900 border border-white/10 rounded px-2 py-1"/></div>;})}</div></div>
      <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-300">{copy.constraints(constraints.length)}</span><button type="button" onClick={addConstraint} className="whitespace-normal text-[0.6875rem] text-purple-400 flex gap-1"><Plus className="w-3.5 h-3.5 shrink-0"/>{copy.addConstraint}</button></div>{constraints.map((constraint,index)=><div key={constraint.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_70px_110px_32px] gap-2"><input aria-label={copy.constraintExpression(index+1)} value={constraint.expression} onChange={(e)=>setConstraints((prev)=>prev.map((item)=>item.id===constraint.id?{...item,expression:e.target.value}:item))} className="min-w-0 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs font-mono"/><select aria-label={copy.constraintOperator(index+1)} value={constraint.operator} onChange={(e)=>setConstraints((prev)=>prev.map((item)=>item.id===constraint.id?{...item,operator:e.target.value as UiConstraint['operator']}:item))} className="min-w-0 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs"><option>&lt;=</option><option>&gt;=</option><option>==</option></select><input aria-label={copy.constraintValue(index+1)} type="number" value={constraint.rhs} onChange={(e)=>setConstraints((prev)=>prev.map((item)=>item.id===constraint.id?{...item,rhs:Number(e.target.value)}:item))} className="min-w-0 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs"/><button aria-label={copy.deleteConstraint(index+1)} type="button" onClick={()=>setConstraints((prev)=>prev.filter((item)=>item.id!==constraint.id))} className="justify-self-start text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div>)}</div>
      {error && <GridSolverErrorMessage message={error} />}
      {result && <div className={`p-3 rounded-xl border text-xs ${result.status==='optimal'?'bg-emerald-500/15 border-emerald-500/30':'bg-rose-500/15 border-rose-500/30'}`}><div className="flex flex-wrap justify-between gap-2 font-bold"><span>{copy.statuses[result.status]}</span><span>{copy.objectiveValue}: {result.objectiveValue.toLocaleString(locale)}</span></div><div className="pt-1 font-mono break-words">{Object.entries(result.solution).map(([name,value])=>`${name}=${value.toLocaleString(locale)}`).join(' · ')}</div><p className="mt-1 text-[0.625rem] text-slate-400">{copy.iterations(result.iterations)}</p></div>}
      <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-white/10"><button type="button" onClick={run} disabled={isApplying} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-normal disabled:opacity-40"><Play className="w-3.5 h-3.5 shrink-0"/>{copy.run}</button><button type="button" onClick={apply} disabled={result?.status!=='optimal' || isApplying} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-normal disabled:opacity-50"><Check className="w-4 h-4 shrink-0"/>{isApplying ? copy.applying : copy.apply}</button></div>
    </div>
  </div>;
};
