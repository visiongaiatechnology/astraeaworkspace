// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded Pivot live-preview / drill-down / chart view model.
//
// The preview is a bounded projection of the canonical pivot model: it caps the
// rendered rows, columns and cells, reports exactly what was cut, and keeps a
// deterministic, hand-checkable order so the same configuration always yields
// the same preview and the same drill-down source rows.

import type { GridCell, GridPivotDefinition } from '../../../shared/contracts/grid/workspaceGrid';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';
import { buildPivotTableModel, type GridPivotMaterializedRow, type GridPivotMetricValue, type GridPivotTableModel } from './gridPivotModel';
import { drillDownPivotSourceRecords } from './gridPivotAdvanced';

/** Bound on preview rows rendered into the DOM. */
export const MAX_PIVOT_PREVIEW_ROWS = 100;
/** Bound on preview columns (value columns) rendered into the DOM. */
export const MAX_PIVOT_PREVIEW_COLUMNS = 12;
/** Bound on preview metrics per value column. */
export const MAX_PIVOT_PREVIEW_METRICS = 8;
/** Bound on drill-down records returned to the panel. */
export const MAX_PIVOT_DRILLDOWN_RECORDS = 500;
/** Bound on columns inspected for the drill-down header. */
export const MAX_PIVOT_DRILLDOWN_COLUMNS = 64;
/** Bound on chart categories/series rendered by the pivot chart. */
export const MAX_PIVOT_CHART_CATEGORIES = 24;
export const MAX_PIVOT_CHART_SERIES = 6;

export interface PivotPreviewCell {
  readonly columnKey: string;
  readonly metrics: readonly GridPivotMetricValue[];
  readonly text: string;
}

export interface PivotPreviewRow {
  readonly key: string;
  readonly label: string;
  readonly depth: number;
  readonly isSubtotal: boolean;
  readonly collapsed: boolean;
  readonly sourceRowCount: number;
  /** Exact worksheet row indices of this group, ascending. Drives the drill-down. */
  readonly sourceRecordRowIndices: readonly number[];
  readonly cells: readonly PivotPreviewCell[];
}

export type PivotPreviewErrorCode =
  | 'pivot_preview_invalid_source_range'
  | 'pivot_preview_source_limit'
  | 'pivot_preview_group_limit'
  | 'pivot_preview_requires_rows_and_values'
  | 'pivot_preview_field_outside_source'
  | 'pivot_preview_engine_failure';

export type PivotPreviewState = 'empty' | 'partial' | 'ready' | 'error';

export interface PivotPreview {
  readonly state: PivotPreviewState;
  readonly rows: readonly PivotPreviewRow[];
  readonly columnKeys: readonly string[];
  readonly valueLabels: readonly string[];
  /** Number of metrics per value cell before the preview cap. */
  readonly metricCount: number;
  readonly grandTotals: readonly PivotPreviewCell[];
  readonly totalRowCount: number;
  readonly totalColumnCount: number;
  readonly sourceRecordCount: number;
  readonly rowsTruncated: boolean;
  readonly columnsTruncated: boolean;
  readonly metricsTruncated: boolean;
  /** Concrete, non-colour explanation of the current state. */
  readonly message: string;
  readonly errorCode?: PivotPreviewErrorCode;
  readonly errorDetail?: string;
}

function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return ' - ';
  const rounded = Math.round(value * 1e6) / 1e6;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString('de-DE')
    : rounded.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ENGINE_ERROR_CODES: Readonly<Record<string, PivotPreviewErrorCode>> = {
  pivot_invalid_source_range: 'pivot_preview_invalid_source_range',
  pivot_source_limit: 'pivot_preview_source_limit',
  pivot_group_limit: 'pivot_preview_group_limit',
  pivot_requires_rows_and_values: 'pivot_preview_requires_rows_and_values',
};

function classifyEngineError(error: unknown): { code: PivotPreviewErrorCode; detail: string } {
  const raw = error instanceof Error ? error.message : String(error);
  for (const [needle, code] of Object.entries(ENGINE_ERROR_CODES)) {
    if (raw.includes(needle)) return { code, detail: code };
  }
  if (raw.startsWith('pivot_field_outside_source')) {
    return { code: 'pivot_preview_field_outside_source', detail: raw.slice(0, 128) };
  }
  // Never surface raw engine text: it can contain internal range details.
  return { code: 'pivot_preview_engine_failure', detail: 'Pivot-Engine hat die Konfiguration abgelehnt.' };
}

