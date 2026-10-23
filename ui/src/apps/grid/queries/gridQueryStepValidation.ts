// STATUS: DIAMANT VGT SUPREME
// Pure validation and determinism layer for untrusted Power-Query-style transformation steps.
//
// The engine previously ignored unknown step types (`default: break`), accepted non-integer or
// out-of-range column indices as silent no-ops, let an unknown aggregation function return a
// fabricated 0, and sorted with `localeCompare`, which makes the result depend on the host locale.
// Every one of those is a silent-wrong-answer path, so each is now an explicit, testable decision.

import { GRID_QUERY_MAX_CELL_CHARS, GRID_QUERY_MAX_COLUMNS, GRID_QUERY_MAX_ROWS, GRID_QUERY_MAX_STEPS } from './gridQueryLimits';

export type QueryStepTypeName =
  | 'source' | 'filter' | 'rename' | 'changeType' | 'addCalculated' | 'split' | 'sort' | 'groupBy'
  | 'removeColumns' | 'unpivot' | 'pivot' | 'merge' | 'replace' | 'join' | 'append';

export const GRID_QUERY_STEP_TYPES: readonly QueryStepTypeName[] = Object.freeze([
  'source', 'filter', 'rename', 'changeType', 'addCalculated', 'split', 'sort', 'groupBy',
  'removeColumns', 'unpivot', 'pivot', 'merge', 'replace', 'join', 'append',
]);

export const GRID_QUERY_FILTER_OPERATORS = Object.freeze(['equals', 'notEquals', 'greater', 'less', 'contains'] as const);
export const GRID_QUERY_AGGREGATIONS = Object.freeze(['sum', 'avg', 'min', 'max', 'count'] as const);
export const GRID_QUERY_JOIN_TYPES = Object.freeze(['inner', 'left', 'right', 'full'] as const);
export const GRID_QUERY_NUMERIC_OPERATORS = Object.freeze(['greater', 'less'] as const);
export const GRID_QUERY_MAX_CALCULATED_FORMULA_CHARS = 2_048;
export const GRID_QUERY_MAX_DELIMITER_CHARS = 64;
export const GRID_QUERY_MAX_STEP_DESCRIPTION_CHARS = 256;
export const GRID_QUERY_MAX_CONVERSION_REPORTS = 32;

export type QueryFilterOperator = typeof GRID_QUERY_FILTER_OPERATORS[number];
export type QueryAggregation = typeof GRID_QUERY_AGGREGATIONS[number];
export type QueryJoinType = typeof GRID_QUERY_JOIN_TYPES[number];

function fail(code: string): never {
  throw new Error(code);
}

/** Validates a step's declared type. An unknown type is a hard error, never a silent no-op. */
export function assertGridQueryStepType(type: unknown): QueryStepTypeName {
  if (typeof type !== 'string' || !(GRID_QUERY_STEP_TYPES as readonly string[]).includes(type)) {
    return fail('query_step_type_unsupported');
  }
  return type as QueryStepTypeName;
}

export function assertGridQueryStepList(steps: readonly { type?: unknown }[]): void {
  if (!Array.isArray(steps)) fail('query_step_list_invalid');
  if (steps.length > GRID_QUERY_MAX_STEPS) fail('query_step_limit');
  for (const step of steps) assertGridQueryStepType(step?.type);
}

/** Column index must be an integer inside the *current* schema; -1/NaN/"1" are all rejected. */
export function requireGridQueryColumnIndex(value: unknown, columnCount: number, code = 'query_column_index_invalid'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= columnCount) fail(code);
  return value;
}

export function requireGridQueryFilterOperator(value: unknown): QueryFilterOperator {
  if (typeof value !== 'string' || !(GRID_QUERY_FILTER_OPERATORS as readonly string[]).includes(value)) fail('query_filter_operator_invalid');
  return value as QueryFilterOperator;
}

export function requireGridQueryAggregation(value: unknown): QueryAggregation {
  if (typeof value !== 'string' || !(GRID_QUERY_AGGREGATIONS as readonly string[]).includes(value)) fail('query_aggregation_invalid');
  return value as QueryAggregation;
}

export function requireGridQueryJoinType(value: unknown): QueryJoinType {
  if (typeof value !== 'string' || !(GRID_QUERY_JOIN_TYPES as readonly string[]).includes(value)) fail('query_join_type_invalid');
  return value as QueryJoinType;
}

