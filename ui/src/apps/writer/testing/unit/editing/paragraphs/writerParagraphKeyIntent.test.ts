// STATUS: PLATIN — Writer keyboard intent contracts (Enter / Backspace structural edits)
import { describe, expect, it } from 'vitest';
import {
  resolveWriterBackspaceIntent,
  resolveWriterEnterIntent,
} from '../../../../editing/paragraphs/writerParagraphKeyIntent';

const backspaceDefaults = {
  shiftKey: false,
  paragraphIndex: 3,
  fragmentIsFirst: true,
  selectionStart: 0,
  selectionEnd: 0,
};

const enterDefaults = {
  shiftKey: false,
  isLastFragment: true,
  isEmptyListParagraph: false,
  selectionStart: 4,
  selectionEnd: 4,
  valueLength: 10,
};

describe('Writer keyboard intent', () => {
  describe('Backspace', () => {
    it('merges backwards only at the very start of a paragraph with a predecessor', () => {
      expect(resolveWriterBackspaceIntent(backspaceDefaults)).toBe('merge-backward');
    });

    it('keeps the native deletion inside the text', () => {
      expect(resolveWriterBackspaceIntent({ ...backspaceDefaults, selectionStart: 1, selectionEnd: 1 })).toBe('default');
      expect(resolveWriterBackspaceIntent({ ...backspaceDefaults, selectionStart: 0, selectionEnd: 3 })).toBe('default');
    });

    it('never merges the first paragraph, because it has no predecessor', () => {
      expect(resolveWriterBackspaceIntent({ ...backspaceDefaults, paragraphIndex: 0 })).toBe('default');
      expect(resolveWriterBackspaceIntent({ ...backspaceDefaults, paragraphIndex: -1 })).toBe('default');
      expect(resolveWriterBackspaceIntent({ ...backspaceDefaults, paragraphIndex: 1.5 })).toBe('default');
    });

    it('keeps the native deletion in a continuation fragment of a page-split paragraph', () => {
      expect(resolveWriterBackspaceIntent({ ...backspaceDefaults, fragmentIsFirst: false })).toBe('default');
    });

    it('leaves the shift-modified keystroke alone', () => {
      expect(resolveWriterBackspaceIntent({ ...backspaceDefaults, shiftKey: true })).toBe('default');
    });
  });

  describe('Enter', () => {
    it('appends an empty paragraph when the caret sits at the end of the text', () => {
      expect(resolveWriterEnterIntent({ ...enterDefaults, selectionStart: 10, selectionEnd: 10 })).toBe('append-paragraph');
      expect(resolveWriterEnterIntent({ ...enterDefaults, selectionStart: 99, selectionEnd: 99 })).toBe('append-paragraph');
    });

    it('splits the paragraph when the caret sits inside the text', () => {
      expect(resolveWriterEnterIntent(enterDefaults)).toBe('split-paragraph');
      expect(resolveWriterEnterIntent({ ...enterDefaults, selectionStart: 0, selectionEnd: 0 })).toBe('split-paragraph');
    });

    it('never splits a non-collapsed selection, which would discard the selected text', () => {
      expect(resolveWriterEnterIntent({ ...enterDefaults, selectionStart: 1, selectionEnd: 6 })).toBe('default');
      expect(resolveWriterEnterIntent({ ...enterDefaults, selectionStart: 2, selectionEnd: 10 })).toBe('default');
    });

    it('leaves the list when Enter is pressed in an empty list item', () => {
      expect(resolveWriterEnterIntent({ ...enterDefaults, isEmptyListParagraph: true })).toBe('exit-list');
    });

    it('keeps the native soft line break for shift-enter and continuation fragments', () => {
      expect(resolveWriterEnterIntent({ ...enterDefaults, shiftKey: true })).toBe('default');
      expect(resolveWriterEnterIntent({ ...enterDefaults, isLastFragment: false })).toBe('default');
    });
  });
});
