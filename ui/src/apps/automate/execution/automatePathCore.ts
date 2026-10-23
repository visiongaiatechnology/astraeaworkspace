// STATUS: DIAMANT VGT SUPREME — the traversed path of a flow, derived from evidence rather than assumed.
//
// MEASURED FACTS this module encodes (see BATCH-AUTOMATE/INVENTORY.md, package 9):
//  - `AutomateCanvas` decided whether an edge had been taken with
//    `from.lastExecutionStatus === 'success'` (line 152). A trial can only ever produce `simulated`, so
//    that test was **never true for a trial** — the canvas visualised no path at all, although AST-1726
//    requires "visualisiert aktuellen Pfad".
//  - Two different facts were being conflated there: "this edge is part of the path that was walked" and
//    "the run succeeded". They are now separate, and the path is derived from the run's step order.
//
// Honesty rule this module enforces: what can be shown is the **checked order** of a trial, not a branch
// decision, because nothing executes. `basis` says which of the two it is.
import type { AutomateDocumentModel, FlowConnection, FlowExecutionRun } from '../model/types';

export type PathBasis = 'trial-order' | 'run-steps';

export interface TraversedPath {
  /** Node ids in the order they were walked. Empty when nothing was walked. */
  readonly nodeIds: readonly string[];
  /** Connection ids that lie between two consecutive walked nodes. */
  readonly connectionIds: readonly string[];
  /**
   * What this path is evidence OF.
   * `trial-order` — the node order a trial resolved; no branch was decided, nothing executed.
   * `run-steps`   — the order recorded by a run's step list.
   */
  readonly basis: PathBasis;
  /** True only when a recorded run produced this path. A trial order is never an execution. */
  readonly fromExecutedRun: boolean;
}

const EMPTY: TraversedPath = { nodeIds: [], connectionIds: [], basis: 'trial-order', fromExecutedRun: false };

/**
 * The most recent run of a document, or null.
 * Only runs with at least one step can describe a path.
 */
export function latestInspectableRun(model: Pick<AutomateDocumentModel, 'runs'>): FlowExecutionRun | null {
  if (!Array.isArray(model.runs)) return null;
  return model.runs.find((run) => Array.isArray(run.steps) && run.steps.length > 0) ?? null;
}

/**
 * Derive the traversed path.
 *
 * Precedence: a recorded run's step order wins over the trial preview, because it is direct evidence.
 * When neither exists the path is empty — the canvas must then show no path rather than a guessed one.
 *
 * The connection list is built from the edges that actually join two consecutive walked nodes, so an
 * edge that merely *could* have been taken is never marked as taken.
 */
export function computeTraversedPath(
  model: Pick<AutomateDocumentModel, 'connections' | 'runs' | 'designer'>,
): TraversedPath {
  const run = latestInspectableRun(model);
  if (run) {
    const nodeIds = run.steps.map((step) => step.nodeId);
    return { nodeIds, connectionIds: edgesBetween(model.connections, nodeIds), basis: 'run-steps', fromExecutedRun: true };
  }

  const preview = Array.isArray(model.designer?.previewNodeIds) ? model.designer.previewNodeIds : [];
  if (preview.length === 0) return EMPTY;
  return { nodeIds: [...preview], connectionIds: edgesBetween(model.connections, preview), basis: 'trial-order', fromExecutedRun: false };
}

/**
 * The connection ids joining each consecutive pair of walked nodes.
 *
 * A pair may be joined by more than one edge (two labelled branches between the same nodes); all of them
 * are reported, because the walk order alone cannot say which labelled port was used.
 */
function edgesBetween(connections: readonly FlowConnection[], nodeIds: readonly string[]): string[] {
  const found = new Set<string>();
  for (let index = 0; index + 1 < nodeIds.length; index += 1) {
    const from = nodeIds[index];
    const to = nodeIds[index + 1];
    for (const connection of connections) {
      if (connection.fromNodeId === from && connection.toNodeId === to) found.add(connection.id);
    }
  }
  return [...found];
}

/** Is this node on the traversed path? */
export function isNodeOnPath(path: TraversedPath, nodeId: string): boolean {
  return path.nodeIds.includes(nodeId);
}

/** Is this connection on the traversed path? */
export function isConnectionOnPath(path: TraversedPath, connectionId: string): boolean {
  return path.connectionIds.includes(connectionId);
}

/** Position of a node in the walked order, or -1. Used for the step number text. */
export function pathPosition(path: TraversedPath, nodeId: string): number {
  return path.nodeIds.indexOf(nodeId);
}
