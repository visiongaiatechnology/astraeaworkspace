// STATUS: DIAMANT VGT SUPREME — One reading of "what does the marked range say?"
//
// W-111, W-113, W-116 and W-119 are one cause: the formatting surface read the
// properties of the **active paragraph** (or of its first span) even when a range
// covered several paragraphs, so the toolbar, the font fields, the alignment
// buttons, the paragraph dialog and the ruler each reported a value that the
// marked range did not have — and none of them could say "these differ".
//
// This module is that one reading. Every control asks it, so the toolbar cannot
// disagree with the dialog about the same selection.
import type {
  Paragraph,
  WriterTabStop,
  WriterTextAlignment,
} from '../../../../shared/contracts/workspace';
import {
  resolveWriterFontAtRange,
  spansCoveredByRange,
} from '../../editing/text/writerFontRange';
import {
  resolveWriterParagraphIndent,
} from '../paragraphs/writerParagraphIndent';
import { sameWriterStyleValue } from '../../editing/paragraphs/writerStyleValue';
import { writerParagraphTextLength } from '../../editing/caret/writerCaretTargeting';

/**
 * One paragraph of the marked range together with the offsets the range covers.
 * The offsets are always concrete, so a reader never has to guess what an open
 * end means.
 */
export interface WriterCoveredParagraphRange {
  readonly paragraphId: string;
  readonly start: number;
  readonly end: number;
}

/** A value the marked range agrees on — or the knowledge that it does not. */
export interface WriterRangeAttribute<T> {
  /** The value the range carries; the first covered one when the range differs. */
  readonly value: T | undefined;
  /** True when the covered paragraphs or runs do not agree. */
  readonly mixed: boolean;
}

/**
 * The option a `<select>` shows when the marked range disagrees. A control that
 * silently displayed one of the covered values would claim a formatting the
 * document does not have (W-113, W-116); the placeholder says so instead.
 */
export const WRITER_MIXED_SELECT_VALUE = '__writer-mixed__';

export type WriterRangeToggleState = 'on' | 'off' | 'mixed';

export interface WriterRangeStyleFallback {
  readonly alignment?: WriterTextAlignment;
  readonly lineHeight?: number;
  readonly fontFamily?: string;
  readonly fontSizePt?: number;
}

export interface WriterRangeFormatState {
  readonly paragraphCount: number;
  readonly alignment: WriterRangeAttribute<WriterTextAlignment>;
  readonly lineHeight: WriterRangeAttribute<number>;
  readonly leftIndentMm: WriterRangeAttribute<number>;
  readonly rightIndentMm: WriterRangeAttribute<number>;
  readonly firstLineIndentMm: WriterRangeAttribute<number>;
  readonly tabStops: WriterRangeAttribute<readonly WriterTabStop[]>;
  /**
   * The id of the list style the range carries; `''` when it carries none. The
   * style inspector marks a template as active from here, so it marks a
   * template for the whole range instead of for the active paragraph (W-117).
   */
  readonly listStyleId: WriterRangeAttribute<string>;
  readonly fontFamily: WriterRangeAttribute<string>;
  readonly fontSizePt: WriterRangeAttribute<number>;
  readonly bold: WriterRangeAttribute<boolean>;
  readonly italic: WriterRangeAttribute<boolean>;
  readonly underline: WriterRangeAttribute<boolean>;
  readonly strikethrough: WriterRangeAttribute<boolean>;
  readonly subscript: WriterRangeAttribute<boolean>;
  readonly superscript: WriterRangeAttribute<boolean>;
}

const EMPTY_ATTRIBUTE: WriterRangeAttribute<never> = { value: undefined, mixed: false };

