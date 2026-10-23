// STATUS: PLATIN — AST-0641/AST-0643: a new note is empty and the caret enters it without a hidden click.
import { describe, expect, it } from 'vitest';
import { NOTE_TEMPLATES, createEmptyNotePage, createNotePageFromTemplate } from '../../model/noteModel';
import { NOTES_VIEW_MODE_WITHOUT_BODY, resolveNoteEntryFocus, viewModeForDirectEntry } from '../../editor/notesEditorFocus';
import { resolveNotesEditorCommand } from '../../editor/notesEditorShortcuts';

const base = {
  activePageId: 'page-1',
  content: '',
  editorMode: 'document' as const,
  viewMode: 'split' as const,
  focusRequest: 0,
  locked: false,
};

describe('AST-0641 direct entry into an empty note', () => {
  it('creates a blank note with truly empty content instead of a scaffold', () => {
    const blank = NOTE_TEMPLATES.find((template) => template.id === 'blank');
    expect(blank?.content('New Note', new Date(0))).toBe('');

    const page = createNotePageFromTemplate('blank', 1_700_000_000_000, 'New Note');
    expect(page.content).toBe('');
    expect(page.title).toBe('New Note');
    // The scaffold that forced a manual delete is gone from the creation path.
    expect(page.content).not.toContain('Start writing');

    const empty = createEmptyNotePage(1_700_000_000_000, 'Empty Note');
    expect(empty.content).toBe('');
    expect(empty.title).toBe('Empty Note');
    expect(empty.templateId).toBe('blank');
  });

  it('places the caret at the end of the content only after an explicit create request', () => {
    expect(resolveNoteEntryFocus(base)).toBeNull();
    expect(resolveNoteEntryFocus({ ...base, content: 'abc', focusRequest: 1 })).toEqual({ caret: 3, viewMode: 'split' });
  });

  it('leaves preview mode because preview hides the only typing surface', () => {
    expect(resolveNoteEntryFocus({ ...base, viewMode: NOTES_VIEW_MODE_WITHOUT_BODY, focusRequest: 1 })?.viewMode).toBe('split');
    expect(viewModeForDirectEntry('preview')).toBe('split');
    expect(viewModeForDirectEntry('edit')).toBe('edit');
    expect(viewModeForDirectEntry('split')).toBe('split');
  });

  it('never steals focus for a locked note, an absent page, a canvas page or a missing request', () => {
    expect(resolveNoteEntryFocus({ ...base, locked: true, focusRequest: 3 })).toBeNull();
    expect(resolveNoteEntryFocus({ ...base, activePageId: null, focusRequest: 3 })).toBeNull();
    expect(resolveNoteEntryFocus({ ...base, editorMode: 'freeform', focusRequest: 3 })).toBeNull();
    expect(resolveNoteEntryFocus({ ...base, focusRequest: -1 })).toBeNull();
    expect(resolveNoteEntryFocus({ ...base, focusRequest: Number.NaN })).toBeNull();
  });

  it('resists a non-string content value from a hostile document', () => {
    const plan = resolveNoteEntryFocus({ ...base, content: undefined as unknown as string, focusRequest: 1 });
    expect(plan).toEqual({ caret: 0, viewMode: 'split' });
  });
});

describe('AST-0646 keyboard switching between Rich Text and Markdown', () => {
  const key = (over: Record<string, unknown>) => resolveNotesEditorCommand({
    key: '1', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, locked: false, ...over,
  });

  it('maps Alt+1/2/3 to the three visible view modes', () => {
    expect(key({ key: '1', altKey: true })).toEqual({ type: 'setViewMode', viewMode: 'edit' });
    expect(key({ key: '2', altKey: true })).toEqual({ type: 'setViewMode', viewMode: 'split' });
    expect(key({ key: '3', altKey: true })).toEqual({ type: 'setViewMode', viewMode: 'preview' });
    expect(key({ key: 'F', altKey: true, shiftKey: true })).toEqual({ type: 'toggleFocusMode' });
  });

  it('maps Ctrl/Cmd+/ to quick insert and Ctrl/Cmd+Shift+F to find & replace', () => {
    expect(key({ key: '/', ctrlKey: true })).toEqual({ type: 'openQuickInsert' });
    expect(key({ key: '7', ctrlKey: true, shiftKey: true })).toEqual({ type: 'openQuickInsert' });
    expect(key({ key: 'f', metaKey: true, shiftKey: true })).toEqual({ type: 'openFindReplace' });
  });

  it('ignores IME composition, unrelated keys and content-changing commands on a locked note', () => {
    expect(key({ key: '1', altKey: true, isComposing: true })).toBeNull();
    // Reading-view switching does not touch content and stays available on a locked note.
    expect(key({ key: '1', altKey: true, locked: true })).toEqual({ type: 'setViewMode', viewMode: 'edit' });
    // Editing commands are refused, so a locked page keeps its fail-closed boundary.
    expect(key({ key: '/', ctrlKey: true, locked: true })).toBeNull();
    expect(key({ key: 'f', ctrlKey: true, shiftKey: true, locked: true })).toBeNull();
    expect(key({ key: 'x', altKey: true })).toBeNull();
    expect(key({ key: '1' })).toBeNull();
    expect(key({ key: 'z', ctrlKey: true })).toBeNull();
    expect(key({ key: '1', ctrlKey: true, altKey: true })).toBeNull();
  });
});
