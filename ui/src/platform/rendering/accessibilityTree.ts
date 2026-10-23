// STATUS: DIAMANT VGT SUPREME — shared bounded accessibility-tree projection
import type { RenderAccessibilityNode } from './renderTypes';

const MAX_ACCESSIBILITY_NODES = 20_000;

function countNodes(node: RenderAccessibilityNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0);
}

export function validateAccessibilityTree(root: RenderAccessibilityNode): RenderAccessibilityNode {
  if (!root.id || !root.role) throw new Error('render_accessibility_root_invalid');
  const total = countNodes(root);
  if (total > MAX_ACCESSIBILITY_NODES) throw new Error('render_accessibility_node_limit');
  const ids = new Set<string>();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (!node.id || node.id.length > 256 || ids.has(node.id)) throw new Error('render_accessibility_node_invalid');
    ids.add(node.id);
    for (const child of node.children ?? []) stack.push(child);
  }
  return root;
}

export interface GridAccessibilityCell {
  id: string;
  rowIndex: number;
  columnIndex: number;
  text: string;
  selected?: boolean;
}

export function buildGridAccessibilityTree(
  id: string,
  name: string,
  rowCount: number,
  columnCount: number,
  cells: readonly GridAccessibilityCell[],
): RenderAccessibilityNode {
  const rows = new Map<number, RenderAccessibilityNode[]>();
  for (const cell of cells.slice(0, MAX_ACCESSIBILITY_NODES - 1)) {
    const row = rows.get(cell.rowIndex) ?? [];
    row.push({ id: cell.id, role: 'gridcell', name: cell.text || 'Empty', rowIndex: cell.rowIndex + 1, columnIndex: cell.columnIndex + 1, selected: cell.selected });
    rows.set(cell.rowIndex, row);
  }
  const children = [...rows.entries()].sort(([a], [b]) => a - b).map(([rowIndex, rowCells]) => ({
    id: `${id}:row:${rowIndex}`,
    role: 'row',
    rowIndex: rowIndex + 1,
    children: rowCells.sort((a, b) => (a.columnIndex ?? 0) - (b.columnIndex ?? 0)),
  }));
  return validateAccessibilityTree({ id, role: 'grid', name, description: `${rowCount} rows by ${columnCount} columns`, children });
}
