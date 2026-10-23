// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded Data-View Projection Planner.
//
// Pure decision layer for multi-level sorting, filter composition and exact
// filter reset. It never mutates the cell store and never removes rows from the
// source set: a projection is a *view* that always carries every source row in
// exactly one of `visibleRows` / `hiddenRows`, so a hidden row can never be
// written back as deleted by a consumer.

import type {
  GridAdvancedFilter,
  GridCell,
  GridFilterOperator,
  GridFilterRule,
  GridSortRule,
} from '../../../shared/contracts/grid/workspaceGrid';
import { toA1 } from '../formulas/formula';
import { parseCoord } from '../core/gridCoordinate';

export interface ProjectedRow {
  /** Original worksheet row index, 0-based (same convention as `parseCoord`). */
  readonly sourceRowIndex: number;
  readonly cells: Readonly<Record<string, GridCell>>;
}

export interface RowProjection {
  readonly headerRowIndex: number;
  readonly visibleRows: readonly ProjectedRow[];
  readonly orderedRowIndices: readonly number[];
  readonly hiddenRowIndices: readonly number[];
  readonly filterActive: boolean;
  readonly sortActive: boolean;
  /** Always false. Present so consumers can assert the no-data-loss contract. */
  readonly dataLoss: false;
  /** Number of distinct source rows accounted for (visible + hidden). */
  readonly accountedSourceRows: number;
}

export type ProjectionErrorCode =
  | 'projection_too_many_sort_levels'
  | 'projection_too_many_filters'
  | 'projection_invalid_column'
  | 'projection_column_outside_bounds'
  | 'projection_duplicate_sort_column'
  | 'projection_value_too_long'
  | 'projection_numeric_value_out_of_range'
  | 'projection_invalid_operator'
  | 'projection_missing_between_value'
  | 'projection_too_many_custom_list_entries'
  | 'projection_source_too_large'
  | 'projection_row_index_invalid';

export interface ProjectionIssue {
  readonly code: ProjectionErrorCode;
  readonly detail: string;
}

export type ProjectionResult =
  | { readonly ok: true; readonly projection: RowProjection }
  | { readonly ok: false; readonly issues: readonly ProjectionIssue[] };

export interface ProjectionRequest {
  readonly cells: Readonly<Record<string, GridCell>>;
  /** Original worksheet row order. Must be ascending and duplicate free. */
  readonly sourceRowIndices: readonly number[];
  readonly headerRowIndex?: number;
  readonly filters?: readonly GridFilterRule[];
  readonly sortRules?: readonly GridSortRule[];
  readonly advancedFilter?: GridAdvancedFilter;
  /** Column count of the sheet; a rule outside it is rejected instead of silently ignored. */
  readonly columnCount?: number;
}

export const MAX_SORT_LEVELS = 64;
export const MAX_FILTER_RULES = 256;
export const MAX_PROJECTION_ROWS = 100_000;
export const MAX_RULE_TEXT_LENGTH = 4_096;
export const MAX_CUSTOM_LIST_ENTRIES = 512;
export const MAX_ADVANCED_FILTER_GROUPS = 32;

const FILTER_OPERATORS: readonly GridFilterOperator[] = [
  'equals',
  'not-equals',
  'contains',
  'not-contains',
  'starts-with',
  'ends-with',
  'greater-than',
  'greater-than-or-equal',
  'less-than',
  'less-than-or-equal',
  'between',
  'empty',
  'not-empty',
  'before',
  'after',
  'on-date',
];

const NUMERIC_MAGNITUDE_LIMIT = Number.MAX_SAFE_INTEGER;

function columnIndex(column: string): number {
  const normalized = column.trim().toUpperCase();
  if (!/^[A-Z]{1,4}$/.test(normalized)) return -1;
  const parsed = parseCoord(`${normalized}1`);
  return parsed.colIdx;
}