function previewMessage(code: PivotPreviewErrorCode): string {
  switch (code) {
    case 'pivot_preview_invalid_source_range':
      return 'Der Quellbereich ist keine gueltige A1-Referenz (Beispiel: A1:D50).';
    case 'pivot_preview_source_limit':
      return 'Der Quellbereich ist zu gross fuer die Live-Vorschau. Bitte den Bereich verkleinern.';
    case 'pivot_preview_group_limit':
      return 'Zu viele unterschiedliche Gruppen. Bitte ein Feld aus Zeilen oder Spalten entfernen.';
    case 'pivot_preview_requires_rows_and_values':
      return 'Fuer die Vorschau werden mindestens ein Zeilenfeld und ein Wert benoetigt.';
    case 'pivot_preview_field_outside_source':
      return 'Ein gewaehltes Feld liegt ausserhalb des Quellbereichs.';
    default:
      return 'Die Vorschau konnte nicht berechnet werden. Die Konfiguration bleibt unveraendert.';
  }
}

function buildPreview(options: {
  model: GridPivotTableModel;
  maxRows: number;
  maxColumns: number;
  maxMetrics: number;
}): PivotPreview {
  const { model, maxRows, maxColumns, maxMetrics } = options;
  const columnKeys = model.columnKeys.slice(0, maxColumns);
  const rowsTruncated = model.rows.length > maxRows;
  const columnsTruncated = model.columnKeys.length > maxColumns;
  const metricsTruncated = model.valueFields.length > maxMetrics;

  const toCells = (source: Record<string, GridPivotMetricValue[]>): PivotPreviewCell[] => columnKeys.map((columnKey) => {
    const metrics = (source[columnKey] ?? []).slice(0, maxMetrics);
    return {
      columnKey,
      metrics,
      text: metrics.map((metric) => `${metric.label}: ${formatMetric(metric.value)}`).join(' / ') || ' - ',
    };
  });

  const rows = model.rows.slice(0, maxRows).map((row: GridPivotMaterializedRow): PivotPreviewRow => ({
    key: row.key,
    label: row.rowPath.join(' / ') || '(leer)',
    depth: row.depth,
    isSubtotal: row.isSubtotal,
    collapsed: row.collapsed,
    sourceRowCount: row.sourceRecordRowIndices.length,
    sourceRecordRowIndices: row.sourceRecordRowIndices,
    cells: toCells(row.cells),
  }));

  const grandTotals = toCells(model.grandTotals);
  const state: PivotPreviewState = rows.length === 0 ? 'empty' : (rowsTruncated || columnsTruncated || metricsTruncated ? 'partial' : 'ready');
  const message = state === 'empty'
    ? 'Keine Datensaetze im Quellbereich fuer diese Konfiguration.'
    : state === 'partial'
      ? `Teilvorschau: ${rows.length} von ${model.rows.length} Zeilen, ${columnKeys.length} von ${model.columnKeys.length} Spalten.`
      : `${rows.length} Zeilen \u00b7 ${columnKeys.length} Spalten \u00b7 ${model.valueFields.length} Werte`;

  return {
    state,
    rows,
    columnKeys,
    valueLabels: model.valueFields.map((field) => field.label || `${field.aggregation.toUpperCase()}(${field.column})`),
    metricCount: model.valueFields.length,
    grandTotals,
    totalRowCount: model.rows.length,
    totalColumnCount: model.columnKeys.length,
    sourceRecordCount: rows.reduce((sum, row) => sum + row.sourceRowCount, 0),
    rowsTruncated,
    columnsTruncated,
    metricsTruncated,
    message,
  };
}

export interface PivotPreviewRequest {
  readonly cells: Readonly<Record<string, GridCell>>;
  readonly definition: GridPivotDefinition | null;
  readonly maxRows?: number;
  readonly maxColumns?: number;
  readonly maxMetrics?: number;
}

/**
 * Bounded live preview. Never throws: an unusable configuration returns the
 * `error` state with a concrete, user-readable message.
 */
