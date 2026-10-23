// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Open-Core Vault attachments are written natively; browser = download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultFile } from '../../../shared/contracts/workspace';
import { deliverVaultAttachment } from '../apps/vault/vaultAttachmentDelivery';

const TOKEN = '11111111-2222-4333-8444-555555555555';

const FILE = {
  id: 'vault-file-1',
  name: 'charta.png',
  sourceType: 'attachment',
  payloadDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
} as VaultFile;

interface InvokeCall { command: string; args?: Record<string, unknown> }

function desktop(): InvokeCall[] {
  const calls: InvokeCall[] = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    core: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command === 'vgt_shell_save_dialog') {
          const request = args?.request as { suggestedName?: string } | undefined;
          return { token: TOKEN, file_name: request?.suggestedName ?? 'charta.png' };
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

describe('Open-Core Vault attachment delivery', () => {
  it('writes the attachment through the native save dialog with its real extension', async () => {
    const calls = desktop();
    const result = await deliverVaultAttachment(FILE);
    expect(result).toEqual({ fileName: 'charta.png', mode: 'file' });
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    expect(calls[0]!.args!.request).toMatchObject({ suggestedName: 'charta.png', extensions: ['png'] });
    expect(anchorClicks).toBe(0);
  });

  it('falls back to a browser download without a native bridge', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vault-attachment');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await deliverVaultAttachment(FILE);
    expect(result.mode).toBe('download');
    expect(anchorClicks).toBe(1);
  });

  it('names a missing payload instead of silently doing nothing', async () => {
    await expect(deliverVaultAttachment({ ...FILE, payloadDataUrl: undefined } as VaultFile))
      .rejects.toThrow(/payload is unavailable/u);
  });
});
