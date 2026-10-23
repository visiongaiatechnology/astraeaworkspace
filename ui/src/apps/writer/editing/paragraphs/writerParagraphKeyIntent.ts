// STATUS: DIAMANT VGT SUPREME — Keyboard intent for structural paragraph edits in Writer
//
// The Enter and Backspace branches decide whether a keystroke performs a
// structural edit or stays with the browser default. These decisions used to be
// inline conditions inside the paragraph component, where no unit test could
// reach them and where the data-loss rule ("never split a non-collapsed
// selection") was one `if` away from being dropped. They are pure functions now.

export type WriterBackspaceIntent = 'merge-backward' | 'default';

export interface WriterBackspaceIntentInput {
  readonly shiftKey: boolean;
  /** Index of the paragraph inside the document; the first paragraph has no predecessor. */
  readonly paragraphIndex: number;
  /** A paragraph split across pages is rendered as several fragments. */
  readonly fragmentIsFirst: boolean;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/**
 * Backspace only folds paragraphs when the caret sits at the very start of the
 * first fragment of a paragraph that actually has a predecessor. Every other
 * case keeps the native character deletion.
 */
export function resolveWriterBackspaceIntent(input: WriterBackspaceIntentInput): WriterBackspaceIntent {
  if (input.shiftKey) return 'default';
  if (!Number.isInteger(input.paragraphIndex) || input.paragraphIndex <= 0) return 'default';
  if (!input.fragmentIsFirst) return 'default';
  if (input.selectionStart !== 0 || input.selectionEnd !== 0) return 'default';
  return 'merge-backward';
}

export type WriterEnterIntent = 'exit-list' | 'append-paragraph' | 'split-paragraph' | 'default';

export interface WriterEnterIntentInput {
  readonly shiftKey: boolean;
  readonly isLastFragment: boolean;
  /** List paragraph without text: Enter leaves the list instead of creating another bullet. */
  readonly isEmptyListParagraph: boolean;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly valueLength: number;
}

/**
 * Enter splits the paragraph at a collapsed caret, appends an empty paragraph
 * at the end of the text, and exits an empty list item. A non-collapsed
 * selection deliberately keeps native behaviour: splitting at the selection
 * start would discard the selected text without asking the user.
 */
export function resolveWriterEnterIntent(input: WriterEnterIntentInput): WriterEnterIntent {
  if (input.shiftKey) return 'default';
  if (!input.isLastFragment) return 'default';
  if (input.isEmptyListParagraph) return 'exit-list';
  if (input.selectionStart !== input.selectionEnd) return 'default';
  if (input.selectionStart >= input.valueLength) return 'append-paragraph';
  return 'split-paragraph';
}
