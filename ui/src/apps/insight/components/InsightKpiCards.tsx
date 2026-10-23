// STATUS: PLATIN — Astraea Insight KPI Cards Component.
// The value and the period comparison are projected from the visible records by
// ../interactions/insightCrossFilter. A card without data shows no number, and a card whose id is
// not modelled says so instead of presenting a stored constant as a measurement.
import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShieldAlert, Cpu, Percent } from 'lucide-react';
import { useInsightCopy } from '../locale/insightLocale';
import { formatInsightKpiChange, type InsightKpiCardValue, type InsightKpiComparison } from '../interactions/insightCrossFilter';

interface InsightKpiCardsProps {
  kpis: InsightKpiCardValue[];
}

export const InsightKpiCards: React.FC<InsightKpiCardsProps> = ({ kpis }) => {
  const copy = useInsightCopy();
  const getIcon = (category: string) => {
    switch (category) {
      case 'Finance': return <DollarSign className="w-4 h-4 text-emerald-400" />;
      case 'Topology': return <Cpu className="w-4 h-4 text-[var(--vgt-accent-strong)]" />;
      case 'Security': return <ShieldAlert className="w-4 h-4 text-[var(--vgt-accent-strong)]" />;
      default: return <Percent className="w-4 h-4 text-[var(--vgt-accent-strong)]" />;
    }
  };
  /** Signed change in its own unit: percent for a relative change, points for a ratio change. */
  const changeText = (comparison: InsightKpiComparison): string => formatInsightKpiChange(comparison, copy.pointsUnit);

  return (
    <div className="insight-kpi-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4" role="list" aria-label={copy.kpiList}>
      {kpis.length === 0 && <p className="insight-kpi-empty col-span-full text-xs text-slate-400" data-insight-kpi-count="0">{copy.noKpiCards}</p>}
      {kpis.map((kpi) => {
        const comparison = kpi.comparison;
        const value = kpi.value ?? copy.noDataValue;
        const accessibleValue = kpi.value === null ? copy.kpiNoValue(kpi.comparisonUnavailableReason) : kpi.value;
        const accessibleTrend = comparison
          ? `${copy.comparisonLabel(comparison.currentLabel, comparison.previousLabel)} ${changeText(comparison)}`
          : copy.kpiNoComparison(kpi.comparisonUnavailableReason);
        return (
        <div 
          key={kpi.id}
          role="listitem" aria-label={`${kpi.title}: ${accessibleValue}. ${accessibleTrend}`} className="insight-kpi-card rounded-xl border border-purple-500/20 bg-[#0e0a1b] p-4 shadow-lg shadow-purple-950/20 hover:border-purple-500/40 transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="insight-kpi-title font-semibold uppercase tracking-wider text-[0.6875rem] text-purple-300">
              {kpi.title}
            </span>
            <div className="p-1.5 rounded-lg bg-purple-950/60 border border-purple-500/20">
              {getIcon(kpi.category)}
            </div>
          </div>

          <div className="insight-kpi-value-wrap my-2">
            <div
              className="insight-kpi-value text-2xl font-black tracking-tight text-white font-mono"
              data-insight-kpi-id={kpi.id}
              data-insight-kpi-computed={kpi.computed ? 'true' : 'false'}
            >
              {value}
            </div>
            {!kpi.computed && (
              <span className="insight-kpi-stored text-[0.625rem] text-amber-300">
                {kpi.value === null ? copy.kpiNoValue(kpi.comparisonUnavailableReason) : copy.kpiStoredValue}
              </span>
            )}
          </div>

          <div className="insight-kpi-trend flex items-center gap-1.5 text-xs">
            {comparison && comparison.direction === 'up' ? (
              <span className="flex items-center gap-0.5 text-emerald-400 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                {changeText(comparison)}
              </span>
            ) : comparison && comparison.direction === 'down' ? (
              <span className="flex items-center gap-0.5 text-rose-400 font-semibold">
                <TrendingDown className="w-3.5 h-3.5" />
                {changeText(comparison)}
              </span>
            ) : comparison ? (
              <span className="text-slate-400 font-semibold">0.0</span>
            ) : (
              <span className="insight-kpi-trend-empty text-[0.625rem] text-slate-500">{copy.kpiNoComparison(kpi.comparisonUnavailableReason)}</span>
            )}
            {comparison && (
              <span className="insight-kpi-trend-detail text-[0.625rem] text-slate-500">
                {copy.comparisonLabel(comparison.currentLabel, comparison.previousLabel)}
              </span>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
};
