import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_MODEL, DEFAULT_PDF_PAGES } from '../../../../shared/seeds/pdfDefaults';

describe('PDF workspace starter defaults', () => {
  it('keeps a single edition-neutral page model for seed factories and Studio state', () => {
    expect(DEFAULT_PDF_MODEL.pages).toBe(DEFAULT_PDF_PAGES);
    expect(DEFAULT_PDF_MODEL.numPages).toBe(DEFAULT_PDF_PAGES.length);
    expect(DEFAULT_PDF_PAGES.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(DEFAULT_PDF_MODEL.annotations.map((annotation) => annotation.id)).toEqual(['anno-1', 'anno-2']);
    expect(DEFAULT_PDF_MODEL.redactions).toEqual([]);
    expect(DEFAULT_PDF_PAGES[0].sections[2].content).toContain('DEMO DATA ONLY');
    expect(DEFAULT_PDF_PAGES[2].sections[2].content).toContain('arbitrary imported PDFs');
  });
});
