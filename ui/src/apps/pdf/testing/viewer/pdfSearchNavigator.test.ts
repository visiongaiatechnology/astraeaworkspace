// STATUS: PLATIN — the search cursor is arithmetic over a bounded list, so it is pinned without a browser.
//
// Measured before this suite, on this exact path: `viewer/display/PdfJsDisplayViewer.tsx:195-220` pushed one
// entry per matching **page** and stopped there. There was no hit count, no cursor, no next/previous step and
// no "0 matches" answer — the result panel was `searchResults.length ? … : null`, so a search that found
// nothing looked exactly like a search that had not run. The acceptance scenario ("search a term across 100
// pages and scroll through the findings") needs a cursor, and this suite pins it.
import { describe, expect, it } from 'vitest';
import {
  PDF_SEARCH_LIMITS,
  buildPdfSearchResults,
  clampPdfSearchCursor,
  countPdfSearchHits,
  describePdfSearchPosition,
  findPdfSearchHitOffsets,
  firstPdfSearchCursor,
  lastPdfSearchCursor,
  normalizePdfSearchQuery,
  stepPdfSearchCursor,
  type PdfSearchPageResult,
} from '../../viewer/search/pdfSearchNavigator';

const pages = (entries: Array<[number, string]>) => entries.map(([pageNumber, text]) => ({ pageNumber, text }));

describe('PDF search query and counting', () => {
  it('trims, strips NUL and bounds the query', () => {
    expect(normalizePdfSearchQuery('  Vertrag \u0000 ')).toBe('Vertrag');
    expect(normalizePdfSearchQuery('x'.repeat(400))).toHaveLength(PDF_SEARCH_LIMITS.maxQueryCharacters);
    expect(normalizePdfSearchQuery('   ')).toBe('');
  });

  it('counts non-overlapping occurrences, case-insensitively by default', () => {
    expect(countPdfSearchHits('aaaa', 'aa')).toBe(2);
    expect(countPdfSearchHits('Vertrag vertrag VERTRAG', 'vertrag')).toBe(3);
    expect(countPdfSearchHits('Vertrag', 'vertrag', { caseSensitive: true })).toBe(0);
    expect(countPdfSearchHits('', 'vertrag')).toBe(0);
    expect(countPdfSearchHits('vertrag', '')).toBe(0);
  });

  it('stops counting at the per-page budget instead of walking a hostile page', () => {
    const hostile = 'a'.repeat(50_000);
    expect(countPdfSearchHits(hostile, 'a', { maxHits: 10 })).toBe(10);
  });

  it('reports offsets that a highlighter can use', () => {
    expect(findPdfSearchHitOffsets('abcabc', 'abc')).toEqual([0, 3]);
  });
});

describe('PDF search result construction', () => {
  it('keeps one entry per matching page with a hit count and a bounded snippet', () => {
    const { results, totalHits, truncated } = buildPdfSearchResults(pages([
      [1, 'Vertrag und Vertrag'],
      [2, 'nichts'],
      [3, `Anhang ${'lorem '.repeat(120)}Vertrag`],
    ]), 'vertrag');

    expect(results.map((result) => result.pageNumber)).toEqual([1, 3]);
    expect(results[0].hitCount).toBe(2);
    expect(results[1].hitCount).toBe(1);
    expect(totalHits).toBe(3);
    expect(truncated).toBe(false);
    expect(results[1].snippet.length).toBeLessThanOrEqual(PDF_SEARCH_LIMITS.maxSnippetCharacters);
  });

  it('answers an empty query and a query without matches with an empty list', () => {
    expect(buildPdfSearchResults(pages([[1, 'Vertrag']]), '   ')).toEqual({ results: [], totalHits: 0, truncated: false });
    expect(buildPdfSearchResults(pages([[1, 'Vertrag']]), 'Kündigung')).toEqual({ results: [], totalHits: 0, truncated: false });
  });

  it('bounds the result page count instead of growing without limit', () => {
    const many = pages(Array.from({ length: PDF_SEARCH_LIMITS.maxResultPages + 25 }, (_, index) => [index + 1, 'treffer']));
    const { results, truncated } = buildPdfSearchResults(many, 'treffer');
    expect(results).toHaveLength(PDF_SEARCH_LIMITS.maxResultPages);
    expect(truncated).toBe(true);
  });
});

describe('PDF search cursor', () => {
  const results: PdfSearchPageResult[] = [
    { pageNumber: 2, hitCount: 2, snippet: 'a' },
    { pageNumber: 7, hitCount: 1, snippet: 'b' },
    { pageNumber: 9, hitCount: 3, snippet: 'c' },
  ];

  it('starts on the first match and can jump to the last one', () => {
    expect(firstPdfSearchCursor(results)).toEqual({ resultIndex: 0, hitIndex: 0 });
    expect(lastPdfSearchCursor(results)).toEqual({ resultIndex: 2, hitIndex: 2 });
    expect(firstPdfSearchCursor([])).toBeNull();
    expect(firstPdfSearchCursor([{ pageNumber: 1, hitCount: 0, snippet: '' }])).toBeNull();
  });

  it('walks every match in document order and wraps around', () => {
    let cursor = firstPdfSearchCursor(results);
    const visited: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      const position = describePdfSearchPosition(results, cursor);
      visited.push(`${position?.pageNumber}#${position?.hitIndex}`);
      cursor = stepPdfSearchCursor(results, cursor, 1);
    }
    expect(visited).toEqual(['2#0', '2#1', '7#0', '9#0', '9#1', '9#2']);
    expect(cursor).toEqual({ resultIndex: 0, hitIndex: 0 });
  });

  it('walks backwards and wraps to the end', () => {
    expect(stepPdfSearchCursor(results, { resultIndex: 0, hitIndex: 0 }, -1)).toEqual({ resultIndex: 2, hitIndex: 2 });
    expect(stepPdfSearchCursor(results, { resultIndex: 2, hitIndex: 0 }, -1)).toEqual({ resultIndex: 1, hitIndex: 0 });
  });

  it('clamps a stale cursor instead of throwing after a re-search', () => {
    expect(clampPdfSearchCursor(results, { resultIndex: 99, hitIndex: 99 })).toEqual({ resultIndex: 2, hitIndex: 2 });
    expect(clampPdfSearchCursor(results, { resultIndex: 0, hitIndex: -5 })).toEqual({ resultIndex: 0, hitIndex: 0 });
    expect(clampPdfSearchCursor([], { resultIndex: 0, hitIndex: 0 })).toBeNull();
    expect(stepPdfSearchCursor([], null, 1)).toBeNull();
  });

  it('reports a 1-based document ordinal for the status line', () => {
    expect(describePdfSearchPosition(results, { resultIndex: 2, hitIndex: 1 })).toEqual({
      resultIndex: 2,
      hitIndex: 1,
      pageNumber: 9,
      documentHitOrdinal: 5,
      totalHits: 6,
      totalPagesWithHits: 3,
    });
    expect(describePdfSearchPosition([], null)).toBeNull();
  });
});
