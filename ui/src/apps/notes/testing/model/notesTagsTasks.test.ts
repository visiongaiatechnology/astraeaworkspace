// STATUS: PLATIN — AST-0676/AST-0679 + AST-0662/AST-0664: pure tag validation and checklist→task conversion.
import { describe, expect, it } from 'vitest';
import type { NotePage, TaskItem } from '../../../../shared/contracts/workspace';
import {
  NOTES_MAX_TAGS_PER_PAGE,
  convertChecklistToCanonicalTask,
  parseMarkdownChecklistItems,
  validateNoteTagInput,
} from '../../model/notesTagsTasks';

function page(overrides: Partial<NotePage> = {}): NotePage {
  return {
    id: 'page-1', title: 'Finding', content: '', tags: [], backlinks: [], last_modified: 1_700_000_000_000, revisions: [], ...overrides,
  };
}

describe('AST-0679 tag identity and bounds', () => {
  it('normalises the tag and refuses a duplicate through the canonical tag key', () => {
    expect(validateNoteTagInput(page(), '  Research  ')).toEqual({ ok: true, tag: 'Research' });
    expect(validateNoteTagInput(page(), '#Evidence')).toEqual({ ok: true, tag: 'Evidence' });
    // The same tag in different shapes is still the same tag.
    expect(validateNoteTagInput(page({ tags: ['research'] }), ' Research ')).toEqual({ ok: false, message: '“Research” is already on this note.' });
    expect(validateNoteTagInput(page({ tags: ['Research'] }), 'research').ok).toBe(false);
  });

  it('refuses an empty tag, an over-long tag and a note at the tag limit', () => {
    expect(validateNoteTagInput(page(), '   ').ok).toBe(false);
    expect(validateNoteTagInput(page(), '###').ok).toBe(false);
    expect(validateNoteTagInput(page(), 'x'.repeat(65))).toEqual({ ok: false, message: 'Tags are limited to 64 characters.' });
    expect(validateNoteTagInput(page({ tags: Array.from({ length: NOTES_MAX_TAGS_PER_PAGE }, (_, i) => `t${i}`) }), 'extra').ok).toBe(false);
    expect(validateNoteTagInput(page({ tags: Array.from({ length: NOTES_MAX_TAGS_PER_PAGE - 1 }, (_, i) => `t${i}`) }), 'extra').ok).toBe(true);
  });

  it('never throws on a hostile value and always yields a string tag', () => {
    const coerced = validateNoteTagInput(page(), 123 as unknown as string);
    expect(coerced.ok).toBe(true);
    expect(coerced.ok && typeof coerced.tag).toBe('string');
    expect(validateNoteTagInput(page(), undefined as unknown as string).ok).toBe(false);
    expect(validateNoteTagInput({ tags: null as unknown as string[] }, 'ok').ok).toBe(true);
    expect(validateNoteTagInput({ tags: undefined as unknown as string[] }, 'ok').ok).toBe(true);
  });
});

describe('AST-0662 checklist parsing and canonical task conversion', () => {
  const content = ['# Plan', '', '- [ ] first item', '- [x] second item', '  - [ ] nested item', 'not a checklist'].join('\n');

  it('parses only real checklist lines with their indent and state', () => {
    const items = parseMarkdownChecklistItems(content);
    expect(items.map((item) => [item.lineIndex, item.checked, item.text, item.indent])).toEqual([
      [2, false, 'first item', ''],
      [3, true, 'second item', ''],
      [4, false, 'nested item', '  '],
    ]);
  });

  it('creates a canonical task with a stable source marker and one canonical page URI', () => {
    const result = convertChecklistToCanonicalTask(page({ content }), 2, 'doc-1', []);
    expect(result).not.toBeNull();
    expect(result!.task.id).toMatch(/^task-/);
    expect(result!.task.completed).toBe(false);
    expect(result!.task.plannerColumn).toBe('todo');
    expect(result!.task.linkedWorkspaceUris).toEqual(['vgt://workspace/document/doc-1/page/page-1']);
    expect(result!.page.content.split('\n')[2]).toMatch(/^- \[ \] first item \^task-/);
    expect(result!.page.taskBindings).toHaveLength(1);
    expect(result!.page.taskBindings![0].sync).toBe('bidirectional');
  });

  it('returns null for a non-checklist line so the caller can report it instead of doing nothing', () => {
    expect(convertChecklistToCanonicalTask(page({ content }), 5, 'doc-1', [])).toBeNull();
    expect(convertChecklistToCanonicalTask(page({ content }), 99, 'doc-1', [])).toBeNull();
  });

  it('is idempotent: an already linked line returns the existing task and unchanged page', () => {
    const first = convertChecklistToCanonicalTask(page({ content }), 2, 'doc-1', [])!;
    const tasks: TaskItem[] = [first.task];
    const second = convertChecklistToCanonicalTask(first.page, 2, 'doc-1', tasks);
    expect(second).not.toBeNull();
    expect(second!.page).toBe(first.page);
    expect(second!.task.id).toBe(first.task.id);
  });
});
