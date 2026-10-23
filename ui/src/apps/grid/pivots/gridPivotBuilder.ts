// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded Excel-like Pivot Builder configuration model.
//
// The builder is a decision layer, not a text parser: fields are field-chips that
// move between the Rows / Columns / Values / Filters zones. Every mutation is a
// pure function so the same transition can be driven by drag-and-drop *and* by
// keyboard or button, with identical results.

import type {
  GridPivotAggregation,
  GridPivotCalculatedFieldDefinition,
  GridPivotDefinition,
  GridPivotFilterDefinition,
  GridPivotGroupingDefinition,
} from '../../../shared/contracts/grid/workspaceGrid';
import { parseGridRange } from '../compat/gridProfessional';

export type PivotZone = 'available' | 'rows' | 'columns' | 'values' | 'filters';

export const PIVOT_AGGREGATIONS: readonly GridPivotAggregation[] = [
  'sum',
  'count',
  'average',
  'min',
  'max',
  'distinct_count',
];

export const PIVOT_AGGREGATION_LABELS: Readonly<Record<GridPivotAggregation, string>> = {
  sum: 'Summe',
  count: 'Anzahl',
  average: 'Mittelwert',
  min: 'Minimum',
  max: 'Maximum',
  distinct_count: 'Anzahl eindeutiger Werte',
};

/** Bound on the selectable field list; the rest stays reachable by search. */
export const MAX_PIVOT_BUILDER_FIELDS = 512;
/** Bound on rendered field chips per zone. */
export const MAX_PIVOT_ZONE_CHIPS = 64;
/** Bound on value measures placed on the data axis. */
export const MAX_PIVOT_VALUE_FIELDS = 32;
export const MAX_PIVOT_ROW_FIELDS = 32;
export const MAX_PIVOT_COLUMN_FIELDS = 32;
export const MAX_PIVOT_FILTER_FIELDS = 32;
/** Bound on the accepted field-name length. */
export const MAX_PIVOT_FIELD_NAME_LENGTH = 128;
/** Bound on the inspected source range, in cells. */
export const MAX_PIVOT_BUILDER_SOURCE_CELLS = 250_000;
export const MAX_PIVOT_BUILDER_SOURCE_ROWS = 20_000;

export interface PivotFieldRef {
  /** Column reference inside the source range, e.g. "A". */
  readonly column: string;
  /** Header text used for display; falls back to the column reference. */
  readonly label: string;
}

export interface PivotValueSlot {
  readonly column: string;
  readonly label: string;
  readonly aggregation: GridPivotAggregation;
  readonly customLabel?: string;
}

export interface PivotValueOption {
  readonly column: string;
  readonly label: string;
  readonly kind: 'measure' | 'dimension';
  readonly hint: string;
}

export interface PivotBuilderConfig {
  readonly sourceRange: string;
  /** All fields of the source range in worksheet column order. */
  readonly fields: readonly PivotFieldRef[];
  /** True when the field list was capped by `MAX_PIVOT_BUILDER_FIELDS`. */
  readonly fieldsCapped: boolean;
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  readonly values: readonly PivotValueSlot[];
  readonly filters: readonly GridPivotFilterDefinition[];
  readonly groupings: readonly GridPivotGroupingDefinition[];
  readonly calculatedFields: readonly GridPivotCalculatedFieldDefinition[];
  readonly style: NonNullable<GridPivotDefinition['style']>;
  readonly name: string;
}

export type PivotBuilderErrorCode =
  | 'pivot_builder_unknown_field'
  | 'pivot_builder_duplicate_field'
  | 'pivot_builder_value_field_limit'
  | 'pivot_builder_dimension_limit'
  | 'pivot_builder_filter_limit'
  | 'pivot_builder_last_row_field'
  | 'pivot_builder_invalid_field_name'
  | 'pivot_builder_invalid_source_range'
  | 'pivot_builder_source_limit'
  | 'pivot_builder_missing_values'
  | 'pivot_builder_self_transfer';

export interface PivotBuilderIssue {
  readonly code: PivotBuilderErrorCode;
  readonly detail: string;
}

export type PivotBuilderResult =
  | { readonly ok: true; readonly config: PivotBuilderConfig }
  | { readonly ok: false; readonly issues: readonly PivotBuilderIssue[] };

