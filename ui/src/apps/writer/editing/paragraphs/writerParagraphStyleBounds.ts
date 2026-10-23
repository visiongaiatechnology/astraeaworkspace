// STATUS: DIAMANT VGT SUPREME — The one definition of the Writer paragraph-style bounds
//
// W-120 and its siblings: the bounds of indents, spacing and line height used to
// live only in the dialog that reads them, so every *write* path — the paragraph
// dialog's patch, a document import, a direct caller of the patch function —
// could store values no reader would ever produce. Both directions now call the
// same clamp, so a value that reaches the document is a value the layout can use.

/** Indents are millimetres of a printable page; 500 mm is beyond any paper. */
export const WRITER_PARAGRAPH_INDENT_MIN_MM = 0;
export const WRITER_PARAGRAPH_INDENT_MAX_MM = 500;

/** Spacing is typographic points; 1584 pt is 22 inch, the accepted upper bound. */
export const WRITER_PARAGRAPH_SPACING_MIN_PT = 0;
export const WRITER_PARAGRAPH_SPACING_MAX_PT = 1584;

/** Line height band a document may carry; outside this the layout is unusable. */
export const WRITER_LINE_HEIGHT_MIN = 0.5;
export const WRITER_LINE_HEIGHT_MAX = 5;

function clampBounded(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Clamps an indent into the allowed band. `undefined` means "not set" and stays
 * `undefined`, so a patch can keep a field absent instead of writing a zero; a
 * value that is not a finite number cannot be used at all and is reported as
 * unset rather than silently turned into a number.
 */
export function clampWriterParagraphIndentMm(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return clampBounded(value, WRITER_PARAGRAPH_INDENT_MIN_MM, WRITER_PARAGRAPH_INDENT_MAX_MM);
}

/** Clamps a paragraph spacing into the allowed band; see the indent clamp. */
export function clampWriterParagraphSpacingPt(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return clampBounded(value, WRITER_PARAGRAPH_SPACING_MIN_PT, WRITER_PARAGRAPH_SPACING_MAX_PT);
}

/** Rounds a line height to two decimals and clamps it into the allowed band. */
export function normalizeWriterLineHeight(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value * 100) / 100;
  return clampBounded(rounded, WRITER_LINE_HEIGHT_MIN, WRITER_LINE_HEIGHT_MAX);
}
