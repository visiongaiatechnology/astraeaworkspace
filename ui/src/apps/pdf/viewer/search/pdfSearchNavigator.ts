// STATUS: DIAMANT VGT SUPREME
// Pure, bounded search-hit arithmetic for PDF Studio. No DOM, no PDF.js, no React.
//
// Why this exists: the display viewer used to run a search and then keep only "this page contains the term",
// with no hit count, no cursor and no way to step to the next finding. The acceptance scenario for text search
// is "find a term across 100 pages and scroll to the findings", which needs a cursor — and a cursor is
// arithmetic over bounded lists, so it is a pure function here instead of state inside a component.

export const PDF_SEARCH_LIMITS = Object.freeze({
  /** Characters accepted from the search box. */
  maxQueryCharacters: 256,
  /** Matches counted inside one page. Protects the counter against a pathological single page. */
  maxHitsPerPage: 5_000,
  /** Pages that may carry results in one search. */
  maxResultPages: 10_000,
  /** Total matches kept across the document. */
  maxTotalHits: 50_000,
  /** Snippet length shown per result page. */
  maxSnippetCharacters: 280,
});

export interface PdfSearchPageSource {
  pageNumber: number;
  text: string;
}

export interface PdfSearchPageResult {
  pageNumber: number;
  /** Matches on this page, at most `maxHitsPerPage`. */
  hitCount: number;
  /** Bounded excerpt around the first match, for the result list. */
  snippet: string;
}

export interface PdfSearchCursor {
  resultIndex: number;
  hitIndex: number;
}

export interface PdfSearchMatchPosition extends PdfSearchCursor {
  pageNumber: number;
  /** 1-based position of the match inside the whole document. */
  documentHitOrdinal: number;
  totalHits: number;
  totalPagesWithHits: number;
}

/** Trims and bounds a raw query. The empty string means "no search". */
export function normalizePdfSearchQuery(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\u0000/g, '').trim().slice(0, PDF_SEARCH_LIMITS.maxQueryCharacters);
}

/**
 * Counts non-overlapping occurrences of `needle` in `haystack`, case-insensitively by default.
 * Bounded: counting stops at `maxHitsPerPage` so one hostile page cannot stall the search.
 */
export function countPdfSearchHits(
  haystack: string,
  needle: string,
  options: { caseSensitive?: boolean; maxHits?: number } = {},
): number {
  const query = normalizePdfSearchQuery(needle);
  if (!query || typeof haystack !== 'string' || haystack.length === 0) return 0;
  const limit = Number.isFinite(options.maxHits) ? Math.max(0, Math.trunc(options.maxHits as number)) : PDF_SEARCH_LIMITS.maxHitsPerPage;
  if (limit === 0) return 0;
  const source = options.caseSensitive ? haystack : haystack.toLocaleLowerCase();
  const target = options.caseSensitive ? query : query.toLocaleLowerCase();
  let count = 0;
  let from = 0;
  for (;;) {
    const index = source.indexOf(target, from);
    if (index < 0) return count;
    count += 1;
    if (count >= limit) return count;
    from = index + target.length;
  }
}

/** Occurrence offsets of `needle` in `haystack`, non-overlapping and bounded. */
export function findPdfSearchHitOffsets(
  haystack: string,
  needle: string,
  options: { caseSensitive?: boolean; maxHits?: number } = {},
): number[] {
  const query = normalizePdfSearchQuery(needle);
  if (!query || typeof haystack !== 'string') return [];
  const limit = Number.isFinite(options.maxHits) ? Math.max(0, Math.trunc(options.maxHits as number)) : PDF_SEARCH_LIMITS.maxHitsPerPage;
  const source = options.caseSensitive ? haystack : haystack.toLocaleLowerCase();
  const target = options.caseSensitive ? query : query.toLocaleLowerCase();
  const offsets: number[] = [];
  let from = 0;
  while (offsets.length < limit) {
    const index = source.indexOf(target, from);
    if (index < 0) break;
    offsets.push(index);
    from = index + target.length;
  }
  return offsets;
}

/** A bounded, whitespace-collapsed excerpt of the page text, for the result list. */
function snippetAround(text: string, index: number): string {
  const normalised = text.replace(/\s+/gu, ' ').trim();
  if (!normalised) return '';
  const start = Math.max(0, Math.min(normalised.length - 1, index - 40));
  return normalised.slice(start, start + PDF_SEARCH_LIMITS.maxSnippetCharacters);
}

/**
 * Builds the bounded per-page result list. `totalHits` counts every match, `hitCount` is capped per page, so
 * `totalHits` can be lower than the real number only when a single page exceeds `maxHitsPerPage` — which the
 * caller must report, never hide.
 */
