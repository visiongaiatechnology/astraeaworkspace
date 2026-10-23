// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Goal Seek (Zielwertsuche) Modal

import React, { useState } from 'react';
import { Target, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { executeGoalSeek, GoalSeekResult } from './gridGoalSeek';
import { GridCell } from '../../../shared/contracts/grid/workspaceGrid';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_OFFICE_COPY, gridGoalSeekFailureCopy } from '../locale/gridOfficeLocale';

interface GridGoalSeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  cells: Record<string, GridCell>;
  initialSetCell?: string;
  onApplyResult: (changeCoord: string, newValue: number) => void;
}

export const GridGoalSeekModal: React.FC<GridGoalSeekModalProps> = ({
  isOpen,
  onClose,
  cells,
  initialSetCell = 'C1',
  onApplyResult,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_OFFICE_COPY[locale].goalSeek;
  const [setCell, setSetCell] = useState(initialSetCell);
  const [targetValue, setTargetValue] = useState('100');
  const [byChangingCell, setByChangingCell] = useState('A1');
  const [result, setResult] = useState<GoalSeekResult | null>(null);
  const [isSolving, setIsSolving] = useState(false);

  if (!isOpen) return null;

  const handleSolve = async () => {
    setIsSolving(true);
    setResult(null);
    try {
      const res = await executeGoalSeek(
        {
          setCell,
          targetValue: Number(targetValue),
          byChangingCell,
        },
        cells
      );
      setResult(res.error ? { ...res, error: gridGoalSeekFailureCopy(locale, res.error) } : res);
    } catch (err) {
      setResult({
        converged: false,
        finalValue: 0,
        resultingTargetValue: 0,
        iterations: 0,
        error: gridGoalSeekFailureCopy(locale, err),
      });
    } finally {
      setIsSolving(false);
    }
  };

  const handleAccept = () => {
    if (result && result.converged) {
      onApplyResult(byChangingCell.toUpperCase(), result.finalValue);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="grid-goal-seek-title" className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto text-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" />
            <h3 id="grid-goal-seek-title" className="text-sm font-semibold text-white tracking-wide">{copy.title}</h3>
          </div>
          <button aria-label={copy.close}
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label htmlFor="grid-goal-seek-target-cell" className="block text-slate-400 mb-1 font-medium">{copy.targetCell}:</label>
            <input
              id="grid-goal-seek-target-cell"
              type="text"
              value={setCell}
              onChange={(e) => setSetCell(e.target.value.toUpperCase())}
              placeholder={copy.cellPlaceholder}
              aria-label={copy.targetCell}
              className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-lg text-white font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="grid-goal-seek-target-value" className="block text-slate-400 mb-1 font-medium">{copy.targetValue}:</label>
            <input
              id="grid-goal-seek-target-value"
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={copy.valuePlaceholder}
              aria-label={copy.targetValue}
              className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-lg text-white font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="grid-goal-seek-changing-cell" className="block text-slate-400 mb-1 font-medium">{copy.changingCell}:</label>
            <input
              id="grid-goal-seek-changing-cell"
              type="text"
              value={byChangingCell}
              onChange={(e) => setByChangingCell(e.target.value.toUpperCase())}
              placeholder={copy.cellPlaceholder}
              aria-label={copy.changingCell}
              className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-lg text-white font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {result && (
            <div
              className={`p-3 rounded-lg border ${
                result.converged
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-red-950/40 border-red-500/40 text-red-300'
              } space-y-1.5`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {result.converged ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{copy.success}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span>{copy.failure}</span>
                  </>
                )}
              </div>
              <div className="text-[0.6875rem] space-y-0.5 pl-6 text-slate-300">
                <p>
                  {copy.newValue(byChangingCell)}: <strong className="text-white">{result.finalValue}</strong>
                </p>
                <p>
                  {copy.calculatedTarget}: <strong className="text-white">{result.resultingTargetValue}</strong>
                </p>
                <p className="text-slate-400">{copy.iterations}: {result.iterations}</p>
                {result.error && <p className="text-red-400 mt-1">{result.error}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-colors text-xs"
          >
            {copy.cancel}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSolving}
              onClick={handleSolve}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors border border-white/10"
            >
              {isSolving ? copy.solving : copy.solve}
            </button>
            {result?.converged && (
              <button
                type="button"
                onClick={handleAccept}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow-lg shadow-emerald-600/20"
              >
                {copy.accept}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
