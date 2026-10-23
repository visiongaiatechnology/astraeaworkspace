// STATUS: PLATIN — pins the fail-closed serializer host, single-owner registration, and byte contract.
import { afterEach, describe, expect, it } from 'vitest';
import type { PdfDocumentModel } from '../../../shared/contracts/notes-pdf/pdf/workspacePdf';
import {
  buildStructuredPdfBytes,
  PdfStructuredExportHostUnavailableError,
  registerPdfStructuredExportHost,
  type PdfStructuredExportHost,
} from '../../../platform/interop/pdfStructuredExport';

const model: PdfDocumentModel = { numPages: 0, pages: [], annotations: [], redactions: [] };
const bytes = new TextEncoder().encode('%PDF-1.7\n%%EOF');
let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

describe('Core structured PDF export port', () => {
  it('fails closed until the trusted PDF host is registered', () => {
    expect(() => buildStructuredPdfBytes('safe.pdf', model)).toThrow(PdfStructuredExportHostUnavailableError);
  });

  it('forwards the title and model unchanged and returns the owned byte view', () => {
    let receivedTitle: string | undefined;
    let receivedModel: PdfDocumentModel | undefined;
    const host: PdfStructuredExportHost = {
      buildStructuredPdfBytes: (title, value) => {
        receivedTitle = title;
        receivedModel = value;
        return bytes;
      },
    };
    release = registerPdfStructuredExportHost(host);

    expect(buildStructuredPdfBytes('safe.pdf', model)).toBe(bytes);
    expect(receivedTitle).toBe('safe.pdf');
    expect(receivedModel).toBe(model);
  });

  it('rejects a second registration without replacing the active host', () => {
    let calls = 0;
    release = registerPdfStructuredExportHost({ buildStructuredPdfBytes: () => { calls += 1; return bytes; } });

    expect(() => registerPdfStructuredExportHost({ buildStructuredPdfBytes: () => bytes }))
      .toThrow('pdf_structured_export_host_already_registered');
    expect(buildStructuredPdfBytes('safe.pdf', model)).toBe(bytes);
    expect(calls).toBe(1);
  });

  it('validates inputs and rejects empty or non-byte host output', () => {
    release = registerPdfStructuredExportHost({ buildStructuredPdfBytes: () => new Uint8Array() });
    expect(() => buildStructuredPdfBytes('safe.pdf', null as unknown as PdfDocumentModel))
      .toThrow('pdf_structured_export_input_invalid');
    expect(() => buildStructuredPdfBytes('safe.pdf', model)).toThrow('pdf_structured_export_output_invalid');

    release();
    release = registerPdfStructuredExportHost({
      buildStructuredPdfBytes: () => [] as unknown as Uint8Array,
    });
    expect(() => buildStructuredPdfBytes('safe.pdf', model)).toThrow('pdf_structured_export_output_invalid');
  });
});
