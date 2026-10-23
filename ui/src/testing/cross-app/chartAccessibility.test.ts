// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChartObject } from '../../shared/contracts/workspace';
import { buildChartAccessibleSummary } from '../../shared/charts/chartAccessibility';
import { ChartRenderer } from '../../shared/charts/ChartRenderer';
import { buildGridChartSvg } from '../../shared/charts/chartSvgRenderer';

const multiSeriesChart: ChartObject = {
  id: 'accessible-chart',
  chart_type: 'line',
  title: 'Quarterly Revenue',
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'Revenue', values: [12, 18, 16], color: '#111111' },
    { name: 'Forecast', values: [10, 15, 19], color: '#111111' },
    { name: 'Target', values: [11, 17, 20], color: '#111111' },
  ],
  x_axis_title: 'Quarter',
  y_axis_title: 'Millions of euros',
  legend_position: 'bottom',
};

describe('shared chart accessibility presentation', () => {
  it('provides the chart title, axes, category labels and values as a bounded text equivalent', () => {
    const summary = buildChartAccessibleSummary(multiSeriesChart);

    expect(summary).toContain('Quarterly Revenue');
    expect(summary).toContain('Axes: Quarter, Millions of euros');
    expect(summary).toContain('Revenue: Q1: 12; Q2: 18; Q3: 16');
    expect(summary).toContain('Forecast: Q1: 10; Q2: 15; Q3: 19');
  });

  it('renders an associated figure caption and keeps the image from duplicating the spoken content', () => {
    const markup = renderToStaticMarkup(createElement(ChartRenderer, { chart: multiSeriesChart, interactive: true }));
    const figureLabel = markup.match(/<figure[^>]*aria-labelledby="([^"]+)"/)?.[1];

    expect(figureLabel).toBeTruthy();
    expect(markup).toContain(`<figcaption id="${figureLabel}"`);
    expect(markup).toContain('alt="" aria-hidden="true"');
    expect(markup).toContain('Revenue: Q1: 12; Q2: 18; Q3: 16');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('limits series and point narration for large chart models while stating what was omitted', () => {
    const largeChart: ChartObject = {
      ...multiSeriesChart,
      categories: Array.from({ length: 40 }, (_, index) => `Category ${index + 1}`),
      series: Array.from({ length: 10 }, (_, seriesIndex) => ({
        name: `Series ${seriesIndex + 1}`,
        values: Array.from({ length: 40 }, (_, pointIndex) => seriesIndex + pointIndex),
        color: '#111111',
      })),
    };
    const summary = buildChartAccessibleSummary(largeChart);

    expect(summary.length).toBeLessThanOrEqual(4_000);
    expect(summary).toContain('34 more values');
    expect(summary).toContain('2 additional series omitted');
  });

  it('distinguishes monochrome line series with independent dash and marker encodings', () => {
    const extendedChart: ChartObject = {
      ...multiSeriesChart,
      series: Array.from({ length: 8 }, (_, index) => ({
        name: `Series ${index + 1}`,
        values: [12, 18, 16],
        color: '#111111',
      })),
    };
    const svg = buildGridChartSvg(extendedChart);
    const seriesPaths = [...svg.matchAll(/<path\b[^>]*stroke-width="2\.3"[^>]*>/g)]
      .map(([element]) => element);
    const dashPatterns = seriesPaths.map((element) => element.match(/stroke-dasharray="([^"]+)"/)?.[1] ?? 'solid');

    expect(seriesPaths).toHaveLength(8);
    expect(dashPatterns.slice(0, 3)).toEqual(['solid', '8 4', '2 4']);
    expect(svg).toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="3\.6" fill="#111111"/);
    expect(svg).toMatch(/<rect x="[\d.]+" y="[\d.]+" width="7\.2" height="7\.2" fill="#111111"/);
    expect(svg).toMatch(/<path d="M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ Z" fill="#111111"/);
    expect(svg).toMatch(/<path d="M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ M [\d.]+ [\d.]+ L [\d.]+ [\d.]+" fill="none" stroke="#111111"/);
  });

  it('preserves original line identities through combo-chart grouping', () => {
    const comboChart: ChartObject = {
      ...multiSeriesChart,
      chart_type: 'combo',
      series: [
        { name: 'Columns', values: [8, 10, 12], color: '#111111', chart_type: 'column' },
        { name: 'Forecast', values: [10, 15, 19], color: '#111111', chart_type: 'line' },
        { name: 'Target', values: [11, 17, 20], color: '#111111', chart_type: 'line' },
      ],
    };
    const svg = buildGridChartSvg(comboChart);
    const linePaths = [...svg.matchAll(/<path\b[^>]*stroke-width="2\.3"[^>]*>/g)].map(([element]) => element);

    expect(linePaths).toHaveLength(2);
    expect(linePaths.map((element) => element.match(/stroke-dasharray="([^"]+)"/)?.[1] ?? 'solid'))
      .toEqual(['8 4', '2 4']);
  });

  it('distinguishes monochrome columns and pie slices with print-safe patterns', () => {
    const monochromeColumns: ChartObject = {
      ...multiSeriesChart,
      chart_type: 'column',
      series: Array.from({ length: 5 }, (_, index) => ({
        name: `Series ${index + 1}`,
        values: [12 + index, 18 + index, 16 + index],
        color: '#111111',
      })),
    };
    const columnsSvg = buildGridChartSvg(monochromeColumns);
    const bars = [...columnsSvg.matchAll(/<rect\b[^>]*fill="url\(#astraea-chart-pattern-(\d+)\)"/g)];

    expect(columnsSvg).toContain('<defs>');
    expect(bars.length).toBeGreaterThanOrEqual(15);
    expect(new Set(bars.slice(0, 15).map((match) => match[1])).size).toBe(5);

    const monochromePie: ChartObject = {
      ...multiSeriesChart,
      chart_type: 'pie',
      series: [{ name: 'Share', values: [12, 18, 16, 20, 14], color: '#111111' }],
    };
    const pieSvg = buildGridChartSvg(monochromePie);
    const slices = [...pieSvg.matchAll(/<path d="M [^\"]+" fill="url\(#astraea-chart-pattern-(\d+)\)"\/>/g)];

    expect(slices).toHaveLength(5);
    expect(new Set(slices.map((match) => match[1])).size).toBe(5);
  });

  it('bounds marker density for dense line data while retaining the final sample marker', () => {
    const denseChart: ChartObject = {
      ...multiSeriesChart,
      categories: [],
      series: [{ name: 'Dense series', values: Array.from({ length: 2_048 }, (_, index) => index), color: '#111111' }],
    };
    const svg = buildGridChartSvg(denseChart);
    const pointMarkers = [...svg.matchAll(/r="3\.6" fill="#111111"/g)];

    expect(pointMarkers).toHaveLength(129);
  });
});
