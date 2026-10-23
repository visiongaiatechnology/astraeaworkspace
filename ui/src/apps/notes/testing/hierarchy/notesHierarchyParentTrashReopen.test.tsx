// STATUS: instrument — executes the **real** `useNotesManager.handleSetPageParent`,
// `handleDeletePage` and `handleRestorePage`, then closes and reopens the persisted document.
//
// AST-0653 acceptance: "Notebook anlegen, Seiten verschieben und per Baum navigieren … Prüfe
// Save→Close→Reopen auf identische Nutzdaten."
//
// Why this file exists (audit `PER_ID_AUDIT_NOTES_0641_0720.md`, AST-0653 row, line 140):
//   * "**No witness executes a save→close→reopen of a moved page or of `trashedAt`.**"
//   * `notesNotebookAcceptance.test.ts:99-105` checks the hierarchy **in memory only**
//     (`normalizeNoteNotebook` + `parentPageId === 'page-finding-00'`); the JSON/ZIP round trips in that
//     file and in `notesNotebookFullAcceptance.test.tsx:177-184` compare title/content/tags/properties —
//     never `parentPageId`, never `trashedAt`.
//   * A grep over `ui/src/apps/notes/testing` for `handleSetPageParent` / `handleDeletePage` /
//     `handleRestorePage` returns **zero** call sites, so no test has ever executed the production
//     hierarchy write path. The only in-repo witnesses for the rule are the pure `setPageParent` /
//     `noteParentRejectionReason` functions and the tree projection `notesPageTree.test.ts`.
//
// Two things this instrument measured about ITSELF and about the code under test, both load-bearing:
//
//   1. **One hierarchy move per mount is the rule of this file.** It was originally forced by a defect this
//      instrument measured: `handleSetPageParent` reported its outcome from the **render-time** `activeSection`
//      memo, while the write went through `notebooksRef.current` — whose `setPageParent` re-checks the same
//      rule against the **live** section. Inside one mount the two snapshots disagreed: a move could be
//      reported as accepted and then not be written. The persisted data stayed acyclic, because the *write* is
//      the check that fail-closes; what diverged was the REPORT, and `null` is the report that clears the tree
//      notice in `NotesPagesList`. That is fixed at the source: the outcome now reads the same live section the
//      write goes through, so `null` means written and a rejection means nothing was persisted. The invariant
//      is asserted in both directions in `notesSetPageParentOutcomeMatchesWrite.test.tsx` and in the last test
//      below. This file keeps **one move per mount** because that is the round trip the audit asked for, not
//      because the hook still requires it.
//   2. **`version` does not advance across commits inside one SSR mount.** `persistNotebooks` computes
//      `version: document.version + 1` from the *prop*, and an SSR pass never re-renders with an updated
//      prop, so two commits in one mount both report `document.version + 1`. The accumulated *notebook
//      data* is correct (it chains through `notebooksRef`); only the version counter is frozen. Every
//      assertion below therefore takes at most one commit per mount.
//
// What this file does NOT claim:
//   * It does **not** dispatch a real drag-and-drop or a `click` on a tree row. `ui/package.json` has no
//     jsdom / happy-dom / @testing-library, so no test in this tree can drive a real DOM event. The
//     visible tree → `resolveNoteTreeCommand` → `onSetParent` → `handleSetPageParent` hop is still covered
//     only by source contracts.
//   * It does **not** close or reopen a window, a file, the native host or the `.vnote` container. "Close"
//     is `JSON.stringify`; "reopen" is `JSON.parse` plus a **fresh** `useNotesManager` mount.
//   * It does **not** prove anything about the installed application. No PASS verdict is written here.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useNotesManager } from '../../notebooks/useNotesManager';
import { createNotePageFromTemplate } from '../../model/noteModel';
import { normalizeNoteNotebook } from '../../model/notesHierarchy';

const NOW = 1_700_000_000_000;

/**
 * Every page is a production `createNotePageFromTemplate('blank', …)` result — no hand-written `NotePage`
 * literal appears below. The section/notebook shell is a wrapper, then put through
 * `normalizeNoteNotebook`, the only shape a notebook coming from disk takes.
 *
 * The hierarchy starts genuinely EMPTY: every page is parentless. The chain under test is therefore created
 * by the production handler, not by the fixture.
 */
