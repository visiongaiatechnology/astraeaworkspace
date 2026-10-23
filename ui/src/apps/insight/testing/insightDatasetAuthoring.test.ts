// STATUS: PLATIN — BATCH-INSIGHT-3: an empty dashboard can really be started, and the first KPI card
// the user creates is really computed from the data.
//
// MEASURED FACTS before this batch: the only entry state was the seeded template, no component could
// create a KPI card, and `projectInsightKpis` modelled the four seeded ids only — so a user-created card
// could not have been computed at all (it would have shown its stored placeholder as a measurement).
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type InsightDocumentModel } from '../domain/types';
import { InsightError, normalizeInsightModel } from '../core/insightCore';
import { projectInsightKpis, resolveInsightKpiMeasure, splitInsightPeriods } from '../interactions/insightCrossFilter';
import { INSIGHT_DATASET_LIMITS, addInsightKpi, createEmptyInsightModel, moveInsightKpi, removeInsightKpi, updateInsightKpi } from '../interactions/insightDatasetAuthoring';
import { importInsightDataset } from '../connectors/insightImportCore';
import { WORKSPACE_LOCALES } from '../../../shell/localization/workspaceLocaleTypes';
import { insightCopy } from '../locale/insightLocale';

const empty = () => createEmptyInsightModel('Sales 2026');
const HEADER = 'id,region,product,quarter,revenue,cost,activeUsers,anomalyScore';
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n') + '\n';

describe('Insight empty dataset (pure)', () => {
  it('creates a valid, really empty document with one readable local source', () => {
    const model = empty();
    expect(model.records).toEqual([]);
    expect(model.kpis).toEqual([]);
    expect(model.querySteps).toEqual([]);
    expect(model.datasetName).toBe('Sales 2026');
    expect(model.cache.sourceState).toBe('empty');
    expect(model.cache.snapshotAt).toBeUndefined();
    expect(model.revision).toBe(1);
    expect(model.sources).toHaveLength(1);
    expect(model.sources[0].enabled).toBe(true);
    expect(model.sources[0].canonicalUri.startsWith('vgt://insight/local/')).toBe(true);
    // The one query reads that source with an empty pipeline.
    expect(model.queries).toHaveLength(1);
    expect(model.queries[0].sourceId).toBe(model.sources[0].id);
    expect(model.queries[0].steps).toEqual([]);
    // The report has a real, empty active page.
    expect(model.report.pages).toHaveLength(1);
    expect(model.report.activePageId).toBe(model.report.pages[0].id);
    expect(model.report.pages[0].visuals).toEqual([]);
    // A new document is a valid document: normalization is idempotent on it.
    expect(normalizeInsightModel(model)).toEqual(model);
  });

  it('refuses an empty or oversized dataset name by name', () => {
    expect(() => createEmptyInsightModel('   ')).toThrowError(InsightError);
    expect(() => createEmptyInsightModel('x'.repeat(INSIGHT_DATASET_LIMITS.maxNameLength + 1))).toThrowError('insight-text-boundary');
    expect(createEmptyInsightModel('  Trimmed  ').datasetName).toBe('Trimmed');
  });

  it('shows no KPI card at all until one is created', () => {
    expect(projectInsightKpis(empty().records, empty().kpis, 'en-US')).toEqual([]);
  });
});

