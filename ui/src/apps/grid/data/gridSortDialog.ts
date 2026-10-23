// STATUS: DIAMANT VGT SUPREME
// Grid sort-dialog model: validated, previewed multi-level sorting.
//
// This module owns **no** comparator, **no** column parser, **no** level limit and **no** preview
// logic of its own. It composes the canonical, already-tested planner in
// `data/gridDataProjection.ts`:
//
//   * `validateProjectionRequest` decides whether a level list is acceptable (unknown column,
//     column outside the sheet, duplicate column, too many levels),
//   * `planGridProjection` produces the actual row order and the hidden/visible partition,
//   * `projectionPreservesSourceRows` proves that no source row was dropped.
//
// The visible sort commands the renderer already honours come from `GridSheet`'s row projection, so
// this module never permutes the cell store. It only answers "is this sort legal, and what will it
// do" before the sheet model is written.

import type { GridAdvancedFilter, GridCell, GridFilterRule, GridSortRule } from '../../../shared/contracts/grid/workspaceGrid';
import {
  MAX_PROJECTION_ROWS,
  MAX_SORT_LEVELS,
  planGridProjection,
  projectionPreservesSourceRows,
  validateProjectionRequest,
  type ProjectionIssue,
} from './gridDataProjection';

export type GridSortIssueCode =
  | 'sort_no_levels'
  | 'sort_too_many_levels'
  | 'sort_duplicate_level'
  | 'sort_column_invalid'
  | 'sort_column_outside_sheet'
  | 'sort_source_too_large'
  | 'sort_advanced_filter_invalid'
  | 'sort_plan_rejected';

export interface GridSortIssue {
  readonly code: GridSortIssueCode;
  /** German, user-facing sentence — never a raw projection code. */
  readonly message: string;
  /** Index of the offending level, when the issue belongs to one. */
  readonly levelIndex?: number;
}

/** Maps the projection planner's machine codes onto named, user-facing reasons. */
function describeProjectionIssue(issue: ProjectionIssue, levels: readonly GridSortRule[]): GridSortIssue {
  const duplicate = levels.findIndex((level, index) => levels.findIndex((other) => other.column.toUpperCase() === level.column.toUpperCase()) !== index);
  switch (issue.code) {
    case 'projection_too_many_sort_levels':
      return { code: 'sort_too_many_levels', message: `Höchstens ${MAX_SORT_LEVELS} Sortierebenen sind zulässig.` };
    case 'projection_duplicate_sort_column':
      return { code: 'sort_duplicate_level', message: `Spalte ${levels[duplicate]?.column ?? ''} ist mehrfach als Sortierebene angegeben.`, levelIndex: duplicate >= 0 ? duplicate : undefined };
    case 'projection_column_outside_bounds':
      return { code: 'sort_column_outside_sheet', message: `Die Spalte der Sortierebene liegt außerhalb des Blattes (${issue.detail}).` };
    case 'projection_invalid_column':
      return { code: 'sort_column_invalid', message: `Die Sortierebene nennt keine gültige Spalte (${issue.detail}).` };
    case 'projection_source_too_large':
      return { code: 'sort_source_too_large', message: `Der Bereich ist zu groß zum Sortieren (höchstens ${MAX_PROJECTION_ROWS.toLocaleString('de-DE')} Zeilen).` };
    case 'projection_too_many_filters':
    case 'projection_invalid_operator':
    case 'projection_missing_between_value':
    case 'projection_value_too_long':
    case 'projection_numeric_value_out_of_range':
    case 'projection_too_many_custom_list_entries':
      return { code: 'sort_advanced_filter_invalid', message: `Die Filterregeln sind ungültig (${issue.detail}).` };
    case 'projection_row_index_invalid':
      return { code: 'sort_plan_rejected', message: `Die Sortierung wurde abgelehnt (${issue.detail}).` };
    default:
      return { code: 'sort_plan_rejected', message: `Die Sortierung wurde abgelehnt (${issue.detail}).` };
  }
}

export interface GridSortPreviewRequest {
  readonly cells: Readonly<Record<string, GridCell>>;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly headerRowIndex?: number;
  readonly levels: readonly GridSortRule[];
  readonly filters?: readonly GridFilterRule[];
  readonly advancedFilter?: GridAdvancedFilter;
}

export interface GridSortPreview {
  /** Source rows handed to the planner. */
  readonly sourceRows: number;
  /** Rows the projection keeps visible. */
  readonly visibleRows: number;
  /** Rows the filter hides (never deleted). */
  readonly hiddenRows: number;
  /** True when the row order actually differs from the source order. */
  readonly reordered: boolean;
  /** Number of rows whose display position changed. */
  readonly movedRows: number;
  /** `false` by construction; present so a caller can assert the no-data-loss contract. */
  readonly dataLoss: false;
  /** First data row after sorting, as A1 notation of column A — useful for a preview line. */
  readonly firstRowIndex: number | null;
  readonly levels: readonly GridSortRule[];
}

export type GridSortPreviewResult =
  | { readonly ok: true; readonly preview: GridSortPreview }
  | { readonly ok: false; readonly issues: readonly GridSortIssue[] };

/**
 * Structural validation without a preview. Used when the caller has no cell map (and therefore
 * cannot report *what* the sort will do) — it still refuses every unusable level list.
 */
