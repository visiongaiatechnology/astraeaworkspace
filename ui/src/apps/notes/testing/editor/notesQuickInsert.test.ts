// STATUS: PLATIN — AST-0656/AST-0659: the slash menu shows bounded text/media blocks and applies them exactly.
import { describe, expect, it } from 'vitest';
import {
  NOTES_MAX_SLASH_QUERY,
  NOTES_QUICK_INSERT_ITEMS,
  applyQuickInsertItem,
  filterQuickInsertItems,
  moveQuickInsertIndex,
  resolveSlashMenu,
} from '../../editor/notesQuickInsert';

const item = (id: string) => NOTES_QUICK_INSERT_ITEMS.find((entry) => entry.id === id)!;

describe('AST-0656 slash trigger on an empty line', () => {
  it('opens on a slash at the line start and after whitespace only', () => {
    expect(resolveSlashMenu('/', 1)).toEqual({ start: 0, end: 1, query: '' });
    expect(resolveSlashMenu('# Title\n/head', 13)).toEqual({ start: 8, end: 13, query: 'head' });
    expect(resolveSlashMenu('text /tab', 9)).toEqual({ start: 5, end: 9, query: 'tab' });
    // Never inside a path, a URL or a date.
    expect(resolveSlashMenu('https://example.com', 18)).toBeNull();
    expect(resolveSlashMenu('2026/09', 7)).toBeNull();
    expect(resolveSlashMenu('a/b', 3)).toBeNull();
  });

  it('bounds the query so a hostile line cannot open an unbounded menu', () => {
    expect(resolveSlashMenu(`/${'x'.repeat(NOTES_MAX_SLASH_QUERY + 1)}`, NOTES_MAX_SLASH_QUERY + 2)).toBeNull();
    expect(resolveSlashMenu(`/${'x'.repeat(NOTES_MAX_SLASH_QUERY)}`, NOTES_MAX_SLASH_QUERY + 1)?.query.length).toBe(NOTES_MAX_SLASH_QUERY);
  });

  it('ignores a caret before the slash and a non-string body', () => {
    expect(resolveSlashMenu('/', 0)).toBeNull();
    expect(resolveSlashMenu('/', -5)).toBeNull();
    expect(resolveSlashMenu('/', 999)).toEqual({ start: 0, end: 1, query: '' });
    expect(resolveSlashMenu(undefined as unknown as string, 1)).toBeNull();
  });
});

describe('AST-0656 catalogue offers text and media building blocks', () => {
  it('covers text, structure, insert and media groups', () => {
    const groups = new Set(NOTES_QUICK_INSERT_ITEMS.map((entry) => entry.group));
    expect(groups).toEqual(new Set(['text', 'structure', 'insert', 'media']));
    expect(item('h1').snippet?.()).toEqual({ text: '# ', caretOffset: 2 });
    expect(item('checklist').snippet?.()).toEqual({ text: '- [ ] ', caretOffset: 6 });
    expect(item('image').action).toBe('image');
    expect(item('voice').action).toBe('voice');
    // Every entry is either a snippet or an action, never neither and never both.
    for (const entry of NOTES_QUICK_INSERT_ITEMS) {
      expect(Boolean(entry.snippet) !== Boolean(entry.action), entry.id).toBe(true);
    }
  });

  it('filters by label, description and keyword and returns everything for an empty query', () => {
    expect(filterQuickInsertItems('')).toHaveLength(NOTES_QUICK_INSERT_ITEMS.length);
    expect(filterQuickInsertItems('todo').map((entry) => entry.id)).toEqual(['checklist']);
    expect(filterQuickInsertItems('tabelle').map((entry) => entry.id)).toEqual(['table']);
    expect(filterQuickInsertItems('HEADING').map((entry) => entry.id)).toEqual(['h1', 'h2', 'h3']);
    expect(filterQuickInsertItems('zzz')).toEqual([]);
  });
});

describe('AST-0656 applying an item replaces exactly the typed query', () => {
  it('inserts a snippet and places the caret from the snippet definition', () => {
    const content = 'Intro\n/he';
    const context = resolveSlashMenu(content, content.length)!;
    const result = applyQuickInsertItem(context, item('h1'), content);
    expect(result.content).toBe('Intro\n# ');
    expect(result.caret).toBe(8);
    expect(result.action).toBeUndefined();
  });

  it('keeps the tail of the note and reports the media action without changing text', () => {
    const content = 'a\n/im\ntail';
    const context = resolveSlashMenu(content, 5)!;
    const result = applyQuickInsertItem(context, item('image'), content);
    expect(result.content).toBe('a\n\ntail');
    expect(result.action).toBe('image');
    expect(result.caret).toBe(2);
  });

  it('inserts a table block whose caret lands after the block', () => {
    const content = '/table';
    const context = resolveSlashMenu(content, content.length)!;
    const result = applyQuickInsertItem(context, item('table'), content);
    expect(result.content).toContain('| Column 1 | Column 2 | Column 3 |');
    expect(result.content).toContain('| --- | --- | --- |');
    expect(result.caret).toBe(result.content.length);
  });

  it('is deterministic for an out-of-range context instead of throwing', () => {
    // Both ends are clamped into the content, so the whole body is replaced by the snippet.
    const result = applyQuickInsertItem({ start: -10, end: 9999 }, item('bullet'), 'abc');
    expect(result.content).toBe('- ');
    expect(result.caret).toBe(2);
  });
});

describe('AST-0659 keyboard highlight', () => {
  it('wraps the highlight index in both directions and survives an empty list', () => {
    expect(moveQuickInsertIndex(0, 1, 3)).toBe(1);
    expect(moveQuickInsertIndex(2, 1, 3)).toBe(0);
    expect(moveQuickInsertIndex(0, -1, 3)).toBe(2);
    expect(moveQuickInsertIndex(0, 1, 0)).toBe(0);
    expect(moveQuickInsertIndex(Number.NaN, 1, 3)).toBe(1);
    expect(moveQuickInsertIndex(1, 1, -4)).toBe(0);
  });
});
