// STATUS: PLATIN — BATCH-INSIGHT-1 render contract: the visible Insight surface may only show
// numbers and states that the running code produced.
//
// Headless render (react-dom/server). Every assertion below is reachability evidence: it renders
// the real `InsightView` and reads its markup, so a pure module that no component uses cannot
// satisfy it.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { DEFAULT_INSIGHT_MODEL } from '../domain/types';
import { insightCopy } from '../locale/insightLocale';
import { formatInsightUsd } from '../interactions/insightCrossFilter';
import { loadInsightModel, InsightView } from '../views/InsightView';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const docWith = (insightData: unknown) => ({
  id: 'insight-surface-test', kind: 'Insight', modified_at: 0, version: 1, insightData,
} as unknown as WorkspaceDocument);
const render = (document: WorkspaceDocument) => renderToStaticMarkup(<InsightView document={document} onUpdateDocument={vi.fn()} />);

describe('Insight document load state is named, not hidden', () => {
  it('reports a read schema-2 payload as the document', () => {
    const load = loadInsightModel(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    expect(load.state).toBe('document');
    expect(load.model.datasetName).toBe(DEFAULT_INSIGHT_MODEL.datasetName);
  });

  it('reports a new document without payload as empty and a legacy payload as migrated', () => {
    expect(loadInsightModel(docWith(undefined)).state).toBe('empty');
    const legacy = loadInsightModel(docWith({ datasetName: 'Legacy Sales', records: [] }));
    expect(legacy.state).toBe('migrated');
    expect(legacy.reason).toBe('legacy-schema');
    expect(legacy.model.datasetName).toBe('Legacy Sales');
  });

  it('names an unreadable payload instead of silently showing the sample dataset', () => {
    const broken = { ...structuredClone(DEFAULT_INSIGHT_MODEL), revision: 0 };
    const load = loadInsightModel(docWith(broken));
    expect(load.state).toBe('unreadable');
    expect(load.reason).toBe('insight-revision-invalid');
    const markup = render(docWith(broken));
    expect(markup).toContain('data-insight-load-state="unreadable"');
    expect(markup).toContain(insightCopy('en-US').sampleDatasetNotice('insight-revision-invalid'));
  });

  it('shows the migration notice for a legacy document', () => {
    const markup = render(docWith({ datasetName: 'Legacy Sales', records: [] }));
    expect(markup).toContain('data-insight-load-state="migrated"');
    expect(markup).toContain(insightCopy('en-US').legacyDatasetNotice('legacy-schema'));
  });

  it('rejects a payload that is not an object instead of guessing', () => {
    const load = loadInsightModel(docWith('not-a-model'));
    expect(load.state).toBe('unreadable');
    expect(load.reason).toBe('insight-payload-not-object');
  });
});

describe('Insight visible numbers are produced by the running code', () => {
  it('renders the derived period comparison instead of the stored template percentage', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    // Q2 (516000) vs Q1 (431000) = +19.7 %, derived from the rendered records.
    expect(markup).toContain('+19.7%');
    expect(markup).toContain(insightCopy('en-US').comparisonLabel('Q2', 'Q1'));
    // The seeded template number 18.4 was never produced by an operation and must not be rendered.
    expect(markup).not.toContain('18.4');
    expect(markup).toContain('data-insight-kpi-id="kpi-rev" data-insight-kpi-computed="true"');
  });

  it('offers edit, reorder and remove for an existing KPI card (W-392)', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    const copy = insightCopy('en-US');
    expect(markup).toContain('data-insight-kpi-select="true"');
    expect(markup).toContain('data-insight-update-kpi="true"');
    expect(markup).toContain('data-insight-kpi-up="true"');
    expect(markup).toContain('data-insight-kpi-down="true"');
    expect(markup).toContain('data-insight-remove-kpi="true"');
    expect(markup).toContain(copy.updateKpi);
    expect(markup).toContain(copy.removeKpi);
    expect(markup).toContain(copy.moveKpiUp);
    expect(markup).toContain(copy.moveKpiDown);
    // Nothing is selected yet, so every card operation is disabled instead of acting on an unknown card.
    const openingTags = markup.split('<button').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('>')));
    const cardOperations = openingTags.filter((tag) => tag.includes('data-insight-remove-kpi') || tag.includes('data-insight-update-kpi') || tag.includes('data-insight-kpi-up') || tag.includes('data-insight-kpi-down'));
    expect(cardOperations).toHaveLength(4);
    for (const tag of cardOperations) expect(tag).toContain('disabled=""');
    // The select lists the existing cards so one can really be chosen.
    for (const card of DEFAULT_INSIGHT_MODEL.kpis) expect(markup).toContain(`>${card.title}</option>`);
  });

  it('marks a KPI that is not modelled as stored instead of presenting it as computed', () => {
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    model.kpis = [...model.kpis, { id: 'kpi-manual', title: 'Manual', value: '42', changePct: 7.5, trend: 'up', category: 'Custom' }];
    const markup = render(docWith(model));
    expect(markup).toContain('data-insight-kpi-id="kpi-manual" data-insight-kpi-computed="false"');
    expect(markup).toContain(insightCopy('en-US').kpiStoredValue);
  });

  it('reports "no rows in scope" instead of a zero that looks like a measurement', () => {
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    model.records = [];
    const markup = render(docWith(model));
    expect(markup).toContain(insightCopy('en-US').kpiNoValue('no-rows'));
    expect(markup).toContain(insightCopy('en-US').noRowsInScope);
    expect(markup).toContain('data-insight-pivot-empty="all"');
    expect(markup).toContain('data-insight-region-total="none"');
    expect(markup).not.toContain('$0');
  });

  it('lets the matrix carry its own numbers with a bounded, unit-correct total', () => {
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    model.pivotConfig = { ...model.pivotConfig, aggFunc: 'AVG' };
    const markup = render(docWith(model));
    // 2 row groups × 3 column groups from the seeded records.
    expect(markup).toContain('data-insight-pivot-rows="2" data-insight-pivot-columns="3" data-insight-pivot-cells="6"');
    expect(markup).toContain('data-insight-pivot-aggregation="AVG"');
    // An empty group has no average: it is announced, not rendered as $0.
    expect(markup).toContain(insightCopy('en-US').emptyGroup('Europe-Central', 'KeyVault HSM Enclave'));
    expect(markup).toContain('data-insight-pivot-empty="true"');
    // The true average over Europe-Central (133750), not the sum of per-cell averages (267500).
    expect(markup).toContain('$133,750');
    expect(markup).not.toContain('$267,500');
  });

  it('carries the region total as text, so the segment geometry is not the only carrier', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    const total = DEFAULT_INSIGHT_MODEL.records.reduce((sum, row) => sum + row.revenue, 0);
    expect(total).toBe(947000);
    expect(markup).toContain('data-insight-region-total="947000"');
    expect(markup).toContain(insightCopy('en-US').regionTotal('$947,000', 2));
    // Every segment names its own amount, not just its percentage.
    expect(markup).toContain('$535,000');
    expect(markup).toContain('$412,000');
  });

  it('keeps the honest state and the text-borne numbers in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = insightCopy(locale);
      const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
      expect(markup).toContain('data-insight-source-state="stale"');
      expect(markup).toContain('data-insight-load-state="document"');
      expect(markup).toContain('data-insight-refresh-state="none"');
      // The region caption carries the whole-dataset total as text in the active locale.
      expect(markup).toContain(copy.regionTotal(formatInsightUsd(947000, locale), 2));
    }
    localeState.current = 'en-US';
  });
});
