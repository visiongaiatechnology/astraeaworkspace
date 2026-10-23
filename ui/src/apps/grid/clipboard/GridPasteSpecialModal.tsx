// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Paste Special Modal

import React, { useMemo, useState } from 'react';
import {
  GridPasteSpecialMode,
  GridPasteSpecialOperation,
  GridPasteSpecialOptions,
} from '../../../shared/contracts/grid/workspaceGrid';
import { X, ClipboardPaste } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_OFFICE_COPY } from '../locale/gridOfficeLocale';
import type { GridPasteSpecialPreview } from '../editing/gridPasteSpecialPlan';

export const EMPTY_GRID_PASTE_PREVIEW: GridPasteSpecialPreview = {
  rows: [],
  totalChanges: 0,
  truncated: false,
  mode: 'all',
  rejectedReason: null,
};

interface GridPasteSpecialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (options: GridPasteSpecialOptions) => void;
  /** Preview is computed by the same planner that applies the paste. */
  onPreview?: (options: GridPasteSpecialOptions) => GridPasteSpecialPreview;
}

export const GridPasteSpecialModal: React.FC<GridPasteSpecialModalProps> = ({
  isOpen,
  onClose,
  onApply,
  onPreview,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_OFFICE_COPY[locale].pasteSpecial;
  const [mode, setMode] = useState<GridPasteSpecialMode>('all');
  const [operation, setOperation] = useState<GridPasteSpecialOperation>('none');
  const [skipBlanks, setSkipBlanks] = useState(false);
  const [transpose, setTranspose] = useState(false);

  const preview = useMemo(
    () => (isOpen && onPreview ? onPreview({ mode, operation, skipBlanks, transpose }) : EMPTY_GRID_PASTE_PREVIEW),
    [isOpen, mode, onPreview, operation, skipBlanks, transpose],
  );

  if (!isOpen) return null;

  const handleConfirm = () => {
    onApply({
      mode,
      operation,
      skipBlanks,
      transpose,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="grid-paste-special-title" className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto text-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5 text-blue-400" />
            <h3 id="grid-paste-special-title" className="text-sm font-semibold text-white tracking-wide">{copy.title}</h3>
          </div>
          <button aria-label={copy.close}
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          {/* Paste options */}
          <fieldset className="border border-white/10 rounded-lg p-3">
            <legend className="px-2 text-[0.6875rem] font-medium text-slate-400">{copy.modeLegend}</legend>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[
                { id: 'all', label: copy.modes.all },
                { id: 'formulas', label: copy.modes.formulas },
                { id: 'values', label: copy.modes.values },
                { id: 'formats', label: copy.modes.formats },
                { id: 'all-except-borders', label: copy.modes['all-except-borders'] },
                { id: 'column-widths', label: copy.modes['column-widths'] },
              ].map((opt) => (
                <label key={opt.id} className="min-w-0 flex items-start gap-2 cursor-pointer hover:text-white">
                  <input
                    type="radio"
                    name="pasteMode"
                    value={opt.id}
                    checked={mode === opt.id}
                    onChange={() => setMode(opt.id as GridPasteSpecialMode)}
                    className="text-blue-600 focus:ring-0 bg-slate-800 border-white/20"
                  />
                  <span className="min-w-0 break-words">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Operation options */}
          <fieldset className="border border-white/10 rounded-lg p-3">
            <legend className="px-2 text-[0.6875rem] font-medium text-slate-400">{copy.operationLegend}</legend>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[
                { id: 'none', label: copy.operations.none },
                { id: 'add', label: copy.operations.add },
                { id: 'subtract', label: copy.operations.subtract },
                { id: 'multiply', label: copy.operations.multiply },
                { id: 'divide', label: copy.operations.divide },
              ].map((opt) => (
                <label key={opt.id} className="min-w-0 flex items-start gap-2 cursor-pointer hover:text-white">
                  <input
                    type="radio"
                    name="pasteOp"
                    value={opt.id}
                    checked={operation === opt.id}
                    onChange={() => setOperation(opt.id as GridPasteSpecialOperation)}
                    className="text-blue-600 focus:ring-0 bg-slate-800 border-white/20"
                  />
                  <span className="min-w-0 break-words">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Checkboxes */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="min-w-0 flex items-start gap-2 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={skipBlanks}
                onChange={(e) => setSkipBlanks(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0 bg-slate-800 border-white/20"
              />
              <span className="min-w-0 break-words">{copy.skipBlanks}</span>
            </label>

            <label className="min-w-0 flex items-start gap-2 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={transpose}
                onChange={(e) => setTranspose(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0 bg-slate-800 border-white/20"
              />
              <span className="min-w-0 break-words">{copy.transpose}</span>
            </label>
          </div>
        </div>

        {/* Vorschau: exactly the plan the apply step executes. */}
        <div className="px-5 pb-4 text-xs" data-grid-paste-preview="true">
          {preview.rejectedReason ? (
            <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-200">
              {preview.rejectedReason}
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/60 text-[0.625rem] uppercase tracking-wider text-slate-400">
                <span>Vorschau</span>
                <span>{preview.totalChanges} Änderung(en){preview.truncated ? ' (gekürzt)' : ''}</span>
              </div>
              {preview.rows.length === 0 ? (
                <div className="px-3 py-2 text-slate-500 italic">Keine Änderung an Zellinhalten.</div>
              ) : (
                <ul className="max-h-40 overflow-y-auto divide-y divide-white/5">
                  {preview.rows.map((row) => (
                    <li key={row.coord} className="flex items-center gap-2 px-3 py-1 font-mono">
                      <span className="w-16 shrink-0 text-slate-400">{row.coord}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-500">{row.before || '∅'}</span>
                      <span className="text-slate-600">→</span>
                      <span className="min-w-0 flex-1 truncate text-emerald-200">{row.after || '∅'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10 bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={preview.rejectedReason !== null}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors shadow-lg shadow-blue-600/20"
          >
            {copy.apply}
          </button>
        </div>
      </div>
    </div>
  );
};
