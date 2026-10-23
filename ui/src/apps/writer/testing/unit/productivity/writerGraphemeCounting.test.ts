// STATUS: DIAMANT VGT SUPREME — One definition of "one character"
//
// Paket 32 acceptance: "Während Eingabe präzise Graphem-/Wort-/Seiten-Zählung
// anzeigen." Measured on `Hallo 👨‍👩‍👧‍👦 Welt`: 12 graphemes, 18 code points, 22 UTF-16
// units. The counter must report 12 — and the layout must break lines at the same
// boundaries, or the number and the page disagree.
//
// Both the statistics module and the platform segmenter used to fall back to
// `Array.from(text)`, i.e. code points, whenever `Intl.Segmenter` was missing; and
// each had its own copy of that fallback. There is one definition now.
import { describe, expect, it } from 'vitest';
import { segmentGraphemes } from '../../../../../platform/rendering/textShaping';
import { calculateTextStatistics } from '../../../utils/writerUtils';
import type { Paragraph } from '../../../../../shared/contracts/workspace';

const style = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 8 };
const para = (text: string): Paragraph => ({ id: 'p1', style, spans: [{ text, font_size_pt: 11 }] });

/** Forces the fallback path by hiding `Intl.Segmenter` for the duration of a call. */
function withoutSegmenter<T>(run: () => T): T {
  const original = (Intl as { Segmenter?: unknown }).Segmenter;
  // `undefined` is what an old runtime looks like to the feature check.
  Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(Intl, 'Segmenter', { value: original, configurable: true, writable: true });
  }
}

describe('Writer grapheme segmentation', () => {
  it('counts the measured example as 12 graphemes, not 18 code points', () => {
    const text = 'Hallo 👨‍👩‍👧‍👦 Welt';
    expect(text.length).toBe(22);
    expect(Array.from(text).length).toBe(18);
    expect(segmentGraphemes(text)).toHaveLength(12);
  });

  it('keeps a combining sequence together', () => {
    expect(segmentGraphemes('a\u0308')).toHaveLength(1);
    expect(segmentGraphemes('a\u0308')).toEqual([{ segment: 'a\u0308', index: 0 }]);
  });

  it('keeps a regional-indicator flag together', () => {
    expect(segmentGraphemes('\u{1F1E9}\u{1F1EA}')).toHaveLength(1);
  });

  it('keeps a skin-tone modifier with its base', () => {
    expect(segmentGraphemes('\u{1F44D}\u{1F3FD}')).toHaveLength(1);
  });

  it('keeps a variation selector with its base', () => {
    expect(segmentGraphemes('\u2764\uFE0F')).toHaveLength(1);
  });

  it('reports indices in UTF-16 units so callers can slice', () => {
    const segments = segmentGraphemes('a👨‍👩‍👧‍👦b');
    expect(segments.map((entry) => entry.index)).toEqual([0, 1, 12]);
    expect(segments.map((entry) => entry.segment).join('')).toBe('a👨‍👩‍👧‍👦b');
  });

  it('survives a locale tag the runtime rejects', () => {
    // `new Intl.Segmenter('nicht-gueltig!!')` throws RangeError; it must not escape
    // into a render path.
    expect(() => segmentGraphemes('Hallo', 'nicht-gueltig!!')).not.toThrow();
    expect(segmentGraphemes('Hallo', 'nicht-gueltig!!')).toHaveLength(5);
  });

  it('returns the same count without Intl.Segmenter', () => {
    const text = 'Hallo 👨‍👩‍👧‍👦 Welt';
    expect(withoutSegmenter(() => segmentGraphemes(text))).toHaveLength(12);
  });

  it('counts the same graphemes with and without the runtime API', () => {
    const samples = ['a\u0308', '\u{1F1E9}\u{1F1EA}', '\u{1F44D}\u{1F3FD}', 'Hallo Welt', ''];
    for (const sample of samples) {
      const withApi = segmentGraphemes(sample).length;
      const withoutApi = withoutSegmenter(() => segmentGraphemes(sample).length);
      expect(withoutApi, sample).toBe(withApi);
    }
  });

  it('rejects text beyond the render limit instead of hanging', () => {
    const tooLong = 'a'.repeat(1_000_001);
    expect(() => segmentGraphemes(tooLong)).toThrow(/render_text_limit/u);
  });
});

describe('Writer statistics use that one definition', () => {
  it('reports graphemes for the measured example', () => {
    const stats = calculateTextStatistics([para('Hallo 👨‍👩‍👧‍👦 Welt')]);
    expect(stats.charsWithSpaces).toBe(12);
    expect(stats.charsWithoutSpaces).toBe(10);
    expect(stats.words).toBe(2);
  });

  it('does not fall back to code points when the runtime API is missing', () => {
    const text = 'Hallo 👨‍👩‍👧‍👦 Welt';
    const stats = withoutSegmenter(() => calculateTextStatistics([para(text)]));
    expect(stats.charsWithSpaces).toBe(12);
    expect(stats.charsWithoutSpaces).toBe(10);
  });

  it('still counts words and sentences without the runtime API', () => {
    const stats = withoutSegmenter(() => calculateTextStatistics([para('Ein Satz. Noch einer!')]));
    expect(stats.words).toBe(4);
    expect(stats.sentences).toBe(2);
  });

  it('does not throw for a locale the runtime rejects', () => {
    const stats = calculateTextStatistics([para('Hallo Welt')], { locale: 'nicht-gueltig!!' });
    expect(stats.words).toBe(2);
    expect(stats.charsWithSpaces).toBe(10);
  });

  it('keeps pages from the pagination and never reports zero', () => {
    expect(calculateTextStatistics([], { pageCount: 0 }).pages).toBe(1);
    expect(calculateTextStatistics([], { pageCount: 7 }).pages).toBe(7);
  });
});
