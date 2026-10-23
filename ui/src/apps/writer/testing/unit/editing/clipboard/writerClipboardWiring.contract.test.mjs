// STATUS: PLATIN — Source contract for the Writer paste path
//
// The clipboard parser and the insertion are pure and unit-tested. What unit
// tests cannot reach is that the textarea intercepts the paste at all, that rich
// text is preferred over plain text, that the plain-text request is remembered
// from the key press, and that the result goes through the canonical write path.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const paragraphItem = read('../../../../editor/paragraphs/WriterParagraphItem.tsx');
const editorState = read('../../../../editor/useWriterState.ts');
const editor = read('../../../../editor/WriterEditor.tsx');

describe('Writer paste wiring contract', () => {
  it('intercepts the paste on the paragraph textarea', () => {
    expect(paragraphItem).toContain('onPaste={(event) => {');
    expect(paragraphItem).toContain('if (readOnly || !onPastePayload) return;');
    expect(paragraphItem).toContain('event.preventDefault();');
  });

  it('prefers rich text and falls back to plain text', () => {
    expect(paragraphItem).toContain("const html = plainOnly ? '' : clipboard.getData('text/html');");
    expect(paragraphItem).toContain('? parseWriterClipboardHtml(html)');
    expect(paragraphItem).toContain(': parseWriterClipboardPlainText(clipboard.getData(\'text/plain\'));');
  });

  it('remembers a plain-text request from the preceding key press', () => {
    expect(paragraphItem).toContain('plainPasteRef');
    expect(paragraphItem).toContain("if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'V' || event.key === 'v')) {");
    expect(paragraphItem).toContain('const plainOnly = plainPasteRef.current;');
  });

  it('reports the fragment-absolute selection to the editor', () => {
    expect(paragraphItem).toContain('fragmentStart + event.currentTarget.selectionStart,');
    expect(paragraphItem).toContain('fragmentStart + event.currentTarget.selectionEnd,');
  });

  it('persists the paste through the canonical paragraph path', () => {
    expect(editorState).toContain('const handlePastePayload = useCallback((');
    expect(editorState).toContain('insertWriterClipboardPayload(');
    expect(editorState).toContain('persistParagraphs(result.paragraphs);');
    expect(editorState).toContain("origin: 'paste'");
  });

  it('fails closed for protected documents and historical review', () => {
    // WR-039: the refusal is reported instead of returning silently.
    expect(editorState).toContain('if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }');
    expect(editor).toContain('onPastePayload={isHistoricalReview ? undefined : state.handlePastePayload}');
  });
});
