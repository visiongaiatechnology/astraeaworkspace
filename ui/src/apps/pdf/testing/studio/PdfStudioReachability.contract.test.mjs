// STATUS: PLATIN â€” Source contract for the PDF Studio reachability and keyboard wiring.
//
// The five findings this file pins were all invisible to a unit test and invisible in a browser session that
// only used the mouse:
//
//   1. **OCR was unreachable.** `PdfToolbar` has accepted `onOpenOcrModal` and offered the action since the
//      engine layer landed, and `PdfStudioModals` rendered `<PdfOcrModal isOpen={isOcrModalOpen} â€¦/>` â€” but
//      `PdfStudio.tsx` never passed the prop, so `isOcrModalOpen` could never become true. A dead action.
//   2. **The structured editor answered one keyboard key.** `PdfStudio.tsx` registered a single window
//      listener for Ctrl/Cmd+Z. Page navigation, zoom, Ctrl/Cmd+F and the tool band were mouse-only.
//   3. **The page strip was not focusable.** `PdfThumbnailsSidebar` rendered each page as a `div` with an
//      `onClick`, so Tab never reached the only page list.
//   4. **Search had no cursor and no empty answer.** `PdfJsDisplayViewer` rendered the result panel only when
//      `searchResults.length` was non-zero â€” "no match" and "not searched yet" looked identical.
//   5. **Verification carried a second escaping rule.** `pdfTrueRedaction.ts` owned a local
//      `escapedPdfLiteral` that substituted `?`, weaker than the writer it verified. It must ask
//      `platform/interop/pdf/pdfTextStrings.ts` instead, where a published finding already forbids a second
//      rule for the same fact.
//
// A rendered check needs a browser and the source contract is what actually broke, so the wiring is pinned at
// the source. Prose is not code: every file is read with its comments removed, the same guard the archive
// dialog contract needed after it tripped over its own explanatory comment.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const readCode = (relative) => readFileSync(path.resolve(here, relative), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/^\s*\/\/.*$/gmu, '');

const studio = readCode('../../studio/PdfStudio.tsx');
const toolbar = readCode('../../studio/PdfToolbar.tsx');
const modals = readCode('../../studio/overlays/PdfStudioModals.tsx');
const studioState = readCode('../../studio/state/usePdfStudioState.ts');
const redactionWorkflow = readCode('../../security/redaction/usePdfRedactionWorkflow.ts');
const trueRedaction = readCode('../../security/redaction/pdfTrueRedaction.ts');
const sidebar = readCode('../../viewer/thumbnails/PdfThumbnailsSidebar.tsx');
const displayViewer = readCode('../../viewer/display/PdfJsDisplayViewer.tsx');
const pageView = readCode('../../viewer/display/PdfJsPageView.tsx');
const nativeViewer = readCode('../../viewer/PdfNativeViewer.tsx');
const viewport = readCode('../../viewer/PdfViewport.tsx');

describe('OCR is reachable from the PDF Studio toolbar (AST-0846)', () => {
  it('passes the opener from the studio into the toolbar', () => {
    expect(studio).toContain('onOpenOcrModal={() => setIsOcrModalOpen(true)}');
  });

  it('keeps the toolbar action conditioned on that opener, so an unpassed prop cannot resurrect a dead button', () => {
    expect(toolbar).toContain("if (onOpenOcrModal) addSecondaryAction('ocr', 'edit', Scan, 'text-cyan-300', onOpenOcrModal);");
    expect(modals).toContain('isOpen={isOcrModalOpen}');
  });
});

describe('the structured editor answers the keyboard (AST-0761/0766/0771/0781/0786)', () => {
  it('resolves keys through the one pure resolver instead of a private listener', () => {
    expect(studio).toContain('resolvePdfStudioShortcut({');
    expect(studio).not.toContain("event.key.toLowerCase() !== 'z'");
    expect(studio).toContain("case 'page-next':");
    expect(studio).toContain("case 'focus-search':");
    expect(studio).toContain("case 'copy-selection':");
    expect(studio).toContain("case 'tool':");
    expect(studio).toContain('pdfStudioShortcutConsumesBrowserDefault(command)');
  });

  it('moves the caret into the viewport search box on Ctrl/Cmd+F', () => {
    expect(studio).toContain('searchInputRef.current?.focus()');
    expect(viewport).toContain('ref={searchInputRef}');
    expect(viewport).toContain('data-pdf-search-input="true"');
  });

  it('gives the native byte viewer the same keys, including the search box inside it', () => {
    expect(nativeViewer).toContain('resolvePdfStudioShortcut({');
    expect(nativeViewer).toContain("querySelector<HTMLInputElement>('[data-pdf-search-input]')");
    expect(displayViewer).toContain('data-pdf-search-input="true"');
  });
});

