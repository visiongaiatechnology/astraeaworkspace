// STATUS: DIAMANT VGT SUPREME
// Canonical resource budget for every TypeScript formula path.
//
// The authoritative evaluator is the Rust Formula Core
// (`open-core/crates/vgt-formula/src/limits.rs`, `FormulaLimits::DEFAULT`). This
// module mirrors those numbers so the UI-side reference engine, the dependency
// scheduler, spill planning, cycle detection and the function assistant can never
// perform unbounded work on user input. Nothing here reads a clock unless a clock
// is injected, so budget exhaustion is deterministic and testable.

import type { FormulaError } from './gridFormulaTypes';

export interface GridFormulaLimits {
  /** Maximum formula text length in UTF-16 code units. Mirrors Rust `max_formula_bytes`. */
  readonly maxFormulaLength: number;
  /** Maximum reference cells a single range argument may span. */
  readonly maxReferenceCells: number;
  /** Maximum cells a single dynamic array result may occupy. */
  readonly maxArrayCells: number;
  /** Maximum cells a single spill footprint may occupy (excluding the origin). */
  readonly maxSpillCells: number;
  /** Maximum evaluation steps (function calls, cell resolutions, range cells). */
  readonly maxEvaluationSteps: number;
  /** Maximum evaluation wall time in milliseconds when a clock is injected. */
  readonly maxEvaluationTimeMs: number;
  /** Maximum nested expression/function recursion depth inside one formula. */
  readonly maxRecursionDepth: number;
  /**
   * Maximum cell-to-cell hop depth. Long dependent chains (a running balance down many
   * rows) are legitimate, so this is far higher than the expression nesting limit.
   */
  readonly maxCellChainDepth: number;
  /** Maximum iterative-calculation rounds for circular models. */
  readonly maxIterations: number;
  /** Maximum cells inspected while building the dependency graph. */
  readonly maxDependencyNodes: number;
  /** Maximum cycles reported at once. */
  readonly maxReportedCycles: number;
  /** Maximum days a single WORKDAY/NETWORKDAYS walk may traverse. */
  readonly maxDateSpanDays: number;
}

/**
 * Mirrors `FormulaLimits::DEFAULT` in the Rust core. Keep both in sync: the UI must
 * not accept work the native core would reject, and must reject work natively
 * bounded for the same reasons.
 */
export const GRID_FORMULA_LIMITS: GridFormulaLimits = Object.freeze({
  maxFormulaLength: 16 * 1024,
  maxReferenceCells: 50_000,
  maxArrayCells: 50_000,
  maxSpillCells: 50_000,
  maxEvaluationSteps: 250_000,
  maxEvaluationTimeMs: 250,
  maxRecursionDepth: 128,
  maxCellChainDepth: 10_000,
  maxIterations: 1_000,
  maxDependencyNodes: 50_000,
  maxReportedCycles: 64,
  maxDateSpanDays: 4_000_000,
});

export type GridFormulaLimitKind =
  | 'formula-length'
  | 'reference-cells'
  | 'array-cells'
  | 'spill-cells'
  | 'evaluation-steps'
  | 'evaluation-time'
  | 'recursion-depth'
  | 'cell-chain-depth'
  | 'iterations'
  | 'dependency-nodes';

/**
 * Typed spreadsheet error produced when a canonical budget is exhausted. Internal
 * exceptions never reach the cell: callers translate this into a `FormulaError`.
 */
export class GridFormulaLimitError extends Error {
  readonly kind: GridFormulaLimitKind;
  readonly limit: number;
  readonly observed: number;

  constructor(kind: GridFormulaLimitKind, limit: number, observed: number) {
    super(`grid_formula_limit:${kind}`);
    this.name = 'GridFormulaLimitError';
    this.kind = kind;
    this.limit = limit;
    this.observed = observed;
  }
}

/**
 * Spreadsheet error code for an exhausted budget. Exhaustive over the kind union so
 * a new limit kind cannot silently fall through to an untested code.
 */
