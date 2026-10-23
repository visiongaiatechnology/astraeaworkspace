// STATUS: PLATIN — Source contract for the fail-closed image drop
//
// The supported types are unit-tested. What unit tests cannot reach is that the
// page really cancels `dragover` and `drop` for every file — a drop that is not
// cancelled makes the WebView navigate to the dropped file, which loses the
// application.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const editorState = read('../../../editor/useWriterState.ts');
const pagePaper = read('../../../layout/pages/WriterPagePaper.tsx');
const editor = read('../../../editor/WriterEditor.tsx');

describe('Writer image drop contract', () => {
  it('cancels the drag over the page for every drop', () => {
    expect(pagePaper).toContain('onDragOver={(e) => {');
    expect(pagePaper).toContain('e.preventDefault();');
    // The old version cancelled only when an image item was present, so any other
    // file made the browser perform its default action.
    expect(pagePaper).not.toContain("item.kind === 'file' && item.type.startsWith('image/')");
  });

  it('cancels the drop before it decides what to do', () => {
    const handler = editorState.slice(editorState.indexOf('const handlePaperDrop'));
    const body = handler.slice(0, handler.indexOf('}, [handleInsertImageFile])'));
    const guard = body.indexOf('e.preventDefault();');
    // `indexOf` returns -1 when the call is missing, and -1 is "less than" any
    // position — so the presence check has to come first, otherwise this test
    // passes without the guard.
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('isSupportedWriterImageMime'));
    expect(body).toContain('if (file) {');
  });

  it('refuses an unrecognised file with a visible message', () => {
    expect(editorState).toContain("setImageImportError('Nur JPEG-, PNG- und WebP-Bilder können auf die Seite gezogen werden.');");
  });

  it('uses the shared type set instead of a loose prefix test', () => {
    expect(editorState).toContain('isSupportedWriterImageMime(candidate.type)');
    expect(editorState).not.toContain("file.type.startsWith('image/')");
    expect(editor).toContain('accept={WRITER_IMAGE_ACCEPT_ATTRIBUTE}');
    expect(editor).not.toContain('accept="image/jpeg,image/png,image/webp"');
  });

  it('anchors the imported image at the resolved paragraph, not at a stale fallback', () => {
    // WR-033 (native M7 re-probe): `activeParagraph` falls back to `paragraphs[0]`, so the
    // import used to be anchored to page 1 while the caret sat on page 5. The anchor is now
    // resolved from the caret, the visible page and the flow before the import runs.
    expect(editorState).toContain('resolveWriterImageAnchorParagraphId({');
    expect(editorState).toContain('await importWriterImage(file, anchorParagraphId)');
    expect(editorState).not.toContain('await importWriterImage(file, activeParagraph?.id)');
    // The inserted picture is revealed instead of silently landing below the fold.
    expect(editorState).toContain('scheduleWriterImageReveal(image.id)');
  });
});
