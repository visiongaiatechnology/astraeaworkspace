// STATUS: PLATIN — Span-preserving Writer text operations
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';

const TEXT_SPAN_FORMAT_KEYS: ReadonlyArray<Exclude<keyof TextSpan, 'text'>> = [
  'character_style_id',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'font_family',
  'font_size_pt',
  'text_color',
  'background_color',
  'highlight_color',
  'subscript',
  'superscript',
  'language',
];

function sameFormatting(left: TextSpan, right: TextSpan): boolean {
  return TEXT_SPAN_FORMAT_KEYS.every((key) => left[key] === right[key]);
}

function mergeAdjacentSpans(spans: readonly TextSpan[]): TextSpan[] {
  const merged: TextSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const previous = merged[merged.length - 1];
    if (previous && sameFormatting(previous, span)) {
      previous.text += span.text;
    } else {
      merged.push({ ...span });
    }
  }
  return merged.length > 0 ? merged : [{ text: '', font_size_pt: 11 }];
}

export type WriterTextSpanFormat = Omit<TextSpan, 'text'>;

export function writerTextSpanFormatAtOffset(
  paragraph: Paragraph,
  rawOffset: number,
): WriterTextSpanFormat {
  const textLength = paragraph.spans.reduce((total, span) => total + span.text.length, 0);
  const offset = Math.min(textLength, Math.max(0, Math.trunc(rawOffset)));
  let cursor = 0;
  let candidate = paragraph.spans.at(-1) ?? { text: '', font_size_pt: 11 };
  for (const span of paragraph.spans) {
    const end = cursor + span.text.length;
    if (offset < end || end === textLength) {
      candidate = span;
      break;
    }
    cursor = end;
  }
  const { text: _text, ...format } = candidate;
  return format;
}

/**
 * Walks the spans of a range and rebuilds the covered slice with `buildMiddle`.
 * Both the replacing and the merging variant share this so their slicing,
 * clamping and neighbour-merging behaviour cannot drift apart.
 */
function mapWriterRangeSpans(
  paragraph: Paragraph,
  rawStart: number,
  rawEnd: number,
  buildMiddle: (span: TextSpan, coveredText: string) => TextSpan,
): Paragraph {
  const textLength = paragraph.spans.reduce((total, span) => total + span.text.length, 0);
  const start = Math.min(textLength, Math.max(0, Math.trunc(Math.min(rawStart, rawEnd))));
  const end = Math.min(textLength, Math.max(start, Math.trunc(Math.max(rawStart, rawEnd))));
  if (start === end) return paragraph;

  const next: TextSpan[] = [];
  let cursor = 0;
  for (const span of paragraph.spans) {
    const spanStart = cursor;
    const spanEnd = spanStart + span.text.length;
    cursor = spanEnd;
    if (spanEnd <= start || spanStart >= end) {
      next.push({ ...span });
      continue;
    }
    const localStart = Math.max(0, start - spanStart);
    const localEnd = Math.min(span.text.length, end - spanStart);
    if (localStart > 0) next.push({ ...span, text: span.text.slice(0, localStart) });
    next.push(buildMiddle(span, span.text.slice(localStart, localEnd)));
    if (localEnd < span.text.length) next.push({ ...span, text: span.text.slice(localEnd) });
  }
  return { ...paragraph, spans: mergeAdjacentSpans(next) };
}

/**
 * Replaces the formatting of the range with exactly `format`. Used by the format
 * painter, which intentionally applies a whole format rather than a patch.
 */
export function applyWriterTextSpanFormatRange(
  paragraph: Paragraph,
  rawStart: number,
  rawEnd: number,
  format: WriterTextSpanFormat,
): Paragraph {
  return mapWriterRangeSpans(paragraph, rawStart, rawEnd, (_span, coveredText) => ({
    text: coveredText,
    ...format,
  }));
}

/**
 * Applies a formatting patch to the range and keeps every other property of each
 * covered span. This is the variant a property toggle needs: turning bold on
 * must not silently drop italic, underline or the font size.
 */
export function mergeWriterTextSpanFormatRange(
  paragraph: Paragraph,
  rawStart: number,
  rawEnd: number,
  patch: WriterTextSpanFormat,
): Paragraph {
  return mapWriterRangeSpans(paragraph, rawStart, rawEnd, (span, coveredText) => ({
    ...span,
    text: coveredText,
    ...patch,
  }));
}

function insertionFormat(spans: readonly TextSpan[], offset: number): Omit<TextSpan, 'text'> {
  let cursor = 0;
  let candidate = spans[0] ?? { text: '', font_size_pt: 11 };
  for (const span of spans) {
    const end = cursor + span.text.length;
    if (offset <= end) {
      candidate = span;
      break;
    }
    candidate = span;
    cursor = end;
  }
  const { text: _text, ...format } = candidate;
  return format;
}

export function replaceWriterParagraphRange(
  paragraph: Paragraph,
  selectionStart: number,
  selectionEnd: number,
  insertedText: string,
): Paragraph {
  const textLength = paragraph.spans.reduce((total, span) => total + span.text.length, 0);
  const start = Math.min(textLength, Math.max(0, Math.trunc(Math.min(selectionStart, selectionEnd))));
  const end = Math.min(textLength, Math.max(start, Math.trunc(Math.max(selectionStart, selectionEnd))));
  const before: TextSpan[] = [];
  const after: TextSpan[] = [];
  let cursor = 0;

  for (const span of paragraph.spans) {
    const spanStart = cursor;
    const spanEnd = spanStart + span.text.length;
    if (spanStart < start) {
      const kept = span.text.slice(0, Math.min(span.text.length, start - spanStart));
      if (kept) before.push({ ...span, text: kept });
    }
    if (spanEnd > end) {
      const kept = span.text.slice(Math.max(0, end - spanStart));
      if (kept) after.push({ ...span, text: kept });
    }
    cursor = spanEnd;
  }

  const inserted = insertedText ? [{ ...insertionFormat(paragraph.spans, start), text: insertedText }] : [];
  return { ...paragraph, spans: mergeAdjacentSpans([...before, ...inserted, ...after]) };
}

export function replaceWriterParagraphText(paragraph: Paragraph, newText: string): Paragraph {
  const oldText = paragraph.spans.map((span) => span.text).join('');
  if (oldText === newText) return paragraph;
  let prefixLength = 0;
  const sharedLimit = Math.min(oldText.length, newText.length);
  while (prefixLength < sharedLimit && oldText[prefixLength] === newText[prefixLength]) prefixLength += 1;

  let suffixLength = 0;
  while (
    suffixLength < oldText.length - prefixLength
    && suffixLength < newText.length - prefixLength
    && oldText[oldText.length - 1 - suffixLength] === newText[newText.length - 1 - suffixLength]
  ) suffixLength += 1;

  return replaceWriterParagraphRange(
    paragraph,
    prefixLength,
    oldText.length - suffixLength,
    newText.slice(prefixLength, newText.length - suffixLength),
  );
}
