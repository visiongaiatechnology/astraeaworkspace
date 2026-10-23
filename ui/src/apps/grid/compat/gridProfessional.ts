// STATUS: PLATIN
import {
  GridCell,
  GridConditionalFormattingRule,
  GridDataValidationRule,
  GridFilterRule,
  GridPivotDefinition,
  GridSortRule,
} from '../../../shared/contracts/workspace';
import { conditionalVisualForCell } from '../formatting/gridFormattingEngine';
import { parseCoord } from '../core/gridCoordinate';
import { parseGridRange } from '../ranges/gridRange';
export { parseGridRange } from '../ranges/gridRange';
export type { GridRangeBounds } from '../ranges/gridRange';
import { toA1 } from '../formulas/formula';
import { buildGridRowProjection, matchesGridFilterRule } from '../tables/gridDataOperations';

const columnIndex = (column: string): number => {
  const normalized = column.toUpperCase().trim();
  if (!/^[A-Z]+$/.test(normalized)) return -1;
  return parseCoord(`${normalized}1`).colIdx;
};

export function coordInGridRange(coord: string, range: string): boolean {
  const bounds = parseGridRange(range);
  if (!bounds) return false;
  const { colIdx, rowIdx } = parseCoord(coord.toUpperCase());
  return colIdx >= bounds.startCol && colIdx <= bounds.endCol && rowIdx >= bounds.startRow && rowIdx <= bounds.endRow;
}

export function buildVisibleRowIndices(
  cells: Record<string, GridCell>,
  rowCount: number,
  filters: GridFilterRule[] = [],
  sortRules: GridSortRule[] = [],
  headerRowIndex = 0,
): number[] {
  return buildGridRowProjection(cells, rowCount, { filters, sortRules, headerRowIndex }) ?? [headerRowIndex];
}

/**
 * Legacy input-only helper kept for callers that do not have a prospective GridCell.
 * Authoritative commit validation lives in gridValidation.ts.
 */
export function validateGridInput(
  rawInput: string,
  coord: string,
  rules: GridDataValidationRule[] = [],
): { valid: true } | { valid: false; message: string } {
  const rule = rules.find((candidate) => coordInGridRange(coord, candidate.range));
  if (!rule) return { valid: true };
  if (rawInput.trim() === '' && rule.allowBlank !== false) return { valid: true };
  if (rule.kind === 'custom' || (rule.kind === 'list' && rule.listSource)) {
    return { valid: false, message: 'This validation rule requires the authoritative cell-validation context.' };
  }
  const probe: GridFilterRule = { id: 'validation-probe', column: 'A', operator: 'equals', value: rawInput };
  void matchesGridFilterRule(rawInput, probe);
  const raw = rawInput.trim();
  if (rule.kind === 'whole-number' || rule.kind === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { valid: false, message: rule.errorMessage || `${coord} requires a whole number.` };
    if (rule.min !== undefined && n < rule.min) return { valid: false, message: rule.errorMessage || `${coord} must be at least ${rule.min}.` };
    if (rule.max !== undefined && n > rule.max) return { valid: false, message: rule.errorMessage || `${coord} must be at most ${rule.max}.` };
  } else if (rule.kind === 'decimal') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { valid: false, message: rule.errorMessage || `${coord} requires a numeric value.` };
    if (rule.min !== undefined && n < rule.min) return { valid: false, message: rule.errorMessage || `${coord} must be at least ${rule.min}.` };
    if (rule.max !== undefined && n > rule.max) return { valid: false, message: rule.errorMessage || `${coord} must be at most ${rule.max}.` };
  } else if (rule.kind === 'date' && Number.isNaN(Date.parse(raw))) {
    return { valid: false, message: rule.errorMessage || `${coord} requires a valid date.` };
  } else if (rule.kind === 'time' && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw)) {
    return { valid: false, message: rule.errorMessage || `${coord} requires a valid time.` };
  } else if (rule.kind === 'list' && !(rule.options ?? []).some((item) => item === raw)) {
    return { valid: false, message: rule.errorMessage || `${coord} must be one of: ${(rule.options ?? []).join(', ')}.` };
  } else if (rule.kind === 'text-length') {
    if (rule.min !== undefined && raw.length < rule.min) return { valid: false, message: rule.errorMessage || `${coord} needs at least ${rule.min} characters.` };
    if (rule.max !== undefined && raw.length > rule.max) return { valid: false, message: rule.errorMessage || `${coord} allows at most ${rule.max} characters.` };
  }
  return { valid: true };
}

