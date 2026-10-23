// STATUS: PLATIN — AST-0691/AST-0694: the ink studio renders a zoom control and a computed vector viewBox.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotesInkCanvasModal } from '../../canvas/ink/NotesInkCanvasModal';
import { createEmptyNoteInkDocument } from '../../canvas/ink/notesInkEngine';

const noop = (): void => undefined;

function render(document = createEmptyNoteInkDocument(800, 400)): string {
  return renderToStaticMarkup(
    <NotesInkCanvasModal isOpen onClose={noop} onInsertDrawing={noop} initialDocument={document} />
  );
}

describe('AST-0691 ink studio zoom surface', () => {
  it('renders the zoom group with labelled controls and the reset value', () => {
    const markup = render();
    expect(markup).toContain('aria-label="Ink zoom"');
    expect(markup).toContain('aria-label="Zoom in ink canvas"');
    expect(markup).toContain('aria-label="Zoom out ink canvas"');
    expect(markup).toContain('Ink zoom 100 percent, reset to 100 percent');
    expect(markup).toContain('100%');
  });

  it('derives the viewBox from the document through the pure zoom resolver', () => {
    const markup = render();
    // 800×400 at zoom 1 — proof that the viewBox is computed, not hardcoded to the old 640×360.
    expect(markup).toContain('viewBox="0 0 800 400"');
    expect(markup).not.toContain('viewBox="0 0 640 360"');
  });

  it('starts with a disabled zoom-out control and an enabled zoom-in control', () => {
    const markup = render();
    const zoomOut = markup.slice(markup.indexOf('aria-label="Zoom out ink canvas"') - 400, markup.indexOf('aria-label="Zoom out ink canvas"'));
    expect(zoomOut).toContain('disabled');
  });

  it('keeps the stroke data untouched and never fetches anything', () => {
    const document = createEmptyNoteInkDocument(800, 400);
    const markup = render(document);
    expect(markup).toContain('0 strokes');
    expect(markup).toContain('Local vector ink. No network required.');
    expect(markup).not.toContain('fetch(');
    // The SVG namespace is `http://www.w3.org/2000/svg`; what must not exist is a network resource.
    expect(markup).not.toContain('src="http');
    expect(markup).not.toContain('href="http');
    // The preview is an inline data URL of the rendered vector, not a remote resource.
    expect(markup).toContain('data:image/svg+xml');
  });
});
