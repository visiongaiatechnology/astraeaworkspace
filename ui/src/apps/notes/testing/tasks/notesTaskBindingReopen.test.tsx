// STATUS: instrument — executes the **real** `useNotesManager.handleConvertChecklistToTask`, then closes
// and reopens the persisted document (page binding AND `workManagementData.tasks`).
//
// AST-0663 acceptance: "Aufgabenliste anlegen und optional mit Tasks verknüpfen … Prüfe Save→Close→Reopen
// auf identische Nutzdaten."
//
// Why this file exists (audit `PER_ID_AUDIT_NOTES_0641_0720.md`, AST-0663 row, line 168):
//   * "**No witness round-trips a task binding or a converted task through close/reopen**;
//     `notesNotebookAcceptance.test.ts` exports/imports page payloads only (title/content/tags/properties),
//     never `taskBindings` or `workManagementData`."
//   * A grep over `ui/src/apps/notes/testing` for `handleConvertChecklistToTask` returns **zero** call
//     sites. The only existing witness is `notesTagsTasks.test.ts:56-80`, which calls the pure
//     `convertChecklistToCanonicalTask` and never mounts a manager, never reaches `persistNotebooks`, and
//     never reopens.
//
// The strongest assertion here is not "the binding is still there". It is that after the reopen the
// conversion is **idempotent** — `convertChecklistToCanonicalTask` only returns the existing task when the
// `^task-…` marker AND the canonical task are both present, so a second conversion after the reopen can
// only be a no-op if the task list really was reconstructed from the reopened bytes. And the checkbox on the
// markdown line is re-derived **from the canonical task** on the fresh mount, which is a behaviour that is
// invisible without a reopen.
//
// What this file does NOT claim:
//   * No real `click` on a checklist item: `ui/package.json` has no jsdom / happy-dom / @testing-library.
//   * No window, no file, no native host, no `.vnote`. "Close" is `JSON.stringify`, "reopen" is
//     `JSON.parse` plus a fresh `useNotesManager` mount.
//   * The task list is flipped to `completed` between close and reopen to simulate the Tasks app writing
//     while Notes was shut. That edit is applied to the **persisted bytes**, not to the fixture, and the
//     unflipped mount is asserted as the negative control.
//   * No PASS verdict is written here.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useNotesManager } from '../../notebooks/useNotesManager';
import { createNotePageFromTemplate } from '../../model/noteModel';
import { normalizeNoteNotebook } from '../../model/notesHierarchy';
import { applyPagePatch } from '../../model/notesPageMutations';

const NOW = 1_700_000_000_000;
const DOCUMENT_ID = 'doc-tasks';
const CHECKLIST_LINE_INDEX = 2;
const CHECKLIST = ['# Sprint', '', '- [ ] Ship the fix', '- [x] Write the test'].join('\n');

/**
 * The page comes from the production template factory and its body is written by the production write path
 * `applyPagePatch` — the same function `useNotesManager.handleUpdateCurrentPage` calls. No hand-written
 * `NotePage` literal.
 */
