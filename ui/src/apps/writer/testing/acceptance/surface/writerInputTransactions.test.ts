// STATUS: PLATIN — Model transactions of the rich-text surface (pure)
//
// ASTRAEA WRITER 50 V2 · M1 (WR-002/WR-015). These tests cover the half of the
// surface that needs no DOM at all: what a browser event *means* in model terms.
// The DOM half is exercised with real events in `writerRichTextSurface.test.tsx`.
import { describe, expect, it } from 'vitest';
import {
  applyWriterSurfaceTextPatch,
  isWriterSurfaceCompositionInputType,
  reconcileWriterSurfaceInput,
  resolveWriterSurfaceInputIntent,
  resolveWriterSurfaceKeyIntent,
  resolveWriterSurfacePatchCaret,
  resolveWriterSurfaceTextPatch,
} from '../../../editor/surface/writerInputTransactions';

describe('resolveWriterSurfaceTextPatch — what the browser actually changed', () => {
  it('reduces an insertion to one replace at the caret', () => {
    expect(resolveWriterSurfaceTextPatch('Hallo Astraea', 'Hallo Astraea!')).toEqual({
      start: 13,
      end: 13,
      insertedText: '!',
    });
  });

  it('keeps the common prefix and suffix, so untouched runs stay untouched', () => {
    // Typing inside the middle of a sentence must not rewrite the whole line.
    expect(resolveWriterSurfaceTextPatch('Hallo Welt', 'Hallo schöne Welt')).toEqual({
      start: 6,
      end: 6,
      insertedText: 'schöne ',
    });
  });

  it('reduces a backspace to a deletion of exactly one character', () => {
    expect(resolveWriterSurfaceTextPatch('Hallo Welt', 'Hallo Wel')).toEqual({
      start: 9,
      end: 10,
      insertedText: '',
    });
  });

  it('reduces replacing a marked range to one replace', () => {
    expect(resolveWriterSurfaceTextPatch('Hallo Welt', 'Hallo Astraea')).toEqual({
      start: 6,
      end: 10,
      insertedText: 'Astraea',
    });
  });

  it('returns null when nothing changed — no empty history entry may be created', () => {
    expect(resolveWriterSurfaceTextPatch('gleich', 'gleich')).toBeNull();
  });

  it('handles an emptied paragraph without losing the position', () => {
    expect(resolveWriterSurfaceTextPatch('abc', '')).toEqual({ start: 0, end: 3, insertedText: '' });
  });

  it('round-trips: applying the patch reproduces the observed text', () => {
    const cases: [string, string][] = [
      ['', 'Hallo'],
      ['Hallo', ''],
      ['Hallo Welt', 'Hallo Astraea'],
      ['aXbXc', 'aXc'],
      ['Ärger', 'Ärger mit Ümlauten'],
      ['Привет', 'Привет мир'],
      ['你好', '你好世界'],
      ['🙂', '🙂🙂'],
    ];
    for (const [before, after] of cases) {
      const patch = resolveWriterSurfaceTextPatch(before, after);
      expect(patch, `${before} → ${after}`).not.toBeNull();
      expect(applyWriterSurfaceTextPatch(before, patch!)).toBe(after);
    }
  });

  it('reports the caret as the end of the inserted text', () => {
    const patch = resolveWriterSurfaceTextPatch('Hallo', 'Hallo Welt')!;
    expect(resolveWriterSurfacePatchCaret(patch)).toBe(10);
  });
});

