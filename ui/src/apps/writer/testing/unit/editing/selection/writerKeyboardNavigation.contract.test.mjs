// STATUS: PLATIN — Source contract for the cross-paragraph keyboard navigation
//
// The navigation resolver is pure and unit-tested. What unit tests cannot reach
// without a DOM test runner is that the paragraph component consults it on every
// key press, that only a collapsed caret is navigated, and that Shift keeps the
// selection anchor instead of dragging it along.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const paragraphItem = read('../../../../editor/paragraphs/WriterParagraphItem.tsx');
const editorState = read('../../../../editor/useWriterState.ts');
const pagePaper = read('../../../../layout/pages/WriterPagePaper.tsx');

describe('Writer keyboard navigation wiring contract', () => {
  it('consults the resolver for every key press on a collapsed caret', () => {
    expect(paragraphItem).toContain('resolveWriterKeyboardNavigation({');
    expect(paragraphItem).toContain('const collapsed = navigationTarget.selectionStart === navigationTarget.selectionEnd;');
    expect(paragraphItem).toContain('const navigation = collapsed');
  });

  it('swallows the key and hands the target over', () => {
    expect(paragraphItem).toContain('event.preventDefault();');
    expect(paragraphItem).toContain('onNavigate?.(navigation.target, navigation.extendSelection);');
  });

  it('passes the paragraph list, fragment range and page boundary to the resolver', () => {
    expect(paragraphItem).toContain('paragraphs: allParagraphs,');
    expect(paragraphItem).toContain('fragmentEnd: fragmentStart + navigationTarget.value.length,');
    expect(paragraphItem).toContain('isFirstFragment: !fragment || fragment.isFirst,');
    expect(paragraphItem).toContain('pageBoundary,');
  });

  it('derives the page boundary from the fragments rendered on the page', () => {
    expect(pagePaper).toContain("const pageParagraphIds = pageFlowItems");
    expect(pagePaper).toContain('firstParagraphId: pageParagraphIds[0],');
    expect(pagePaper).toContain('pageBoundary={pageBoundary}');
  });

  it('keeps the selection anchor while extending with Shift', () => {
    expect(editorState).toContain('const anchor = rangeSelection.anchor ?? {');
    expect(editorState).toContain('if (!rangeSelection.anchor) rangeSelection.begin(anchor);');
    expect(editorState).toContain('rangeSelection.extend({ paragraphId: target.paragraphId, offset: target.offset });');
  });

  it('drops the range selection on a plain move', () => {
    expect(editorState).toContain('} else {\n      rangeSelection.clear();\n    }');
  });

  it('fails closed for protected documents and reports the refusal', () => {
    // WR-039: a keyboard entry that is refused must be visible, not silent.
    expect(editorState).toContain('if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }');
  });
});