function normalizeText(value: unknown, caseSensitive: boolean): string {
  const text = String(value ?? '').trim();
  return caseSensitive ? text : text.toLocaleLowerCase();
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value ?? '').trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  const text = String(value ?? '').trim();
  if (text === '') return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateProjectionRequest(request: ProjectionRequest): readonly ProjectionIssue[] {
  const issues: ProjectionIssue[] = [];
  const filters = request.filters ?? [];
  const sortRules = request.sortRules ?? [];
  const columnCount = request.columnCount;

  if (sortRules.length > MAX_SORT_LEVELS) {
    issues.push({ code: 'projection_too_many_sort_levels', detail: `${sortRules.length} > ${MAX_SORT_LEVELS}` });
  }
  if (filters.length > MAX_FILTER_RULES) {
    issues.push({ code: 'projection_too_many_filters', detail: `${filters.length} > ${MAX_FILTER_RULES}` });
  }
  if ((request.advancedFilter?.groups?.length ?? 0) > MAX_ADVANCED_FILTER_GROUPS) {
    issues.push({ code: 'projection_too_many_filters', detail: `advanced groups > ${MAX_ADVANCED_FILTER_GROUPS}` });
  }
  if (request.sourceRowIndices.length > MAX_PROJECTION_ROWS) {
    issues.push({ code: 'projection_source_too_large', detail: `${request.sourceRowIndices.length} > ${MAX_PROJECTION_ROWS}` });
  }
  for (const row of request.sourceRowIndices) {
    // Row indices are 0-based worksheet indices; a fractional or negative index
    // would silently address the wrong row, so it fails closed.
    if (!Number.isInteger(row) || row < 0) {
      issues.push({ code: 'projection_row_index_invalid', detail: String(row) });
      break;
    }
  }

  const seenSortColumns = new Set<string>();
  for (const rule of sortRules) {
    const index = columnIndex(rule.column);
    if (index < 0) {
      issues.push({ code: 'projection_invalid_column', detail: `sort column ${JSON.stringify(rule.column)}` });
      continue;
    }
    if (columnCount !== undefined && index >= columnCount) {
      issues.push({ code: 'projection_column_outside_bounds', detail: `sort column ${rule.column} >= ${columnCount}` });
    }
    const key = rule.column.trim().toUpperCase();
    if (seenSortColumns.has(key)) {
      issues.push({ code: 'projection_duplicate_sort_column', detail: key });
    }
    seenSortColumns.add(key);
    if ((rule.customList?.length ?? 0) > MAX_CUSTOM_LIST_ENTRIES) {
      issues.push({ code: 'projection_too_many_custom_list_entries', detail: `${rule.customList?.length ?? 0} > ${MAX_CUSTOM_LIST_ENTRIES}` });
    }
  }

  const checkRule = (rule: GridFilterRule, origin: string): void => {
    if (columnIndex(rule.column) < 0) {
      issues.push({ code: 'projection_invalid_column', detail: `${origin} column ${JSON.stringify(rule.column)}` });
    } else if (columnCount !== undefined && columnIndex(rule.column) >= columnCount) {
      issues.push({ code: 'projection_column_outside_bounds', detail: `${origin} column ${rule.column} >= ${columnCount}` });
    }
    if (!FILTER_OPERATORS.includes(rule.operator)) {
      issues.push({ code: 'projection_invalid_operator', detail: `${origin} operator ${JSON.stringify(rule.operator)}` });
    }
    for (const raw of [rule.value, rule.value2]) {
      if (raw === undefined) continue;
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || Math.abs(raw) > NUMERIC_MAGNITUDE_LIMIT) {
          issues.push({ code: 'projection_numeric_value_out_of_range', detail: `${origin} value ${String(raw)}` });
        }
        continue;
      }
      if (raw.length > MAX_RULE_TEXT_LENGTH) {
        issues.push({ code: 'projection_value_too_long', detail: `${origin} value length ${raw.length}` });
      }
    }
    if (rule.operator === 'between' && rule.value2 === undefined) {
      issues.push({ code: 'projection_missing_between_value', detail: `${origin} column ${rule.column}` });
    }
  };

  filters.forEach((rule) => checkRule(rule, 'filter'));
  (request.advancedFilter?.groups ?? []).forEach((group, groupIndex) => {
    group.forEach((rule) => checkRule(rule, `advanced group ${groupIndex + 1}`));
  });

  return issues;
}

