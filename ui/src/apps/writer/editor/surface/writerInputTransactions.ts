// STATUS: PLATIN — Model transactions for the Writer rich-text surface
//
// The surface never writes the model directly, and — this is the load-bearing
// part — the **browser never writes the DOM directly either**. Every text edit,
// every deletion and every selection replacement is reduced here to a value, and
// the surface applies that value to `Paragraph[]`. The DOM is then re-projected
// from the model.
//
// Why that is not a stylistic choice: a `contentEditable` block whose children are
// React-managed `<span>`s cannot survive the browser editing those children. The
// browser inserts a **bare text node** next to the `<span>`s, React appends its own
// `<span>` behind it, and from that moment two nodes carry the same character —
// which is exactly the "`W` → `WW` → `WaWaW`" duplication this module exists to
// make impossible. `preventDefault()` on `beforeinput`/`keydown` is what keeps
// React's virtual DOM and the real DOM identical.
//
// The only exception is an IME composition (`insertCompositionText` and friends):
// it is owned by the operating system's input method and cannot be pre-empted.
// The surface handles it by reconciling once at `compositionend` and then
// re-mounting the fragment from the model (`hardResync`), so no browser-authored
// node survives.

/** The minimal edit that turns `before` into `after`. */
export interface WriterSurfaceTextPatch {
  /** First changed model offset. */
  readonly start: number;
  /** First offset after the changed region, `start <= end`. */
  readonly end: number;
  /** Text that replaces `before[start…end]`. May be empty (a deletion). */
  readonly insertedText: string;
}

function finiteLength(value: string | null | undefined): number {
  return typeof value === 'string' ? value.length : 0;
}

function clampOffset(text: string, rawOffset: number): number {
  if (!Number.isFinite(rawOffset)) return 0;
  return Math.max(0, Math.min(Math.trunc(rawOffset), text.length));
}

/**
 * Reduces "the DOM now says `after`" to one replace operation on `before`.
 *
 * The shared prefix and suffix are kept, which is what makes the result
 * span-preserving: `replaceWriterParagraphRange` then only rebuilds the middle,
 * so bold text left of an insertion keeps its bold run instead of being flattened.
 *
 * Returns `null` when the two strings are equal — nothing to persist, so the
 * caller must not create an empty undo step.
 */
