// STATUS: DIAMANT VGT SUPREME — Fragment-local text composition for paginated Writer paragraphs
/**
 * A paragraph that spans several pages is rendered as one textarea per page
 * fragment. Each textarea holds only a slice of the paragraph text, so every
 * edit has to be projected back onto the whole paragraph — otherwise typing on
 * page 2 would silently drop the text of pages 1 and 3.
 *
 * Both directions live here as pure functions: slicing the paragraph for
 * display, and folding an edited fragment back into the paragraph.
 */

function clampRange(textLength: number, start: number, end: number): { start: number; end: number } | null {
  if (!Number.isFinite(textLength) || textLength < 0) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const limit = Math.trunc(textLength);
  const lower = Math.max(0, Math.min(Math.trunc(start), limit));
  const upper = Math.max(0, Math.min(Math.trunc(end), limit));
  if (lower > upper) return null;
  return { start: lower, end: upper };
}

/**
 * Text shown in the textarea of one page fragment. An out-of-range request
 * falls back to the untrimmed text rather than showing a corrupted slice.
 */
export function sliceWriterParagraphFragmentText(
  fullText: string,
  fragmentStart: number,
  fragmentEnd: number,
): string {
  const range = clampRange(fullText.length, fragmentStart, fragmentEnd);
  if (!range) return fullText;
  return fullText.slice(range.start, range.end);
}

export interface WriterFragmentTextComposition {
  readonly fullText: string;
  readonly fragmentStart: number;
  readonly fragmentEnd: number;
  /** Current value of the fragment's textarea. */
  readonly fragmentValue: string;
}

/**
 * Folds an edited fragment back into the full paragraph text.
 *
 * The text before `fragmentStart` and after `fragmentEnd` is preserved
 * verbatim, so fragments the user did not touch survive the edit. An invalid
 * range returns the unchanged paragraph: a broken measurement must never
 * truncate a document.
 */
export function composeWriterParagraphTextFromFragment(
  input: WriterFragmentTextComposition,
): string {
  const { fullText, fragmentStart, fragmentEnd, fragmentValue } = input;
  const range = clampRange(fullText.length, fragmentStart, fragmentEnd);
  if (!range) return fullText;
  return `${fullText.slice(0, range.start)}${fragmentValue}${fullText.slice(range.end)}`;
}
