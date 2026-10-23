// STATUS: PLATIN — Model-deterministic caret stepping (WR-017)
//
// The surface owns the caret, so the caret movements that do not need layout are
// decided in the model: one character left/right (crossing paragraph boundaries),
// one word left/right, and Home/End of a paragraph. `ArrowUp`/`ArrowDown` are
// deliberately absent — they address the visual line, which a model without layout
// cannot resolve.
//
// Pure function, no DOM: the browser-side wiring in `WriterRichTextSurface` only
// applies the answer.
import type { Paragraph } from '../../../../shared/contracts/workspace';
import { writerParagraphTextLength } from './writerCaretTargeting';
import {
  resolveWriterSurfaceWordEnd,
  resolveWriterSurfaceWordStart,
  type WriterCaretStep,
} from '../../editor/surface/writerInputTransactions';

export interface WriterCaretPoint {
  readonly paragraphId: string;
  readonly offset: number;
}

function clampOffset(paragraph: Paragraph, offset: number): number {
  return Math.max(0, Math.min(offset, writerParagraphTextLength(paragraph)));
}

/**
 * The caret position one step away from `from`, or `null` when the paragraph is
 * unknown.
 *
 * Stepping past a paragraph boundary moves into the neighbour (end of the previous
 * one, start of the next one) and never falls out of the document: at the first
 * character of the first paragraph and at the last character of the last paragraph
 * the caret simply stays.
 */
export function resolveWriterCaretStepTarget(
  paragraphs: readonly Paragraph[],
  from: WriterCaretPoint,
  step: WriterCaretStep,
): WriterCaretPoint | null {
  const index = paragraphs.findIndex((paragraph) => paragraph.id === from.paragraphId);
  if (index < 0) return null;
  const paragraph = paragraphs[index]!;
  const text = paragraph.spans.map((span) => span.text).join('');
  const offset = clampOffset(paragraph, from.offset);
  const previous = paragraphs[index - 1];
  const next = paragraphs[index + 1];

  switch (step) {
    case 'paragraph-start':
      return { paragraphId: paragraph.id, offset: 0 };
    case 'paragraph-end':
      return { paragraphId: paragraph.id, offset: text.length };
    case 'char-backward': {
      if (offset > 0) return { paragraphId: paragraph.id, offset: offset - 1 };
      if (!previous) return { paragraphId: paragraph.id, offset: 0 };
      return { paragraphId: previous.id, offset: writerParagraphTextLength(previous) };
    }
    case 'char-forward': {
      if (offset < text.length) return { paragraphId: paragraph.id, offset: offset + 1 };
      if (!next) return { paragraphId: paragraph.id, offset: text.length };
      return { paragraphId: next.id, offset: 0 };
    }
    case 'word-backward': {
      if (offset === 0) {
        if (!previous) return { paragraphId: paragraph.id, offset: 0 };
        return { paragraphId: previous.id, offset: writerParagraphTextLength(previous) };
      }
      return { paragraphId: paragraph.id, offset: resolveWriterSurfaceWordStart(text, offset) };
    }
    case 'word-forward': {
      if (offset >= text.length) {
        if (!next) return { paragraphId: paragraph.id, offset: text.length };
        return { paragraphId: next.id, offset: 0 };
      }
      return { paragraphId: paragraph.id, offset: resolveWriterSurfaceWordEnd(text, offset) };
    }
    default:
      return null;
  }
}
