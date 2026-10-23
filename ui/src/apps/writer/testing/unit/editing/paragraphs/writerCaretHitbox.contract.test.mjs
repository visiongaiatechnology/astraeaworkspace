// STATUS: PLATIN — Source contract for the Writer caret hitbox wiring
//
// The line-count estimate and the row-click projection are pure and unit-tested.
// What unit tests cannot reach without a DOM test runner is that the renderer
// actually sizes paragraphs from the estimate, that a paragraph can never clip
// its own text, and that a click on the row places the caret instead of only
// selecting the paragraph.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const paragraphItem = read('../../../../editor/paragraphs/WriterParagraphItem.tsx');
const pageRenderer = read('../../../../layout/pages/WriterPageRenderer.tsx');

describe('Writer caret hitbox wiring contract', () => {
  it('sizes continuous-mode paragraphs from the shared line-count estimate', () => {
    expect(pageRenderer).toContain('lineCount: resolveWriterParagraphLineCount({');
    expect(pageRenderer).not.toContain('lineCount: 1,');
  });

  it('sizes an unpaginated paragraph from the same estimate', () => {
    expect(paragraphItem).toContain('rows={fragment');
    expect(paragraphItem).toContain('resolveWriterParagraphLineCount({ text: displayContent, headingLevel: heading })');
    expect(paragraphItem).not.toContain('displayContent.split(\'\\n\').length + Math.floor(');
  });

  it('never clips a paragraph that is taller than its estimated rows', () => {
    expect(paragraphItem).toContain('overflow-y-auto no-scrollbar');
    expect(paragraphItem).not.toContain('overflow-hidden no-scrollbar');
  });

  it('places the caret for a click on the paragraph row', () => {
    expect(paragraphItem).toContain('resolveWriterRowClickOffset({');
    expect(paragraphItem).toContain('boxHeight: rect.height,');
    expect(paragraphItem).toContain('applyCaret(offset, offset);');
  });

  it('still leaves clicks inside interactive elements alone', () => {
    expect(paragraphItem).toContain("target.closest('textarea, input, button, a, [contenteditable=\"true\"]')");
  });
});