/**
 * Excel-compatible ordering: blanks and non-numeric text never win a numeric
 * comparison, and blank keys always sort to the end regardless of direction.
 */
interface SortKey {
  readonly kind: 'blank' | 'number' | 'text';
  readonly number: number;
  readonly text: string;
  readonly rank: number;
}

function sortKeyFor(value: GridCell['value'] | undefined, customList?: readonly string[]): SortKey {
  if (customList && customList.length > 0) {
    const index = customList.findIndex((item) => item.toLocaleLowerCase() === String(value ?? '').toLocaleLowerCase());
    return { kind: 'number', number: index >= 0 ? index : customList.length, text: '', rank: 0 };
  }
  if (value === null || value === undefined) return { kind: 'blank', number: 0, text: '', rank: 0 };
  if (typeof value === 'string' && value.trim() === '') return { kind: 'blank', number: 0, text: '', rank: 0 };
  const numeric = numericValue(value);
  if (numeric !== null && typeof value !== 'string') {
    return { kind: 'number', number: numeric, text: '', rank: 0 };
  }
  const text = String(value).trim();
  if (text === '') return { kind: 'blank', number: 0, text: '', rank: 0 };
  const parsedText = Number(text);
  if (Number.isFinite(parsedText)) return { kind: 'number', number: parsedText, text: '', rank: 0 };
  return { kind: 'text', number: 0, text: text.toLocaleLowerCase(), rank: 0 };
}

function compareSortKeys(left: SortKey, right: SortKey): number {
  if (left.kind === 'blank' && right.kind === 'blank') return 0;
  if (left.kind === 'blank') return 1;
  if (right.kind === 'blank') return -1;
  if (left.kind === 'number' && right.kind === 'number') return left.number - right.number;
  if (left.kind === 'text' && right.kind === 'text') {
    return left.text.localeCompare(right.text, undefined, { numeric: true, sensitivity: 'base' });
  }
  return left.kind === 'number' ? -1 : 1;
}

function colorKeyFor(cell: GridCell | undefined, sortBy: GridSortRule['sortBy']): string {
  if (sortBy === 'cell-color') return cell?.background ?? '';
  if (sortBy === 'font-color') return cell?.text_color ?? '';
  return '';
}

/**
 * Excel-compatible ordering: blanks always sort to the end, independent of the
 * direction; numeric text ("5") participates in numeric comparisons; colour and
 * custom-list modes keep their own key spaces.
 */
function compareAtLevel(left: ProjectedRow, right: ProjectedRow, rule: GridSortRule): number {
  const index = columnIndex(rule.column);
  if (index < 0) return 0;
  const leftCell = left.cells[toA1(index, left.sourceRowIndex)];
  const rightCell = right.cells[toA1(index, right.sourceRowIndex)];
  const mode = rule.sortBy ?? 'value';

  if (mode === 'cell-color' || mode === 'font-color') {
    const leftKey = colorKeyFor(leftCell, mode);
    const rightKey = colorKeyFor(rightCell, mode);
    if (leftKey === rightKey) return 0;
    const comparison = leftKey.localeCompare(rightKey);
    return rule.direction === 'desc' ? -comparison : comparison;
  }

  const leftKey = sortKeyFor(leftCell?.value, rule.customList);
  const rightKey = sortKeyFor(rightCell?.value, rule.customList);
  // Blanks stay at the bottom in both directions: neutralise the direction flip.
  if (leftKey.kind === 'blank' || rightKey.kind === 'blank') return compareSortKeys(leftKey, rightKey);
  const comparison = compareSortKeys(leftKey, rightKey);
  if (comparison === 0) return 0;
  return rule.direction === 'desc' ? -comparison : comparison;
}

