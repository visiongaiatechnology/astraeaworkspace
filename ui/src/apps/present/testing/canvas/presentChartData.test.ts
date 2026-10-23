// BATCH-PRESENT — bounded chart data model and live-link status (Paket 14, 15, 16).
import { describe, expect, it } from 'vitest';
import type { ChartObject } from '../../../../shared/contracts/workspace';
import {
  PRESENT_CHART_MAX_CATEGORIES,
  PRESENT_CHART_MAX_SERIES,
  appendPresentChartCategory,
  appendPresentChartSeries,
  applyPresentChartOptions,
  normalizePresentChart,
  normalizePresentChartValue,
  presentChartDataMatrix,
  removePresentChartCategory,
  removePresentChartSeries,
  setPresentChartCategory,
  setPresentChartSeriesName,
  setPresentChartValue,
} from '../../canvas/model/presentChartData';
import {
  resolvePresentLinkStatus,
  summarizePresentSlideLinks,
} from '../../integrations/presentLinkStatus';

const chart = (patch: Partial<ChartObject> = {}): ChartObject => ({
  id: 'chart-1',
  chart_type: 'column',
  title: 'Revenue',
  categories: ['Q1', 'Q2'],
  series: [
    { name: 'Actual', values: [10, 20], color: '#38BDF8' },
    { name: 'Plan', values: [12, 18] },
  ],
  ...patch,
});

describe('normalizePresentChart', () => {
  it('makes every series as long as the category list', () => {
    const normalized = normalizePresentChart(chart({ series: [{ name: 'A', values: [1] }, { name: 'B', values: [1, 2, 3] }] }));
    expect(normalized.series.every((series) => series.values.length === normalized.categories.length)).toBe(true);
    expect(normalized.series[0].values).toEqual([1, 0]);
    expect(normalized.series[1].values).toEqual([1, 2]);
  });

  it('bounds categories, series, labels, values and enums', () => {
    const hostile = normalizePresentChart(chart({
      categories: Array.from({ length: PRESENT_CHART_MAX_CATEGORIES + 9 }, () => 'c'.repeat(1000)),
      series: Array.from({ length: PRESENT_CHART_MAX_SERIES + 4 }, () => ({ name: 'n'.repeat(1000), values: [1e300, Number.NaN, Number.POSITIVE_INFINITY] })),
      chart_type: 'not-a-type' as ChartObject['chart_type'],
      legend_position: 'middle' as ChartObject['legend_position'],
    }));
    expect(hostile.categories).toHaveLength(PRESENT_CHART_MAX_CATEGORIES);
    expect(hostile.series).toHaveLength(PRESENT_CHART_MAX_SERIES);
    expect(hostile.categories[0].length).toBeLessThanOrEqual(256);
    expect(hostile.series[0].name.length).toBeLessThanOrEqual(128);
    // NaN / Infinity / 1e300 all fall back to 0 instead of reaching the renderer.
    expect(hostile.series[0].values.every((value) => value === 0)).toBe(true);
    expect(hostile.series[0].values).toHaveLength(PRESENT_CHART_MAX_CATEGORIES);
    expect(hostile.chart_type).toBe('column');
    expect(hostile.legend_position).toBe('bottom');
  });

  it('keeps a lowercase hex colour and drops anything else', () => {
    const normalized = normalizePresentChart(chart({ series: [{ name: 'A', values: [1, 2], color: '#ABCDEF' }, { name: 'B', values: [1, 2], color: 'red' }] }));
    expect(normalized.series[0].color).toBe('#abcdef');
    expect(normalized.series[1].color).toBeUndefined();
  });

  it('never produces a chart without a category or a series', () => {
    const empty = normalizePresentChart(chart({ categories: [], series: [] }));
    expect(empty.categories).toHaveLength(1);
    expect(empty.series).toHaveLength(1);
    expect(empty.series[0].values).toHaveLength(1);
  });

  it('bounds values through the shared normaliser', () => {
    expect(normalizePresentChartValue('12.34567')).toBe(12.346);
    expect(normalizePresentChartValue('abc')).toBeUndefined();
    expect(normalizePresentChartValue(Number.NaN)).toBeUndefined();
    expect(normalizePresentChartValue(1e13)).toBeUndefined();
  });
});

