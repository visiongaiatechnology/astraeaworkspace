// @vitest-environment happy-dom
// STATUS: PLATIN — native round 6: an export is written by the desktop, not by a download link
//
// Native E2E S14: the toast said "Exported Office interoperability file: Untitled-Writer.docx"
// and no usable file appeared. The package itself is valid (a real ZIP with valid OOXML parts);
// what failed was the delivery — a synthetic `<a download>` inside the WebView. On the desktop
// the bytes now travel through the two commands that exist for exactly this: the save dialog
// grants a destination token, and the import sandbox validates and commits the file atomically.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SHELL_NATIVE_POLICY, nativeShellSaveBytes } from '../../../../../platform/native/nativeShellServices';

const TOKEN = '11111111-2222-4333-8444-555555555555';

function desktop(invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.restoreAllMocks();
});

describe('nativeShellSaveBytes', () => {
  it('does nothing outside the desktop application', async () => {
    await expect(nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, new Uint8Array([1]))).resolves.toBeNull();
  });

  it('writes through the save grant and the atomic export, then reports the granted name', async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    desktop(async (command, args) => {
      calls.push({ command, args });
      if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Bericht.docx' };
      return { contract: 'VGT-IMPORT-SANDBOX-3' };
    });

    const name = await nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, new Uint8Array([60, 97, 62]), {
      suggestedName: 'Bericht.docx',
      extensions: ['docx'],
    });

    expect(name, 'der vergebene Dateiname ist das Ergebnis').toBe('Bericht.docx');
    expect(calls.map((call) => call.command)).toEqual([
      'vgt_shell_save_dialog',
      'vgt_import_sandbox_atomic_export',
    ]);
    // Native round 41: the dialog must receive a concrete name and its file type, otherwise the
    // export lands on disk without an extension.
    const saveRequest = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(saveRequest.suggestedName).toBe('Bericht.docx');
    expect(saveRequest.extensions).toEqual(['docx']);
    const request = calls[1]!.args!.request as { fileName: string; saveToken: string; bytesBase64: string };
    expect(request.fileName).toBe('Bericht.docx');
    expect(request.saveToken).toBe(TOKEN);
    // `btoa('<a>')` — the bytes are transported, not re-encoded by hand.
    expect(request.bytesBase64).toBe('PGE+');
  });

  it('reports a refused overwrite in words a user can act on', async () => {
    desktop(async (command) => {
      if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Bericht.docx' };
      throw 'Atomic export refuses to replace an existing file';
    });

    await expect(nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, new Uint8Array([1])))
      .rejects.toThrow(/existiert bereits/u);
  });

  it('never writes when the save dialog returns no destination', async () => {
    const invoke = vi.fn(async () => { throw 'Native desktop service rejected the request'; });
    desktop(invoke);
    await expect(nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, new Uint8Array([1])))
      .rejects.toThrow(/keine Datei geschrieben/u);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('refuses to hand an empty payload to the desktop', async () => {
    desktop(async () => ({ token: TOKEN, file_name: 'Bericht.docx' }));
    await expect(nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, new Uint8Array()))
      .rejects.toThrow(/keine Daten/u);
  });

  it('rejects an extension-less grant instead of writing a file without a type', async () => {
    desktop(async (command) => {
      if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Bericht' };
      return { contract: 'VGT-IMPORT-SANDBOX-3' };
    });
    await expect(nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, new Uint8Array([1]), { suggestedName: 'Bericht.docx', extensions: ['docx'] }))
      .rejects.toThrow(/keinen Dateityp/u);
  });

  it('validates the requested name and file types before it reaches the desktop', async () => {
    const invoke = vi.fn(async () => ({ token: TOKEN, file_name: 'Bericht.docx' }));
    desktop(invoke);
    await expect(nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, new Uint8Array([1]), { suggestedName: '../evil.docx', extensions: ['docx'] }))
      .rejects.toThrow(/file name is invalid/u);
    await expect(nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, new Uint8Array([1]), { suggestedName: 'Bericht.docx', extensions: ['do cx'] }))
      .rejects.toThrow(/file type is invalid/u);
    expect(invoke).not.toHaveBeenCalled();
  });
});
