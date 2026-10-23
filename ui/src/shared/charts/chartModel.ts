// STATUS: DIAMANT VGT SUPREME
// Shared canonical chart model and untrusted boundary used by Grid/Writer/Present/Insight.

import type {
  ChartAnnotation,
  ChartAxisConfig,
  ChartObject,
  ChartPointStyleOverride,
  ChartReferenceLine,
  ChartSeries,
  ChartSourceState,
  ChartType,
} from '../contracts/workspace';

export const CHART_MODEL_VERSION = 2 as const;
export const CHART_MAX_POINTS = 2_048;
export const CHART_MAX_SERIES = 64;
export const CHART_MAX_CATEGORIES = 2_048;
export const CHART_MAX_ANNOTATIONS = 256;
export const CHART_MAX_REFERENCE_LINES = 64;
export const CHART_MAX_STYLE_OVERRIDES = 4_096;
export const CHART_MAX_JSON_BYTES = 2 * 1024 * 1024;
export const CHART_MAX_NESTING = 32;

const DEFAULT_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#ef4444','#84cc16'];
const CHART_TYPES: ReadonlySet<ChartType> = new Set([
  'column','bar','line','area','pie','donut','scatter','bubble','histogram','pareto','box-whisker',
  'waterfall','funnel','radar','stock','surface','combo','treemap','sunburst','sparkline',
]);
const SOURCE_STATES: ReadonlySet<ChartSourceState> = new Set(['current','stale','broken','permission-lost','frozen']);
/**
 * Die Zustände, die die Nutzdaten **zurückhalten**: von einem solchen Diagramm darf **nichts**
 * gezeichnet und **nichts** vorgelesen werden.
 *
 * Das ist eine **Auswahl** aus `SOURCE_STATES` — bewusst **keine** zweite Vokabel. Die Schranke unter
 * der Klasse beweist die Teilmengen-Beziehung bei jedem Laden, statt sie zu behaupten: eine vierte
 * Zustandsliste könnte so gar nicht erst entstehen.
 */
const WITHHOLDING_SOURCE_STATES: ReadonlySet<ChartSourceState> = new Set(['permission-lost','broken']);

export class ChartModelError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'ChartModelError'; this.code = code; }
}

if (![...WITHHOLDING_SOURCE_STATES].every((state) => SOURCE_STATES.has(state))) {
  throw new ChartModelError('chart_source_vocabulary_drift');
}

/** Ob dieser Zustand die Nutzdaten zurückhält — die eine Frage, an **einer** Stelle beantwortet. */
export function chartSourceWithholdsData(state: ChartSourceState | undefined): boolean {
  return state !== undefined && WITHHOLDING_SOURCE_STATES.has(state);
}

function boundedText(value: unknown, max: number, fallback = ''): string {
  const text = typeof value === 'string' ? value : fallback;
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}
function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function boundedOptionalFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function color(value: unknown, fallback?: string): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
function checkDepth(value: unknown, depth = 0, signal?:AbortSignal, counter:{nodes:number}={nodes:0}): void {
  if (signal?.aborted) throw new ChartModelError('chart_input_cancelled');
  if (depth > CHART_MAX_NESTING) throw new ChartModelError('chart_nesting_limit');
  counter.nodes+=1; if(counter.nodes>200_000)throw new ChartModelError('chart_node_limit');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const item of value) checkDepth(item, depth + 1, signal, counter); return; }
  for (const item of Object.values(value as Record<string, unknown>)) checkDepth(item, depth + 1, signal, counter);
}

function normalizeAxis(input: ChartAxisConfig | undefined, fallback: ChartAxisConfig['type']): ChartAxisConfig {
  const type = input?.type === 'linear' || input?.type === 'log' || input?.type === 'time' || input?.type === 'category' ? input.type : fallback;
  const min = boundedOptionalFinite(input?.min);
  const max = boundedOptionalFinite(input?.max);
  if (min !== undefined && max !== undefined && min >= max) throw new ChartModelError('chart_axis_bounds_invalid');
  if (type === 'log' && min !== undefined && min <= 0) throw new ChartModelError('chart_log_axis_nonpositive_min');
  return {
    type,
    min,
    max,
    major_unit: input?.major_unit !== undefined ? Math.max(1e-12, Math.min(1e12, Math.abs(finite(input.major_unit, 1)))) : undefined,
    number_format: input?.number_format ? boundedText(input.number_format, 64) : undefined,
    log_base: input?.log_base === 2 ? 2 : input?.log_base === 10 ? 10 : undefined,
  };
}

