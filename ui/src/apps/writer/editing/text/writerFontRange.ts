// STATUS: DIAMANT VGT SUPREME — Selection-aware font family and size control for Writer
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';
import { mergeWriterTextSpanFormatRange, type WriterTextSpanFormat } from '../text/writerTextEditing';

/**
 * Boundaries for a font size the document can carry. The lower bound keeps text
 * readable and editable, the upper bound stops a hostile or broken payload from
 * producing a page-sized glyph.
 */
export const WRITER_FONT_SIZE_MIN_PT = 4;
export const WRITER_FONT_SIZE_MAX_PT = 400;

export interface WriterTextRange {
  readonly start: number;
  readonly end: number;
}

export interface WriterResolvedFont {
  readonly fontFamily: string | undefined;
  readonly fontSizePt: number | undefined;
  /**
   * True when the covered spans disagree and the selection therefore has no
   * single value. The surface must not pretend the range is uniform.
   */
  readonly familyMixed: boolean;
  readonly sizeMixed: boolean;
}

function paragraphText(spans: readonly TextSpan[]): string {
  return spans.map((span) => span.text).join('');
}

function clampOffset(textLength: number, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.trunc(value), textLength));
}

/** Rounds a font size to a half point and clamps it into the allowed band. */
export function normalizeWriterFontSizePt(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const half = Math.round(value * 2) / 2;
  return Math.max(WRITER_FONT_SIZE_MIN_PT, Math.min(WRITER_FONT_SIZE_MAX_PT, half));
}

/**
 * The longest font family the document may carry. A family is a name, not a
 * document: the bound stops a hostile or broken payload from storing an
 * arbitrary blob under `font_family` (W-114).
 */
export const WRITER_FONT_FAMILY_MAX_LENGTH = 128;

/** A font family name may be any printable text, but not a control character. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

/**
 * The one reading of "a font family a document may carry". `undefined` means the
 * value cannot be used: an empty or whitespace-only name, a name carrying control
 * characters and an over-long name are all refused instead of stored. Every
 * caller — the write path and the control that displays the value — goes through
 * here, so the two cannot disagree about what a usable family is.
 */
export function normalizeWriterFontFamily(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > WRITER_FONT_FAMILY_MAX_LENGTH) return undefined;
  if (CONTROL_CHARACTERS.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * The options a font-family control must offer: the known families plus the one
 * the document actually carries. Without the second part a document that brings a
 * family from outside the list (a DOCX import, a theme) rendered the *first*
 * entry as if it were the document's value — the control lied about the document
 * (W-114).
 */
export function resolveWriterFontFamilyOptions(
  known: readonly string[],
  current: string | undefined,
): string[] {
  const normalized = normalizeWriterFontFamily(current);
  if (normalized === undefined || known.includes(normalized)) return [...known];
  return [normalized, ...known];
}

/** The spans a range covers; a collapsed range resolves to the span at the caret. */
export function spansCoveredByRange(
  spans: readonly TextSpan[],
  range?: WriterTextRange | null,
): TextSpan[] {
  const textLength = paragraphText(spans).length;
  if (spans.length === 0) return [];
  if (textLength === 0) return [...spans];

  const start = clampOffset(textLength, range?.start ?? 0);
  const end = clampOffset(textLength, range?.end ?? start);
  const collapsed = start === end;

  const covered: TextSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const spanEnd = cursor + span.text.length;
    if (collapsed) {
      const ownsCaret = start >= cursor
        && (start < spanEnd || (spanEnd === textLength && start === textLength));
      if (ownsCaret) covered.push(span);
    } else if (spanEnd > start && cursor < end) {
      covered.push(span);
    }
    cursor = spanEnd;
  }
  return covered.length > 0 ? covered : [...spans];
}

function distinct<T>(values: readonly (T | undefined)[]): T[] {
  return Array.from(new Set(values.filter((value): value is T => value !== undefined)));
}

/**
 * The font that applies to a marked range or to the caret position.
 *
 * The previous implementation read the **first span of the paragraph** that
 * happened to carry a font, which reports an arbitrary value as soon as a
 * paragraph mixes fonts, and says nothing at all about the marked text. Here the
 * covered spans decide: agreement is reported as-is, disagreement sets the
 * `mixed` flag while still showing the first covered value.
 */
export function resolveWriterFontAtRange(
  spans: readonly TextSpan[],
  style: { fontFamily?: string | undefined; fontSizePt?: number | undefined } | undefined,
  range?: WriterTextRange | null,
): WriterResolvedFont {
  const covered = spansCoveredByRange(spans, range);
  const families = distinct(covered.map((span) => span.font_family));
  const sizes = distinct(covered.map((span) => span.font_size_pt));
  const familyInherited = covered.some((span) => span.font_family === undefined);
  const sizeInherited = covered.some((span) => span.font_size_pt === undefined);

  return {
    fontFamily: normalizeWriterFontFamily(families[0]) ?? normalizeWriterFontFamily(style?.fontFamily),
    fontSizePt: sizes[0] ?? style?.fontSizePt,
    // Only a range that explicitly mixes values is "mixed"; a range that fully
    // inherits the style is uniform.
    familyMixed: families.length > 1 || (families.length === 1 && familyInherited),
    sizeMixed: sizes.length > 1 || (sizes.length === 1 && sizeInherited),
  };
}

export interface WriterFontPatch {
  readonly fontFamily?: string;
  readonly fontSizePt?: number;
}

/**
 * Applies a font patch to a marked range and keeps every other property of each
 * covered span — turning text into 14 pt must not drop its bold or its colour.
 * Without a marked range the whole paragraph is patched, which is what the
 * toolbar means when nothing is selected; an empty paragraph then carries the
 * font for the next typed character.
 */
export function applyWriterFontToRange(
  paragraph: Paragraph,
  patch: WriterFontPatch,
  range?: WriterTextRange | null,
): Paragraph {
  const format: WriterTextSpanFormat = {};
  const fontFamily = normalizeWriterFontFamily(patch.fontFamily);
  if (fontFamily !== undefined) format.font_family = fontFamily;
  if (patch.fontSizePt !== undefined) {
    const normalized = normalizeWriterFontSizePt(patch.fontSizePt);
    if (normalized !== undefined) format.font_size_pt = normalized;
  }
  if (Object.keys(format).length === 0) return paragraph;

  const textLength = paragraphText(paragraph.spans).length;
  const start = clampOffset(textLength, range?.start ?? 0);
  const end = clampOffset(textLength, range?.end ?? start);
  if (start === end) {
    if (paragraph.spans.length === 0) return { ...paragraph, spans: [{ text: '', ...format }] };
    return { ...paragraph, spans: paragraph.spans.map((span) => ({ ...span, ...format })) };
  }
  return mergeWriterTextSpanFormatRange(paragraph, start, end, format);
}
