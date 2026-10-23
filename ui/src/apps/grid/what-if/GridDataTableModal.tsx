// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded One-/Two-Variable What-If Data Table UI

import React, { useEffect, useState } from 'react';
import { Table, X, Play } from 'lucide-react';
import type { GridCell } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_DATA_TABLE_COPY, gridDataTableFailureCopy } from '../locale/gridDataTableLocale';
import { runGridWhatIfDataTable, type GridWhatIfDataTableRequest, type GridWhatIfDataTableResult } from './gridWhatIfDataTables';

interface GridDataTableModalProps {
  isOpen: boolean;
  cells: Record<string, GridCell>;
  selectedCell: string;
  onClose: () => void;
  onApplyTableOutput: (payload: { request: GridWhatIfDataTableRequest; result: GridWhatIfDataTableResult }) => boolean | Promise<boolean>;
}

const parseValues = (raw: string): number[] => raw.split(',').map((v) => Number(v.trim())).filter(Number.isFinite);

export const GridDataTableModal: React.FC<GridDataTableModalProps> = ({ isOpen, cells, selectedCell, onClose, onApplyTableOutput }) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_DATA_TABLE_COPY[locale];
  const [tableType, setTableType] = useState<'one-var' | 'two-var'>('one-var');
  const [formulaCell, setFormulaCell] = useState(selectedCell || 'C1');
  const [columnInputCell, setColumnInputCell] = useState('B2');
  const [rowInputCell, setRowInputCell] = useState('B3');
  const [columnValues, setColumnValues] = useState('100, 200, 300, 400, 500');
  const [rowValues, setRowValues] = useState('0.05, 0.10, 0.15');
  const [outputAnchor, setOutputAnchor] = useState(selectedCell || 'D2');
  const [result, setResult] = useState<GridWhatIfDataTableResult | null>(null);
  const [request, setRequest] = useState<GridWhatIfDataTableRequest | null>(null);
  const [error, setError] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormulaCell(selectedCell || 'C1');
    setOutputAnchor(selectedCell || 'D2');
    setResult(null);
    setRequest(null);
    setError('');
  }, [isOpen, selectedCell]);

  if (!isOpen) return null;

  const calculate = async () => {
    try {
      const next: GridWhatIfDataTableRequest = {
        formulaCell: formulaCell.trim().toUpperCase(),
        columnInputCell: columnInputCell.trim().toUpperCase(),
        columnValues: parseValues(columnValues),
        outputAnchor: outputAnchor.trim().toUpperCase(),
        ...(tableType === 'two-var' ? { rowInputCell: rowInputCell.trim().toUpperCase(), rowValues: parseValues(rowValues) } : {}),
      };
      const computed = await runGridWhatIfDataTable(cells, next);
      setRequest(next);
      setResult(computed);
      setError('');
    } catch (cause) {
      setResult(null);
      setRequest(null);
      setError(gridDataTableFailureCopy(locale, 'calculate'));
    }
  };

  const applyOutput = async () => {
    if (!request || !result || isApplying) return;
    setIsApplying(true);
    setError('');
    try {
      const committed = await onApplyTableOutput({ request, result });
      if (committed) {
        onClose();
        return;
      }
      setError(gridDataTableFailureCopy(locale, 'apply'));
    } catch {
      setError(gridDataTableFailureCopy(locale, 'commit'));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div role="dialog" aria-modal="true" aria-labelledby="grid-data-table-title" className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto text-xs flex flex-col">
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0"><Table className="w-4 h-4 shrink-0 text-purple-400" /><span id="grid-data-table-title" className="font-bold text-slate-100 text-sm break-words">{copy.title}</span></div>
          <button aria-label={copy.close} type="button" disabled={isApplying} onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap border-b border-white/10 bg-slate-950/40 p-1 gap-1 text-[0.6875rem]">
          {(['one-var','two-var'] as const).map((kind) => <button key={kind} type="button" onClick={() => { setTableType(kind); setResult(null); }} className={`min-w-0 flex-1 py-1 rounded font-medium whitespace-normal ${tableType===kind?'bg-purple-600/30 text-purple-200 border border-purple-500/30':'text-slate-400 hover:text-slate-200'}`}>{kind==='one-var'?copy.oneVariable:copy.twoVariable}</button>)}
        </div>
        <div className="p-4 space-y-3 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 min-w-0"><span className="text-slate-300">{copy.formulaCell}</span><input value={formulaCell} onChange={(e)=>setFormulaCell(e.target.value)} className="w-full min-w-0 bg-black/40 border border-white/10 rounded px-2.5 py-1.5 font-mono" /></label>
            <label className="space-y-1 min-w-0"><span className="text-slate-300">{copy.outputAnchor}</span><input value={outputAnchor} onChange={(e)=>setOutputAnchor(e.target.value)} className="w-full min-w-0 bg-black/40 border border-white/10 rounded px-2.5 py-1.5 font-mono" /></label>
            <label className="space-y-1 min-w-0"><span className="text-slate-300">{copy.columnInputCell}</span><input value={columnInputCell} onChange={(e)=>setColumnInputCell(e.target.value)} className="w-full min-w-0 bg-black/40 border border-white/10 rounded px-2.5 py-1.5 font-mono" /></label>
            {tableType==='two-var' && <label className="space-y-1 min-w-0"><span className="text-slate-300">{copy.rowInputCell}</span><input value={rowInputCell} onChange={(e)=>setRowInputCell(e.target.value)} className="w-full min-w-0 bg-black/40 border border-white/10 rounded px-2.5 py-1.5 font-mono" /></label>}
          </div>
          <label className="space-y-1 block"><span className="text-slate-300">{copy.columnValues}</span><input value={columnValues} onChange={(e)=>setColumnValues(e.target.value)} className="w-full min-w-0 bg-black/40 border border-white/10 rounded px-2.5 py-1.5 font-mono" /></label>
          {tableType==='two-var' && <label className="space-y-1 block"><span className="text-slate-300">{copy.rowValues}</span><input value={rowValues} onChange={(e)=>setRowValues(e.target.value)} className="w-full min-w-0 bg-black/40 border border-white/10 rounded px-2.5 py-1.5 font-mono" /></label>}
          <button type="button" onClick={calculate} className="w-full py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center justify-center gap-1.5 whitespace-normal"><Play className="w-3 h-3 shrink-0" />{copy.calculate}</button>
          {error && <div role="alert" className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300 break-words">{error}</div>}
          {result && request && <div className="space-y-2">
            <div className="flex flex-wrap justify-between items-center gap-2"><span className="font-semibold text-slate-300">{copy.calculatedMatrix(result.evaluations)}</span><button type="button" disabled={isApplying} onClick={()=>{void applyOutput();}} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[0.625rem] font-medium whitespace-normal disabled:opacity-40">{isApplying ? copy.applying : copy.applyTo(request.outputAnchor)}</button></div>
            <div className="border border-white/10 rounded-lg overflow-auto bg-black/40 p-2 max-h-56"><table className="w-full text-center border-collapse"><thead><tr className="border-b border-white/10 text-slate-400">{result.headers.map((h)=><th key={h} className="p-1.5">{h}</th>)}</tr></thead><tbody>{result.rows.map((row,index)=><tr key={`${row.label}-${index}`} className="border-b border-white/5"><td className="p-1.5 font-mono text-purple-300">{row.label}</td>{row.values.map((value,i)=><td key={i} className="p-1.5 font-mono text-slate-200">{String(value)}</td>)}</tr>)}</tbody></table></div>
          </div>}
        </div>
      </div>
    </div>
  );
};
