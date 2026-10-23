// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Insight exports are written natively; browser = download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadInsightBytes } from '../../export/insightExportEngine';
import { insightDeliveryText } from '../../export/insightExportStatus';

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
          return { token: TOKEN, file_name: request?.suggestedName ?? 'insight.csv' };
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

describe('Insight export delivery', () => {
  it('writes the CSV export through the native save dialog', async () => {
    const calls = desktop();
    const result = await downloadInsightBytes(new TextEncoder().encode('a,b\n1,2'), 'text/csv;charset=utf-8', 'umsatz.csv');
    expect(result).toEqual({ fileName: 'umsatz.csv', mode: 'file' });
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    expect(calls[0]!.args!.request).toMatchObject({ suggestedName: 'umsatz.csv', extensions: ['csv'] });
    expect(anchorClicks).toBe(0);
  });

  it('rejects a PDF whose signature is wrong before any dialog', async () => {
    const calls = desktop();
    await expect(downloadInsightBytes(new TextEncoder().encode('not a pdf'), 'application/pdf', 'report.pdf'))
      .rejects.toThrow(/document_pdf_signature_missing/u);
    expect(calls).toHaveLength(0);
  });

  it('falls back to a browser download without a native bridge', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:insight');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await downloadInsightBytes(new TextEncoder().encode('a,b'), 'text/csv;charset=utf-8', 'umsatz.csv');
    expect(result.mode).toBe('download');
    expect(anchorClicks).toBe(1);
    expect(insightDeliveryText(result)).toContain('Download started');
  });
});
