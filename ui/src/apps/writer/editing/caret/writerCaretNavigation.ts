// STATUS: DIAMANT VGT SUPREME — Keyboard caret navigation across Writer paragraphs
import type { Paragraph } from '../../../../shared/contracts/workspace';
import { writerParagraphTextLength } from '../caret/writerCaretTargeting';

/**
 * Every Writer paragraph is its own textarea, so the browser's native caret
 * navigation stops at the textarea border: ArrowRight at the end of a paragraph
 * does nothing, Ctrl+Home jumps to the start of the *fragment* instead of the
 * document, and Shift+Arrow cannot select across a paragraph at all.
 *
 * This module decides when a key must cross that border. It returns `null`
 * whenever the native behaviour is already correct, so nothing is taken away
 * from the browser without reason.
 */

export interface WriterNavigationTarget {
  readonly paragraphId: string;
  readonly offset: number;
}

export interface WriterNavigationResolution {
  readonly target: WriterNavigationTarget;
  /** True when the caller must extend a range selection instead of moving the caret. */
  readonly extendSelection: boolean;
}

export interface WriterKeyboardNavigationInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly paragraphs: readonly Paragraph[];
  /** Index of the paragraph that owns the focused textarea. */
  readonly paragraphIndex: number;
  /** Document-absolute offset of the caret inside the paragraph. */
  readonly caretOffset: number;
  /** Document-absolute end of the rendered fragment. */
  readonly fragmentEnd: number;
  /** Document-absolute start of the rendered fragment. */
  readonly fragmentStart: number;
  readonly isFirstFragment: boolean;
  readonly isLastFragment: boolean;
  /** First and last paragraph of the page the caret is on, when known. */
  readonly pageBoundary?: { readonly firstParagraphId: string; readonly lastParagraphId: string } | undefined;
}

function target(paragraph: Paragraph | undefined, offset: number): WriterNavigationTarget | null {
  if (!paragraph) return null;
  return { paragraphId: paragraph.id, offset: Math.max(0, Math.trunc(offset)) };
}

function endOf(paragraph: Paragraph | undefined): WriterNavigationTarget | null {
  if (!paragraph) return null;
  return { paragraphId: paragraph.id, offset: writerParagraphTextLength(paragraph) };
}

function hasModifier(input: WriterKeyboardNavigationInput): boolean {
  return input.altKey || input.ctrlKey || input.metaKey;
}

/**
 * Resolves a key press that has to leave the current fragment or paragraph.
 * Returns `null` when the browser's own handling is already correct.
 */
export function resolveWriterKeyboardNavigation(
  input: WriterKeyboardNavigationInput,
): WriterNavigationResolution | null {
  const { paragraphs, paragraphIndex, caretOffset, fragmentStart, fragmentEnd } = input;
  if (paragraphs.length === 0) return null;
  if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= paragraphs.length) return null;
  const current = paragraphs[paragraphIndex];
  if (!current) return null;
  const command = input.ctrlKey || input.metaKey ? 'document' : 'plain';
  const extend = input.shiftKey;

  // Ctrl/Cmd+Home and Ctrl/Cmd+End address the whole document.
  if (command === 'document' && (input.key === 'Home' || input.key === 'End')) {
    const last = paragraphs[paragraphs.length - 1];
    if (input.key === 'Home') {
      const first = paragraphs[0];
      const resolved = target(first, 0);
      return resolved ? { target: resolved, extendSelection: extend } : null;
    }
    const resolved = endOf(last);
    return resolved ? { target: resolved, extendSelection: extend } : null;
  }

  // Ctrl/Cmd+ArrowUp/Down address the current paragraph, which is what a user
  // expects from a word processor.
  if (command === 'document' && (input.key === 'ArrowUp' || input.key === 'ArrowDown')) {
    const resolved = input.key === 'ArrowUp' ? target(current, 0) : endOf(current);
    return resolved ? { target: resolved, extendSelection: extend } : null;
  }

  // Everything below is plain navigation, optionally with Shift held.
  if (hasModifier(input)) return null;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(input.key)) return null;

  if (input.key === 'ArrowRight') {
    if (caretOffset < fragmentEnd) return null;
    if (!input.isLastFragment) {
      const resolved = target(current, fragmentEnd);
      return resolved ? { target: resolved, extendSelection: extend } : null;
    }
    const resolved = target(paragraphs[paragraphIndex + 1], 0);
    return resolved ? { target: resolved, extendSelection: extend } : null;
  }

  if (input.key === 'ArrowLeft') {
    if (caretOffset > fragmentStart) return null;
    if (!input.isFirstFragment) {
      const resolved = target(current, Math.max(0, fragmentStart - 1));
      return resolved ? { target: resolved, extendSelection: extend } : null;
    }
    const resolved = endOf(paragraphs[paragraphIndex - 1]);
    return resolved ? { target: resolved, extendSelection: extend } : null;
  }

  if (input.key === 'ArrowDown') {
    // The line position is unknown without text metrics, so only the clearly
    // defined case is taken: the caret already sits at the end of the fragment.
    if (caretOffset < fragmentEnd) return null;
    if (!input.isLastFragment) {
      const resolved = target(current, fragmentEnd);
      return resolved ? { target: resolved, extendSelection: extend } : null;
    }
    const resolved = target(paragraphs[paragraphIndex + 1], 0);
    return resolved ? { target: resolved, extendSelection: extend } : null;
  }

  if (input.key === 'ArrowUp') {
    if (caretOffset > fragmentStart) return null;
    if (!input.isFirstFragment) {
      const resolved = target(current, Math.max(0, fragmentStart - 1));
      return resolved ? { target: resolved, extendSelection: extend } : null;
    }
    const resolved = endOf(paragraphs[paragraphIndex - 1]);
    return resolved ? { target: resolved, extendSelection: extend } : null;
  }

  // PageUp/PageDown move the caret to the page boundary it is already on.
  const boundary = input.pageBoundary;
  if (!boundary) return null;
  if (input.key === 'PageUp') {
    const firstIndex = paragraphs.findIndex((paragraph) => paragraph.id === boundary.firstParagraphId);
    if (firstIndex < 0) return null;
    if (firstIndex === paragraphIndex && caretOffset <= fragmentStart) return null;
    const resolved = target(paragraphs[firstIndex], 0);
    return resolved ? { target: resolved, extendSelection: extend } : null;
  }
  const lastIndex = paragraphs.findIndex((paragraph) => paragraph.id === boundary.lastParagraphId);
  if (lastIndex < 0) return null;
  const resolved = endOf(paragraphs[lastIndex]);
  if (!resolved) return null;
  // Already at the end of the page: nothing to move to.
  if (lastIndex === paragraphIndex && caretOffset >= resolved.offset) return null;
  return { target: resolved, extendSelection: extend };
}
