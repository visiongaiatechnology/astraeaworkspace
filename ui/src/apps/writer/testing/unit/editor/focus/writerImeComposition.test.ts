// STATUS: DIAMANT VGT SUPREME — IME composition must not be read as editing
//
// Paket 47 acceptance: "Tab-Navigation, Screenreader-Rollen und **IME-Eingabe** auf einer leeren und
// vollen Seite prüfen."
//
// W-278, measured: the Writer paragraph's `onKeyDown` had no composition guard while its `input`
// handler did. During a composition the browser fires keydown for keys the IME owns, so every branch
// below acted on them as well: `Escape` (cancel the candidate) also left editing mode and blurred,
// `Enter` (commit) also split or appended a paragraph, `Backspace` also merged paragraphs backwards,
// arrows also jumped across paragraphs, `Tab` also inserted a tab, and a printable key also replaced a
// range selection with one raw character.
//
// W-279: the same rule lived in three shapes — `shouldProcessWorkspaceShortcut` here, a separate
// `isImeComposition` in the Automate app, and six inline copies. One definition now exists and both
// entry points use it; the copies are recorded for the findings pass.
import { describe, expect, it } from 'vitest';
import {
  isImeCompositionEvent,
  shouldProcessWorkspaceShortcut,
} from '../../../../../../shared/accessibility/accessibilityPlatform';

describe('a composing key belongs to the input method, not to the document', () => {
  it('recognises the modern signal', () => {
    expect(isImeCompositionEvent({ isComposing: true, keyCode: 13, key: 'Enter' })).toBe(true);
  });

  it('recognises the legacy signal', () => {
    // Older engines report every composing key with keyCode 229 and an empty key.
    expect(isImeCompositionEvent({ isComposing: false, keyCode: 229, key: '' })).toBe(true);
  });

  it('recognises the keys an IME reports instead of a character', () => {
    expect(isImeCompositionEvent({ isComposing: false, keyCode: 229, key: 'Process' })).toBe(true);
    expect(isImeCompositionEvent({ isComposing: false, keyCode: 229, key: 'Dead' })).toBe(true);
  });

  it('lets an ordinary key through', () => {
    expect(isImeCompositionEvent({ isComposing: false, keyCode: 65, key: 'a' })).toBe(false);
    expect(isImeCompositionEvent({ isComposing: false, keyCode: 13, key: 'Enter' })).toBe(false);
    expect(isImeCompositionEvent({})).toBe(false);
  });

  it('names the keys a composition uses, not only the flag', () => {
    // Enter commits, Escape cancels, Tab and the arrows belong to the candidate window — these are the
    // keys the editor used to act on.
    for (const key of ['Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace']) {
      expect(isImeCompositionEvent({ isComposing: true, keyCode: 229, key })).toBe(true);
    }
  });
});

describe('the shortcut path keeps its behaviour', () => {
  it('is exactly the inverse, so nothing changed for shortcuts', () => {
    const cases = [
      { isComposing: true, keyCode: 13, key: 'Enter' },
      { isComposing: false, keyCode: 229, key: '' },
      { isComposing: false, keyCode: 229, key: 'Process' },
      { isComposing: false, keyCode: 229, key: 'Dead' },
      { isComposing: false, keyCode: 65, key: 'a' },
      { isComposing: false, keyCode: 13, key: 'Enter' },
    ];
    for (const event of cases) {
      expect(shouldProcessWorkspaceShortcut(event)).toBe(!isImeCompositionEvent(event));
    }
  });

  it('still refuses a composing shortcut and still allows a plain one', () => {
    expect(shouldProcessWorkspaceShortcut({ isComposing: true, keyCode: 0, key: 's' })).toBe(false);
    expect(shouldProcessWorkspaceShortcut({ isComposing: false, keyCode: 83, key: 's' })).toBe(true);
  });
});
