// STATUS: PLATIN — AST-0651/AST-0654/AST-0746: visible page tree, arrow-key navigation, visible rejection.
import { describe, expect, it } from 'vitest';
import type { NotePage, NoteSection } from '../../../../shared/contracts/workspace';
import { MAX_NOTE_SUBPAGE_DEPTH, describeNoteParentRejection } from '../../model/notesHierarchy';
import { NOTE_TREE_MAX_LEVEL, buildNoteTreeItems, resolveNoteTreeCommand } from '../../navigation/notesPageTree';

function page(id: string, parentPageId: string | null = null): NotePage {
  return { id, title: id, content: '', tags: [], backlinks: [], last_modified: 1, parentPageId };
}

function section(pages: NotePage[]): NoteSection {
  return { id: 'sec', title: 'Section', pages, createdAt: 1, updatedAt: 1, trashedAt: null };
}

describe('AST-0651 page hierarchy as a navigable tree', () => {
  it('keeps section order and puts every child directly after its parent', () => {
    const items = buildNoteTreeItems([
      page('a'),
      page('b'),
      page('child-of-a', 'a'),
      page('grandchild', 'child-of-a'),
      page('child-of-b', 'b'),
    ]);
    expect(items.map((item) => item.pageId)).toEqual(['a', 'child-of-a', 'grandchild', 'b', 'child-of-b']);
    expect(items.map((item) => item.level)).toEqual([1, 2, 3, 1, 2]);
    expect(items.find((item) => item.pageId === 'a')?.childIds).toEqual(['child-of-a']);
  });

  it('promotes orphaned and self-parented rows instead of hiding them', () => {
    const items = buildNoteTreeItems([page('solo', 'missing'), page('loop', 'loop'), page('ok')]);
    expect(items.map((item) => item.pageId)).toEqual(['solo', 'loop', 'ok']);
    expect(items.every((item) => item.parentPageId === null)).toBe(true);
  });

  it('skips trashed pages and survives an over-deep chain without recursing forever', () => {
    const deep: NotePage[] = [page('p0')];
    for (let index = 1; index <= MAX_NOTE_SUBPAGE_DEPTH + 4; index += 1) deep.push(page(`p${index}`, `p${index - 1}`));
    const trashed: NotePage = { ...page('gone', 'p0'), trashedAt: 5 };
    const items = buildNoteTreeItems([...deep, trashed]);
    expect(items.some((item) => item.pageId === 'gone')).toBe(false);
    expect(items.length).toBeGreaterThan(0);
    expect(Math.max(...items.map((item) => item.level))).toBeLessThanOrEqual(NOTE_TREE_MAX_LEVEL);
  });
});

