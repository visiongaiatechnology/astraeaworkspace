// STATUS: DIAMANT VGT SUPREME
// Astraea Grid merged-cell layout. Merging is persisted as ranges; this module is
// the single place that turns those ranges into render spans and validates a new
// merge (overlap, data loss, deterministic order).

import type { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';
import { gridRangeCoordinates, mergeGridCells, unmergeGridCells } from '../editing/gridSelection';

export interface GridMergeSpan {
  readonly origin: string;
  readonly colSpan: number;
  readonly rowSpan: number;
}

export interface GridMergeIndex {
  readonly spans: ReadonlyMap<string, GridMergeSpan>;
  readonly covered: ReadonlySet<string>;
  /** covered coordinate -> origin coordinate that renders across it. */
  readonly originByCovered: ReadonlyMap<string, string>;
}

export function buildGridMergeIndex(mergedCells: readonly string[] | undefined): GridMergeIndex {
  const spans = new Map<string, GridMergeSpan>();
  const covered = new Set<string>();
  const originByCovered = new Map<string, string>();
  for (const range of mergedCells ?? []) {
    const bounds = parseGridRange(range);
    if (!bounds) continue;
    const origin = toA1(bounds.startCol, bounds.startRow);
    spans.set(origin, {
      origin,
      colSpan: bounds.endCol - bounds.startCol + 1,
      rowSpan: bounds.endRow - bounds.startRow + 1,
    });
    for (const coord of gridRangeCoordinates(range)) {
      if (coord === origin) continue;
      covered.add(coord);
      originByCovered.set(coord, origin);
    }
  }
  return { spans, covered, originByCovered };
}

export interface GridMergeCellRole {
  readonly role: 'origin' | 'covered' | 'none';
  readonly span?: GridMergeSpan;
  /** For a covered cell: the origin that renders across it. */
  readonly origin?: string;
}

export function resolveGridMergeCell(index: GridMergeIndex, coord: string): GridMergeCellRole {
  const normalized = coord.toUpperCase();
  const span = index.spans.get(normalized);
  if (span) return { role: 'origin', span };
  const origin = index.originByCovered.get(normalized);
  if (origin) return { role: 'covered', span: index.spans.get(origin), origin };
  return { role: 'none' };
}

function rangesOverlap(a: ReturnType<typeof parseGridRange>, b: ReturnType<typeof parseGridRange>): boolean {
  if (!a || !b) return false;
  return a.startCol <= b.endCol && b.startCol <= a.endCol && a.startRow <= b.endRow && b.startRow <= a.endRow;
}

function isNonEmpty(cell: GridCell | undefined): boolean {
  if (!cell) return false;
  if (cell.formula) return true;
  return cell.value !== '' && cell.value !== null && cell.value !== undefined;
}

export type GridMergePlan =
  | {
      readonly kind: 'merged';
      readonly range: string;
      readonly mergedCells: string[];
      readonly updatedCells: Record<string, GridCell>;
      readonly primaryCoord: string;
      readonly dataLossCoords: string[];
    }
  | { readonly kind: 'rejected'; readonly reason: string };

export function planGridMerge(
  cells: Readonly<Record<string, GridCell>>,
  mergedCells: readonly string[] | undefined,
  range: string,
): GridMergePlan {
  const normalized = range.toUpperCase().trim();
  const bounds = parseGridRange(normalized);
  if (!bounds) return { kind: 'rejected', reason: `„${range}“ ist kein gültiger Verbundbereich.` };
  if (bounds.startCol === bounds.endCol && bounds.startRow === bounds.endRow) {
    return { kind: 'rejected', reason: 'Für das Verbinden von Zellen müssen mindestens zwei Zellen markiert sein.' };
  }

  const existing = mergedCells ?? [];
  // Canonical, order independent range text: B2:A1 and A1:B2 persist identically.
  const canonicalRange = `${toA1(bounds.startCol, bounds.startRow)}:${toA1(bounds.endCol, bounds.endRow)}`;
  for (const candidate of existing) {
    if (candidate.toUpperCase() === canonicalRange) {
      return { kind: 'rejected', reason: `${canonicalRange} ist bereits verbunden.` };
    }
    const candidateBounds = parseGridRange(candidate);
    if (rangesOverlap(bounds, candidateBounds)) {
      return { kind: 'rejected', reason: `Der Bereich überschneidet sich mit dem bestehenden Verbund ${candidate}.` };
    }
  }

  const { updatedCells, primaryCoord } = mergeGridCells({ ...cells }, canonicalRange);
  const dataLossCoords = gridRangeCoordinates(canonicalRange)
    .filter((coord) => coord !== primaryCoord && isNonEmpty(cells[coord]))
    .sort();

  return {
    kind: 'merged',
    range: canonicalRange,
    mergedCells: [...existing.filter((candidate) => candidate.toUpperCase() !== canonicalRange), canonicalRange].sort(),
    updatedCells,
    primaryCoord,
    dataLossCoords,
  };
}

export type GridUnmergePlan =
  | { readonly kind: 'unmerged'; readonly mergedCells: string[]; readonly updatedCells: Record<string, GridCell> }
  | { readonly kind: 'rejected'; readonly reason: string };

export function planGridUnmerge(
  cells: Readonly<Record<string, GridCell>>,
  mergedCells: readonly string[] | undefined,
  range: string,
): GridUnmergePlan {
  const normalized = range.toUpperCase().trim();
  const bounds = parseGridRange(normalized);
  if (!bounds) return { kind: 'rejected', reason: `„${range}“ ist kein gültiger Verbundbereich.` };

  const affected = (mergedCells ?? []).filter((candidate) => rangesOverlap(bounds, parseGridRange(candidate)));
  if (affected.length === 0) {
    return { kind: 'rejected', reason: `Im Bereich ${normalized} gibt es keinen Verbund zum Trennen.` };
  }

  let updatedCells: Record<string, GridCell> = { ...cells };
  for (const candidate of affected) updatedCells = unmergeGridCells(updatedCells, candidate);
  return {
    kind: 'unmerged',
    mergedCells: (mergedCells ?? []).filter((candidate) => !affected.includes(candidate)),
    updatedCells,
  };
}
