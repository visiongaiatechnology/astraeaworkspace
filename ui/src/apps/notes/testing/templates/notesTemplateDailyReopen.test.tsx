// STATUS: instrument — executes the **real** `useNotesManager.saveTemplate`, `handleCreatePage`
// (against a template that came back from disk) and `handleCreateDailyNote`, then closes and reopens the
// persisted document.
//
// AST-0713 acceptance: "Vorlage wählen und wiederkehrende Tagesnotiz erzeugen … Prüfe Save→Close→Reopen auf
// identische Nutzdaten."
//
// Why this file exists (audit `PER_ID_AUDIT_NOTES_0641_0720.md`, AST-0713 row, line 308):
//   * "**No witness round-trips a template or a daily note**, and no test asserts the 'same day ⇒ one page'
//     invariant across two notebook sections even though `findDailyNotePage` was written for exactly that
//     (`noteModel.ts:96-99`)."
//     **The second half of that premise is wrong, and this file corrects it rather than repeating it:**
//     `notesCanvasAndEditing.test.ts:166-186` already asserts the invariant — it calls `findDailyNotePage`
//     directly against a three-section notebook (a trashed duplicate must not win, a trashed section is
//     skipped, another day yields `null`). What is genuinely unwitnessed is the **handler**: a grep over
//     `ui/src/apps/notes/testing` for `handleCreateDailyNote` returns **zero** call sites, so the invariant
//     had never been checked through a real manager, never through the production write path, and never
//     against a **reopened** notebook — which is the only state in which "recurring" can actually break.
//   * `createTemplateFromPage`, `createTemplateFromSection`, `createTemplateFromNotebook`,
//     `instantiatePageTemplate`, `instantiateSectionTemplate`, `instantiateNotebookTemplate` and
//     `templatesByScope` are called by no test outside this file, and `templates` appears in no other test
//     fixture. So no template was ever saved, reopened and instantiated before this file.
//   * `normalizeNoteNotebook` names `templates` explicitly (`notesHierarchy.ts:141`) — one of the notebook
//     collections whose reopen behaviour no witness measured.
//
// The two behaviours this file pins are reopen-only or reopen-critical:
//   1. A template saved before the close is still **instantiable** after the reopen, and the page it
//      produces carries the template's content, tags and `templateId` — not a blank fallback.
//   2. The "one page per day" invariant of `handleCreateDailyNote` holds **against the reopened notebook**.
//      A second call on a fresh mount must return the same page, not a duplicate. This is what makes a
//      recurring daily note safe across an application restart. (The *pure* invariant is already covered by
//      `notesCanvasAndEditing.test.ts:166-186`; the new value here is the handler plus the reopen.)
//
// What this file does NOT claim:
//   * No real `click` on the template picker or the "daily note" button; no DOM event is dispatched.
//   * No window, no file, no native host, no `.vnote` container.
//   * The daily-note title is derived from `Date.now()`; the two calls happen microseconds apart, so a clock
//     rollover exactly between them would make the invariant assertion fail loudly rather than silently.
//   * The template body below contains a Markdown table. Its survival is **incidental to this witness** and
//     is not claimed as coverage of the AST-0708 table row.
//   * No PASS verdict is written here.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useNotesManager } from '../../notebooks/useNotesManager';
import { createNotePageFromTemplate } from '../../model/noteModel';
import { normalizeNoteNotebook } from '../../model/notesHierarchy';
import { applyPagePatch } from '../../model/notesPageMutations';

const NOW = 1_700_000_000_000;
const TEMPLATE_NAME = 'Sprint Template';
const TEMPLATE_BODY = [
  '# Sprint Journal',
  '',
  '| Day | Focus |',
  '| --- | --- |',
  '| 1 | Reopen |',
  '',
  '- [ ] Keep the template body byte-identical.',
].join('\n');

