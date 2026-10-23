import { describe, expect, it } from 'vitest';
import { chartToCanonicalRenderTree } from '../chartEngine';
import { buildGridChartSvg } from '../chartSvgRenderer';
import type { ChartObject } from '../../contracts/workspace';

describe('Grid chart SVG hostile persisted-data bounds', () => {
  it('renders a maximum-valid aggregate chart without overflowing spread arguments', () => {
    const pointValues = Array.from({ length: 2_048 }, (_, index) => (index % 31) + 1);
    const chart: ChartObject = {
      id: 'aggregate-radar',
      chart_type: 'radar',
      title: 'Maximum valid series payload',
      categories: ['North', 'East', 'South'],
      series: Array.from({ length: 64 }, (_, index) => ({
        name: `Series ${index + 1}`,
        values: pointValues,
      })),
    };

    expect(() => buildGridChartSvg(chart)).not.toThrow();
    expect(buildGridChartSvg(chart)).toContain('<svg');
  });

  it('renders a maximum-valid Surface chart without aggregate extrema argument overflow', () => {
    const pointValues = Array.from({ length: 2_048 }, (_, index) => (index % 31) + 1);
    const chart: ChartObject = {
      id: 'aggregate-surface',
      chart_type: 'surface',
      title: 'Maximum valid Surface payload',
      categories: [],
      series: Array.from({ length: 64 }, (_, index) => ({
        name: `Series ${index + 1}`,
        values: pointValues,
      })),
    };

    expect(() => buildGridChartSvg(chart)).not.toThrow();
  });

  it('builds a canonical render tree for the maximum-valid aggregate payload', () => {
    const pointValues = Array.from({ length: 2_048 }, (_, index) => (index % 31) + 1);
    const chart: ChartObject = {
      id: 'aggregate-render-tree',
      chart_type: 'line',
      title: 'Maximum valid canonical render payload',
      categories: [],
      series: Array.from({ length: 64 }, (_, index) => ({
        name: `Series ${index + 1}`,
        values: pointValues,
      })),
    };

    expect(() => chartToCanonicalRenderTree(chart)).not.toThrow();
  });
});
