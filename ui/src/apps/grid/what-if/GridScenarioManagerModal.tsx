// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Scenario Manager Modal

import React, { useState } from 'react';
import { Layers, X, Plus, Trash2, Play, FileSpreadsheet } from 'lucide-react';
import { GridCell, GridScenario, GridSheetModel } from '../../../shared/contracts/grid/workspaceGrid';
import {
  generateScenarioSummary,
  createScenarioSummarySheet,
} from './gridScenarios';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_ANALYSIS_COPY } from '../locale/gridAnalysisLocale';

interface GridScenarioManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarios: GridScenario[];
  cells: Record<string, GridCell>;
  sheetId: string;
  onUpdateScenarios: (scenarios: GridScenario[]) => void;
  onApplyScenario: (scenario: GridScenario) => boolean | void;
  onAddSummarySheet: (newSheet: GridSheetModel, newCells: Record<string, GridCell>) => boolean | void;
}

export const GridScenarioManagerModal: React.FC<GridScenarioManagerModalProps> = ({
  isOpen,
  onClose,
  scenarios,
  cells,
  sheetId,
  onUpdateScenarios,
  onApplyScenario,
  onAddSummarySheet,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_ANALYSIS_COPY[locale].scenario;
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarios[0]?.id || '');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newChangingCells, setNewChangingCells] = useState('B1, B2');
  const [newValues, setNewValues] = useState<Record<string, string>>({});
  const [resultCellsInput, setResultCellsInput] = useState('B5');
  const [summaryError, setSummaryError] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeScenario = scenarios.find((s) => s.id === selectedScenarioId);

  const handleStartAdd = () => {
    setIsAdding(true);
    setNewName(copy.defaultName(scenarios.length + 1));
    const coords = newChangingCells.split(',').map((c: string) => c.trim().toUpperCase()).filter(Boolean);
    const initialVals: Record<string, string> = {};
    for (const c of coords) {
      initialVals[c] = String(cells[c]?.value ?? '');
    }
    setNewValues(initialVals);
  };

  const handleSaveAdd = () => {
    if (!newName.trim()) return;
    const coords = newChangingCells.split(',').map((c: string) => c.trim().toUpperCase()).filter(Boolean);
    const parsedValues: Record<string, string | number> = {};
    for (const c of coords) {
      const v = newValues[c] ?? '';
      const num = Number(v);
      parsedValues[c] = !isNaN(num) && v.trim() !== '' ? num : v;
    }

    const created: GridScenario = {
      id: `sc-${Date.now()}`,
      name: newName.trim(),
      sheetId,
      changingCells: coords,
      values: parsedValues,
    };

    const next = [...scenarios, created];
    onUpdateScenarios(next);
    setSelectedScenarioId(created.id);
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    const next = scenarios.filter((s) => s.id !== id);
    onUpdateScenarios(next);
    if (selectedScenarioId === id) {
      setSelectedScenarioId(next[0]?.id || '');
    }
  };

  const handleShow = () => {
    if (activeScenario) {
      const committed = onApplyScenario(activeScenario);
      if (committed === false) return;
      onClose();
    }
  };

  const handleGenerateSummary = async () => {
    try {
      const resCoords = resultCellsInput.split(',').map((c: string) => c.trim().toUpperCase()).filter(Boolean);
      const summary = await generateScenarioSummary(scenarios, resCoords, cells);
      const { sheet, cells: summaryCells } = createScenarioSummarySheet(summary, 1);
      if (onAddSummarySheet(sheet, summaryCells) === false) {
        setSummaryError(copy.reportNotAdded);
        return;
      }
      setSummaryError(null);
      onClose();
    } catch {
      setSummaryError(copy.reportFailed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="grid-scenario-title" className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto text-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-400" />
            <h3 id="grid-scenario-title" className="min-w-0 break-words text-sm font-semibold text-white tracking-wide">{copy.title}</h3>
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
          {!isAdding ? (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              {/* Scenario list */}
              <div className="sm:col-span-5 border border-white/10 rounded-lg p-2 bg-slate-950/50 flex flex-col min-h-56">
                <div className="text-[0.6875rem] font-semibold text-slate-400 px-1 mb-2">{copy.existing}:</div>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {scenarios.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setSelectedScenarioId(sc.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                        selectedScenarioId === sc.id
                          ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-medium'
                          : 'hover:bg-white/5 text-slate-300'
                      }`}
                    >
                      {sc.name}
                    </button>
                  ))}
                  {scenarios.length === 0 && (
                    <p className="text-slate-500 italic p-2">{copy.empty}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleStartAdd}
                  className="mt-2 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-purple-400" />
                  <span>{copy.add}</span>
                </button>
              </div>

              {/* Scenario details */}
              <div className="sm:col-span-7 border border-white/10 rounded-lg p-3 bg-slate-950/30 flex flex-col justify-between min-h-56">
                {activeScenario ? (
                  <div className="space-y-2.5 overflow-y-auto">
                  <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-white text-sm">{activeScenario.name}</h4>
                      <button
                        type="button"
                        onClick={() => handleDelete(activeScenario.id)}
                        className="text-red-400 hover:text-red-300 p-1"
                        aria-label={copy.delete} title={copy.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[0.6875rem] text-slate-400">{copy.changing}:</span>
                      <div className="space-y-1 mt-1 max-h-24 overflow-y-auto pr-1">
                        {Object.entries(activeScenario.values).map(([coord, val]) => (
                          <div
                            key={coord}
                            className="flex items-center justify-between px-2 py-1 bg-slate-900 rounded border border-white/5"
                          >
                            <span className="font-mono text-purple-300">{coord}</span>
                            <span className="font-mono text-white font-medium">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 italic flex items-center justify-center h-full">
                    {copy.choose}
                  </p>
                )}

                {activeScenario && (
                  <div className="pt-2 border-t border-white/10 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleShow}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors shadow-lg shadow-purple-600/20"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{copy.apply}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Adding new scenario */
            <div className="space-y-3 bg-slate-950/40 p-3 rounded-lg border border-white/10">
              <div>
                <label htmlFor="grid-scenario-name" className="block text-slate-400 mb-1 font-medium">{copy.name}:</label>
                <input
                  id="grid-scenario-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  {copy.changing}:
                </label>
                <input
                  type="text"
                  value={newChangingCells}
                  onChange={(e) => {
                    setNewChangingCells(e.target.value);
                    const coords = e.target.value.split(',').map((c: string) => c.trim().toUpperCase()).filter(Boolean);
                    const v: Record<string, string> = { ...newValues };
                    for (const c of coords) {
                      if (v[c] === undefined) v[c] = String(cells[c]?.value ?? '');
                    }
                    setNewValues(v);
                  }}
                  placeholder={copy.changingPlaceholder}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded text-white font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="text-[0.6875rem] text-slate-400 font-medium">{copy.values}:</span>
                <div className="grid grid-cols-2 gap-2 max-h-24 overflow-y-auto pr-1">
                  {newChangingCells
                    .split(',')
                    .map((c) => c.trim().toUpperCase())
                    .filter(Boolean)
                    .map((coord) => (
                      <div key={coord} className="flex items-center gap-2">
                        <span className="font-mono text-purple-300 w-8">{coord}:</span>
                        <input
                          type="text"
                          value={newValues[coord] ?? ''}
                          onChange={(e) => setNewValues({ ...newValues, [coord]: e.target.value })}
                          className="flex-1 px-2 py-1 bg-slate-900 border border-white/10 rounded text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white"
                >
                  {copy.back}
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdd}
                  className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium"
                >
                  {copy.save}
                </button>
              </div>
            </div>
          )}

          {/* Scenario Summary section */}
          {scenarios.length > 0 && !isAdding && (
            <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 items-center">
              <div className="flex items-center gap-2">
                <label htmlFor="grid-scenario-result-cells" className="text-slate-400">{copy.resultCells}:</label>
                <input
                  id="grid-scenario-result-cells"
                  type="text"
                  value={resultCellsInput}
                  onChange={(e) => setResultCellsInput(e.target.value.toUpperCase())}
                  placeholder={copy.resultPlaceholder}
                  aria-label={copy.resultCells}
                  className="w-24 px-2 py-1 bg-slate-950 border border-white/10 rounded text-white font-mono text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateSummary}
                className="justify-self-end flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-medium border border-white/10 transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>{copy.createReport}</span>
              </button>
              {summaryError && <p role="alert" className="col-span-2 text-rose-300">{summaryError}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-white/10 bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            {copy.closeAction}
          </button>
        </div>
      </div>
    </div>
  );
};
