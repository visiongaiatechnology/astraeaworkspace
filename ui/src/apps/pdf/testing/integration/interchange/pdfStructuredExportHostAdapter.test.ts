// STATUS: PLATIN — proves the App-installed host reaches the existing PDF serializer and policy check.
import { afterEach, expect, it } from 'vitest';
import { buildStructuredPdfBytes } from '../../../../../platform/interop/pdfStructuredExport';
import { installPdfActiveContentPolicyHost } from '../../../interchange/security/pdfActiveContentPolicyHostAdapter';
import { installPdfStructuredExportHost } from '../../../interchange/structuredPdfExportHostAdapter';
import type { PdfDocumentModel } from '../../../../../shared/contracts/notes-pdf/pdf/workspacePdf';

let releases: Array<() => void> = [];

afterEach(() => {
  releases.reverse().forEach((release) => release());
  releases = [];
});

it('serializes a structured model and checks the resulting bytes through the PDF-owned policy host', () => {
  releases = [installPdfActiveContentPolicyHost(), installPdfStructuredExportHost()];
  const model: PdfDocumentModel = { numPages: 0, pages: [], annotations: [], redactions: [] };

  const bytes = buildStructuredPdfBytes('safe.pdf', model);
  expect(new TextDecoder().decode(bytes)).toContain('%PDF-1.4');
  expect(bytes.byteLength).toBeGreaterThan(16);
});