describe('resolveWriterSurfaceKeyIntent — which keys the surface owns', () => {
  /**
   * ASTRAEA WRITER 50 V2 · M1-Nachbesserung.
   *
   * The surface no longer lets the browser edit the paragraph DOM at all. The
   * earlier version deferred `Backspace`/`Delete`/intra-paragraph replacements to
   * the browser, which deleted and merged the managed `<span>`s behind React's
   * back — the source of the "every character appears twice" defect in the Windows
   * probe. Every editing key now resolves to a model transaction.
   */
  const base = {
    key: 'a',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    paragraphIndex: 0,
    offset: 3,
    paragraphText: 'Hallo Welt',
    hasSelection: false,
    spansParagraphs: false,
    hasPreviousParagraph: false,
    hasNextParagraph: false,
  };

  it('turns a printed character at a collapsed caret into a model insertion', () => {
    // The `keydown` is the primary path: `preventDefault()` there suppresses the
    // browser's own insertion entirely, so exactly one character arrives. The
    // `beforeinput` mapping below stays as the fallback for AltGr, dead keys and
    // input methods that produce text without a key event.
    expect(resolveWriterSurfaceKeyIntent(base)).toEqual({
      kind: 'insert-text',
      paragraphIndex: 0,
      offset: 3,
      text: 'a',
    });
  });

  it('keeps modified and non-printing keys away from the text path', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'F5' })).toBeNull();
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Dead' })).toBeNull();
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'a', altKey: true })).toBeNull();
    // Ctrl/Cmd+A is a command, not a character (WR-017).
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'a', ctrlKey: true })).toEqual({ kind: 'select-all' });
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'A', metaKey: true })).toEqual({ kind: 'select-all' });
  });

  it('steps the caret in the model instead of leaving it to the browser (WR-017)', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'ArrowLeft' }))
      .toEqual({ kind: 'caret-step', step: 'char-backward', paragraphIndex: 0, offset: 3, extend: false });
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'ArrowRight', shiftKey: true }))
      .toEqual({ kind: 'caret-step', step: 'char-forward', paragraphIndex: 0, offset: 3, extend: true });
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'ArrowLeft', ctrlKey: true }))
      .toEqual({ kind: 'caret-step', step: 'word-backward', paragraphIndex: 0, offset: 3, extend: false });
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'ArrowRight', metaKey: true, shiftKey: true }))
      .toEqual({ kind: 'caret-step', step: 'word-forward', paragraphIndex: 0, offset: 3, extend: true });
    // Up/Down address the *visual* line; they stay with the browser.
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'ArrowUp' })).toBeNull();
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'ArrowDown' })).toBeNull();
  });

  it('moves to the document edges on Ctrl+Home / Ctrl+End (WR-017)', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Home', ctrlKey: true }))
      .toEqual({ kind: 'move-caret', to: 'document-start', extend: false });
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'End', ctrlKey: true }))
      .toEqual({ kind: 'move-caret', to: 'document-end', extend: false });
    // Shift extends the selection from the anchor to the document edge.
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'End', ctrlKey: true, shiftKey: true }))
      .toEqual({ kind: 'move-caret', to: 'document-end', extend: true });
    // Plain Home/End address the paragraph (the model knows no visual line).
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Home' }))
      .toEqual({ kind: 'caret-step', step: 'paragraph-start', paragraphIndex: 0, offset: 3, extend: false });
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'End', shiftKey: true }))
      .toEqual({ kind: 'caret-step', step: 'paragraph-end', paragraphIndex: 0, offset: 3, extend: true });
  });

  it('accepts a character outside the BMP as text', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: '🙂' })).toEqual({
      kind: 'insert-text',
      paragraphIndex: 0,
      offset: 3,
      text: '🙂',
    });
  });

  it('deletes exactly one character on Backspace instead of handing it to the browser', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Backspace' })).toEqual({
      kind: 'delete-backward',
      paragraphIndex: 0,
      offset: 3,
      length: 1,
    });
  });

  it('deletes a whole word on Ctrl+Backspace', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Backspace', ctrlKey: true })).toEqual({
      kind: 'delete-backward',
      paragraphIndex: 0,
      offset: 3,
      length: 3,
    });
  });

  it('deletes exactly one character on Delete (Entf)', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Delete' })).toEqual({
      kind: 'delete-forward',
      paragraphIndex: 0,
      offset: 3,
      length: 1,
    });
  });

  it('merges forward on Delete at the very end of a paragraph', () => {
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'Delete',
      offset: 10,
      hasNextParagraph: true,
    })).toEqual({ kind: 'merge-forward', paragraphIndex: 0 });
  });

  it('does not merge forward when there is no following paragraph', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Delete', offset: 10 })).toBeNull();
  });

  it('splits the paragraph on Enter at the caret', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Enter' })).toEqual({
      kind: 'split-paragraph',
      paragraphIndex: 0,
      offset: 3,
    });
  });

  it('inserts a manual line break on Shift+Enter instead of a new paragraph', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Enter', shiftKey: true })).toEqual({
      kind: 'insert-line-break',
      paragraphIndex: 0,
      offset: 3,
    });
  });

  it('merges backwards on Backspace at the very first offset', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Backspace', offset: 0, hasPreviousParagraph: true }))
      .toEqual({ kind: 'merge-backward', paragraphIndex: 0 });
  });

  it('does not merge when there is no previous paragraph', () => {
    // WR-027: at the very start the model still decides — the paragraph may carry a
    // manual page/column break that Backspace removes.
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Backspace', offset: 0 }))
      .toEqual({ kind: 'merge-backward', paragraphIndex: 0 });
  });

  it('inserts a real tab on Tab', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Tab' })).toEqual({
      kind: 'insert-tab',
      paragraphIndex: 0,
      offset: 3,
    });
  });

  it('keeps Shift+Tab for leaving the document', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Tab', shiftKey: true })).toBeNull();
  });

  it('ends the list on Enter in an **empty** list item (WR-011)', () => {
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'Enter',
      paragraphText: '',
      offset: 0,
      isListParagraph: true,
    })).toEqual({ kind: 'exit-list', paragraphIndex: 0 });
  });

  it('keeps splitting a list item that already carries text', () => {
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'Enter',
      isListParagraph: true,
    })).toEqual({ kind: 'split-paragraph', paragraphIndex: 0, offset: 3 });
  });

  it('keeps Shift+Enter as a line break even inside a list item', () => {
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'Enter',
      shiftKey: true,
      paragraphText: '',
      offset: 0,
      isListParagraph: true,
    })).toEqual({ kind: 'insert-line-break', paragraphIndex: 0, offset: 0 });
  });

  it('replaces a selection **inside one paragraph** as one transaction', () => {
    // This is the case the browser used to "solve" by tearing the spans apart.
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'Backspace',
      hasSelection: true,
    })).toEqual({ kind: 'replace-selection', replacement: '' });
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'Delete',
      hasSelection: true,
    })).toEqual({ kind: 'replace-selection', replacement: '' });
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'x',
      hasSelection: true,
    })).toEqual({ kind: 'replace-selection', replacement: 'x' });
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'Enter',
      hasSelection: true,
    })).toEqual({ kind: 'replace-selection', replacement: '\n' });
  });

  it('replaces a selection that spans paragraphs with the same transaction', () => {
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'Backspace',
      hasSelection: true,
      spansParagraphs: true,
    })).toEqual({ kind: 'replace-selection', replacement: '' });
    expect(resolveWriterSurfaceKeyIntent({
      ...base,
      key: 'x',
      hasSelection: true,
      spansParagraphs: true,
    })).toEqual({ kind: 'replace-selection', replacement: 'x' });
  });

  it('never intercepts a modified key', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Enter', [modifier]: true })).toBeNull();
    }
  });

  it('ignores everything when the caret is not inside a paragraph', () => {
    expect(resolveWriterSurfaceKeyIntent({ ...base, key: 'Enter', paragraphIndex: -1 })).toBeNull();
  });
});