function normalizePointOverride(input: ChartPointStyleOverride): ChartPointStyleOverride | null {
  if (!Number.isInteger(input.series_index) || input.series_index < 0 || input.series_index >= CHART_MAX_SERIES) return null;
  if (input.point_index !== undefined && (!Number.isInteger(input.point_index) || input.point_index < 0 || input.point_index >= CHART_MAX_POINTS)) return null;
  const opacity = input.opacity === undefined ? undefined : Math.max(0, Math.min(1, finite(input.opacity, 1)));
  return { series_index:input.series_index, point_index:input.point_index, fill:color(input.fill), stroke:color(input.stroke), opacity };
}

function normalizeSeries(item: ChartSeries, index: number): ChartSeries {
  const values = Array.isArray(item.values) ? item.values.slice(0, CHART_MAX_POINTS).map((value) => finite(value)) : [];
  const xValues = Array.isArray(item.x_values) ? item.x_values.slice(0, values.length).map((value) => finite(value)) : undefined;
  const bubbles = Array.isArray(item.bubble_sizes) ? item.bubble_sizes.slice(0, values.length).map((value) => Math.max(0, finite(value))) : undefined;
  const chartType = item.chart_type && CHART_TYPES.has(item.chart_type) ? item.chart_type : undefined;
  const aggregation = item.aggregation === 'sum' || item.aggregation === 'average' || item.aggregation === 'min' || item.aggregation === 'max' || item.aggregation === 'count' ? item.aggregation : 'none';
  return {
    name: boundedText(item.name, 256, `Series ${index + 1}`) || `Series ${index + 1}`,
    values,
    x_values:xValues,
    bubble_sizes:bubbles,
    color:color(item.color, DEFAULT_COLORS[index % DEFAULT_COLORS.length]),
    chart_type:chartType,
    secondary_axis:Boolean(item.secondary_axis) || undefined,
    aggregation,
    style_overrides:(item.style_overrides ?? []).slice(0, CHART_MAX_STYLE_OVERRIDES).map(normalizePointOverride).filter((value): value is ChartPointStyleOverride => value !== null),
  };
}

function normalizeAnnotation(item: ChartAnnotation, index: number): ChartAnnotation {
  return {
    id:boundedText(item.id, 128, `annotation-${index + 1}`) || `annotation-${index + 1}`,
    text:boundedText(item.text, 512),
    category_index:item.category_index !== undefined ? Math.max(0, Math.min(CHART_MAX_POINTS - 1, Math.floor(finite(item.category_index)))) : undefined,
    x:boundedOptionalFinite(item.x),
    y:boundedOptionalFinite(item.y),
    color:color(item.color),
  };
}

function normalizeReferenceLine(item: ChartReferenceLine): ChartReferenceLine | null {
  if (item.axis !== 'x' && item.axis !== 'y' && item.axis !== 'secondary-y') return null;
  if (!Number.isFinite(item.value)) return null;
  return { axis:item.axis, value:item.value, label:item.label ? boundedText(item.label, 256) : undefined, color:color(item.color) };
}

function normalizeSource(input: ChartObject['source']): ChartObject['source'] {
  if (!input) return undefined;
  const allowedKind = input.kind === 'inline' || input.kind === 'range' || input.kind === 'table' || input.kind === 'pivot' || input.kind === 'database' || input.kind === 'insight';
  if (!allowedKind) throw new ChartModelError('chart_source_kind_invalid');
  const state = input.state && SOURCE_STATES.has(input.state) ? input.state : input.live ? 'current' : 'frozen';
  return {
    kind:input.kind,
    sheetId:input.sheetId ? boundedText(input.sheetId, 256) : undefined,
    range:input.range ? boundedText(input.range, 256) : undefined,
    tableId:input.tableId ? boundedText(input.tableId, 256) : undefined,
    pivotId:input.pivotId ? boundedText(input.pivotId, 256) : undefined,
    documentId:input.documentId ? boundedText(input.documentId, 256) : undefined,
    objectId:input.objectId ? boundedText(input.objectId, 256) : undefined,
    uri:input.uri && /^vgt:\/\/workspace\//.test(input.uri) ? boundedText(input.uri, 1024) : undefined,
    sourceVersion:input.sourceVersion !== undefined ? Math.max(0, Math.floor(finite(input.sourceVersion))) : undefined,
    resolvedVersion:input.resolvedVersion !== undefined ? Math.max(0, Math.floor(finite(input.resolvedVersion))) : undefined,
    live:Boolean(input.live),
    state,
    lastResolvedAt:input.lastResolvedAt !== undefined ? Math.max(0, Math.floor(finite(input.lastResolvedAt))) : undefined,
  };
}