export function conditionalStyleForCell(
  coord: string,
  cell: GridCell | undefined,
  rules: GridConditionalFormattingRule[] = [],
  cells: Record<string, GridCell> = {},
) {
  return conditionalVisualForCell(coord, cell, rules, cells);
}

export interface PivotResult {
  headers: [string, string];
  rows: Array<[string, number]>;
}

export function buildPivotResult(
  cells: Record<string, GridCell>,
  definition: GridPivotDefinition,
): PivotResult {
  const bounds = parseGridRange(definition.sourceRange);
  if (!bounds) throw new Error(`Invalid pivot source range: ${definition.sourceRange}`);
  const rowCol = columnIndex(definition.rowColumn);
  const valueCol = columnIndex(definition.valueColumn);
  if (rowCol < bounds.startCol || rowCol > bounds.endCol || valueCol < bounds.startCol || valueCol > bounds.endCol) {
    throw new Error('Pivot row/value columns must be inside the source range.');
  }

  const groups = new Map<string, { sum: number; count: number; min: number; max: number; distinct: Set<string> }>();
  for (let row = bounds.startRow + 1; row <= bounds.endRow; row++) {
    const label = String(cells[toA1(rowCol, row)]?.value ?? '').trim();
    if (!label) continue;
    const rawValue = cells[toA1(valueCol, row)]?.value;
    const numeric = Number(rawValue);
    const isNum = Number.isFinite(numeric);
    if (!isNum && definition.aggregation !== 'count' && definition.aggregation !== 'distinct_count') continue;

    const current = groups.get(label) ?? { sum: 0, count: 0, min: Infinity, max: -Infinity, distinct: new Set<string>() };
    current.count += 1;
    if (rawValue !== undefined && rawValue !== null) current.distinct.add(String(rawValue));
    if (isNum) {
      current.sum += numeric;
      if (numeric < current.min) current.min = numeric;
      if (numeric > current.max) current.max = numeric;
    }
    groups.set(label, current);
  }

  const rows: Array<[string, number]> = Array.from(groups.entries()).map(([label, stats]) => {
    if (definition.aggregation === 'count') return [label, stats.count];
    if (definition.aggregation === 'distinct_count') return [label, stats.distinct.size];
    if (definition.aggregation === 'average') return [label, stats.count ? stats.sum / stats.count : 0];
    if (definition.aggregation === 'min') return [label, stats.min === Infinity ? 0 : stats.min];
    if (definition.aggregation === 'max') return [label, stats.max === -Infinity ? 0 : stats.max];
    return [label, stats.sum];
  });

  rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
  return { headers: [definition.rowColumn, `${definition.aggregation.toUpperCase()}(${definition.valueColumn})`], rows };
}

export function pivotResultToCells(result: PivotResult): Record<string, GridCell> {
  const cells: Record<string, GridCell> = {
    A1: { value: result.headers[0], bold: true, background: '#1e293b', text_color: '#93c5fd' },
    B1: { value: result.headers[1], bold: true, background: '#1e293b', text_color: '#93c5fd' },
  };
  result.rows.forEach(([label, value], index) => {
    cells[`A${index + 2}`] = { value: label };
    cells[`B${index + 2}`] = { value, format: 'number' };
  });
  return cells;
}
