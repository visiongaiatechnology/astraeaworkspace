// STATUS: PLATIN

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flattenForeignPdfBytes } from '../../import/pdfForeignPageImport';
import { openPdfJsDisplayDocument } from '../../../pdf/viewer/display/pdfJsDisplayClient';
import type { PdfJsOpenedDisplayDocument } from '../../../pdf/viewer/contracts/pdfJsDisplayTypes';

vi.mock('../../../pdf/viewer/display/pdfJsDisplayClient', () => ({ openPdfJsDisplayDocument: vi.fn() }));

describe('foreign PDF page resource limits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a document above its caller page cap before rasterizing any page', async () => {
    const getPage = vi.fn();
    const destroy = vi.fn(async () => undefined);
    const opened = {
      document: { numPages: 129, getPage },
      loadingTask: { destroy },
      module: {},
    } as unknown as PdfJsOpenedDisplayDocument;
    vi.mocked(openPdfJsDisplayDocument).mockResolvedValue(opened);

    await expect(flattenForeignPdfBytes(
      new TextEncoder().encode('%PDF-1.4\n'),
      'Large PDF',
      undefined,
      { maxImportedPages: 128 },
    )).rejects.toThrow('Foreign PDF page selection exceeds the import budget');

    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('rejects oversized explicit selections before allocating the deduplicated selection', async () => {
    const getPage = vi.fn();
    const opened = {
      document: { numPages: 129, getPage },
      loadingTask: { destroy: vi.fn(async () => undefined) },
      module: {},
    } as unknown as PdfJsOpenedDisplayDocument;
    vi.mocked(openPdfJsDisplayDocument).mockResolvedValue(opened);

    await expect(flattenForeignPdfBytes(
      new TextEncoder().encode('%PDF-1.4\n'),
      'Large selection',
      Array.from({ length: 129 }, (_, index) => index + 1),
      { maxImportedPages: 128 },
    )).rejects.toThrow('Foreign PDF page selection exceeds the import budget');

    expect(getPage).not.toHaveBeenCalled();
  });
});
