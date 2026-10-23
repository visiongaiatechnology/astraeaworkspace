// STATUS: instrument — executes the **real** `useNotesManager.handleUpsertCustomTag`,
// `handleDeleteCustomTag` and `handleCreateSmartCollection`, then closes and reopens the persisted document.
//
// AST-0678 acceptance: "Tag/Datum/Status editieren und in Suche verwenden … Prüfe Save→Close→Reopen auf
// identische Nutzdaten." (the tag-definition and smart-collection half of that row).
//
// Why this file exists (audit `PER_ID_AUDIT_NOTES_0641_0720.md`, AST-0678 row, line 210):
//   * "Tag definitions/smart collections/saved searches have **no** reopen witness."
//   * A grep over `ui/src/apps/notes/testing` for `handleUpsertCustomTag` / `handleDeleteCustomTag` /
//     `handleCreateSmartCollection` returns **zero** call sites, and `notesTagsTasks.test.ts` never calls
//     `upsertCustomNoteTag` / `deleteCustomNoteTag` / `createSmartCollection` either — so `upsertCustomNoteTag`
//     and `createSmartCollection` were executed by no test at all before this file.
//   * `normalizeNoteNotebook` passes `tagDefinitions` and `smartCollections` through by object spread
//     (`notesHierarchy.ts:133-134`); they are the two notebook collections that the reopen path does not
//     name. That is exactly why a defect there is invisible to every existing witness.
//
// What this file does NOT claim:
//   * No real `click` on the tag manager or the smart-collection dialog; no DOM event is dispatched.
//   * No window, no file, no native host, no `.vnote` container.
//   * No PASS verdict is written here.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useNotesManager } from '../../notebooks/useNotesManager';
import { createNotePageFromTemplate } from '../../model/noteModel';
import { normalizeNoteNotebook } from '../../model/notesHierarchy';
import { BUILT_IN_NOTE_TAGS, noteTagKey } from '../../model/notesTagsTasks';

const NOW = 1_700_000_000_000;
const TAG_NAME = 'Evidence';
const TAG_ICON = '★';
const TAG_COLOR = '#22c55e';
const COLLECTION_NAME = 'Reviewed evidence';

