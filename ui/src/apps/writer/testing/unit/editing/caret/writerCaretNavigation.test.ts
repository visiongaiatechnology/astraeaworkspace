// STATUS: PLATIN — Writer keyboard navigation contracts (cross-paragraph caret movement)
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import { resolveWriterKeyboardNavigation } from '../../../../editing/caret/writerCaretNavigation';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };

function paragraph(id: string, text: string): Paragraph {
  return { id, style: { ...STYLE }, spans: [{ text }] };
}

const DOC = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta gamma'), paragraph('p3', 'Delta')];

const base = {
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  paragraphs: DOC,
  paragraphIndex: 1,
  caretOffset: 5,
  fragmentStart: 0,
  fragmentEnd: 10,
  isFirstFragment: true,
  isLastFragment: true,
};

describe('Writer keyboard navigation', () => {
  describe('document borders', () => {
    it('jumps to the document start and end with Ctrl+Home and Ctrl+End', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'Home', ctrlKey: true }))
        .toEqual({ target: { paragraphId: 'p1', offset: 0 }, extendSelection: false });
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'End', ctrlKey: true }))
        .toEqual({ target: { paragraphId: 'p3', offset: 5 }, extendSelection: false });
    });

    it('supports the meta modifier for the same commands', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'Home', metaKey: true })?.target.paragraphId).toBe('p1');
    });

    it('keeps the anchor when Shift is held', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'End', ctrlKey: true, shiftKey: true }))
        .toEqual({ target: { paragraphId: 'p3', offset: 5 }, extendSelection: true });
    });

    it('moves inside the current paragraph with Ctrl+ArrowUp and Ctrl+ArrowDown', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowUp', ctrlKey: true }))
        .toEqual({ target: { paragraphId: 'p2', offset: 0 }, extendSelection: false });
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowDown', ctrlKey: true }))
        .toEqual({ target: { paragraphId: 'p2', offset: 10 }, extendSelection: false });
    });
  });

  describe('crossing paragraph borders', () => {
    it('leaves the native behaviour alone in the middle of a paragraph', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowRight' })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowLeft' })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'Home' })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'End' })).toBeNull();
    });

    it('moves into the next paragraph from the end of the text', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowRight', caretOffset: 10 }))
        .toEqual({ target: { paragraphId: 'p3', offset: 0 }, extendSelection: false });
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowDown', caretOffset: 10 }))
        .toEqual({ target: { paragraphId: 'p3', offset: 0 }, extendSelection: false });
    });

    it('moves into the previous paragraph from the start of the text', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowLeft', caretOffset: 0 }))
        .toEqual({ target: { paragraphId: 'p1', offset: 5 }, extendSelection: false });
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowUp', caretOffset: 0 }))
        .toEqual({ target: { paragraphId: 'p1', offset: 5 }, extendSelection: false });
    });

    it('extends the range instead of moving when Shift is held', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowRight', caretOffset: 10, shiftKey: true }))
        .toEqual({ target: { paragraphId: 'p3', offset: 0 }, extendSelection: true });
    });

    it('walks into the next page fragment before leaving the paragraph', () => {
      expect(resolveWriterKeyboardNavigation({
        ...base,
        key: 'ArrowRight',
        caretOffset: 10,
        isLastFragment: false,
      })).toEqual({ target: { paragraphId: 'p2', offset: 10 }, extendSelection: false });
      expect(resolveWriterKeyboardNavigation({
        ...base,
        key: 'ArrowLeft',
        caretOffset: 0,
        isFirstFragment: false,
        fragmentStart: 40,
        fragmentEnd: 60,
      })).toEqual({ target: { paragraphId: 'p2', offset: 39 }, extendSelection: false });
    });

    it('does nothing at the very first and very last position', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowLeft', caretOffset: 0, paragraphIndex: 0 })).toBeNull();
      expect(resolveWriterKeyboardNavigation({
        ...base, key: 'ArrowRight', caretOffset: 10, paragraphIndex: DOC.length - 1,
      })).toBeNull();
    });
  });

  describe('page borders', () => {
    const pageBoundary = { firstParagraphId: 'p2', lastParagraphId: 'p3' };

    it('moves the caret to the page start and end', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'PageUp', pageBoundary }))
        .toEqual({ target: { paragraphId: 'p2', offset: 0 }, extendSelection: false });
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'PageDown', pageBoundary, paragraphIndex: 0 }))
        .toEqual({ target: { paragraphId: 'p3', offset: 5 }, extendSelection: false });
    });

    it('stays put when the caret is already at the page border', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'PageUp', pageBoundary, caretOffset: 0 })).toBeNull();
      expect(resolveWriterKeyboardNavigation({
        ...base, key: 'PageDown', pageBoundary, paragraphIndex: 2, caretOffset: 5,
      })).toBeNull();
    });

    it('ignores page navigation without a known page boundary', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'PageUp' })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'PageDown' })).toBeNull();
    });
  });

  describe('keys that must stay native', () => {
    it('leaves modifier combinations alone', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowLeft', ctrlKey: true })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowRight', altKey: true })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowLeft', metaKey: true })).toBeNull();
    });

    it('leaves unrelated keys alone', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'Tab' })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'Backspace' })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'a' })).toBeNull();
    });

    it('refuses an unknown paragraph index', () => {
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowRight', caretOffset: 10, paragraphIndex: 99 })).toBeNull();
      expect(resolveWriterKeyboardNavigation({ ...base, key: 'ArrowRight', caretOffset: 10, paragraphIndex: -1 })).toBeNull();
    });
  });
});
