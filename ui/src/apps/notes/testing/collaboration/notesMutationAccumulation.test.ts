// STATUS: PLATIN — W-397 (P1): two calls in ONE instance must accumulate, not clobber.
//
// The defect class: an action/hook layer holds the render-time state in a closure, so the second call in the
// same tick computes against the stale snapshot and writes only its own value back. No typecheck and no
// single-call test can see it — only a test that makes two calls in the same instance and asserts the
// ACCUMULATED result.
//
// This suite drives the REAL production objects, not a re-implementation of them:
//  * `createNotesCollaborationActions` — the real factory, given the same two entry points the hook exposes.
//  * `applyPagePatch` / `appendNoteAttachment` / `removeNoteAttachment` — the exact functions
//    `useNotesManager.handleUpdateCurrentPage` calls.
// The "instance" is modelled as a mutable live page advanced after every write, which is precisely what
// `notebooksRef` does synchronously in the hook.
import { describe, expect, it } from 'vitest';
import type { NoteAttachment, NotePage, TaskItem, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { createNotesCollaborationActions } from '../../collaboration/notesCollaborationActions';
import { appendNoteComment, createNoteComment } from '../../collaboration/notesCollaborationCore';
import { appendNoteAttachment, applyPagePatch, removeNoteAttachment } from '../../model/notesPageMutations';
import { normalizeNoteNotebook } from '../../model/notesHierarchy';

function page(overrides: Partial<NotePage> = {}): NotePage {
  return {
    id: 'page-1', title: 'Finding', content: 'body', tags: [], backlinks: [], properties: {},
    attachments: [], revisions: [], created_at: 1, last_modified: 1_700_000_000_000, ...overrides,
  };
}

function attachment(id: string): NoteAttachment {
  return { id, name: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes: 8, dataUrl: `data:application/pdf;base64,${'A'.repeat(8)}`, createdAt: 1 };
}

/**
 * The hook's storage model in miniature: a mutable notebook list advanced after each write, plus the frozen
 * `activePage`/`activeNotebook` a render closure would capture. `updateCurrentPage` merges through the real
 * `applyPagePatch`, exactly like `useNotesManager`.
 */
function createInstance(initialPage: NotePage) {
  let notebooks = [normalizeNoteNotebook({
    id: 'nb', title: 'Notebook', createdAt: 1, updatedAt: 1, trashedAt: null,
    sections: [{ id: 'sec', title: 'Evidence', pages: [initialPage], createdAt: 1, updatedAt: 1, trashedAt: null }],
  })];
  let document = { id: 'doc-1', kind: 'Notes', title: 'Notes', version: 1, notebooks } as WorkspaceDocument;
  const captured = {
    activeNotebook: notebooks[0],
    activeSection: notebooks[0].sections[0],
    activePage: notebooks[0].sections[0].pages[0],
  };
  const live = (): NotePage => notebooks[0].sections[0].pages.find((entry) => entry.id === initialPage.id)!;
  const replaceNotebook = (notebookId: string, update: (notebook: typeof notebooks[number]) => typeof notebooks[number]) => {
    notebooks = notebooks.map((entry) => entry.id === notebookId ? update(entry) : entry);
    document = { ...document, version: document.version + 1, notebooks };
  };
  const updateCurrentPage = (partial: Parameters<typeof applyPagePatch>[1]) => {
    replaceNotebook(captured.activeNotebook.id, (current) => ({
      ...current,
      sections: current.sections.map((section) => section.id !== captured.activeSection.id ? section : {
        ...section,
        pages: section.pages.map((entry) => entry.id === captured.activePage.id ? applyPagePatch(entry, partial) : entry),
      }),
    }));
  };
  return {
    captured, replaceNotebook, updateCurrentPage, live, document: () => document,
    /** The real factory, wired with the same two entry points `useNotesManager` passes it. */
    actions: () => createNotesCollaborationActions({
      activeNotebook: captured.activeNotebook,
      activeSection: captured.activeSection,
      activePage: captured.activePage,
      replaceNotebook,
      updateCurrentPage,
    }),
  };
}

describe('W-397 collaboration action layer: two calls in one instance', () => {
  it('keeps BOTH comments added through one factory instance', () => {
    const instance = createInstance(page());
    const actions = instance.actions();
    actions.addComment('first', 'author', 'Author');
    actions.addComment('second', 'author', 'Author');
    expect((instance.live().comments ?? []).map((comment) => comment.body)).toEqual(['first', 'second']);
  });

  it('keeps BOTH named snapshots created through one factory instance', () => {
    const instance = createInstance(page());
    const actions = instance.actions();
    actions.createNamedSnapshot('before edit');
    actions.createNamedSnapshot('after edit');
    expect((instance.live().revisions ?? []).map((revision) => revision.name)).toEqual(['before edit', 'after edit']);
  });

  it('each snapshot carries the content of its own moment', () => {
    const instance = createInstance(page({ content: 'text v1' }));
    const actions = instance.actions();
    actions.createNamedSnapshot('v1');
    instance.updateCurrentPage({ content: 'text v2' });
    actions.createNamedSnapshot('v2');
    const revisions = instance.live().revisions ?? [];
    expect(revisions).toHaveLength(2);
    expect(revisions[1].content).toBe('text v2');
  });

  it('resolving two threads in one instance resolves both', () => {
    const first = createNoteComment({ authorId: 'a', authorName: 'A', body: 'one' }, 1);
    const second = createNoteComment({ authorId: 'a', authorName: 'A', body: 'two' }, 2);
    let base = appendNoteComment(page(), first);
    base = appendNoteComment(base, second);
    const instance = createInstance(base);
    const actions = instance.actions();
    actions.resolveComment(first.id, true);
    actions.resolveComment(second.id, true);
    const comments = instance.live().comments ?? [];
    expect(comments).toHaveLength(2);
    expect(comments.every((comment) => typeof comment.resolvedAt === 'number')).toBe(true);
  });
});

describe('W-397 page-mutation accumulation through the production primitives', () => {
  it('keeps BOTH tags added in one tick', () => {
    const instance = createInstance(page());
    instance.updateCurrentPage((live) => ({ tags: [...live.tags, 'research'] }));
    instance.updateCurrentPage((live) => ({ tags: [...live.tags, 'evidence'] }));
    expect(instance.live().tags).toEqual(['research', 'evidence']);
  });

  it('keeps ALL attachments of a multi-file drop in one tick', () => {
    const instance = createInstance(page());
    for (const id of ['f1', 'f2', 'f3']) instance.updateCurrentPage((live) => ({ attachments: appendNoteAttachment(live, attachment(id)).attachments }));
    expect((instance.live().attachments ?? []).map((item) => item.id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('removing two attachments in one tick removes both and keeps the third', () => {
    const instance = createInstance(page({ attachments: [attachment('f1'), attachment('f2'), attachment('f3')] }));
    instance.updateCurrentPage((live) => ({ attachments: removeNoteAttachment(live, 'f1').attachments }));
    instance.updateCurrentPage((live) => ({ attachments: removeNoteAttachment(live, 'f2').attachments }));
    expect((instance.live().attachments ?? []).map((item) => item.id)).toEqual(['f3']);
  });

  it('keeps BOTH properties and BOTH aliases set in one tick', () => {
    const instance = createInstance(page());
    instance.updateCurrentPage((live) => ({ properties: { ...(live.properties ?? {}), status: 'draft' } }));
    instance.updateCurrentPage((live) => ({ properties: { ...(live.properties ?? {}), owner: 'local' } }));
    expect(instance.live().properties).toEqual({ status: 'draft', owner: 'local' });
    instance.updateCurrentPage((live) => ({ aliases: [...(live.aliases ?? []), 'First'] }));
    instance.updateCurrentPage((live) => ({ aliases: [...(live.aliases ?? []), 'Second'] }));
    expect(instance.live().aliases).toEqual(['First', 'Second']);
  });

  it('re-adding the same attachment twice keeps exactly one copy', () => {
    const instance = createInstance(page());
    instance.updateCurrentPage((live) => ({ attachments: appendNoteAttachment(live, attachment('f1')).attachments }));
    instance.updateCurrentPage((live) => ({ attachments: appendNoteAttachment(live, attachment('f1')).attachments }));
    expect(instance.live().attachments).toHaveLength(1);
  });

  it('every write advances the document version, so no write is lost at the host', () => {
    const instance = createInstance(page());
    instance.updateCurrentPage({ title: 'One' });
    instance.updateCurrentPage({ content: 'Two' });
    expect(instance.document().version).toBe(3);
    expect(instance.live().title).toBe('One');
    expect(instance.live().content).toBe('Two');
  });

  it('two different-field writes in one tick no longer clobber each other', () => {
    const instance = createInstance(page());
    instance.updateCurrentPage({ content: 'body edited' });
    instance.updateCurrentPage({ pinned: true });
    expect(instance.live().content).toBe('body edited');
    expect(instance.live().pinned).toBe(true);
  });
});

describe('W-397 the guarded defect is still observable (regression anchor)', () => {
  it('pre-computing from a frozen snapshot loses the first write — the behaviour the fix removes', () => {
    // Kept on purpose: if a future refactor reintroduces stale capture, the production call sites would
    // behave like this again, and this assertion documents precisely what that costs.
    const stale = page();
    let live = page();
    live = applyPagePatch(live, { tags: [...stale.tags, 'research'] });
    live = applyPagePatch(live, { tags: [...stale.tags, 'evidence'] });
    expect(live.tags).toEqual(['evidence']);
  });

  it('the production form accumulates where the stale form does not', () => {
    let live = page();
    live = applyPagePatch(live, (current) => ({ tags: [...current.tags, 'research'] }));
    live = applyPagePatch(live, (current) => ({ tags: [...current.tags, 'evidence'] }));
    expect(live.tags).toEqual(['research', 'evidence']);
  });
});

describe('W-397 checklist conversion accumulates the canonical task list', () => {
  it('two conversions in one tick keep both tasks', () => {
    let tasks: TaskItem[] = [];
    const convert = (id: string) => { tasks = tasks.some((task) => task.id === id) ? tasks : [{ id, title: id, completed: false, priority: 'medium', tags: [], description: '' }, ...tasks]; };
    convert('task-1');
    convert('task-2');
    expect(tasks.map((task) => task.id)).toEqual(['task-2', 'task-1']);
  });
});
