// STATUS: PLATIN — BATCH-INSIGHT-5: the visual gallery renders through the SHARED chart stack.
//
// MEASURED FACTS before this batch:
//  - `visuals/insightVisualEngine.createInsightVisual` and `reports/insightReportEngine.placeVisual`
//    existed but no component rendered a single visual, and the report engine could not remove, move
//    or rename anything.
//  - The workspace already owns ONE chart implementation (`shared/charts/ChartRenderer.tsx`,
//    `chartModel.ts`, `chartSvgRenderer.ts`, `chartAccessibility.ts`). Insight must bridge into it,
//    never draw its own SVG. This file pins that bridge and the shared accessible data table.
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type InsightRecord, type InsightVisual } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { buildChartAccessibleSummary } from '../../../shared/charts/chartAccessibility';
import { buildChartAccessibleTable, normalizeCanonicalChart } from '../../../shared/charts/chartModel';
import {
  buildInsightChartObject,
  chartSourceStateFor,
  insightChartTypeFor,
  supportedInsightVisualKinds,
} from '../integrations/insightChartBridge';
import { createInsightVisual } from '../visuals/insightVisualEngine';
import { addReportPage, moveVisual, placeVisual, removeReportObject, removeVisual, renameReportPage } from '../reports/insightReportEngine';

const model = () => structuredClone(DEFAULT_INSIGHT_MODEL);
const records = () => structuredClone(DEFAULT_INSIGHT_MODEL.records) as InsightRecord[];
const context = { documentId:'insight-doc', cacheState:'stale' as const, revision:7 };
const visual = (overrides: Partial<InsightVisual> = {}): InsightVisual => ({
  ...createInsightVisual('column', 'q-main', 'Revenue by region', { x:0, y:0, width:560, height:300 }),
  encoding:{ category:'region', values:['revenue'] },
  ...overrides,
});

describe('Insight visual kind bridge (pure)', () => {
  it('maps every supported kind to a shared chart type and refuses the rest by name', () => {
    expect(insightChartTypeFor('column')).toBe('column');
    expect(insightChartTypeFor('bar')).toBe('bar');
    expect(insightChartTypeFor('box-plot')).toBe('box-whisker');
    expect(insightChartTypeFor('sparkline')).toBe('sparkline');
    for (const unsupported of ['gauge', 'kpi', 'card', 'matrix', 'table', 'map', 'heatmap', 'custom'] as const) {
      expect(() => insightChartTypeFor(unsupported)).toThrowError('insight-visual-kind-unsupported');
    }
    const kinds = supportedInsightVisualKinds();
    expect(kinds).toContain('column');
    expect(kinds).not.toContain('gauge');
    expect([...kinds].sort()).toEqual(kinds);
  });

  it('maps the insight cache state onto the shared chart source state in one table', () => {
    expect(chartSourceStateFor('fresh')).toBe('current');
    expect(chartSourceStateFor('stale')).toBe('stale');
    expect(chartSourceStateFor('partial')).toBe('stale');
    expect(chartSourceStateFor('offline')).toBe('frozen');
    expect(chartSourceStateFor('empty')).toBe('broken');
  });
});

describe('Insight visual -> shared canonical chart (pure)', () => {
  it('builds the chart with real category aggregates and the shared source state', () => {
    const chart = buildInsightChartObject(visual(), records(), context, model());
    expect(chart.chart_type).toBe('column');
    expect(chart.title).toBe('Revenue by region');
    expect(chart.categories).toEqual(['Europe-Central', 'Europe-North']);
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0].name).toBe('revenue');
    // 145000 + 98000 + 168000 + 124000 and 112000 + 76000 + 135000 + 89000.
    expect(chart.series[0].values).toEqual([535000, 412000]);
    expect(chart.source?.kind).toBe('insight');
    expect(chart.source?.documentId).toBe('insight-doc');
    expect(chart.source?.state).toBe('stale');
    expect(chart.source_state).toBe('stale');
    // The shared normalizer accepts what we built, so the shared renderer can draw it.
    expect(normalizeCanonicalChart(chart).series[0].values).toEqual([535000, 412000]);
  });

  it('honours the visual aggregation instead of inventing a second one', () => {
    const avg = buildInsightChartObject(visual({ encoding:{ category:'region', values:['revenue'], aggregation:'AVG' } }), records(), context, model());
    expect(avg.series[0].values).toEqual([133750, 103000]);
    const count = buildInsightChartObject(visual({ encoding:{ category:'region', values:['revenue'], aggregation:'COUNT' } }), records(), context, model());
    expect(count.series[0].values).toEqual([4, 4]);
    const twoSeries = buildInsightChartObject(visual({ encoding:{ category:'product', values:['revenue', 'cost'] } }), records(), context, model());
    expect(twoSeries.series.map((series) => series.name)).toEqual(['revenue', 'cost']);
    expect(twoSeries.series[1].values.reduce((total, value) => total + value, 0)).toBe(277000);
  });

  it('never treats a text column as a measure and names what is missing', () => {
    expect(() => buildInsightChartObject(visual({ encoding:{ category:'region', values:['region'] } }), records(), context, model())).toThrowError('insight-visual-values-missing');
    expect(() => buildInsightChartObject(visual({ encoding:{ values:['revenue'] } }), records(), context, model())).toThrowError('insight-visual-category-missing');
  });

  it('carries the same numbers in the shared accessible table as in the series', () => {
    const chart = buildInsightChartObject(visual(), records(), context, model());
    const summary = buildChartAccessibleSummary(chart);
    expect(summary).toContain('Revenue by region');
    expect(summary).toContain('column chart');
    expect(summary).toContain('535000');
    const table = buildChartAccessibleTable(chart);
    expect(table.map((row) => row.category)).toEqual(['Europe-Central', 'Europe-North']);
    expect(table.map((row) => row.values.find((value) => value.series === 'revenue')?.value)).toEqual([535000, 412000]);
    // The chart is therefore never the only carrier of a number (package 21).
    expect(table.flatMap((row) => row.values).every((value) => Number.isFinite(value.value))).toBe(true);
  });

  it('renders an empty scope as an empty chart instead of a fabricated point', () => {
    const chart = buildInsightChartObject(visual(), [], context, model());
    expect(chart.categories).toEqual([]);
    expect(chart.series[0].values).toEqual([]);
    expect(buildChartAccessibleTable(chart)).toEqual([]);
  });
});