export function normalizeCanonicalChart(chart: ChartObject): ChartObject {
  if (!chart || typeof chart !== 'object') throw new ChartModelError('chart_object_invalid');
  if (!CHART_TYPES.has(chart.chart_type)) throw new ChartModelError('chart_type_invalid');
  const series = Array.isArray(chart.series) ? chart.series.slice(0, CHART_MAX_SERIES).map(normalizeSeries) : [];
  const source = normalizeSource(chart.source);
  const sourceState = chart.source_state && SOURCE_STATES.has(chart.source_state) ? chart.source_state : source?.state ?? (source?.live ? 'current' : 'frozen');
  return {
    id:boundedText(chart.id, 256, 'chart') || 'chart',
    chart_type:chart.chart_type,
    title:boundedText(chart.title, 512, 'Chart') || 'Chart',
    categories:Array.isArray(chart.categories) ? chart.categories.slice(0, CHART_MAX_CATEGORIES).map((item) => boundedText(item, 256)) : [],
    series,
    data_source_link:chart.data_source_link && /^vgt:\/\/workspace\//.test(chart.data_source_link) ? boundedText(chart.data_source_link, 1024) : undefined,
    source,
    source_state:sourceState,
    x_axis_title:chart.x_axis_title ? boundedText(chart.x_axis_title, 256) : undefined,
    y_axis_title:chart.y_axis_title ? boundedText(chart.y_axis_title, 256) : undefined,
    secondary_y_axis_title:chart.secondary_y_axis_title ? boundedText(chart.secondary_y_axis_title, 256) : undefined,
    x_axis:normalizeAxis(chart.x_axis, chart.chart_type === 'scatter' || chart.chart_type === 'bubble' ? 'linear' : 'category'),
    y_axis:normalizeAxis(chart.y_axis, 'linear'),
    secondary_y_axis:normalizeAxis(chart.secondary_y_axis, 'linear'),
    legend_position:chart.legend_position === 'none' || chart.legend_position === 'top' || chart.legend_position === 'right' || chart.legend_position === 'left' ? chart.legend_position : 'bottom',
    show_data_labels:Boolean(chart.show_data_labels),
    show_gridlines:chart.show_gridlines !== false,
    trendlines:(chart.trendlines ?? []).filter((item) => Number.isInteger(item.seriesIndex) && item.seriesIndex >= 0 && item.seriesIndex < series.length).slice(0, CHART_MAX_SERIES).map((item) => ({ seriesIndex:item.seriesIndex, type:item.type, period:item.period === undefined ? undefined : Math.max(2, Math.min(128, Math.floor(finite(item.period, 3)))), color:color(item.color) })),
    error_bars:(chart.error_bars ?? []).filter((item) => Number.isInteger(item.seriesIndex) && item.seriesIndex >= 0 && item.seriesIndex < series.length).slice(0, CHART_MAX_SERIES).map((item) => ({ seriesIndex:item.seriesIndex, type:item.type, value:item.value === undefined ? undefined : Math.max(0, finite(item.value)) })),
    style_preset:chart.style_preset ?? 'astraea-dark',
    manual_overrides:chart.manual_overrides ? {
      background:color(chart.manual_overrides.background), textColor:color(chart.manual_overrides.textColor), gridColor:color(chart.manual_overrides.gridColor), axisColor:color(chart.manual_overrides.axisColor), fontFamily:chart.manual_overrides.fontFamily ? boundedText(chart.manual_overrides.fontFamily, 128) : undefined,
    } : undefined,
    template_name:chart.template_name ? boundedText(chart.template_name, 128) : undefined,
    annotations:(chart.annotations ?? []).slice(0, CHART_MAX_ANNOTATIONS).map(normalizeAnnotation),
    reference_lines:(chart.reference_lines ?? []).slice(0, CHART_MAX_REFERENCE_LINES).map(normalizeReferenceLine).filter((value): value is ChartReferenceLine => value !== null),
    alt_summary:boundedText(chart.alt_summary, 2_048, buildChartAltSummary({ ...chart, series, source_state:sourceState } as ChartObject)),
    selected_series:(chart.selected_series ?? []).filter((value) => Number.isInteger(value) && value >= 0 && value < series.length).slice(0, CHART_MAX_SERIES),
    selected_points:(chart.selected_points ?? []).filter((value) => Number.isInteger(value.seriesIndex) && Number.isInteger(value.pointIndex) && value.seriesIndex >= 0 && value.seriesIndex < series.length && value.pointIndex >= 0 && value.pointIndex < CHART_MAX_POINTS).slice(0, CHART_MAX_STYLE_OVERRIDES),
    drill_action:chart.drill_action && (chart.drill_action.kind === 'insight-filter' || chart.drill_action.kind === 'insight-drill' || chart.drill_action.kind === 'workspace-open') ? { kind:chart.drill_action.kind, target:chart.drill_action.target ? boundedText(chart.drill_action.target, 1024) : undefined } : undefined,
    animation:{ enabled:Boolean(chart.animation?.enabled), duration_ms:Math.max(0, Math.min(5_000, Math.floor(finite(chart.animation?.duration_ms, 300)))), easing:chart.animation?.easing === 'linear' ? 'linear' : 'ease-out' },
    render_mode:'2d',
  };
}


