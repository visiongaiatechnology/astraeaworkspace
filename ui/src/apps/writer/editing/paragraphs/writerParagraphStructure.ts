// STATUS: DIAMANT VGT SUPREME — Structural paragraph operations (split & merge) for Writer
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';

/**
 * Formatting spans are the authoritative carrier of character formatting.
 * Every structural edit therefore slices spans instead of flattening them to
 * plain text, so bold/italic/colour runs survive Enter and Backspace.
 */
export function cloneWriterSpans(spans: readonly TextSpan[]): TextSpan[] {
  return spans.map((span) => ({ ...span }));
}

export function normalizeWriterSpans(spans: readonly TextSpan[]): TextSpan[] {
  const cloned = cloneWriterSpans(spans).filter((span) => span.text.length > 0);
  return cloned.length > 0 ? cloned : [{ text: '' }];
}

export function sliceWriterSpans(
  spans: readonly TextSpan[],
  start: number,
  end: number,
): TextSpan[] {
  const lower = Math.max(0, Math.trunc(Math.min(start, end)));
  const upper = Math.max(lower, Math.trunc(Math.max(start, end)));
  const result: TextSpan[] = [];
  let offset = 0;
  for (const span of spans) {
    const spanStart = offset;
    const spanEnd = offset + span.text.length;
    offset = spanEnd;
    const from = Math.max(lower, spanStart);
    const to = Math.min(upper, spanEnd);
    if (to <= from) continue;
    result.push({ ...span, text: span.text.slice(from - spanStart, to - spanStart) });
  }
  return result.length > 0 ? result : [{ text: '' }];
}

export interface WriterParagraphMergeResult {
  readonly paragraphs: Paragraph[];
  readonly removedParagraphId: string;
  readonly caret: { readonly paragraphId: string; readonly offset: number };
  /** True when character content was joined; false when only an empty paragraph was dropped. */
  readonly joinedText: boolean;
}

/**
 * Backspace at the very beginning of a paragraph. The current paragraph is
 * folded into its predecessor: an empty paragraph is removed outright, a
 * paragraph with text donates its spans and the caret lands on the seam.
 * The predecessor keeps its paragraph style, matching word-processor
 * behaviour. Returns `null` when the operation does not apply, so the caller
 * can fall through to default keyboard handling.
 */
export function mergeWriterParagraphBackward(
  paragraphs: readonly Paragraph[],
  index: number,
): WriterParagraphMergeResult | null {
  if (!Number.isInteger(index) || index <= 0 || index >= paragraphs.length) return null;
  const previous = paragraphs[index - 1];
  const current = paragraphs[index];
  if (!previous || !current) return null;
  const previousText = previous.spans.map((span) => span.text).join('');
  const currentText = current.spans.map((span) => span.text).join('');

  if (currentText.length === 0 && previousText.length === 0) {
    const next = paragraphs.filter((_, position) => position !== index);
    return {
      paragraphs: next,
      removedParagraphId: current.id,
      caret: { paragraphId: previous.id, offset: 0 },
      joinedText: false,
    };
  }

  if (currentText.length === 0) {
    const next = paragraphs.filter((_, position) => position !== index);
    return {
      paragraphs: next,
      removedParagraphId: current.id,
      caret: { paragraphId: previous.id, offset: previousText.length },
      joinedText: false,
    };
  }

  const mergedSpans = previousText.length === 0
    ? normalizeWriterSpans(current.spans)
    : normalizeWriterSpans([...cloneWriterSpans(previous.spans), ...cloneWriterSpans(current.spans)]);
  const merged: Paragraph = { ...previous, spans: mergedSpans };
  const next = [
    ...paragraphs.slice(0, index - 1),
    merged,
    ...paragraphs.slice(index + 1),
  ];
  return {
    paragraphs: next,
    removedParagraphId: current.id,
    caret: { paragraphId: previous.id, offset: previousText.length },
    joinedText: true,
  };
}

export interface WriterParagraphSplitResult {
  readonly paragraphs: Paragraph[];
  readonly newParagraphId: string;
  readonly caret: { readonly paragraphId: string; readonly offset: number };
}

/**
 * WR-027 (native round 6) — **a manual break is not inheritable.**
 *
 * `Enter` after `Strg+Enter` duplicated the page break: the split cloned the whole
 * style, including `page_break_before`, so the fresh empty paragraph carried the very
 * flag that had just started a new page — every further `Enter` produced another
 * empty page. A manual break belongs to the paragraph the user explicitly broke
 * (or to the paragraph the break command created); a paragraph that only *exists
 * because of* a split has never been marked by the user.
 */
export function writerSplitParagraphStyle(style: Paragraph['style']): Paragraph['style'] {
  return {
    ...style,
    page_break_before: undefined,
    column_break_before: undefined,
  };
}

/**
 * Enter inside a paragraph. The paragraph is cut at the caret; the tail moves
 * into a new paragraph that inherits the source style including list and
 * heading attributes. At offset 0 the new empty paragraph is placed above the
 * source paragraph, at the very end it is placed below it — both keep the
 * caret in the newly created paragraph.
 *
 * The one attribute a split deliberately does **not** inherit is a manual break
 * (`page_break_before`, `column_break_before`): see `writerSplitParagraphStyle`.
 */
export function splitWriterParagraphAt(
  paragraphs: readonly Paragraph[],
  index: number,
  offset: number,
  newParagraphId: string,
): WriterParagraphSplitResult | null {
  if (!Number.isInteger(index) || index < 0 || index >= paragraphs.length) return null;
  if (newParagraphId.length === 0) return null;
  const source = paragraphs[index];
  if (!source) return null;
  const textLength = source.spans.reduce((total, span) => total + span.text.length, 0);
  const caretOffset = Math.max(0, Math.min(Math.trunc(offset), textLength));
  const created: Paragraph = {
    id: newParagraphId,
    style: writerSplitParagraphStyle(source.style),
    spans: [{ text: '' }],
  };

  if (caretOffset <= 0) {
    const next = [
      ...paragraphs.slice(0, index),
      created,
      ...paragraphs.slice(index),
    ];
    return { paragraphs: next, newParagraphId, caret: { paragraphId: newParagraphId, offset: 0 } };
  }

  if (caretOffset >= textLength) {
    const next = [
      ...paragraphs.slice(0, index + 1),
      created,
      ...paragraphs.slice(index + 1),
    ];
    return { paragraphs: next, newParagraphId, caret: { paragraphId: newParagraphId, offset: 0 } };
  }

  const head = sliceWriterSpans(source.spans, 0, caretOffset);
  const tail = sliceWriterSpans(source.spans, caretOffset, textLength);
  const splitSource: Paragraph = { ...source, spans: head };
  const splitTail: Paragraph = { id: newParagraphId, style: writerSplitParagraphStyle(source.style), spans: tail };
  const next = [
    ...paragraphs.slice(0, index),
    splitSource,
    splitTail,
    ...paragraphs.slice(index + 1),
  ];
  return { paragraphs: next, newParagraphId, caret: { paragraphId: newParagraphId, offset: 0 } };
}
