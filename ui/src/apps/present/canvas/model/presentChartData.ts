// STATUS: PLATIN — bounded, pure Present chart data model (edit the numbers, axes, legend, labels).
//
// Paket 14 "Chart auf Folie": "Lokalen Chart einfügen und Daten über ein **editierbares
// Tabellenmodell** bearbeiten".
// Paket 16 "Diagramme mit Datenbeschriftung": "**Achsen, Legenden und Reihen** aus sichtbarem
// Inspector bearbeiten".
//
// Before this module a chart scene object could only be inserted with generated demo numbers: the
// shared `ChartRenderer` is read-only (`<img>` from an SVG data URL plus an optional accessible
// table), and Present's inspector had no chart section at all. The data therefore never belonged to
// the user. This module is the single definition of how chart data may be edited, and it bounds
// every field because a chart can arrive from an imported deck.

import type { ChartLegendPosition, ChartObject, ChartType } from '../../../../shared/contracts/workspace';

export const PRESENT_CHART_MAX_CATEGORIES = 64;
export const PRESENT_CHART_MAX_SERIES = 16;
export const PRESENT_CHART_MAX_LABEL_LENGTH = 256;
export const PRESENT_CHART_MAX_TITLE_LENGTH = 512;
export const PRESENT_CHART_MAX_AXIS_TITLE_LENGTH = 128;
export const PRESENT_CHART_MAX_ABS_VALUE = 1e12;
export const PRESENT_CHART_MAX_SERIES_NAME_LENGTH = 128;

/** Chart types Present can render and let the user choose; the shared renderer accepts all of them. */
export const PRESENT_CHART_TYPES: readonly ChartType[] = [
  'column', 'bar', 'line', 'area', 'pie', 'donut', 'sparkline',
] as const;

export const PRESENT_CHART_LEGEND_POSITIONS: readonly ChartLegendPosition[] = ['none', 'top', 'right', 'bottom', 'left'] as const;

export interface PresentChartResult {
  chart: ChartObject;
  changed: boolean;
  message?: string;
  reason?: 'category-limit' | 'series-limit' | 'last-category' | 'last-series' | 'out-of-range' | 'unchanged' | 'invalid-value';
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * A label that must not be blank. `||` alone keeps `'   '`, which renders as an empty axis or series
 * name (found by my own test), so whitespace is treated as "no value" and the fallback applies.
 */
export function presentChartLabel(value: unknown, max: number, fallback: string): string {
  const text = boundedText(value, max).trim();
  return text || fallback;
}

/** Optional label: an empty/whitespace-only value means "no label", not an empty string. */
function optionalLabel(value: unknown, max: number): string | undefined {
  const text = boundedText(value, max).trim();
  return text || undefined;
}

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Finite, bounded numbers only: `NaN`, `Infinity` and 1e300 are all rejected to the previous value. */
export function normalizePresentChartValue(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  if (Math.abs(numeric) > PRESENT_CHART_MAX_ABS_VALUE) return undefined;
  return Math.round(numeric * 1000) / 1000;
}

/**
 * Makes a chart rectangular and bounded: `categories.length` and every series length always agree,
 * so the renderer and the accessible table can never disagree about a cell.
 */
export function normalizePresentChart(chart: ChartObject): ChartObject {
  const rawCategories = Array.isArray(chart.categories) ? chart.categories.slice(0, PRESENT_CHART_MAX_CATEGORIES) : [];
  const categories = (rawCategories.length ? rawCategories : ['Category 1']).map(
    (category, index) => presentChartLabel(category, PRESENT_CHART_MAX_LABEL_LENGTH, `Category ${index + 1}`),
  );
  const rawSeries = Array.isArray(chart.series) ? chart.series.slice(0, PRESENT_CHART_MAX_SERIES) : [];
  const series = (rawSeries.length ? rawSeries : [{ name: 'Series 1', values: [] }]).map((entry, index) => {
    const values = categories.map((_, valueIndex) => {
      const candidate = Array.isArray(entry?.values) ? entry.values[valueIndex] : undefined;
      return normalizePresentChartValue(candidate) ?? 0;
    });
    // The previous version spread `...entry` and only *added* a valid colour, so an invalid colour
    // survived into the chart. The colour is now decided explicitly.
    const { color: rawColor, ...rest } = entry ?? { name: '', values: [] };
    const color = typeof rawColor === 'string' && COLOR_PATTERN.test(rawColor.trim()) ? rawColor.trim().toLowerCase() : undefined;
    return {
      ...rest,
      name: presentChartLabel(entry?.name, PRESENT_CHART_MAX_SERIES_NAME_LENGTH, `Series ${index + 1}`),
      values,
      ...(color ? { color } : {}),
    };
  });
  const chartType = PRESENT_CHART_TYPES.includes(chart.chart_type) ? chart.chart_type : 'column';
  const legend = PRESENT_CHART_LEGEND_POSITIONS.includes(chart.legend_position as ChartLegendPosition)
    ? chart.legend_position
    : 'bottom';
  return {
    ...chart,
    chart_type: chartType,
    title: presentChartLabel(chart.title, PRESENT_CHART_MAX_TITLE_LENGTH, 'Chart'),
    categories,
    series,
    legend_position: legend,
    x_axis_title: optionalLabel(chart.x_axis_title, PRESENT_CHART_MAX_AXIS_TITLE_LENGTH),
    y_axis_title: optionalLabel(chart.y_axis_title, PRESENT_CHART_MAX_AXIS_TITLE_LENGTH),
    show_data_labels: chart.show_data_labels === true,
    show_gridlines: chart.show_gridlines !== false,
  };
}

function replaceSeries(chart: ChartObject, seriesIndex: number, patch: (series: ChartObject['series'][number]) => ChartObject['series'][number]): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  if (seriesIndex < 0 || seriesIndex >= normalized.series.length) {
    return { chart: normalized, changed: false, message: 'That series does not exist.', reason: 'out-of-range' };
  }
  const series = normalized.series.map((entry, index) => (index === seriesIndex ? patch(entry) : entry));
  return { chart: normalizePresentChart({ ...normalized, series }), changed: true };
}

