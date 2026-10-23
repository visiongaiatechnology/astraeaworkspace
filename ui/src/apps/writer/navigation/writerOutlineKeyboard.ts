// STATUS: DIAMANT VGT SUPREME — the outline is a tree, so it must answer like one
//
// W-270, measured: the panel declared `role="tree"` and `role="treeitem"` with `aria-level`, but nothing
// answered the keys a tree promises. A keyboard user reached the outline with `Tab` and could do nothing
// inside it; ARIA described a tree that did not exist. (The honest alternative would have been a list with
// `aria-level` — but the outline's whole purpose is navigation, so the tree is the right structure and is
// now implemented rather than described.)
//
// W-271, measured: a heading could only be moved by **dragging** it. For `vgt-ui-ux-supreme` that is an
// essential function reachable only by pointer. `Alt`+`Arrow` moves it now, using the same reorder the drag
// uses.
//
// The whole decision lives here as a pure function so it can be tested without a DOM: the panel keeps the
// focus and calls `onReorderOutline`, nothing more.
//
// Implemented keys (ARIA tree pattern, permanently expanded — the outline never hides a heading):
//   ArrowDown      next visible item
//   ArrowUp        previous visible item
//   ArrowRight     first child (the next heading one level deeper)
//   ArrowLeft      parent (the nearest previous heading one level higher)
//   Home / End     first / last item
//   Enter / Space  activate the heading (jump to the text)
//   Alt+ArrowUp    move the heading before the previous sibling — the keyboard alternative to dragging
//   Alt+ArrowDown  move the heading after the next sibling's subtree
//
// Not implemented, and named so nobody assumes it: type-ahead (typing a letter to jump) and collapsing.

export interface WriterOutlineKeyboardItem {
  readonly id: string;
  readonly level: number;
}

export type WriterOutlineKeyCommand =
  | { readonly kind: 'focus'; readonly index: number }
  | { readonly kind: 'activate'; readonly index: number }
  | { readonly kind: 'move'; readonly sourceIndex: number; readonly targetIndex: number };

export interface WriterOutlineKeyRequest {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly items: readonly WriterOutlineKeyboardItem[];
  readonly currentIndex: number;
}

/** The first index after the subtree of `index` — the next heading at the same level or higher. */
function subtreeEnd(items: readonly WriterOutlineKeyboardItem[], index: number): number {
  const level = items[index]?.level ?? 0;
  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    if ((items[cursor]?.level ?? 0) <= level) return cursor;
  }
  return items.length;
}

/** The nearest previous heading at the same level or higher: the sibling, or the parent. Used for moving. */
function previousAnchor(items: readonly WriterOutlineKeyboardItem[], index: number): number {
  const level = items[index]?.level ?? 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if ((items[cursor]?.level ?? 0) <= level) return cursor;
  }
  return -1;
}

/**
 * The nearest previous heading that is **strictly** shallower: the parent.
 *
 * This is a different question from `previousAnchor`, and my first version used the same helper for both —
 * which sent `ArrowLeft` from `h1.2` to its sibling `h1.1` instead of to the parent `h1`. The test caught
 * it; the two rules are now separate, as they should be.
 */
function parentIndex(items: readonly WriterOutlineKeyboardItem[], index: number): number {
  const level = items[index]?.level ?? 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if ((items[cursor]?.level ?? 0) < level) return cursor;
  }
  return -1;
}

export function resolveWriterOutlineKeyCommand(request: WriterOutlineKeyRequest): WriterOutlineKeyCommand | null {
  const { items, currentIndex } = request;
  if (items.length === 0) return null;
  const index = Math.min(Math.max(currentIndex, 0), items.length - 1);
  const level = items[index]?.level ?? 1;

  // Moving a heading keeps the drag semantics: `reorder` inserts the block **before** the target, so
  // "down" targets the item after the next sibling's subtree.
  if (request.altKey && (request.key === 'ArrowUp' || request.key === 'ArrowDown')) {
    if (request.key === 'ArrowUp') {
      const target = previousAnchor(items, index);
      return target < 0 ? null : { kind: 'move', sourceIndex: index, targetIndex: target };
    }
    const nextSibling = subtreeEnd(items, index);
    if (nextSibling >= items.length) return null;
    const afterSubtree = subtreeEnd(items, nextSibling);
    return afterSubtree >= items.length ? null : { kind: 'move', sourceIndex: index, targetIndex: afterSubtree };
  }

  switch (request.key) {
    case 'ArrowDown':
      return index + 1 < items.length ? { kind: 'focus', index: index + 1 } : null;
    case 'ArrowUp':
      return index > 0 ? { kind: 'focus', index: index - 1 } : null;
    case 'ArrowRight': {
      // Permanently expanded: the first child is the next item, and only if it is deeper.
      const next = index + 1;
      return next < items.length && (items[next]?.level ?? 0) > level ? { kind: 'focus', index: next } : null;
    }
    case 'ArrowLeft': {
      const target = parentIndex(items, index);
      return target < 0 ? null : { kind: 'focus', index: target };
    }
    case 'Home':
      return index === 0 ? null : { kind: 'focus', index: 0 };
    case 'End':
      return index === items.length - 1 ? null : { kind: 'focus', index: items.length - 1 };
    case 'Enter':
    case ' ':
      return { kind: 'activate', index };
    default:
      return null;
  }
}
