// STATUS: PLATIN — WR-036: search hits are rendered where they actually are
//
// The find bar computed matches in **span** offsets, while the run projection renders
// **absolute paragraph** offsets. Shifting by the preceding spans is what puts the mark on
// the right characters — a bug here would highlight the right word in the wrong place.
import { describe, expect, it } from 'vitest';
import {
  buildWriterSearchHighlightMap,
  splitWriterRunHighlightSegments,
  EMPTY_WRITER_SEARCH_HIGHLIGHTS,
} from '../../../productivity/search/writerSearchHighlights';
import type { WriterSearchMatch } from '../../../productivity/search/writerSearchEngine';

const paragraphs = [
  { id: 'p1', spans: [{ text: 'Hallo ' }, { text: 'Astraea' }, { text: ' Welt' }] },
];

function match(overrides: Partial<WriterSearchMatch> = {}): WriterSearchMatch {
  return {
    paragraphIndex: 0,
    paragraphId: 'p1',
    spanIndex: 0,
    start: 0,
    end: 5,
    text: 'Hallo',
    ...overrides,
  };
}

describe('WR-036 — highlight map offsets', () => {
  it('returns an empty map without matches', () => {
    expect(buildWriterSearchHighlightMap(paragraphs, [], undefined)).toBe(EMPTY_WRITER_SEARCH_HIGHLIGHTS);
  });

  it('shifts a match of the second span by the length of the first', () => {
    // "Astraea" is the second span; its match starts at span offset 0.
    const map = buildWriterSearchHighlightMap(paragraphs, [match({ spanIndex: 1, start: 0, end: 7 })], undefined);
    expect(map.p1).toEqual([{ start: 6, end: 13, active: false }]);
  });

  it('marks exactly the current hit as active', () => {
    const first = match({ spanIndex: 0, start: 0, end: 5 });
    const second = match({ spanIndex: 1, start: 0, end: 7 });
    const map = buildWriterSearchHighlightMap(paragraphs, [first, second], second);
    expect(map.p1).toEqual([
      { start: 0, end: 5, active: false },
      { start: 6, end: 13, active: true },
    ]);
  });

  it('ignores a match whose span no longer exists', () => {
    const stale = match({ spanIndex: 9, start: 0, end: 2 });
    expect(buildWriterSearchHighlightMap(paragraphs, [stale], undefined)).toEqual({});
  });
});

describe('WR-036 — a run is split at the hit boundaries', () => {
  it('keeps plain text as one segment without a hit', () => {
    expect(splitWriterRunHighlightSegments('Welt', 13, [])).toEqual([{ text: 'Welt', hit: null }]);
  });

  it('splits prefix, hit and suffix', () => {
    expect(splitWriterRunHighlightSegments('Astraea', 6, [{ start: 8, end: 10, active: true }]))
      .toEqual([
        { text: 'As', hit: null },
        { text: 'tr', hit: 'current' },
        { text: 'aea', hit: null },
      ]);
  });

  it('clips a range that starts before the run', () => {
    expect(splitWriterRunHighlightSegments('Welt', 13, [{ start: 10, end: 15, active: false }]))
      .toEqual([
        { text: 'We', hit: 'match' },
        { text: 'lt', hit: null },
      ]);
  });

  it('never produces empty segments and survives overlapping ranges', () => {
    const segments = splitWriterRunHighlightSegments('abc', 0, [
      { start: 0, end: 2, active: false },
      { start: 1, end: 3, active: true },
    ]);
    expect(segments.every((segment) => segment.text.length > 0)).toBe(true);
    expect(segments.map((segment) => segment.text).join('')).toBe('abc');
  });
});
