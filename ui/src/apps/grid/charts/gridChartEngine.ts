// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded chart data engine: range/table/pivot sources, trendlines, error bars and templates.

import type {
  ChartObject,
  ChartSeries,
  GridCell,
  GridPivotDefinition,
  GridStructuredTable,
  GridChartTemplate,
} from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { normalizeCanonicalChart } from '../../../shared/charts/chartModel';
import { parseGridRange } from '../compat/gridProfessional';
import { buildPivotTableModel } from '../pivots/gridPivotModel';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';

export { calculateChartErrorBars, calculateChartTrendline } from '../../../shared/charts/chartEngine';

const MAX_CHART_POINTS = 2_048;
const MAX_CHART_SERIES = 64;
const MAX_CHART_CELLS = 100_000;
const DEFAULT_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#ef4444','#84cc16'];

export interface GridChartSourceOptions {
  documentId?: string;
  tableObjectId?: string;
  sheetId: string;
  live?: boolean;
  title?: string;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  // An empty cell is *not* the number 0: treating it as 0 fabricated data points and skewed the
  // header/category heuristic in `buildGridChartFromRange`.
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function rangeCellCount(range: string): number {
  const bounds = parseGridRange(range);
  if (!bounds) return 0;
  return (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
}

function sourceLink(documentId: string | undefined, objectId: string | undefined, range: string): string | undefined {
  if (!documentId || !objectId) return undefined;
  return `vgt://workspace/document/${encodeURIComponent(documentId)}/object/${encodeURIComponent(objectId)}?range=${encodeURIComponent(range)}`;
}

export function buildGridChartFromRange(
  cells: Record<string, GridCell>,
  range: string,
  chartType: ChartObject['chart_type'],
  options: GridChartSourceOptions,
): ChartObject {
  const bounds = parseGridRange(range);
  const count = rangeCellCount(range);
  if (!bounds || count <= 0 || count > MAX_CHART_CELLS) throw new Error('chart_source_range_limit');
  const rows = bounds.endRow - bounds.startRow + 1;
  const cols = bounds.endCol - bounds.startCol + 1;
  if (rows > MAX_CHART_POINTS + 1 || cols > MAX_CHART_SERIES + 2) throw new Error('chart_series_point_limit');

  const matrix: Array<Array<GridCell['value']>> = [];
  for (let r = bounds.startRow; r <= bounds.endRow; r++) {
    const row: Array<GridCell['value']> = [];
    for (let c = bounds.startCol; c <= bounds.endCol; c++) row.push(cells[toA1(c, r)]?.value ?? '');
    matrix.push(row);
  }

  const firstRowNumeric = matrix[0]?.slice(1).filter((value) => numeric(value) !== null).length ?? 0;
  const hasHeader = rows > 1 && cols > 1 && firstRowNumeric < Math.max(1, cols - 1);
  const data = hasHeader ? matrix.slice(1) : matrix;
  const categoryColumnIsText = cols > 1 && data.filter((row) => numeric(row[0]) === null && String(row[0] ?? '').trim() !== '').length >= Math.ceil(data.length / 2);
  const categories = data.slice(0, MAX_CHART_POINTS).map((row, index) => categoryColumnIsText ? String(row[0] ?? index + 1).slice(0, 256) : String(index + 1));
  const seriesStart = categoryColumnIsText ? 1 : 0;
  const series: ChartSeries[] = [];

  for (let c = seriesStart; c < cols && series.length < MAX_CHART_SERIES; c++) {
    const values = data.slice(0, MAX_CHART_POINTS).map((row) => numeric(row[c]) ?? 0);
    if (!values.some((value) => value !== 0) && data.every((row) => numeric(row[c]) === null)) continue;
    series.push({
      name: hasHeader ? String(matrix[0]?.[c] || `Series ${series.length + 1}`).slice(0, 256) : `Series ${series.length + 1}`,
      values,
      color: DEFAULT_COLORS[series.length % DEFAULT_COLORS.length],
    });
  }
  if (series.length === 0 && cols === 1) {
    // A single column is chartable only if it really carries numbers: a text-only column used to
    // produce a fabricated all-zero series.
    const singleValues = data.map((row) => numeric(row[0]));
    if (singleValues.some((value) => value !== null)) {
      series.push({
        name: options.title || 'Series 1',
        values: singleValues.map((value) => value ?? 0),
        color: DEFAULT_COLORS[0],
      });
    }
  }
  if (series.length === 0) throw new Error('chart_source_has_no_numeric_series');

  if (chartType === 'scatter' || chartType === 'bubble') {
    const numericColumns = Array.from({ length: cols }, (_, c) => c).filter((c) => data.some((row) => numeric(row[c]) !== null));
    if (numericColumns.length < 2) throw new Error('scatter_requires_two_numeric_columns');
    const x = data.map((row) => numeric(row[numericColumns[0]]) ?? 0).slice(0, MAX_CHART_POINTS);
    const y = data.map((row) => numeric(row[numericColumns[1]]) ?? 0).slice(0, MAX_CHART_POINTS);
    series.splice(0, series.length, {
      name: hasHeader ? String(matrix[0]?.[numericColumns[1]] || 'Series 1') : 'Series 1',
      values: y,
      x_values: x,
      bubble_sizes: chartType === 'bubble' && numericColumns[2] !== undefined
        ? data.map((row) => Math.max(0, numeric(row[numericColumns[2]]) ?? 0)).slice(0, MAX_CHART_POINTS)
        : undefined,
      color: DEFAULT_COLORS[0],
    });
  }

  return normalizeGridChart({
    id: createGridSecureId('chart'),
    chart_type: chartType,
    title: (options.title || `Chart · ${range}`).slice(0, 512),
    categories,
    series,
    data_source_link: options.live === false ? undefined : sourceLink(options.documentId, options.tableObjectId, range),
    source: { kind: 'range', sheetId: options.sheetId, range, documentId: options.documentId, objectId: options.tableObjectId, uri: sourceLink(options.documentId, options.tableObjectId, range), live: options.live !== false, state: options.live === false ? 'frozen' : 'current', lastResolvedAt: Date.now() },
    source_state: options.live === false ? 'frozen' : 'current',
    legend_position: 'bottom',
    show_gridlines: true,
    style_preset: 'astraea-dark',
  });
}

export function buildGridChartFromTable(
  cells: Record<string, GridCell>,
  table: GridStructuredTable,
  chartType: ChartObject['chart_type'],
  options: Omit<GridChartSourceOptions, 'sheetId'> & { title?: string },
): ChartObject {
  const chart = buildGridChartFromRange(cells, table.range, chartType, { ...options, sheetId: table.sheetId, title: options.title || table.name });
  return normalizeGridChart({ ...chart, source: { kind: 'table', sheetId: table.sheetId, range: table.range, tableId: table.id, documentId: options.documentId, objectId: options.tableObjectId, uri: sourceLink(options.documentId, options.tableObjectId, table.range), live: options.live !== false, state: options.live === false ? 'frozen' : 'current', lastResolvedAt: Date.now() }, source_state: options.live === false ? 'frozen' : 'current' });
}

export function buildGridChartFromPivot(
  cells: Record<string, GridCell>,
  definition: GridPivotDefinition,
  sheetId: string,
  chartType: ChartObject['chart_type'] = 'column',
): ChartObject {
  const pivot = buildPivotTableModel(cells, definition);
  const rows = (pivot.rows.filter((row) => !row.isSubtotal).length ? pivot.rows.filter((row) => !row.isSubtotal) : pivot.rows).slice(0, MAX_CHART_POINTS);
  const series: ChartSeries[] = [];
  for (const columnKey of pivot.columnKeys) {
    for (let metricIndex = 0; metricIndex < pivot.valueFields.length && series.length < MAX_CHART_SERIES; metricIndex++) {
      const field = pivot.valueFields[metricIndex];
      const label = field.label || `${field.aggregation.toUpperCase()}(${field.column})`;
      series.push({
        name: pivot.columnKeys.length > 1 || columnKey !== '(values)' ? `${columnKey} · ${label}` : label,
        values: rows.map((row) => row.cells[columnKey]?.[metricIndex]?.value ?? 0),
        color: DEFAULT_COLORS[series.length % DEFAULT_COLORS.length],
      });
    }
  }
  if (!series.length) throw new Error('pivot_chart_has_no_series');
  return normalizeGridChart({
    id: createGridSecureId('pivot-chart'), chart_type: chartType, title: definition.name,
    categories: rows.map((row) => row.rowPath.join(' / ')).slice(0, MAX_CHART_POINTS),
    series,
    source: { kind:'pivot', sheetId, range:definition.sourceRange, pivotId:definition.id, live:true, state:'current', lastResolvedAt:Date.now() },
    source_state:'current',
    legend_position:'bottom', show_gridlines:true, style_preset:'astraea-dark',
  });
}

export function normalizeGridChart(chart: ChartObject): ChartObject {
  return normalizeCanonicalChart(chart);
}

export function createGridChartTemplate(chart: ChartObject, name: string): GridChartTemplate {
  if (!name.trim()) throw new Error('chart_template_name_required');
  return { id:createGridSecureId('chart-template'), name:name.trim().slice(0,128), chartType:chart.chart_type, stylePreset:chart.style_preset ?? 'astraea-dark', legendPosition:chart.legend_position ?? 'bottom', showGridlines:chart.show_gridlines !== false, showDataLabels:chart.show_data_labels === true, manualOverrides:chart.manual_overrides ? {...chart.manual_overrides} : undefined };
}

export function applyGridChartTemplate(chart: ChartObject, template: GridChartTemplate): ChartObject {
  return normalizeGridChart({ ...chart, chart_type:template.chartType, style_preset:template.stylePreset, legend_position:template.legendPosition, show_gridlines:template.showGridlines, show_data_labels:template.showDataLabels, manual_overrides:template.manualOverrides ? {...template.manualOverrides}:chart.manual_overrides, template_name:template.name });
}

function mergeRefreshedChart(previous: ChartObject, refreshed: ChartObject): ChartObject {
  return normalizeGridChart({
    ...refreshed,
    id: previous.id,
    title: previous.title,
    chart_type: previous.chart_type,
    x_axis_title: previous.x_axis_title,
    y_axis_title: previous.y_axis_title,
    secondary_y_axis_title: previous.secondary_y_axis_title,
    legend_position: previous.legend_position,
    show_data_labels: previous.show_data_labels,
    show_gridlines: previous.show_gridlines,
    trendlines: previous.trendlines,
    error_bars: previous.error_bars,
    style_preset: previous.style_preset,
    manual_overrides: previous.manual_overrides,
    template_name: previous.template_name,
    series: refreshed.series.map((item, index) => ({
      ...item,
      name: previous.series[index]?.name || item.name,
      color: previous.series[index]?.color || item.color,
      chart_type: previous.series[index]?.chart_type,
      secondary_axis: previous.series[index]?.secondary_axis,
    })),
  });
}

export function refreshLiveGridChartsInDocument<T extends { gridData?: import('../../../shared/contracts/workspace').GridDocumentModel; objects: Record<string, import('../../../shared/contracts/workspace').WorkspaceObject> }>(document: T): T {
  if (!document.gridData?.sheets?.length) return document;
  let changed = false;
  const objects = { ...document.objects };
  for (const [objectId, object] of Object.entries(document.objects)) {
    if (object.type !== 'Chart') continue;
    const chart = object.data;
    const source = chart.source;
    if (!source?.live) continue;
    const sheet = document.gridData.sheets.find((item) => item.id === source.sheetId);
    if (!sheet) continue;
    const tableObject = document.objects[sheet.tableObjectId];
    if (!tableObject || tableObject.type !== 'Table') continue;
    const cells = tableObject.data.cells;
    try {
      let refreshed: ChartObject | null = null;
      if (source.kind === 'range' && source.range) {
        refreshed = buildGridChartFromRange(cells, source.range, chart.chart_type, { sheetId:sheet.id, tableObjectId:sheet.tableObjectId, live:true, title:chart.title });
      } else if (source.kind === 'table' && source.tableId) {
        const table = sheet.tables?.find((item) => item.id === source.tableId);
        if (table) refreshed = buildGridChartFromTable(cells, table, chart.chart_type, { tableObjectId:sheet.tableObjectId, live:true, title:chart.title });
      } else if (source.kind === 'pivot' && source.pivotId) {
        const pivot = sheet.pivots?.find((item) => item.id === source.pivotId);
        if (pivot) refreshed = buildGridChartFromPivot(cells, pivot, sheet.id, chart.chart_type);
      }
      if (refreshed) {
        objects[objectId] = { type:'Chart', data:mergeRefreshedChart(chart, refreshed) };
        changed = true;
      }
    } catch {
      // Fail closed: preserve the previous chart snapshot and make staleness explicit.
      objects[objectId] = { type:'Chart', data:normalizeGridChart({ ...chart, source_state:'stale', source:source ? { ...source, state:'stale' } : undefined }) };
      changed = true;
    }
  }
  return changed ? { ...document, objects } : document;
}
