// STATUS: PLATIN — Links as a semantic span property (WR-035)
//
// A link is **not** a new object and not an overlay: the model already carries
// `TextSpan.link` (`internal` / `external`). The command below only sets or clears that
// property on the spans a range covers — so a link travels with the text through undo,
// save/reopen, copy and export, and the writing flow is never interrupted by a block.
import type { Paragraph, TextSpan, WriterTextLink } from '../../../../shared/contracts/workspace';
import { normalizeWriterSpans, sliceWriterSpans } from '../../editing/paragraphs/writerParagraphStructure';
import type { WriterCoveredParagraphRange } from './writerRangeFormatState';

function spanLength(span: TextSpan): number {
  return span.text.length;
}

function withLink(span: TextSpan, link: WriterTextLink | undefined): TextSpan {
  if (link === undefined) {
    const { link: _removed, ...rest } = span;
    return rest;
  }
  return { ...span, link };
}

/**
 * Sets (`link`) or clears (`undefined`) the link on everything the ranges cover.
 *
 * Returns the patched paragraphs and the ids that actually changed; a command that
 * would not change anything reports zero so the caller can skip the transaction.
 */
export function applyWriterLinkToRanges(
  paragraphs: readonly Paragraph[],
  ranges: readonly WriterCoveredParagraphRange[],
  link: WriterTextLink | undefined,
): { paragraphs: Paragraph[]; changedParagraphIds: string[] } {
  if (ranges.length === 0) return { paragraphs: [...paragraphs], changedParagraphIds: [] };
  const changedParagraphIds: string[] = [];
  const next = paragraphs.map((paragraph) => {
    const range = ranges.find((entry) => entry.paragraphId === paragraph.id);
    if (!range) return paragraph;
    const length = paragraph.spans.reduce((total, span) => total + spanLength(span), 0);
    const start = Math.max(0, Math.min(range.start, length));
    const end = Math.max(start, Math.min(range.end, length));
    if (end <= start) return paragraph;
    const head = sliceWriterSpans(paragraph.spans, 0, start);
    const middle = sliceWriterSpans(paragraph.spans, start, end).map((span) => withLink(span, link));
    const tail = sliceWriterSpans(paragraph.spans, end, length);
    const patched = normalizeWriterSpans([...head, ...middle, ...tail]);
    if (JSON.stringify(patched) === JSON.stringify(paragraph.spans)) return paragraph;
    changedParagraphIds.push(paragraph.id);
    return { ...paragraph, spans: patched };
  });
  return { paragraphs: next, changedParagraphIds };
}

/** The link the caret (or the marked range) currently sits in, if any. */
export function resolveWriterLinkAtRange(
  paragraphs: readonly Paragraph[],
  ranges: readonly WriterCoveredParagraphRange[],
): WriterTextLink | null {
  for (const range of ranges) {
    const paragraph = paragraphs.find((item) => item.id === range.paragraphId);
    if (!paragraph) continue;
    let offset = 0;
    for (const span of paragraph.spans) {
      const from = offset;
      const to = offset + spanLength(span);
      offset = to;
      if (range.start < to && range.end > from && span.link) return span.link;
    }
  }
  return null;
}
