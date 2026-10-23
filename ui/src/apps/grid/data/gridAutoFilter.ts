// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded AutoFilter value model.
//
// Backs the column-header AutoFilter dropdown: bounded distinct value
// enumeration, checkbox selection state, and filter-rule construction that
// composes with the Data-View Projection Planner. Resetting a filter yields no
// selection and therefore restores the exact original row set and order.

import type { GridCell, GridFilterRule } from '../../../shared/contracts/grid/workspaceGrid';
import { toA1 } from '../formulas/formula';
import { parseCoord } from '../core/gridCoordinate';
import { MAX_RULE_TEXT_LENGTH } from './gridDataProjection';

/** Hard bound on parsed distinct values per column. */
export const MAX_AUTOFILTER_VALUES = 1_000;
/** Hard bound on simultaneously checked values per column. */
export const MAX_AUTOFILTER_SELECTION = 256;
/** Hard bound on the accepted length of a single distinct value. */
export const MAX_AUTOFILTER_VALUE_LENGTH = MAX_RULE_TEXT_LENGTH;
/** Values longer than this are shown truncated; the full text stays in `display`. */
export const AUTOFILTER_LABEL_LENGTH = 80;

export interface AutoFilterValue {
  /** Canonical comparison key (raw trimmed text, never lower-cased). */
  readonly value: string;
  /** Text for the control; identical to `value` unless truncated. */
  readonly label: string;
  /** Number of source rows carrying this value. */
  readonly count: number;
  readonly truncated: boolean;
}

export interface AutoFilterValueSet {
  readonly column: string;
  readonly values: readonly AutoFilterValue[];
  readonly selected: readonly string[];
  /** True when the column holds more distinct values than `MAX_AUTOFILTER_VALUES`. */
  readonly valueCapped: boolean;
  /** True when more values were checked than `MAX_AUTOFILTER_SELECTION`. */
  readonly selectionCapped: boolean;
  /** Distinct source rows inspected. */
  readonly scannedRows: number;
  /** True when the scan stopped early because of a bound. */
  readonly scanTruncated: boolean;
}

export type AutoFilterErrorCode =
  | 'autofilter_invalid_column'
  | 'autofilter_value_too_long'
  | 'autofilter_selection_too_large';

export type AutoFilterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: AutoFilterErrorCode; readonly detail: string };

export interface AutoFilterColumnRequest {
  readonly cells: Readonly<Record<string, GridCell>>;
  /** Data rows only, header row excluded, ascending and duplicate free. */
  readonly dataRowIndices: readonly number[];
  readonly column: string;
  readonly selected?: readonly string[];
  readonly blankLabel?: string;
}

function columnIndex(column: string): number {
  const normalized = column.trim().toUpperCase();
  if (!/^[A-Z]{1,4}$/.test(normalized)) return -1;
  return parseCoord(`${normalized}1`).colIdx;
}