export function resolveWriterSurfaceTextPatch(
  before: string,
  after: string,
): WriterSurfaceTextPatch | null {
  if (before === after) return null;
  const beforeLength = finiteLength(before);
  const afterLength = finiteLength(after);
  const sharedLimit = Math.min(beforeLength, afterLength);

  let prefix = 0;
  while (prefix < sharedLimit && before[prefix] === after[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < beforeLength - prefix
    && suffix < afterLength - prefix
    && before[beforeLength - 1 - suffix] === after[afterLength - 1 - suffix]
  ) suffix += 1;

  return {
    start: prefix,
    end: beforeLength - suffix,
    insertedText: after.slice(prefix, afterLength - suffix),
  };
}

/** Applies a patch; used to prove the patch describes the observed DOM text. */
export function applyWriterSurfaceTextPatch(text: string, patch: WriterSurfaceTextPatch): string {
  return `${text.slice(0, patch.start)}${patch.insertedText}${text.slice(patch.end)}`;
}

/** Caret position after a patch was applied. */
export function resolveWriterSurfacePatchCaret(patch: WriterSurfaceTextPatch): number {
  return patch.start + patch.insertedText.length;
}

/**
 * Everything the surface can decide about one edit, as a value.
 *
 * `null`/`none` means "no model change" — used for keys and input types the
 * surface must let through untouched (caret movement, clipboard, shortcuts of the
 * application shell).
 */
export type WriterSurfaceEditIntent =
  /** A marked range (in one paragraph or across paragraphs) is replaced. */
  | { readonly kind: 'replace-selection'; readonly replacement: string }
  /** Insert text at a collapsed caret; goes through the span-preserving text path. */
  | { readonly kind: 'insert-text'; readonly paragraphIndex: number; readonly offset: number; readonly text: string }
  /** Delete `length` characters before the caret. */
  | { readonly kind: 'delete-backward'; readonly paragraphIndex: number; readonly offset: number; readonly length: number }
  /** Delete `length` characters after the caret. */
  | { readonly kind: 'delete-forward'; readonly paragraphIndex: number; readonly offset: number; readonly length: number }
  | { readonly kind: 'split-paragraph'; readonly paragraphIndex: number; readonly offset: number }
  | { readonly kind: 'insert-line-break'; readonly paragraphIndex: number; readonly offset: number }
  | { readonly kind: 'insert-tab'; readonly paragraphIndex: number; readonly offset: number }
  | { readonly kind: 'merge-backward'; readonly paragraphIndex: number }
  | { readonly kind: 'merge-forward'; readonly paragraphIndex: number }
  /** Enter on an empty list item leaves the list instead of adding another bullet. */
  | { readonly kind: 'exit-list'; readonly paragraphIndex: number }
  /** WR-017: Ctrl/Cmd+A selects the whole running text, not just one fragment. */
  | { readonly kind: 'select-all' }
  /** WR-017: Ctrl/Cmd+Home / Ctrl/Cmd+End move to the very start/end of the text. */
  | { readonly kind: 'move-caret'; readonly to: 'document-start' | 'document-end'; readonly extend?: boolean }
  /** WR-017: one caret step inside the model (arrows, Home/End, word jumps). */
  | {
    readonly kind: 'caret-step';
    readonly step: WriterCaretStep;
    readonly paragraphIndex: number;
    readonly offset: number;
    readonly extend: boolean;
  };

/** The caret movements the surface decides itself instead of the browser. */
export type WriterCaretStep =
  | 'char-backward'
  | 'char-forward'
  | 'word-backward'
  | 'word-forward'
  | 'paragraph-start'
  | 'paragraph-end';

/** Backwards-compatible alias: the key path and the input path share one union. */
export type WriterSurfaceKeyIntent = WriterSurfaceEditIntent;

/** Everything the decision needs about the caret and its paragraph. */
export interface WriterSurfaceCaretContext {
  /** Paragraph that owns the focus end of the selection, or `-1`. */
  readonly paragraphIndex: number;
  /** Caret (or focus) offset inside that paragraph. */
  readonly offset: number;
  /** Text of that paragraph, needed for word- and line-wise deletion. */
  readonly paragraphText: string;
  /** True when the selection covers more than a caret. */
  readonly hasSelection: boolean;
  /** True when the two ends of the selection are in different paragraphs. */
  readonly spansParagraphs: boolean;
  /** True when a paragraph exists before the caret's paragraph. */
  readonly hasPreviousParagraph: boolean;
  /** True when a paragraph exists after the caret's paragraph. */
  readonly hasNextParagraph: boolean;
  /** True when the caret's paragraph carries a list style (WR-011). */
  readonly isListParagraph?: boolean;
}

export interface WriterSurfaceKeyInput extends WriterSurfaceCaretContext {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/** Start of the word before `offset` — the target of `Ctrl+Backspace`. */
export function resolveWriterSurfaceWordStart(text: string, rawOffset: number): number {
  let offset = clampOffset(text, rawOffset);
  while (offset > 0 && /\s/u.test(text[offset - 1] ?? '')) offset -= 1;
  while (offset > 0 && !/\s/u.test(text[offset - 1] ?? '')) offset -= 1;
  return offset;
}

/** End of the word after `offset` — the target of `Ctrl+Delete`. */
export function resolveWriterSurfaceWordEnd(text: string, rawOffset: number): number {
  let offset = clampOffset(text, rawOffset);
  while (offset < text.length && /\s/u.test(text[offset] ?? '')) offset += 1;
  while (offset < text.length && !/\s/u.test(text[offset] ?? '')) offset += 1;
  return offset;
}

/**
 * Keys that carry a *named* action and therefore no character.
 *
 * Everything not in this list is text the user typed — including a space, an
 * emoji (whose `key` is two UTF-16 units) and a character produced by a
 * non-US layout. Deciding "printable" by `key.length === 1` silently dropped
 * every surrogate pair, which is why the list is negative instead of positive.
 */
const NON_PRINTING_KEYS: ReadonlySet<string> = new Set([
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Escape',
  'Esc',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Pause',
  'ContextMenu',
  'Dead',
  'Process',
  'Unidentified',
  'Clear',
  'Help',
  'Undo',
  'Redo',
  'PrintScreen',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

/** True when the key press carries a character the document should receive. */
export function isWriterSurfacePrintableKey(key: string): boolean {
  if (key.length === 0) return false;
  return !NON_PRINTING_KEYS.has(key);
}

/**
 * The key intent. Structural keys are decided here; everything else is left to
 * `beforeinput` (which the surface also intercepts) so a key press can never
 * change the DOM behind React's back.
 */
export function resolveWriterSurfaceKeyIntent(input: WriterSurfaceKeyInput): WriterSurfaceEditIntent | null {
  const { key, paragraphIndex, offset, paragraphText } = input;
  if (paragraphIndex < 0) return null;
  const length = paragraphText.length;
  const caret = clampOffset(paragraphText, offset);

  /**
   * WR-017 — the caret movements the surface owns.
   *
   * Horizontal movement, word jumps and Home/End are decided in the model. The
   * surface writes the caret itself, so leaving these to the browser meant they
   * depended on where Chromium happened to place the DOM caret — and after a click
   * on a `tabindex="-1"` paragraph or next to a `contenteditable="false"` island it
   * placed none at all (native M4 probe). `ArrowUp`/`ArrowDown` stay with the
   * browser: they address the *visual* line, which a model without layout cannot
   * resolve, and the structural fixes above restore them.
   */
  if (!input.altKey && !input.ctrlKey && !input.metaKey) {
    if (key === 'ArrowLeft') {
      return { kind: 'caret-step', step: 'char-backward', paragraphIndex, offset: caret, extend: input.shiftKey };
    }
    if (key === 'ArrowRight') {
      return { kind: 'caret-step', step: 'char-forward', paragraphIndex, offset: caret, extend: input.shiftKey };
    }
    if (key === 'Home') {
      return { kind: 'caret-step', step: 'paragraph-start', paragraphIndex, offset: caret, extend: input.shiftKey };
    }
    if (key === 'End') {
      return { kind: 'caret-step', step: 'paragraph-end', paragraphIndex, offset: caret, extend: input.shiftKey };
    }
  }
  if ((input.ctrlKey || input.metaKey) && !input.altKey && !input.shiftKey) {
    if (key === 'ArrowLeft') {
      return { kind: 'caret-step', step: 'word-backward', paragraphIndex, offset: caret, extend: false };
    }
    if (key === 'ArrowRight') {
      return { kind: 'caret-step', step: 'word-forward', paragraphIndex, offset: caret, extend: false };
    }
  }
  if ((input.ctrlKey || input.metaKey) && !input.altKey && input.shiftKey) {
    if (key === 'ArrowLeft') {
      return { kind: 'caret-step', step: 'word-backward', paragraphIndex, offset: caret, extend: true };
    }
    if (key === 'ArrowRight') {
      return { kind: 'caret-step', step: 'word-forward', paragraphIndex, offset: caret, extend: true };
    }
  }

  /**
   * WR-017 — the document-level navigation commands.
   *
   * They are decided here instead of being left to the browser because the surface
   * owns the caret: an editing host that contains paginated fragments and
   * non-editable islands is not guaranteed to collapse "select all" onto the running
   * text alone, and `Ctrl+Home`/`Ctrl+End` must address the *document*, not the
   * fragment the caret happens to sit in.
   */
  if ((input.ctrlKey || input.metaKey) && !input.altKey) {
    if (key === 'a' || key === 'A') return { kind: 'select-all' };
    if (key === 'Home') return { kind: 'move-caret', to: 'document-start', extend: input.shiftKey };
    if (key === 'End') return { kind: 'move-caret', to: 'document-end', extend: input.shiftKey };
  }

  if (key === 'Enter') {
    if (input.hasSelection) {
      // Enter over a marked range replaces it with a paragraph break; the
      // replacement path splits the surviving paragraph at the line break.
      return { kind: 'replace-selection', replacement: '\n' };
    }
    if (input.ctrlKey || input.metaKey || input.altKey) return null;
    if (input.shiftKey) return { kind: 'insert-line-break', paragraphIndex, offset: caret };
    /**
     * WR-011: Enter on an **empty** list item ends the list.
     *
     * Without this the user could only leave a list by typing a character and
     * deleting it — the classic endless-bullet trap. The decision lives here (and
     * not in the surface) so it is testable without a DOM.
     */
    if (input.isListParagraph === true && paragraphText.length === 0) {
      return { kind: 'exit-list', paragraphIndex };
    }
    return { kind: 'split-paragraph', paragraphIndex, offset: caret };
  }

  if (key === 'Backspace') {
    // Any marked range is replaced as one model transaction — inside one paragraph
    // as well as across several. Letting the browser delete it would tear the
    // managed `<span>`s apart.
    if (input.hasSelection) return { kind: 'replace-selection', replacement: '' };
    if (caret === 0) {
      // WR-027: at the very start there is no paragraph to merge with — but the
      // paragraph can still carry a manual page/column break, and Backspace is the
      // established way to remove it. The command goes to the model either way.
      return { kind: 'merge-backward', paragraphIndex };
    }
    const wordWise = input.ctrlKey || input.altKey;
    const start = wordWise ? resolveWriterSurfaceWordStart(paragraphText, caret) : caret - 1;
    return { kind: 'delete-backward', paragraphIndex, offset: caret, length: caret - start };
  }

  if (key === 'Delete') {
    if (input.hasSelection) return { kind: 'replace-selection', replacement: '' };
    if (caret >= length) {
      return input.hasNextParagraph ? { kind: 'merge-forward', paragraphIndex } : null;
    }
    const wordWise = input.ctrlKey || input.altKey;
    const end = wordWise ? resolveWriterSurfaceWordEnd(paragraphText, caret) : caret + 1;
    return { kind: 'delete-forward', paragraphIndex, offset: caret, length: end - caret };
  }

  if (key === 'Tab') {
    /**
     * Inside a list item the surface handles Tab itself (it calls
     * `onIndentListLevel` before this decision), so a literal tab character is only
     * reached outside a list. Shift+Tab keeps leaving the document.
     */
    if (input.shiftKey || input.ctrlKey || input.metaKey || input.altKey) return null;
    if (input.hasSelection) return { kind: 'replace-selection', replacement: '\t' };
    return { kind: 'insert-tab', paragraphIndex, offset: caret };
  }

  // A printed character over a marked range is one replacement — inside one
  // paragraph too, not only across paragraphs.
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (!isWriterSurfacePrintableKey(key)) return null;
  // At a collapsed caret the character is inserted as a model transaction too. The
  // `beforeinput` path stays as the fallback for everything a `keydown` cannot
  // describe (AltGr, dead keys, an input method that posts text without a key).
  if (input.hasSelection) return { kind: 'replace-selection', replacement: key };
  return { kind: 'insert-text', paragraphIndex, offset: caret, text: key };
}

/** True for the input types an IME owns and the surface must not pre-empt. */
export function isWriterSurfaceCompositionInputType(inputType: string): boolean {
  return inputType === 'insertCompositionText'
    || inputType === 'deleteCompositionText'
    || inputType === 'insertFromComposition'
    || inputType === 'deleteByComposition'
    || inputType.endsWith('Composition');
}

export interface WriterSurfaceInputEventInput extends WriterSurfaceCaretContext {
  /** `InputEvent.inputType`. */
  readonly inputType: string;
  /** `InputEvent.data` — the inserted text, when the type carries one. */
  readonly data?: string | null;
}

/**
 * The intent of a `beforeinput` event.
 *
 * The surface calls `preventDefault()` for **every** type this function knows,
 * including the plain `insertText`. That is the whole point: after this function
 * has spoken, the browser has nothing left to do.
 */
export function resolveWriterSurfaceInputIntent(
  input: WriterSurfaceInputEventInput,
): WriterSurfaceEditIntent | null {
  const { inputType, paragraphIndex, offset, paragraphText } = input;
  if (paragraphIndex < 0) return null;
  const length = paragraphText.length;
  const caret = clampOffset(paragraphText, offset);
  const inserted = typeof input.data === 'string' ? input.data : '';

  switch (inputType) {
    case 'insertText':
    case 'insertReplacementText':
    case 'insertFromYank':
      if (input.hasSelection) return { kind: 'replace-selection', replacement: inserted };
      return inserted.length > 0
        ? { kind: 'insert-text', paragraphIndex, offset: caret, text: inserted }
        : null;

    case 'insertParagraph':
      if (input.hasSelection) return { kind: 'replace-selection', replacement: '\n' };
      // WR-011: eforeinput is the second path an input method may use for
      // Enter; it must reach the same list decision as the key handler.
      if (input.isListParagraph === true && paragraphText.length === 0) {
        return { kind: 'exit-list', paragraphIndex };
      }
      return { kind: 'split-paragraph', paragraphIndex, offset: caret };

    case 'insertLineBreak':
      return input.hasSelection
        ? { kind: 'replace-selection', replacement: '\n' }
        : { kind: 'insert-line-break', paragraphIndex, offset: caret };

    case 'insertTab':
      return input.hasSelection
        ? { kind: 'replace-selection', replacement: '\t' }
        : { kind: 'insert-tab', paragraphIndex, offset: caret };

    case 'deleteContentBackward':
    case 'deleteWordBackward':
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward': {
      if (input.hasSelection) return { kind: 'replace-selection', replacement: '' };
      if (caret === 0) {
        return input.hasPreviousParagraph ? { kind: 'merge-backward', paragraphIndex } : null;
      }
      const start = inputType === 'deleteWordBackward'
        ? resolveWriterSurfaceWordStart(paragraphText, caret)
        : inputType === 'deleteSoftLineBackward' || inputType === 'deleteHardLineBackward'
          ? (paragraphText.lastIndexOf('\n', caret - 1) + 1)
          : caret - 1;
      return { kind: 'delete-backward', paragraphIndex, offset: caret, length: caret - start };
    }

    case 'deleteContentForward':
    case 'deleteWordForward':
    case 'deleteSoftLineForward':
    case 'deleteHardLineForward': {
      if (input.hasSelection) return { kind: 'replace-selection', replacement: '' };
      if (caret >= length) {
        return input.hasNextParagraph ? { kind: 'merge-forward', paragraphIndex } : null;
      }
      const end = inputType === 'deleteWordForward'
        ? resolveWriterSurfaceWordEnd(paragraphText, caret)
        : inputType === 'deleteSoftLineForward' || inputType === 'deleteHardLineForward'
          ? (paragraphText.indexOf('\n', caret) === -1 ? length : paragraphText.indexOf('\n', caret))
          : caret + 1;
      return { kind: 'delete-forward', paragraphIndex, offset: caret, length: Math.max(0, end - caret) };
    }

    default:
      // `historyUndo`, `historyRedo`, `format*`, `insertFromPaste`,
      // `insertFromDrop`, `insertFromComposition` and anything unknown: the
      // surface refuses the browser's own mutation. Undo/redo belong to
      // `writerHistory`, formatting to the toolbar, paste to `onPaste`.
      return null;
  }
}

/**
 * The material an `<input>` event must be reconciled against.
 *
 * `domText` is the concatenated text of every fragment of the paragraph, so a
 * paragraph that was paginated mid-typing still produces one coherent patch.
 */
export interface WriterSurfaceInputReconciliation {
  readonly paragraphIndex: number;
  readonly beforeText: string;
  readonly afterText: string;
  readonly caret: number;
}

/**
 * Reconciles an observed DOM text with the model text, or `null` when the DOM
 * says nothing new. Returning `null` is important: a `null` result must not
 * create a history entry, otherwise every non-text input event (a formatting
 * key, a stray selection change) would pollute undo.
 */
export function reconcileWriterSurfaceInput(
  paragraphIndex: number,
  modelText: string,
  domText: string,
): WriterSurfaceInputReconciliation | null {
  const patch = resolveWriterSurfaceTextPatch(modelText, domText);
  if (!patch) return null;
  return {
    paragraphIndex,
    beforeText: modelText,
    afterText: domText,
    caret: resolveWriterSurfacePatchCaret(patch),
  };
}