/** Edits one data cell. An unusable number is refused with a message instead of becoming `NaN`. */
export function setPresentChartValue(chart: ChartObject, seriesIndex: number, valueIndex: number, value: unknown): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  if (seriesIndex < 0 || seriesIndex >= normalized.series.length || valueIndex < 0 || valueIndex >= normalized.categories.length) {
    return { chart: normalized, changed: false, message: 'That data cell is outside the chart.', reason: 'out-of-range' };
  }
  const parsed = normalizePresentChartValue(value);
  if (parsed === undefined) {
    return { chart: normalized, changed: false, message: 'Enter a finite number within ±1e12.', reason: 'invalid-value' };
  }
  if (normalized.series[seriesIndex].values[valueIndex] === parsed) return { chart: normalized, changed: false, reason: 'unchanged' };
  return replaceSeries(normalized, seriesIndex, (entry) => ({
    ...entry,
    values: entry.values.map((current, index) => (index === valueIndex ? parsed : current)),
  }));
}

export function setPresentChartCategory(chart: ChartObject, categoryIndex: number, label: string): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  if (categoryIndex < 0 || categoryIndex >= normalized.categories.length) {
    return { chart: normalized, changed: false, message: 'That category does not exist.', reason: 'out-of-range' };
  }
  const next = presentChartLabel(label, PRESENT_CHART_MAX_LABEL_LENGTH, `Category ${categoryIndex + 1}`);
  if (normalized.categories[categoryIndex] === next) return { chart: normalized, changed: false, reason: 'unchanged' };
  const categories = normalized.categories.map((category, index) => (index === categoryIndex ? next : category));
  // Every series grows with the categories, so the row stays aligned.
  const series = normalized.series.map((entry) => ({ ...entry, values: categories.map((_, index) => entry.values[index] ?? 0) }));
  return { chart: normalizePresentChart({ ...normalized, categories, series }), changed: true };
}

export function appendPresentChartCategory(chart: ChartObject): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  if (normalized.categories.length >= PRESENT_CHART_MAX_CATEGORIES) {
    return { chart: normalized, changed: false, message: `A chart holds at most ${PRESENT_CHART_MAX_CATEGORIES} categories.`, reason: 'category-limit' };
  }
  const categories = [...normalized.categories, `Category ${normalized.categories.length + 1}`];
  const series = normalized.series.map((entry) => ({ ...entry, values: [...entry.values, 0] }));
  return { chart: normalizePresentChart({ ...normalized, categories, series }), changed: true };
}

