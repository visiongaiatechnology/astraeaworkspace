// STATUS: DIAMANT VGT SUPREME — Cross-paragraph selection model for Writer
import type { Paragraph } from '../../../../shared/contracts/workspace';
import { normalizeWriterSpans, sliceWriterSpans } from '../paragraphs/writerParagraphStructure';
import { writerParagraphTextLength } from '../caret/writerCaretTargeting';

/**
 * One end of a selection. Every Writer paragraph renders its own textarea, so a
 * selection cannot be expressed as a single DOM range — it is a pair of
 * paragraph-relative points instead.
 */
export interface WriterSelectionPoint {
  readonly paragraphId: string;
  readonly offset: number;
}

export interface WriterSelectionRange {
  readonly anchor: WriterSelectionPoint;
  readonly focus: WriterSelectionPoint;
}

/** A selection projected onto document order. */
export interface WriterResolvedSelection {
  readonly startParagraphIndex: number;
  readonly startOffset: number;
  readonly endParagraphIndex: number;
  readonly endOffset: number;
  /** Paragraph indices covered by the selection, in document order. */
  readonly paragraphIndexes: readonly number[];
  readonly collapsed: boolean;
  readonly spansParagraphs: boolean;
}

function clampPoint(paragraphs: readonly Paragraph[], point: WriterSelectionPoint): { index: number; offset: number } | null {
  const index = paragraphs.findIndex((paragraph) => paragraph.id === point.paragraphId);
  if (index < 0) return null;
  const paragraph = paragraphs[index];
  if (!paragraph) return null;
  const length = writerParagraphTextLength(paragraph);
  if (!Number.isFinite(point.offset)) return { index, offset: 0 };
  const offset = Math.max(0, Math.min(Math.trunc(point.offset), length));
  return { index, offset };
}

/**
 * Orders the two ends into document order. Selection direction matters for
 * replacement, not for the covered text, so both ends are clamped into their
 * paragraph first. Returns `null` when an end does not belong to the document.
 */
export function resolveWriterSelection(
  paragraphs: readonly Paragraph[],
  range: WriterSelectionRange,
): WriterResolvedSelection | null {
  if (paragraphs.length === 0) return null;
  const anchor = clampPoint(paragraphs, range.anchor);
  const focus = clampPoint(paragraphs, range.focus);
  if (!anchor || !focus) return null;

  const reversed = anchor.index > focus.index
    || (anchor.index === focus.index && anchor.offset > focus.offset);
  const startParagraphIndex = reversed ? focus.index : anchor.index;
  const startOffset = reversed ? focus.offset : anchor.offset;
  const endParagraphIndex = reversed ? anchor.index : focus.index;
  const endOffset = reversed ? anchor.offset : focus.offset;

  const paragraphIndexes: number[] = [];
  for (let index = startParagraphIndex; index <= endParagraphIndex; index += 1) {
    paragraphIndexes.push(index);
  }
  const collapsed = startParagraphIndex === endParagraphIndex && startOffset === endOffset;
  return {
    startParagraphIndex,
    startOffset,
    endParagraphIndex,
    endOffset,
    paragraphIndexes,
    collapsed,
    spansParagraphs: startParagraphIndex !== endParagraphIndex,
  };
}

export function isWriterSelectionCollapsed(selection: WriterResolvedSelection | null): boolean {
  return selection === null || selection.collapsed;
}

export interface WriterSelectionReplacement {
  readonly paragraphs: Paragraph[];
  readonly caret: { readonly paragraphId: string; readonly offset: number };
  /** Paragraph ids that were removed by the replacement. */
  readonly removedParagraphIds: readonly string[];
}

/**
 * Replaces a resolved selection with new text.
 *
 * The head of the first covered paragraph and the tail of the last one survive
 * verbatim, including their character formatting; every paragraph in between is
 * removed. A replacement containing line breaks opens the same number of extra
 * paragraphs, which is what Enter over a selection has to do.
 */
export function replaceWriterSelection(
  paragraphs: readonly Paragraph[],
  selection: WriterResolvedSelection,
  replacementText: string,
  newParagraphIds: readonly string[],
): WriterSelectionReplacement | null {
  const startParagraph = paragraphs[selection.startParagraphIndex];
  const endParagraph = paragraphs[selection.endParagraphIndex];
  if (!startParagraph || !endParagraph) return null;

  const sameParagraph = selection.startParagraphIndex === selection.endParagraphIndex;
  const startLength = writerParagraphTextLength(startParagraph);
  const endLength = writerParagraphTextLength(endParagraph);
  const startOffset = Math.max(0, Math.min(selection.startOffset, startLength));
  const endOffset = Math.max(0, Math.min(selection.endOffset, endLength));

  const headSpans = sliceWriterSpans(startParagraph.spans, 0, startOffset);
  const tailSpans = sameParagraph
    ? sliceWriterSpans(startParagraph.spans, endOffset, startLength)
    : sliceWriterSpans(endParagraph.spans, endOffset, endLength);

  const segments = replacementText.split('\n');
  const headSegment = segments[0] ?? '';

  if (segments.length === 1) {
    const mergedSpans = normalizeWriterSpans([
      ...headSpans,
      ...(headSegment.length > 0 ? [{ text: headSegment }] : []),
      ...tailSpans,
    ]);
    const merged: Paragraph = { ...startParagraph, spans: mergedSpans };
    return {
      paragraphs: [
        ...paragraphs.slice(0, selection.startParagraphIndex),
        merged,
        ...paragraphs.slice(selection.endParagraphIndex + 1),
      ],
      caret: { paragraphId: merged.id, offset: startOffset + headSegment.length },
      removedParagraphIds: sameParagraph
        ? []
        : paragraphs.slice(selection.startParagraphIndex + 1, selection.endParagraphIndex + 1).map((p) => p.id),
    };
  }

  const headParagraph: Paragraph = {
    ...startParagraph,
    spans: normalizeWriterSpans([
      ...headSpans,
      ...(headSegment.length > 0 ? [{ text: headSegment }] : []),
    ]),
  };
  const created: Paragraph[] = segments.slice(1).map((segment, position) => ({
    id: newParagraphIds[position] ?? `${startParagraph.id}-split-${position + 1}`,
    style: { ...startParagraph.style },
    spans: normalizeWriterSpans([{ text: segment }]),
  }));
  const tailParagraph = created[created.length - 1];
  if (!tailParagraph) return null;
  const tailSegment = segments[segments.length - 1] ?? '';
  tailParagraph.spans = normalizeWriterSpans([
    ...(tailSegment.length > 0 ? [{ text: tailSegment }] : []),
    ...tailSpans,
  ]);

  return {
    paragraphs: [
      ...paragraphs.slice(0, selection.startParagraphIndex),
      headParagraph,
      ...created,
      ...paragraphs.slice(selection.endParagraphIndex + 1),
    ],
    caret: { paragraphId: tailParagraph.id, offset: tailSegment.length },
    removedParagraphIds: sameParagraph
      ? []
      : paragraphs.slice(selection.startParagraphIndex + 1, selection.endParagraphIndex + 1).map((p) => p.id),
  };
}
