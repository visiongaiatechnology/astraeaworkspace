// STATUS: PLATIN — exercises Vault-facing inspection through the installed PDF host adapter.
import { afterEach, expect, it, vi } from 'vitest';
import { openPdfDocumentForInspection, type PdfInspectionDocument } from '../../../../platform/documents/pdfjs/pdfDocumentInspection';
import { installPdfJsWorkerInspectionHost } from '../../integrations/pdfJsWorkerInspectionHostAdapter';

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

it('routes inspection through the PDF-owned worker opener without exposing PDF internals to Vault', async () => {
  const sourceBytes = new Uint8Array([37, 80, 68, 70]);
  const document: PdfInspectionDocument = {
    snapshot: { pageCount: 1, hasJavaScriptActions: true },
    async getTextItems() { return [{ str: 'local text' }]; },
    async getLinks() { return [{ url: 'https://example.invalid' }]; },
    async destroy() {},
  };
  const openDocument = vi.fn(async () => document);
  release = installPdfJsWorkerInspectionHost(openDocument);

  const inspection = await openPdfDocumentForInspection(sourceBytes);
  expect(openDocument).toHaveBeenCalledWith(sourceBytes);
  expect(inspection.snapshot.hasJavaScriptActions).toBe(true);
  await expect(inspection.getTextItems(1)).resolves.toEqual([{ str: 'local text' }]);
  await expect(inspection.getLinks(1)).resolves.toEqual([{ url: 'https://example.invalid' }]);
  await inspection.destroy();
});
