// STATUS: DIAMANT VGT SUPREME
// Bounded dynamic-array spill planning and spill provenance.
//
// `applySpill` used to compute target coordinates with `toA1`, which *throws* for
// coordinates outside the raster. A dynamic array at the right or bottom edge of the
// sheet therefore escaped the engine as an uncaught exception instead of the `#SPILL!`
// the user expects. This planner validates the footprint first, never throws, and
// additionally tracks which cells a spill owns so stale spill output can be cleared
// when the array shrinks.

import {
  type FormulaArray,
  type FormulaError,
  type FormulaValue,
  type SingleFormulaValue,
  isFormulaArray,
  isFlatVector,
  normalizeToArray2D,
} from './gridFormulaTypes';
import { GRID_FORMULA_LIMITS, type GridFormulaLimits } from './gridFormulaLimits';
import { parseCoord } from '../compat/gridUtils';
import type { GridCell } from '../../../shared/contracts/workspace';

export const GRID_MAX_COLUMNS = 16_384;
export const GRID_MAX_ROWS = 1_048_576;

export type GridFormulaSpillKind = 'scalar' | 'spill' | 'blocked' | 'out-of-bounds' | 'too-large';

export interface GridFormulaSpillPlan {
  readonly originCoord: string;
  readonly kind: GridFormulaSpillKind;
  /** Value written into the origin cell (the error for non-spill outcomes). */
  readonly value: SingleFormulaValue;
  /** Cells the spill writes, excluding the origin. */
  readonly spilled: Readonly<Record<string, SingleFormulaValue>>;
  readonly error: FormulaError | null;
  /** Cells that blocked the spill, sorted; empty unless `kind === 'blocked'`. */
  readonly blockedBy: readonly string[];
  /** Intended footprint including the origin, sorted; empty when out of bounds. */
  readonly footprint: readonly string[];
}

