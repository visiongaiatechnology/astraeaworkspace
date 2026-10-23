// STATUS: DIAMANT VGT SUPREME — pure Notes editor key resolver (keyboard is not optional)
//
// One decision function owns every Notes editor shortcut so the component stays thin wiring and the
// IME guard cannot be forgotten in a second key path.

import type { NotesEditorViewMode } from './notesEditorFocus';

export interface NotesKeyEventShape {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** Never interpret shortcuts inside an IME composition. */
  isComposing: boolean;
  /** A locked protected note must not answer editing shortcuts. */
  locked: boolean;
}

export type NotesEditorCommand =
  | { type: 'setViewMode'; viewMode: NotesEditorViewMode }
  | { type: 'toggleFocusMode' }
  | { type: 'openQuickInsert' }
  | { type: 'openFindReplace' };

/**
 * Resolves a key event to a Notes editor command, or `null` when the event is not a Notes shortcut.
 * `Alt`-based view switching is used on purpose: `Ctrl+1..3` is reserved by browsers for tab switching
 * and cannot be intercepted reliably. View and focus commands stay available on a locked note (they do
 * not touch content); content-changing commands are refused, so a locked page keeps its fail-closed boundary.
 */
export function resolveNotesEditorCommand(event: NotesKeyEventShape): NotesEditorCommand | null {
  if (event.isComposing) return null;
  const command = resolveUnlockedCommand(event);
  if (!command) return null;
  if (event.locked && (command.type === 'openQuickInsert' || command.type === 'openFindReplace')) return null;
  return command;
}

function resolveUnlockedCommand(event: NotesKeyEventShape): NotesEditorCommand | null {
  if (event.ctrlKey || event.metaKey) {
    if (event.altKey) return null;
    const key = event.key.toLowerCase();
    // Ctrl/Cmd+/ — quick insert menu at the caret.
    if (key === '/' || (key === '7' && event.shiftKey)) return { type: 'openQuickInsert' };
    if (key === 'f' && event.shiftKey) return { type: 'openFindReplace' };
    return null;
  }
  if (!event.altKey) return null;
  if (event.shiftKey && event.key.toLowerCase() === 'f') return { type: 'toggleFocusMode' };
  if (event.shiftKey) return null;
  if (event.key === '1') return { type: 'setViewMode', viewMode: 'edit' };
  if (event.key === '2') return { type: 'setViewMode', viewMode: 'split' };
  if (event.key === '3') return { type: 'setViewMode', viewMode: 'preview' };
  return null;
}