function buildFixture() {
  const page: NotePage = createNotePageFromTemplate('blank', NOW, 'Finding 00');
  const notebook = normalizeNoteNotebook({
    id: 'nb-tags', title: 'Tag Notebook', createdAt: NOW, updatedAt: NOW, trashedAt: null,
    sections: [{ id: 'sec', title: 'Section', createdAt: NOW, updatedAt: NOW, trashedAt: null, pages: [page] }],
  } as NoteNotebook, NOW);
  const document = {
    id: 'doc-tags', kind: 'Notes', title: 'Notes', version: 1, modified_at: NOW, notebooks: [notebook],
  } as WorkspaceDocument;
  return { document, pageId: page.id };
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

function notebookOf(document: WorkspaceDocument): NoteNotebook {
  const notebook = (document.notebooks ?? [])[0];
  if (!notebook) throw new Error('the document carries no notebook');
  return notebook;
}

describe('AST-0678 · custom tag definitions and smart collections, then close and reopen', () => {
  it('the fixture starts with no custom definitions and only the built-ins', () => {
    const { document } = buildFixture();
    expect(notebookOf(document).tagDefinitions ?? []).toEqual([]);
    expect(notebookOf(document).smartCollections ?? []).toEqual([]);
    const { api } = mountManager(document);
    // The production read path merges built-ins with the notebook's own definitions.
    expect(api.tagDefinitions.map((tag) => tag.name)).toEqual(BUILT_IN_NOTE_TAGS.map((tag) => tag.name));
    expect(api.tagDefinitions.every((tag) => tag.builtIn)).toBe(true);
  });

  it('a created custom tag and smart collection survive the reopen with their icon, colour and query, and the built-ins are not duplicated', () => {
    const { document } = buildFixture();

    // --- ACT 1: a real custom tag. -----------------------------------------------------------------
    const created = mountManager(document);
    created.api.handleUpsertCustomTag({ name: TAG_NAME, icon: TAG_ICON, color: TAG_COLOR });
    expect(created.committed).toHaveLength(1);
    const afterTag = notebookOf(created.committed[0]);
    expect(afterTag.tagDefinitions).toHaveLength(1);
    expect(afterTag.tagDefinitions?.[0]).toMatchObject({ name: TAG_NAME, icon: TAG_ICON, color: TAG_COLOR, builtIn: false });
    const tagId = afterTag.tagDefinitions?.[0].id;
    expect(tagId).toMatch(/^tag-/);

    // --- ACT 2: a built-in name must not become a second, custom definition. -------------------------
    const second = mountManager(created.committed[0]);
    second.api.handleUpsertCustomTag({ name: 'To Do', icon: '!', color: '#ff0000' });
    expect(second.committed).toHaveLength(1);
    const afterBuiltInAttempt = notebookOf(second.committed[0]).tagDefinitions ?? [];
    expect(afterBuiltInAttempt, 'the built-in name is refused, so no second "To Do" exists').toHaveLength(1);
    expect(afterBuiltInAttempt[0].name).toBe(TAG_NAME);

    // --- ACT 3: a real smart collection. -------------------------------------------------------------
    const third = mountManager(second.committed[0]);
    third.api.handleCreateSmartCollection(COLLECTION_NAME, { tags: [TAG_NAME], match: 'all' });
    expect(third.committed).toHaveLength(1);
    const saved = third.committed[0];
    const collections = notebookOf(saved).smartCollections ?? [];
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({ name: COLLECTION_NAME, query: { tags: [TAG_NAME], match: 'all' } });
    expect(collections[0].id).toMatch(/^smart-/);

    // --- CLOSE → REOPEN. ----------------------------------------------------------------------------
    const onDisk = close(saved);
    const reopened = mountManager(onDisk);
    const reopenedNotebook = notebookOf(onDisk);

    // The definition survived with every documented field.
    expect(reopenedNotebook.tagDefinitions).toHaveLength(1);
    expect(reopenedNotebook.tagDefinitions?.[0]).toEqual({
      id: tagId, name: TAG_NAME, icon: TAG_ICON, color: TAG_COLOR, builtIn: false,
    });
    // And the production read path still presents built-ins + exactly one custom, not two.
    const names = reopened.api.tagDefinitions.map((tag) => tag.name);
    expect(names).toContain(TAG_NAME);
    expect(names.filter((name) => noteTagKey(name) === noteTagKey('To Do'))).toHaveLength(1);
    expect(names.filter((name) => noteTagKey(name) === noteTagKey(TAG_NAME))).toHaveLength(1);
    expect(reopened.api.tagDefinitions).toHaveLength(BUILT_IN_NOTE_TAGS.length + 1);
    expect(reopened.api.tagDefinitions.find((tag) => tag.name === TAG_NAME)?.builtIn).toBe(false);

    // The collection survived with its query.
    expect(reopenedNotebook.smartCollections).toHaveLength(1);
    expect(reopenedNotebook.smartCollections?.[0]).toEqual(collections[0]);
    expect(reopened.api.smartCollections?.[0]?.name).toBe(COLLECTION_NAME);

    // --- A delete after the reopen is persisted through a second round trip. -------------------------
    const deletableMount = mountManager(onDisk);
    deletableMount.api.handleDeleteCustomTag(tagId as string);
    expect(deletableMount.committed).toHaveLength(1);
    expect(notebookOf(deletableMount.committed[0]).tagDefinitions).toEqual([]);
    const afterDelete = close(deletableMount.committed[0]);
    expect(notebookOf(afterDelete).tagDefinitions).toEqual([]);
    // The smart collection is untouched by the tag deletion.
    expect(notebookOf(afterDelete).smartCollections).toHaveLength(1);
    const finalMount = mountManager(afterDelete);
    expect(finalMount.api.tagDefinitions.map((tag) => tag.name)).toEqual(BUILT_IN_NOTE_TAGS.map((tag) => tag.name));
  });
});
