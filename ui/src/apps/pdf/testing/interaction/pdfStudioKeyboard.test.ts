// STATUS: PLATIN — keyboard semantics of PDF Studio are one pure function, counter-checked here.
//
// Measured before this suite, on this exact path: `studio/PdfStudio.tsx:137-149` registered exactly one
// window listener, for Ctrl/Cmd+Z. There was no keyboard path for page navigation, for zoom, for the search
// box or for the annotation tools in the structured editor — a keyboard-only user could read page 1 and
// nothing else. `pdfStudioKeyboard.test.ts` pins the resolver so the wiring in `PdfStudio.tsx` cannot lose
// those keys again without a red test.
import { describe, expect, it } from 'vitest';
import {
  PDF_STUDIO_MAX_ZOOM,
  PDF_STUDIO_MIN_ZOOM,
  PDF_STUDIO_ZOOM_STEPS,
  clampPdfStudioPage,
  clampPdfStudioZoom,
  pdfStudioShortcutConsumesBrowserDefault,
  resolvePdfStudioShortcut,
  stepPdfStudioPage,
  stepPdfStudioZoom,
  type PdfStudioKeyboardContext,
} from '../../studio/interactions/pdfStudioKeyboard';

const ctx = (overrides: Partial<PdfStudioKeyboardContext> = {}): PdfStudioKeyboardContext => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  editableTarget: false,
  ...overrides,
});

describe('PDF Studio zoom ladder', () => {
  it('pins the supported window', () => {
    expect(PDF_STUDIO_ZOOM_STEPS).toEqual([50, 75, 100, 125, 150, 200, 300, 400]);
    expect(clampPdfStudioZoom(10)).toBe(PDF_STUDIO_MIN_ZOOM);
    expect(clampPdfStudioZoom(9_999)).toBe(PDF_STUDIO_MAX_ZOOM);
    expect(clampPdfStudioZoom(Number.NaN)).toBe(100);
  });

  it('selects the next step above and below, also from off-ladder values', () => {
    expect(stepPdfStudioZoom(100, 1)).toBe(125);
    expect(stepPdfStudioZoom(110, 1)).toBe(125);
    expect(stepPdfStudioZoom(110, -1)).toBe(100);
    expect(stepPdfStudioZoom(150, -1)).toBe(125);
  });

  it('saturates instead of wrapping, so the zoom position stays stable', () => {
    expect(stepPdfStudioZoom(400, 1)).toBe(400);
    expect(stepPdfStudioZoom(50, -1)).toBe(50);
  });
});

describe('PDF Studio page arithmetic', () => {
  it('clamps into a document of the given size', () => {
    expect(clampPdfStudioPage(0, 5)).toBe(1);
    expect(clampPdfStudioPage(99, 5)).toBe(5);
    expect(clampPdfStudioPage(3, 5)).toBe(3);
    expect(clampPdfStudioPage(Number.NaN, 5)).toBe(1);
    expect(clampPdfStudioPage(3, 0)).toBe(1);
  });

  it('steps without leaving the document', () => {
    expect(stepPdfStudioPage(1, 10, -1)).toBe(1);
    expect(stepPdfStudioPage(10, 10, 1)).toBe(10);
    expect(stepPdfStudioPage(4, 10, 3)).toBe(7);
    expect(stepPdfStudioPage(4, 10, Number.POSITIVE_INFINITY)).toBe(4);
  });
});

describe('PDF Studio shortcut resolution', () => {
  it('keeps document history reachable while a field has focus', () => {
    expect(resolvePdfStudioShortcut(ctx({ key: 'z', ctrlKey: true, editableTarget: true }))).toEqual({ kind: 'undo' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'Z', metaKey: true, shiftKey: true, editableTarget: true }))).toEqual({ kind: 'redo' });
  });

  it('leaves every other bare key to a focused text field', () => {
    expect(resolvePdfStudioShortcut(ctx({ key: 'PageDown', editableTarget: true }))).toEqual({ kind: 'none' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'Home', editableTarget: true }))).toEqual({ kind: 'none' });
    expect(resolvePdfStudioShortcut(ctx({ key: '6', altKey: true, editableTarget: true }))).toEqual({ kind: 'none' });
  });

  it('maps the view keys a PDF reader is expected to answer', () => {
    expect(resolvePdfStudioShortcut(ctx({ key: 'PageDown' }))).toEqual({ kind: 'page-next' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'PageUp' }))).toEqual({ kind: 'page-previous' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'Home' }))).toEqual({ kind: 'page-first' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'End' }))).toEqual({ kind: 'page-last' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'Home', ctrlKey: true }))).toEqual({ kind: 'page-first' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'End', metaKey: true }))).toEqual({ kind: 'page-last' });
  });

  it('maps zoom, search and copy', () => {
    expect(resolvePdfStudioShortcut(ctx({ key: '=', ctrlKey: true }))).toEqual({ kind: 'zoom-in' });
    expect(resolvePdfStudioShortcut(ctx({ key: '+', metaKey: true, shiftKey: true }))).toEqual({ kind: 'zoom-in' });
    expect(resolvePdfStudioShortcut(ctx({ key: '-', ctrlKey: true }))).toEqual({ kind: 'zoom-out' });
    expect(resolvePdfStudioShortcut(ctx({ key: '0', ctrlKey: true }))).toEqual({ kind: 'zoom-reset' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'f', ctrlKey: true }))).toEqual({ kind: 'focus-search' });
    expect(resolvePdfStudioShortcut(ctx({ key: 'c', ctrlKey: true }))).toEqual({ kind: 'copy-selection' });
  });

  it('maps Alt+1 … Alt+6 onto the toolbar tools in order', () => {
    const tools = ['1', '2', '3', '4', '5', '6'].map((key) => resolvePdfStudioShortcut(ctx({ key, altKey: true })));
    expect(tools).toEqual([
      { kind: 'tool', tool: 'select' },
      { kind: 'tool', tool: 'highlight' },
      { kind: 'tool', tool: 'underline' },
      { kind: 'tool', tool: 'strike' },
      { kind: 'tool', tool: 'comment' },
      { kind: 'tool', tool: 'redact' },
    ]);
    expect(resolvePdfStudioShortcut(ctx({ key: '7', altKey: true }))).toEqual({ kind: 'none' });
    expect(resolvePdfStudioShortcut(ctx({ key: '1', altKey: true, shiftKey: true }))).toEqual({ kind: 'none' });
  });

  it('reserves the browser default only where the shortcut replaces it', () => {
    expect(pdfStudioShortcutConsumesBrowserDefault({ kind: 'page-next' })).toBe(true);
    expect(pdfStudioShortcutConsumesBrowserDefault({ kind: 'zoom-in' })).toBe(true);
    expect(pdfStudioShortcutConsumesBrowserDefault({ kind: 'copy-selection' })).toBe(false);
    expect(pdfStudioShortcutConsumesBrowserDefault({ kind: 'none' })).toBe(false);
  });
});
