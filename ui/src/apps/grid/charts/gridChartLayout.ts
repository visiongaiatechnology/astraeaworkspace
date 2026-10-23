// STATUS: DIAMANT VGT SUPREME
// Pure, non-throwing chart-layout decision layer for the Grid chart assistant.
//
// Why this module exists (Grid Paket 37/38, AST-0422/0427/0429):
// `GridChartModal` used to call `normalizeCanonicalChart` directly inside a `useMemo`. The canonical
// model throws `ChartModelError` for an invalid chart type, for `y_axis.min >= y_axis.max` and for a
// non-positive log minimum. Thrown during render that unmounts the whole subtree, so a mistyped axis
// bound in the assistant destroyed the Grid surface instead of showing a message. Every decision now
// returns a discriminated result and the caller renders `error`.

import type {
  ChartAggregation,
  ChartAxisScale,
  ChartErrorBarType,
  ChartObject,
  ChartStylePreset,
  ChartTrendlineType,
  ChartType,
} from '../../../shared/contracts/workspace';
import { normalizeCanonicalChart } from '../../../shared/charts/chartModel';

/** Single source of truth for the chart types the assistant offers. */
export const GRID_CHART_TYPES: readonly ChartType[] = Object.freeze([
  'column','bar','line','area','pie','donut','scatter','bubble','histogram','pareto','box-whisker',
  'waterfall','funnel','radar','stock','surface','combo','treemap','sunburst','sparkline',
]);

export const GRID_CHART_SERIES_TYPES: readonly ChartType[] = Object.freeze(['column','bar','line','area','scatter','bubble']);
export const GRID_CHART_LEGEND_POSITIONS = Object.freeze(['none','top','right','bottom','left'] as const);
export const GRID_CHART_STYLE_PRESETS = Object.freeze(['astraea-dark','astraea-light','executive','minimal','high-contrast'] as const);
export const GRID_CHART_TRENDLINES = Object.freeze(['none','linear','exponential','moving-average'] as const);
export const GRID_CHART_ERROR_BARS = Object.freeze(['none','fixed','percentage','standard-deviation'] as const);
export const GRID_CHART_MAX_NUMBER_FORMAT_CHARS = 64;
export const GRID_CHART_MAX_ANNOTATION_CHARS = 512;

export interface GridChartLayoutControls {
  title: string;
  chartType: ChartType;
  stylePreset: ChartStylePreset;
  legend: NonNullable<ChartObject['legend_position']>;
  showDataLabels: boolean;
  showGridlines: boolean;
  xAxisTitle: string;
  yAxisTitle: string;
  secondaryAxisTitle: string;
  xAxisScale: ChartAxisScale;
  yAxisScale: ChartAxisScale;
  yMin: string;
  yMax: string;
  yMajorUnit: string;
  yNumberFormat: string;
  annotationText: string;
  referenceLineValue: string;
  firstPointColor: string;
  trendline: ChartTrendlineType | 'none';
  errorBar: ChartErrorBarType | 'none';
  seriesOrder: number[];
  seriesTypes: Record<number, ChartType | undefined>;
  secondarySeries: Record<number, boolean | undefined>;
  seriesAggregation: Record<number, ChartAggregation | undefined>;
}

export type GridChartLayoutResult =
  | { ok: true; chart: ChartObject }
  | { ok: false; error: string };

/** Parses an optional numeric input field. Empty means "not set"; anything else must be finite. */
function optionalNumber(raw: string, label: string, min: number, max: number): { ok: true; value?: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: `${label} muss eine Zahl sein.` };
  if (value < min || value > max) return { ok: false, error: `${label} muss zwischen ${min} und ${max} liegen.` };
  return { ok: true, value };
}