function compareProjectedRows(left: ProjectedRow, right: ProjectedRow, sortRules: readonly GridSortRule[]): number {
  if (left.sourceRowIndex === right.sourceRowIndex) return 0;
  for (const rule of sortRules) {
    const comparison = compareAtLevel(left, right, rule);
    if (comparison !== 0) return comparison;
  }
  // Stability guarantee: equal keys keep their original worksheet order.
  return left.sourceRowIndex - right.sourceRowIndex;
}

function matchesSingleRule(value: GridCell['value'] | undefined, rule: GridFilterRule): boolean {
  const caseSensitive = rule.caseSensitive ?? false;
  const actualText = normalizeText(value, caseSensitive);
  const expectedText = normalizeText(rule.value, caseSensitive);

  switch (rule.operator) {
    case 'empty':
      return actualText === '';
    case 'not-empty':
      return actualText !== '';
    case 'contains':
      return expectedText === '' ? true : actualText.includes(expectedText);
    case 'not-contains':
      return expectedText === '' ? true : !actualText.includes(expectedText);
    case 'starts-with':
      return actualText.startsWith(expectedText);
    case 'ends-with':
      return actualText.endsWith(expectedText);
    case 'equals':
      return actualText === expectedText;
    case 'not-equals':
      return actualText !== expectedText;
    case 'before':
    case 'after':
    case 'on-date': {
      const actual = dateValue(value);
      const boundary = dateValue(rule.value);
      if (actual === null || boundary === null) return false;
      if (rule.operator === 'before') return actual < boundary;
      if (rule.operator === 'after') return actual > boundary;
      const a = new Date(actual);
      const b = new Date(boundary);
      return a.getUTCFullYear() === b.getUTCFullYear()
        && a.getUTCMonth() === b.getUTCMonth()
        && a.getUTCDate() === b.getUTCDate();
    }
    case 'greater-than':
    case 'greater-than-or-equal':
    case 'less-than':
    case 'less-than-or-equal':
    case 'between': {
      const actual = numericValue(value);
      const boundary = numericValue(rule.value);
      if (actual === null || boundary === null) return false;
      if (rule.operator === 'greater-than') return actual > boundary;
      if (rule.operator === 'greater-than-or-equal') return actual >= boundary;
      if (rule.operator === 'less-than') return actual < boundary;
      if (rule.operator === 'less-than-or-equal') return actual <= boundary;
      const upper = numericValue(rule.value2);
      if (upper === null) return false;
      return actual >= Math.min(boundary, upper) && actual <= Math.max(boundary, upper);
    }
    default:
      return false;
  }
}

function rowMatchesRule(row: ProjectedRow, rule: GridFilterRule): boolean {
  const index = columnIndex(rule.column);
  if (index < 0) return false;
  return matchesSingleRule(row.cells[toA1(index, row.sourceRowIndex)]?.value, rule);
}

function matchesAdvancedFilter(row: ProjectedRow, filter: GridAdvancedFilter | undefined): boolean {
  const groups = filter?.groups ?? [];
  if (groups.length === 0) return true;
  return groups.some((group) => group.length > 0 && group.every((rule) => rowMatchesRule(row, rule)));
}

function uniqueSignature(row: ProjectedRow, columnCount: number): string {
  const parts: string[] = [];
  for (let column = 0; column < columnCount; column++) {
    // Missing cells are read as the empty string so two sparse rows with the
    // same visible content are recognised as duplicates.
    parts.push(`${column}=${String(row.cells[toA1(column, row.sourceRowIndex)]?.value ?? '')}`);
  }
  return parts.join('\u001f');
}

/**
 * Builds the projection. The returned view is exhaustive: every requested
 * source row appears exactly once in `visibleRows` or `hiddenRowIndices`.
 */
