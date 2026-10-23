// STATUS: instrument — executes the **real** `useNotesManager.handleSetPageParent` twice inside ONE mount and
// compares the REPORTED outcome with the document the production persist callback received.
//
// Finding under test (`evidence/open-core-product-reconstruction/REPAIR_NOTES_REOPEN_GAPS_2.md` §2b/§5):
//   "`handleSetPageParent` reports its outcome from the render-time section while writing through the live
//    ref. A move can therefore be reported `accepted` and not be written."
//
// Why it matters (the "message does not match the effect" class): `NotesPagesList.applyParentChange` does
//   `const rejection = onSetPageParent(pageId, parentPageId);`
//   `setTreeMessage(rejection ? rejection.message : null);`
// so a `null` report CLEARS the hierarchy notice. When the write then fail-closes on the live section, the
// user pressed ArrowRight / picked a parent in the dropdown and NOTHING happened — with no message.
//
// The invariant asserted here, both directions, for calls made in the same mount:
//   reported `null`        ⇒  the move IS in the persisted document
//   reported rejection     ⇒  the persist callback was NOT reached at all
//
// What this file does NOT claim:
//   * `ui/package.json` has no jsdom / happy-dom / @testing-library, so no test here dispatches a real
//     keydown, a real `change` or a real drop. The click → `resolveNoteTreeCommand` → `onSetPageParent` hop
//     is covered only by source contracts.
//   * `renderToStaticMarkup` executes the hook body but NEVER re-renders, so inside one mount
//     `activeSection` is frozen at the fixture while `notebooksRef.current` advances. That is exactly the
//     condition the finding describes; it also means this file says nothing about how long a real browser
//     keeps the two snapshots apart, and nothing about a human reachability path.
//   * No PASS verdict is written. Nothing is claimed about the installed application.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useNotesManager } from '../../notebooks/useNotesManager';
import { createNotePageFromTemplate } from '../../model/noteModel';
import { normalizeNoteNotebook } from '../../model/notesHierarchy';

const NOW = 1_700_000_000_000;

/** Production pages only — no hand-written `NotePage` literal. */
function buildPages(count: number): NotePage[] {
  return Array.from({ length: count }, (_, index) => createNotePageFromTemplate('blank', NOW, `Level ${index}`));
}

function buildDocument(pages: NotePage[], id = 'nb-outcome'): WorkspaceDocument {
  const notebook = normalizeNoteNotebook({
    id,
    title: 'Outcome Notebook',
    createdAt: NOW,
    updatedAt: NOW,
    trashedAt: null,
    sections: [{
      id: 'sec-outcome',
      title: 'Tree',
      createdAt: NOW,
      updatedAt: NOW,
      trashedAt: null,
      pages,
    }],
  } as NoteNotebook, NOW);
  return {
    id: 'doc-outcome', kind: 'Notes', title: 'Notes', version: 1, modified_at: NOW,
    notebooks: [notebook],
  } as WorkspaceDocument;
}

function findPage(document: WorkspaceDocument, pageId: string): NotePage {
  const page = (document.notebooks ?? [])
    .flatMap((notebook) => notebook.sections)
    .flatMap((section) => section.pages)
    .find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`page ${pageId} is not in the document`);
  return page;
}

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

/**
 * ACT 1: Middle under Leaf — allowed by the fixture snapshot AND by the live snapshot, and written.
 * ACT 2, same mount: Leaf under Middle — a cycle against the LIVE section that ACT 1 just wrote, but not
 * against the frozen fixture snapshot that the render-time report reads. Returns what was measured.
 */
function acceptedThenRefusedMove() {
  const pages = buildPages(3);
  const { api, committed } = mountManager(buildDocument(pages));
  const [leaf, middle, root] = pages;

  expect(api.handleSetPageParent(middle.id, leaf.id), 'ACT 1 Middle under Leaf').toBeNull();
  expect(committed, 'ACT 1 must persist exactly once').toHaveLength(1);
  expect(findPage(committed[0], middle.id).parentPageId).toBe(leaf.id);

  const reverse = api.handleSetPageParent(leaf.id, middle.id);
  return { pages, leaf, middle, root, api, committed, reverse };
}

describe('the reported hierarchy outcome and the written hierarchy change come from one snapshot', () => {
  it('reports the live refusal instead of accepting a move that the write fail-closes', () => {
    const { reverse } = acceptedThenRefusedMove();
    expect(
      reverse?.reason,
      'the live section refuses this move as a cycle, so the report must not be `null`',
    ).toBe('cycle');
    expect(reverse?.message).toContain('circular');
  });

  it('does not persist anything for a refused move, so the notice and the data cannot disagree', () => {
    const { committed, leaf, middle } = acceptedThenRefusedMove();
    expect(
      committed,
      'a refused move must not reach the persist callback at all',
    ).toHaveLength(1);
    expect(findPage(committed[0], leaf.id).parentPageId, 'no cycle in the persisted data').toBeNull();
    expect(findPage(committed[0], middle.id).parentPageId).toBe(leaf.id);
  });

  it('still reports and writes a legal move in the same mount', () => {
    const { api, committed, root, middle, leaf } = acceptedThenRefusedMove();
    // The control for the other half of the invariant: "reported accepted" must mean "written". Measured as a
    // delta so this control does not inherit a phantom write from ACT 2.
    const before = committed.length;
    expect(api.handleSetPageParent(root.id, middle.id), 'ACT 3 Root under Middle').toBeNull();
    expect(committed, 'exactly one further document for the accepted move').toHaveLength(before + 1);
    const last = committed[committed.length - 1];
    expect(findPage(last, root.id).parentPageId).toBe(middle.id);
    expect(findPage(last, leaf.id).parentPageId, 'the refused move is still absent').toBeNull();
  });

  it('reports a page that the live section already knows about as accepted, not as "missing"', () => {
    // Mirror direction of the same defect, measured before the fix: a page created in this mount exists in
    // `notebooksRef.current` but not in the frozen render-time memo, so the render-time check answered
    // `missing` ("That page is no longer part of this section.") for a page that IS part of the section —
    // a false refusal, and the legal move was dropped on the floor.
    const pages = buildPages(2);
    const { api, committed } = mountManager(buildDocument(pages, 'nb-created'));
    const [anchor] = pages;

    const created = api.handleCreatePage('blank');
    expect(created, 'the production create handler must return the page').not.toBeNull();
    const createdId = (created as NotePage).id;
    expect(committed, 'creating a page persists once').toHaveLength(1);

    const outcome = api.handleSetPageParent(createdId, anchor.id);
    expect(
      outcome,
      'the new page is in the live section, so the move must not be reported as missing',
    ).toBeNull();
    expect(committed, 'the accepted move must be persisted').toHaveLength(2);
    expect(findPage(committed[1], createdId).parentPageId).toBe(anchor.id);
  });
});