export interface PivotBuilderRequest {
  readonly config: PivotBuilderConfig;
  readonly field: string;
  readonly from: PivotZone;
  readonly to: PivotZone;
  /** Target slot inside the destination zone; defaults to appending. */
  readonly toIndex?: number;
  /** Aggregation applied when moving into the Values zone. */
  readonly aggregation?: GridPivotAggregation;
}

function normalizeColumn(column: string): string {
  return column.trim().toUpperCase();
}

export function pivotFieldByColumn(config: PivotBuilderConfig, column: string): PivotFieldRef | undefined {
  const key = normalizeColumn(column);
  return config.fields.find((field) => normalizeColumn(field.column) === key);
}

export function pivotZoneOf(config: PivotBuilderConfig, column: string): PivotZone {
  const key = normalizeColumn(column);
  if (config.rows.some((entry) => normalizeColumn(entry) === key)) return 'rows';
  if (config.columns.some((entry) => normalizeColumn(entry) === key)) return 'columns';
  if (config.values.some((entry) => normalizeColumn(entry.column) === key)) return 'values';
  if (config.filters.some((entry) => normalizeColumn(entry.column) === key)) return 'filters';
  return 'available';
}

/** Concrete, non-colour summary of one zone for labels and screen readers. */
export function describeZone(config: PivotBuilderConfig, zone: PivotZone): string {
  switch (zone) {
    case 'available':
      return `${config.fields.length} verfuegbare Felder`;
    case 'rows':
      return config.rows.length === 0 ? 'Keine Zeilenfelder' : `Zeilenfelder: ${config.rows.join(', ')}`;
    case 'columns':
      return config.columns.length === 0 ? 'Keine Spaltenfelder' : `Spaltenfelder: ${config.columns.join(', ')}`;
    case 'values':
      return config.values.length === 0
        ? 'Keine Werte'
        : `Werte: ${config.values.map((slot) => `${PIVOT_AGGREGATION_LABELS[slot.aggregation]} von ${slot.customLabel ?? slot.label}`).join(', ')}`;
    case 'filters':
      return config.filters.length === 0 ? 'Keine Filter' : `Filter: ${config.filters.map((filter) => filter.column).join(', ')}`;
    default:
      return '';
  }
}

function withoutField(config: PivotBuilderConfig, column: string): PivotBuilderConfig {
  const key = normalizeColumn(column);
  return {
    ...config,
    rows: config.rows.filter((entry) => normalizeColumn(entry) !== key),
    columns: config.columns.filter((entry) => normalizeColumn(entry) !== key),
    values: config.values.filter((entry) => normalizeColumn(entry.column) !== key),
    filters: config.filters.filter((entry) => normalizeColumn(entry.column) !== key),
    groupings: config.groupings.filter((entry) => normalizeColumn(entry.column) !== key),
  };
}

function insertAt<T>(list: readonly T[], item: T, index?: number): T[] {
  const next = [...list];
  const position = index === undefined ? next.length : Math.min(Math.max(index, 0), next.length);
  next.splice(position, 0, item);
  return next;
}

function zoneLimit(zone: PivotZone): number | null {
  if (zone === 'rows') return MAX_PIVOT_ROW_FIELDS;
  if (zone === 'columns') return MAX_PIVOT_COLUMN_FIELDS;
  if (zone === 'values') return MAX_PIVOT_VALUE_FIELDS;
  if (zone === 'filters') return MAX_PIVOT_FILTER_FIELDS;
  return null;
}

function dimensionLimitCode(zone: PivotZone): PivotBuilderErrorCode {
  return zone === 'values' ? 'pivot_builder_value_field_limit' : 'pivot_builder_dimension_limit';
}

export function addPivotValueOption(
  config: PivotBuilderConfig,
  column: string,
  sampleValues: readonly unknown[],
): PivotValueOption {
  const field = pivotFieldByColumn(config, column);
  const numericSamples = sampleValues.filter((value) => typeof value === 'number' && Number.isFinite(value));
  const nonNumericSamples = sampleValues.filter((value) => value !== null && value !== undefined && String(value).trim() !== '' && !(typeof value === 'number'));
  const kind: PivotValueOption['kind'] = numericSamples.length > 0 ? 'measure' : 'dimension';
  const hint = kind === 'measure'
    ? `Numerisch \u00b7 ${numericSamples.length} von ${sampleValues.length} geprueften Werten sind Zahlen`
    : `Text/Kategorie \u00b7 ${nonNumericSamples.length} von ${sampleValues.length} geprueften Werten sind keine Zahlen`;
  return { column: normalizeColumn(column), label: field?.label ?? normalizeColumn(column), kind, hint };
}