describe('chart data editing', () => {
  it('edits one cell and refuses an unusable value with a message', () => {
    const edited = setPresentChartValue(chart(), 0, 1, 42);
    expect(edited.changed).toBe(true);
    expect(edited.chart.series[0].values[1]).toBe(42);
    const invalid = setPresentChartValue(chart(), 0, 1, 'not a number');
    expect(invalid.changed).toBe(false);
    expect(invalid.reason).toBe('invalid-value');
    expect(invalid.message).toContain('finite number');
    expect(setPresentChartValue(chart(), 0, 0, 10).reason).toBe('unchanged');
    expect(setPresentChartValue(chart(), 9, 0, 1).message).toContain('outside the chart');
  });

  it('renames a category and keeps every series aligned', () => {
    const renamed = setPresentChartCategory(chart(), 1, 'H2');
    expect(renamed.chart.categories).toEqual(['Q1', 'H2']);
    expect(renamed.chart.series.map((series) => series.values.length)).toEqual([2, 2]);
  });

  it('adds and removes categories and series within the documented limits', () => {
    const added = appendPresentChartCategory(chart());
    expect(added.chart.categories).toHaveLength(3);
    expect(added.chart.series.every((series) => series.values.length === 3)).toBe(true);
    expect(removePresentChartCategory(added.chart, 0).chart.categories).toEqual(['Q2', 'Category 3']);
    expect(appendPresentChartSeries(chart()).chart.series).toHaveLength(3);
    expect(removePresentChartSeries(chart(), 0).chart.series).toHaveLength(1);

    const oneCategory = chart({ categories: ['Only'], series: [{ name: 'A', values: [1] }] });
    expect(removePresentChartCategory(oneCategory, 0).message).toContain('at least one category');
    const oneSeries = chart({ series: [{ name: 'A', values: [1, 2] }] });
    expect(removePresentChartSeries(oneSeries, 0).message).toContain('at least one series');

    const maxCategories = chart({
      categories: Array.from({ length: PRESENT_CHART_MAX_CATEGORIES }, (_, i) => `C${i}`),
    });
    expect(appendPresentChartCategory(maxCategories).message).toContain('at most');
    const maxSeries = chart({ series: Array.from({ length: PRESENT_CHART_MAX_SERIES }, (_, i) => ({ name: `S${i}`, values: [1, 2] })) });
    expect(appendPresentChartSeries(maxSeries).message).toContain('at most');
  });

  it('renames a series and reports an unchanged name', () => {
    expect(setPresentChartSeriesName(chart(), 0, 'Forecast').chart.series[0].name).toBe('Forecast');
    expect(setPresentChartSeriesName(chart(), 0, 'Actual').reason).toBe('unchanged');
    expect(setPresentChartSeriesName(chart(), 0, '   ').chart.series[0].name).toBe('Series 1');
  });

  it('applies axis, legend and data-label options and ignores unknown enum values', () => {
    const options = applyPresentChartOptions(chart(), {
      title: 'Revenue 2026',
      chartType: 'line',
      xAxisTitle: 'Quarter',
      yAxisTitle: 'EUR',
      legendPosition: 'right',
      showDataLabels: true,
      showGridlines: false,
    });
    expect(options.changed).toBe(true);
    expect(options.chart).toMatchObject({
      title: 'Revenue 2026',
      chart_type: 'line',
      x_axis_title: 'Quarter',
      y_axis_title: 'EUR',
      legend_position: 'right',
      show_data_labels: true,
      show_gridlines: false,
    });
    const ignored = applyPresentChartOptions(chart(), { chartType: 'nope' as ChartObject['chart_type'], legendPosition: 'middle' as ChartObject['legend_position'] });
    expect(ignored.chart.chart_type).toBe('column');
    expect(ignored.chart.legend_position).toBe('bottom');
    expect(applyPresentChartOptions(chart(), { title: 'Revenue' }).changed).toBe(false);
  });

  it('exposes a rectangular matrix for the editable table', () => {
    const matrix = presentChartDataMatrix(chart());
    expect(matrix.categories).toEqual(['Q1', 'Q2']);
    expect(matrix.seriesNames).toEqual(['Actual', 'Plan']);
    expect(matrix.values).toEqual([[10, 20], [12, 18]]);
  });
});

describe('live link status (Paket 15)', () => {
  const liveObject = { mode: 'Live' as const, sourceVersion: 4, title: 'Chart' };

  it('reports up to date, updated, stale, offline and frozen as distinct text', () => {
    expect(resolvePresentLinkStatus({ object: liveObject, sourceVersion: 4 })).toMatchObject({ state: 'live-current', attention: false });
    expect(resolvePresentLinkStatus({ object: liveObject, sourceVersion: 5, refreshed: true })).toMatchObject({ state: 'live-updated', attention: false, versionDelta: 1 });
    expect(resolvePresentLinkStatus({ object: liveObject, sourceVersion: 3 })).toMatchObject({ state: 'live-stale', attention: true, versionDelta: -1 });
    expect(resolvePresentLinkStatus({ object: liveObject, sourceVersion: null })).toMatchObject({ state: 'offline', attention: true });
    expect(resolvePresentLinkStatus({ object: { ...liveObject, mode: 'Frozen' }, sourceVersion: null })).toMatchObject({ state: 'frozen', attention: false });
  });

  it('never calls a missing source "current" and always carries text', () => {
    for (const sourceVersion of [null, Number.NaN]) {
      const status = resolvePresentLinkStatus({ object: liveObject, sourceVersion });
      expect(status.state).toBe('offline');
      expect(status.label.length).toBeGreaterThan(0);
      expect(status.attention).toBe(true);
    }
  });

  it('summarises a whole slide for the canvas badge', () => {
    const objects = [
      { id: 'a', mode: 'Live' as const, sourceVersion: 1, title: 'A', sourceDocumentId: 'doc-1' },
      { id: 'b', mode: 'Live' as const, sourceVersion: 9, title: 'B', sourceDocumentId: 'doc-missing' },
      { id: 'c', mode: 'Frozen' as const, sourceVersion: 1, title: 'C', sourceDocumentId: 'doc-1' },
    ];
    const summary = summarizePresentSlideLinks(objects, new Map([['doc-1', 1]]));
    expect(summary.liveCount).toBe(2);
    expect(summary.attentionCount).toBe(1);
    expect(summary.statuses.find((status) => status.id === 'b')?.state).toBe('offline');
    expect(summary.statuses.find((status) => status.id === 'c')?.state).toBe('frozen');
  });
});