export function buildPdfSearchResults(
  pages: readonly PdfSearchPageSource[],
  query: string,
  options: { caseSensitive?: boolean } = {},
): { results: PdfSearchPageResult[]; totalHits: number; truncated: boolean } {
  const normalized = normalizePdfSearchQuery(query);
  if (!normalized) return { results: [], totalHits: 0, truncated: false };
  const results: PdfSearchPageResult[] = [];
  let totalHits = 0;
  let truncated = false;
  for (const page of pages) {
    if (!page || !Number.isInteger(page.pageNumber) || page.pageNumber < 1) continue;
    if (results.length >= PDF_SEARCH_LIMITS.maxResultPages) {
      truncated = true;
      break;
    }
    const offsets = findPdfSearchHitOffsets(page.text, normalized, options);
    if (offsets.length === 0) continue;
    totalHits += offsets.length;
    results.push({
      pageNumber: page.pageNumber,
      hitCount: offsets.length,
      snippet: snippetAround(page.text, offsets[0]),
    });
    if (totalHits >= PDF_SEARCH_LIMITS.maxTotalHits) {
      truncated = true;
      break;
    }
  }
  return { results, totalHits, truncated };
}

function flattenOrdinals(results: readonly PdfSearchPageResult[]): number[] {
  const prefix: number[] = [];
  let running = 0;
  for (const result of results) {
    prefix.push(running);
    running += result.hitCount;
  }
  return prefix;
}

/** The cursor of the very first match, or null when there is no match at all. */
export function firstPdfSearchCursor(results: readonly PdfSearchPageResult[]): PdfSearchCursor | null {
  return results.some((result) => result.hitCount > 0) ? { resultIndex: 0, hitIndex: 0 } : null;
}

/** The cursor of the very last match, or null when there is no match at all. */
export function lastPdfSearchCursor(results: readonly PdfSearchPageResult[]): PdfSearchCursor | null {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index].hitCount > 0) return { resultIndex: index, hitIndex: results[index].hitCount - 1 };
  }
  return null;
}

/** Normalizes a cursor onto a real match, clamping instead of throwing on stale indices. */
export function clampPdfSearchCursor(results: readonly PdfSearchPageResult[], cursor: PdfSearchCursor | null): PdfSearchCursor | null {
  if (!results.length) return null;
  if (!cursor) return firstPdfSearchCursor(results);
  const resultIndex = Math.min(results.length - 1, Math.max(0, Math.trunc(cursor.resultIndex)));
  const hitIndex = Math.min(results[resultIndex].hitCount - 1, Math.max(0, Math.trunc(cursor.hitIndex)));
  if (hitIndex >= 0) return { resultIndex, hitIndex };
  // The clamped page carries no match (a stale cursor after a re-search): fall back to the next one that does.
  for (let index = resultIndex; index < results.length; index += 1) {
    if (results[index].hitCount > 0) return { resultIndex: index, hitIndex: 0 };
  }
  return lastPdfSearchCursor(results);
}

/**
 * Steps one match forward (`direction` 1) or backward (`direction` -1), wrapping around the document so a
 * repeated press always reaches every finding.
 */
export function stepPdfSearchCursor(
  results: readonly PdfSearchPageResult[],
  cursor: PdfSearchCursor | null,
  direction: 1 | -1,
): PdfSearchCursor | null {
  const current = clampPdfSearchCursor(results, cursor);
  if (!current) return null;
  const total = results.reduce((sum, result) => sum + result.hitCount, 0);
  if (total <= 0) return null;
  const prefix = flattenOrdinals(results);
  let ordinal = prefix[current.resultIndex] + current.hitIndex + (direction > 0 ? 1 : -1);
  if (ordinal < 0) ordinal = total - 1;
  if (ordinal >= total) ordinal = 0;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (ordinal >= prefix[index]) return { resultIndex: index, hitIndex: ordinal - prefix[index] };
  }
  return current;
}

/** Resolves a cursor into the readable position the status line shows. */
export function describePdfSearchPosition(
  results: readonly PdfSearchPageResult[],
  cursor: PdfSearchCursor | null,
): PdfSearchMatchPosition | null {
  const clamped = clampPdfSearchCursor(results, cursor);
  if (!clamped) return null;
  const prefix = flattenOrdinals(results);
  const totalHits = results.reduce((sum, result) => sum + result.hitCount, 0);
  return {
    ...clamped,
    pageNumber: results[clamped.resultIndex].pageNumber,
    documentHitOrdinal: prefix[clamped.resultIndex] + clamped.hitIndex + 1,
    totalHits,
    totalPagesWithHits: results.length,
  };
}
