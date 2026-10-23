// STATUS: DIAMANT VGT SUPREME — pure Notes page-tree navigation and bounded re-parenting
//
// AST-0651 acceptance: "Notebook anlegen, Seiten verschieben und per Baum navigieren."
// AST-0746: tree navigation must be reachable with Tab and the arrow keys, not only with the mouse.
// The flat page list is presented as a `tree`, so one pure module owns the visible order, the level of
// every entry and every key decision. The component only applies the returned command.

import { MAX_NOTE_SUBPAGE_DEPTH } from '../model/notesHierarchy';

export interface NoteTreeSourcePage {
  id: string;
  parentPageId?: string | null;
  trashedAt?: number | null;
}

export interface NoteTreeItem {
  pageId: string;
  parentPageId: string | null;
  /** 1-based level as exposed to assistive technology. */
  level: number;
  childIds: string[];
  /** Visually indented depth (0-based). */
  depth: number;
}

/** Keeps a cyclic or over-deep parent chain from producing an unbounded tree. */
export const NOTE_TREE_MAX_LEVEL = MAX_NOTE_SUBPAGE_DEPTH + 1;

/**
 * Builds the visible tree order: section order is preserved, children follow their parent.
 * Rows whose parent is missing or trashed are promoted to the root instead of disappearing.
 */
export function buildNoteTreeItems(pages: readonly NoteTreeSourcePage[]): NoteTreeItem[] {
  const live = pages.filter((page) => !page.trashedAt);
  const byId = new Map(live.map((page) => [page.id, page]));
  const childrenOf = new Map<string | null, string[]>();
  const effectiveParent = new Map<string, string | null>();
  for (const page of live) {
    const rawParent = page.parentPageId ?? null;
    const parent = rawParent && rawParent !== page.id && byId.has(rawParent) ? rawParent : null;
    effectiveParent.set(page.id, parent);
    const bucket = childrenOf.get(parent) ?? [];
    bucket.push(page.id);
    childrenOf.set(parent, bucket);
  }

  const items: NoteTreeItem[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    if (depth > MAX_NOTE_SUBPAGE_DEPTH) return;
    for (const pageId of childrenOf.get(parentId) ?? []) {
      if (visited.has(pageId)) continue;
      visited.add(pageId);
      const childIds = childrenOf.get(pageId) ?? [];
      items.push({ pageId, parentPageId: effectiveParent.get(pageId) ?? null, level: depth + 1, childIds, depth });
      walk(pageId, depth + 1);
    }
  };
  walk(null, 0);
  // Defensive: a cycle that `walk` could not reach still becomes a visible root row.
  for (const page of live) {
    if (visited.has(page.id)) continue;
    items.push({ pageId: page.id, parentPageId: null, level: 1, childIds: [], depth: 0 });
  }
  return items;
}

export type NoteTreeCommand =
  | { type: 'focus'; pageId: string }
  | { type: 'open'; pageId: string }
  | { type: 'indent'; pageId: string; parentPageId: string }
  | { type: 'outdent'; pageId: string; parentPageId: string | null };

export interface NoteTreeKeyEvent {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

/**
 * Resolves one key press over the visible tree into a command, or `null` when the key is not a tree key.
 * `Home`/`End` move to the first/last visible row; `ArrowRight`/`ArrowLeft` indent/outdent one bounded level.
 */
export function resolveNoteTreeCommand(
  items: readonly NoteTreeItem[],
  currentPageId: string,
  event: NoteTreeKeyEvent,
): NoteTreeCommand | null {
  if (event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (!items.length) return null;
  const index = items.findIndex((item) => item.pageId === currentPageId);
  if (index < 0) return null;
  const current = items[index];

  const step = (delta: number): NoteTreeCommand => {
    const next = Math.max(0, Math.min(items.length - 1, index + delta));
    return { type: 'focus', pageId: items[next].pageId };
  };

  switch (event.key) {
    case 'ArrowDown': return step(1);
    case 'ArrowUp': return step(-1);
    case 'Home': return { type: 'focus', pageId: items[0].pageId };
    case 'End': return { type: 'focus', pageId: items[items.length - 1].pageId };
    case 'ArrowRight': {
      if (current.childIds.length && !event.shiftKey) return { type: 'focus', pageId: current.childIds[0] };
      if (current.level > NOTE_TREE_MAX_LEVEL) return null;
      // Indent: adopt the previous sibling as the new parent (bounded by the hierarchy rule).
      const siblings = items.filter((item) => item.parentPageId === current.parentPageId);
      const position = siblings.findIndex((item) => item.pageId === current.pageId);
      const previousSibling = position > 0 ? siblings[position - 1] : undefined;
      return previousSibling ? { type: 'indent', pageId: current.pageId, parentPageId: previousSibling.pageId } : null;
    }
    case 'ArrowLeft': {
      if (!current.parentPageId) return null;
      const parent = items.find((item) => item.pageId === current.parentPageId);
      return { type: 'outdent', pageId: current.pageId, parentPageId: parent?.parentPageId ?? null };
    }
    case 'Enter':
    case ' ':
      return { type: 'open', pageId: current.pageId };
    default:
      return null;
  }
}
