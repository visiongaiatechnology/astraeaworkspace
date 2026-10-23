// @vitest-environment happy-dom
// STATUS: PLATIN — direct contracts for registration, fail-closed resolution, and provider ownership.
//
// Release Beta 0.1 (export integrity): `downloadDocumentPdf` must write a real file on the desktop and
// only report success after the save dialog + atomic sandbox export confirmed it; it must refuse
// non-PDF bytes before any dialog; the browser keeps the download-link fallback (mode `download`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertPdfExportArtifact,
  buildDocumentPdf,
  DocumentPdfExporterUnavailableError,
  downloadDocumentPdf,
  registerDocumentPdfExporter,
  type DocumentPdfExportRequest,
} from '../../../platform/rendering/documentPdfExport';

const request: DocumentPdfExportRequest = {
  title: 'Boundary contract',
  paragraphs: [],
  config: {
    paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
    showPageNumbers: false, headerText: '', footerText: '',
  },
};

const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');
const SAVE_TOKEN = '11111111-2222-4333-8444-555555555555';

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function desktop(invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

describe('document PDF export port', () => {
  it('fails closed before the host installs an exporter', () => {
    expect(() => buildDocumentPdf(request)).toThrow(DocumentPdfExporterUnavailableError);
  });

  it('sends the canonical request to the registered exporter and returns its bytes', () => {
    const expected = new Uint8Array([37, 80, 68, 70]);
    let received: DocumentPdfExportRequest | undefined;
    release = registerDocumentPdfExporter((value) => { received = value; return expected; });

    expect(buildDocumentPdf(request)).toBe(expected);
    expect(received).toBe(request);
  });

  it('rejects a second host and does not replace the active exporter', () => {
    const expected = new Uint8Array([1]);
    release = registerDocumentPdfExporter(() => expected);

    expect(() => registerDocumentPdfExporter(() => new Uint8Array([2])))
      .toThrow('document_pdf_exporter_already_registered');
    expect(buildDocumentPdf(request)).toBe(expected);
  });

  it('rejects non-byte provider results', () => {
    release = registerDocumentPdfExporter(() => 'not bytes' as unknown as Uint8Array);
    expect(() => buildDocumentPdf(request)).toThrow('document_pdf_export_result_invalid');
  });
});

describe('downloadDocumentPdf — export integrity', () => {
  it('refuses a non-PDF artifact before any save dialog opens', async () => {
    release = registerDocumentPdfExporter(() => new TextEncoder().encode('MZ not a pdf'));
    const invoke = vi.fn(async () => ({ token: SAVE_TOKEN, file_name: 'x.pdf' }));
    desktop(invoke);

    await expect(downloadDocumentPdf(request)).rejects.toThrow('document_pdf_signature_missing');
    expect(invoke).not.toHaveBeenCalled();
    expect(assertPdfExportArtifact).toBeTypeOf('function');
  });

  it('writes through the save dialog + atomic sandbox export and reports mode `file`', async () => {
    release = registerDocumentPdfExporter(() => PDF_BYTES);
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    desktop(async (command, args) => {
      calls.push({ command, args });
      if (command === 'vgt_shell_save_dialog') return { token: SAVE_TOKEN, file_name: 'Boundary_contract.pdf' };
      return { contract: 'VGT-IMPORT-SANDBOX-3', status: 'committed' };
    });

    const result = await downloadDocumentPdf(request);

    expect(result).toEqual({ fileName: 'Boundary_contract.pdf', mode: 'file' });
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    const dialogRequest = calls[0]!.args!.request as { suggestedName: string; extensions: string[] };
    expect(dialogRequest.suggestedName).toBe('Boundary_contract.pdf');
    expect(dialogRequest.extensions).toEqual(['pdf']);
    const exportRequest = calls[1]!.args!.request as { fileName: string; saveToken: string; bytesBase64: string };
    expect(exportRequest.fileName).toBe('Boundary_contract.pdf');
    expect(exportRequest.saveToken).toBe(SAVE_TOKEN);
    expect(exportRequest.bytesBase64.length).toBeGreaterThan(0);
  });

  it('reports a refused desktop save as an error instead of silently downloading', async () => {
    release = registerDocumentPdfExporter(() => PDF_BYTES);
    desktop(async (command) => {
      if (command === 'vgt_shell_save_dialog') throw new Error('Native save dialog unavailable');
      return { contract: 'VGT-IMPORT-SANDBOX-3' };
    });

    await expect(downloadDocumentPdf(request)).rejects.toThrow(/keine Datei geschrieben/u);
  });

  it('in the browser reports mode `download` — a started download is not a confirmed file', async () => {
    release = registerDocumentPdfExporter(() => PDF_BYTES);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });

    const result = await downloadDocumentPdf(request);

    expect(result).toEqual({ fileName: 'Boundary_contract.pdf', mode: 'download' });
  });
});