/**
 * Pure zone transfer. It is the single implementation behind drag-and-drop and
 * behind the keyboard/button path, so both produce byte-identical results.
 */
export function transferPivotField(request: PivotBuilderRequest): PivotBuilderResult {
  const { config, from, to } = request;
  const column = normalizeColumn(request.field);
  if (!column) return { ok: false, issues: [{ code: 'pivot_builder_invalid_field_name', detail: request.field }] };
  if (column.length > MAX_PIVOT_FIELD_NAME_LENGTH) {
    return { ok: false, issues: [{ code: 'pivot_builder_invalid_field_name', detail: `length ${column.length}` }] };
  }
  if (!pivotFieldByColumn(config, column)) {
    return { ok: false, issues: [{ code: 'pivot_builder_unknown_field', detail: column }] };
  }
  const currentZone = pivotZoneOf(config, column);
  if (currentZone !== from) {
    // Stale drop target: reject instead of silently moving the wrong field.
    return { ok: false, issues: [{ code: 'pivot_builder_unknown_field', detail: `${column} is in ${currentZone}, not ${from}` }] };
  }
  if (from === to) {
    return { ok: false, issues: [{ code: 'pivot_builder_self_transfer', detail: `${column} -> ${to}` }] };
  }

  const limit = zoneLimit(to);
  const existingCount = to === 'rows' ? config.rows.length
    : to === 'columns' ? config.columns.length
      : to === 'values' ? config.values.length
        : to === 'filters' ? config.filters.length
          : 0;
  if (limit !== null && existingCount >= limit) {
    return { ok: false, issues: [{ code: dimensionLimitCode(to), detail: `${existingCount} >= ${limit}` }] };
  }

  const cleared = withoutField(config, column);

  if (to === 'available') return { ok: true, config: cleared };

  if (to === 'rows') {
    return { ok: true, config: { ...cleared, rows: insertAt(cleared.rows, column, request.toIndex) } };
  }

  if (to === 'columns') {
    return { ok: true, config: { ...cleared, columns: insertAt(cleared.columns, column, request.toIndex) } };
  }

  if (to === 'values') {
    const field = pivotFieldByColumn(config, column);
    const slot: PivotValueSlot = {
      column,
      label: field?.label ?? column,
      aggregation: request.aggregation ?? 'sum',
    };
    return { ok: true, config: { ...cleared, values: insertAt(cleared.values, slot, request.toIndex) } };
  }

  const filter: GridPivotFilterDefinition = { column, allowedValues: [] };
  return { ok: true, config: { ...cleared, filters: insertAt(cleared.filters, filter, request.toIndex) } };
}

/** Convenience for a click/Enter "move right" action and for drag payloads. */
export function movePivotField(
  config: PivotBuilderConfig,
  field: string,
  from: PivotZone,
  to: PivotZone,
  aggregation?: GridPivotAggregation,
): PivotBuilderResult {
  return transferPivotField(aggregation === undefined
    ? { config, field, from, to }
    : { config, field, from, to, aggregation });
}

export function setPivotValueAggregation(
  config: PivotBuilderConfig,
  column: string,
  aggregation: GridPivotAggregation,
): PivotBuilderResult {
  const key = normalizeColumn(column);
  if (!PIVOT_AGGREGATIONS.includes(aggregation)) {
    return { ok: false, issues: [{ code: 'pivot_builder_unknown_field', detail: aggregation }] };
  }
  let found = false;
  const values = config.values.map((slot) => {
    if (normalizeColumn(slot.column) !== key) return slot;
    found = true;
    return { ...slot, aggregation };
  });
  if (!found) return { ok: false, issues: [{ code: 'pivot_builder_unknown_field', detail: key }] };
  return { ok: true, config: { ...config, values } };
}

