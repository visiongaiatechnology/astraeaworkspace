import React from 'react';
import type { TableObject, WorkspaceObject } from '../../../shared/contracts/workspace';

function colLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) { const remainder = (value - 1) % 26; label = String.fromCharCode(65 + remainder) + label; value = Math.floor((value - 1) / 26); }
  return label;
}

function cellValue(table: TableObject, row: number, col: number): string {
  const cell = table.cells[`${colLabel(col)}${row + 1}`] ?? table.cells[`${row}:${col}`];
  return String(cell?.value ?? '');
}

export function tableFromWorkspaceReference(object: WorkspaceObject | undefined): TableObject | null {
  if (!object || object.type !== 'WorkspaceReference') return null;
  const snapshot = object.data.cached_snapshot;
  return snapshot?.type === 'Table' ? snapshot.data : null;
}

export const GridLiveReferenceCard: React.FC<{ object: WorkspaceObject; compact?: boolean }> = ({ object, compact = false }) => {
  const table = tableFromWorkspaceReference(object);
  if (!table) return null;
  const isKpi = table.rows === 1 && table.cols === 1;
  const source = object.type === 'WorkspaceReference' ? object.data.uri : '';
  if (isKpi) {
    return <div className="rounded-xl border border-cyan-500/25 bg-slate-950/85 px-4 py-3 shadow-xl backdrop-blur-md min-w-[160px]">
      <div className="text-[0.5625rem] uppercase tracking-[0.18em] text-cyan-400">Live Grid KPI</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100 truncate">{cellValue(table, 0, 0)}</div>
      {!compact && <div className="mt-1 text-[0.5625rem] text-slate-500 truncate max-w-[280px]">{source}</div>}
    </div>;
  }
  const rowCount = Math.min(table.rows, compact ? 3 : 5);
  const colCount = Math.min(table.cols, compact ? 3 : 5);
  return <div className="rounded-xl border border-blue-500/20 bg-slate-950/85 p-3 shadow-xl backdrop-blur-md max-w-[420px] overflow-hidden">
    <div className="text-[0.5625rem] uppercase tracking-[0.18em] text-blue-400 mb-2">Live Grid Data</div>
    <div className="overflow-hidden rounded border border-white/10">
      {Array.from({ length: rowCount }, (_, row) => <div key={row} className="grid" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))` }}>
        {Array.from({ length: colCount }, (_, col) => <div key={col} className={`px-2 py-1 text-[0.625rem] truncate border-r border-b border-white/5 ${row === 0 ? 'bg-white/5 text-slate-200 font-semibold' : 'text-slate-400'}`}>{cellValue(table, row, col)}</div>)}
      </div>)}
    </div>
    {!compact && <div className="mt-1 text-[0.5625rem] text-slate-500 truncate">{source}</div>}
  </div>;
};
