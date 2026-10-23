// STATUS: instrument — executes the **real** `useNotesManager.saveCurrentSearch` /
// `deleteSavedSearch` (via `useNotesSearch`), then closes and reopens the persisted document.
//
// AST-0683 acceptance: "Treffer öffnen, Fundstelle hervorheben und Filter anwenden … Prüfe
// Save→Close→Reopen auf identische Nutzdaten." (the saved-search half of that row).
//
// Why this file exists (audit `PER_ID_AUDIT_NOTES_0641_0720.md`, AST-0683 row, line 224):
//   * "**No witness round-trips a saved search**; the encrypted-container test covers pages, not
//     `savedSearches`."
//   * A grep over `ui/src/apps/notes/testing` for `saveCurrentSearch` returns **zero** call sites, and no
//     test mounts `useNotesSearch` or `useNotesManager` with a saved search. `createNoteSavedSearch`
//     (`search/notesSearchEngine.ts:376`) is likewise called by no test.
//
// The pre-existing record in the fixture is built by the production factory `createNoteSavedSearch` with a
// non-default value in every documented field, so the reopen path is measured on real data rather than on
// an empty default. The record added during the test is written by the production handler.
//
// Two measured limits of the SSR instrument, both load-bearing and both asserted below:
//   * The `setSearchQuery` / `setSearchScope` / `setSelectedTagFilter` setters in `useNotesSearch` do not
//     flush without a second render, so `saveCurrentSearch` in this file persists the **initial** search
//     state (empty query, scope `section`, no tag, no dates). The name is the part this witness can drive;
//     the rich pre-existing record is what proves the other fields round-trip.
//   * `api.savedSearches` is read from the render-time `notebooks` memo, so it cannot observe a record added
//     during the same mount. The ACT assertions therefore read the document handed to `onUpdateDocument`.
//
// No PASS verdict is written here.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useNotesManager } from '../../notebooks/useNotesManager';
import { createNotePageFromTemplate } from '../../model/noteModel';
import { normalizeNoteNotebook } from '../../model/notesHierarchy';
import { createNoteSavedSearch } from '../../search/notesSearchEngine';

const NOW = 1_700_000_000_000;
const RICH_ID = 'search-pre-existing';
const NEW_NAME = 'Evidence review';

/**
 * The rich record is produced by the production factory with every documented field non-default, then
 * normalised by `normalizeNoteNotebook` — the path a saved search coming from disk takes.
 */
function buildFixture() {
  const page: NotePage = createNotePageFromTemplate('blank', NOW, 'Finding 00');
  const rich = createNoteSavedSearch({
    id: RICH_ID,
    name: 'Reviewed evidence',
    query: 'prop:status=reviewed tag:evidence',
    scope: 'notebook',
    tag: 'evidence',
    dateFrom: NOW - 30 * 86_400_000,
    dateTo: NOW,
    includeArchived: true,
    favoritesOnly: true,
    now: NOW,
  });
  const notebook = normalizeNoteNotebook({
    id: 'nb-search', title: 'Search Notebook', createdAt: NOW, updatedAt: NOW, trashedAt: null,
    savedSearches: [rich],
    sections: [{ id: 'sec', title: 'Section', createdAt: NOW, updatedAt: NOW, trashedAt: null, pages: [page] }],
  } as NoteNotebook, NOW);
  const document = {
    id: 'doc-search', kind: 'Notes', title: 'Notes', version: 1, modified_at: NOW, notebooks: [notebook],
  } as WorkspaceDocument;
  return { document, rich: notebook.savedSearches?.[0] as NonNullable<NoteNotebook['savedSearches']>[number] };
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

function close(document: WorkspaceDocument): WorkspaceDocument {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  return JSON.parse(new TextDecoder().decode(bytes)) as WorkspaceDocument;
}

function savedSearchesOf(document: WorkspaceDocument) {
  return (document.notebooks ?? [])[0]?.savedSearches ?? [];
}

describe('AST-0683 · saved searches, then close and reopen', () => {
  it('the fixture really carries a POPULATED saved search with every documented field non-default', () => {
    const { document, rich } = buildFixture();
    const stored = savedSearchesOf(document);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(rich);
    // Non-default in every field, so the reopen assertions below cannot pass vacuously.
    expect(rich.id).toBe(RICH_ID);
    expect(rich.name).toBe('Reviewed evidence');
    expect(rich.query).toBe('prop:status=reviewed tag:evidence');
    expect(rich.scope).toBe('notebook');
    expect(rich.tag).toBe('evidence');
    expect(rich.dateFrom).toBe(NOW - 30 * 86_400_000);
    expect(rich.dateTo).toBe(NOW);
    expect(rich.includeArchived).toBe(true);
    expect(rich.favoritesOnly).toBe(true);
    expect(rich.createdAt).toBe(NOW);
  });

  it('a pre-existing saved search is byte-identical after the reopen', () => {
    const { document, rich } = buildFixture();
    expect(savedSearchesOf(close(document))[0]).toEqual(rich);
    const reopened = mountManager(close(document));
    expect(reopened.api.savedSearches).toEqual([rich]);
    expect(reopened.committed, 'a fresh mount must not write').toEqual([]);
  });

  it('a search saved through the real handler survives the reopen, and a deletion through the real handler does too', () => {
    const { document, rich } = buildFixture();

    // --- ACT 1: save the current search through the production handler. -----------------------------
    const saving = mountManager(document);
    expect(saving.api.savedSearches).toEqual([rich]);
    saving.api.saveCurrentSearch(NEW_NAME);
    expect(saving.committed).toHaveLength(1);
    const afterSave = savedSearchesOf(saving.committed[0]);
    expect(afterSave).toHaveLength(2);
    const added = afterSave[1];
    expect(added.id).toMatch(/^search-/);
    expect(added).toMatchObject({
      name: NEW_NAME,
      // The SSR-initial search state: the setters in `useNotesSearch` have no second render to flush into.
      query: '', scope: 'section', tag: null, dateFrom: null, dateTo: null,
      includeArchived: false, favoritesOnly: false,
    });
    // The pre-existing record is untouched by the save.
    expect(afterSave[0]).toEqual(rich);

    // --- ACT 2: delete the pre-existing record through the production handler. ----------------------
    const deleting = mountManager(saving.committed[0]);
    deleting.api.deleteSavedSearch(RICH_ID);
    expect(deleting.committed).toHaveLength(1);
    const afterDelete = savedSearchesOf(deleting.committed[0]);
    expect(afterDelete.map((entry) => entry.id)).toEqual([added.id]);

    // --- CLOSE → REOPEN. ----------------------------------------------------------------------------
    const onDisk = close(deleting.committed[0]);
    expect(savedSearchesOf(onDisk).map((entry) => entry.id), 'the byte round trip keeps the deletion').toEqual([added.id]);
    const reopened = mountManager(onDisk);
    expect(reopened.api.savedSearches).toHaveLength(1);
    expect(reopened.api.savedSearches?.[0]).toEqual(added);
    // The deleted record is gone for good, and the surviving record keeps its id, name and timestamps.
    expect(reopened.api.savedSearches?.some((entry) => entry.id === RICH_ID)).toBe(false);
    expect(reopened.api.savedSearches?.[0]?.name).toBe(NEW_NAME);
    expect(reopened.api.savedSearches?.[0]?.createdAt).toBe(added.createdAt);
    expect(reopened.api.savedSearches?.[0]?.updatedAt).toBe(added.updatedAt);
    expect(reopened.committed, 'the reopen itself must not write').toEqual([]);
  });
});
