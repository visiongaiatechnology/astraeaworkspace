// STATUS: PLATIN — rendered contract for the affordances the keyboard paths depend on.
//
// `renderToStaticMarkup` is the only renderer in this environment (no jsdom, no @testing-library), so what it
// can prove is the **markup contract**: that the page strip is a focusable, named listbox with an option per
// page and a documented key set, and that the toolbar offers the whole zoom ladder from one list. What it
// cannot prove — focus movement, the actual key handling, the clipboard payload — is stated as `NOT_TESTED`
// in the evidence notes rather than implied here.
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import type { PdfPageModel } from '../../../../shared/contracts/workspace';
import { PdfThumbnailsSidebar } from '../../viewer/thumbnails/PdfThumbnailsSidebar';
import { PdfToolbar } from '../../studio/PdfToolbar';
import { PDF_STUDIO_ZOOM_STEPS } from '../../studio/interactions/pdfStudioKeyboard';
import { pdfToolbarCopy } from '../../studio/pdfToolbarLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined });

const noop = (): void => undefined;

const pages: PdfPageModel[] = [
  { pageNumber: 1, title: 'First page title', sections: [{ id: 's1', type: 'paragraph', content: 'Alpha' }] },
  { pageNumber: 2, title: 'Second page title', sections: [{ id: 's2', type: 'paragraph', content: 'Beta' }] },
];

const sidebarProps = {
  pages,
  currentPage: 2,
  onScrollToPage: noop,
  onAddPage: noop,
  annotations: [],
  onReorderPage: noop,
  onRotatePage: noop,
  onDuplicatePage: noop,
  onDeletePage: noop,
} satisfies ComponentProps<typeof PdfThumbnailsSidebar>;

const toolbarProps = {
  currentPage: 1,
  totalPages: pages.length,
  onScrollToPage: noop,
  canUndo: false,
  canRedo: false,
  onUndo: noop,
  onRedo: noop,
  activeTool: 'select',
  setActiveTool: noop,
  onApplyHighlight: noop,
  selectedHighlightColor: '#f59e0b',
  setSelectedHighlightColor: noop,
  onApplyUnderline: noop,
  onApplyStrike: noop,
  onInitiateComment: noop,
  onRedactSelection: noop,
  onOpenOcrModal: noop,
  onOpenContentEditor: noop,
  onOpenOptimizer: noop,
  totalRedactionsCount: 0,
  zoomLevel: 100,
  onZoomChange: noop,
  onZoomIn: noop,
  onZoomOut: noop,
  onOpenAuditModal: noop,
  isAnnotationsDrawerOpen: false,
  onToggleAnnotationsDrawer: noop,
} as unknown as ComponentProps<typeof PdfToolbar>;

describe('PDF page strip markup contract', () => {
  const markup = renderToStaticMarkup(createElement(PdfThumbnailsSidebar, sidebarProps));

  it('is a named, vertical listbox', () => {
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('aria-orientation="vertical"');
  });

  it('renders one option per page with exactly one tab stop', () => {
    expect(markup.match(/role="option"/gu)).toHaveLength(2);
    expect(markup.match(/tabindex="0"/gu)).toHaveLength(1);
    expect(markup.match(/tabindex="-1"/gu)).toHaveLength(1);
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-current="page"');
  });

  it('documents the keys that move, select and reorder', () => {
    expect(markup).toContain('aria-keyshortcuts="Enter Space ArrowUp ArrowDown Home End Alt+ArrowUp Alt+ArrowDown Delete"');
    expect(markup).toContain('data-pdf-thumbnail-page-index="2"');
  });
});

describe('PDF toolbar zoom contract', () => {
  const markup = renderToStaticMarkup(createElement(PdfToolbar, toolbarProps));
  const copy = pdfToolbarCopy('en-US');

  it('offers every step of the shared ladder, not three hard-coded presets', () => {
    for (const step of PDF_STUDIO_ZOOM_STEPS) {
      expect(markup, `${step}%`).toContain(`aria-label="${copy.setZoom(step)}"`);
    }
    expect(PDF_STUDIO_ZOOM_STEPS).toHaveLength(8);
  });

  it('marks the current step as pressed and no other zoom step', () => {
    const zoomBand = markup.slice(markup.indexOf(`aria-label="${copy.zoomPresets}"`));
    expect(zoomBand.match(/aria-pressed="true"/gu)).toHaveLength(1);
    expect(zoomBand).toContain(`aria-pressed="true" aria-label="${copy.setZoom(100)}"`);
  });
});
