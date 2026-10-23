// STATUS: PLATIN — Source contract for Writer undo/redo coalescing keys
//
// The history domain is unit-tested. What unit tests cannot reach is that each
// call site actually passes the right coalescing key — or deliberately passes
// none, so a structural edit stays its own undo step.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const operations = read('../../../../editing/paragraphs/useWriterParagraphOperations.ts');
const formatting = read('../../../../formatting/useWriterFormattingState.ts');
const editorState = read('../../../../editor/useWriterState.ts');

describe('Writer undo/redo wiring contract', () => {
  it('coalesces a typing run per word, not per paragraph', () => {
    // Native M4 probe: a key for the whole paragraph merged a typed sentence into one
    // undo step, so `Strg+Z` deleted the sentence instead of the last word.
    expect(operations).toContain('resolveWriterTypingCoalesceKey({');
    expect(operations).toContain('coalesceKey ?? undefined,');
    expect(operations).not.toContain('typing:${updated[pIdx].id}');
  });

  it('keeps structural edits as their own step by passing no key', () => {
    expect(operations).toContain('persistParagraphs(plan.paragraphs, revisionPatch);');
    expect(operations).toContain('persistParagraphs(result.paragraphs, revisionPatch);');
    expect(operations).not.toContain('persistParagraphs(plan.paragraphs, revisionPatch, ');
  });

  it('treats a colour gesture as one step but a swatch click as its own', () => {
    expect(formatting).toContain("formatGestureCoalesceKey('format:text-color', options, textSelection?.paragraphId)");
    expect(formatting).toContain("formatGestureCoalesceKey('format:highlight', options, textSelection?.paragraphId)");
    expect(formatting).toContain('if (options === undefined) return false;');
  });

  it('carries the running key through commit, step and in-place replacement', () => {
    expect(editorState).toContain('coalesceKey: historyCoalesceKeyRef.current');
    expect(editorState).toContain('historyCoalesceKeyRef.current = next.coalesceKey;');
    expect(editorState).toContain('historyCoalesceKeyRef.current = stepped.state.coalesceKey;');
  });

  it('resets the running edit when the open document changes', () => {
    expect(editorState).toContain('historyCoalesceKeyRef.current = null;');
  });

  it('keeps undo and redo unavailable while the document is protected', () => {
    // WR-039: a refused undo reports itself instead of doing nothing silently.
    expect(editorState).toContain("if (reviewState.protectionMode !== 'none') { handleBlockedEditAttempt(); return; }");
  });

  it('derives canUndo and canRedo from the real history bounds', () => {
    expect(editorState).toContain('canUndo: reviewState.protectionMode === \'none\' && historyIndex > 0');
    expect(editorState).toContain("canRedo: reviewState.protectionMode === 'none' && historyIndex < history.length - 1");
  });
});
