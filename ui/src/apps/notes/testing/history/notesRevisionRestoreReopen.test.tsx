// STATUS: instrument — executes the **real** `useNotesManager.handleRestoreRevision` and then closes and
// reopens the persisted document.
//
// AST-0716 / AST-0718 acceptance: "Frühere Version wiederherstellen ohne neuere Texte zu verlieren" and
// "Prüfe Save→Close→Reopen auf identische Nutzdaten für: Frühere Version wiederherstellen ohne neuere
// Texte zu verlieren."
//
// Why this file exists (audit `PER_ID_AUDIT_NOTES_0641_0720.md` §19.1 finding T-1 / §20.6):
// `notesNotebookFullAcceptance.test.tsx:130` is titled "a revision restores an earlier finding without
// losing the newer text", but its body only calls the **pure planner** `planRevisionRestore` and asserts
// `patch` / `safetyRevision`. It never calls `handleRestoreRevision`, never reaches `applyPagePatch` /
// `replaceNotebook`, and never reopens anything. In the whole `ui/` tree `handleRestoreRevision` was
// executed by **no** test — it was only string-matched (`NotesEditor.batchD.contract.test.mjs:25`) and
// pinned by `toContain` on the manager source. And no fixture anywhere carried a **populated** `revisions`
// array, so the shape the restore path actually consumes was never fed through a reopen.
//
// What this file does NOT claim:
//   * It does **not** dispatch a real `pointerdown`/`click` on the `Restore` button. `ui/package.json` has
//     no jsdom/happy-dom/@testing-library, so no test in this tree can drive a real DOM event. The
//     visible-button → `onRestoreVersion` → `useNotesEditorController` → `useNotesManager` hop is still
//     covered only by `toContain` source contracts (`NotesEditor.batchD.contract.test.mjs:29-31`).
//   * It does **not** close or reopen a window, a file, the native host, or the encrypted `.vnote`
//     container. "Close" and "reopen" below mean: the document that `onUpdateDocument` produced is
//     JSON-serialised, every in-memory reference is dropped, and a **fresh** `useNotesManager` instance is
//     mounted from the parsed bytes. That is a persistence round trip through the production persistence
//     callback's output — it is not a host file round trip.
//   * It does **not** prove anything about the installed application. No PASS verdict is written here.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  NoteNotebook,
  NotePage,
  NotePageRevision,
  WorkspaceDocument,
} from '../../../../shared/contracts/workspace';
import { useNotesManager } from '../../notebooks/useNotesManager';
import { createNotePageFromTemplate } from '../../model/noteModel';
import { createPageRevision, normalizeNoteNotebook } from '../../model/notesHierarchy';
import { applyPagePatch } from '../../model/notesPageMutations';
import { NOTE_RESTORE_SAFETY_PREFIX } from '../../history/notesRevisionRestore';

const NOW = 1_700_000_000_000;
const EARLIER_TEXT = '# Finding 00\n\nEarlier evidence from the first pass.';
const NEWER_TEXT = '# Finding 00\n\nThe newer evidence that must not be lost by the restore.';

/**
 * The whole persisted document is built through production code:
 *   * the page shape comes from `createNotePageFromTemplate` (17 fields, `revisions: []`);
 *   * every revision in the populated array comes from `createPageRevision` or from the real write path
 *     `applyPagePatch` → `appendPageRevision`;
 *   * the target page's *current* state is written by `applyPagePatch`, i.e. the same function
 *     `useNotesManager.handleUpdateCurrentPage` calls;
 *   * the notebook is put through `normalizeNoteNotebook`, the only shape any page coming from disk takes.
 * No hand-written `NotePage` literal appears in this file.
 */
interface Fixture {
  document: WorkspaceDocument;
  targetPageId: string;
  linkerPageId: string;
  earlierRevisionId: string;
  currentContent: string;
  currentRevisionIds: string[];
}