export function validateGridSortLevels(levels: readonly GridSortRule[], columnCount: number): readonly GridSortIssue[] {
  const normalized = levels.map((level) => ({ ...level, column: String(level.column ?? '').trim().toUpperCase() }));
  if (normalized.length === 0) {
    return [{ code: 'sort_no_levels', message: 'Es wurde keine Sortierebene angegeben.' }];
  }
  if (normalized.length > MAX_SORT_LEVELS) {
    return [{ code: 'sort_too_many_levels', message: `Höchstens ${MAX_SORT_LEVELS} Sortierebenen sind zulässig.` }];
  }
  const issues = validateProjectionRequest({
    cells: {},
    sourceRowIndices: [0, 1],
    headerRowIndex: 0,
    sortRules: normalized,
    columnCount,
  });
  return issues.map((issue) => describeProjectionIssue(issue, normalized));
}

/**
 * Validates the level list and reports what the sort would do. Fail-closed: an unusable request
 * returns named issues and no preview, so the caller cannot write an unvalidated sort.
 */
export function previewGridSort(request: GridSortPreviewRequest): GridSortPreviewResult {
  const headerRowIndex = request.headerRowIndex ?? 0;
  const levels = request.levels.map((level) => ({ ...level, column: String(level.column ?? '').trim().toUpperCase() }));

  if (levels.length === 0) {
    return { ok: false, issues: [{ code: 'sort_no_levels', message: 'Es wurde keine Sortierebene angegeben.' }] };
  }
  if (levels.length > MAX_SORT_LEVELS) {
    return { ok: false, issues: [{ code: 'sort_too_many_levels', message: `Höchstens ${MAX_SORT_LEVELS} Sortierebenen sind zulässig.` }] };
  }
  if (!Number.isInteger(request.rowCount) || request.rowCount <= 0) {
    return { ok: false, issues: [{ code: 'sort_plan_rejected', message: 'Das Blatt hat keine sortierbaren Zeilen.' }] };
  }

  const sourceRowIndices: number[] = [];
  for (let row = 0; row < Math.min(request.rowCount, MAX_PROJECTION_ROWS + 1); row += 1) sourceRowIndices.push(row);

  const projectionRequest = {
    cells: request.cells,
    sourceRowIndices,
    headerRowIndex,
    filters: request.filters ?? [],
    sortRules: levels,
    advancedFilter: request.advancedFilter,
    columnCount: request.columnCount,
  };

  const validation = validateProjectionRequest(projectionRequest);
  if (validation.length > 0) {
    return { ok: false, issues: validation.map((issue) => describeProjectionIssue(issue, levels)) };
  }

  const planned = planGridProjection(projectionRequest);
  if (!planned.ok) {
    return { ok: false, issues: planned.issues.map((issue) => describeProjectionIssue(issue, levels)) };
  }
  if (!projectionPreservesSourceRows(planned.projection, sourceRowIndices)) {
    return { ok: false, issues: [{ code: 'sort_plan_rejected', message: 'Die Sortierung würde Zeilen verlieren und wurde deshalb abgelehnt.' }] };
  }

  const order = planned.projection.orderedRowIndices;
  let movedRows = 0;
  const dataOrder = order.filter((row) => row !== headerRowIndex);
  const sourceDataOrder = sourceRowIndices.filter((row) => row !== headerRowIndex);
  for (let index = 0; index < Math.min(dataOrder.length, sourceDataOrder.length); index += 1) {
    if (dataOrder[index] !== sourceDataOrder[index]) movedRows += 1;
  }

  return {
    ok: true,
    preview: {
      sourceRows: sourceRowIndices.length,
      visibleRows: planned.projection.visibleRows.length,
      hiddenRows: planned.projection.hiddenRowIndices.length,
      reordered: movedRows > 0,
      movedRows,
      dataLoss: false,
      firstRowIndex: dataOrder[0] ?? null,
      levels,
    },
  };
}

// --- bounded level-list editing (no comparator, no ordering decision of its own) -----------------

export function addGridSortLevel(levels: readonly GridSortRule[], level: GridSortRule): readonly GridSortRule[] {
  if (levels.length >= MAX_SORT_LEVELS) return levels;
  return [...levels, { ...level, column: level.column.trim().toUpperCase() }];
}

export function removeGridSortLevel(levels: readonly GridSortRule[], index: number): readonly GridSortRule[] {
  if (!Number.isInteger(index) || index < 0 || index >= levels.length) return levels;
  return levels.filter((_, position) => position !== index);
}

/** Moves one level by one position; the level order is the sort priority. */
export function moveGridSortLevel(levels: readonly GridSortRule[], index: number, delta: -1 | 1): readonly GridSortRule[] {
  const target = index + delta;
  if (!Number.isInteger(index) || index < 0 || index >= levels.length) return levels;
  if (target < 0 || target >= levels.length) return levels;
  const next = [...levels];
  const [moved] = next.splice(index, 1);
  if (!moved) return levels;
  next.splice(target, 0, moved);
  return next;
}

export function setGridSortLevelDirection(levels: readonly GridSortRule[], index: number, direction: 'asc' | 'desc'): readonly GridSortRule[] {
  if (!Number.isInteger(index) || index < 0 || index >= levels.length) return levels;
  return levels.map((level, position) => position === index ? { ...level, direction } : level);
}

/** One-line summary of what the pending sort will do, for the dialog's status region. */
export function describeGridSortPreview(preview: GridSortPreview): string {
  const levels = preview.levels.map((level) => `${level.column} ${level.direction === 'asc' ? '↑' : '↓'}`).join(' → ');
  if (!preview.reordered) return `Sortierung ${levels}: die Reihenfolge bleibt unverändert (${preview.visibleRows} sichtbare Zeilen).`;
  const hidden = preview.hiddenRows > 0 ? `, ${preview.hiddenRows} durch Filter ausgeblendet` : '';
  return `Sortierung ${levels}: ${preview.movedRows} Zeile(n) wechseln die Position, ${preview.visibleRows} sichtbar${hidden}, keine Zeile entfernt.`;
}
