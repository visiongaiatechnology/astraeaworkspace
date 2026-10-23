// STATUS: DIAMANT VGT SUPREME — Deterministic paragraph deletion for Writer
import type { Paragraph } from '../../../../shared/contracts/workspace';
import { writerParagraphTextLength } from '../caret/writerCaretTargeting';

/**
 * Single source of truth for "may this paragraph be removed?".
 *
 * The Writer document always keeps at least one paragraph: the last remaining
 * paragraph is the writing position the user returns to. The trash control in
 * the editor and the deletion handler both consult this predicate, so the
 * visible control and the actual rule can never drift apart.
 */
export function canDeleteWriterParagraph(paragraphCount: number): boolean {
  return Number.isFinite(paragraphCount) && Math.trunc(paragraphCount) > 1;
}

export interface WriterParagraphDeletePlan {
  readonly paragraphs: Paragraph[];
  readonly removedParagraphId: string;
  readonly removedIndex: number;
  /** Paragraph that must own the caret after the deletion. */
  readonly selectedParagraphId: string | null;
  /** Caret offset inside `selectedParagraphId`; the end of the predecessor when one exists. */
  readonly caretOffset: number;
}

/**
 * Removes one paragraph and decides where the caret continues.
 *
 * Deleting a paragraph in the middle moves the caret to the end of the
 * paragraph above, which is the seam the user just created. Deleting the first
 * paragraph selects the new first paragraph at offset 0. Returns `null` when
 * the request cannot be honoured, so the caller never persists a no-op.
 */
export function planWriterParagraphDelete(
  paragraphs: readonly Paragraph[],
  index: number,
): WriterParagraphDeletePlan | null {
  if (!Number.isInteger(index) || index < 0 || index >= paragraphs.length) return null;
  if (!canDeleteWriterParagraph(paragraphs.length)) return null;
  const removed = paragraphs[index];
  if (!removed) return null;

  const next = paragraphs.filter((_, position) => position !== index);
  const hasPredecessor = index > 0;
  const selected = hasPredecessor ? next[index - 1] : next[0];
  const selectedParagraphId = selected?.id ?? null;
  const caretOffset = hasPredecessor && selected ? writerParagraphTextLength(selected) : 0;

  return {
    paragraphs: next,
    removedParagraphId: removed.id,
    removedIndex: index,
    selectedParagraphId,
    caretOffset,
  };
}
