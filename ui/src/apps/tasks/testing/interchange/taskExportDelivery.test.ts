// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Tasks attachment exports are written natively; browser = download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskAttachment } from '../../../../shared/contracts/work-management/workspaceWork';
import { downloadTaskAttachment } from '../../collaboration/taskAttachments';

const TOKEN = '11111111-2222-4333-8444-555555555555';

const ATTACHMENT: TaskAttachment = {
  id: 'attachment-1',
  name: 'protokoll.txt',
  mimeType: 'text/plain',
  sizeBytes: 5,
  dataUrl: 'data:text/plain;base64,SGVsbG8=',
};

interface InvokeCall { command: string; args?: Record<string, unknown> }

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.restoreAllMocks();
});

describe('Tasks attachment delivery', () => {
  it('writes the attachment through the native save dialog', async () => {
    const calls: InvokeCall[] = [];
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: {
        invoke: async (command: string, args?: Record<string, unknown>) => {
          calls.push({ command, args });
          if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'protokoll.txt' };
          return { contract: 'VGT-IMPORT-SANDBOX-3' };
        },
      },
    };
    await downloadTaskAttachment(ATTACHMENT);
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    const save = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(save.suggestedName).toBe('protokoll.txt');
    expect(save.extensions).toEqual(['txt']);
    const write = calls[1]!.args!.request as { bytesBase64: string };
    expect(write.bytesBase64).toBe(btoa('Hello'));
  });

  it('falls back to a browser download without a native bridge', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:task-attachment');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await downloadTaskAttachment(ATTACHMENT);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('application/octet-stream');
  });

  it('refuses an undecodable attachment by name instead of doing nothing', async () => {
    await expect(downloadTaskAttachment({ ...ATTACHMENT, dataUrl: 'javascript:alert(1)' }))
      .rejects.toThrow(/could not be decoded/u);
  });
});
