// STATUS: PLATIN — W-397 source contract: the hook must advance the live reference synchronously.
//
// The behavioural two-call suite (`testing/collaboration/notesMutationAccumulation.test.ts`) drives
// `applyPagePatch` and `createNotesCollaborationActions`, so it cannot observe whether `useNotesManager`
// itself advances `notebooksRef` before the host call. That part is pinned here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const notesDirectory = new URL('../../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, notesDirectory), 'utf8');

const manager = read('notebooks/useNotesManager.ts');
const mutations = read('model/notesPageMutations.ts');
const actions = read('collaboration/notesCollaborationActions.ts');

describe('W-397 useNotesManager accumulates instead of clobbering', () => {
  it('holds a live reference and advances it synchronously inside persistNotebooks', () => {
    expect(manager).toContain('const notebooksRef = useRef<NoteNotebook[]>(notebooks);');
    expect(manager).toContain('notebooksRef.current = notebooks;');
    // The advance must happen BEFORE the host call, otherwise a second mutation in the same tick still
    // starts from the render-time snapshot.
    const advance = manager.indexOf('notebooksRef.current = knowledgeBound;');
    const hostCall = manager.indexOf('onUpdateDocument({');
    expect(advance).toBeGreaterThan(-1);
    expect(hostCall).toBeGreaterThan(-1);
    expect(advance).toBeLessThan(hostCall);
  });

  it('reads the notebook list from the live reference, not from the render closure', () => {
    expect(manager).toContain('persistNotebooks(notebooksRef.current.map((notebook) => notebook.id === notebookId ? update(notebook) : notebook));');
    expect(manager).not.toContain('persistNotebooks(notebooks.map((notebook) => notebook.id === notebookId ? update(notebook) : notebook));');
  });

  it('delegates the page merge to the pure accumulate-safe primitives', () => {
    expect(manager).toContain("import { appendNoteAttachment, applyPagePatch, removeNoteAttachment, type NotePagePatch } from '../model/notesPageMutations';");
    expect(manager).toContain('const updatedPage = applyPagePatch(live, partial, now);');
    // Every previous-state-dependent write uses the functional form.
    for (const call of [
      'handleUpdateCurrentPage((page) => ({ tags: [...page.tags, validation.tag] }));',
      'handleUpdateCurrentPage((page) => ({ tags: page.tags.filter((entry) => noteTagKey(entry) !== key) }));',
      'handleUpdateCurrentPage((page) => ({ pinned: !page.pinned }));',
      'handleUpdateCurrentPage((page) => ({ favorite: !page.favorite }));',
      'handleUpdateCurrentPage((page) => ({ archived: !page.archived }));',
      'handleUpdateCurrentPage((page) => ({ properties: { ...(page.properties ?? {}), [key]: value } }));',
    ]) {
      expect(manager).toContain(call);
    }
    // No new tag list may be built from the captured `activePage`.
    expect(manager).not.toContain('tags: [...activePage.tags');
    expect(manager).not.toContain('attachments: [...(activePage.attachments ?? [])');
  });

  it('the pure primitives read the list from the live page', () => {
    expect(mutations).toContain('const resolved = typeof partial === \'function\' ? partial(live) : partial;');
    expect(mutations).toContain('if ((live.attachments ?? []).some((item) => item.id === attachment.id)) return live;');
    expect(mutations).toContain('return applyPagePatch(live, { attachments: [...(live.attachments ?? []), attachment] }, now);');
  });

  it('the collaboration factory never computes against the captured page', () => {
    expect(actions).toContain('context.updateCurrentPage((page) => ({ comments: appendNoteComment(page, comment).comments }));');
    expect(actions).toContain('context.updateCurrentPage((page) => ({ comments: resolveNoteCommentThread(page, rootId, resolved).comments }));');
    expect(actions).toContain('context.updateCurrentPage((page) => ({');
    expect(actions).not.toContain('appendNoteComment(context.activePage');
    expect(actions).not.toContain('revisions: [...(activePage.revisions ?? [])');
  });
});
