// STATUS: PLATIN — Source contract: the editor is reachable, one tab stop, and IME-safe
//
// Paket 47 acceptance: "Tab-Navigation, Screenreader-Rollen und IME-Eingabe auf einer leeren und vollen
// Seite prüfen."
//
// Pinned here: the composition guard is the **first** statement of the keydown handler (so no later
// branch can be reached while an IME is composing), the document is a single tab stop with a fallback
// for the empty page, and the editor's roles and accessible name are present.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const item = read('../../../../editor/paragraphs/WriterParagraphItem.tsx');
const platform = read('../../../../../../shared/accessibility/accessibilityPlatform.ts');
const frame = read('../../../../../../app/WorkspaceApplicationFrame.tsx');

/** The body of the paragraph textarea's keydown handler. */
const keydownHandler = () => {
  const start = item.indexOf('onKeyDown={(event) => {');
  return item.slice(start, item.indexOf('onFocus={(event) => {', start));
};

describe('an input method editor owns its keys', () => {
  it('guards the keydown handler before any branch', () => {
    const handler = keydownHandler();
    const guard = handler.indexOf('if (isImeCompositionEvent(event.nativeEvent)) return;');
    expect(guard).toBeGreaterThan(-1);
    // Everything the handler does must come after the guard: Enter (commit), Escape (cancel), Tab,
    // arrows, Backspace and a printable key all belong to the composition while it runs.
    for (const branch of [
      "event.key === 'Escape'",
      "event.key === 'Tab'",
      "event.key === 'Backspace'",
      "resolveWriterKeyboardNavigation({",
      "resolveWriterEnterIntent({",
      'plainPasteRef.current = true;',
    ]) {
      const position = handler.indexOf(branch);
      expect(position).toBeGreaterThan(guard);
    }
  });

  it('uses the shared rule instead of a private copy', () => {
    // W-279: the same rule existed in three shapes (this helper, one in the Automate app, six inline).
    expect(item).toContain("import { isImeCompositionEvent } from '../../../../shared/accessibility/accessibilityPlatform';");
    expect(platform).toContain('export function isImeCompositionEvent(event: ShortcutCompositionState): boolean {');
    expect(platform).toContain('if (event.isComposing) return true;');
    expect(platform).toContain('if (event.keyCode === 229) return true;');
  });

  it('keeps the shortcut path working through the same rule', () => {
    expect(platform).toContain('export function shouldProcessWorkspaceShortcut(event: ShortcutCompositionState): boolean {');
    expect(platform).toContain('return !isImeCompositionEvent(event);');
  });

  it('still honours composition on the input path', () => {
    // This half was already right; the guard must not have replaced it.
    expect(item).toContain('const isComposing = event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing;');
  });
});

describe('the document is one tab stop, not one per paragraph', () => {
  it('makes only the active paragraph reachable with Tab', () => {
    // W-280: without this a keyboard user tabbed once per paragraph (plus once per footnote badge) to
    // get past the document.
    expect(item).toContain("tabIndex={(isFirstFragment && (activeParagraphId ? activeParagraphId === p.id : pIdx === 0)) ? 0 : -1}");
  });

  it('keeps the empty page reachable', () => {
    // The fallback `: pIdx === 0` is what makes the editor enterable while nothing is active yet; without
    // it every paragraph would be -1 and the editor unreachable by keyboard.
    expect(item).toContain(': pIdx === 0)');
  });

  it('reuses the existing fragment test instead of inventing a second one', () => {
    expect(item).toContain('const isFirstFragment = fragment?.isFirst ?? true;');
    expect(item).not.toContain('isFirstFragmentOfParagraph');
  });
});

describe('the editor says what it is', () => {
  it('names the text field and states its state', () => {
    expect(item).toContain('aria-multiline="true"');
    expect(item).toContain('aria-readonly={readOnly}');
    expect(item).toContain('aria-label={`${heading ? `Überschrift Ebene ${p.style.heading_level ?? 1}` : \'Absatz\'} ${pIdx + 1}`}');
  });

  it('keeps a way past the surrounding chrome', () => {
    // The shell's skip link is what makes the editor reachable without walking the whole frame.
    expect(frame).toContain('className="astraea-skip-link"');
    expect(frame).toContain('href="#astraea-workspace-main"');
  });
});
