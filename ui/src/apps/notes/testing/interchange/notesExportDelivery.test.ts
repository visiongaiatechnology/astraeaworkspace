// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Notes exports are written natively; the browser fallback is a download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotePage } from '../../../../shared/contracts/workspace';
import { exportNoteHtml, exportNoteMarkdown } from '../../interchange/notesExport';

const TOKEN = '11111111-2222-4333-8444-555555555555';

function page(): NotePage {
  return {
    id: 'note-1',
    title: 'Besprechung',
    content: '# Agenda\n- Punkt eins',
    tags: ['team'],
    last_modified: 0,
  } as NotePage;
}

interface InvokeCall { command: string; args?: Record<string, unknown> }

function desktop(): InvokeCall[] {
  const calls: InvokeCall[] = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    core: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command === 'vgt_shell_save_dialog') {
          const request = args?.request as { suggestedName?: string } | undefined;
          return { token: TOKEN, file_name: request?.suggestedName ?? 'note.md' };
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

describe('Notes export delivery', () => {
  it('writes Markdown through the native save dialog with the real extension', async () => {
    const calls = desktop();
    const result = await exportNoteMarkdown(page());
    expect(result).toEqual({ fileName: 'Besprechung.md', mode: 'file' });
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    const save = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(save.suggestedName).toBe('Besprechung.md');
    expect(save.extensions).toEqual(['md']);
    expect(anchorClicks).toBe(0);
  });

  it('writes HTML as a native file as well', async () => {
    const calls = desktop();
    const result = await exportNoteHtml(page());
    expect(result.mode).toBe('file');
    const save = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(save.suggestedName).toBe('Besprechung.html');
    expect(save.extensions).toEqual(['html']);
  });

  it('falls back to a browser download in the browser build', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:note-md');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await exportNoteMarkdown(page());
    expect(result.mode).toBe('download');
    expect(anchorClicks).toBe(1);
  });

  it('does not report success when the native write fails', async () => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: {
        invoke: async (command: string) => {
          if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Besprechung.md' };
          throw new Error('Sandbox refused the bytes');
        },
      },
    };
    await expect(exportNoteMarkdown(page())).rejects.toThrow(/konnte nicht geschrieben werden/u);
    expect(anchorClicks).toBe(0);
  });
});
