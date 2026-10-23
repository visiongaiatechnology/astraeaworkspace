// STATUS: PLATIN — AST-0641: the direct-entry path is wired from the key handler to the body caret.
//
// `NotesEditor` cannot be server-rendered for a contract check in this environment: its controller reads
// `window.location.search` during state initialisation. The wiring contract is therefore asserted against
// the source, in the same style as the existing Notes theme contract test.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const notesDirectory = new URL('../../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, notesDirectory), 'utf8');

const editor = read('editor/NotesEditor.tsx');
const body = read('editor/NotesEditorBody.tsx');
const controller = read('editor/useNotesEditorController.ts');
const manager = read('notebooks/useNotesManager.ts');
const pagesList = read('navigation/NotesPagesList.tsx');

describe('AST-0641 direct-entry wiring', () => {
  it('routes every Notes shortcut through the single pure resolver', () => {
    expect(editor).toContain('onKeyDown={editor.handleEditorKeyDown}');
    expect(controller).toContain("import { resolveNotesEditorCommand } from './notesEditorShortcuts';");
    expect(controller).toContain('resolveNotesEditorCommand({');
    expect(controller).toContain('isComposing: event.nativeEvent.isComposing');
  });

  it('turns a create action into a focus request and leaves preview mode behind', () => {
    expect(controller).toContain("import { viewModeForDirectEntry } from './notesEditorFocus';");
    // The whole create→focus chain is pinned, not just a neighbouring line.
    expect(controller).toMatch(/const handleCreatePage = \(templateId\?: string\) => \{\s*const created = notes\.handleCreatePage\(templateId\);\s*if \(created\) requestDirectEntry\(\);\s*return created;\s*\};/);
    expect(controller).toMatch(/const handleCreateDailyNote = \(\) => \{\s*const created = notes\.handleCreateDailyNote\(\);\s*if \(created\) requestDirectEntry\(\);\s*return created;\s*\};/);
    expect(controller).toMatch(/const requestDirectEntry = \(\) => \{\s*setViewMode\(\(current\) => viewModeForDirectEntry\(current\)\);\s*setBodyFocusRequest\(\(current\) => current \+ 1\);\s*\};/);
    // The controller must expose its own create handlers, not the raw manager callbacks.
    expect(controller).toMatch(/return \{[\s\S]*handleCreatePage,\n\s*handleCreateDailyNote,/);
  });

  it('applies the focus plan in the body and names the typing surface', () => {
    expect(body).toContain("import { resolveNoteEntryFocus } from './notesEditorFocus';");
    expect(body).toContain('const plan = resolveNoteEntryFocus({');
    expect(body).toContain('textarea.focus();');
    expect(body).toContain('textarea.setSelectionRange(plan.caret, plan.caret);');
    expect(body).toContain('aria-label="Note body markdown editor"');
    expect(body).toContain('bodyFocusRequest,');
  });

  it('lets the manager report the created page instead of swallowing the result', () => {
    expect(manager).toContain('const handleCreatePage = (templateId: NoteTemplateId | string = \'blank\'): NotePage | null => {');
    expect(manager).toContain('const handleCreateDailyNote = (): NotePage | null => {');
    expect(manager).toContain('return page;');
  });
});

describe('AST-0651/AST-0654 tree wiring', () => {
  it('renders the tree from the same order the key resolver uses', () => {
    expect(pagesList).toContain("import { buildNoteTreeItems, resolveNoteTreeCommand } from './notesPageTree';");
    expect(pagesList).toContain('const treeItems = useMemo(');
    expect(pagesList).toContain("role={pageCollection === 'trash' ? undefined : 'tree'}");
    expect(pagesList).toContain("role={treeItem ? 'treeitem' : undefined}");
    expect(pagesList).toContain('aria-level={treeItem?.level}');
    expect(pagesList).toContain('onKeyDown={(event) => !page.trashedAt && handleRowKeyDown(event, page.id)}');
  });

  it('surfaces a rejected hierarchy change instead of dropping it', () => {
    expect(pagesList).toContain('const rejection = onSetPageParent(pageId, parentPageId);');
    expect(pagesList).toContain('setTreeMessage(rejection ? rejection.message : null);');
    expect(pagesList).toContain('role="status" aria-live="polite"');
    // Only one hierarchy rule exists: the list must not re-implement it.
    expect(pagesList).not.toContain('MAX_NOTE_SUBPAGE_DEPTH');
    // The outcome must be decided against the same LIVE section the write goes through. The render-time
    // `activeSection` memo let a move be reported as accepted (`null` is what clears the tree notice) and then
    // refused by the live `setPageParent`: the message did not match the effect.
    expect(manager).toContain('const rejection = describeNoteParentRejection(liveSection, pageId, parentPageId);');
    expect(manager).not.toMatch(/describeNoteParentRejection\(activeSection/);
    // The rejection must reach the caller, and an allowed change must be applied and reported as success.
    expect(manager).toMatch(/if \(rejection\) return rejection;[\s\S]{0,600}?setPageParent\(section, pageId, parentPageId\)[\s\S]{0,400}?return null;/);
    expect(manager).not.toContain('canSetPageParent');
  });
});