describe('resolveWriterSurfaceInputIntent — what `beforeinput` is allowed to do', () => {
  const base = {
    inputType: 'insertText',
    data: 'W',
    paragraphIndex: 0,
    offset: 0,
    paragraphText: '',
    hasSelection: false,
    spansParagraphs: false,
    hasPreviousParagraph: false,
    hasNextParagraph: false,
  };

  it('turns the first character of an empty paragraph into a model insertion', () => {
    expect(resolveWriterSurfaceInputIntent(base)).toEqual({
      kind: 'insert-text',
      paragraphIndex: 0,
      offset: 0,
      text: 'W',
    });
  });

  it('turns a replacement of a marked range into one transaction', () => {
    expect(resolveWriterSurfaceInputIntent({ ...base, data: 'Astraea', hasSelection: true }))
      .toEqual({ kind: 'replace-selection', replacement: 'Astraea' });
  });

  it('maps the deletion input types', () => {
    expect(resolveWriterSurfaceInputIntent({
      ...base,
      inputType: 'deleteContentBackward',
      data: null,
      offset: 2,
      paragraphText: 'Hallo',
    })).toEqual({ kind: 'delete-backward', paragraphIndex: 0, offset: 2, length: 1 });
    expect(resolveWriterSurfaceInputIntent({
      ...base,
      inputType: 'deleteContentForward',
      data: null,
      offset: 2,
      paragraphText: 'Hallo',
    })).toEqual({ kind: 'delete-forward', paragraphIndex: 0, offset: 2, length: 1 });
    // Caret at offset 5 of "Hallo Welt" sits right after "Hallo": the whole word
    // is the deletion target, so the length is 5 — not 3.
    expect(resolveWriterSurfaceInputIntent({
      ...base,
      inputType: 'deleteWordBackward',
      data: null,
      offset: 5,
      paragraphText: 'Hallo Welt',
    })).toEqual({ kind: 'delete-backward', paragraphIndex: 0, offset: 5, length: 5 });
  });

  it('merges at a paragraph boundary from a deletion input type as well', () => {
    expect(resolveWriterSurfaceInputIntent({
      ...base,
      inputType: 'deleteContentForward',
      data: null,
      offset: 5,
      paragraphText: 'Hallo',
      hasNextParagraph: true,
    })).toEqual({ kind: 'merge-forward', paragraphIndex: 0 });
    expect(resolveWriterSurfaceInputIntent({
      ...base,
      inputType: 'deleteContentBackward',
      data: null,
      offset: 0,
      paragraphText: 'Hallo',
      hasPreviousParagraph: true,
    })).toEqual({ kind: 'merge-backward', paragraphIndex: 0 });
  });

  it('maps the structural input types', () => {
    expect(resolveWriterSurfaceInputIntent({ ...base, inputType: 'insertParagraph', data: null, offset: 5, paragraphText: 'Hallo Welt' }))
      .toEqual({ kind: 'split-paragraph', paragraphIndex: 0, offset: 5 });
    expect(resolveWriterSurfaceInputIntent({ ...base, inputType: 'insertLineBreak', data: null, offset: 5, paragraphText: 'Hallo Welt' }))
      .toEqual({ kind: 'insert-line-break', paragraphIndex: 0, offset: 5 });
    expect(resolveWriterSurfaceInputIntent({ ...base, inputType: 'insertTab', data: null, offset: 5, paragraphText: 'Hallo Welt' }))
      .toEqual({ kind: 'insert-tab', paragraphIndex: 0, offset: 5 });
  });

  it('refuses the browser-owned types — they must not change the DOM', () => {
    for (const inputType of [
      'historyUndo',
      'historyRedo',
      'formatBold',
      'formatItalic',
      'formatUnderline',
      'insertFromPaste',
      'insertFromDrop',
      'somethingUnknown',
    ]) {
      expect(resolveWriterSurfaceInputIntent({ ...base, inputType, data: null }), inputType).toBeNull();
    }
  });

  it('marks the composition input types as IME-owned', () => {
    for (const inputType of ['insertCompositionText', 'deleteCompositionText', 'insertFromComposition', 'deleteByComposition']) {
      expect(isWriterSurfaceCompositionInputType(inputType), inputType).toBe(true);
    }
    expect(isWriterSurfaceCompositionInputType('insertText')).toBe(false);
    expect(isWriterSurfaceCompositionInputType('deleteContentBackward')).toBe(false);
  });
});

describe('reconcileWriterSurfaceInput — the model patch of one input event', () => {
  it('reports the paragraph index, the new text and the caret', () => {
    expect(reconcileWriterSurfaceInput(2, 'Hallo', 'Hallo Welt')).toEqual({
      paragraphIndex: 2,
      beforeText: 'Hallo',
      afterText: 'Hallo Welt',
      caret: 10,
    });
  });

  it('reports nothing for a formatting-only change', () => {
    expect(reconcileWriterSurfaceInput(0, 'Hallo', 'Hallo')).toBeNull();
  });
});