// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Publish writes through the native save path; browser = download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverPublishBytes, deliverPublishPdf } from '../../../interop/publishPdfDelivery';

const TOKEN = '11111111-2222-4333-8444-555555555555';

interface InvokeCall { command: string; args?: Record<string, unknown> }

function desktop(): InvokeCall[] {
  const calls: InvokeCall[] = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    core: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command === 'vgt_shell_save_dialog') {
          const request = args?.request as { suggestedName?: string } | undefined;
          return { token: TOKEN, file_name: request?.suggestedName ?? 'publication.pdf' };
        }
        return { contract: 'VGT-IMPORT-SANDBOX-3' };
      },
    },
  };
  return calls;
}

let anchorClicks = 0;

beforeEach(() => {
  anchorClicks = 0;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { anchorClicks += 1; });
});

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.restoreAllMocks();
});

describe('Publish export delivery', () => {
  it('writes a PDF/X artifact through the native save dialog', async () => {
    const calls = desktop();
    const result = await deliverPublishPdf(new TextEncoder().encode('%PDF-1.4'), 'Broschuere-pdfx4.pdf');
    expect(result).toEqual({ fileName: 'Broschuere-pdfx4.pdf', mode: 'file' });
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    expect(calls[0]!.args!.request).toMatchObject({ suggestedName: 'Broschuere-pdfx4.pdf', extensions: ['pdf'] });
    expect(anchorClicks).toBe(0);
  });

  it('writes EPUB package bytes with the real extension', async () => {
    const calls = desktop();
    const result = await deliverPublishBytes(new TextEncoder().encode('PK'), 'Broschuere.epub', 'application/epub+zip');
    expect(result.mode).toBe('file');
    expect(calls[0]!.args!.request).toMatchObject({ suggestedName: 'Broschuere.epub', extensions: ['epub'] });
  });

  it('falls back to a browser download without a native bridge', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:publish');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await deliverPublishBytes(new TextEncoder().encode('PK'), 'Broschuere.html', 'text/html;charset=utf-8');
    expect(result.mode).toBe('download');
    expect(anchorClicks).toBe(1);
  });
});