export function buildPivotPreview(request: PivotPreviewRequest): PivotPreview {
  const maxRows = Math.min(Math.max(request.maxRows ?? MAX_PIVOT_PREVIEW_ROWS, 1), MAX_PIVOT_PREVIEW_ROWS);
  const maxColumns = Math.min(Math.max(request.maxColumns ?? MAX_PIVOT_PREVIEW_COLUMNS, 1), MAX_PIVOT_PREVIEW_COLUMNS);
  const maxMetrics = Math.min(Math.max(request.maxMetrics ?? MAX_PIVOT_PREVIEW_METRICS, 1), MAX_PIVOT_PREVIEW_METRICS);

  if (!request.definition) {
    return {
      state: 'empty',
      rows: [],
      columnKeys: [],
      valueLabels: [],
      metricCount: 0,
      grandTotals: [],
      totalRowCount: 0,
      totalColumnCount: 0,
      sourceRecordCount: 0,
      rowsTruncated: false,
      columnsTruncated: false,
      metricsTruncated: false,
      message: 'Noch keine Konfiguration: Zeilen- und Wertefelder waehlen.',
    };
  }

  let model: GridPivotTableModel;
  try {
    model = buildPivotTableModel(request.cells as Record<string, GridCell>, request.definition);
  } catch (error) {
    const classified = classifyEngineError(error);
    return {
      state: 'error',
      rows: [],
      columnKeys: [],
      valueLabels: [],
      metricCount: 0,
      grandTotals: [],
      totalRowCount: 0,
      totalColumnCount: 0,
      sourceRecordCount: 0,
      rowsTruncated: false,
      columnsTruncated: false,
      metricsTruncated: false,
      message: previewMessage(classified.code),
      errorCode: classified.code,
      errorDetail: classified.detail,
    };
  }

  return buildPreview({ model, maxRows, maxColumns, maxMetrics });
}

export interface PivotDrillDownCell {
  readonly header: string;
  readonly value: string;
}

export interface PivotDrillDownRow {
  readonly sourceRowIndex: number;
  /** Worksheet row number as shown in the row header (1-based, for the label). */
  readonly worksheetRow: number;
  readonly cells: readonly PivotDrillDownCell[];
}

export interface PivotDrillDown {
  readonly state: 'empty' | 'ready' | 'capped' | 'error';
  readonly groupKey: string;
  readonly headers: readonly string[];
  readonly rows: readonly PivotDrillDownRow[];
  readonly totalRecordCount: number;
  readonly message: string;
}

export interface PivotDrillDownRequest {
  readonly cells: Readonly<Record<string, GridCell>>;
  readonly definition: GridPivotDefinition;
  readonly sourceRecordRowIndices: readonly number[];
  readonly groupKey: string;
  readonly maxRecords?: number;
}

/**
 * Deterministic drill-down: source rows are de-duplicated, sorted ascending and
 * capped. The same aggregate always yields exactly the same record list.
 */
export function buildPivotDrillDown(request: PivotDrillDownRequest): PivotDrillDown {
  const bounds = parseGridRange(request.definition.sourceRange);
  if (!bounds) {
    return { state: 'empty', groupKey: request.groupKey, headers: [], rows: [], totalRecordCount: 0, message: 'Quellbereich ist ungueltig.' };
  }
  const indices = [...new Set(request.sourceRecordRowIndices.filter((row) => Number.isInteger(row) && row >= 0))]
    .sort((left, right) => left - right);
  if (indices.length === 0) {
    return { state: 'empty', groupKey: request.groupKey, headers: [], rows: [], totalRecordCount: 0, message: 'Fuer dieses Aggregat sind keine Quellzeilen hinterlegt.' };
  }

  const columnCount = Math.min(bounds.endCol - bounds.startCol + 1, MAX_PIVOT_DRILLDOWN_COLUMNS);
  const headers: string[] = [];
  for (let offset = 0; offset < columnCount; offset++) {
    const raw = request.cells[toA1(bounds.startCol + offset, bounds.startRow)]?.value;
    const text = raw === undefined || raw === null || String(raw).trim() === '' ? `Spalte ${bounds.startCol + offset + 1}` : String(raw);
    headers.push(text.slice(0, 128));
  }

  const maxRecords = Math.min(Math.max(request.maxRecords ?? MAX_PIVOT_DRILLDOWN_RECORDS, 1), MAX_PIVOT_DRILLDOWN_RECORDS);
  const selected = indices.slice(0, maxRecords);
  const records = drillDownPivotSourceRecords(request.cells as Record<string, GridCell>, request.definition.sourceRange, selected);
  const headerByCoordinate = headers;
  const rows = records.map((record, index): PivotDrillDownRow => {
    const sourceRowIndex = selected[index];
    return {
      sourceRowIndex,
      worksheetRow: sourceRowIndex + 1,
      cells: headerByCoordinate.map((header) => ({
        header,
        value: String(record[header] ?? '').slice(0, 512),
      })),
    };
  });

  const capped = indices.length > maxRecords;
  return {
    state: capped ? 'capped' : 'ready',
    groupKey: request.groupKey,
    headers,
    rows,
    totalRecordCount: indices.length,
    message: capped
      ? `Quelldaten: ${rows.length} von ${indices.length} Datensaetzen (Rest ueber die Quelltabelle erreichbar).`
      : `Quelldaten: ${rows.length} Datensaetze.`,
  };
}

