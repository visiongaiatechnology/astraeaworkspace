// STATUS: DIAMANT VGT SUPREME — Selection-aware span formatting toggle for Writer
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';
import {
  mergeWriterTextSpanFormatRange,
  type WriterTextSpanFormat,
} from '../text/writerTextEditing';
import {
  applyWriterParagraphOperation,
  type WriterParagraphOperationResult,
} from '../paragraphs/writerParagraphFormatApply';

/** The character properties the toolbar can toggle on a marked range. */
export type WriterSpanToggleProperty =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'subscript'
  | 'superscript';

export interface WriterTextRange {
  readonly start: number;
  readonly end: number;
}

function paragraphText(spans: readonly TextSpan[]): string {
  return spans.map((span) => span.text).join('');
}

function clampOffset(textLength: number, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.trunc(value), textLength));
}

/** The span that covers an offset; the last span owns the very end of the text. */
function spanAtOffset(spans: readonly TextSpan[], offset: number): TextSpan | undefined {
  const textLength = paragraphText(spans).length;
  let cursor = 0;
  for (const span of spans) {
    const spanEnd = cursor + span.text.length;
    if (offset < spanEnd || spanEnd === textLength) return span;
    cursor = spanEnd;
  }
  return spans.at(-1);
}

/**
 * True only when **every** character of the range carries the property.
 *
 * This rule is what makes a toggle predictable: a partially bold selection is
 * completed to fully bold on the first press, and only a fully bold range is
 * cleared. Deciding from "some span has it" would strip bold from text that was
 * never bold and would also hit characters outside the selection.
 */
export function writerRangeIsFullyFormatted(
  spans: readonly TextSpan[],
  range: WriterTextRange,
  property: WriterSpanToggleProperty,
): boolean {
  const textLength = paragraphText(spans).length;
  const start = clampOffset(textLength, range.start);
  const end = clampOffset(textLength, range.end);
  if (start === end) return Boolean(spanAtOffset(spans, start)?.[property]);
  let cursor = 0;
  let covered = false;
  for (const span of spans) {
    const spanEnd = cursor + span.text.length;
    if (spanEnd > start && cursor < end) {
      covered = true;
      if (!span[property]) return false;
    }
    cursor = spanEnd;
  }
  return covered;
}

/**
 * The word around a caret offset, bounded by whitespace. Returns `null` when
 * there is no word — an empty paragraph or a caret surrounded by spaces.
 */
export function resolveWriterWordRangeAtOffset(
  spans: readonly TextSpan[],
  rawOffset: number,
): WriterTextRange | null {
  const text = paragraphText(spans);
  if (text.length === 0) return null;
  const caret = clampOffset(text.length, rawOffset);
  const isWordChar = (index: number): boolean => {
    const char = text[index];
    return char !== undefined && !/\s/.test(char);
  };
  let start = caret;
  while (start > 0 && isWordChar(start - 1)) start -= 1;
  let end = caret;
  while (end < text.length && isWordChar(end)) end += 1;
  if (start === end) return null;
  return { start, end };
}

/**
 * Sets one property on the span covering the offset and leaves every other span
 * untouched. For an empty paragraph the single placeholder span carries the
 * format, which is what the next typed character inherits.
 */
export function setWriterSpanPropertyAtOffset(
  paragraph: Paragraph,
  rawOffset: number,
  property: WriterSpanToggleProperty,
  value: boolean,
): Paragraph {
  const textLength = paragraphText(paragraph.spans).length;
  if (textLength === 0) {
    const first = paragraph.spans[0] ?? { text: '' };
    return { ...paragraph, spans: [{ ...first, [property]: value }] };
  }
  const offset = clampOffset(textLength, rawOffset);
  let cursor = 0;
  let applied = false;
  const spans = paragraph.spans.map((span) => {
    const spanEnd = cursor + span.text.length;
    const covers = offset >= cursor && (offset < spanEnd || (spanEnd === textLength && offset === textLength));
    cursor = spanEnd;
    if (!covers || applied) return { ...span };
    applied = true;
    return { ...span, [property]: value };
  });
  return { ...paragraph, spans };
}

