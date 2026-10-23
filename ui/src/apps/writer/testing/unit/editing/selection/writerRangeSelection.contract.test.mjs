// STATUS: PLATIN — Source contract for the cross-paragraph selection wiring
//
// The selection model, the pointer resolution and the replacement are pure and
// unit-tested. What unit tests cannot reach without a DOM test runner is that the
// paragraph component starts the range on drag, that a keystroke over the range
// is intercepted instead of being applied to one textarea, and that the editor
// persists the replacement through the canonical path.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const paragraphItem = read('../../../../editor/paragraphs/WriterParagraphItem.tsx');
const editorState = read('../../../../editor/useWriterState.ts');
const editor = read('../../../../editor/WriterEditor.tsx');

describe('Writer cross-paragraph selection wiring contract', () => {
  it('starts the range from the first select event of a drag', () => {
    expect(paragraphItem).toContain('pendingRangeDragRef.current = true;');
    expect(paragraphItem).toContain('onRangeSelectionStart?.(pIdx, fragmentStart + Math.min(textarea.selectionStart, textarea.selectionEnd));');
  });

  it('intercepts Backspace, Delete and Enter while a range selection is active', () => {
    expect(paragraphItem).toContain('if (hasRangeSelection) {');
    expect(paragraphItem).toContain("if (event.key === 'Backspace' || event.key === 'Delete') {");
    expect(paragraphItem).toContain("onReplaceRangeSelection?.('');");
    expect(paragraphItem).toContain("onReplaceRangeSelection?.('\\n');");
    expect(paragraphItem).toContain('onReplaceRangeSelection?.(event.key);');
  });

  it('only intercepts printable keys without modifiers', () => {
    expect(paragraphItem).toContain("if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {");
  });

  it('marks the covered paragraphs so the range is visible', () => {
    expect(paragraphItem).toContain('const isRangeSelected = rangeSelectionParagraphIds?.includes(p.id) ?? false;');
    expect(paragraphItem).toContain("isRangeSelected ? 'bg-blue-500/10 ring-1 ring-blue-500/20' : ''");
  });

  it('persists the replacement through the canonical paragraph path', () => {
    expect(editorState).toContain('const rangeSelection = useWriterRangeSelection({');
    expect(editorState).toContain('replaceWriterSelection(paragraphs, selection, replacement, newParagraphIds)');
    expect(editorState).toContain('persistParagraphs(result.paragraphs, revisionPatch);');
    expect(editorState).toContain('rangeSelection.clear();');
  });

  it('hands the caret to the surviving paragraph after the replacement', () => {
    expect(editorState).toContain("origin: 'range-replace'");
    expect(editorState).toContain('setTextSelection({ paragraphId: result.caret.paragraphId, start: result.caret.offset, end: result.caret.offset });');
  });

  it('passes the selection through the renderer chain and disables it in historical review', () => {
    expect(editor).toContain('onReplaceRangeSelection={isHistoricalReview ? undefined : state.handleReplaceRangeSelection}');
    expect(editor).toContain('hasRangeSelection={isHistoricalReview ? false : state.hasRangeSelection}');
  });
});