describe('the zoom ladder is one bounded list (AST-0781)', () => {
  it('renders every step from the shared ladder and keeps the position stable', () => {
    expect(toolbar).toContain('PDF_STUDIO_ZOOM_STEPS.map((level) => (');
    expect(toolbar).not.toContain('([100, 125, 150] as const).map');
    expect(studioState).toContain('stepPdfStudioZoom(current, 1)');
    expect(studioState).toContain('stepPdfStudioZoom(current, -1)');
    expect(studioState).toContain('clampPdfStudioZoom(level)');
  });
});

describe('the page strip is operable without a pointer (AST-0766/0769/0804)', () => {
  it('exposes the pages as a focusable listbox with a documented key set', () => {
    expect(sidebar).toContain('role="listbox"');
    expect(sidebar).toContain('role="option"');
    expect(sidebar).toContain('tabIndex={isActive ? 0 : -1}');
    expect(sidebar).toContain('onKeyDown={(event) => handleTileKeyDown(event, pg.pageNumber)}');
    expect(sidebar).toContain('aria-keyshortcuts=');
    expect(sidebar).toContain('onReorderPage(pageNumber, targetPage)');
  });
});

describe('the search answers with a cursor and an explicit empty result (AST-0771/0774)', () => {
  it('reports a machine-readable status instead of hiding an empty result list', () => {
    expect(displayViewer).toContain('data-pdf-search-status=');
    expect(displayViewer).toContain('role="status"');
    expect(displayViewer).toContain('No match for');
    expect(displayViewer).toContain('searchResults === null ?');
  });

  it('steps through findings and marks the current one', () => {
    expect(displayViewer).toContain('stepPdfSearchCursor(results, searchCursor, direction)');
    expect(displayViewer).toContain('activeSearchHit={activeSearchPage === pageNumber ? activeSearchHit : null}');
    expect(pageView).toContain('pdfjs-search-hit-active');
    expect(pageView).toContain('applySearchHighlights(textLayerContainer, searchQuery, activeSearchHit)');
  });

  it('cancels a superseded search instead of letting it overwrite the state', () => {
    expect(displayViewer).toContain('searchRunRef.current !== run');
    expect(displayViewer).toContain('MAX_SEARCH_TOTAL_TEXT_BYTES');
  });
});

describe('every rejected action is visible (AST-0764/0779/0789/0809/0854/0859)', () => {
  it('reports a missing text selection instead of returning silently', () => {
    expect(studioState).not.toContain('if (!selectionContext) return;');
    expect(studioState).toContain('No selectable PDF text is selected');
    expect(studioState).toContain('No PDF text is selected');
  });

  it('reports the last-page refusal, the empty comment and the redaction no-match', () => {
    expect(studioState).toContain('The last remaining page cannot be deleted');
    expect(studioState).toContain('A comment with no text was not saved');
    expect(redactionWorkflow).toContain('No PDF text is selected');
    expect(redactionWorkflow).toContain('The selected text was not found in the page model');
    expect(redactionWorkflow).toContain('No match for the redaction pattern');
    expect(studio).toContain('data-pdf-studio-notice=');
    expect(studio).toContain("role={studioNotice.tone === 'warning' ? 'alert' : 'status'}");
  });
});

describe('verification asks the canonical text rule (one fact, one implementation)', () => {
  it('no longer owns a local escaping rule', () => {
    expect(trueRedaction).not.toMatch(/function\s+escapedPdfLiteral/u);
    expect(trueRedaction).not.toContain("replace(/[^\\x20-\\x7E]/g, '?')");
  });

  it('imports the writers it verifies from the module that owns them', () => {
    expect(trueRedaction).toContain("from '../../../../platform/interop/pdf/pdfTextStrings'");
    expect(trueRedaction).toContain('pdfWinAnsiLiteral(value)');
    expect(trueRedaction).toContain('pdfUnicodeTextString(value)');
    expect(trueRedaction).toContain('isPdfWinAnsiRepresentable(value)');
  });

  it('scans the form-field name and default value that the exporter writes into /T and /DV', () => {
    expect(trueRedaction).toContain('visit(field.name);');
    expect(trueRedaction).toContain('visit(field.defaultValue);');
  });
});
