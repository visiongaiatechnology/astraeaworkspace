import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { PdfStructuredFlowLayer } from '../../viewer/layers/PdfStructuredFlowLayer';

describe('structured PDF text selection context', () => {
  it('marks section text with its page and section identifiers for annotations', () => {
    const html = renderToStaticMarkup(createElement(PdfStructuredFlowLayer, {
      page: DEFAULT_PDF_MODEL.pages[0],
      pageIndex: 0,
      pageCount: DEFAULT_PDF_MODEL.pages.length,
      annotations: [],
      searchQuery: '',
      activeTool: 'select',
      onStageSectionRedaction: () => undefined,
    }));

    expect(html).toContain('data-pdf-page="1"');
    expect(html).toContain('data-pdf-section-id="sec-p1-1"');
    expect(html).toContain('data-pdf-section-id="sec-p1-4"');
  });
});
