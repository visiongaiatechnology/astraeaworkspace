// STATUS: DIAMANT VGT SUPREME — Line-count estimation for Writer paragraphs
/**
 * How many lines a paragraph needs when it is rendered without pagination, i.e.
 * in the continuous view or in a special view. The value drives the textarea
 * `rows` attribute, so an underestimate hides text: with `overflow-hidden` a
 * paragraph sized to one line simply clips everything below the first line, and
 * those lines cannot be clicked or edited at all.
 */

export interface WriterParagraphLineCountInput {
  readonly text: string;
  /** Any heading level (the Writer supports more than three) wraps earlier. */
  readonly headingLevel?: number | undefined;
  /** Characters per line for body text. */
  readonly bodyColumnChars?: number;
  /** Characters per line for headings, which wrap earlier because they are larger. */
  readonly headingColumnChars?: number;
  /**
   * Safety cap. It must stay high enough that ordinary documents are never
   * clipped; the textarea scrolls instead of hiding content if it is ever hit.
   */
  readonly maxLines?: number;
}

export const WRITER_PARAGRAPH_BODY_COLUMN_CHARS = 105;
export const WRITER_PARAGRAPH_HEADING_COLUMN_CHARS = 70;
export const WRITER_PARAGRAPH_MAX_ESTIMATED_LINES = 40;

/**
 * Explicit line breaks plus the wrapped remainder. The estimate is deliberately
 * simple and monotone: more text never yields fewer lines.
 */
export function resolveWriterParagraphLineCount(input: WriterParagraphLineCountInput): number {
  const { text, headingLevel } = input;
  if (typeof text !== 'string' || text.length === 0) return 1;
  const defaultColumn = headingLevel
    ? WRITER_PARAGRAPH_HEADING_COLUMN_CHARS
    : WRITER_PARAGRAPH_BODY_COLUMN_CHARS;
  const requestedColumn = headingLevel
    ? (input.headingColumnChars ?? defaultColumn)
    : (input.bodyColumnChars ?? defaultColumn);
  // A non-finite column width must fall back to the default, never propagate
  // NaN into the line count and from there into the `rows` attribute.
  const perLine = Number.isFinite(requestedColumn)
    ? Math.max(1, Math.trunc(requestedColumn))
    : defaultColumn;
  const requestedMax = input.maxLines ?? WRITER_PARAGRAPH_MAX_ESTIMATED_LINES;
  const maxLines = Number.isFinite(requestedMax)
    ? Math.max(1, Math.trunc(requestedMax))
    : WRITER_PARAGRAPH_MAX_ESTIMATED_LINES;
  const explicitLines = text.split('\n').length;
  const wrappedLines = Math.floor(text.length / perLine);
  return Math.max(1, Math.min(maxLines, explicitLines + wrappedLines));
}