function assertRawChartBounds(value:unknown):void {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ChartModelError('chart_object_invalid');
  const record=value as Record<string,unknown>;
  if(record.categories!==undefined&&!Array.isArray(record.categories))throw new ChartModelError('chart_categories_invalid');
  if(record.series!==undefined&&!Array.isArray(record.series))throw new ChartModelError('chart_series_invalid');
  for(const [field,code] of [
    ['trendlines','chart_trendlines_invalid'],
    ['error_bars','chart_error_bars_invalid'],
    ['annotations','chart_annotations_invalid'],
    ['reference_lines','chart_reference_lines_invalid'],
    ['selected_points','chart_selected_points_invalid'],
  ] as const){
    const items=record[field];
    if(items!==undefined&&(!Array.isArray(items)||items.some((item)=>!item||typeof item!=='object'||Array.isArray(item))))throw new ChartModelError(code);
  }
  if(record.selected_series!==undefined&&!Array.isArray(record.selected_series))throw new ChartModelError('chart_selected_series_invalid');
  if(Array.isArray(record.categories)&&record.categories.length>CHART_MAX_CATEGORIES)throw new ChartModelError('chart_category_limit');
  if(Array.isArray(record.series)){
    if(record.series.length>CHART_MAX_SERIES)throw new ChartModelError('chart_series_limit');
    for(const raw of record.series){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ChartModelError('chart_series_invalid');const series=raw as Record<string,unknown>;if(Array.isArray(series.values)&&series.values.length>CHART_MAX_POINTS)throw new ChartModelError('chart_point_limit');if(Array.isArray(series.x_values)&&series.x_values.length>CHART_MAX_POINTS)throw new ChartModelError('chart_point_limit');if(Array.isArray(series.bubble_sizes)&&series.bubble_sizes.length>CHART_MAX_POINTS)throw new ChartModelError('chart_point_limit');if(series.style_overrides!==undefined&&(!Array.isArray(series.style_overrides)||series.style_overrides.some((item)=>!item||typeof item!=='object'||Array.isArray(item))))throw new ChartModelError('chart_style_overrides_invalid');if(Array.isArray(series.style_overrides)&&series.style_overrides.length>CHART_MAX_STYLE_OVERRIDES)throw new ChartModelError('chart_style_override_limit');}
  }
  if(Array.isArray(record.annotations)&&record.annotations.length>CHART_MAX_ANNOTATIONS)throw new ChartModelError('chart_annotation_limit');
  if(Array.isArray(record.reference_lines)&&record.reference_lines.length>CHART_MAX_REFERENCE_LINES)throw new ChartModelError('chart_reference_line_limit');
}

