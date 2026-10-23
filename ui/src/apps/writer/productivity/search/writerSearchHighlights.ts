// STATUS: PLATIN — Visible search hits inside the rich-text surface (WR-036)
//
// The find bar knew all matches, but the document did not show them: navigating only
// scrolled to the paragraph. These maps are the bridge between the search result and the
// run projection — the surface renders every hit as a `<mark>` and the current hit stronger
// than the rest, without touching the model or the DOM offset mapping.
import type { WriterSearchMatch } from './writerSearchEngine';

/** One highlighted range in **absolute paragraph text offsets**. */
export interface WriterSearchHighlightRange {
  readonly start: number;
  readonly end: number;
  /** The hit the find bar is currently on (stronger colour). */
  readonly active: boolean;
}

/** Paragraph id → highlighted ranges of that paragraph. */
export type WriterSearchHighlightMap = Readonly<Record<string, readonly WriterSearchHighlightRange[]>>;

export const EMPTY_WRITER_SEARCH_HIGHLIGHTS: WriterSearchHighlightMap = Object.freeze({});

/**
 * Builds the map for rendering.
 *
 * `match.start`/`match.end` are offsets **inside the matched span**, not inside the
 * paragraph, so every match is shifted by the lengths of the preceding spans. Without that
 * shift a hit in the second run of a paragraph would be marked at the wrong characters.
 */
export function buildWriterSearchHighlightMap(
  paragraphs: readonly { readonly id: string; readonly spans: readonly { readonly text: string }[] }[],
  matches: readonly WriterSearchMatch[],
  activeMatch: WriterSearchMatch | undefined,
): WriterSearchHighlightMap {
  if (matches.length === 0) return EMPTY_WRITER_SEARCH_HIGHLIGHTS;
  const spanOffsets = new Map<string, number[]>();
  for (const paragraph of paragraphs) {
    const offsets: number[] = [];
    let cursor = 0;
    for (const span of paragraph.spans) {
      offsets.push(cursor);
      cursor += span.text.length;
    }
    spanOffsets.set(paragraph.id, offsets);
  }

  const byParagraph = new Map<string, WriterSearchHighlightRange[]>();
  for (const match of matches) {
    const base = spanOffsets.get(match.paragraphId)?.[match.spanIndex];
    if (base === undefined) continue;
    const start = base + match.start;
    const end = base + match.end;
    if (end <= start) continue;
    const list = byParagraph.get(match.paragraphId) ?? [];
    list.push({
      start,
      end,
      active: activeMatch !== undefined
        && activeMatch.paragraphId === match.paragraphId
        && activeMatch.spanIndex === match.spanIndex
        && activeMatch.start === match.start
        && activeMatch.end === match.end,
    });
    byParagraph.set(match.paragraphId, list);
  }

  const result: Record<string, readonly WriterSearchHighlightRange[]> = {};
  for (const [paragraphId, ranges] of byParagraph) {
    result[paragraphId] = ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  }
  return result;
}

/** Splits one run's text at the highlight boundaries, so hits can be marked inline. */
export function splitWriterRunHighlightSegments(
  text: string,
  absoluteStart: number,
  highlights: readonly WriterSearchHighlightRange[],
): Array<{ readonly text: string; readonly hit: 'match' | 'current' | null }> {
  if (text.length === 0) return [];
  const absoluteEnd = absoluteStart + text.length;
  const overlapping = highlights
    .filter((range) => range.end > absoluteStart && range.start < absoluteEnd)
    .map((range) => ({
      from: Math.max(range.start, absoluteStart),
      to: Math.min(range.end, absoluteEnd),
      hit: range.active ? 'current' as const : 'match' as const,
    }))
    .sort((left, right) => left.from - right.from || left.to - right.to);
  if (overlapping.length === 0) return [{ text, hit: null }];

  const segments: Array<{ text: string; hit: 'match' | 'current' | null }> = [];
  let cursor = absoluteStart;
  for (const range of overlapping) {
    if (range.to <= cursor) continue;
    if (range.from > cursor) {
      segments.push({ text: text.slice(cursor - absoluteStart, range.from - absoluteStart), hit: null });
    }
    const from = Math.max(range.from, cursor);
    segments.push({ text: text.slice(from - absoluteStart, range.to - absoluteStart), hit: range.hit });
    cursor = range.to;
  }
  if (cursor < absoluteEnd) segments.push({ text: text.slice(cursor - absoluteStart), hit: null });
  return segments.filter((segment) => segment.text.length > 0);
}
