// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative interactive Slicer tool for tables and pivot sheets

import React, { useMemo, useState } from 'react';
import { Filter, X, Check, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { GridCell, GridSlicerDefinition } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_ANALYSIS_COPY } from '../locale/gridAnalysisLocale';
import { buildAutoFilterValues } from '../data/gridAutoFilter';

interface GridSlicerModalProps {
  isOpen: boolean;
  cells: Record<string, GridCell>;
  colCount: number;
  rowCount: number;
  slicers: GridSlicerDefinition[];
  onClose: () => void;
  onUpdateSlicers: (slicers: GridSlicerDefinition[]) => void;
}

export const GridSlicerModal: React.FC<GridSlicerModalProps> = ({
  isOpen,
  cells,
  colCount,
  rowCount,
  slicers,
  onClose,
  onUpdateSlicers,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_ANALYSIS_COPY[locale].slicer;
  const [selectedCol, setSelectedCol] = useState('A');
  const [slicerTitle, setSlicerTitle] = useState('');

  /** Datenzeilen des Blattes (ohne Kopfzeile) — aufsteigend, ohne Wiederholung, einmal berechnet. */
  const dataRowIndices = useMemo(() => {
    const rows: number[] = [];
    for (let row = 1; row < rowCount; row += 1) rows.push(row);
    return rows;
  }, [rowCount]);

  /**
   * Filterwerte je Datenschnitt aus dem **gemeinsamen** AutoFilter-Modell (W-313).
   *
   * Vorher stand hier eine eigene Sammlung: Abbruch bei 10 000 Werten **ohne Hinweis**, Sortierung über
   * `localeCompare` (sprachabhängig!) und Ausführung bei **jedem** Rendern. Das Modell liefert 1 000 Werte,
   * eine feste Reihenfolge, die Anzahl je Wert und — wichtig — die **sichtbare** Kappung, damit niemand eine
   * unvollständige Liste für vollständig hält.
   */
  const filterValues = useMemo(() => {
    const bySlicer = new Map<string, { values: readonly { value: string; label: string; count: number }[]; truncated: boolean }>();
    for (const slicer of slicers) {
      const result = buildAutoFilterValues({ cells, dataRowIndices, column: slicer.column, blankLabel: copy.blanks });
      bySlicer.set(slicer.id, result.ok
        ? { values: result.value.values, truncated: result.value.scanTruncated || result.value.valueCapped }
        : { values: [], truncated: false });
    }
    return bySlicer;
  }, [cells, dataRowIndices, slicers]);

  if (!isOpen) return null;

  const handleAddSlicer = () => {
    const col = selectedCol.toUpperCase();
    const title = slicerTitle.trim() || copy.column(col, '');
    const newSlicer: GridSlicerDefinition = {
      id: createGridSecureId('slicer'),
      title,
      column: col,
      selectedValues: [],
    };
    onUpdateSlicers([...slicers, newSlicer]);
    setSlicerTitle('');
  };

  const handleDeleteSlicer = (id: string) => {
    const updated = slicers.filter((s) => s.id !== id);
    onUpdateSlicers(updated);
  };

  const handleToggleValue = (slicer: GridSlicerDefinition, val: string) => {
    const isSelected = slicer.selectedValues.includes(val);
    const nextValues = isSelected
      ? slicer.selectedValues.filter((v) => v !== val)
      : [...slicer.selectedValues, val];

    const updated = slicers.map((s) => (s.id === slicer.id ? { ...s, selectedValues: nextValues } : s));
    onUpdateSlicers(updated);
  };

  const handleClearSlicer = (slicer: GridSlicerDefinition) => {
    const updated = slicers.map((s) => (s.id === slicer.id ? { ...s, selectedValues: [] } : s));
    onUpdateSlicers(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div role="dialog" aria-modal="true" aria-labelledby="grid-slicer-title" className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-hidden text-xs flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-purple-400" />
            <span id="grid-slicer-title" className="font-bold text-slate-100 text-sm">{copy.title}</span>
          </div>
          <button aria-label={copy.close} type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add Slicer Control */}
        <div className="p-3 bg-slate-950/60 border-b border-white/10 flex flex-wrap items-center gap-2">
          <select
            value={selectedCol}
            onChange={(e) => setSelectedCol(e.target.value)}
            className="bg-black/40 border border-white/10 rounded px-2.5 py-1 text-slate-200 outline-none focus:border-purple-500 font-mono"
          >
            {Array.from({ length: colCount }).map((_, i) => {
              const letter = toA1(i, 0).replace(/\d+$/, '');
              const header = String(cells[`${letter}1`]?.value ?? '');
              return (
                <option key={letter} value={letter}>
                  {copy.column(letter, header)}
                </option>
              );
            })}
          </select>

          <input
            type="text"
            value={slicerTitle}
            onChange={(e) => setSlicerTitle(e.target.value)}
            placeholder={copy.titlePlaceholder}
            aria-label={copy.titlePlaceholder}
            className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded px-2.5 py-1 text-slate-100 outline-none focus:border-purple-500"
          />

          <button
            type="button"
            onClick={handleAddSlicer}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3 h-3" />
            <span>{copy.add}</span>
          </button>
        </div>

        {/* Active Slicers Container */}
        <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
          {slicers.length === 0 ? (
            <div className="text-center py-8 text-slate-500 italic text-[0.6875rem]">
              {copy.empty}
            </div>
          ) : (
            slicers.map((slicer) => {
              const distinct = filterValues.get(slicer.id) ?? { values: [], truncated: false };
              return (
                <div key={slicer.id} className="bg-slate-950/80 border border-white/10 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{slicer.title}</span>
                      <span className="text-[0.625rem] text-purple-400 font-mono">[Col {slicer.column}]</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {slicer.selectedValues.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleClearSlicer(slicer)}
                          className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[0.625rem] text-slate-400 hover:text-white flex items-center gap-1"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>{copy.clear(slicer.selectedValues.length)}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteSlicer(slicer.id)}
                        className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded"
                        aria-label={copy.remove} title={copy.remove}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Filter Value Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {distinct.values.length === 0 ? (
                      <span className="text-slate-500 italic text-[0.625rem]">{copy.noValues(slicer.column)}</span>
                    ) : (
                      distinct.values.map((entry) => {
                        const active = slicer.selectedValues.includes(entry.value);
                        return (
                          <button
                            key={entry.value}
                            type="button"
                            title={`${entry.label} · ${entry.count}`}
                            onClick={() => handleToggleValue(slicer, entry.value)}
                            className={`px-2.5 py-1 rounded-md text-[0.6875rem] font-medium transition-all flex items-center gap-1.5 ${
                              active
                                ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-400'
                                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                            }`}
                          >
                            {active && <Check className="w-2.5 h-2.5" />}
                            <span>{entry.label}</span>
                          </button>
                        );
                      })
                    )}
                    {distinct.truncated && (
                      <p role="status" className="basis-full text-[0.625rem] text-amber-300/90">
                        {copy.valueLimit(distinct.values.length)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