export function parseUntrustedChartJson(text: string, signal?:AbortSignal): ChartObject {
  if (signal?.aborted) throw new ChartModelError('chart_input_cancelled');
  if (typeof text !== 'string') throw new ChartModelError('chart_json_type_invalid');
  const bytes = new TextEncoder().encode(text).length;
  if (bytes <= 1 || bytes > CHART_MAX_JSON_BYTES) throw new ChartModelError('chart_json_size_limit');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new ChartModelError('chart_json_malformed'); }
  checkDepth(parsed,0,signal);
  assertRawChartBounds(parsed);
  if(signal?.aborted)throw new ChartModelError('chart_input_cancelled');
  return normalizeCanonicalChart(parsed as ChartObject);
}

export function setChartSourceState(chart: ChartObject, state: ChartSourceState, resolvedVersion?: number): ChartObject {
  const normalized = normalizeCanonicalChart(chart);
  return normalizeCanonicalChart({
    ...normalized,
    source_state:state,
    source:normalized.source ? { ...normalized.source, state, resolvedVersion, lastResolvedAt:state === 'current' ? Date.now() : normalized.source.lastResolvedAt } : undefined,
  });
}

export function buildChartAltSummary(chart: ChartObject): string {
  const type = boundedText(chart.chart_type, 64, 'chart');
  const title = boundedText(chart.title, 256, 'Chart');
  const series = Array.isArray(chart.series) ? chart.series.slice(0, 8) : [];
  const details = series.map((item) => {
    const values = (item.values ?? []).filter(Number.isFinite);
    if (!values.length) return `${boundedText(item.name, 64, 'Series')}: no numeric values`;
    const min = Math.min(...values), max = Math.max(...values), last = values[values.length - 1];
    return `${boundedText(item.name, 64, 'Series')}: ${values.length} points, min ${min}, max ${max}, last ${last}`;
  }).join('; ');
  return `${title}. ${type} chart with ${series.length} series${details ? `. ${details}` : ''}.`.slice(0, 2_048);
}

export interface ChartAccessibleRow { category: string; values: Array<{ series: string; value: number }> }
export function buildChartAccessibleTable(chart: ChartObject): ChartAccessibleRow[] {
  const normalized = normalizeCanonicalChart(chart);
  const count = Math.min(CHART_MAX_POINTS, Math.max(normalized.categories.length, ...normalized.series.map((series) => series.values.length), 0));
  return Array.from({ length:count }, (_, index) => ({
    category:normalized.categories[index] ?? String(index + 1),
    values:normalized.series.map((series) => ({ series:series.name, value:finite(series.values[index]) })),
  }));
}

export function chartSemanticDigestInput(chart: ChartObject): string {
  const normalized = normalizeCanonicalChart(chart);
  return JSON.stringify({
    modelVersion:CHART_MODEL_VERSION,
    id:normalized.id,
    chart_type:normalized.chart_type,
    title:normalized.title,
    categories:normalized.categories,
    series:normalized.series,
    source:normalized.source ?? null,
    sourceState:normalized.source_state,
    axes:[normalized.x_axis_title ?? null, normalized.y_axis_title ?? null, normalized.secondary_y_axis_title ?? null, normalized.x_axis, normalized.y_axis, normalized.secondary_y_axis],
    annotations:normalized.annotations,
    references:normalized.reference_lines,
    theme:[normalized.style_preset, normalized.manual_overrides],
  });
}

export interface ChartInputEvidence {
  authenticity:'verified'|'failed'|'unknown';
  integrity:'verified'|'failed'|'unknown';
  policy:'allowed'|'denied';
}

export function materializeVerifiedChartJson(text:string,evidence:ChartInputEvidence,signal?:AbortSignal):ChartObject{
  if(evidence.authenticity!=='verified')throw new ChartModelError('chart_authenticity_unverified');
  if(evidence.integrity!=='verified')throw new ChartModelError('chart_integrity_unverified');
  if(evidence.policy!=='allowed')throw new ChartModelError('chart_policy_denied');
  return parseUntrustedChartJson(text,signal);
}