describe('Insight report layout engine (pure)', () => {
  it('places a visual snapped to the grid and removes it again', () => {
    const base = model().report;
    const placed = placeVisual(base, base.activePageId, visual({ x:13, y:19, width:553, height:301 }));
    expect(placed.pages[0].visuals).toHaveLength(3);
    const added = placed.pages[0].visuals.at(-1)!;
    expect([added.x, added.y, added.width, added.height]).toEqual([16, 16, 552, 304]);
    const removed = removeVisual(placed, base.activePageId, added.id);
    expect(removed.pages[0].visuals).toHaveLength(2);
    expect(() => removeVisual(removed, base.activePageId, added.id)).toThrowError('report-visual-missing');
  });

  it('moves and resizes by a bounded step, clamped to the page', () => {
    const base = model().report;
    const pageId = base.activePageId;
    const visualId = base.pages[0].visuals[0].id;
    const moved = moveVisual(base, pageId, visualId, { dx:16, dy:-8 });
    expect([moved.pages[0].visuals[0].x, moved.pages[0].visuals[0].y]).toEqual([48, 24]);
    // Clamped: a huge delta cannot push the visual off the page.
    const clamped = moveVisual(base, pageId, visualId, { dx:99_999, dy:99_999 });
    const page = clamped.pages[0];
    const card = page.visuals[0];
    expect(card.x + card.width).toBeLessThanOrEqual(page.width);
    expect(card.y + card.height).toBeLessThanOrEqual(page.height);
    // A minimum size is enforced in both directions.
    const shrunk = moveVisual(base, pageId, visualId, { dwidth:-9_999, dheight:-9_999 });
    expect(shrunk.pages[0].visuals[0].width).toBeGreaterThanOrEqual(40);
    expect(shrunk.pages[0].visuals[0].height).toBeGreaterThanOrEqual(30);
    expect(() => moveVisual(base, pageId, 'no-such-visual', { dx:8 })).toThrowError(InsightError);
  });

  it('adds a page, renames it and refuses a duplicate or blank name', () => {
    const base = model().report;
    const withPage = addReportPage(base, 'Detail');
    expect(withPage.pages).toHaveLength(2);
    expect(withPage.activePageId).toBe(withPage.pages[1].id);
    const renamed = renameReportPage(withPage, withPage.pages[1].id, 'Detail Q3');
    expect(renamed.pages[1].name).toBe('Detail Q3');
    expect(() => renameReportPage(withPage, withPage.pages[1].id, 'Overview')).toThrowError('report-page-name-taken');
    expect(() => renameReportPage(withPage, withPage.pages[1].id, '   ')).toThrowError(InsightError);
    expect(() => renameReportPage(withPage, 'no-such-page', 'x')).toThrowError('report-page-missing');
  });

  it('removes a report object and refuses an unknown one', () => {
    const base = model().report;
    const pageId = base.activePageId;
    const objectId = base.pages[0].objects[0].id;
    const removed = removeReportObject(base, pageId, objectId);
    expect(removed.pages[0].objects).toHaveLength(0);
    // The second removal of the same object runs against the result, so it must be refused.
    expect(() => removeReportObject(removed, pageId, objectId)).toThrowError('report-object-missing');
    expect(() => removeReportObject(base, pageId, 'no-such-object')).toThrowError('report-object-missing');
  });
});