export function removePresentChartCategory(chart: ChartObject, categoryIndex: number): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  if (categoryIndex < 0 || categoryIndex >= normalized.categories.length) {
    return { chart: normalized, changed: false, message: 'That category does not exist.', reason: 'out-of-range' };
  }
  if (normalized.categories.length <= 1) {
    return { chart: normalized, changed: false, message: 'A chart keeps at least one category.', reason: 'last-category' };
  }
  const categories = normalized.categories.filter((_, index) => index !== categoryIndex);
  const series = normalized.series.map((entry) => ({ ...entry, values: entry.values.filter((_, index) => index !== categoryIndex) }));
  return { chart: normalizePresentChart({ ...normalized, categories, series }), changed: true };
}

export function setPresentChartSeriesName(chart: ChartObject, seriesIndex: number, name: string): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  const next = presentChartLabel(name, PRESENT_CHART_MAX_SERIES_NAME_LENGTH, `Series ${seriesIndex + 1}`);
  if (seriesIndex >= 0 && seriesIndex < normalized.series.length && normalized.series[seriesIndex].name === next) {
    return { chart: normalized, changed: false, reason: 'unchanged' };
  }
  return replaceSeries(normalized, seriesIndex, (entry) => ({ ...entry, name: next }));
}

export function appendPresentChartSeries(chart: ChartObject): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  if (normalized.series.length >= PRESENT_CHART_MAX_SERIES) {
    return { chart: normalized, changed: false, message: `A chart holds at most ${PRESENT_CHART_MAX_SERIES} series.`, reason: 'series-limit' };
  }
  const series = [...normalized.series, { name: `Series ${normalized.series.length + 1}`, values: normalized.categories.map(() => 0) }];
  return { chart: normalizePresentChart({ ...normalized, series }), changed: true };
}

export function removePresentChartSeries(chart: ChartObject, seriesIndex: number): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  if (seriesIndex < 0 || seriesIndex >= normalized.series.length) {
    return { chart: normalized, changed: false, message: 'That series does not exist.', reason: 'out-of-range' };
  }
  if (normalized.series.length <= 1) {
    return { chart: normalized, changed: false, message: 'A chart keeps at least one series.', reason: 'last-series' };
  }
  return { chart: normalizePresentChart({ ...normalized, series: normalized.series.filter((_, index) => index !== seriesIndex) }), changed: true };
}

export interface PresentChartOptionsPatch {
  title?: string;
  chartType?: ChartType;
  xAxisTitle?: string;
  yAxisTitle?: string;
  legendPosition?: ChartLegendPosition;
  showDataLabels?: boolean;
  showGridlines?: boolean;
}

/** Applies the inspector options. An unknown chart type or legend position is ignored, not stored. */
export function applyPresentChartOptions(chart: ChartObject, patch: PresentChartOptionsPatch): PresentChartResult {
  const normalized = normalizePresentChart(chart);
  const next: ChartObject = { ...normalized };
  if (patch.title !== undefined) next.title = presentChartLabel(patch.title, PRESENT_CHART_MAX_TITLE_LENGTH, 'Chart');
  if (patch.chartType !== undefined && PRESENT_CHART_TYPES.includes(patch.chartType)) next.chart_type = patch.chartType;
  if (patch.xAxisTitle !== undefined) next.x_axis_title = optionalLabel(patch.xAxisTitle, PRESENT_CHART_MAX_AXIS_TITLE_LENGTH);
  if (patch.yAxisTitle !== undefined) next.y_axis_title = optionalLabel(patch.yAxisTitle, PRESENT_CHART_MAX_AXIS_TITLE_LENGTH);
  if (patch.legendPosition !== undefined && PRESENT_CHART_LEGEND_POSITIONS.includes(patch.legendPosition)) next.legend_position = patch.legendPosition;
  if (patch.showDataLabels !== undefined) next.show_data_labels = patch.showDataLabels === true;
  if (patch.showGridlines !== undefined) next.show_gridlines = patch.showGridlines === true;
  const result = normalizePresentChart(next);
  const changed = JSON.stringify(result) !== JSON.stringify(normalized);
  return { chart: result, changed, ...(changed ? {} : { reason: 'unchanged' as const }) };
}

/** Read-only matrix used by the inspector's editable table, kept rectangular and bounded. */
export function presentChartDataMatrix(chart: ChartObject): { categories: string[]; seriesNames: string[]; values: number[][] } {
  const normalized = normalizePresentChart(chart);
  return {
    categories: normalized.categories,
    seriesNames: normalized.series.map((entry) => entry.name),
    values: normalized.series.map((entry) => [...entry.values]),
  };
}