describe('Insight KPI authoring (pure)', () => {
  it('creates a card that carries its measure and is then computed from the records', () => {
    const model = addInsightKpi(empty(), { title:'Total revenue', measure:'revenue' });
    expect(model.kpis).toHaveLength(1);
    const card = model.kpis[0];
    expect(card.measure).toBe('revenue');
    expect(card.category).toBe('Finance');
    expect(card.value).toBe('');
    expect(resolveInsightKpiMeasure(card)).toBe('revenue');

    // No records yet: the value does not exist and is named as absent, never 0.
    const emptyProjection = projectInsightKpis(model.records, model.kpis, 'en-US')[0];
    expect(emptyProjection.value).toBeNull();
    expect(emptyProjection.computed).toBe(false);
    expect(emptyProjection.comparisonUnavailableReason).toBe('no-rows');

    // With records the very same card is computed, including the derived period comparison.
    const seeded = { ...model, records: structuredClone(DEFAULT_INSIGHT_MODEL.records) };
    const projection = projectInsightKpis(seeded.records, seeded.kpis, 'en-US')[0];
    expect(projection.computed).toBe(true);
    expect(projection.value).toBe('$947,000');
    expect(projection.comparison?.change).toBe(19.7);
    expect(splitInsightPeriods(seeded.records)?.currentLabel).toBe('Q2');
  });

  it('binds every measure to its own category and computes ratio measures in points', () => {
    let model: InsightDocumentModel = empty();
    for (const measure of ['revenue', 'margin', 'activeUsers', 'anomaly'] as const) model = addInsightKpi(model, { title:measure, measure });
    expect(model.kpis.map((kpi) => kpi.category)).toEqual(['Finance', 'Finance', 'Topology', 'Security']);
    const seeded = { ...model, records: structuredClone(DEFAULT_INSIGHT_MODEL.records) };
    const projection = projectInsightKpis(seeded.records, seeded.kpis, 'en-US');
    expect(projection.map((kpi) => kpi.computed)).toEqual([true, true, true, true]);
    expect(projection[1].comparison?.kind).toBe('percentage-points');
    expect(projection[2].value).toBe('7,510');
  });

  it('keeps a legacy card working through the seeded id map and marks an unmodelled one as stored', () => {
    const legacy = structuredClone(DEFAULT_INSIGHT_MODEL.kpis[0]);
    expect(resolveInsightKpiMeasure(legacy)).toBe('revenue');
    const model = { ...empty(), kpis:[legacy, { id:'kpi-custom', title:'Manual', value:'42', changePct:7.5, trend:'up' as const, category:'Custom' }] };
    const projection = projectInsightKpis(structuredClone(DEFAULT_INSIGHT_MODEL.records), model.kpis, 'en-US');
    expect(projection[0].computed).toBe(true);
    expect(projection[1].computed).toBe(false);
    expect(projection[1].value).toBe('42');
    expect(projection[1].comparisonUnavailableReason).toBe('kpi-not-modelled');
  });

  it('refuses an unnamed card, a blank title and more cards than the documented limit', () => {
    expect(() => addInsightKpi(empty(), { title:'  ', measure:'revenue' })).toThrowError(InsightError);
    let model = empty();
    for (let index = 0; index < INSIGHT_DATASET_LIMITS.maxKpis; index += 1) model = addInsightKpi(model, { title:`Card ${index}`, measure:'revenue' });
    expect(model.kpis).toHaveLength(INSIGHT_DATASET_LIMITS.maxKpis);
    expect(() => addInsightKpi(model, { title:'One too many', measure:'revenue' })).toThrowError('insight-kpi-limit');
  });

  it('edits, removes and reorders a card (W-392) and refuses the invalid cases by name', () => {
    const model = addInsightKpi(addInsightKpi(empty(), { title:'Revenue', measure:'revenue' }), { title:'Users', measure:'activeUsers' });
    const [first, second] = model.kpis;
    expect(second.title).toBe('Users');

    // Edit the title and the measure: the category follows the measure, and the projection then computes the new measure.
    const renamed = updateInsightKpi(model, first.id, { title:'Revenue (edited)' });
    expect(renamed.kpis[0].title).toBe('Revenue (edited)');
    expect(renamed.kpis[0].measure).toBe('revenue');
    const remeasured = updateInsightKpi(model, first.id, { measure:'anomaly' });
    expect(remeasured.kpis[0].measure).toBe('anomaly');
    expect(remeasured.kpis[0].category).toBe('Security');
    const seeded = { ...remeasured, records: structuredClone(DEFAULT_INSIGHT_MODEL.records) };
    expect(projectInsightKpis(seeded.records, seeded.kpis, 'en-US')[0].value).toBe('1.750%');

    // Reorder: the second card moves up and then cannot move further.
    const moved = moveInsightKpi(model, second.id, -1);
    expect(moved.kpis.map((kpi) => kpi.title)).toEqual(['Users', 'Revenue']);
    expect(() => moveInsightKpi(moved, second.id, -1)).toThrowError('insight-kpi-order-limit');
    const lastCard = moved.kpis[1];
    expect(() => moveInsightKpi(moved, lastCard.id, 1)).toThrowError('insight-kpi-order-limit');

    // Remove, and refuse a second removal of the same card.
    const removed = removeInsightKpi(moved, second.id);
    expect(removed.kpis.map((kpi) => kpi.title)).toEqual(['Revenue']);
    expect(() => removeInsightKpi(removed, second.id)).toThrowError('insight-kpi-missing');

    // Unknown ids, blank titles and an unknown measure are refused instead of silently doing nothing.
    expect(() => updateInsightKpi(model, 'no-such-card', { title:'x' })).toThrowError('insight-kpi-missing');
    expect(() => updateInsightKpi(model, first.id, { title:'   ' })).toThrowError(InsightError);
    expect(() => updateInsightKpi(model, first.id, { measure:'not-a-measure' as never })).toThrowError('insight-kpi-measure-invalid');
    expect(() => moveInsightKpi(model, 'no-such-card', 1)).toThrowError('insight-kpi-missing');
    // The edited document is still a valid document.
    expect(normalizeInsightModel(removed)).toEqual(removed);
  });

  it('names every refusal with its code in all seven locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = insightCopy(locale);
      for (const code of ['insight-kpi-limit', 'insight-text-boundary']) expect(copy.authoringFailed(code)).toContain(code);
      // The two action statuses carry the created name, so a status can never claim an unnamed result.
      expect(copy.datasetCreated('Sales')).toContain('Sales');
      expect(copy.kpiCreated('Revenue')).toContain('Revenue');
      expect(copy.createDataset.length).toBeGreaterThan(3);
      expect(copy.createKpi.length).toBeGreaterThan(3);
    }
  });

  it('gives two equally named cards distinct stable ids and bumps the revision', () => {
    const one = addInsightKpi(empty(), { title:'Revenue', measure:'revenue' });
    const two = addInsightKpi(one, { title:'Revenue', measure:'revenue' });
    expect(two.kpis[0].id).not.toBe(two.kpis[1].id);
    expect(two.revision).toBe(one.revision + 1);
    expect(normalizeInsightModel(two)).toEqual(two);
  });

  it('completes the acceptance action: new dataset, import data, create the card yourself', () => {
    const created = createEmptyInsightModel('Q3 review');
    const imported = importInsightDataset(created, {
      name:'q3.csv', kind:'csv', text:csv('r1,Europe,Mesh,Q1,100,40,10,0.01', 'r2,Europe,Mesh,Q2,300,90,20,0.03', 'r3,Europe,Core,Q2,600,150,30,0.02'),
    }, 1000);
    expect(imported.report.ok).toBe(true);
    const authored = addInsightKpi(imported.model, { title:'Revenue reviewed', measure:'revenue' });
    const projection = projectInsightKpis(authored.records, authored.kpis, 'en-US')[0];
    // 100 + 300 + 600 = 1000, and Q2 (900) against Q1 (100) is +800 %.
    expect(projection.value).toBe('$1,000');
    expect(projection.comparison?.change).toBe(800);
    expect(projection.comparison?.previousLabel).toBe('Q1');
    // The imported rows are the records the card was computed from — no second source of truth.
    expect(authored.records.reduce((total, row) => total + row.revenue, 0)).toBe(1000);
  });
});
