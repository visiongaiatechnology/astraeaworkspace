// STATUS: PLATIN
// Bounded text equivalent for chart imagery used by screen readers.

import type { ChartObject } from '../contracts/workspace';

const MAX_SUMMARY_LENGTH = 4_000;
const MAX_SERIES = 8;
const MAX_POINTS_PER_SERIES = 6;
const MAX_LABEL_LENGTH = 64;

function boundedLabel(value: string, fallback: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || fallback).slice(0, MAX_LABEL_LENGTH);
}

/** Produces useful screen reader output without announcing an unbounded dataset. */
export function buildChartAccessibleSummary(chart: ChartObject): string {
  const normalized = chart;
  const title = boundedLabel(normalized.title, 'Chart');
  const pointCount = Math.max(0, ...normalized.series.map((series) => series.values.length));
  const seriesCount = normalized.series.length;
  const categoryCount = normalized.categories.length;
  const axisContext = [normalized.x_axis_title, normalized.y_axis_title]
    .filter((axis): axis is string => Boolean(axis))
    .map((axis) => boundedLabel(axis, ''))
    .filter(Boolean);
  const seriesText = normalized.series.slice(0, MAX_SERIES).map((series, seriesIndex) => {
    const name = boundedLabel(series.name, `Series ${seriesIndex + 1}`);
    const values = series.values.slice(0, MAX_POINTS_PER_SERIES).map((value, pointIndex) => {
      const category = normalized.categories[pointIndex];
      if (normalized.chart_type === 'scatter' || normalized.chart_type === 'bubble') {
        const xValue = series.x_values?.[pointIndex] ?? pointIndex + 1;
        return `x ${xValue}: ${value}`;
      }
      return `${category ? `${boundedLabel(category, `Point ${pointIndex + 1}`)}: ` : ''}${value}`;
    });
    const omitted = Math.max(0, series.values.length - MAX_POINTS_PER_SERIES);
    const suffix = omitted > 0 ? `; ${omitted} more values` : '';
    return `${name}: ${values.length ? values.join('; ') : 'no values'}${suffix}`;
  });
  const omittedSeries = Math.max(0, seriesCount - MAX_SERIES);
  const details = seriesText.length ? ` Data: ${seriesText.join('. ')}.` : ' No data series.';
  const axes = axisContext.length ? ` Axes: ${axisContext.join(', ')}.` : '';
  const omitted = omittedSeries > 0 ? ` ${omittedSeries} additional series omitted.` : '';
  const seriesLabel = omittedSeries > 0 ? `${MAX_SERIES} of ${seriesCount} series shown` : `${seriesCount} series`;
  return `${title}. ${normalized.chart_type} chart with ${seriesLabel}, ${Math.max(categoryCount, pointCount)} points.${axes}${details}${omitted}`
    .slice(0, MAX_SUMMARY_LENGTH);
}
