// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative bounded Sort / Filter / Slicer projection engine.

import {
  GridAdvancedFilter,
  GridCell,
  GridConditionalFormattingRule,
  GridFilterRule,
  GridSlicerDefinition,
  GridSortRule,
} from '../../../shared/contracts/grid/workspaceGrid';
import { toA1 } from '../formulas/formula';
import { conditionalVisualForCell } from '../formatting/gridFormattingEngine';
import { parseCoord } from '../core/gridCoordinate';

const MAX_MATERIALIZED_ROWS = 100_000;

function columnIndex(column: string): number {
  const normalized = column.toUpperCase().trim();
  if (!/^[A-Z]+$/.test(normalized)) return -1;
  return parseCoord(`${normalized}1`).colIdx;
}

function normalizeText(value: unknown, caseSensitive = false): string {
  const text = String(value ?? '').trim();
  return caseSensitive ? text : text.toLocaleLowerCase();
}

function comparable(value: GridCell['value'] | undefined): string | number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value ?? '').trim();
  const numeric = Number(text);
  return text !== '' && Number.isFinite(numeric) ? numeric : text.toLocaleLowerCase();
}

function dateValue(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function matchesGridFilterRule(value: GridCell['value'] | undefined, rule: GridFilterRule): boolean {
  const actualText = normalizeText(value, rule.caseSensitive);
  const expected = normalizeText(rule.value, rule.caseSensitive);
  if (rule.operator === 'empty') return actualText === '';
  if (rule.operator === 'not-empty') return actualText !== '';
  if (rule.operator === 'contains') return actualText.includes(expected);
  if (rule.operator === 'not-contains') return !actualText.includes(expected);
  if (rule.operator === 'starts-with') return actualText.startsWith(expected);
  if (rule.operator === 'ends-with') return actualText.endsWith(expected);
  if (rule.operator === 'equals') return comparable(value) === comparable(rule.value as GridCell['value']);
  if (rule.operator === 'not-equals') return comparable(value) !== comparable(rule.value as GridCell['value']);

  if (rule.operator === 'before' || rule.operator === 'after' || rule.operator === 'on-date') {
    const a = dateValue(value);
    const b = dateValue(rule.value);
    if (a === null || b === null) return false;
    if (rule.operator === 'before') return a < b;
    if (rule.operator === 'after') return a > b;
    const da = new Date(a);
    const db = new Date(b);
    return da.getUTCFullYear() === db.getUTCFullYear()
      && da.getUTCMonth() === db.getUTCMonth()
      && da.getUTCDate() === db.getUTCDate();
  }

  const a = Number(comparable(value));
  const b = Number(rule.value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (rule.operator === 'greater-than') return a > b;
  if (rule.operator === 'greater-than-or-equal') return a >= b;
  if (rule.operator === 'less-than') return a < b;
  if (rule.operator === 'less-than-or-equal') return a <= b;
  if (rule.operator === 'between') {
    const c = Number(rule.value2);
    return Number.isFinite(c) && a >= Math.min(b, c) && a <= Math.max(b, c);
  }
  return false;
}

function matchesFilterGroup(rowIdx: number, group: GridFilterRule[], cells: Record<string, GridCell>): boolean {
  return group.every((rule) => {
    const colIdx = columnIndex(rule.column);
    if (colIdx < 0) return false;
    return matchesGridFilterRule(cells[toA1(colIdx, rowIdx)]?.value, rule);
  });
}

function matchesAdvancedFilter(rowIdx: number, filter: GridAdvancedFilter | undefined, cells: Record<string, GridCell>): boolean {
  if (!filter?.groups?.length) return true;
  return filter.groups.some((group) => group.length > 0 && matchesFilterGroup(rowIdx, group, cells));
}

function matchesSlicers(rowIdx: number, slicers: GridSlicerDefinition[], cells: Record<string, GridCell>): boolean {
  for (const slicer of slicers) {
    if (!slicer.selectedValues?.length) continue;
    const colIdx = columnIndex(slicer.column);
    if (colIdx < 0) return false;
    const value = String(cells[toA1(colIdx, rowIdx)]?.value ?? '');
    if (!slicer.selectedValues.includes(value)) return false;
  }
  return true;
}

function rowSortValue(
  row: number,
  rule: GridSortRule,
  cells: Record<string, GridCell>,
  conditionalRules: GridConditionalFormattingRule[],
): string | number {
  const colIdx = columnIndex(rule.column);
  if (colIdx < 0) return '';
  const coord = toA1(colIdx, row);
  const cell = cells[coord];
  if (rule.sortBy === 'cell-color') return cell?.background ?? '';
  if (rule.sortBy === 'font-color') return cell?.text_color ?? '';
  if (rule.sortBy === 'icon') return conditionalVisualForCell(coord, cell, conditionalRules, cells).icon ?? '';
  const raw = cell?.value;
  if (rule.customList?.length) {
    const idx = rule.customList.map((item) => item.toLocaleLowerCase()).indexOf(String(raw ?? '').toLocaleLowerCase());
    return idx >= 0 ? idx : rule.customList.length;
  }
  return comparable(raw);
}

function compareRows(
  left: number,
  right: number,
  rules: GridSortRule[],
  cells: Record<string, GridCell>,
  conditionalRules: GridConditionalFormattingRule[],
): number {
  for (const rule of rules) {
    const a = rowSortValue(left, rule, cells, conditionalRules);
    const b = rowSortValue(right, rule, cells, conditionalRules);
    let cmp = 0;
    if (typeof a === 'number' && typeof b === 'number') cmp = a - b;
    else cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
  }
  return left - right;
}

function sparseDataRows(cells: Record<string, GridCell>, rowCount: number, headerRowIndex: number): number[] {
  const rows = new Set<number>();
  for (const coord of Object.keys(cells)) {
    const { rowIdx } = parseCoord(coord);
    if (rowIdx > headerRowIndex && rowIdx < rowCount) rows.add(rowIdx);
  }
  return [...rows].sort((a, b) => a - b);
}

function candidateRows(
  cells: Record<string, GridCell>,
  rowCount: number,
  headerRowIndex: number,
  projectionRequired: boolean,
): number[] {
  const count = Math.max(0, rowCount - headerRowIndex - 1);
  if (!projectionRequired && count > MAX_MATERIALIZED_ROWS) return [];
  if (count <= MAX_MATERIALIZED_ROWS) {
    return Array.from({ length: count }, (_, index) => headerRowIndex + 1 + index);
  }
  return sparseDataRows(cells, rowCount, headerRowIndex);
}

export interface GridRowProjectionOptions {
  /** Read-only on purpose: the projection evaluates the rules and never mutates them. */
  filters?: readonly GridFilterRule[];
  sortRules?: GridSortRule[];
  slicers?: GridSlicerDefinition[];
  advancedFilter?: GridAdvancedFilter;
  conditionalFormatting?: GridConditionalFormattingRule[];
  headerRowIndex?: number;
}

/**
 * Returns null only when no projection is needed and materializing the raw row space would violate the cap.
 * Consumers with a virtual renderer should interpret null as the identity row mapping.
 */
export function buildGridRowProjection(
  cells: Record<string, GridCell>,
  rowCount: number,
  options: GridRowProjectionOptions = {},
): number[] | null {
  const headerRowIndex = options.headerRowIndex ?? 0;
  const filters = options.filters ?? [];
  const sortRules = options.sortRules ?? [];
  const slicers = options.slicers ?? [];
  const projectionRequired = filters.length > 0 || sortRules.length > 0 || slicers.some((s) => s.selectedValues.length > 0) || !!options.advancedFilter?.groups?.length;
  const candidates = candidateRows(cells, rowCount, headerRowIndex, projectionRequired);
  if (!projectionRequired && candidates.length === 0 && rowCount - headerRowIndex - 1 > MAX_MATERIALIZED_ROWS) return null;

  const filtered = candidates.filter((rowIdx) =>
    filters.every((rule) => {
      const colIdx = columnIndex(rule.column);
      return colIdx >= 0 && matchesGridFilterRule(cells[toA1(colIdx, rowIdx)]?.value, rule);
    })
    && matchesAdvancedFilter(rowIdx, options.advancedFilter, cells)
    && matchesSlicers(rowIdx, slicers, cells)
  );

  const sorted = sortRules.length
    ? [...filtered].sort((a, b) => compareRows(a, b, sortRules, cells, options.conditionalFormatting ?? []))
    : filtered;

  if (options.advancedFilter?.uniqueOnly) {
    const targetRows = new Set(sorted);
    const partsByRow = new Map<number, Array<[number, string]>>();
    for (const [coord, cell] of Object.entries(cells)) {
      const parsed = parseCoord(coord);
      if (!targetRows.has(parsed.rowIdx)) continue;
      const parts = partsByRow.get(parsed.rowIdx) ?? [];
      parts.push([parsed.colIdx, String(cell.value ?? '')]);
      partsByRow.set(parsed.rowIdx, parts);
    }
    const seen = new Set<string>();
    const unique: number[] = [];
    for (const row of sorted) {
      const signature = (partsByRow.get(row) ?? [])
        .sort((a, b) => a[0] - b[0])
        .map(([col, value]) => `${col}=${value}`)
        .join('\u001f');
      if (seen.has(signature)) continue;
      seen.add(signature);
      unique.push(row);
    }
    return headerRowIndex >= 0 && rowCount > 0 ? [headerRowIndex, ...unique] : unique;
  }

  return headerRowIndex >= 0 && rowCount > 0 ? [headerRowIndex, ...sorted] : sorted;
}
