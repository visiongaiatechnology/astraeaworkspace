// STATUS: PLATIN — Paginated fragment text composition (no text loss across page breaks)
import { describe, expect, it } from 'vitest';
import {
  composeWriterParagraphTextFromFragment,
  sliceWriterParagraphFragmentText,
} from '../../../../editing/paragraphs/writerParagraphFragmentText';

const FULL = 'Erster Teil. Zweiter Teil. Dritter Teil.';

describe('Writer paginated fragment text', () => {
  describe('slicing a fragment for display', () => {
    it('returns the requested slice', () => {
      expect(sliceWriterParagraphFragmentText(FULL, 0, 13)).toBe('Erster Teil. ');
      expect(sliceWriterParagraphFragmentText(FULL, 13, 26)).toBe('Zweiter Teil.');
    });

    it('clamps out-of-range requests instead of returning a broken slice', () => {
      expect(sliceWriterParagraphFragmentText(FULL, -5, 5)).toBe('Erste');
      expect(sliceWriterParagraphFragmentText(FULL, 10, 9999)).toBe(FULL.slice(10));
      expect(sliceWriterParagraphFragmentText(FULL, 9999, 10000)).toBe('');
    });

    it('falls back to the whole text for an inverted or non-finite range', () => {
      expect(sliceWriterParagraphFragmentText(FULL, 20, 5)).toBe(FULL);
      expect(sliceWriterParagraphFragmentText(FULL, Number.NaN, 5)).toBe(FULL);
      expect(sliceWriterParagraphFragmentText(FULL, 0, Number.POSITIVE_INFINITY)).toBe(FULL);
    });
  });

  describe('folding an edited fragment back into the paragraph', () => {
    it('keeps the untouched head and tail verbatim', () => {
      const composed = composeWriterParagraphTextFromFragment({
        fullText: FULL,
        fragmentStart: 13,
        fragmentEnd: 26,
        fragmentValue: 'Zweiter Teil geändert.',
      });
      expect(composed).toBe('Erster Teil. Zweiter Teil geändert. Dritter Teil.');
      expect(composed.startsWith(FULL.slice(0, 13))).toBe(true);
      expect(composed.endsWith(FULL.slice(26))).toBe(true);
    });

    it('inserts a character without dropping the following fragments', () => {
      const composed = composeWriterParagraphTextFromFragment({
        fullText: FULL,
        fragmentStart: 0,
        fragmentEnd: 13,
        fragmentValue: 'Erster Teil. X',
      });
      expect(composed).toBe('Erster Teil. XZweiter Teil. Dritter Teil.');
    });

    it('deletes a character without dropping the following fragments', () => {
      const composed = composeWriterParagraphTextFromFragment({
        fullText: FULL,
        fragmentStart: 0,
        fragmentEnd: 13,
        fragmentValue: 'Erster Teil',
      });
      expect(composed).toBe('Erster TeilZweiter Teil. Dritter Teil.');
    });

    it('is the identity operation for an unsplit paragraph', () => {
      const composed = composeWriterParagraphTextFromFragment({
        fullText: FULL,
        fragmentStart: 0,
        fragmentEnd: FULL.length,
        fragmentValue: 'Völlig anderer Text',
      });
      expect(composed).toBe('Völlig anderer Text');
    });

    it('is the identity operation for an empty paragraph', () => {
      expect(composeWriterParagraphTextFromFragment({
        fullText: '',
        fragmentStart: 0,
        fragmentEnd: 0,
        fragmentValue: 'Erste Eingabe',
      })).toBe('Erste Eingabe');
    });

    it('returns the unchanged paragraph for an invalid range instead of truncating it', () => {
      expect(composeWriterParagraphTextFromFragment({
        fullText: FULL,
        fragmentStart: 30,
        fragmentEnd: 10,
        fragmentValue: 'x',
      })).toBe(FULL);
      expect(composeWriterParagraphTextFromFragment({
        fullText: FULL,
        fragmentStart: Number.NaN,
        fragmentEnd: 10,
        fragmentValue: 'x',
      })).toBe(FULL);
      expect(composeWriterParagraphTextFromFragment({
        fullText: FULL,
        fragmentStart: -100,
        fragmentEnd: -50,
        fragmentValue: '',
      })).toBe(FULL);
    });

    it('round-trips a slice that was not edited', () => {
      for (const [start, end] of [[0, 13], [13, 26], [27, FULL.length]] as const) {
        const shown = sliceWriterParagraphFragmentText(FULL, start, end);
        const composed = composeWriterParagraphTextFromFragment({
          fullText: FULL,
          fragmentStart: start,
          fragmentEnd: end,
          fragmentValue: shown,
        });
        expect(composed).toBe(FULL);
      }
    });
  });
});