export function buildGridChartLayout(
  baseChart: ChartObject,
  controls: GridChartLayoutControls,
): GridChartLayoutResult {
  try {
    if (!(GRID_CHART_TYPES as readonly string[]).includes(controls.chartType)) {
      return { ok: false, error: `Unbekannter Diagrammtyp "${String(controls.chartType)}".` };
    }
    if (!(GRID_CHART_LEGEND_POSITIONS as readonly string[]).includes(controls.legend)) {
      return { ok: false, error: 'Ungültige Legendenposition.' };
    }
    if (!(GRID_CHART_STYLE_PRESETS as readonly string[]).includes(controls.stylePreset)) {
      return { ok: false, error: 'Unbekanntes Diagramm-Design.' };
    }
    if (controls.yNumberFormat.length > GRID_CHART_MAX_NUMBER_FORMAT_CHARS) {
      return { ok: false, error: `Zahlenformat darf höchstens ${GRID_CHART_MAX_NUMBER_FORMAT_CHARS} Zeichen haben.` };
    }
    if (controls.annotationText.length > GRID_CHART_MAX_ANNOTATION_CHARS) {
      return { ok: false, error: `Beschriftung darf höchstens ${GRID_CHART_MAX_ANNOTATION_CHARS} Zeichen haben.` };
    }

    const yMin = optionalNumber(controls.yMin, 'Y-Minimum', -1e12, 1e12);
    if (!yMin.ok) return yMin;
    const yMax = optionalNumber(controls.yMax, 'Y-Maximum', -1e12, 1e12);
    if (!yMax.ok) return yMax;
    const majorUnit = optionalNumber(controls.yMajorUnit, 'Hauptschrittweite', 1e-12, 1e12);
    if (!majorUnit.ok) return majorUnit;
    if (yMin.value !== undefined && yMax.value !== undefined && yMin.value >= yMax.value) {
      return { ok: false, error: 'Y-Minimum muss kleiner als das Y-Maximum sein.' };
    }
    if (controls.yAxisScale === 'log' && yMin.value !== undefined && yMin.value <= 0) {
      return { ok: false, error: 'Eine logarithmische Y-Achse benötigt ein Minimum größer 0.' };
    }
    const referenceValue = optionalNumber(controls.referenceLineValue, 'Referenzlinie', -1e12, 1e12);
    if (!referenceValue.ok) return referenceValue;
    if (!/^#[0-9a-f]{6}$/iu.test(controls.firstPointColor)) {
      return { ok: false, error: 'Die Farbe für den ersten Punkt ist ungültig.' };
    }
    if (controls.trendline !== 'none' && !(GRID_CHART_TRENDLINES as readonly string[]).includes(controls.trendline)) {
      return { ok: false, error: 'Unbekannter Trendlinientyp.' };
    }
    if (controls.errorBar !== 'none' && !(GRID_CHART_ERROR_BARS as readonly string[]).includes(controls.errorBar)) {
      return { ok: false, error: 'Unbekannter Fehlerbalkentyp.' };
    }

    const series = (() => {
      const count = baseChart.series.length;
      const seen = new Set<number>();
      const ordered: number[] = [];
      for (const value of controls.seriesOrder) {
        if (!Number.isInteger(value) || value < 0 || value >= count || seen.has(value)) continue;
        seen.add(value);
        ordered.push(value);
      }
      for (let index = 0; index < count; index++) if (!seen.has(index)) ordered.push(index);
      return ordered.map((sourceIndex, displayIndex) => {
        const item = baseChart.series[sourceIndex]!;
        const seriesType = controls.seriesTypes[displayIndex];
        return {
          ...item,
          chart_type: seriesType && (GRID_CHART_SERIES_TYPES as readonly string[]).includes(seriesType) ? seriesType : undefined,
          secondary_axis: controls.secondarySeries[displayIndex] || undefined,
          aggregation: controls.seriesAggregation[displayIndex] ?? 'none',
          style_overrides: displayIndex === 0
            ? [{ series_index: 0, point_index: 0, fill: controls.firstPointColor }, ...(item.style_overrides ?? []).filter((override) => override.point_index !== 0)]
            : item.style_overrides,
        };
      });
    })();

    const chart = normalizeCanonicalChart({
      ...baseChart,
      title: controls.title,
      chart_type: controls.chartType,
      style_preset: controls.stylePreset,
      legend_position: controls.legend,
      show_data_labels: controls.showDataLabels,
      show_gridlines: controls.showGridlines,
      x_axis_title: controls.xAxisTitle || undefined,
      y_axis_title: controls.yAxisTitle || undefined,
      secondary_y_axis_title: controls.secondaryAxisTitle || undefined,
      x_axis: { type: controls.xAxisScale },
      y_axis: {
        type: controls.yAxisScale,
        min: yMin.value,
        max: yMax.value,
        major_unit: majorUnit.value,
        number_format: controls.yNumberFormat.trim() || undefined,
        log_base: controls.yAxisScale === 'log' ? 10 : undefined,
      },
      secondary_y_axis: { type: 'linear' },
      series,
      trendlines: controls.trendline === 'none' || !series.length ? [] : [{ seriesIndex: 0, type: controls.trendline, period: controls.trendline === 'moving-average' ? 3 : undefined }],
      error_bars: controls.errorBar === 'none' || !series.length ? [] : [{ seriesIndex: 0, type: controls.errorBar, value: controls.errorBar === 'percentage' ? 5 : controls.errorBar === 'fixed' ? 1 : undefined }],
      annotations: controls.annotationText.trim() ? [{ id: 'author-annotation', text: controls.annotationText.trim(), category_index: 0 }] : [],
      reference_lines: referenceValue.value !== undefined ? [{ axis: 'y', value: referenceValue.value, label: 'Reference' }] : [],
      alt_summary: `${controls.title}. ${controls.chartType} chart with ${series.length} series.`,
      animation: { enabled: true, duration_ms: 300, easing: 'ease-out' },
      render_mode: '2d',
    });
    return { ok: true, chart };
  } catch (reason) {
    // The canonical model is the last line of defence; its rejection becomes a visible message.
    return { ok: false, error: reason instanceof Error ? `Diagramm abgelehnt: ${reason.message}` : 'Diagramm konnte nicht erstellt werden.' };
  }
}
