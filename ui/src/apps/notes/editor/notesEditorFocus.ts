// STATUS: DIAMANT VGT SUPREME — pure entry-focus decision for "empty note, type immediately"
//
// AST-0641 acceptance: "Neue Notiz öffnen und ohne versteckte Textbox sofort tippen."
// The visible body textarea only exists when the note is in document mode and the view mode is
// `edit` or `split`. Two things used to block direct typing:
//   1. a freshly created note carried the `# New Note\n\nStart writing...` scaffold instead of being empty,
//   2. nothing moved the caret into the body, and in `preview` mode the body textarea was not rendered at all.
// This module owns the decision; the components only execute the returned plan.

export type NotesEditorViewMode = 'edit' | 'split' | 'preview';

/** The only view mode that renders no body textarea. */
export const NOTES_VIEW_MODE_WITHOUT_BODY: NotesEditorViewMode = 'preview';

export interface NotesEntryFocusInput {
  /** Currently selected page, or `null` when the notebook/section is empty. */
  activePageId: string | null;
  /** Content of the active page; the caret is placed at its end. */
  content: string;
  /** `freeform` pages render a canvas, not the markdown body textarea. */
  editorMode?: 'document' | 'freeform';
  viewMode: NotesEditorViewMode;
  /** Monotonic counter of explicit "focus the body" requests issued by a create action. */
  focusRequest: number;
  /** A protected note that is still locked never receives focus. */
  locked: boolean;
}

export interface NotesEntryFocusPlan {
  /** Caret offset inside `content` (clamped to the content length). */
  caret: number;
  /** View mode the caller must switch to before focusing. */
  viewMode: NotesEditorViewMode;
}

/**
 * Returns the focus plan for a freshly created note, or `null` when the caller must not steal focus.
 * Fail-closed: without an explicit `focusRequest` the caret stays wherever the user left it.
 */
export function resolveNoteEntryFocus(input: NotesEntryFocusInput): NotesEntryFocusPlan | null {
  if (input.locked) return null;
  if (!input.activePageId) return null;
  if (!Number.isFinite(input.focusRequest) || input.focusRequest <= 0) return null;
  if (input.editorMode === 'freeform') return null;
  const content = typeof input.content === 'string' ? input.content : '';
  return {
    caret: content.length,
    viewMode: input.viewMode === NOTES_VIEW_MODE_WITHOUT_BODY ? 'split' : input.viewMode,
  };
}

/**
 * Resolves the view mode a create action must move to so the body textarea exists.
 * `preview` hides the only typing surface, so a create action leaves it.
 */
export function viewModeForDirectEntry(viewMode: NotesEditorViewMode): NotesEditorViewMode {
  return viewMode === NOTES_VIEW_MODE_WITHOUT_BODY ? 'split' : viewMode;
}