function buildFixture() {
  const page = applyPagePatch(
    createNotePageFromTemplate('project', NOW, 'Sprint Journal'),
    { content: TEMPLATE_BODY, tags: ['sprint', 'journal'] },
    NOW,
  );
  const notebook = normalizeNoteNotebook({
    id: 'nb-templates', title: 'Template Notebook', createdAt: NOW, updatedAt: NOW, trashedAt: null,
    sections: [{ id: 'sec-a', title: 'Journal', createdAt: NOW, updatedAt: NOW, trashedAt: null, pages: [page] }],
  } as NoteNotebook, NOW);
  const document = {
    id: 'doc-templates', kind: 'Notes', title: 'Notes', version: 1, modified_at: NOW, notebooks: [notebook],
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

function allPages(document: WorkspaceDocument): NotePage[] {
  return pagesOf(document.notebooks ?? []);
}

function pagesOf(notebooks: NoteNotebook[]): NotePage[] {
  return notebooks.flatMap((notebook) => notebook.sections).flatMap((section) => section.pages);
}

describe('AST-0713 · templates and the recurring daily note, then close and reopen', () => {
  it('the fixture starts with no templates and a production page with a distinctive body', () => {
    const { document } = buildFixture();
    expect((document.notebooks ?? [])[0].templates).toEqual([]);
    const page = allPages(document)[0];
    expect(page.content).toBe(TEMPLATE_BODY);
    expect(page.tags).toEqual(['sprint', 'journal']);
  });

  it('a template saved before the close is still instantiable after the reopen, and the page it produces survives a second round trip', () => {
    const { document } = buildFixture();

    // --- ACT: save the active page as a page-scoped template. ---------------------------------------
    const saving = mountManager(document);
    expect(saving.api.activePage?.content).toBe(TEMPLATE_BODY);
    saving.api.saveTemplate('page', TEMPLATE_NAME);
    expect(saving.committed).toHaveLength(1);
    const savedTemplate = ((saving.committed[0].notebooks ?? [])[0].templates ?? [])[0];
    expect(savedTemplate).toBeDefined();
    expect(savedTemplate).toMatchObject({ name: TEMPLATE_NAME, scope: 'page' });
    expect(savedTemplate.id).toMatch(/^tpl-page-/);
    expect(savedTemplate.page?.content).toBe(TEMPLATE_BODY);
    expect(savedTemplate.page?.tags).toEqual(['sprint', 'journal']);

    // --- CLOSE → REOPEN. ----------------------------------------------------------------------------
    const onDisk = close(saving.committed[0]);
    const reopened = mountManager(onDisk);
    const reopenedTemplates = reopened.api.activeNotebook?.templates ?? [];
    expect(reopenedTemplates, 'the template must survive the reopen').toHaveLength(1);
    expect(reopenedTemplates[0]).toEqual(savedTemplate);

    // --- ACT on the REOPENED manager: instantiate the template that came from disk. -----------------
    const instantiated = reopened.api.handleCreatePage(savedTemplate.id);
    expect(instantiated, 'the reopened template must be usable, not a blank fallback').not.toBeNull();
    expect(instantiated?.content, 'the body must come from the template, not from the blank template').toBe(TEMPLATE_BODY);
    expect(instantiated?.tags).toEqual(['sprint', 'journal']);
    expect(instantiated?.templateId, 'the instantiated page points back at the template').toBe(savedTemplate.id);
    expect(instantiated?.id).not.toBe(savedTemplate.id);
    expect(reopened.committed).toHaveLength(1);
    const pagesAfterInstantiate = allPages(reopened.committed[0]);
    expect(pagesAfterInstantiate).toHaveLength(2);
    // The instantiated page is a real page in the notebook, not only a return value.
    expect(pagesAfterInstantiate.some((page) => page.id === instantiated?.id)).toBe(true);

    // --- A second close/reopen keeps the instantiated page and the template. -------------------------
    const secondDisk = close(reopened.committed[0]);
    const finalMount = mountManager(secondDisk);
    const keptPage = allPages(secondDisk).find((page) => page.id === instantiated?.id);
    expect(keptPage?.content).toBe(TEMPLATE_BODY);
    expect(keptPage?.templateId).toBe(savedTemplate.id);
    expect(finalMount.api.activeNotebook?.templates ?? [], 'the template is still there').toHaveLength(1);
    expect(finalMount.committed).toEqual([]);
  });

  it('the one-page-per-day invariant holds against the REOPENED notebook: the second call returns the same page instead of duplicating it', () => {
    const { document } = buildFixture();

    // --- ACT 1: create the daily note. --------------------------------------------------------------
    const creating = mountManager(document);
    const first = creating.api.handleCreateDailyNote();
    expect(first).not.toBeNull();
    expect(first?.templateId).toBe('daily');
    expect(first?.title).toMatch(/^Daily Note: \d{4}-\d{2}-\d{2}$/);
    expect(first?.content).toContain('## Priorities');
    expect(creating.committed).toHaveLength(1);

    // --- CLOSE → REOPEN. ----------------------------------------------------------------------------
    const onDisk = close(creating.committed[0]);
    const dailyOnDisk = allPages(onDisk).filter((page) => page.title.startsWith('Daily Note: '));
    expect(dailyOnDisk).toHaveLength(1);
    expect(dailyOnDisk[0].id).toBe(first?.id);

    const reopened = mountManager(onDisk);
    const pagesBeforeSecondCall = pagesOf(reopened.api.notebooks).length;

    // --- ACT 2 on the REOPENED manager: the same day must resolve to the SAME page. -----------------
    const second = reopened.api.handleCreateDailyNote();
    expect(second?.id, 'the reopened notebook must not produce a second daily note for the same day').toBe(first?.id);
    expect(second?.created_at).toBe(first?.created_at);
    expect(reopened.committed, 'reaching an existing day is still a visit, so exactly one write is expected').toHaveLength(1);
    const afterSecond = allPages(reopened.committed[0]);
    expect(afterSecond, 'no page was added').toHaveLength(pagesBeforeSecondCall);
    expect(afterSecond.filter((page) => page.title.startsWith('Daily Note: '))).toHaveLength(1);
    // `navigateToPage` recorded the visit on the reopened document.
    expect((reopened.committed[0].notebooks ?? [])[0].recentPageIds?.[0]).toBe(first?.id);

    // --- A third call after yet another reopen still finds the same single page. ---------------------
    const thirdDisk = close(reopened.committed[0]);
    const third = mountManager(thirdDisk);
    expect(third.api.handleCreateDailyNote()?.id).toBe(first?.id);
    expect(allPages(third.committed[0]).filter((page) => page.title.startsWith('Daily Note: '))).toHaveLength(1);
  });
});