function isBlank(value: GridCell['value'] | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/** Canonical text of a cell for AutoFilter grouping. `(Blanks)` groups empties. */
export function autoFilterValueOf(value: GridCell['value'] | undefined, blankLabel = '(Blanks)'): string {
  if (isBlank(value)) return blankLabel;
  return String(value).trim();
}

export function buildAutoFilterValues(request: AutoFilterColumnRequest): AutoFilterResult<AutoFilterValueSet> {
  const index = columnIndex(request.column);
  if (index < 0) {
    return { ok: false, code: 'autofilter_invalid_column', detail: request.column };
  }
  const blankLabel = request.blankLabel ?? '(Blanks)';
  const counts = new Map<string, { count: number; truncated: boolean }>();
  let valueCapped = false;
  let scanTruncated = false;

  for (const row of request.dataRowIndices) {
    const key = autoFilterValueOf(request.cells[toA1(index, row)]?.value, blankLabel);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    if (counts.size >= MAX_AUTOFILTER_VALUES) {
      valueCapped = true;
      scanTruncated = true;
      break;
    }
    counts.set(key, { count: 1, truncated: key.length > AUTOFILTER_LABEL_LENGTH });
  }

  const values: AutoFilterValue[] = [...counts.entries()]
    .map(([value, entry]) => ({
      value,
      label: value.length > AUTOFILTER_LABEL_LENGTH ? `${value.slice(0, AUTOFILTER_LABEL_LENGTH - 1)}\u2026` : value,
      count: entry.count,
      truncated: entry.truncated,
    }))
    .sort((left, right) => left.value.localeCompare(right.value, undefined, { numeric: true, sensitivity: 'base' }));

  const requestedSelection = [...new Set(request.selected ?? [])];
  const selectionCapped = requestedSelection.length > MAX_AUTOFILTER_SELECTION;
  const allowed = new Set(values.map((entry) => entry.value));
  const selected = requestedSelection.filter((value) => allowed.has(value)).slice(0, MAX_AUTOFILTER_SELECTION);

  return {
    ok: true,
    value: {
      column: request.column.trim().toUpperCase(),
      values,
      selected,
      valueCapped,
      selectionCapped,
      scannedRows: request.dataRowIndices.length,
      scanTruncated,
    },
  };
}

export function validateAutoFilterSelection(selected: readonly string[]): AutoFilterResult<readonly string[]> {
  if (selected.length > MAX_AUTOFILTER_SELECTION) {
    return { ok: false, code: 'autofilter_selection_too_large', detail: `${selected.length} > ${MAX_AUTOFILTER_SELECTION}` };
  }
  for (const value of selected) {
    if (value.length > MAX_AUTOFILTER_VALUE_LENGTH) {
      return { ok: false, code: 'autofilter_value_too_long', detail: `length ${value.length}` };
    }
  }
  return { ok: true, value: selected };
}

/** Pure toggle of one checkbox. An oversized result fails closed (unchanged). */
export function toggleAutoFilterValue(set: AutoFilterValueSet, value: string): AutoFilterValueSet {
  const next = set.selected.includes(value)
    ? set.selected.filter((entry) => entry !== value)
    : [...set.selected, value];
  const validated = validateAutoFilterSelection(next);
  if (!validated.ok) return set;
  return { ...set, selected: validated.value, selectionCapped: false };
}

/** "Select all" / "Clear" of the checkbox list. Empty selection means "no filter". */
export function setAutoFilterSelection(set: AutoFilterValueSet, selected: readonly string[]): AutoFilterValueSet {
  const validated = validateAutoFilterSelection([...new Set(selected)]);
  if (!validated.ok) return set;
  const allowed = new Set(set.values.map((entry) => entry.value));
  return {
    ...set,
    selected: validated.value.filter((value) => allowed.has(value)).slice(0, MAX_AUTOFILTER_SELECTION),
    selectionCapped: false,
  };
}

export function isAutoFilterActive(set: AutoFilterValueSet): boolean {
  return set.selected.length > 0;
}

/**
 * Converts the checkbox state into the canonical filter rule of the sheet.
 * With nothing checked the rule for this column is removed, which is the exact
 * reset path back to the original row set and order.
 */
export function toAutoFilterRule(
  ruleId: string,
  set: AutoFilterValueSet,
  existing: readonly GridFilterRule[] = [],
): GridFilterRule[] {
  const column = set.column.trim().toUpperCase();
  const rest = existing.filter((rule) => rule.column.trim().toUpperCase() !== column);
  if (!isAutoFilterActive(set)) return rest;
  if (set.selected.length === 1) {
    return [...rest, { id: ruleId, column, operator: 'equals', value: set.selected[0] }];
  }
  // More than one checked value: AND over the unchecked values. This keeps the
  // AND-combined base filter intact and stays exact for any number of values.
  const unselected = set.values
    .map((entry) => entry.value)
    .filter((value) => !set.selected.includes(value))
    .slice(0, MAX_AUTOFILTER_SELECTION);
  return [...rest, ...unselected.map((value, index) => ({
    id: `${ruleId}:${index}`,
    column,
    operator: 'not-equals' as const,
    value,
  }))];
}

/** Concrete, non-colour summary used by the control label and by screen readers. */
export function describeAutoFilter(set: AutoFilterValueSet): string {
  if (set.values.length === 0) return `${set.column}: keine Werte vorhanden`;
  if (!isAutoFilterActive(set)) return `${set.column}: alle ${set.values.length} Werte sichtbar`;
  if (set.selected.length === 1) return `${set.column}: 1 von ${set.values.length} Werten ausgewaehlt`;
  return `${set.column}: ${set.selected.length} von ${set.values.length} Werten ausgewaehlt`;
}