export interface PivotChartPoint {
  readonly label: string;
  readonly value: number;
}

export interface PivotChartSeries {
  readonly key: string;
  readonly label: string;
  readonly points: readonly PivotChartPoint[];
}

export interface PivotChartView {
  readonly state: 'empty' | 'partial' | 'ready';
  readonly categories: readonly string[];
  readonly series: readonly PivotChartSeries[];
  readonly maxValue: number;
  /** Text alternative that carries the same information as the chart. */
  readonly accessibleSummary: string;
  readonly message: string;
}

/**
 * Derives a chart directly from the same pivot model the table shows, so chart
 * and table can never disagree.
 */
export function buildPivotChartView(preview: PivotPreview, maxCategories = MAX_PIVOT_CHART_CATEGORIES, maxSeries = MAX_PIVOT_CHART_SERIES): PivotChartView {
  if (preview.state === 'error' || preview.rows.length === 0 || preview.columnKeys.length === 0) {
    return {
      state: 'empty',
      categories: [],
      series: [],
      maxValue: 0,
      accessibleSummary: 'Kein Diagramm: die Vorschau enthaelt keine Werte.',
      message: 'Keine Daten fuer ein Pivot-Diagramm.',
    };
  }

  const categories = preview.rows.slice(0, maxCategories).map((row) => row.label);
  const metricCount = Math.max(1, preview.metricCount);
  const series: PivotChartSeries[] = [];
  for (let metricIndex = 0; metricIndex < metricCount && series.length < maxSeries; metricIndex++) {
    const metric = preview.rows[0]?.cells[0]?.metrics[metricIndex];
    if (!metric) continue;
    series.push({
      key: metric.id,
      label: metric.label,
      points: preview.rows.slice(0, maxCategories).map((row) => ({
        label: row.label,
        value: row.cells[0]?.metrics[metricIndex]?.value ?? 0,
      })),
    });
  }

  const allValues = series.flatMap((entry) => entry.points.map((point) => point.value)).filter((value) => Number.isFinite(value));
  const maxValue = allValues.length > 0 ? Math.max(...allValues.map((value) => Math.abs(value))) : 0;
  const partial = preview.rowsTruncated || preview.columnsTruncated || preview.rows.length > maxCategories || series.length >= maxSeries;

  const summaryParts = series.map((entry) => `${entry.label}: ${entry.points.map((point) => `${point.label} ${formatMetric(point.value)}`).join(', ')}`);
  const accessibleSummary = summaryParts.length > 0
    ? `Pivot-Diagramm. ${summaryParts.join(' | ')}`
    : 'Kein Diagramm: die Vorschau enthaelt keine Werte.';

  return {
    state: partial ? 'partial' : 'ready',
    categories,
    series,
    maxValue,
    accessibleSummary: accessibleSummary.slice(0, 4_000),
    message: partial
      ? `Teildiagramm: ${categories.length} Kategorien, ${series.length} Reihen.`
      : `${categories.length} Kategorien, ${series.length} Reihen.`,
  };
}

export interface PivotSlicerChange {
  readonly definition: GridPivotDefinition;
  readonly applied: boolean;
  readonly message: string;
}

/**
 * Applies a slicer selection to a pivot definition. Selecting nothing clears the
 * filter, which restores the unfiltered pivot instead of freezing an empty one.
 */
export function applyPivotSlicerSelection(
  definition: GridPivotDefinition,
  column: string,
  selectedValues: readonly string[],
): PivotSlicerChange {
  const key = column.trim().toUpperCase();
  if (!/^[A-Z]{1,4}$/.test(key)) {
    return { definition, applied: false, message: 'Slicer ohne gueltige Spalte wurde nicht angewendet.' };
  }
  const bounded = [...new Set(selectedValues.map((value) => value.trim()).filter(Boolean))].slice(0, 2_048);
  const rest = (definition.filters ?? []).filter((filter) => filter.column.trim().toUpperCase() !== key);
  return {
    definition: { ...definition, filters: bounded.length > 0 ? [...rest, { column: key, allowedValues: bounded }] : rest },
    applied: true,
    message: bounded.length > 0
      ? `Slicer ${key}: ${bounded.length} Wert(e) ausgewaehlt.`
      : `Slicer ${key} zurueckgesetzt: alle Werte sichtbar.`,
  };
}