export function columnName(colIdx: number): string {
  let cursor = colIdx + 1;
  let result = '';
  while (cursor > 0) {
    const remainder = (cursor - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    cursor = Math.floor((cursor - 1) / 26);
  }
  return result;
}

function isOccupied(cell: GridCell | undefined): boolean {
  if (!cell) return false;
  if (cell.formula) return true;
  const value = cell.value;
  return value !== undefined && value !== null && value !== '';
}

export interface GridFormulaSpillPlanOptions {
  readonly limits?: GridFormulaLimits;
  /** Cells currently owned by another spill; treated as occupied. */
  readonly occupiedBySpill?: ReadonlySet<string>;
}

/**
 * Plans the spill for a dynamic-array result without mutating anything and without
 * ever throwing for out-of-raster footprints. Precedence of outcomes follows Excel:
 * bounds/size problems are reported before collision checks so a hostile array cannot
 * trigger a full collision scan first.
 */
export function planGridFormulaSpill(
  originCoord: string,
  formulaValue: FormulaValue,
  cells: Readonly<Record<string, GridCell>>,
  options: GridFormulaSpillPlanOptions = {},
): GridFormulaSpillPlan {
  const limits = options.limits ?? GRID_FORMULA_LIMITS;
  const origin = originCoord.toUpperCase().replace(/\$/g, '');

  // Runde 244: Ein **flacher** Vektor ist kein Skalar. Bis Runde 243 fiel er in den
  // Skalar-Zweig, weil `isFormulaArray` bei `val[0]` eine Zahl sieht — und wurde als
  // `kind:'scalar'` mit dem **ganzen Vektor in einer Zelle** geplant. Genau das verbietet
  // `DECISION_FLAT_VECTOR_IN_SCALAR_POSITION.md`: *„ein flacher Vektor ist kein
  // `kind:'scalar'`. Er wird als Vektor geplant, oder die Planung meldet `#VALUE!`.
  // Nicht ein Vektor in einem Zellwert."*
  //
  // Die Entscheidung laesst **zwei** Antworten zu. Hier wird die erste gewaehlt: als
  // Vektor planen. Und zwar ueber **dieselbe** Regel, die auch `toFormulaArray` benutzt —
  // `normalizeToArray2D`, ein Element pro Zeile. Damit entsteht keine dritte Antwort.
  //
  // **Drei Zweige, nicht zwei.** `isFlatVector(x) ? A : B` genuegt nicht: die Verneinung
  // von „flacher Vektor" ist **nicht** „FormulaArray", sondern „Skalar **oder** Array".
  // Der Compiler hat genau das beanstandet (TS2322 zweimal).
  let matrix: FormulaArray;
  if (isFlatVector(formulaValue)) {
    matrix = normalizeToArray2D(formulaValue);
  } else if (isFormulaArray(formulaValue)) {
    matrix = formulaValue;
  } else {
    return {
      originCoord: origin,
      kind: 'scalar',
      value: formulaValue,
      spilled: {},
      error: null,
      blockedBy: [],
      footprint: [origin],
    };
  }

  const rows = matrix.length;
  const cols = rows > 0 ? matrix[0].length : 0;

  if (rows <= 1 && cols <= 1) {
    const only = rows === 1 && cols === 1 ? matrix[0][0] : null;
    return {
      originCoord: origin,
      kind: 'scalar',
      value: only,
      spilled: {},
      error: null,
      blockedBy: [],
      footprint: [origin],
    };
  }

  const targetCount = rows * cols - 1;
  if (targetCount > limits.maxSpillCells) {
    return {
      originCoord: origin,
      kind: 'too-large',
      value: '#SPILL!',
      spilled: {},
      error: '#SPILL!',
      blockedBy: [],
      footprint: [],
    };
  }

  const { colIdx, rowIdx } = parseCoord(origin);
  if (colIdx < 0 || rowIdx < 0 || colIdx + cols > GRID_MAX_COLUMNS || rowIdx + rows > GRID_MAX_ROWS) {
    return {
      originCoord: origin,
      kind: 'out-of-bounds',
      value: '#SPILL!',
      spilled: {},
      error: '#SPILL!',
      blockedBy: [],
      footprint: [],
    };
  }

  const blockedBy: string[] = [];
  const planted: Array<{ coord: string; value: SingleFormulaValue }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue;
      const coord = `${columnName(colIdx + c)}${rowIdx + r + 1}`;
      if (options.occupiedBySpill?.has(coord) || isOccupied(cells[coord])) {
        blockedBy.push(coord);
        continue;
      }
      planted.push({ coord, value: matrix[r][c] });
    }
  }

  if (blockedBy.length > 0) {
    blockedBy.sort();
    return {
      originCoord: origin,
      kind: 'blocked',
      value: '#SPILL!',
      spilled: {},
      error: '#SPILL!',
      blockedBy,
      footprint: [],
    };
  }

  const spilled: Record<string, SingleFormulaValue> = {};
  const footprint: string[] = [origin];
  for (const entry of planted) {
    spilled[entry.coord] = entry.value;
    footprint.push(entry.coord);
  }
  footprint.sort();

  return {
    originCoord: origin,
    kind: 'spill',
    value: matrix[0][0],
    spilled,
    error: null,
    blockedBy: [],
    footprint,
  };
}

export interface GridFormulaSpillProvenance {
  /** Origin cell that owns the spill. */
  readonly owner: string;
  /** Cells written by the spill, excluding the owner. */
  readonly cells: readonly string[];
}

/**
 * Cells that were spilled by a previous calculation and are not claimed by any
 * current spill. They must be cleared, otherwise a shrinking dynamic array leaves
 * ghost values behind.
 */
export function diffSpillProvenance(
  previous: readonly GridFormulaSpillProvenance[],
  next: readonly GridFormulaSpillProvenance[],
): readonly string[] {
  const claimed = new Set<string>();
  for (const provenance of next) for (const cell of provenance.cells) claimed.add(cell);
  const stale = new Set<string>();
  for (const provenance of previous) {
    for (const cell of provenance.cells) {
      if (!claimed.has(cell)) stale.add(cell);
    }
  }
  return Object.freeze([...stale].sort());
}

/** Provenance list built from one planning pass. */
export function provenanceFromPlans(
  plans: readonly GridFormulaSpillPlan[],
): readonly GridFormulaSpillProvenance[] {
  const result: GridFormulaSpillProvenance[] = [];
  for (const plan of plans) {
    if (plan.kind !== 'spill') continue;
    result.push({ owner: plan.originCoord, cells: Object.freeze(Object.keys(plan.spilled).sort()) });
  }
  return Object.freeze(result);
}

/** Cells owned by a spill, mapped to their owner. */
export function spillOwnershipIndex(
  provenance: readonly GridFormulaSpillProvenance[],
): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const entry of provenance) {
    for (const cell of entry.cells) index.set(cell, entry.owner);
  }
  return index;
}
