// STATUS: PLATIN — exercises real PDF inspection and image-model behavior through the installed host.
import { afterEach, expect, it } from 'vitest';
import { createPdfModelFromNormalizedJpegs, inspectNativePdfBytes } from '../../../../../platform/interop/pdfWorkspaceImport';
import { installPdfWorkspaceImportHost } from '../../../interchange/workspace/pdfWorkspaceImportHostAdapter';

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

it('routes passive native inspection and normalized JPEG model creation to the real PDF owners', async () => {
  release = installPdfWorkspaceImportHost();
  const passivePdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
  const inspection = await inspectNativePdfBytes(passivePdf);

  expect(inspection.parser).toBe('vgt-native-pdf-boundary-v1');
  expect(inspection.byteLength).toBe(passivePdf.byteLength);
  expect(inspection.encrypted).toBe(false);

  const model = createPdfModelFromNormalizedJpegs([{
    name: 'page.jpg', dataUrl: `data:image/jpeg;base64,${'A'.repeat(44)}`, widthPx: 800, heightPx: 600,
  }]);
  expect(model.numPages).toBe(1);
  expect(model.pages[0]?.images?.[0]?.mimeType).toBe('image/jpeg');
});
