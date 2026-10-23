// STATUS: DIAMANT VGT SUPREME
// Astraea Grid deterministic dependency-batch recalculation scheduler.

import type { GridCell } from '../../../shared/contracts/workspace';
import { extractReferencesFromFormula } from './gridFormulaReferences';
import { detectGridFormulaCycles } from './gridFormulaCycle';
import { clampGridFormulaLimit } from './gridFormulaLimits';

export interface GridRecalcPlan {
  batches: string[][];
  cyclic: string[];
  /**
   * Every detected elementary cycle, canonicalised (smallest coordinate first) so the
   * UI can explain *which* path closes the loop instead of only that one exists.
   */
  cyclePaths: string[][];
}

export interface GridRecalcResult {
  cells: Record<string, GridCell>;
  cyclic: string[];
  evaluated: string[];
}

const MAX_FORMULA_NODES = 50_000;
const MAX_PARALLEL = 32;

export function buildDeterministicRecalcPlan(
  cells: Record<string, GridCell>,
  shouldInclude: (coord: string) => boolean = () => true
): GridRecalcPlan {
  const formulaCoords = Object.keys(cells)
    .filter((coord) => !!cells[coord]?.formula && shouldInclude(coord))
    .map((coord) => coord.toUpperCase())
    .sort();
  if (formulaCoords.length > MAX_FORMULA_NODES) {
    return { batches: [], cyclic: formulaCoords, cyclePaths: [] };
  }

  const formulaSet = new Set(formulaCoords);
  const indegree = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();
  for (const coord of formulaCoords) indegree.set(coord, 0);

  for (const coord of formulaCoords) {
    const formula = cells[coord]?.formula;
    if (!formula) continue;
    for (const dependency of extractReferencesFromFormula(formula)) {
      const dep = dependency.toUpperCase();
      if (!formulaSet.has(dep) || dep === coord) {
        if (dep === coord) indegree.set(coord, (indegree.get(coord) ?? 0) + 1);
        continue;
      }
      const targets = dependents.get(dep) ?? new Set<string>();
      if (!targets.has(coord)) {
        targets.add(coord);
        dependents.set(dep, targets);
        indegree.set(coord, (indegree.get(coord) ?? 0) + 1);
      }
    }
  }

  const batches: string[][] = [];
  let ready = formulaCoords.filter((coord) => (indegree.get(coord) ?? 0) === 0).sort();
  const processed = new Set<string>();
  while (ready.length) {
    const batch = ready;
    batches.push(batch);
    ready = [];
    for (const coord of batch) {
      processed.add(coord);
      for (const dependent of Array.from(dependents.get(coord) ?? []).sort()) {
        const next = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, next);
        if (next === 0) ready.push(dependent);
      }
    }
    ready.sort();
  }

  const cyclic = formulaCoords.filter((coord) => !processed.has(coord)).sort();
  const cyclePaths = cyclic.length
    ? detectGridFormulaCycles(cells, { include: shouldInclude }).cycles.map((cycle) => [...cycle.path])
    : [];
  return { batches, cyclic, cyclePaths };
}


export function collectDirtyFormulaCells(
  changedCoords: string[],
  cells: Record<string, GridCell>,
  maxNodes = MAX_FORMULA_NODES
): Set<string> {
  const dirty = new Set<string>();
  const queue = changedCoords.map((coord) => coord.toUpperCase());
  const seen = new Set(queue);
  const formulaEntries = Object.entries(cells).filter(([, cell]) => !!cell.formula);
  const dependentsByReference = new Map<string, Set<string>>();
  for (const [rawCoord, cell] of formulaEntries) {
    const coord = rawCoord.toUpperCase();
    for (const reference of extractReferencesFromFormula(cell.formula!)) {
      const dependency = reference.toUpperCase();
      const dependents = dependentsByReference.get(dependency) ?? new Set<string>();
      dependents.add(coord);
      dependentsByReference.set(dependency, dependents);
    }
  }

  const limit = Math.max(1, Math.min(MAX_FORMULA_NODES, maxNodes));
  for (let cursor = 0; cursor < queue.length && dirty.size < limit; cursor++) {
    const changed = queue[cursor];
    for (const dependent of dependentsByReference.get(changed) ?? []) {
      if (seen.has(dependent)) continue;
      seen.add(dependent);
      dirty.add(dependent);
      queue.push(dependent);
      if (dirty.size >= limit) break;
    }
  }
  return dirty;
}

export async function recalculateGridDeterministically(
  cells: Record<string, GridCell>,
  evaluator: (coord: string, formula: string, snapshot: Record<string, GridCell>) => Promise<GridCell['value']>,
  shouldInclude: (coord: string) => boolean = () => true,
  maxParallel = 8
): Promise<GridRecalcResult> {
  const plan = buildDeterministicRecalcPlan(cells, shouldInclude);
  const updated = Object.fromEntries(Object.entries(cells).map(([coord, cell]) => [coord, { ...cell }]));
  const evaluated: string[] = [];
  // Clamped so a caller cannot request unbounded parallel evaluation.
  const concurrency = clampGridFormulaLimit(Math.floor(maxParallel), 8, MAX_PARALLEL);

  for (const batch of plan.batches) {
    for (let offset = 0; offset < batch.length; offset += concurrency) {
      const chunk = batch.slice(offset, offset + concurrency);
      const snapshot = updated;
      const results = await Promise.all(chunk.map(async (coord) => {
        const formula = snapshot[coord]?.formula;
        if (!formula) return { coord, value: snapshot[coord]?.value ?? '' };
        const value = await evaluator(coord, formula, snapshot);
        return { coord, value };
      }));
      for (const result of results.sort((a, b) => a.coord.localeCompare(b.coord))) {
        updated[result.coord] = { ...updated[result.coord], value: result.value };
        evaluated.push(result.coord);
      }
    }
  }

  return { cells: updated, cyclic: plan.cyclic, evaluated };
}