function buildPages(count: number): NotePage[] {
  return Array.from({ length: count }, (_, index) => createNotePageFromTemplate('blank', NOW, `Level ${index}`));
}

function buildDocument(pages: NotePage[], id = 'nb-hierarchy'): WorkspaceDocument {
  const notebook = normalizeNoteNotebook({
    id,
    title: 'Hierarchy Notebook',
    createdAt: NOW,
    updatedAt: NOW,
    trashedAt: null,
    sections: [{
      id: 'sec-tree',
      title: 'Tree',
      createdAt: NOW,
      updatedAt: NOW,
      trashedAt: null,
      pages,
    }],
  } as NoteNotebook, NOW);
  return {
    id: 'doc-hierarchy', kind: 'Notes', title: 'Notes', version: 1, modified_at: NOW,
    notebooks: [notebook],
  } as WorkspaceDocument;
}

function buildFixture() {
  const pages = buildPages(3);
  const document = buildDocument(pages);
  return { document, leafId: pages[0].id, middleId: pages[1].id, rootId: pages[2].id };
}

function findPage(document: WorkspaceDocument, pageId: string): NotePage {
  const page = (document.notebooks ?? [])
    .flatMap((notebook) => notebook.sections)
    .flatMap((section) => section.pages)
    .find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`page ${pageId} is not in the document`);
  return page;
}

/**
 * Mounts the **real** `useNotesManager`. `renderToStaticMarkup` executes the hook body, so the returned
 * functions are the production closures; what an SSR pass does not give is a second render or an effect
 * flush, which is why every assertion reads the document handed to the production persist callback.
 */
function mountManager(document: WorkspaceDocument): {
  api: ReturnType<typeof useNotesManager>;
  committed: WorkspaceDocument[];
} {
  const committed: WorkspaceDocument[] = [];
  let api: ReturnType<typeof useNotesManager> | null = null;
  const Capture = (): null => {
    api = useNotesManager(document, (next) => { committed.push(next); });
    return null;
  };
  renderToStaticMarkup(<Capture />);
  if (!api) throw new Error('useNotesManager was not executed');
  return { api: api as ReturnType<typeof useNotesManager>, committed };
}

/** CLOSE (bytes only) → REOPEN (fresh mount over the parsed document). */
function closeAndReopen(document: WorkspaceDocument) {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  const onDisk = JSON.parse(new TextDecoder().decode(bytes)) as WorkspaceDocument;
  return { ...mountManager(onDisk), onDisk };
}

/** Performs exactly one hierarchy move, then closes and reopens. Returns the reopened manager + document. */
function moveThenReopen(document: WorkspaceDocument, pageId: string, parentPageId: string | null) {
  const { api, committed } = mountManager(document);
  const rejection = api.handleSetPageParent(pageId, parentPageId);
  expect(committed, 'one handler call per mount: see note 2 in the header').toHaveLength(1);
  return { rejection, saved: committed[0], ...closeAndReopen(committed[0]) };
}

function flatItems(api: ReturnType<typeof useNotesManager>) {
  return new Map(api.allPagesList.map((item) => [item.id, item]));
}

