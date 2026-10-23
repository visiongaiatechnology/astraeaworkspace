import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PdfToolbar } from '../../studio/PdfToolbar';
import { PDF_TOOLBAR_COPY } from '../../studio/pdfToolbarLocale';
import { PdfThumbnailsSidebar } from '../../viewer/thumbnails/PdfThumbnailsSidebar';

describe('PDF Studio toolbar layout', () => {
  it('keeps frequent actions visible and secondary tools inside a closed disclosure', () => {
    const copy = PDF_TOOLBAR_COPY['en-US'];
    const html = renderToStaticMarkup(createElement(PdfToolbar, {
      currentPage: 1,
      totalPages: 3,
      onScrollToPage: vi.fn(),
      canUndo: false,
      canRedo: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      activeTool: 'select',
      setActiveTool: vi.fn(),
      onApplyHighlight: vi.fn(),
      selectedHighlightColor: '#fde68a',
      setSelectedHighlightColor: vi.fn(),
      onApplyUnderline: vi.fn(),
      onApplyStrike: vi.fn(),
      onInitiateComment: vi.fn(),
      onRedactSelection: vi.fn(),
      onOpenTrueRedaction: vi.fn(),
      onVerifiedRedactionExport: vi.fn(),
      onOpenSignatureModal: vi.fn(),
      onOpenSanitizeModal: vi.fn(),
      onOpenFormFiller: vi.fn(),
      onOpenAssembler: vi.fn(),
      onOpenOcrModal: vi.fn(),
      onOpenDigitalSignatureModal: vi.fn(),
      onOpenPasswordProtection: vi.fn(),
      onOpenRoundtripModal: vi.fn(),
      onOpenWorkspaceIntegration: vi.fn(),
      onOpenCompare: vi.fn(),
      onOpenConversion: vi.fn(),
      onOpenOptimization: vi.fn(),
      onOpenContentEditor: vi.fn(),
      totalRedactionsCount: 1,
      zoomLevel: 100,
      onZoomChange: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onOpenAuditModal: vi.fn(),
      isAnnotationsDrawerOpen: false,
      onToggleAnnotationsDrawer: vi.fn(),
      onExportPdf: vi.fn(),
    }));

    expect(html).toContain(`aria-label="${copy.annotationTools}"`);
    expect(html).toContain('data-pdf-studio-toolbar="true"');
    expect(html).toContain('data-pdf-brand-label="true"');
    expect(html).toContain('data-pdf-tool-band="true"');
    expect(html).toContain('data-pdf-tool="select"');
    expect(html).toContain(`aria-label="${copy.select}"`);
    expect(html).toContain(`aria-label="${copy.highlightSelection}"`);
    expect(html).toContain(`aria-label="${copy.addComment}"`);
    expect(html).toContain(`aria-label="${copy.redactSelected(1)}"`);
    expect(html).toContain(`aria-label="${copy.moreTools}"`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/id="pdf-toolbar-more" hidden=""/);
    expect(html).toContain(copy.actions.contentEditor.label);
    expect(html).toContain(copy.actions.redactionExport.label);
    expect(html).toContain(copy.actions.redactionAudit.label);
    expect(html).toContain(`aria-label="${copy.exportPdfAria}"`);
  });

  it('marks the selected thumbnail as workspace-owned selection chrome', () => {
    const html = renderToStaticMarkup(createElement(PdfThumbnailsSidebar, {
      pages: [{ pageNumber: 1, title: 'Page one', sections: [] }],
      currentPage: 1,
      onScrollToPage: vi.fn(),
      onAddPage: vi.fn(),
      annotations: [],
      onReorderPage: vi.fn(),
      onRotatePage: vi.fn(),
      onDuplicatePage: vi.fn(),
      onDeletePage: vi.fn(),
    }));

    expect(html).toContain('data-pdf-studio-sidebar="pages"');
    expect(html).toContain('data-pdf-page-selected="true"');
    expect(html).toContain('data-pdf-thumbnail-page="true"');
  });
});
