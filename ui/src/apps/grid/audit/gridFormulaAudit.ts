// STATUS: DIAMANT VGT SUPREME
// Bounded formula auditing that uses the canonical Formula Core for actual evaluation.

import type { GridCell } from '../../../shared/contracts/workspace';
import { evaluateFormula } from '../formulas/formula';
import { getDependents, getPrecedents } from '../formulas/gridFormulaReferences';
import type { FormulaEngineOptions } from '../formulas/gridFormulaEngineTypes';

export interface GridFormulaAuditStep {
  kind: 'formula' | 'precedent' | 'result' | 'error';
  coord: string;
  expression?: string;
  value?: GridCell['value'] | null;
  path?: string[];
}

export interface GridFormulaAuditReport {
  coord: string;
  precedents: string[];
  dependents: string[];
  steps: GridFormulaAuditStep[];
  errors: GridFormulaAuditStep[];
}

const MAX_AUDIT_NODES = 2_000;
const MAX_AUDIT_DEPTH = 64;

export async function buildGridFormulaAuditReport(
  coord: string,
  cells: Record<string, GridCell>,
  _options?: FormulaEngineOptions,
): Promise<GridFormulaAuditReport> {
  const root = coord.toUpperCase().replace(/\$/g, '');
  const cell = cells[root];
  const precedents = getPrecedents(root, cells).slice(0, MAX_AUDIT_NODES);
  const dependents = getDependents(root, cells).slice(0, MAX_AUDIT_NODES);
  const steps: GridFormulaAuditStep[] = [];
  const errors: GridFormulaAuditStep[] = [];

  if (cell?.formula) {
    steps.push({ kind: 'formula', coord: root, expression: cell.formula, value: cell.value ?? null });
    for (const precedent of precedents) steps.push({ kind: 'precedent', coord: precedent, expression: cells[precedent]?.formula, value: cells[precedent]?.value ?? null });
    const evaluated = await evaluateFormula(cell.formula, cells, { volatilePolicy: 'disabled', currentCellCoord: root });
    steps.push({ kind: typeof evaluated === 'string' && evaluated.startsWith('#') ? 'error' : 'result', coord: root, expression: cell.formula, value: evaluated ?? null });
  }

  const queue: Array<{ coord: string; path: string[]; depth: number }> = [{ coord: root, path: [root], depth: 0 }];
  const visited = new Set<string>();
  while (queue.length && visited.size < MAX_AUDIT_NODES) {
    const current = queue.shift()!;
    if (visited.has(current.coord) || current.depth > MAX_AUDIT_DEPTH) continue;
    visited.add(current.coord);
    const currentCell = cells[current.coord];
    const value = currentCell?.value;
    if (typeof value === 'string' && value.startsWith('#')) errors.push({ kind:'error', coord:current.coord, expression:currentCell?.formula, value, path:current.path });
    for (const precedent of getPrecedents(current.coord, cells)) if (!visited.has(precedent)) queue.push({ coord:precedent, path:[...current.path, precedent], depth:current.depth + 1 });
  }

  return { coord: root, precedents, dependents, steps, errors };
}