export function formulaErrorForLimit(kind: GridFormulaLimitKind): FormulaError {
  switch (kind) {
    case 'reference-cells':
    case 'dependency-nodes':
      return '#REF!';
    case 'array-cells':
    case 'spill-cells':
      return '#SPILL!';
    case 'iterations':
      return '#CIRCULAR!';
    case 'recursion-depth':
    case 'cell-chain-depth':
      return '#CALC!';
    case 'evaluation-steps':
    case 'evaluation-time':
    case 'formula-length':
      return '#CALC!';
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function isGridFormulaLimitError(value: unknown): value is GridFormulaLimitError {
  return value instanceof GridFormulaLimitError;
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const truncated = Math.trunc(value);
  return truncated > 0 ? truncated : fallback;
}

/** Clamps an untrusted numeric option (iteration caps, cell budgets) into a safe range. */
export function clampGridFormulaLimit(value: number | undefined, fallback: number, ceiling: number): number {
  const resolved = positiveInt(value, fallback);
  return Math.min(resolved, ceiling);
}

export interface GridFormulaBudgetOptions {
  /** Partial overrides. Values are clamped to the canonical ceilings. */
  readonly limits?: Partial<GridFormulaLimits>;
  /** Injected monotonic clock in milliseconds. Omit for a step-only budget. */
  readonly now?: () => number;
}

export interface GridFormulaBudget {
  readonly limits: GridFormulaLimits;
  /** Consumes `count` steps, throwing `GridFormulaLimitError` when exhausted. */
  spend(count?: number): void;
  /** Consumes one recursion level, throwing when `maxRecursionDepth` is exceeded. */
  enterDepth(depth: number): void;
  /** Consumes one cell hop, throwing when `maxCellChainDepth` is exceeded. */
  enterCellDepth(depth: number): void;
  /** Remaining steps; useful for tests and diagnostics. */
  remaining(): number;
  readonly steps: number;
}

export function createGridFormulaBudget(options: GridFormulaBudgetOptions = {}): GridFormulaBudget {
  const overrides = options.limits ?? {};
  const limits: GridFormulaLimits = Object.freeze({
    maxFormulaLength: clampGridFormulaLimit(overrides.maxFormulaLength, GRID_FORMULA_LIMITS.maxFormulaLength, GRID_FORMULA_LIMITS.maxFormulaLength * 4),
    maxReferenceCells: clampGridFormulaLimit(overrides.maxReferenceCells, GRID_FORMULA_LIMITS.maxReferenceCells, GRID_FORMULA_LIMITS.maxReferenceCells * 20),
    maxArrayCells: clampGridFormulaLimit(overrides.maxArrayCells, GRID_FORMULA_LIMITS.maxArrayCells, GRID_FORMULA_LIMITS.maxArrayCells * 20),
    maxSpillCells: clampGridFormulaLimit(overrides.maxSpillCells, GRID_FORMULA_LIMITS.maxSpillCells, GRID_FORMULA_LIMITS.maxSpillCells * 20),
    maxEvaluationSteps: clampGridFormulaLimit(overrides.maxEvaluationSteps, GRID_FORMULA_LIMITS.maxEvaluationSteps, GRID_FORMULA_LIMITS.maxEvaluationSteps * 20),
    maxEvaluationTimeMs: clampGridFormulaLimit(overrides.maxEvaluationTimeMs, GRID_FORMULA_LIMITS.maxEvaluationTimeMs, 5_000),
    maxRecursionDepth: clampGridFormulaLimit(overrides.maxRecursionDepth, GRID_FORMULA_LIMITS.maxRecursionDepth, 512),
    maxCellChainDepth: clampGridFormulaLimit(overrides.maxCellChainDepth, GRID_FORMULA_LIMITS.maxCellChainDepth, 50_000),
    maxIterations: clampGridFormulaLimit(overrides.maxIterations, GRID_FORMULA_LIMITS.maxIterations, 10_000),
    maxDependencyNodes: clampGridFormulaLimit(overrides.maxDependencyNodes, GRID_FORMULA_LIMITS.maxDependencyNodes, GRID_FORMULA_LIMITS.maxDependencyNodes * 20),
    maxReportedCycles: clampGridFormulaLimit(overrides.maxReportedCycles, GRID_FORMULA_LIMITS.maxReportedCycles, 1_024),
    maxDateSpanDays: clampGridFormulaLimit(overrides.maxDateSpanDays, GRID_FORMULA_LIMITS.maxDateSpanDays, GRID_FORMULA_LIMITS.maxDateSpanDays),
  });

  const now = options.now;
  const startedAt = now ? now() : 0;
  let steps = 0;

  return {
    limits,
    get steps() {
      return steps;
    },
    spend(count = 1) {
      steps += count;
      if (steps > limits.maxEvaluationSteps) {
        throw new GridFormulaLimitError('evaluation-steps', limits.maxEvaluationSteps, steps);
      }
      if (now && now() - startedAt > limits.maxEvaluationTimeMs) {
        throw new GridFormulaLimitError('evaluation-time', limits.maxEvaluationTimeMs, now() - startedAt);
      }
    },
    enterDepth(depth: number) {
      if (depth > limits.maxRecursionDepth) {
        throw new GridFormulaLimitError('recursion-depth', limits.maxRecursionDepth, depth);
      }
    },
    enterCellDepth(depth: number) {
      if (depth > limits.maxCellChainDepth) {
        throw new GridFormulaLimitError('cell-chain-depth', limits.maxCellChainDepth, depth);
      }
    },
    remaining() {
      return Math.max(0, limits.maxEvaluationSteps - steps);
    },
  };
}

/**
 * Deterministic guard used before expanding a rectangular reference. Avoids building
 * multi-million element arrays for `=SUM(A1:A1048576)`-style input.
 */
export function assertReferenceCellBudget(
  cells: number,
  limits: GridFormulaLimits = GRID_FORMULA_LIMITS,
): void {
  if (!Number.isFinite(cells) || cells < 0) {
    throw new GridFormulaLimitError('reference-cells', limits.maxReferenceCells, 0);
  }
  if (cells > limits.maxReferenceCells) {
    throw new GridFormulaLimitError('reference-cells', limits.maxReferenceCells, cells);
  }
}

export function assertArrayCellBudget(
  cells: number,
  limits: GridFormulaLimits = GRID_FORMULA_LIMITS,
): void {
  if (!Number.isFinite(cells) || cells < 0 || cells > limits.maxArrayCells) {
    throw new GridFormulaLimitError('array-cells', limits.maxArrayCells, cells);
  }
}
