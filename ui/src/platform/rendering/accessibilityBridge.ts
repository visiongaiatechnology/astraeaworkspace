// STATUS: DIAMANT VGT SUPREME — semantic accessibility bridge independent from canvas/GPU rasterization
import type { RenderAccessibilityNode } from './renderTypes';
import type { CanonicalRenderTree } from './renderPipeline';
import { validateAccessibilityTree } from './accessibilityTree';

export interface RenderTextSelectionState {
  objectId: string;
  start: number;
  end: number;
  caret: number;
}

export interface RenderKeyboardTarget {
  id: string;
  readingOrder: number;
  label: string;
}

export interface AccessibilityProjection {
  root: RenderAccessibilityNode;
  keyboardOrder: RenderKeyboardTarget[];
  selection?: RenderTextSelectionState;
}

function boundedTextRange(selection: RenderTextSelectionState): RenderTextSelectionState {
  if (!selection.objectId || selection.objectId.length > 256) throw new Error('render_a11y_selection_object_invalid');
  for (const value of [selection.start, selection.end, selection.caret]) if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) throw new Error('render_a11y_selection_range_invalid');
  if (selection.end < selection.start || selection.caret < selection.start || selection.caret > selection.end) throw new Error('render_a11y_selection_order_invalid');
  return selection;
}

export function buildRenderAccessibilityProjection(tree: CanonicalRenderTree, selection?: RenderTextSelectionState): AccessibilityProjection {
  if (tree.pages.length > 100_000) throw new Error('render_a11y_page_limit');
  const children: RenderAccessibilityNode[] = [];
  const keyboardOrder: RenderKeyboardTarget[] = [];
  let order = 0;
  for (const page of tree.pages) {
    const pageChildren: RenderAccessibilityNode[] = [];
    if (page.accessibility) {
      const validated = validateAccessibilityTree(page.accessibility);
      const stack = [validated];
      while (stack.length) {
        const node = stack.pop()!;
        const readingOrder = Number.isInteger(node.readingOrder) ? node.readingOrder! : order++;
        node.readingOrder = readingOrder;
        if (node.keyboardFocusable) keyboardOrder.push({ id: node.id, readingOrder, label: node.name ?? node.role });
        for (const child of [...(node.children ?? [])].reverse()) stack.push(child);
      }
      pageChildren.push(validated);
    } else {
      for (const primitive of page.primitives) {
        const id = primitive.sourceId ?? `${page.id}:primitive:${pageChildren.length}`;
        const role = primitive.kind === 'text' ? 'text' : primitive.kind === 'image' ? 'img' : 'graphics-symbol';
        const node: RenderAccessibilityNode = { id, role, name: primitive.kind === 'text' ? primitive.text ?? '' : primitive.sourceId ?? primitive.kind, readingOrder: order++ };
        if (primitive.kind === 'text') node.textRange = { start: 0, end: (primitive.text ?? '').length };
        pageChildren.push(node);
      }
    }
    children.push({ id: `${page.id}:semantic`, role: 'document', name: `Page ${children.length + 1}`, readingOrder: order++, children: pageChildren });
  }
  const root = validateAccessibilityTree({ id: `${tree.documentId}:semantic-root`, role: 'document', name: 'Document', children });
  const normalizedSelection = selection ? boundedTextRange(selection) : undefined;
  if (normalizedSelection) {
    const stack = [root]; let found = false;
    while (stack.length) { const node = stack.pop()!; if (node.id === normalizedSelection.objectId) { node.textRange = { start: normalizedSelection.start, end: normalizedSelection.end, caret: normalizedSelection.caret }; found = true; break; } for (const child of node.children ?? []) stack.push(child); }
    if (!found) throw new Error('render_a11y_selection_target_missing');
  }
  keyboardOrder.sort((a, b) => a.readingOrder - b.readingOrder || a.id.localeCompare(b.id));
  return { root, keyboardOrder, selection: normalizedSelection };
}

export function nextKeyboardTarget(projection: AccessibilityProjection, currentId: string | undefined, direction: 1 | -1): RenderKeyboardTarget | undefined {
  const list = projection.keyboardOrder;
  if (!list.length) return undefined;
  const current = currentId ? list.findIndex((item) => item.id === currentId) : -1;
  const index = current < 0 ? (direction > 0 ? 0 : list.length - 1) : (current + direction + list.length) % list.length;
  return list[index];
}
