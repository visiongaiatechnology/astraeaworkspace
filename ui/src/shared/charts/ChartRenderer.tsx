// STATUS: DIAMANT VGT SUPREME
// Shared Astraea chart renderer. Same bounded SVG geometry across Grid/Writer/Present/Insight with an accessible data alternative.

import React, { useId, useMemo, useState } from 'react';
import type { ChartObject, ChartSourceState } from '../contracts/workspace';
import { buildChartAccessibleTable, normalizeCanonicalChart } from './chartModel';
import { chartSourceLock } from './chartEngine';
import { gridChartSvgDataUrl } from './chartSvgRenderer';
import { buildChartAccessibleSummary } from './chartAccessibility';

interface ChartRendererProps {
  chart: ChartObject;
  width?: number | string;
  height?: number;
  className?: string;
  interactive?: boolean;
}

/**
 * Die sichtbare, **benannte** Aussage des Sperrzustands: **Zustand + Grund + Handlung** — in Worten,
 * nicht allein über Farbe (UI-Standard §5.4/§21, §24 `permission denied`).
 *
 * Der Zustand stammt aus der **einen** Vokabel (`ChartSourceState`), der Grund aus dem **benannten**
 * Code des Wächters. Hier steht nur die Formulierung — keine zweite Zustandsliste.
 */
export function lockNotice(state: ChartSourceState): { condition: string; ground: string; action: string } {
  if (state === 'permission-lost') {
    return {
      condition: 'Quelle gesperrt — Berechtigung entzogen',
      ground: 'Die Berechtigung für die verknüpfte Quelle wurde entzogen. Die zuletzt bekannten Werte sind deshalb gesperrt.',
      action: 'Zugriff in der Quelle erneut freigeben oder das Diagramm von der Quelle trennen.',
    };
  }
  return {
    condition: 'Quelle verloren — nicht mehr erreichbar',
    ground: 'Die verknüpfte Quelle ist nicht mehr erreichbar. Die zuletzt bekannten Werte sind deshalb gesperrt.',
    action: 'Quelle wiederherstellen oder das Diagramm von der Quelle trennen.',
  };
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({ chart, width = '100%', height = 240, className = '', interactive = false }) => {
  const [showTable, setShowTable] = useState(false);
  const summaryId = useId();
  const normalized = useMemo(() => normalizeCanonicalChart(chart), [chart]);
  // Der Wächter wird hier wirklich befragt — **vor** allem, was Daten erzeugt.
  const lock = useMemo(() => chartSourceLock(normalized), [normalized]);
  // Bei Rückhalt entsteht **kein** SVG, **keine** Tabelle und **keine** Zusammenfassung: die
  // Datenpfade werden gar nicht erst betreten, nicht bloß nicht ausgegeben.
  const src = useMemo(() => (lock.withheld ? '' : gridChartSvgDataUrl(normalized, 900, 520)), [normalized, lock.withheld]);
  const rows = useMemo(() => (lock.withheld ? [] : buildChartAccessibleTable(normalized)), [normalized, lock.withheld]);
  const accessibleSummary = useMemo(() => (lock.withheld ? '' : buildChartAccessibleSummary(normalized)), [normalized, lock.withheld]);
  const sourceState = lock.state;

  if (lock.withheld) {
    const notice = lockNotice(lock.state);
    return (
      <figure className={`relative rounded-xl glass-panel overflow-hidden shadow-lg ${className}`} style={{ width }} aria-labelledby={summaryId} data-chart-source-lock={lock.state}>
        <div style={{ height }} className="flex items-center justify-center p-4" role="status">
          <div className="max-w-md">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
              <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-amber-300/70 font-mono text-[10px] leading-none">!</span>
              {notice.condition}
            </p>
            <p id={summaryId} className="mt-1.5 text-[12px] leading-snug text-slate-100">{notice.ground}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-400">Handlung: {notice.action}</p>
            <p className="mt-1 font-mono text-[10px] text-slate-500">{lock.code ?? lock.state}</p>
          </div>
        </div>
      </figure>
    );
  }

  return (
    <figure className={`relative rounded-xl glass-panel overflow-hidden shadow-lg ${className}`} style={{ width }} aria-labelledby={summaryId}>
      <div style={{ height }} className="relative">
        <img src={src} alt="" aria-hidden="true" className="w-full h-full object-contain" draggable={false} />
        {normalized.source?.live && (
          <span title={lock.code ?? undefined} className={`absolute top-2 right-2 text-[9px] px-2 py-0.5 rounded-full border font-mono ${sourceState === 'current' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' : 'bg-amber-500/15 text-amber-200 border-amber-500/30'}`}>
            {sourceState === 'current' ? 'LIVE' : String(sourceState || 'LIVE').toUpperCase()}
          </span>
        )}
      </div>
      <figcaption id={summaryId} className="sr-only">{accessibleSummary}</figcaption>
      {interactive && (
        <div className="border-t border-white/10 bg-slate-950/70 px-2 py-1.5">
          <button type="button" onClick={() => setShowTable(value => !value)} className="rounded px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400" aria-expanded={showTable}>
            {showTable ? 'Hide data table' : 'Show data table'}
          </button>
        </div>
      )}
      {interactive && showTable && (
        <div className="max-h-64 overflow-auto border-t border-white/10 bg-slate-950 p-2" role="region" aria-label={`${normalized.title} data table`}>
          <table className="w-full text-[11px] text-slate-200">
            <caption className="sr-only">{accessibleSummary}</caption>
            <thead><tr><th scope="col" className="text-left p-1">Category</th>{normalized.series.map((series, index) => <th key={`${series.name}-${index}`} scope="col" className="text-right p-1">{series.name}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={`${row.category}-${rowIndex}`}><th scope="row" className="text-left font-normal p-1">{row.category}</th>{row.values.map((value, index) => <td key={`${value.series}-${index}`} className="text-right p-1 tabular-nums">{value.value}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </figure>
  );
};
