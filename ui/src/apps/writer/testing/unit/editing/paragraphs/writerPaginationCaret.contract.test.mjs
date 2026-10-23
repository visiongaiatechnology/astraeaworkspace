// STATUS: PLATIN — Source contract for the paginated-caret wiring in the Writer editor
//
// The fragment-ownership and text-composition rules are pure and unit-tested.
// What unit tests cannot reach without a DOM test runner is that the paragraph
// component actually uses them on every keystroke. This contract pins that
// wiring, so a refactor cannot silently reintroduce the inline slicing that
// dropped the text of neighbouring page fragments.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const paragraphItem = readFileSync(
  path.resolve(here, '../../../../editor/paragraphs/WriterParagraphItem.tsx'),
  'utf8',
);

describe('Writer paginated caret wiring contract', () => {
  it('routes fragment text through the pure composition helpers', () => {
    expect(paragraphItem).toContain('composeWriterParagraphTextFromFragment');
    expect(paragraphItem).toContain('sliceWriterParagraphFragmentText');
    expect(paragraphItem).toContain('const nextText = composeWriterParagraphTextFromFragment({');
  });

  it('no longer slices or splices the paragraph text inline', () => {
    expect(paragraphItem).not.toContain('rawText.slice(0, fragmentStart)');
    expect(paragraphItem).not.toContain('rawText.slice(fragment.endOffset)');
    expect(paragraphItem).not.toContain('displayContent.slice(fragmentStart, fragmentEnd)');
  });

  it('decides the owning fragment through the pure ownership rule', () => {
    expect(paragraphItem).toContain('resolveWriterFragmentLocalCaret(');
    expect(paragraphItem).toContain('if (localStart === null) return;');
  });

  it('re-establishes the caret after re-pagination on every text change', () => {
    expect(paragraphItem).toContain("requestWriterCaretAfterLayout({ paragraphId: p.id, start: nextCaret, origin: 'pagination' })");
  });

  it('does not steal focus back when the user already moved on', () => {
    expect(paragraphItem).toContain("if (request.origin === 'pagination') {");
    expect(paragraphItem).toContain('const stillOurs = active === textareaRef.current;');
    expect(paragraphItem).toContain('if (!stillOurs && !nothingFocused) {');
  });
});