describe('AST-0653 · moving a page and trashing it, then close and reopen', () => {
  it('the fixture starts with three production pages and an EMPTY hierarchy', () => {
    const { document, leafId, middleId, rootId } = buildFixture();
    const pages = (document.notebooks ?? []).flatMap((notebook) => notebook.sections).flatMap((section) => section.pages);
    expect(pages).toHaveLength(3);
    // Production shape: `createNotePageFromTemplate` fills all documented fields.
    for (const page of pages) {
      expect(page.revisions).toEqual([]);
      expect(page.parentPageId).toBeNull();
      expect(page.trashedAt).toBeNull();
      expect(page.templateId).toBe('blank');
    }
    // If the hierarchy were pre-populated by the fixture, the ACT below would prove nothing.
    expect([leafId, middleId, rootId].every((id) => findPage(document, id).parentPageId === null)).toBe(true);
  });

  it('each move survives its own close/reopen, the cascade trash survives, and the reopened tree is still rule-checked', () => {
    const { document, leafId, middleId, rootId } = buildFixture();

    // --- ACT 1: Middle under Root, then close/reopen. -----------------------------------------------
    const first = moveThenReopen(document, middleId, rootId);
    expect(first.rejection, 'moving Middle under Root must be allowed').toBeNull();
    expect(findPage(first.saved, middleId).parentPageId).toBe(rootId);
    expect(first.saved.version).toBe(document.version + 1);
    expect(flatItems(first.api).get(middleId)?.parentPageId, 'the move must survive its own reopen').toBe(rootId);

    // --- ACT 2: Leaf under Middle (validated against the REOPENED section), then close/reopen. ------
    const second = moveThenReopen(first.saved, leafId, middleId);
    expect(second.rejection).toBeNull();
    const secondItems = flatItems(second.api);
    expect(secondItems.get(leafId)?.parentPageId).toBe(middleId);
    expect(secondItems.get(middleId)?.parentPageId, 'the earlier link is still there').toBe(rootId);

    // --- ACT 3: trashing the ROOT must cascade to both descendants. --------------------------------
    const deleteMount = mountManager(second.saved);
    deleteMount.api.handleDeletePage(rootId);
    expect(deleteMount.committed).toHaveLength(1);
    const afterDelete = deleteMount.committed[0];
    for (const id of [rootId, middleId, leafId]) {
      expect(findPage(afterDelete, id).trashedAt, `${id} must be trashed by the cascade`).not.toBeNull();
    }
    const afterDeleteReopen = closeAndReopen(afterDelete);
    const trashedItems = flatItems(afterDeleteReopen.api);
    expect(trashedItems.get(rootId)?.trashed).toBe(true);
    expect(trashedItems.get(middleId)?.trashed, 'the cascade must survive the reopen').toBe(true);
    expect(trashedItems.get(leafId)?.trashed).toBe(true);

    // --- ACT 4: restoring only Middle leaves the other two trashed. --------------------------------
    const restoreMount = mountManager(afterDeleteReopen.onDisk);
    restoreMount.api.handleRestorePage(middleId);
    expect(restoreMount.committed).toHaveLength(1);
    const saved = restoreMount.committed[0];
    expect(findPage(saved, middleId).trashedAt).toBeNull();
    expect(findPage(saved, rootId).trashedAt).not.toBeNull();
    expect(findPage(saved, leafId).trashedAt).not.toBeNull();

    // --- CLOSE → REOPEN (final). -------------------------------------------------------------------
    const { api: reopened, committed: reopenedCommitted } = closeAndReopen(saved);
    const items = flatItems(reopened);
    expect(items.size).toBe(3);
    expect(items.get(leafId)?.parentPageId, 'the deepest parent must survive the reopen').toBe(middleId);
    expect(items.get(middleId)?.parentPageId, 'the intermediate parent must survive the reopen').toBe(rootId);
    expect(items.get(rootId)?.parentPageId).toBeNull();
    expect(items.get(leafId)?.trashed).toBe(true);
    expect(items.get(rootId)?.trashed).toBe(true);
    expect(items.get(middleId)?.trashed, 'the restored page must still be live').toBe(false);
    expect(reopenedCommitted, 'a fresh mount must not write anything by itself').toEqual([]);

    // --- The hierarchy RULE still works on the reopened structure. ----------------------------------
    // This only rejects if the reopened chain really is leaf → middle → root: the cycle is detected by
    // walking `parentPageId`, so a reopen that dropped the parents would make this move legal.
    expect(reopened.handleSetPageParent(rootId, leafId)?.reason, 'still a cycle after reopen').toBe('cycle');
    expect(reopened.handleSetPageParent(leafId, leafId)?.reason).toBe('self');
    expect(reopened.handleSetPageParent(leafId, 'page-not-in-this-section')?.reason).toBe('missing');
    // Fail-closed: none of the three refusals reached the persist callback.
    expect(reopenedCommitted).toEqual([]);

    // A legitimate move is still possible after the reopen, and it lands in the persisted document.
    expect(reopened.handleSetPageParent(leafId, null)).toBeNull();
    expect(reopenedCommitted).toHaveLength(1);
    expect(findPage(reopenedCommitted[0], leafId).parentPageId).toBeNull();
    expect(findPage(reopenedCommitted[0], middleId).parentPageId, 'the untouched branch is unchanged').toBe(rootId);
  });

  it('the 8-level ceiling is still enforced against a REOPENED chain, which requires every parent link to survive', () => {
    // Ten production pages, chained by eight real `handleSetPageParent` calls, each in its own mount and
    // each followed by a close/reopen. The ninth move must be refused as `depth` — and it can only be
    // refused if the whole 8-deep chain came back, because the ceiling is computed by walking `parentPageId`.
    const pages = buildPages(10);
    let document = buildDocument(pages, 'nb-deep');
    for (let level = 1; level <= 8; level += 1) {
      const step = moveThenReopen(document, pages[level].id, pages[level - 1].id);
      expect(step.rejection, `level ${level} under level ${level - 1} must be allowed`).toBeNull();
      expect(flatItems(step.api).get(pages[level].id)?.parentPageId).toBe(pages[level - 1].id);
      document = step.saved;
    }

    const deepest = pages[9];
    const attempt = mountManager(document);
    const rejection = attempt.api.handleSetPageParent(deepest.id, pages[8].id);
    expect(rejection?.reason, 'the 9th level must exceed MAX_NOTE_SUBPAGE_DEPTH').toBe('depth');
    expect(rejection?.message).toContain('8 subpage levels');
    // Fail-closed: refused means no write at all.
    expect(attempt.committed).toEqual([]);

    const { api: reopened } = closeAndReopen(document);
    const items = flatItems(reopened);
    for (let level = 1; level <= 8; level += 1) {
      expect(items.get(pages[level].id)?.parentPageId, `level ${level} parent after reopen`).toBe(pages[level - 1].id);
    }
    expect(items.get(deepest.id)?.parentPageId, 'the refused move really did not happen').toBeNull();
    expect(reopened.handleSetPageParent(deepest.id, pages[8].id)?.reason).toBe('depth');
  });

  it('reports the reverse move as a cycle in the same mount, because the OUTCOME and the WRITE read one snapshot', () => {
    // Measured, not assumed, and measured in the other direction first: on the pre-fix tree this test asserted
    // the defect — `handleSetPageParent` decided the outcome from the **render-time** memo while the write
    // re-checked the rule on the **live** section, so the reverse move below was reported as allowed (`null`,
    // which CLEARS the tree notice in `NotesPagesList`) and then refused by the write. The persisted data was
    // acyclic either way; the *report* was what diverged. The outcome now reads the live section too, so the
    // two cannot disagree: `null` means written, a rejection means nothing was persisted.
    const { document } = buildFixture();
    const pages = (document.notebooks ?? [])[0].sections[0].pages;
    const { api, committed } = mountManager(document);

    expect(api.handleSetPageParent(pages[1].id, pages[0].id), 'Middle under Leaf').toBeNull();
    expect(findPage(committed[0], pages[1].id).parentPageId).toBe(pages[0].id);

    // The reverse move is a cycle against the live section — and that is exactly what the caller is told.
    const reverse = api.handleSetPageParent(pages[0].id, pages[1].id);
    expect(reverse?.reason, 'the live rule refuses this, so the report must say so').toBe('cycle');
    expect(reverse?.message).toContain('circular');
    // Fail-closed: the refusal did not reach the persist callback at all, so there is no second document.
    expect(committed).toHaveLength(1);
    expect(findPage(committed[0], pages[0].id).parentPageId, 'the refused write did not create a cycle').toBeNull();
    expect(findPage(committed[0], pages[1].id).parentPageId).toBe(pages[0].id);

    // Read back through a close/reopen, the persisted state is the acyclic first move.
    const { api: reopened } = closeAndReopen(committed[0]);
    const items = flatItems(reopened);
    expect(items.get(pages[1].id)?.parentPageId).toBe(pages[0].id);
    expect(items.get(pages[0].id)?.parentPageId).toBeNull();
    // And on a FRESH mount the rule reports the same thing, as before.
    expect(reopened.handleSetPageParent(pages[0].id, pages[1].id)?.reason).toBe('cycle');
  });
});