function buildFixture(): Fixture {
  // 1. A production page, empty.
  const created = createNotePageFromTemplate('blank', NOW, 'Finding 00');

  // 2. The "earlier" state exists and is captured into a revision by the production revision factory
  //    after the production write path ran on it.
  const earlierState = applyPagePatch({ ...created, content: '' }, { content: EARLIER_TEXT }, NOW - 60_000);
  const earlierRevision: NotePageRevision = {
    ...createPageRevision(earlierState, NOW - 60_000),
    id: 'rev-earlier-pass-1',
  };

  // 3. The page is *reopened* with a POPULATED revisions array (the shape the audit found nowhere), and
  //    then the newer text is written through the same production write path, which appends the second,
  //    newer revision itself.
  const reopenedWithRevisions: NotePage = { ...created, content: '', revisions: [earlierRevision] };
  const current: NotePage = applyPagePatch(reopenedWithRevisions, { content: NEWER_TEXT }, NOW);

  // 4. A second page links to the target, so the derived backlink index is part of what travels.
  const linker = applyPagePatch(
    createNotePageFromTemplate('blank', NOW, 'Method'),
    { content: '# Method\n\nProtocol. See [[Finding 00]].' },
    NOW,
  );

  // The target is a genuine SUBPAGE of the linker, so a restore that replaced the page instead of
  // merging into it would visibly lose `parentPageId` — the field the audit names for AST-0653/0718.
  const currentAsSubpage: NotePage = { ...current, parentPageId: linker.id };

  const notebook = normalizeNoteNotebook({
    id: 'nb-research',
    title: 'Research Notebook',
    createdAt: NOW,
    updatedAt: NOW,
    trashedAt: null,
    sections: [{
      id: 'sec-evidence',
      title: 'Evidence',
      createdAt: NOW,
      updatedAt: NOW,
      trashedAt: null,
      pages: [currentAsSubpage, linker],
    }],
  } as NoteNotebook, NOW);

  return {
    document: {
      id: 'doc-notes',
      kind: 'Notes',
      title: 'Notes',
      version: 3,
      modified_at: NOW,
      notebooks: [notebook],
    } as WorkspaceDocument,
    targetPageId: currentAsSubpage.id,
    linkerPageId: linker.id,
    earlierRevisionId: earlierRevision.id,
    currentContent: NEWER_TEXT,
    currentRevisionIds: (currentAsSubpage.revisions ?? []).map((revision) => revision.id),
  };
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
 * Mounts the **real** `useNotesManager` and returns its live API plus a recorder for everything the
 * production persist callback was handed.
 *
 * `renderToStaticMarkup` is what makes this possible without a DOM: measured in this round, React 19's
 * server renderer executes the hook body, so `useState`/`useMemo`/`useRef` resolve and the returned
 * functions are the production closures. What an SSR pass does **not** give you is a second render pass
 * or an effect flush — which is exactly why every assertion below reads the document handed to
 * `onUpdateDocument` (advanced synchronously by `persistNotebooks` via `notebooksRef`) instead of reading
 * re-rendered React state.
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

describe('AST-0716/AST-0718 · restoring a revision, then close and reopen', () => {
  it('the fixture really is a production-shaped page with a POPULATED revisions array', () => {
    // Guards the pre-condition the audit found missing everywhere: if this ever collapses to `[]`, the
    // reopen below would stop exercising the restore path's input shape.
    const { document, targetPageId, linkerPageId } = buildFixture();
    const page = findPage(document, targetPageId);
    expect(page.title).toBe('Finding 00');
    expect(page.revisions?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Created by production code, not by a literal: `applyPagePatch` → `appendPageRevision`.
    expect(page.revisions?.some((revision) => revision.content === NEWER_TEXT)).toBe(true);
    expect(page.revisions?.some((revision) => revision.content === EARLIER_TEXT)).toBe(true);
    expect(page.content).toBe(NEWER_TEXT);
    // Fields the audit named as at risk of being wiped by a restore are genuinely non-default here, so
    // the wipe-guards in the next test cannot pass vacuously.
    expect(page.parentPageId).toBe(linkerPageId);
    expect(page.templateId).toBe('blank');
    expect(page.attachments).toEqual([]);
  });

  it('handleRestoreRevision restores the earlier text, keeps the newer text as a revision, and the reopened document still carries both', () => {
    const { document, targetPageId, linkerPageId, earlierRevisionId, currentContent, currentRevisionIds } = buildFixture();
    const before = findPage(document, targetPageId);
    const earlier = (before.revisions ?? []).find((revision) => revision.id === earlierRevisionId);
    expect(earlier, 'the earlier revision must exist in the populated array').toBeDefined();

    // --- ACT: the real entry point, on the real hook, with the populated-revisions page selected. -----
    const { api, committed } = mountManager(document);
    expect(api.activePage?.id, 'the target page must be the active page').toBe(targetPageId);
    const outcome = api.handleRestoreRevision(earlier as NotePageRevision);

    // --- The production persist callback must have been reached. --------------------------------------
    expect(committed.length, 'handleRestoreRevision must call onUpdateDocument exactly once').toBe(1);
    const saved = committed[0];
    expect(saved.version).toBe(document.version + 1);

    // --- The restored state: earlier text is back, newer text is NOT gone. ----------------------------
    const restored = findPage(saved, targetPageId);
    expect(restored.content).toBe(EARLIER_TEXT);
    expect(restored.last_modified).toBeGreaterThan(before.last_modified);

    const safetyRevision = (restored.revisions ?? [])
      .find((revision) => (revision.name ?? '').startsWith(NOTE_RESTORE_SAFETY_PREFIX));
    expect(safetyRevision, 'a safety revision named by the production prefix must exist after the restore').toBeDefined();
    expect(safetyRevision?.content, 'the safety revision must hold the NEWER text').toBe(currentContent);
    expect(safetyRevision?.title).toBe(before.title);
    expect(safetyRevision?.tags).toEqual(before.tags);
    expect(safetyRevision?.id, 'the safety revision gets its own production id').not.toBe(earlierRevisionId);
    // The revision the user asked for is still in the history, and so is the captured newer text.
    expect((restored.revisions ?? []).some((revision) => revision.id === earlierRevisionId)).toBe(true);
    expect((restored.revisions ?? []).map((revision) => revision.id)).toEqual(
      expect.arrayContaining(currentRevisionIds),
    );
    // The outcome is a real outcome, not a bare boolean.
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain('safety revision');

    // Fields the restore patch does not name must survive the merge instead of being wiped. This is the
    // exact defect class the audit named for revisions (`parentPageId`, hierarchy, task bindings).
    expect(restored.id).toBe(before.id);
    expect(restored.parentPageId, 'the subpage parent must survive the restore').toBe(linkerPageId);
    expect(restored.created_at).toBe(before.created_at);
    expect(restored.templateId).toBe(before.templateId);
    expect(restored.attachments).toEqual(before.attachments);

    // --- CLOSE: drop every in-memory reference; keep only what was persisted. -------------------------
    const persistedBytes = new TextEncoder().encode(JSON.stringify(saved));
    expect(persistedBytes.byteLength).toBeGreaterThan(0);
    const onDisk = JSON.parse(new TextDecoder().decode(persistedBytes)) as WorkspaceDocument;

    // --- REOPEN: a completely fresh manager instance over the parsed document. ------------------------
    const { api: reopenedApi } = mountManager(onDisk);
    const reopened = reopenedApi.activePage;
    expect(reopened, 'a reopened manager must still expose the page').not.toBeNull();
    expect(reopened?.id).toBe(targetPageId);
    expect(reopened?.content, 'the restored earlier text must survive the reopen').toBe(EARLIER_TEXT);
    const reopenedSafety = (reopened?.revisions ?? [])
      .find((revision) => (revision.name ?? '').startsWith(NOTE_RESTORE_SAFETY_PREFIX));
    expect(reopenedSafety, 'the safety revision must survive the reopen').toBeDefined();
    expect(reopenedSafety?.content, 'the newer text must still be readable after the reopen').toBe(currentContent);
    expect((reopened?.revisions ?? []).some((revision) => revision.id === earlierRevisionId)).toBe(true);
    expect(reopened?.parentPageId, 'the subpage parent must survive the reopen too').toBe(linkerPageId);
    // The derived backlink index is re-derived on reopen and the `[[Finding 00]]` link still resolves,
    // i.e. the restore did not cost the page its incoming link.
    expect(reopenedApi.knowledgeIndex.incoming.get(targetPageId) ?? []).toContain(linkerPageId);
    // The initial manager remains a different object, i.e. the reopen was not served from the first mount.
    expect(reopenedApi.activePage).not.toBe(api.activePage);
  });

  it('refuses a revision identical to the current state instead of writing a no-op safety revision', () => {
    const { document, targetPageId, currentContent } = buildFixture();
    const { api, committed } = mountManager(document);
    // A copy of the live state, exactly what `createPageRevision(activePage)` produces.
    const identical = { ...createPageRevision(findPage(document, targetPageId), NOW), id: 'rev-identical' };
    expect(identical.content).toBe(currentContent);
    const outcome = api.handleRestoreRevision(identical);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('identical');
    // Fail-closed: nothing was committed at all.
    expect(committed).toEqual([]);
  });

  it('restores the editor mode and the canvas of a freeform revision', () => {
    // DEF-NOTES-004: the revision must carry the mode and the canvas, otherwise restoring a freeform
    // revision silently produced an empty document page. Asserted here through the *applied* document.
    const created = createNotePageFromTemplate('blank', NOW, 'Canvas page');
    const canvas = {
      pageMode: 'infinite' as const, pageSize: 'A4' as const, background: 'grid' as const,
      backgroundColor: '#0a0d14',
      blocks: [{ id: 'block-1', kind: 'text' as const, x: 10, y: 20, width: 320, height: 160, zIndex: 1, text: 'card' }],
    };
    const freeform = applyPagePatch(
      { ...created, content: '', editorMode: 'document' as const },
      { content: 'drawing notes', editorMode: 'freeform' as const, canvas },
      NOW - 60_000,
    );
    const revision: NotePageRevision = { ...createPageRevision(freeform, NOW - 60_000), id: 'rev-freeform-1' };
    const documentPage = applyPagePatch(
      { ...created, content: '', revisions: [revision] },
      { content: 'plain text now', editorMode: 'document' as const },
      NOW,
    );
    const notebook = normalizeNoteNotebook({
      id: 'nb-canvas', title: 'Canvas Notebook', createdAt: NOW, updatedAt: NOW, trashedAt: null,
      sections: [{ id: 'sec', title: 'Section', createdAt: NOW, updatedAt: NOW, trashedAt: null, pages: [documentPage] }],
    } as NoteNotebook, NOW);
    const document = {
      id: 'doc-canvas', kind: 'Notes', title: 'Notes', version: 1, modified_at: NOW, notebooks: [notebook],
    } as WorkspaceDocument;
    expect((documentPage.revisions ?? []).length, 'populated revisions').toBeGreaterThan(0);

    const { api, committed } = mountManager(document);
    const outcome = api.handleRestoreRevision(revision);
    expect(outcome.ok).toBe(true);
    const after = findPage(committed[0], documentPage.id);
    expect(after.editorMode).toBe('freeform');
    expect(after.canvas).toEqual(canvas);
    expect(after.canvas?.blocks[0]?.id).toBe('block-1');
    const safety = (after.revisions ?? []).find((rev) => (rev.name ?? '').startsWith(NOTE_RESTORE_SAFETY_PREFIX));
    expect(safety?.editorMode, 'the safety revision must snapshot the mode too').toBe('document');
    expect(safety?.canvas, 'a document-mode page has no canvas to snapshot').toBeUndefined();
  });
});