interface ResolvedTextSelection {
  readonly paragraphId: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The paragraphs and offsets a command must read.
 *
 * A cross-paragraph drag wins: the origin paragraph contributes from the drag
 * start to its end, the last one from its beginning to the drag end, and the
 * paragraphs in between are covered as a whole. Without such a drag the active
 * paragraph is the range and its marked text — or the whole paragraph — decides.
 */
export function resolveWriterCoveredParagraphRanges(
  paragraphs: readonly Paragraph[],
  activeParagraphIndex: number,
  textSelection: ResolvedTextSelection | null,
  resolvedSelection: {
    readonly paragraphIndexes: readonly number[];
    readonly startParagraphIndex: number;
    readonly startOffset: number;
    readonly endParagraphIndex: number;
    readonly endOffset: number;
    readonly collapsed: boolean;
    readonly spansParagraphs: boolean;
  } | null,
): WriterCoveredParagraphRange[] {
  const lengthOf = (paragraph: Paragraph | undefined): number =>
    paragraph ? writerParagraphTextLength(paragraph) : 0;

  if (resolvedSelection && resolvedSelection.spansParagraphs && !resolvedSelection.collapsed) {
    const covered: WriterCoveredParagraphRange[] = [];
    for (const index of resolvedSelection.paragraphIndexes) {
      const paragraph = paragraphs[index];
      if (!paragraph) continue;
      const length = lengthOf(paragraph);
      const isFirst = index === resolvedSelection.startParagraphIndex;
      const isLast = index === resolvedSelection.endParagraphIndex;
      const start = isFirst ? resolvedSelection.startOffset : 0;
      const end = isLast ? resolvedSelection.endOffset : length;
      covered.push({
        paragraphId: paragraph.id,
        start: Math.max(0, Math.min(start, length)),
        end: Math.max(Math.min(start, length), Math.min(end, length)),
      });
    }
    if (covered.length > 0) return covered;
  }

  const active = paragraphs[activeParagraphIndex];
  if (!active) return [];
  const length = lengthOf(active);
  const marked = textSelection && textSelection.paragraphId === active.id ? textSelection : null;
  const start = Math.max(0, Math.min(marked?.start ?? 0, length));
  const end = Math.max(start, Math.min(marked?.end ?? length, length));
  return [{ paragraphId: active.id, start, end }];
}

function collectScalar<T extends string | number | boolean>(
  values: readonly T[],
): WriterRangeAttribute<T> {
  const first = values[0];
  if (first === undefined) return { value: undefined, mixed: false };
  const uniform = values.every((value) => value === first);
  return { value: first, mixed: !uniform };
}

function collectStructural<T>(
  values: readonly T[],
  equals: (left: T, right: T) => boolean,
): WriterRangeAttribute<T> {
  const first = values[0];
  if (first === undefined) return { value: undefined, mixed: false };
  const uniform = values.every((value) => equals(value, first));
  return { value: first, mixed: !uniform };
}

/** A toggle is `on` only when every covered run carries it, `mixed` otherwise. */
export function resolveWriterRangeToggleState(
  attribute: WriterRangeAttribute<boolean>,
): WriterRangeToggleState {
  if (attribute.mixed) return 'mixed';
  return attribute.value === true ? 'on' : 'off';
}

/** `true`/`false`/`mixed` — the three states `aria-pressed` understands. */
export function resolveWriterAriaPressed(state: WriterRangeToggleState): boolean | 'mixed' {
  if (state === 'mixed') return 'mixed';
  return state === 'on';
}

interface ToggleReading {
  readonly value: boolean;
  readonly mixed: boolean;
}

function combineToggles(readings: readonly ToggleReading[]): WriterRangeAttribute<boolean> {
  if (readings.length === 0) return { value: false, mixed: false };
  const everyOn = readings.every((reading) => reading.value);
  const everyOff = readings.every((reading) => !reading.value);
  const mixedInside = readings.some((reading) => reading.mixed);
  if (mixedInside || (!everyOn && !everyOff)) return { value: everyOn, mixed: true };
  return { value: everyOn, mixed: false };
}

function readToggle(
  paragraph: Paragraph,
  range: WriterCoveredParagraphRange,
  property: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'subscript' | 'superscript',
): ToggleReading {
  const covered = spansCoveredByRange(paragraph.spans, { start: range.start, end: range.end });
  if (covered.length === 0) return { value: false, mixed: false };
  const on = covered.filter((span) => span[property] === true).length;
  if (on === 0) return { value: false, mixed: false };
  if (on === covered.length) return { value: true, mixed: false };
  return { value: false, mixed: true };
}

function combineMixedValues<T>(
  readings: readonly { readonly value: T | undefined; readonly mixed: boolean }[],
): WriterRangeAttribute<T> {
  if (readings.length === 0) return { value: undefined, mixed: false };
  const first = readings.find((reading) => reading.value !== undefined)?.value;
  if (first === undefined) return { value: undefined, mixed: false };
  const differs = readings.some((reading) => reading.mixed)
    || readings.some((reading) => reading.value !== undefined && reading.value !== first);
  return { value: first, mixed: differs };
}

/**
 * What the marked range says about every formatting attribute the surface shows.
 * An empty range reports nothing as mixed, so a control never claims a
 * disagreement that does not exist.
 */
export function resolveWriterRangeFormatState(
  paragraphs: readonly Paragraph[],
  covered: readonly WriterCoveredParagraphRange[],
  fallbackStyle?: WriterRangeStyleFallback | null,
): WriterRangeFormatState {
  const coveredParagraphs = covered
    .map((range) => ({ range, paragraph: paragraphs.find((candidate) => candidate.id === range.paragraphId) }))
    .filter((entry): entry is { range: WriterCoveredParagraphRange; paragraph: Paragraph } => entry.paragraph !== undefined);

  if (coveredParagraphs.length === 0) {
    return {
      paragraphCount: 0,
      alignment: EMPTY_ATTRIBUTE,
      lineHeight: EMPTY_ATTRIBUTE,
      leftIndentMm: EMPTY_ATTRIBUTE,
      rightIndentMm: EMPTY_ATTRIBUTE,
      firstLineIndentMm: EMPTY_ATTRIBUTE,
      tabStops: EMPTY_ATTRIBUTE,
      listStyleId: EMPTY_ATTRIBUTE,
      fontFamily: EMPTY_ATTRIBUTE,
      fontSizePt: EMPTY_ATTRIBUTE,
      bold: EMPTY_ATTRIBUTE,
      italic: EMPTY_ATTRIBUTE,
      underline: EMPTY_ATTRIBUTE,
      strikethrough: EMPTY_ATTRIBUTE,
      subscript: EMPTY_ATTRIBUTE,
      superscript: EMPTY_ATTRIBUTE,
    };
  }

  const alignments = coveredParagraphs.map(({ paragraph }) =>
    paragraph.style.alignment ?? fallbackStyle?.alignment ?? 'left');
  const lineHeights = coveredParagraphs.map(({ paragraph }) =>
    paragraph.style.line_height ?? fallbackStyle?.lineHeight ?? 1.5);
  // The readers, not the raw fields: an unset indent renders as 0 mm, so a range
  // of "unset" and "0" does not disagree, and "unset" and "12" does.
  const indents = coveredParagraphs.map(({ paragraph }) => resolveWriterParagraphIndent(paragraph.style));
  const tabStops = coveredParagraphs.map(({ paragraph }) => paragraph.style.tab_stops ?? []);

  const fonts = coveredParagraphs.map(({ paragraph, range }) => resolveWriterFontAtRange(
    paragraph.spans,
    fallbackStyle ?? undefined,
    { start: range.start, end: range.end },
  ));

  return {
    paragraphCount: coveredParagraphs.length,
    alignment: collectScalar(alignments),
    lineHeight: collectScalar(lineHeights),
    leftIndentMm: collectScalar(indents.map((indent) => indent.leftMm)),
    rightIndentMm: collectScalar(indents.map((indent) => indent.rightMm)),
    firstLineIndentMm: collectScalar(indents.map((indent) => indent.firstLineMm)),
    tabStops: collectStructural(tabStops, (left, right) => sameWriterStyleValue(left, right)),
    listStyleId: collectScalar(coveredParagraphs.map(({ paragraph }) => paragraph.style.list_style_id ?? '')),
    fontFamily: combineMixedValues(fonts.map((font) => ({ value: font.fontFamily, mixed: font.familyMixed }))),
    fontSizePt: combineMixedValues(fonts.map((font) => ({ value: font.fontSizePt, mixed: font.sizeMixed }))),
    bold: combineToggles(coveredParagraphs.map(({ paragraph, range }) => readToggle(paragraph, range, 'bold'))),
    italic: combineToggles(coveredParagraphs.map(({ paragraph, range }) => readToggle(paragraph, range, 'italic'))),
    underline: combineToggles(coveredParagraphs.map(({ paragraph, range }) => readToggle(paragraph, range, 'underline'))),
    strikethrough: combineToggles(coveredParagraphs.map(({ paragraph, range }) => readToggle(paragraph, range, 'strikethrough'))),
    subscript: combineToggles(coveredParagraphs.map(({ paragraph, range }) => readToggle(paragraph, range, 'subscript'))),
    superscript: combineToggles(coveredParagraphs.map(({ paragraph, range }) => readToggle(paragraph, range, 'superscript'))),
  };
}

/**
 * The options a control must offer for a value it may not know: the known values
 * plus the one the document carries. Without the second part a document that
 * brings a value from outside the list (a DOCX import, a theme, a custom size)
 * rendered the *first* entry as if it were the document's value — the control
 * lied about the document (W-113, W-114).
 */
export function resolveWriterRangeOptions<T>(
  known: readonly T[],
  current: T | undefined,
  equals: (left: T, right: T) => boolean = (left, right) => left === right,
): T[] {
  if (current === undefined || known.some((value) => equals(value, current))) return [...known];
  return [current, ...known];
}
