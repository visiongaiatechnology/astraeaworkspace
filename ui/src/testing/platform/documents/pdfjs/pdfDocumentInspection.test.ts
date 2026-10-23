// STATUS: PLATIN — fail-closed, bounded Core PDF inspection contract tests.
import { afterEach, expect, it, vi } from 'vitest';
import {
  openPdfDocumentForInspection,
  PdfDocumentInspectionHostUnavailableError,
  registerPdfDocumentInspectionHost,
  type PdfInspectionDocument,
} from '../../../../platform/documents/pdfjs/pdfDocumentInspection';

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

function createDocument(): PdfInspectionDocument {
  return {
    snapshot: { pageCount: 2, hasJavaScriptActions: false },
    async getTextItems(pageNumber) { return [{ str: `page-${pageNumber}` }]; },
    async getLinks() { return [{ url: null }]; },
    async destroy() {},
  };
}

it('fails closed when the PDF inspection host is not installed', async () => {
  await expect(openPdfDocumentForInspection(new Uint8Array([1])))
    .rejects.toBeInstanceOf(PdfDocumentInspectionHostUnavailableError);
});

it('rejects invalid or oversized bytes before opening a document', async () => {
  const openDocument = vi.fn(async () => createDocument());
  release = registerPdfDocumentInspectionHost({ openDocument });

  await expect(openPdfDocumentForInspection(new Uint8Array())).rejects.toThrow('bytes_invalid');
  await expect(openPdfDocumentForInspection(new Uint8Array(96 * 1024 * 1024 + 1))).rejects.toThrow('bytes_invalid');
  expect(openDocument).not.toHaveBeenCalled();
});

it('validates page ranges, freezes the neutral snapshot, and closes the host document once', async () => {
  const document = createDocument();
  const destroy = vi.fn(async () => {});
  const openDocument = vi.fn(async () => ({ ...document, destroy }));
  release = registerPdfDocumentInspectionHost({ openDocument });

  const inspection = await openPdfDocumentForInspection(new Uint8Array([1]));
  expect(inspection.snapshot).toEqual({ pageCount: 2, hasJavaScriptActions: false });
  expect(Object.isFrozen(inspection.snapshot)).toBe(true);
  await expect(inspection.getTextItems(0)).rejects.toThrow('page_invalid');
  await expect(inspection.getLinks(3)).rejects.toThrow('page_invalid');
  await expect(inspection.getTextItems(1)).resolves.toEqual([{ str: 'page-1' }]);
  await inspection.destroy();
  await inspection.destroy();
  await expect(inspection.getLinks(1)).rejects.toThrow('document_destroyed');
  expect(destroy).toHaveBeenCalledTimes(1);
});

it('rejects a host document with an invalid bounded snapshot', async () => {
  release = registerPdfDocumentInspectionHost({
    async openDocument() {
      return {
        snapshot: { pageCount: 100_001, hasJavaScriptActions: false },
        async getTextItems() { return []; },
        async getLinks() { return []; },
        async destroy() {},
      };
    },
  });

  await expect(openPdfDocumentForInspection(new Uint8Array([1])))
    .rejects.toThrow('document_invalid');
});
