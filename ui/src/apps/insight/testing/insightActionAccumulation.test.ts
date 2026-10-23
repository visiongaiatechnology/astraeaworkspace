// STATUS: PLATIN — BATCH-INSIGHT-4: the cross-app W-397 check ("two calls in one instance").
//
// The Vault agent found a state-bearing action layer that held `const` copies of its state at
// construction time, so every later call computed against the stale copy and only wrote the new value
// back. The class only shows up in a test that makes TWO calls on ONE instance and asserts the
// accumulated result. This file does exactly that for every state-bearing construct in Astraea Insight:
// the history engine, the local refresh reader, the KPI authoring path and the accumulating audit /
// performance writers.
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type InsightAuditEvent, type InsightDocumentModel } from '../domain/types';
import { addAuditEvent } from '../governance/insightGovernanceEngine';
import { recordPerformance } from '../analysis/insightAnalysisEngine';
import { createInsightHistory, pushInsightHistory, redoInsightHistory, undoInsightHistory } from '../history/insightHistoryEngine';
import { addInsightKpi } from '../interactions/insightDatasetAuthoring';
import { createLocalInsightReader, nextInsightCache, resolveInsightRefreshOutcome } from '../refresh/insightRefreshOutcome';

const base = (): InsightDocumentModel => structuredClone(DEFAULT_INSIGHT_MODEL);

describe('Insight state-bearing layers survive two calls in one instance (W-397)', () => {
  it('accumulates two history pushes on one instance instead of keeping only the last', () => {
    let history = createInsightHistory(base());
    const first = { ...history.present, datasetName: 'first edit' };
    history = pushInsightHistory(history, first);
    const second = { ...history.present, datasetName: 'second edit' };
    history = pushInsightHistory(history, second);

    // Both edits must be reachable: the stale-copy bug would leave only the second one in `past`.
    expect(history.past).toHaveLength(2);
    expect(history.present.datasetName).toBe('second edit');
    expect(history.past.at(-1)?.datasetName).toBe('first edit');
    expect(history.past.at(0)?.datasetName).toBe(DEFAULT_INSIGHT_MODEL.datasetName);
    // Two undos in one instance walk back through both edits and land on the original.
    history = undoInsightHistory(history);
    expect(history.present.datasetName).toBe('first edit');
    history = undoInsightHistory(history);
    expect(history.present.datasetName).toBe(DEFAULT_INSIGHT_MODEL.datasetName);
    expect(history.past).toHaveLength(0);
    // Two redos return to the second edit.
    history = redoInsightHistory(history);
    history = redoInsightHistory(history);
    expect(history.present.datasetName).toBe('second edit');
    expect(history.future).toHaveLength(0);
    // The revision never goes backwards across the whole sequence.
    expect(history.present.revision).toBeGreaterThan(1);
  });

  it('makes two authoring calls on one model and keeps both cards', () => {
    let model = base();
    model = addInsightKpi(model, { title:'Revenue', measure:'revenue' });
    model = addInsightKpi(model, { title:'Users', measure:'activeUsers' });
    expect(model.kpis.map((kpi) => kpi.title)).toEqual([...DEFAULT_INSIGHT_MODEL.kpis.map((kpi) => kpi.title), 'Revenue', 'Users']);
    expect(new Set(model.kpis.map((kpi) => kpi.id)).size).toBe(model.kpis.length);
  });

  it('reads twice through one local reader closure without losing state', () => {
    const model = base();
    const query = model.queries[0];
    const reader = createLocalInsightReader(model.queries, query.id, model.records, true);
    const first = resolveInsightRefreshOutcome(reader);
    const second = resolveInsightRefreshOutcome(reader);
    expect(first.kind).toBe('read');
    expect(second).toEqual(first);
    // Two cache decisions on one instance: the second read may raise the snapshot, never lose `fresh`.
    const afterFirst = nextInsightCache(model.cache, first, 1);
    const afterSecond = nextInsightCache(afterFirst, second, 2);
    expect(afterSecond.sourceState).toBe('fresh');
    expect(afterSecond.lastRefreshAt).toBe(2);
    expect(afterSecond.snapshotAt).toBe(2);
  });

  it('accumulates two audit events and two performance samples on one array', () => {
    const first = addAuditEvent([], { action:'dataset', objectId:'a', actor:'local-owner', outcome:'allowed', detailCode:'one' });
    const second = addAuditEvent(first, { action:'export', objectId:'b', actor:'local-owner', outcome:'failed', detailCode:'two' });
    expect(second).toHaveLength(2);
    expect(second.map((event: InsightAuditEvent) => event.detailCode)).toEqual(['one', 'two']);
    expect(new Set(second.map((event) => event.id)).size).toBe(2);

    const one = recordPerformance([], { kind:'query', objectId:'q', durationMs:1, rows:4 });
    const two = recordPerformance(one, { kind:'query', objectId:'q', durationMs:2, rows:5 });
    expect(two).toHaveLength(2);
    expect(two.map((sample) => sample.durationMs)).toEqual([1, 2]);
  });
});