export function requireGridQueryColumnType(value: unknown): 'text' | 'number' | 'date' | 'boolean' {
  if (value !== 'text' && value !== 'number' && value !== 'date' && value !== 'boolean') fail('query_target_type_invalid');
  return value;
}

export function boundGridQueryDelimiter(value: unknown): string {
  const delimiter = String(value ?? '');
  if (!delimiter) fail('query_split_delimiter_invalid');
  if (delimiter.length > GRID_QUERY_MAX_DELIMITER_CHARS) fail('query_delimiter_limit');
  return delimiter;
}

export function boundGridQueryCalculatedFormula(value: unknown): string {
  const formula = String(value ?? '');
  if (formula.length > GRID_QUERY_MAX_CALCULATED_FORMULA_CHARS) fail('query_calculated_formula_limit');
  return formula;
}

export function boundGridQueryStepDescription(value: unknown): string {
  return String(value ?? '').slice(0, GRID_QUERY_MAX_STEP_DESCRIPTION_CHARS);
}

export function boundGridQueryColumnName(value: unknown, fallback: string): string {
  const name = String(value ?? '').trim();
  const effective = name || fallback;
  if (effective.length > 256) fail('query_column_name_limit');
  return effective;
}

/**
 * Deterministic, locale-independent ordering for query values.
 *
 * Numbers compare numerically; everything else compares by UTF-16 code unit so the pipeline result
 * is identical on every host locale. `localeCompare` made "Ö" sort before or after "O" depending on
 * the machine.
 */
export function compareGridQueryValues(left: unknown, right: unknown): number {
  const leftIsNumber = typeof left === 'number' && Number.isFinite(left);
  const rightIsNumber = typeof right === 'number' && Number.isFinite(right);
  if (leftIsNumber && rightIsNumber) return left === right ? 0 : left < right ? -1 : 1;
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : -1;
  if (right === null || right === undefined) return 1;
  const a = typeof left === 'boolean' ? (left ? '1' : '0') : String(left);
  const b = typeof right === 'boolean' ? (right ? '1' : '0') : String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Deterministic row ordering that preserves the caller's row/cell type.
 *
 * The sort never inspects a cell's static type — it hands both cells to
 * `compareGridQueryValues`, which takes `unknown`. Returning the caller's own row type
 * (instead of a widened `unknown[][]`) is what lets the engine keep its `QueryValue`
 * cell model without a cast at the assignment.
 */
export function sortGridQueryRows<TCell>(
  rows: readonly TCell[][],
  columnIndex: number,
  ascending: boolean,
): TCell[][] {
  return [...rows].sort((left, right) => {
    const result = compareGridQueryValues(left[columnIndex], right[columnIndex]);
    return ascending ? result : -result;
  });
}

/** Strict, lossless numeric conversion. `null` means "this value is not a number", never 0. */
export function toGridQueryNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toGridQueryText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return text.length > GRID_QUERY_MAX_CELL_CHARS ? text.slice(0, GRID_QUERY_MAX_CELL_CHARS) : text;
}

export interface GridQueryConversionReport {
  column: string;
  type: 'number' | 'boolean' | 'date';
  converted: number;
  /** Values that could not be converted. They become `null` instead of a fabricated 0 / false. */
  unconvertible: number;
  samples: string[];
}

export function createGridQueryConversionReport(column: string, type: GridQueryConversionReport['type']): GridQueryConversionReport {
  return { column, type, converted: 0, unconvertible: 0, samples: [] };
}

export function noteGridQueryConversion(report: GridQueryConversionReport, source: unknown, converted: boolean): void {
  if (converted) report.converted += 1;
  else {
    report.unconvertible += 1;
    if (report.samples.length < 3) report.samples.push(toGridQueryText(source).slice(0, 48));
  }
}

export function assertGridQueryColumnBudget(columnCount: number): void {
  if (!Number.isSafeInteger(columnCount) || columnCount < 0 || columnCount > GRID_QUERY_MAX_COLUMNS) fail('query_source_column_limit');
  if (columnCount === 0) fail('query_source_has_no_columns');
}

export function assertGridQueryRowBudget(rowCount: number): void {
  if (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > GRID_QUERY_MAX_ROWS) fail('query_source_row_limit');
}
