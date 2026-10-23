// STATUS: DIAMANT VGT SUPREME — Shortcut resolution for Astraea Writer
//
// The key map used to live as an if/else chain inside a `window` listener, which
// no test in this environment can reach (no DOM). The decision is a pure function
// here; the hook only dispatches. Every branch that depends on Shift guards on it
// explicitly, so a shifted binding can never be swallowed by its unshifted twin.

export type WriterShortcutCommand =
  | { kind: 'toggle-span'; property: 'bold' | 'italic' | 'underline' }
  /**
   * WR-036 — `Ctrl+F` finds, `Ctrl+H` finds **and replaces**.
   *
   * Both used to resolve to the same command, so `Ctrl+H` opened a bar whose replace row
   * started collapsed: the key promised replace and delivered find.
   */
  | { kind: 'find-replace'; replace: boolean }
  | { kind: 'export' }
  | { kind: 'undo' }
  /** WR-035: `Ctrl+K` links the marked text. */
  | { kind: 'insert-link' }
  | { kind: 'redo' }
  | { kind: 'toggle-track-changes' }
  | { kind: 'insert-column-break' }
  | { kind: 'insert-page-break' }
  | { kind: 'update-fields' }
  | { kind: 'escape' };

export interface WriterShortcutKeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * The command for a key event, or `null` when the event is not a Writer shortcut.
 *
 * Letters are matched case-insensitively because `key` is `'B'` while Shift is
 * held. `Ctrl` and `Cmd` are interchangeable so the map works on both platforms.
 */
export function resolveWriterShortcut(input: WriterShortcutKeyInput): WriterShortcutCommand | null {
  const isCtrlOrCmd = input.ctrlKey || input.metaKey;
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;

  if (isCtrlOrCmd && !input.shiftKey) {
    if (key === 'b') return { kind: 'toggle-span', property: 'bold' };
    if (key === 'i') return { kind: 'toggle-span', property: 'italic' };
    if (key === 'u') return { kind: 'toggle-span', property: 'underline' };
    if (key === 'f') return { kind: 'find-replace', replace: false };
    if (key === 'h') return { kind: 'find-replace', replace: true };
    if (key === 'p') return { kind: 'export' };
    if (key === 'k') return { kind: 'insert-link' };
    if (key === 'z') return { kind: 'undo' };
    if (key === 'y') return { kind: 'redo' };
    // Shifted bindings, all tested before the unshifted ones.
  }
  if (isCtrlOrCmd && input.shiftKey) {
    if (key === 'z') return { kind: 'redo' };
    if (key === 'e') return { kind: 'toggle-track-changes' };
    if (key === 'Enter') return { kind: 'insert-column-break' };
  }
  if (isCtrlOrCmd && !input.shiftKey && key === 'Enter') return { kind: 'insert-page-break' };
  if (key === 'F9') return { kind: 'update-fields' };
  if (key === 'Escape') return { kind: 'escape' };
  return null;
}

/** What the shortcut has to know about the element that has focus. */
export interface WriterShortcutTargetInfo {
  /** `input`, `textarea`, `select` or a `contenteditable` host. */
  readonly isFormField: boolean;
  /** Inside the document's writing surface (`[data-writer-flow-item]`). */
  readonly inDocumentSurface: boolean;
}

/**
 * Whether a resolved shortcut may run for the element that currently has focus.
 *
 * Header and footer fields, the find/replace box and every dialog input are
 * **separate focus areas**: while one of them is focused, `Ctrl+B` belongs to that
 * field, not to the document, and `Ctrl+Enter` must not insert a page break into
 * the body behind the user's back. The document's own textareas are form fields
 * too, so they are recognised by the writing surface around them.
 *
 * `Escape` is deliberately exempt: it is the established way to leave a field and
 * to close the panels this map owns.
 */
export function filterWriterShortcut(
  command: WriterShortcutCommand | null,
  target: WriterShortcutTargetInfo,
): WriterShortcutCommand | null {
  if (!command) return null;
  if (command.kind === 'escape') return command;
  if (!target.isFormField) return command;
  return target.inDocumentSurface ? command : null;
}
