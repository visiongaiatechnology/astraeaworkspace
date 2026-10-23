// STATUS: DIAMANT VGT SUPREME — Shapes & Charts shared workspace model

export interface ShapeObject {
  id: string;
  shape_type: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'callout';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  stroke_width: number;
  text?: string;
}

export type ChartType =
  | 'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut'
  | 'scatter' | 'bubble' | 'histogram' | 'pareto' | 'box-whisker'
  | 'waterfall' | 'funnel' | 'radar' | 'stock' | 'surface' | 'combo'
  | 'treemap' | 'sunburst' | 'sparkline';

export type ChartTrendlineType = 'linear' | 'exponential' | 'moving-average';
export type ChartErrorBarType = 'fixed' | 'percentage' | 'standard-deviation';
export type ChartLegendPosition = 'none' | 'top' | 'right' | 'bottom' | 'left';
export type ChartStylePreset = 'astraea-dark' | 'astraea-light' | 'executive' | 'minimal' | 'high-contrast';

export type ChartAxisScale = 'category' | 'linear' | 'log' | 'time';
export type ChartAggregation = 'none' | 'sum' | 'average' | 'min' | 'max' | 'count';
export type ChartSourceState = 'current' | 'stale' | 'broken' | 'permission-lost' | 'frozen';
export type ChartSourceKind = 'inline' | 'range' | 'table' | 'pivot' | 'database' | 'insight';

export interface ChartAxisConfig {
  type: ChartAxisScale;
  min?: number;
  max?: number;
  major_unit?: number;
  number_format?: string;
  log_base?: 2 | 10;
}

export interface ChartAnnotation {
  id: string;
  text: string;
  category_index?: number;
  x?: number;
  y?: number;
  color?: string;
}

export interface ChartReferenceLine {
  axis: 'x' | 'y' | 'secondary-y';
  value: number;
  label?: string;
  color?: string;
}

export interface ChartPointStyleOverride {
  series_index: number;
  point_index?: number;
  fill?: string;
  stroke?: string;
  opacity?: number;
}

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
  chart_type?: ChartType;
  secondary_axis?: boolean;
  x_values?: number[];
  bubble_sizes?: number[];
  aggregation?: ChartAggregation;
  style_overrides?: ChartPointStyleOverride[];
}

export interface ChartTrendline {
  seriesIndex: number;
  type: ChartTrendlineType;
  period?: number;
  color?: string;
}

export interface ChartErrorBars {
  seriesIndex: number;
  type: ChartErrorBarType;
  value?: number;
}

export interface ChartObject {
  id: string;
  chart_type: ChartType;
  title: string;
  categories: string[];
  series: ChartSeries[];
  data_source_link?: string;
  source?: {
    kind: ChartSourceKind;
    sheetId?: string;
    range?: string;
    tableId?: string;
    pivotId?: string;
    documentId?: string;
    objectId?: string;
    uri?: string;
    sourceVersion?: number;
    resolvedVersion?: number;
    live: boolean;
    state?: ChartSourceState;
    lastResolvedAt?: number;
  };
  x_axis_title?: string;
  y_axis_title?: string;
  secondary_y_axis_title?: string;
  x_axis?: ChartAxisConfig;
  y_axis?: ChartAxisConfig;
  secondary_y_axis?: ChartAxisConfig;
  legend_position?: ChartLegendPosition;
  show_data_labels?: boolean;
  show_gridlines?: boolean;
  trendlines?: ChartTrendline[];
  error_bars?: ChartErrorBars[];
  style_preset?: ChartStylePreset;
  manual_overrides?: {
    background?: string;
    textColor?: string;
    gridColor?: string;
    axisColor?: string;
    fontFamily?: string;
  };
  template_name?: string;
  annotations?: ChartAnnotation[];
  reference_lines?: ChartReferenceLine[];
  alt_summary?: string;
  source_state?: ChartSourceState;
  selected_series?: number[];
  selected_points?: Array<{ seriesIndex: number; pointIndex: number }>;
  drill_action?: { kind: 'insight-filter' | 'insight-drill' | 'workspace-open'; target?: string };
  animation?: { enabled: boolean; duration_ms: number; easing: 'linear' | 'ease-out' };
  render_mode?: '2d';
}


export interface GridChartTemplate {
  id: string;
  name: string;
  chartType: ChartType;
  stylePreset: ChartStylePreset;
  legendPosition: ChartLegendPosition;
  showGridlines: boolean;
  showDataLabels: boolean;
  manualOverrides?: ChartObject['manual_overrides'];
}