export function setPivotValueLabel(
  config: PivotBuilderConfig,
  column: string,
  customLabel: string,
): PivotBuilderResult {
  const key = normalizeColumn(column);
  const trimmed = customLabel.trim().slice(0, MAX_PIVOT_FIELD_NAME_LENGTH);
  let found = false;
  const values = config.values.map((slot) => {
    if (normalizeColumn(slot.column) !== key) return slot;
    found = true;
    return { ...(trimmed ? { ...slot, customLabel: trimmed } : { column: slot.column, label: slot.label, aggregation: slot.aggregation }) };
  });
  if (!found) return { ok: false, issues: [{ code: 'pivot_builder_unknown_field', detail: key }] };
  return { ok: true, config: { ...config, values } };
}

export function setPivotFilterValues(
  config: PivotBuilderConfig,
  column: string,
  allowedValues: readonly string[],
): PivotBuilderResult {
  const key = normalizeColumn(column);
  const bounded = [...new Set(allowedValues.map((value) => value.trim()).filter(Boolean))].slice(0, 2_048);
  let found = false;
  const filters = config.filters.map((filter) => {
    if (normalizeColumn(filter.column) !== key) return filter;
    found = true;
    return { ...filter, allowedValues: bounded };
  });
  if (!found) return { ok: false, issues: [{ code: 'pivot_builder_unknown_field', detail: key }] };
  return { ok: true, config: { ...config, filters } };
}

export function setPivotGrouping(
  config: PivotBuilderConfig,
  column: string,
  grouping: { dateGrouping?: GridPivotGroupingDefinition['dateGrouping']; numberBinSize?: number },
): PivotBuilderResult {
  const key = normalizeColumn(column);
  const rest = config.groupings.filter((entry) => normalizeColumn(entry.column) !== key);
  return {
    ok: true,
    config: { ...config, groupings: [...rest, { column: key, ...grouping }] },
  };
}

/** Returns the canonical definition for a complete configuration, or null. */
export function buildPivotDefinition(config: PivotBuilderConfig, id: string): GridPivotDefinition | null {
  const issues: PivotBuilderIssue[] = [];
  // Parsing the range here keeps the A1 contract in one place: an unparseable or
  // oversized range must never reach the pivot engine.
  const bounds = parseGridRange(config.sourceRange.trim().toUpperCase());
  if (!bounds) {
    issues.push({ code: 'pivot_builder_invalid_source_range', detail: config.sourceRange.slice(0, 64) });
  } else {
    const cellCount = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
    if (cellCount <= 0 || cellCount > MAX_PIVOT_BUILDER_SOURCE_CELLS || bounds.endRow - bounds.startRow > MAX_PIVOT_BUILDER_SOURCE_ROWS) {
      issues.push({ code: 'pivot_builder_source_limit', detail: `${cellCount} cells` });
    }
  }
  if (config.rows.length === 0) issues.push({ code: 'pivot_builder_last_row_field', detail: 'rows' });
  if (config.values.length === 0) issues.push({ code: 'pivot_builder_missing_values', detail: 'values' });
  if (issues.length > 0) return null;
  for (const column of [...config.rows, ...config.columns, ...config.values.map((slot) => slot.column), ...config.filters.map((filter) => filter.column)]) {
    if (!pivotFieldByColumn(config, column)) return null;
  }
  const primaryValue = config.values[0];
  return {
    id,
    name: config.name.trim().slice(0, 128) || 'Pivot',
    sourceRange: config.sourceRange.trim().toUpperCase(),
    rowColumn: config.rows[0],
    valueColumn: primaryValue.column,
    aggregation: primaryValue.aggregation,
    rowColumns: [...config.rows],
    columnColumns: [...config.columns],
    valueFields: config.values.map((slot) => ({
      column: slot.column,
      aggregation: slot.aggregation,
      ...(slot.customLabel ? { label: slot.customLabel } : {}),
    })),
    filters: config.filters.map((filter) => ({ ...filter })),
    groupings: config.groupings.map((grouping) => ({ ...grouping })),
    calculatedFields: config.calculatedFields.map((field) => ({ ...field })),
    style: { ...config.style },
  };
}

/** Concrete list of what still blocks the pivot, for the panel error state. */
export function pivotBuilderBlockers(config: PivotBuilderConfig): readonly string[] {
  const blockers: string[] = [];
  if (!config.sourceRange.trim()) blockers.push('Quellbereich fehlt');
  if (config.rows.length === 0) blockers.push('Mindestens ein Zeilenfeld noetig');
  if (config.values.length === 0) blockers.push('Mindestens ein Wert noetig');
  return blockers;
}
