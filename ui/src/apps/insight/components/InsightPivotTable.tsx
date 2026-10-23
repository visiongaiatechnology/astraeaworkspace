// STATUS: PLATIN — Astraea Insight Pivot Matrix Component.
// Every cell, row total, column total and the grand total is produced by the single-pass,
// separately tested geometry in ../pivot/insightPivotCore (one aggregation definition, correct
// totals, absent values for empty groups, bounded matrix size).
import React from 'react';
import type { InsightDocumentModel, InsightRecord } from '../domain/types';
import { useInsightCopy } from '../locale/insightLocale';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { InsightError } from '../core/insightCore';
import { PIVOT_AGGREGATIONS, buildInsightPivot, formatPivotValue, pivotUnit, type InsightPivotCell, type InsightPivotResult } from '../pivot/insightPivotCore';

interface InsightPivotTableProps {
  model: InsightDocumentModel;
  onUpdateModel: (updater: (prev: InsightDocumentModel) => InsightDocumentModel) => void;
}

export const InsightPivotTable: React.FC<InsightPivotTableProps> = ({
  model,
  onUpdateModel,
}) => {
  const copy = useInsightCopy();
  const { locale } = useWorkspaceLocale();
  const { records, pivotConfig } = model;
  const { rowDimension, colDimension, measure, aggFunc } = pivotConfig;
  const dimensionLabel = (dimension: keyof InsightRecord): string => {
    if (dimension === 'region') return copy.region;
    if (dimension === 'product') return copy.product;
    if (dimension === 'quarter') return copy.quarter;
    return String(dimension);
  };

  // The matrix is bounded and fail-closed: an unsupported aggregation or an oversized matrix
  // yields a named error instead of a plausible-looking 0.
  let pivot: InsightPivotResult | null = null;
  let pivotError: string | null = null;
  try {
    pivot = buildInsightPivot(records, pivotConfig);
  } catch (error) {
    pivot = null;
    pivotError = error instanceof InsightError ? error.code : 'insight-pivot-failed';
  }
  const unit = pivotUnit(measure, aggFunc);
  const render = (value: InsightPivotCell): string => formatPivotValue(value, unit, locale, copy.noDataValue);

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden">
      {/* Pivot Controls Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-purple-500/20 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-purple-300">{copy.dimensions}</span>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[0.6875rem]">{copy.rows}</span>
            <select
              aria-label={copy.rows}
              value={rowDimension}
              onChange={(e:{target:{value:string}}) => onUpdateModel(prev => ({
                ...prev,
                pivotConfig: { ...prev.pivotConfig, rowDimension: e.target.value as keyof InsightRecord }
              }))}
              className="bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-200 text-xs"
            >
              <option value="region">{copy.region}</option>
              <option value="product">{copy.product}</option>
              <option value="quarter">{copy.quarter}</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[0.6875rem]">{copy.columns}</span>
            <select
              aria-label={copy.columns}
              value={colDimension}
              onChange={(e:{target:{value:string}}) => onUpdateModel(prev => ({
                ...prev,
                pivotConfig: { ...prev.pivotConfig, colDimension: e.target.value as keyof InsightRecord }
              }))}
              className="bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-200 text-xs"
            >
              <option value="product">{copy.product}</option>
              <option value="region">{copy.region}</option>
              <option value="quarter">{copy.quarter}</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[0.6875rem]">{copy.measure}</span>
            <select
              aria-label={copy.measure}
              value={measure}
              onChange={(e:{target:{value:string}}) => onUpdateModel(prev => ({
                ...prev,
                pivotConfig: { ...prev.pivotConfig, measure: e.target.value as InsightDocumentModel['pivotConfig']['measure'] }
              }))}
              className="bg-[#150f24] border border-purple-500/30 rounded px-2 py-1 text-slate-200 text-xs"
            >
              <option value="revenue">{copy.revenue}</option>
              <option value="cost">{copy.operatingCost}</option>
              <option value="activeUsers">{copy.activeUsers}</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label={copy.function}>
          <span className="text-slate-400 text-[0.6875rem]">{copy.function}</span>
          {PIVOT_AGGREGATIONS.map(func => (
            <button
              key={func}
              type="button"
              onClick={() => onUpdateModel(prev => ({
                ...prev,
                pivotConfig: { ...prev.pivotConfig, aggFunc: func }
              }))}
              aria-pressed={aggFunc === func}
              className={`px-2 py-0.5 rounded text-[0.6875rem] font-semibold transition-colors ${
                aggFunc === func 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-purple-950/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              {copy.aggregation(func)}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Matrix Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-purple-500/20 bg-[#0e0a1b]">
        {pivot === null ? (
          <p role="alert" data-insight-pivot-error={pivotError ?? 'insight-pivot-failed'} className="p-4 text-xs text-rose-300">
            {copy.pivotUnavailable(pivotError ?? 'insight-pivot-failed')}
          </p>
        ) : pivot.rowValues.length === 0 ? (
          // No rows at all: an aggregate over nothing is not a $0 total.
          <p role="status" data-insight-pivot-empty="all" className="p-4 text-xs text-slate-400">{copy.noRowsInScope}</p>
        ) : (
        <table
          className="w-full text-left border-collapse text-xs"
          data-insight-pivot-rows={pivot.rowValues.length}
          data-insight-pivot-columns={pivot.colValues.length}
          data-insight-pivot-cells={pivot.rowValues.length * pivot.colValues.length}
          data-insight-pivot-aggregation={aggFunc}
        >
          <thead>
            <tr className="bg-purple-950/50 border-b border-purple-500/30 text-purple-300">
              <th scope="col" className="p-3 font-semibold uppercase tracking-wider">{dimensionLabel(rowDimension)}</th>
              {pivot.colValues.map(col => (
                <th key={col} scope="col" className="p-3 font-semibold text-right">{col}</th>
              ))}
              <th scope="col" className="p-3 font-bold text-right text-[var(--vgt-accent-strong)] bg-purple-900/30">{copy.total(copy.aggregation(aggFunc))}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-500/10">
            {pivot.rowValues.map(row => (
              <tr key={row} className="hover:bg-purple-950/30 transition-colors">
                <th scope="row" className="p-3 font-medium text-slate-200">{row}</th>
                {pivot.colValues.map(col => {
                  const value = pivot.matrix[row]?.[col] ?? null;
                  return (
                    <td
                      key={col}
                      className="p-3 text-right font-mono text-slate-300"
                      aria-label={value === null ? copy.emptyGroup(row, col) : undefined}
                      data-insight-pivot-empty={value === null ? 'true' : undefined}
                    >
                      {render(value)}
                    </td>
                  );
                })}
                <td className="p-3 text-right font-mono font-bold text-[var(--vgt-accent-strong)] bg-purple-950/20">
                  {render(pivot.rowTotals[row] ?? null)}
                </td>
              </tr>
            ))}
            {/* Grand Total Row */}
            <tr className="bg-purple-950/60 font-bold border-t-2 border-purple-500/30 text-slate-100">
              <th scope="row" className="p-3 text-purple-300">{copy.grandTotal}</th>
              {pivot.colValues.map(col => (
                <td key={col} className="p-3 text-right font-mono text-purple-200">
                  {render(pivot.colTotals[col] ?? null)}
                </td>
              ))}
              <td className="p-3 text-right font-mono text-[var(--vgt-accent-strong)] bg-purple-900/40">
                {render(pivot.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
};