export interface WriterSpanToggleResult {
  readonly paragraph: Paragraph;
  /** True when the property was removed, false when it was applied. */
  readonly removed: boolean;
  /** Range the toggle acted on; `null` when only the insertion point was prepared. */
  readonly range: WriterTextRange | null;
}

function applyRange(
  paragraph: Paragraph,
  range: WriterTextRange,
  property: WriterSpanToggleProperty,
): WriterSpanToggleResult {
  const removed = writerRangeIsFullyFormatted(paragraph.spans, range, property);
  const patch = { [property]: !removed } as WriterTextSpanFormat;
  return {
    paragraph: mergeWriterTextSpanFormatRange(paragraph, range.start, range.end, patch),
    removed,
    range,
  };
}

/**
 * Toggles one character property.
 *
 * With a marked range the range is formatted or cleared. Without one, the word
 * under the caret is used, which is the behaviour a user gets from a word
 * processor when nothing is selected. With neither — an empty paragraph or a
 * caret in whitespace — the insertion point itself is prepared, so the next
 * typed character carries the format.
 */
export function toggleWriterSpanProperty(
  paragraph: Paragraph,
  property: WriterSpanToggleProperty,
  selection?: WriterTextRange | null,
): WriterSpanToggleResult {
  const textLength = paragraphText(paragraph.spans).length;
  const start = clampOffset(textLength, selection?.start ?? 0);
  const end = clampOffset(textLength, selection?.end ?? 0);
  if (start !== end) return applyRange(paragraph, { start, end }, property);

  const word = resolveWriterWordRangeAtOffset(paragraph.spans, start);
  if (word) return applyRange(paragraph, word, property);

  const removed = Boolean(spanAtOffset(paragraph.spans, start)?.[property]);
  return {
    paragraph: setWriterSpanPropertyAtOffset(paragraph, start, property, !removed),
    removed,
    range: null,
  };
}

/** One covered paragraph and the offsets the marked range holds inside it. */
export interface WriterSpanToggleTarget {
  readonly paragraphId: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The value a toggle must write across a range that spans several paragraphs.
 *
 * The decision is made **once for the whole range** — the same rule as inside one
 * paragraph: a range that is only partly formatted is completed, and only a range
 * that carries the property everywhere is cleared. Deciding per paragraph would
 * strip bold from the bold paragraph while adding it to the plain one, which is
 * the state a user cannot predict (W-110).
 */
export function resolveWriterSpanToggleValue(
  paragraphs: readonly Paragraph[],
  targets: readonly WriterSpanToggleTarget[],
  property: WriterSpanToggleProperty,
): boolean {
  const covered = targets
    .map((target) => ({ target, paragraph: paragraphs.find((candidate) => candidate.id === target.paragraphId) }))
    .filter((entry): entry is { target: WriterSpanToggleTarget; paragraph: Paragraph } => entry.paragraph !== undefined);
  if (covered.length === 0) return true;
  const everywhere = covered.every(({ target, paragraph }) =>
    writerRangeIsFullyFormatted(paragraph.spans, { start: target.start, end: target.end }, property));
  return !everywhere;
}

/**
 * Toggles one character property over every covered paragraph of a marked range,
 * each within the offsets the range holds there. Text outside the range — in the
 * covered paragraphs as well as in the others — keeps its formatting.
 */
export function applyWriterSpanToggleAcrossParagraphs(
  paragraphs: readonly Paragraph[],
  targets: readonly WriterSpanToggleTarget[],
  property: WriterSpanToggleProperty,
): WriterParagraphOperationResult {
  const value = resolveWriterSpanToggleValue(paragraphs, targets, property);
  const rangesByParagraph = new Map(targets.map((target) => [target.paragraphId, target]));
  const indices = paragraphs
    .map((paragraph, index) => (rangesByParagraph.has(paragraph.id) ? index : -1))
    .filter((index) => index >= 0);
  const patch: WriterTextSpanFormat = { [property]: value };
  return applyWriterParagraphOperation(paragraphs, indices, (paragraph) => {
    const range = rangesByParagraph.get(paragraph.id);
    if (!range) return paragraph;
    return mergeWriterTextSpanFormatRange(paragraph, range.start, range.end, patch);
  });
}