describe('AST-0651/AST-0746 arrow-key tree navigation', () => {
  const items = buildNoteTreeItems([page('a'), page('b'), page('child-of-b', 'b'), page('c')]);

  it('walks the visible rows with ArrowUp/ArrowDown and jumps with Home/End', () => {
    expect(resolveNoteTreeCommand(items, 'a', { key: 'ArrowDown' })).toEqual({ type: 'focus', pageId: 'b' });
    expect(resolveNoteTreeCommand(items, 'c', { key: 'ArrowUp' })).toEqual({ type: 'focus', pageId: 'child-of-b' });
    expect(resolveNoteTreeCommand(items, 'a', { key: 'ArrowUp' })).toEqual({ type: 'focus', pageId: 'a' });
    expect(resolveNoteTreeCommand(items, 'c', { key: 'ArrowDown' })).toEqual({ type: 'focus', pageId: 'c' });
    expect(resolveNoteTreeCommand(items, 'c', { key: 'Home' })).toEqual({ type: 'focus', pageId: 'a' });
    expect(resolveNoteTreeCommand(items, 'a', { key: 'End' })).toEqual({ type: 'focus', pageId: 'c' });
  });

  it('opens with Enter or Space and enters a child with ArrowRight', () => {
    expect(resolveNoteTreeCommand(items, 'a', { key: 'Enter' })).toEqual({ type: 'open', pageId: 'a' });
    expect(resolveNoteTreeCommand(items, 'a', { key: ' ' })).toEqual({ type: 'open', pageId: 'a' });
    expect(resolveNoteTreeCommand(items, 'b', { key: 'ArrowRight' })).toEqual({ type: 'focus', pageId: 'child-of-b' });
  });

  it('indents into the previous sibling and outdents to the grandparent', () => {
    expect(resolveNoteTreeCommand(items, 'c', { key: 'ArrowRight' })).toEqual({ type: 'indent', pageId: 'c', parentPageId: 'b' });
    expect(resolveNoteTreeCommand(items, 'child-of-b', { key: 'ArrowLeft' })).toEqual({ type: 'outdent', pageId: 'child-of-b', parentPageId: null });
    // The first sibling has no previous sibling to adopt.
    expect(resolveNoteTreeCommand(items, 'a', { key: 'ArrowRight' })).toBeNull();
    // A root row cannot outdent further.
    expect(resolveNoteTreeCommand(items, 'a', { key: 'ArrowLeft' })).toBeNull();
  });

  it('never answers while an IME composition is active or for a modifier shortcut', () => {
    expect(resolveNoteTreeCommand(items, 'a', { key: 'ArrowDown', isComposing: true })).toBeNull();
    expect(resolveNoteTreeCommand(items, 'a', { key: 'ArrowDown', ctrlKey: true })).toBeNull();
    expect(resolveNoteTreeCommand(items, 'a', { key: 'ArrowDown', altKey: true })).toBeNull();
    expect(resolveNoteTreeCommand(items, 'a', { key: 'x' })).toBeNull();
    expect(resolveNoteTreeCommand([], 'a', { key: 'ArrowDown' })).toBeNull();
    expect(resolveNoteTreeCommand(items, 'not-there', { key: 'ArrowDown' })).toBeNull();
  });
});

describe('AST-0654 rejected hierarchy changes are visible and fail-closed', () => {
  it('names the concrete rejection reason', () => {
    const chain = [page('root'), page('mid', 'root'), page('leaf', 'mid')];
    const target = section(chain);
    expect(describeNoteParentRejection(target, 'leaf', 'leaf')?.reason).toBe('self');
    expect(describeNoteParentRejection(target, 'leaf', 'ghost')?.reason).toBe('missing');
    expect(describeNoteParentRejection(target, 'ghost', 'root')?.reason).toBe('missing');
    expect(describeNoteParentRejection(target, 'root', 'leaf')?.reason).toBe('cycle');
    expect(describeNoteParentRejection(target, 'leaf', 'mid')).toBeNull();
    expect(describeNoteParentRejection(target, 'leaf', null)).toBeNull();
    for (const rejection of [
      describeNoteParentRejection(target, 'leaf', 'leaf'),
      describeNoteParentRejection(target, 'leaf', 'ghost'),
      describeNoteParentRejection(target, 'root', 'leaf'),
    ]) {
      expect(rejection?.message.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('rejects a move that would exceed the subpage depth with its own reason', () => {
    const chain: NotePage[] = [page('r'), page('c1', 'r')];
    for (let index = 2; index <= MAX_NOTE_SUBPAGE_DEPTH; index += 1) chain.push(page(`c${index}`, `c${index - 1}`));
    chain.push(page('x'));
    const deep = section(chain);
    // `x` is a second root; adopting the deepest page would push it one level past the limit.
    const rejection = describeNoteParentRejection(deep, 'x', `c${MAX_NOTE_SUBPAGE_DEPTH}`);
    expect(rejection?.reason).toBe('depth');
    expect(rejection?.message).toContain(String(MAX_NOTE_SUBPAGE_DEPTH));
    // Adopting a shallow page from the same chain is still allowed.
    expect(describeNoteParentRejection(deep, 'x', 'c1')).toBeNull();
  });
});
