// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Formula Auditing & Precedent/Dependent Inspector

import React, { useEffect, useState } from 'react';
import { SearchCode, X, ArrowUpRight, ArrowDownRight, ListTree, TriangleAlert } from 'lucide-react';
import { GridCell } from '../../../shared/contracts/workspace';
import { buildGridFormulaAuditReport, type GridFormulaAuditReport } from './gridFormulaAudit';

interface GridAuditFormulaModalProps {
  isOpen: boolean;
  cells: Record<string, GridCell>;
  selectedCell: string;
  onClose: () => void;
  onSelectCell: (coord: string) => void;
}

type AuditTab = 'precedents' | 'dependents' | 'evaluate' | 'errors';

export const GridAuditFormulaModal: React.FC<GridAuditFormulaModalProps> = ({
  isOpen,
  cells,
  selectedCell,
  onClose,
  onSelectCell,
}) => {
  const [tab, setTab] = useState<AuditTab>('precedents');
  const [report, setReport] = useState<GridFormulaAuditReport>({ coord: selectedCell, precedents: [], dependents: [], steps: [], errors: [] });

  useEffect(() => {
    let cancelled = false;
    if (!isOpen) return () => { cancelled = true; };
    void buildGridFormulaAuditReport(selectedCell, cells).then((next) => { if (!cancelled) setReport(next); });
    return () => { cancelled = true; };
  }, [isOpen, selectedCell, cells]);

  if (!isOpen) return null;

  const currentCell = cells[selectedCell.toUpperCase()];
  const formula = currentCell?.formula || '';
  const tabs: Array<{ id: AuditTab; label: string; count: number; icon: React.ReactNode }> = [
    { id: 'precedents', label: 'Precedents', count: report.precedents.length, icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
    { id: 'dependents', label: 'Dependents', count: report.dependents.length, icon: <ArrowDownRight className="w-3.5 h-3.5" /> },
    { id: 'evaluate', label: 'Evaluate', count: report.steps.length, icon: <ListTree className="w-3.5 h-3.5" /> },
    { id: 'errors', label: 'Errors', count: report.errors.length, icon: <TriangleAlert className="w-3.5 h-3.5" /> },
  ];

  const jump = (coord: string) => {
    onSelectCell(coord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden text-xs flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <SearchCode className="w-4 h-4 text-purple-400" />
            <span className="font-bold text-slate-100 text-sm">Formula Auditing Studio</span>
            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[0.625rem]">{selectedCell}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white" aria-label="Close formula audit">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 bg-slate-950/40 border-b border-white/10 space-y-1">
          <div className="text-[0.625rem] text-slate-400 uppercase font-semibold">Active Formula</div>
          <div className="p-2 rounded bg-black/50 border border-white/10 font-mono text-purple-300 text-xs break-all">{formula || '<No formula in this cell>'}</div>
          <div className="text-[0.625rem] text-slate-500 flex justify-between">
            <span>Stored value:</span>
            <span className="font-mono text-slate-200">{String(currentCell?.value ?? 'empty')}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 border-b border-white/10 bg-slate-950/40 p-1 gap-1 text-[0.625rem]">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`py-1.5 rounded transition-colors font-medium flex items-center justify-center gap-1 ${tab === item.id ? 'bg-purple-600/30 text-purple-200 border border-purple-500/30' : 'text-slate-400 hover:text-slate-200'}`}>
              {item.icon}<span>{item.label} ({item.count})</span>
            </button>
          ))}
        </div>

        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {tab === 'precedents' && (report.precedents.length ? report.precedents.map((coord) => (
            <button key={coord} type="button" onClick={() => jump(coord)} className="w-full text-left p-2 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 flex items-center justify-between">
              <span className="font-mono text-purple-300 font-semibold">{coord}</span>
              <span className="font-mono text-slate-400 text-[0.6875rem]">{String(cells[coord]?.value ?? 'empty')}</span>
            </button>
          )) : <Empty text={`No direct precedents referenced by ${selectedCell}.`} />)}

          {tab === 'dependents' && (report.dependents.length ? report.dependents.map((coord) => (
            <button key={coord} type="button" onClick={() => jump(coord)} className="w-full text-left p-2 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="font-mono text-purple-300 font-semibold">{coord}</div><div className="font-mono text-slate-500 text-[0.625rem] truncate">{cells[coord]?.formula}</div></div>
              <span className="font-mono text-slate-300 text-[0.6875rem] shrink-0">{String(cells[coord]?.value ?? 'empty')}</span>
            </button>
          )) : <Empty text={`No other cells depend on ${selectedCell}.`} />)}

          {tab === 'evaluate' && (report.steps.length ? report.steps.map((step, index) => (
            <div key={`${step.kind}-${step.coord}-${index}`} className="p-2 rounded bg-white/[0.04] border border-white/5 grid grid-cols-[80px_70px_1fr] gap-2 items-start">
              <span className="uppercase tracking-wide text-[0.5625rem] text-slate-500">{step.kind}</span>
              <button type="button" onClick={() => jump(step.coord)} className="font-mono text-purple-300 text-left">{step.coord}</button>
              <div className="min-w-0"><div className="font-mono text-slate-400 break-all">{step.expression ?? ''}</div><div className="font-mono text-slate-200 mt-1">→ {String(step.value ?? 'empty')}</div></div>
            </div>
          )) : <Empty text="No formula to evaluate." />)}

          {tab === 'errors' && (report.errors.length ? report.errors.map((error, index) => (
            <button key={`${error.coord}-${index}`} type="button" onClick={() => jump(error.coord)} className="w-full text-left p-2 rounded bg-red-500/5 border border-red-500/20 hover:bg-red-500/10">
              <div className="flex justify-between gap-3"><span className="font-mono text-red-300 font-semibold">{error.coord}: {String(error.value)}</span><span className="text-[0.5625rem] text-slate-500">depth {(error.path?.length ?? 1) - 1}</span></div>
              <div className="font-mono text-[0.625rem] text-slate-500 mt-1 break-all">{error.path?.join(' → ')}</div>
            </button>
          )) : <Empty text="No stored formula error found in the bounded precedent graph." />)}
        </div>
      </div>
    </div>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => <div className="text-center py-6 text-slate-500 italic text-[0.6875rem]">{text}</div>;