export function planGridProjection(request: ProjectionRequest): ProjectionResult {
  const issues = validateProjectionRequest(request);
  if (issues.length > 0) return { ok: false, issues };

  const headerRowIndex = request.headerRowIndex ?? 0;
  const filters = request.filters ?? [];
  const sortRules = request.sortRules ?? [];
  const advancedFilter = request.advancedFilter;
  const uniqueOnly = advancedFilter?.uniqueOnly ?? false;

  const materialized: ProjectedRow[] = request.sourceRowIndices.map((sourceRowIndex) => ({
    sourceRowIndex,
    cells: request.cells,
  }));

  const passesFilters = (row: ProjectedRow): boolean => {
    for (const rule of filters) {
      if (!rowMatchesRule(row, rule)) return false;
    }
    return matchesAdvancedFilter(row, advancedFilter);
  };

  const filterActive = filters.length > 0 || (advancedFilter?.groups?.length ?? 0) > 0;
  const sortActive = sortRules.length > 0;

  const kept = filterActive ? materialized.filter(passesFilters) : materialized.slice();
  if (uniqueOnly) {
    // Duplicate detection needs the same column window for every row; without a
    // declared column count the union of all row-scoped cells is used.
    const signatureColumnCount = request.columnCount ?? Math.max(
      0,
      ...Object.keys(request.cells).map((coord) => parseCoord(coord).colIdx + 1),
    );
    const seen = new Set<string>();
    const unique: ProjectedRow[] = [];
    for (const row of kept) {
      const signature = uniqueSignature(row, signatureColumnCount);
      if (seen.has(signature)) continue;
      seen.add(signature);
      unique.push(row);
    }
    kept.length = 0;
    kept.push(...unique);
  }

  const visibleRows = sortActive ? [...kept].sort((left, right) => compareProjectedRows(left, right, sortRules)) : kept;
  const visibleSet = new Set(visibleRows.map((row) => row.sourceRowIndex));
  const hiddenRowIndices = request.sourceRowIndices.filter((row) => !visibleSet.has(row));

  return {
    ok: true,
    projection: {
      headerRowIndex,
      visibleRows,
      orderedRowIndices: visibleRows.map((row) => row.sourceRowIndex),
      hiddenRowIndices,
      filterActive,
      sortActive,
      dataLoss: false,
      accountedSourceRows: visibleRows.length + hiddenRowIndices.length,
    },
  };
}

/**
 * Clearing filters/sort must restore the original set *and* the original order.
 * The result is derived from the source indices, never from a previously
 * projected view, which makes the restoration exact by construction.
 */
export function resetGridProjection(
  sourceRowIndices: readonly number[],
  cells: Readonly<Record<string, GridCell>>,
  headerRowIndex = 0,
): RowProjection {
  const visibleRows = sourceRowIndices.map((sourceRowIndex) => ({ sourceRowIndex, cells }));
  return {
    headerRowIndex,
    visibleRows,
    orderedRowIndices: sourceRowIndices.slice(),
    hiddenRowIndices: [],
    filterActive: false,
    sortActive: false,
    dataLoss: false,
    accountedSourceRows: sourceRowIndices.length,
  };
}

/** Returns true when the projection still accounts for every source row. */
export function projectionPreservesSourceRows(
  projection: RowProjection,
  sourceRowIndices: readonly number[],
): boolean {
  const accounted = new Set<number>([...projection.orderedRowIndices, ...projection.hiddenRowIndices]);
  if (accounted.size !== sourceRowIndices.length) return false;
  return sourceRowIndices.every((row) => accounted.has(row));
}

/** Index of the first sort level that decides between two rows, or -1 when tied. */
export function decidingSortLevel(
  left: ProjectedRow,
  right: ProjectedRow,
  sortRules: readonly GridSortRule[],
): number {
  for (let level = 0; level < sortRules.length; level++) {
    if (compareAtLevel(left, right, sortRules[level]) !== 0) return level;
  }
  return -1;
}
