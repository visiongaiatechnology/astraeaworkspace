// STATUS: DIAMANT VGT SUPREME
// Astraea Grid What-If Analysis: Goal Seek Solver & Scenario Manager

import React, { useState } from 'react';
import { Sparkles, Target, Layers, X, Check, Play, Trash2 } from 'lucide-react';
import { GridCell } from '../../../shared/contracts/workspace';
import { evaluateFormula } from '../formulas/formula';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_WHAT_IF_COPY, gridWhatIfFailureCopy } from '../locale/gridWhatIfLocale';

interface Scenario {
  id: string;
  name: string;
  values: Record<string, string | number | boolean>;
}

interface GridWhatIfModalProps {
  isOpen: boolean;
  cells: Record<string, GridCell>;
  selectedCell: string;
  onClose: () => void;
  onApplyGoalSeekSolution: (changingCell: string, solvedValue: number) => void;
  onApplyScenario: (values: Record<string, string | number | boolean>) => boolean | Promise<boolean>;
}

export const GridWhatIfModal: React.FC<GridWhatIfModalProps> = ({
  isOpen,
  cells,
  selectedCell,
  onClose,
  onApplyGoalSeekSolution,
  onApplyScenario,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_WHAT_IF_COPY[locale];
  const [tab, setTab] = useState<'goalseek' | 'scenarios'>('goalseek');

  // Goal Seek State
  const [targetCell, setTargetCell] = useState(selectedCell);
  const [targetValue, setTargetValue] = useState('');
  const [changingCell, setChangingCell] = useState('A1');
  const [solverResult, setSolverResult] = useState<{ status: 'idle' | 'success' | 'error'; message: string; solvedValue?: number }>({
    status: 'idle',
    message: '',
  });

  // Scenarios State
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: 'sc-1', name: copy.fallbackSampleName, values: { [selectedCell]: cells[selectedCell]?.value ?? '' } },
  ]);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [scenarioChangingCoord, setScenarioChangingCoord] = useState(selectedCell);
  const [scenarioChangingVal, setScenarioChangingVal] = useState('');
  const [scenarioApplyError, setScenarioApplyError] = useState('');
  const [isApplyingScenario, setIsApplyingScenario] = useState(false);

  if (!isOpen) return null;

  const handleRunGoalSeek = async () => {
    const tCoord = targetCell.trim().toUpperCase();
    const cCoord = changingCell.trim().toUpperCase();
    const tVal = Number(targetValue);

    if (!tCoord || !cCoord || isNaN(tVal)) {
      setSolverResult({ status: 'error', message: copy.invalidInput });
      return;
    }

    if (tCoord === cCoord) {
      setSolverResult({ status: 'error', message: copy.sameCell });
      return;
    }

    // Numerical root-finding: Bisection / Secant search
    const cloneCells: Record<string, GridCell> = {};
    for (const [k, v] of Object.entries(cells)) cloneCells[k] = { ...v };

    try {
      const evaluateTarget = async (x: number): Promise<number> => {
        cloneCells[cCoord] = { ...cloneCells[cCoord], value: x, formula: undefined };
        const res = await evaluateFormula(cloneCells[tCoord]?.formula || String(cloneCells[tCoord]?.value ?? 0), cloneCells, { volatilePolicy: 'disabled' });
        const numeric = Number(res);
        if (!Number.isFinite(numeric)) throw new Error('goal_seek_non_numeric');
        return numeric;
      };

    let x0 = Number(cloneCells[cCoord]?.value ?? 0) || 1;
    let y0 = (await evaluateTarget(x0)) - tVal;

    if (Math.abs(y0) < 1e-4) {
      setSolverResult({ status: 'success', message: copy.alreadyAtTarget(tCoord), solvedValue: x0 });
      return;
    }

    let x1 = x0 + 1;
    let y1 = (await evaluateTarget(x1)) - tVal;

    let iterations = 0;
    let solved = false;
    let solvedX = x1;

    while (iterations < 100) {
      iterations++;
      if (Math.abs(y1 - y0) < 1e-9) {
        x1 += 0.5;
        y1 = (await evaluateTarget(x1)) - tVal;
      }

      // Secant formula
      const nextX = x1 - y1 * ((x1 - x0) / (y1 - y0));
      const nextY = (await evaluateTarget(nextX)) - tVal;

      if (Math.abs(nextY) < 1e-4 || isNaN(nextY)) {
        solvedX = Math.round(nextX * 1e6) / 1e6;
        solved = true;
        break;
      }

      x0 = x1;
      y0 = y1;
      x1 = nextX;
      y1 = nextY;
    }

    if (solved) {
      setSolverResult({ status: 'success', message: copy.converged(iterations, cCoord, solvedX), solvedValue: solvedX });
    } else {
      setSolverResult({
        status: 'error',
        message: copy.failedToConverge(String(tVal)),
      });
    }
    } catch {
      setSolverResult({ status: 'error', message: gridWhatIfFailureCopy(locale, undefined) });
    }
  };

  const handleAddScenario = () => {
    if (!newScenarioName.trim()) return;
    const s: Scenario = {
      id: `scenario-${Date.now()}`,
      name: newScenarioName.trim(),
      values: { [scenarioChangingCoord.toUpperCase()]: scenarioChangingVal },
    };
    setScenarios([...scenarios, s]);
    setNewScenarioName('');
  };

  const applyScenario = async (values: Record<string, string | number | boolean>) => {
    if (isApplyingScenario) return;
    setIsApplyingScenario(true);
    setScenarioApplyError('');
    try {
      const committed = await onApplyScenario(values);
      if (committed) {
        onClose();
        return;
      }
      setScenarioApplyError(copy.scenarioNotApplied);
    } catch {
      setScenarioApplyError(copy.scenarioCommitFailed);
    } finally {
      setIsApplyingScenario(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="grid-whatif-title" className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto text-xs flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span id="grid-whatif-title" className="font-bold text-slate-100 text-sm">{copy.title}</span>
          </div>
          <button aria-label={copy.close} type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-white/10 bg-slate-950/40 p-1 gap-1">
          <button
            type="button"
            onClick={() => setTab('goalseek')}
            className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors font-medium ${
              tab === 'goalseek' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>{copy.goalSeek}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('scenarios')}
            className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors font-medium ${
              tab === 'scenarios' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{copy.scenarios}</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {tab === 'goalseek' && (
            <div className="space-y-3">
              <p className="text-slate-400 text-[0.6875rem]">
                {copy.description}
              </p>

              <div className="space-y-2">
                <div>
                  <label htmlFor="grid-whatif-target-cell" className="text-[0.6875rem] font-medium text-slate-300 block mb-1">{copy.setCell}:</label>
                  <input
                    id="grid-whatif-target-cell"
                    type="text"
                    value={targetCell}
                    onChange={(e) => setTargetCell(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-slate-100 font-mono outline-none focus:border-purple-500"
                    placeholder={copy.cellPlaceholder}
                  />
                </div>

                <div>
                  <label htmlFor="grid-whatif-target-value" className="text-[0.6875rem] font-medium text-slate-300 block mb-1">{copy.targetValue}:</label>
                  <input
                    id="grid-whatif-target-value"
                    type="number"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-slate-100 font-mono outline-none focus:border-purple-500"
                    placeholder="50000"
                    aria-label={copy.targetValue}
                  />
                </div>

                <div>
                  <label htmlFor="grid-whatif-changing-cell" className="text-[0.6875rem] font-medium text-slate-300 block mb-1">{copy.changingCell}:</label>
                  <input
                    id="grid-whatif-changing-cell"
                    type="text"
                    value={changingCell}
                    onChange={(e) => setChangingCell(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-slate-100 font-mono outline-none focus:border-purple-500"
                    placeholder={copy.cellPlaceholder}
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleRunGoalSeek}
                  className="flex-1 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Play className="w-3 h-3" />
                  <span>{copy.solve}</span>
                </button>
              </div>

              {solverResult.status !== 'idle' && (
                <div
                  className={`p-3 rounded border text-[0.6875rem] font-mono whitespace-pre-line ${
                    solverResult.status === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div>{solverResult.message}</div>
                  {solverResult.status === 'success' && solverResult.solvedValue !== undefined && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplyGoalSeekSolution(changingCell.trim().toUpperCase(), solverResult.solvedValue!);
                        onClose();
                      }}
                      className="mt-2 w-full py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-sans font-medium text-xs flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{copy.applySolution}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'scenarios' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="font-semibold text-slate-300">{copy.savedScenarios}</div>
                {scenarioApplyError && <div role="alert" className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-rose-300">{scenarioApplyError}</div>}
                <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                  {scenarios.map((sc) => (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between p-2 rounded bg-black/30 border border-white/5"
                    >
                      <div>
                        <div className="font-medium text-slate-200">{sc.name}</div>
                        <div className="text-[0.625rem] text-slate-500 font-mono">
                          {Object.entries(sc.values).map(([k, v]) => `${k}=${v}`).join(', ')}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => { void applyScenario(sc.values); }}
                          disabled={isApplyingScenario}
                          className="px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600/40 text-[0.6875rem] disabled:opacity-40"
                        >
                          {copy.apply}
                        </button>
                        <button aria-label={copy.deleteScenario}
                          type="button"
                          onClick={() => setScenarios(scenarios.filter((x) => x.id !== sc.id))}
                          className="p-1 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <div className="font-semibold text-slate-300">{copy.addScenario}</div>
                <input
                  type="text"
                  value={newScenarioName}
                  onChange={(e) => setNewScenarioName(e.target.value)}
                  aria-label={copy.scenarioName}
                  placeholder={copy.scenarioNamePlaceholder}
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-100"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={scenarioChangingCoord}
                    onChange={(e) => setScenarioChangingCoord(e.target.value)}
                    aria-label={copy.changingCell}
                    placeholder={copy.cellPlaceholder}
                    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-100 font-mono"
                  />
                  <input
                    type="text"
                    value={scenarioChangingVal}
                    onChange={(e) => setScenarioChangingVal(e.target.value)}
                    aria-label={copy.valuePlaceholder}
                    placeholder={copy.valuePlaceholder}
                    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddScenario}
                  className="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-medium"
                >
                  {copy.saveScenario}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