function buildFixture() {
  const page = applyPagePatch(
    createNotePageFromTemplate('project', NOW, 'Sprint'),
    { content: CHECKLIST },
    NOW,
  );
  const notebook = normalizeNoteNotebook({
    id: 'nb-tasks', title: 'Sprint Notebook', createdAt: NOW, updatedAt: NOW, trashedAt: null,
    sections: [{ id: 'sec-sprint', title: 'Sprint', createdAt: NOW, updatedAt: NOW, trashedAt: null, pages: [page] }],
  } as NoteNotebook, NOW);
  const document = {
    id: DOCUMENT_ID, kind: 'Notes', title: 'Notes', version: 1, modified_at: NOW, notebooks: [notebook],
  } as WorkspaceDocument;
  return { document, pageId: page.id };
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

/** CLOSE: keep only the bytes. */
function close(document: WorkspaceDocument): { onDisk: WorkspaceDocument; bytes: Uint8Array } {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  return { onDisk: JSON.parse(new TextDecoder().decode(bytes)) as WorkspaceDocument, bytes };
}

function lineAt(content: string, index: number): string {
  return content.split('\n')[index] ?? '';
}

describe('AST-0663 · a checklist item converted to a canonical task, then close and reopen', () => {
  it('the fixture really carries an unconverted checklist on a production page', () => {
    const { document, pageId } = buildFixture();
    const page = findPage(document, pageId);
    expect(lineAt(page.content, CHECKLIST_LINE_INDEX)).toBe('- [ ] Ship the fix');
    expect(page.taskBindings ?? []).toEqual([]);
    expect(document.workManagementData ?? document.workData).toBeUndefined();
    expect(page.revisions?.length ?? 0).toBeGreaterThan(0);
  });

  it('the conversion writes the binding, the marker and the canonical task into one persisted document, and all three survive the reopen', () => {
    const { document, pageId } = buildFixture();
    const revisionsBefore = findPage(document, pageId).revisions?.length ?? 0;

    // --- ACT: the real handler. ---------------------------------------------------------------------
    const { api, committed } = mountManager(document);
    expect(api.activePage?.id).toBe(pageId);
    const outcome = api.handleConvertChecklistToTask(CHECKLIST_LINE_INDEX);

    expect(outcome.ok).toBe(true);
    expect(outcome.taskId, 'a real task id is reported').toMatch(/^task-/);
    expect(outcome.message).toContain('Ship the fix');
    expect(committed).toHaveLength(1);

    // --- The applied page: marker + binding + a revision (audit: useNotesManager.ts:573). -----------
    const saved = committed[0];
    const savedPage = findPage(saved, pageId);
    expect(lineAt(savedPage.content, CHECKLIST_LINE_INDEX)).toMatch(/^- \[ \] Ship the fix \^task-[A-Za-z0-9_-]+$/);
    expect(savedPage.taskBindings).toHaveLength(1);
    expect(savedPage.taskBindings?.[0]).toMatchObject({
      taskId: outcome.taskId, source: 'markdown', sync: 'bidirectional',
    });
    expect(savedPage.taskBindings?.[0].sourceKey).toBe(lineAt(savedPage.content, CHECKLIST_LINE_INDEX).split('^')[1]);
    expect(savedPage.revisions?.length ?? 0).toBeGreaterThan(revisionsBefore);

    // --- The canonical task really is in the persisted DOCUMENT, not only in the page. --------------
    const savedTasks = saved.workManagementData?.tasks ?? [];
    expect(savedTasks).toHaveLength(1);
    expect(savedTasks[0]).toMatchObject({
      id: outcome.taskId, title: 'Ship the fix', completed: false, plannerColumn: 'todo',
    });
    expect(savedTasks[0].linkedWorkspaceUris).toEqual([`vgt://workspace/document/${DOCUMENT_ID}/page/${pageId}`]);
    expect(savedTasks[0].tags).toEqual(savedPage.tags);

    // --- CLOSE → REOPEN. ----------------------------------------------------------------------------
    const { onDisk } = close(saved);
    expect(onDisk.workManagementData?.tasks?.[0]?.id, 'the task survives the byte round trip').toBe(outcome.taskId);
    const reopenedMount = mountManager(onDisk);
    const reopened = reopenedMount.api;

    const reopenedPage = reopened.activePage;
    expect(reopenedPage?.id).toBe(pageId);
    expect(lineAt(reopenedPage?.content ?? '', CHECKLIST_LINE_INDEX)).toBe(lineAt(savedPage.content, CHECKLIST_LINE_INDEX));
    expect(reopenedPage?.taskBindings?.[0]?.taskId, 'the binding survives the reopen').toBe(outcome.taskId);
    expect(reopenedPage?.revisions?.length).toBe(savedPage.revisions?.length);

    // --- The reopen-only behaviour: the SECOND conversion is a no-op, because both halves of the link
    //     were reconstructed. This fails if either the marker or the canonical task was lost.
    const again = reopened.handleConvertChecklistToTask(CHECKLIST_LINE_INDEX);
    expect(again.ok).toBe(true);
    expect(again.message, 'an already-linked line must be recognised as such after the reopen').toContain('already linked');
    expect(reopenedMount.committed, 'a no-op conversion must not write').toEqual([]);
    expect(reopened.activePage?.taskBindings).toHaveLength(1);
  });

  it('re-derives the markdown checkbox FROM the canonical task on a fresh mount — the Tasks app wrote while Notes was closed', () => {
    const { document, pageId } = buildFixture();
    const { api, committed } = mountManager(document);
    api.handleConvertChecklistToTask(CHECKLIST_LINE_INDEX);
    const { onDisk } = close(committed[0]);

    // Negative control: with the task untouched, the reopened line is still unchecked.
    const untouched = mountManager(onDisk);
    expect(lineAt(untouched.api.activePage?.content ?? '', CHECKLIST_LINE_INDEX)).toMatch(/^- \[ \] Ship the fix \^task-/);

    // The Tasks app completes the task while Notes is closed: the *persisted bytes* change, the page does not.
    const flipped = JSON.parse(JSON.stringify(onDisk)) as WorkspaceDocument;
    const tasks = flipped.workManagementData?.tasks ?? [];
    expect(tasks).toHaveLength(1);
    tasks[0] = { ...tasks[0], completed: true, progress: 100, plannerColumn: 'done' };
    expect(findPage(flipped, pageId).content).toBe(findPage(onDisk, pageId).content);

    const remounted = mountManager(flipped);
    expect(
      lineAt(remounted.api.activePage?.content ?? '', CHECKLIST_LINE_INDEX),
      'the checkbox must be re-derived from the canonical task on mount',
    ).toMatch(/^- \[x\] Ship the fix \^task-/);
    // The binding is unchanged by the sync: the write direction is task → note only.
    expect(remounted.api.activePage?.taskBindings?.[0]?.sync).toBe('bidirectional');
    expect(remounted.committed, 'the mount itself must not write').toEqual([]);

    // The other line has no binding and must not be touched.
    expect(lineAt(remounted.api.activePage?.content ?? '', 3)).toBe('- [x] Write the test');
  });
});
