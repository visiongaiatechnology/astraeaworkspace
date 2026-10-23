// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Draw exports are written natively; browser = download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverDrawExport, drawDeliveryText } from '../../canvas/drawExportDelivery';

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
          return { token: TOKEN, file_name: request?.suggestedName ?? 'drawing.svg' };
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

describe('Draw export delivery', () => {
  it('writes the SVG through the native save dialog with its chart extension', async () => {
    const calls = desktop();
    const result = await deliverDrawExport(['<svg/>'], 'image/svg+xml', 'drawing.svg');
    expect(result.mode).toBe('file');
    expect(calls[0]!.args!.request).toMatchObject({ suggestedName: 'drawing.svg', extensions: ['svg'] });
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    expect(anchorClicks).toBe(0);
    expect(drawDeliveryText(result)).toContain('gespeichert');
  });

  it('delivers binary parts (PDF/PNG) natively', async () => {
    const calls = desktop();
    const bytes = new TextEncoder().encode('%PDF-1.4');
    const result = await deliverDrawExport([bytes], 'application/pdf', 'drawing.pdf');
    expect(result.mode).toBe('file');
    expect(calls[1]!.args!.request).toMatchObject({ fileName: 'drawing.pdf' });
  });

  it('falls back to a browser download in the browser build', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:draw-export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await deliverDrawExport(['<svg/>'], 'image/svg+xml', 'drawing.svg');
    expect(result.mode).toBe('download');
    expect(anchorClicks).toBe(1);
    expect(drawDeliveryText(result)).toContain('Download gestartet');
  });
});
