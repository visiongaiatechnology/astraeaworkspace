// STATUS: PLATIN — BATCH-B wiring contract: quick insert, visible mutation feedback, one wiki-link parser.
//
// `NotesEditor` cannot be server-rendered here (its controller reads `window.location.search` during state
// initialisation), so the wiring contract is asserted against the source, like the existing theme contract.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const notesDirectory = new URL('../../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, notesDirectory), 'utf8');

const body = read('editor/NotesEditorBody.tsx');
const controller = read('editor/useNotesEditorController.ts');
const manager = read('notebooks/useNotesManager.ts');
const noteModel = read('model/noteModel.ts');
const graph = read('knowledge-graph/KnowledgeGraphModal.tsx');
const pagesList = read('navigation/NotesPagesList.tsx');
const searchEngine = read('search/notesSearchEngine.ts');
const quickInsertMenu = read('editor/NotesQuickInsertMenu.tsx');

describe('AST-0656 quick-insert wiring', () => {
  it('renders the menu from the real caret context and closes it on every path', () => {
    expect(body).toContain("import { NotesQuickInsertMenu, resolveQuickInsertKey } from './NotesQuickInsertMenu';");
    expect(body).toContain('resolveSlashMenu(value, caret)');
    expect(body).toContain('applyQuickInsertItem(context, item, activePage?.content ?? \'\')');
    expect(body).toContain('{isMenuOpen && (');
    expect(body).toContain('onClose={closeQuickInsert}');
  });

  it('drives the highlight from the textarea key handler before any other key meaning', () => {
    expect(body).toContain('if (handleMenuKey(event)) return;');
    expect(body).toContain('resolveQuickInsertKey(event.key, candidates.length, quickInsertIndex)');
    expect(body).toContain("if (event.key === 'Escape' && isQuickInsertOpen)");
  });

  it('exposes the menu as a labelled listbox with an active option', () => {
    expect(quickInsertMenu).toContain('role="listbox"');
    expect(quickInsertMenu).toContain('aria-label="Quick insert"');
    expect(quickInsertMenu).toContain('aria-activedescendant=');
    expect(quickInsertMenu).toContain('role="option"');
    expect(quickInsertMenu).toContain('aria-selected={index === activeIndex}');
    // A real media target: the image and file entries keep a bounded file input, no network fetch.
    expect(quickInsertMenu).toContain('aria-label="Insert local image"');
    expect(quickInsertMenu).toContain('aria-label="Insert local file attachment"');
    expect(quickInsertMenu).not.toContain('fetch(');
    expect(quickInsertMenu).not.toContain('http://');
  });

  it('routes every media entry to the existing canonical editor entry point', () => {
    for (const [action, call] of [
      ['ink', 'setIsInkOpen(true)'],
      ['voice', 'setIsAudioOpen(true)'],
      ['ocr', 'setIsOcrOpen(true)'],
      ['embed', 'setIsWorkspaceEmbedOpen(true)'],
    ]) {
      expect(body).toContain(`if (action === '${action}')`);
      expect(body).toContain(call);
    }
  });
});

describe('AST-0664/AST-0679 visible mutation feedback', () => {
  it('routes checklist conversion, tag add and tag remove through the notice channel', () => {
    expect(controller).toContain('const reportOutcome = <T extends { ok: boolean; message: string }>(run: () => T): T => {');
    expect(controller).toContain('const handleAddTag = (tag: string) => reportOutcome(() => notes.handleAddTag(tag));');
    expect(controller).toContain('const handleRemoveTag = (tag: string) => reportOutcome(() => notes.handleRemoveTag(tag));');
    expect(controller).toContain('const handleConvertChecklistToTask = (lineIndex: number) => reportOutcome(() => notes.handleConvertChecklistToTask(lineIndex));');
    expect(controller).toContain('notice,');
  });

  it('shows the notice with an announcement and a dismiss control', () => {
    expect(body).toContain("import { NotesEditorNotice } from './NotesEditorNotice';");
    expect(body).toContain('<NotesEditorNotice message={notice} onDismiss={() => setNotice(null)} />');
    const notice = read('editor/NotesEditorNotice.tsx');
    expect(notice).toContain('role="status"');
    expect(notice).toContain('aria-live="polite"');
    expect(notice).toContain('aria-label="Dismiss message"');
  });

  it('makes checklist conversion and tag edits report an outcome instead of returning nothing', () => {
    expect(manager).toContain('const handleConvertChecklistToTask = (lineIndex: number): NoteMutationOutcome => {');
    expect(manager).toContain('return { ok: false, message: `Line ${lineIndex + 1} is not a checklist item, so no task was created.` };');
    expect(manager).toContain('export interface NoteMutationOutcome {');
    expect(manager).toContain('const handleAddTag = (tag: string): NoteMutationOutcome => {');
    // One tag identity rule (the pure validator), not a second lower-cased comparison in the hook, and the
    // new tag list is computed against the live page so two adds in one tick accumulate (W-397).
    expect(manager).toContain('const validation = validateNoteTagInput(');
    expect(manager).toContain('if (!validation.ok) return { ok: false, message: validation.message };');
    expect(manager).toContain('handleUpdateCurrentPage((page) => ({ tags: [...page.tags, validation.tag] }));');
    expect(manager).not.toContain('entry.toLocaleLowerCase() === tag.toLocaleLowerCase()');
  });
});

describe('AST-0669 backlink insertion is never a silent no-op', () => {
  it('has a target with and without a focused textarea and reports the outcome', () => {
    expect(controller).toContain('if (!textarea) {');
    expect(controller).toContain('Appended link to “${targetPageTitle}” at the end of the note.');
    expect(controller).toContain('setNotice(`Inserted link to “${targetPageTitle}”.`);');
    expect(controller).toContain("if (!activePage) { setNotice('No note is selected, so no link was inserted.');");
  });
});

describe('AST-0667 exactly one wiki-link parser', () => {
  it('removed the dead second parser with the different normalisation', () => {
    expect(noteModel).not.toContain('export function extractWikiLinkTitles');
    expect(noteModel).not.toContain('export function resolveWikiLinkIds');
    expect(noteModel).toContain('AST-0667');
  });
});

describe('AST-0671 graph filter wiring', () => {
  it('renders a tag filter and a depth filter over the pure view builder', () => {
    expect(graph).toContain("import {");
    expect(graph).toContain('buildNoteGraphView');
    expect(graph).toContain('layoutNoteGraphNodes');
    expect(graph).toContain('aria-label="Filter by path depth"');
    expect(graph).toContain('setTagFilter');
    expect(graph).toContain('aria-pressed={scope === value}');
    expect(graph).toContain('No note matches the active tag and depth filters.');
    expect(graph).toContain('The graph is capped at {graph.nodes.length} nodes');
  });
});

describe('AST-0684 search scan budget wiring', () => {
  it('bounds the scan and surfaces a truncation', () => {
    expect(searchEngine).toContain('export const NOTES_SEARCH_MAX_SCANNED_PAGES = 20_000;');
    expect(searchEngine).toContain('if (scan.scannedPages >= scan.budget) {');
    expect(searchEngine).toContain('scan.truncated = true;');
    expect(pagesList).toContain('<NotesSearchScanNotice truncated={searchScanTruncated} scannedPages={searchScannedPages} />');
    const pages = read('navigation/NotesPagesList.tsx');
    expect(pages).toContain('Search stopped after');
  });
});
