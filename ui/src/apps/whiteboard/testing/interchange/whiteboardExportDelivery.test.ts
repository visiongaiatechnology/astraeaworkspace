// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Whiteboard exports are written natively; browser = download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadWhiteboardBytes, downloadWhiteboardText } from '../../interchange/whiteboardExportImportEngine';
import { whiteboardDeliveryText } from '../../interchange/whiteboardExportStatus';

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
          return { token: TOKEN, file_name: request?.suggestedName ?? 'board.svg' };
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

describe('Whiteboard export delivery', () => {
  it('writes the SVG through the native save dialog', async () => {
    const calls = desktop();
    const result = await downloadWhiteboardText('<svg/>', 'image/svg+xml;charset=utf-8', 'board.svg');
    expect(result.mode).toBe('file');
    expect(calls[0]!.args!.request).toMatchObject({ suggestedName: 'board.svg', extensions: ['svg'] });
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    expect(anchorClicks).toBe(0);
  });

  it('writes the PDF through the native save dialog', async () => {
    const calls = desktop();
    const result = await downloadWhiteboardBytes(new TextEncoder().encode('%PDF-1.4'), 'application/pdf', 'board.pdf');
    expect(result.mode).toBe('file');
    expect(calls[0]!.args!.request).toMatchObject({ suggestedName: 'board.pdf', extensions: ['pdf'] });
  });

  it('falls back to a browser download in the browser build', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:whiteboard');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await downloadWhiteboardBytes(new TextEncoder().encode('data'), 'application/pdf', 'board.pdf');
    expect(result.mode).toBe('download');
    expect(anchorClicks).toBe(1);
    expect(whiteboardDeliveryText(result)).toContain('Download started');
  });
});
