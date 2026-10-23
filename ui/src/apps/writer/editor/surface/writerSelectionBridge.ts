// STATUS: PLATIN — Bridge between the DOM selection and the Writer editor state
//
// The editor state stores the caret as `{ paragraphId, start, end }` and a
// cross-paragraph range as a pair of points. The surface stores the selection as
// a DOM `Selection`. This module is the one place that translates between them,
// so neither side has to know the other's shape.
//
// Everything here is pure: it takes a resolved `WriterSelectionRange` plus the
// current paragraph list and returns the state patch. The DOM access stays in
// `writerDomModelAdapter`.
import type { Paragraph } from '../../../../shared/contracts/workspace';
import {
  resolveWriterSelection,
  type WriterResolvedSelection,
  type WriterSelectionPoint,
  type WriterSelectionRange,
} from '../../editing/selection/writerSelectionRange';
import { writerParagraphTextLength } from '../../editing/caret/writerCaretTargeting';

/** The caret/focus end as the editor stores it for one paragraph. */
export interface WriterSurfaceTextSelection {
  readonly paragraphId: string;
  readonly start: number;
  readonly end: number;
}

/**
 * What the editor has to change after the DOM selection moved.
 *
 * `textSelection` always describes exactly one paragraph — the focus paragraph —
 * because that is what single-paragraph commands (font, colour, insert) need.
 * A range that crosses paragraphs additionally reports `rangeSelection`, which is
 * what the multi-paragraph commands consume.
 */
export interface WriterSurfaceSelectionReport {
  /** Paragraph that owns the focus end of the selection. */
  readonly activeParagraphId: string;
  readonly textSelection: WriterSurfaceTextSelection;
  /** Non-null only for a range that crosses a paragraph boundary. */
  readonly rangeSelection: WriterSelectionRange | null;
  readonly spansParagraphs: boolean;
  readonly collapsed: boolean;
  /** Paragraph ids the range covers, in document order. Empty unless it spans. */
  readonly coveredParagraphIds: readonly string[];
}

function clampPoint(paragraphs: readonly Paragraph[], point: WriterSelectionPoint): WriterSelectionPoint | null {
  const paragraph = paragraphs.find((candidate) => candidate.id === point.paragraphId);
  if (!paragraph) return null;
  const length = writerParagraphTextLength(paragraph);
  if (!Number.isFinite(point.offset)) return { paragraphId: point.paragraphId, offset: 0 };
  return {
    paragraphId: point.paragraphId,
    offset: Math.max(0, Math.min(Math.trunc(point.offset), length)),
  };
}

/**
 * Truthful only when **both** ends land in a paragraph that still exists.
 *
 * A stale DOM selection can point at a paragraph that a pagination pass just
 * removed. Reporting it as a caret somewhere would move the insertion point
 * behind the user's back, so the caller gets `null` and keeps the previous state.
 */
export function resolveWriterSurfaceSelectionReport(
  paragraphs: readonly Paragraph[],
  range: WriterSelectionRange,
): WriterSurfaceSelectionReport | null {
  const anchor = clampPoint(paragraphs, range.anchor);
  const focus = clampPoint(paragraphs, range.focus);
  if (!anchor || !focus) return null;

  const resolved: WriterResolvedSelection | null = resolveWriterSelection(paragraphs, { anchor, focus });
  if (!resolved) return null;

  const coveredParagraphIds = resolved.spansParagraphs && !resolved.collapsed
    ? resolved.paragraphIndexes
      .map((index) => paragraphs[index]?.id)
      .filter((id): id is string => typeof id === 'string')
    : [];

  return {
    activeParagraphId: focus.paragraphId,
    textSelection: {
      paragraphId: focus.paragraphId,
      start: resolved.spansParagraphs ? focus.offset : Math.min(anchor.offset, focus.offset),
      end: resolved.spansParagraphs ? focus.offset : Math.max(anchor.offset, focus.offset),
    },
    rangeSelection: resolved.spansParagraphs ? { anchor, focus } : null,
    spansParagraphs: resolved.spansParagraphs,
    collapsed: resolved.collapsed,
    coveredParagraphIds,
  };
}

/** Model range for the editor's stored caret, used to re-project the DOM caret. */
export function writerSurfaceCaretRange(
  paragraphId: string,
  start: number,
  end: number,
): WriterSelectionRange {
  return {
    anchor: { paragraphId, offset: Math.min(start, end) },
    focus: { paragraphId, offset: Math.max(start, end) },
  };
}

/**
 * Whether two reports describe the same thing.
 *
 * `selectionchange` fires for caret blinks, scroll anchoring and programmatic
 * writes alike. Without this comparison every one of them would schedule a React
 * render, which is exactly the kind of feedback loop that makes a rich-text
 * surface feel broken.
 */
export function writerSurfaceSelectionReportsEqual(
  left: WriterSurfaceSelectionReport | null,
  right: WriterSurfaceSelectionReport | null,
): boolean {
  if (!left || !right) return left === right;
  if (left.activeParagraphId !== right.activeParagraphId) return false;
  if (left.spansParagraphs !== right.spansParagraphs) return false;
  if (left.collapsed !== right.collapsed) return false;
  if (left.textSelection.paragraphId !== right.textSelection.paragraphId) return false;
  if (left.textSelection.start !== right.textSelection.start) return false;
  if (left.textSelection.end !== right.textSelection.end) return false;
  const leftRange = left.rangeSelection;
  const rightRange = right.rangeSelection;
  if (!leftRange || !rightRange) return leftRange === rightRange;
  return leftRange.anchor.paragraphId === rightRange.anchor.paragraphId
    && leftRange.anchor.offset === rightRange.anchor.offset
    && leftRange.focus.paragraphId === rightRange.focus.paragraphId
    && leftRange.focus.offset === rightRange.focus.offset;
}

/**
 * Text of a resolved range, used by the "replace selection" transaction and by a
 * witness that compares what was marked with what was replaced.
 */
export function readWriterSurfaceRangeText(
  paragraphs: readonly Paragraph[],
  range: WriterSelectionRange,
): string {
  const resolved = resolveWriterSelection(paragraphs, range);
  if (!resolved) return '';
  const parts: string[] = [];
  for (const index of resolved.paragraphIndexes) {
    const paragraph = paragraphs[index];
    if (!paragraph) continue;
    const text = paragraph.spans.map((span) => span.text).join('');
    const isFirst = index === resolved.startParagraphIndex;
    const isLast = index === resolved.endParagraphIndex;
    const start = isFirst ? Math.min(resolved.startOffset, text.length) : 0;
    const end = isLast ? Math.min(resolved.endOffset, text.length) : text.length;
    parts.push(text.slice(start, Math.max(start, end)));
  }
  return parts.join('\n');
}
