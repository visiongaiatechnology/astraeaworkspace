// STATUS: DIAMANT VGT SUPREME — Monte Carlo Stochastic Risk Simulation Modal
import React, { useState } from 'react';
import { Activity, X, Play, Plus, Trash2 } from 'lucide-react';
import {
  runMonteCarloSimulation,
  createGridSeededRandom,
  StochasticVariable,
  MonteCarloResult,
  DistributionType,
  GRID_MONTE_CARLO_TEMPLATES,
} from './gridMonteCarlo';
import { evaluateGridSafeExpression } from '../../../shared/expressions/gridSafeExpression';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_MONTE_CARLO_COPY, gridMonteCarloFailureCopy, type GridMonteCarloTemplate } from '../locale/gridMonteCarloLocale';

interface GridMonteCarloModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCell?: string;
  onResult?: (payload: { expression: string; variables: StochasticVariable[]; iterations: number; seed: number; result: MonteCarloResult }) => void;
}

export const GridMonteCarloErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 break-words">{message}</div>
);

export const GridMonteCarloModal: React.FC<GridMonteCarloModalProps> = ({
  isOpen,
  onClose,
  selectedCell = 'D10',
  onResult,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_MONTE_CARLO_COPY[locale];
  const [iterations, setIterations] = useState<number>(3000);
  const [targetExpr, setTargetExpr] = useState('Umsatz - Kosten');
  const [variables, setVariables] = useState<StochasticVariable[]>([
    { id: 'v-1', name: 'Umsatz', distribution: 'normal', p1: 150000, p2: 25000 },
    { id: 'v-2', name: 'Kosten', distribution: 'triangular', p1: 60000, p2: 85000, p3: 110000 },
  ]);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [seed, setSeed] = useState<number>(42);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleRunSimulation = () => {
    try {
      const evaluator = (sampleMap: Record<string, number>): number => evaluateGridSafeExpression(targetExpr, sampleMap);
      const res = runMonteCarloSimulation(variables, evaluator, iterations, 24, createGridSeededRandom(seed), seed);
      setResult(res);
      setError('');
      onResult?.({ expression: targetExpr, variables, iterations, seed, result: res });
    } catch (cause) {
      setResult(null);
      setError(gridMonteCarloFailureCopy(locale, cause));
    }
  };

  const handleAddVariable = () => {
    const newVar: StochasticVariable = {
      id: `v-${Date.now()}`,
      name: `Var${variables.length + 1}`,
      distribution: 'normal',
      p1: 10000,
      p2: 2000,
    };
    setVariables((prev) => [...prev, newVar]);
  };

  const handleRemoveVariable = (id: string) => {
    setVariables((prev) => prev.filter((v) => v.id !== id));
  };

  const handleUpdateVar = (id: string, patch: Partial<StochasticVariable>) => {
    setVariables((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="grid-monte-carlo-title" className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-200 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex min-w-0 items-center space-x-2 text-cyan-400">
            <Activity className="w-5 h-5 shrink-0" />
            <h3 id="grid-monte-carlo-title" className="text-sm font-bold text-slate-100 break-words">{copy.title(selectedCell)}</h3>
          </div>
          <button aria-label={copy.close}
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {GRID_MONTE_CARLO_TEMPLATES.map((template) => (
            <button key={template.id} type="button" onClick={() => { setTargetExpr(template.expression); setVariables(template.variables.map((variable) => ({ ...variable }))); setResult(null); setError(''); }} className="max-w-full whitespace-normal px-2.5 py-1 rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-[0.625rem] text-cyan-300 hover:bg-cyan-500/20">
              {copy.template(copy.templates[template.id as GridMonteCarloTemplate] ?? template.name)}
            </button>
          ))}
        </div>

        {/* Configuration Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-slate-800/50 rounded-xl border border-white/5">
          <label className="min-w-0 space-y-1">
            <span className="text-xs font-semibold text-slate-300">{copy.objective}</span>
            <input
              type="text"
              value={targetExpr}
              onChange={(e) => setTargetExpr(e.target.value)}
              aria-label={copy.objective}
              className="w-full min-w-0 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-300"
            />
          </label>

          <label className="min-w-0 space-y-1">
            <span className="text-xs font-semibold text-slate-300">{copy.iterations}</span>
            <select
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              aria-label={copy.iterations}
              className="w-full min-w-0 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none"
            >
              <option value={1000}>{`${new Intl.NumberFormat(locale).format(1000)} ${copy.iterations} · ${copy.iterationLabels.fast}`}</option>
              <option value={3000}>{`${new Intl.NumberFormat(locale).format(3000)} ${copy.iterations} · ${copy.iterationLabels.standard}`}</option>
              <option value={10000}>{`${new Intl.NumberFormat(locale).format(10000)} ${copy.iterations} · ${copy.iterationLabels.precise}`}</option>
              <option value={25000}>{`${new Intl.NumberFormat(locale).format(25000)} ${copy.iterations} · ${copy.iterationLabels.extreme}`}</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-slate-300">{copy.seed}</span>
            <input type="number" aria-label={copy.seed} value={seed} onChange={(e) => setSeed(Number(e.target.value) || 1)} className="w-full min-w-0 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-300" />
          </label>
        </div>

        {/* Input Stochastic Variables */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">{copy.variables(variables.length)}</span>
            <button
              type="button"
              onClick={handleAddVariable}
              className="whitespace-normal text-[0.6875rem] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{copy.addVariable}</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {variables.map((v, variableIndex) => (
              <div
                key={v.id}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(4rem,5rem)_minmax(4rem,5rem)_auto] items-center gap-2 p-2 bg-slate-800/40 border border-white/5 rounded-lg text-xs"
              >
                <input
                  type="text"
                  value={v.name}
                  onChange={(e) => handleUpdateVar(v.id, { name: e.target.value })}
                  aria-label={copy.variableName(variableIndex + 1)}
                  className="w-full min-w-0 bg-slate-900 border border-white/10 rounded px-1.5 py-1 font-mono text-cyan-300"
                />
                <select
                  value={v.distribution}
                  onChange={(e) => handleUpdateVar(v.id, { distribution: e.target.value as DistributionType })}
                  aria-label={copy.distribution(variableIndex + 1)}
                  className="w-full min-w-0 bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-slate-200 text-[0.6875rem]"
                >
                  <option value="normal">{copy.distributions.normal}</option>
                  <option value="uniform">{copy.distributions.uniform}</option>
                  <option value="triangular">{copy.distributions.triangular}</option>
                  <option value="lognormal">{copy.distributions.lognormal}</option>
                </select>
                <input
                  type="number"
                  placeholder="P1"
                  aria-label={copy.parameterOne(v.name)}
                  value={v.p1}
                  onChange={(e) => handleUpdateVar(v.id, { p1: Number(e.target.value) })}
                  className="w-full min-w-0 bg-slate-900 border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200"
                />
                <input
                  type="number"
                  placeholder="P2"
                  aria-label={copy.parameterTwo(v.name)}
                  value={v.p2}
                  onChange={(e) => handleUpdateVar(v.id, { p2: Number(e.target.value) })}
                  className="w-full min-w-0 bg-slate-900 border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200"
                />
                {v.distribution === 'triangular' && (
                  <input
                    type="number"
                    placeholder="P3"
                    aria-label={copy.parameterThree(v.name)}
                    value={v.p3 ?? 100000}
                    onChange={(e) => handleUpdateVar(v.id, { p3: Number(e.target.value) })}
                    className="w-full min-w-0 bg-slate-900 border border-white/10 rounded px-1.5 py-1 font-mono text-slate-200"
                  />
                )}
                <button aria-label={copy.removeVariable(v.name)}
                  type="button"
                  onClick={() => handleRemoveVariable(v.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <GridMonteCarloErrorMessage message={error} />}

        {/* Simulation Output Dashboard */}
        {result && (
          <div className="space-y-3 pt-2 border-t border-white/10">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 bg-slate-800/60 rounded-xl border border-white/5">
                <span className="text-[0.625rem] text-slate-400 block">{copy.mean}</span>
                <span className="font-mono font-bold text-slate-100">{result.mean.toLocaleString()}</span>
              </div>
              <div className="p-2.5 bg-slate-800/60 rounded-xl border border-white/5">
                <span className="text-[0.625rem] text-slate-400 block">{copy.standardDeviation}</span>
                <span className="font-mono font-bold text-cyan-300">±{result.stdDev.toLocaleString()}</span>
              </div>
              <div className="p-2.5 bg-slate-800/60 rounded-xl border border-white/5">
                <span className="text-[0.625rem] text-slate-400 block">{copy.valueAtRisk}</span>
                <span className="font-mono font-bold text-rose-400">{result.var95.toLocaleString()}</span>
              </div>
              <div className="p-2.5 bg-slate-800/60 rounded-xl border border-white/5">
                <span className="text-[0.625rem] text-slate-400 block">{copy.median}</span>
                <span className="font-mono font-bold text-emerald-400">{result.median.toLocaleString()}</span>
              </div>
            </div>

            {/* Visual Histogram Chart */}
            <div className="p-3 bg-slate-950 border border-white/10 rounded-xl space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] text-slate-400 pb-1">
                <span>{copy.histogram}</span>
                <span className="font-mono text-cyan-400">P10: {result.percentiles.p10.toLocaleString(locale)} | P90: {result.percentiles.p90.toLocaleString(locale)}</span>
              </div>

              <div className="h-28 flex items-end gap-1 pt-2">
                {result.histogram.map((bin, bIdx) => {
                  const maxFreq = Math.max(...result.histogram.map((b) => b.frequency)) || 1;
                  const heightPercent = Math.max(4, Math.round((bin.frequency / maxFreq) * 100));
                  return (
                    <div
                      key={bIdx}
                      className="flex-1 bg-cyan-500/40 hover:bg-cyan-400/80 rounded-t transition-all group relative cursor-pointer"
                      style={{ height: `${heightPercent}%` }}
                      title={copy.histogramBin(Math.round(bin.x0), Math.round(bin.x1), bin.count, bin.frequency * 100)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleRunSimulation}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg shadow-cyan-500/20"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>{copy.run}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
