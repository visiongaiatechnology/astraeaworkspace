// STATUS: DIAMANT VGT SUPREME
// Deterministic circular-reference detection with explicit cycle reporting.
//
// The dependency scheduler already knew *that* some cells were cyclic, but it could
// not tell the user *which* path closed the loop. This module answers that question
// with a bounded, iterative depth-first search, so even a 50 000-node formula graph
// cannot exhaust the JavaScript stack or hang a render.

import type { GridCell } from '../../../shared/contracts/workspace';
import {
  GRID_FORMULA_LIMITS,
  isGridFormulaLimitError,
  type GridFormulaLimits,
} from './gridFormulaLimits';
import { extractReferencesFromFormula } from './gridFormulaReferences';
import type { GridFormulaDiagnostic } from './gridFormulaDiagnostics';

export interface GridFormulaCycle {
  /** Nodes in traversal order. A self reference yields a single-entry path. */
  readonly path: readonly string[];
  /** Edge that closes the loop: the last path element points back to the first. */
  readonly closedBy: string;
}

export interface DetectGridFormulaCyclesOptions {
  readonly limits?: GridFormulaLimits;
  /** Restricts detection to these coordinates (already upper-cased). */
  readonly include?: (coord: string) => boolean;
  /** Reference extractor override, used by tests to pin the oracle. */
  readonly extractReferences?: (formula: string) => readonly string[];
}

export interface GridFormulaCycleReport {
  readonly cycles: readonly GridFormulaCycle[];
  /** Every coordinating node that participates in or depends on a cycle. */
  readonly cyclic: readonly string[];
  readonly nodeCount: number;
  readonly truncated: boolean;
}

function canonicalizeCycle(path: readonly string[]): GridFormulaCycle {
  let pivot = 0;
  for (let index = 1; index < path.length; index++) {
    if (path[index] < path[pivot]) pivot = index;
  }
  const rotated = [...path.slice(pivot), ...path.slice(0, pivot)];
  return { path: Object.freeze(rotated), closedBy: rotated[0] };
}

function cycleKey(path: readonly string[]): string {
  return path.join('>');
}

/**
 * Finds every elementary cycle reachable from the formula graph and reports each
 * cycle once, canonically rotated so the lexicographically smallest coordinate comes
 * first. Deterministic for a given cell map: nodes and edges are visited in sorted
 * order and the traversal is iterative.
 */
export function detectGridFormulaCycles(
  cells: Record<string, GridCell>,
  options: DetectGridFormulaCyclesOptions = {},
): GridFormulaCycleReport {
  const limits = options.limits ?? GRID_FORMULA_LIMITS;
  const extract = options.extractReferences ?? extractReferencesFromFormula;

  const formulaNodes: string[] = [];
  for (const [rawCoord, cell] of Object.entries(cells)) {
    if (!cell?.formula) continue;
    const coord = rawCoord.toUpperCase().replace(/\$/g, '');
    if (options.include && !options.include(coord)) continue;
    formulaNodes.push(coord);
    if (formulaNodes.length > limits.maxDependencyNodes) break;
  }
  formulaNodes.sort();
  const nodeSet = new Set(formulaNodes);

  const adjacency = new Map<string, readonly string[]>();
  for (const coord of formulaNodes) {
    const formula = cells[coord]?.formula;
    if (!formula) {
      adjacency.set(coord, []);
      continue;
    }
    const dependencies = new Set<string>();
    try {
      for (const reference of extract(formula)) {
        const dependency = reference.toUpperCase().replace(/\$/g, '');
        if (nodeSet.has(dependency)) dependencies.add(dependency);
      }
    } catch (error) {
      if (!isGridFormulaLimitError(error)) throw error;
      // A reference budget failure means the formula cannot be part of a resolvable
      // graph; treat it as a leaf rather than aborting the whole detection.
    }
    adjacency.set(coord, [...dependencies].sort());
  }

  const color = new Map<string, 'grey' | 'black'>();
  const path: string[] = [];
  const cycles: GridFormulaCycle[] = [];
  const seenCycles = new Set<string>();
  let truncated = false;

  interface Frame {
    readonly node: string;
    readonly deps: readonly string[];
    next: number;
  }

  for (const root of formulaNodes) {
    if (color.has(root)) continue;
    if (cycles.length >= limits.maxReportedCycles) {
      truncated = true;
      break;
    }
    color.set(root, 'grey');
    path.push(root);
    const stack: Frame[] = [{ node: root, deps: adjacency.get(root) ?? [], next: 0 }];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.next >= frame.deps.length) {
        color.set(frame.node, 'black');
        stack.pop();
        path.pop();
        continue;
      }
      const dependency = frame.deps[frame.next];
      frame.next++;
      const dependencyColor = color.get(dependency);
      if (dependencyColor === 'grey') {
        const start = path.indexOf(dependency);
        if (start >= 0) {
          const cycle = canonicalizeCycle(path.slice(start));
          const key = cycleKey(cycle.path);
          if (!seenCycles.has(key)) {
            seenCycles.add(key);
            cycles.push(cycle);
            if (cycles.length >= limits.maxReportedCycles) {
              truncated = true;
              break;
            }
          }
        }
        continue;
      }
      if (dependencyColor === 'black') continue;
      color.set(dependency, 'grey');
      path.push(dependency);
      stack.push({ node: dependency, deps: adjacency.get(dependency) ?? [], next: 0 });
    }
    if (truncated) break;
  }

  // Everything that reaches a cycle transitively is also blocked from evaluation.
  const cyclicSet = new Set<string>();
  const reverse = new Map<string, Set<string>>();
  for (const [coord, deps] of adjacency) {
    for (const dependency of deps) {
      const dependents = reverse.get(dependency) ?? new Set<string>();
      dependents.add(coord);
      reverse.set(dependency, dependents);
    }
  }
  const queue: string[] = [];
  for (const cycle of cycles) {
    for (const node of cycle.path) {
      if (cyclicSet.has(node)) continue;
      cyclicSet.add(node);
      queue.push(node);
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const dependent of reverse.get(queue[cursor]) ?? []) {
      if (cyclicSet.has(dependent)) continue;
      cyclicSet.add(dependent);
      queue.push(dependent);
    }
  }

  return {
    cycles: Object.freeze(cycles),
    cyclic: Object.freeze([...cyclicSet].sort()),
    nodeCount: formulaNodes.length,
    truncated,
  };
}

/** Human-readable cycle notation: `A1 -> B1 -> C1 -> A1`. */
export function formatGridFormulaCycle(cycle: GridFormulaCycle): string {
  const [first, ...rest] = cycle.path;
  if (first === undefined) return '';
  return [first, ...rest, first].join(' -> ');
}

/**
 * Converts a detected cycle into the same diagnostic shape the raster renders for
 * error values, so cycle reporting needs no separate UI path.
 */
export function createCircularReferenceDiagnostic(
  cycle: GridFormulaCycle,
  coord?: string,
): GridFormulaDiagnostic {
  const path = formatGridFormulaCycle(cycle);
  return {
    kind: 'circular-reference',
    severity: 'error',
    code: '#CIRCULAR!',
    title: 'Zirkulaerer Bezug',
    message: path ? `Der Bezugspfad ${path} schliesst sich selbst.` : 'Ein Bezug schliesst sich selbst.',
    hint: 'Brechen Sie den Zyklus an einer Stelle auf oder aktivieren Sie die iterative Berechnung mit Limit.',
    token: cycle.closedBy,
    ...(coord ? { coord } : {}),
  };
}
