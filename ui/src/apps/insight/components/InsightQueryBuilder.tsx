// STATUS: PLATIN — bounded, declarative Insight query pipeline editor
import React from 'react';
import { ArrowDownUp, Filter, Play, Plus, Trash2 } from 'lucide-react';
import type { InsightDocumentModel, InsightQueryStep } from '../domain/types';
import { useInsightCopy } from '../locale/insightLocale';
import { stableInsightId } from '../core/insightCore';
interface Props {
  model: InsightDocumentModel;
  onUpdateModel: (updater: (previous: InsightDocumentModel) => InsightDocumentModel) => void;
  onExecute: () => void;
}

export const InsightQueryBuilder: React.FC<Props> = ({ model, onUpdateModel, onExecute }) => {
  const copy = useInsightCopy();
  const steps = model.queries[0]?.steps ?? model.querySteps;

  const sync = (next: InsightQueryStep[]) => onUpdateModel((previous) => ({
    ...previous,
    querySteps: next,
    queries: previous.queries.map((query, index) => index === 0
      ? { ...query, steps: next, version: query.version + 1 }
      : query),
  }));

  const add = (type: 'filter' | 'sort') => {
    const draft: InsightQueryStep = {
      id: 'pending',
      type,
      column: type === 'filter' ? 'region' : 'revenue',
      operator: type === 'filter' ? '=' : undefined,
      value: type === 'filter' ? 'Europe-Central' : undefined,
      direction: type === 'sort' ? 'desc' : undefined,
    };
    // Stable, content-addressed step id (the previous `step-${Date.now()}` made every document
    // diff and every re-render unstable).
    const step: InsightQueryStep = { ...draft, id: stableInsightId('step', `${type}:${steps.length}:${draft.column}:${String(draft.value ?? draft.direction ?? '')}`) };
    sync([...steps, step]);
  };

  const patch = (id: string, changes: Partial<InsightQueryStep>) => {
    sync(steps.map((step) => (step.id === id ? { ...step, ...changes } : step)));
  };

  return (
    <aside className="insight-query-panel" aria-label={copy.queryPanel}>
      <div className="insight-query-header">
        <span className="insight-query-title"><Filter aria-hidden="true" />{copy.transformPipeline}</span>
        <button type="button" onClick={onExecute} className="insight-tool" aria-label={copy.executeQuery}>
          <Play aria-hidden="true" />
        </button>
      </div>
      <div className="insight-query-content">
        <p className="insight-query-description">{copy.queryDescription}</p>
        {steps.map((step, index) => (
          <section key={step.id} className="insight-query-step" aria-label={copy.step(index + 1, step.type === 'filter' ? copy.filter : copy.sort)}>
            <div className="insight-query-step-header">
              <span className="insight-query-step-title">
                {step.type === 'filter' ? <Filter aria-hidden="true" /> : <ArrowDownUp aria-hidden="true" />}
                {copy.step(index + 1, step.type === 'filter' ? copy.filter : copy.sort)}
              </span>
              <button type="button" onClick={() => sync(steps.filter((candidate) => candidate.id !== step.id))} className="insight-tool" aria-label={copy.removeStep(index + 1)}>
                <Trash2 aria-hidden="true" />
              </button>
            </div>
            {step.type === 'filter' ? (
              <div className="insight-query-fields">
                <select aria-label={copy.filterColumn(index + 1)} value={step.column} onChange={(event) => patch(step.id, { column: event.target.value })} className="insight-input">
                  <option value="region">{copy.region}</option>
                  <option value="product">{copy.product}</option>
                  <option value="quarter">{copy.quarter}</option>
                </select>
                <input aria-label={copy.filterValue(index + 1)} value={String(step.value ?? '')} onChange={(event) => patch(step.id, { value: event.target.value })} className="insight-input" />
              </div>
            ) : (
              <div className="insight-query-fields">
                <select aria-label={copy.sortColumn(index + 1)} value={step.column} onChange={(event) => patch(step.id, { column: event.target.value })} className="insight-input">
                  <option value="revenue">{copy.revenue}</option>
                  <option value="cost">{copy.operatingCost}</option>
                  <option value="activeUsers">{copy.activeUsers}</option>
                </select>
                <select aria-label={copy.sortDirection(index + 1)} value={step.direction} onChange={(event) => patch(step.id, { direction: event.target.value as 'asc' | 'desc' })} className="insight-input">
                  <option value="desc">{copy.descending}</option>
                  <option value="asc">{copy.ascending}</option>
                </select>
              </div>
            )}
          </section>
        ))}
        <div className="insight-query-actions">
          <button type="button" onClick={() => add('filter')} className="insight-tool-text"><Plus aria-hidden="true" />{copy.filter}</button>
          <button type="button" onClick={() => add('sort')} className="insight-tool-text"><Plus aria-hidden="true" />{copy.sort}</button>
        </div>
      </div>
    </aside>
  );
};
