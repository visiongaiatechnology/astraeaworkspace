// @vitest-environment happy-dom
// STATUS: PLATIN — Release Beta 0.1: export delivery proves file / download / failure are distinct.
//
// The release blocker is "export reports success but produces a broken file". These tests pin the one
// delivery rule: native writes are confirmed through the save dialog + atomic export, the browser
// fallback is explicitly a download, oversized payloads are rejected by name before the IPC, and a
// cancelled dialog is distinguishable from a write failure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXPORT_DELIVERY_MAX_BASE64_BYTES,
  ExportDeliveryError,
  assertExportDeliveryByteBudget,
  decodeExportDataUrl,
  deliverExportBytes,
  deliverExportDataUrl,
  deliverExportText,
  estimateExportBase64Bytes,
  isExportDeliveryAbort,
} from '../exportDelivery';

const TOKEN = '11111111-2222-4333-8444-555555555555';

interface InvokeCall { command: string; args?: Record<string, unknown> }
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function desktop(invoke: Invoke): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

function removeDesktop(): void {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
}

function writeOptions(overrides: Record<string, unknown> = {}) {
  return {
    suggestedName: 'Bericht.csv',
    extensions: ['csv'],
    mimeType: 'text/csv;charset=utf-8',
    ...overrides,
  };
}

let anchorClicks = 0;

beforeEach(() => {
  anchorClicks = 0;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { anchorClicks += 1; });
});

afterEach(() => {
  removeDesktop();
  vi.restoreAllMocks();
});

describe('export delivery — native desktop', () => {
  it('confirms the file only after the save dialog and the atomic sandbox export succeeded', async () => {
    const calls: InvokeCall[] = [];
    desktop(async (command, args) => {
      calls.push({ command, args });
      if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Bericht.csv' };
      return { contract: 'VGT-IMPORT-SANDBOX-3' };
    });

    const result = await deliverExportBytes(new TextEncoder().encode('a,b\n1,2'), writeOptions());

    expect(result).toEqual({ fileName: 'Bericht.csv', mode: 'file' });
    expect(calls.map((call) => call.command)).toEqual([
      'vgt_shell_save_dialog',
      'vgt_import_sandbox_atomic_export',
    ]);
    // The dialog receives a concrete name with the declared extension and the extension whitelist.
    const saveRequest = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(saveRequest.suggestedName).toBe('Bericht.csv');
    expect(saveRequest.extensions).toEqual(['csv']);
    // The write receives the granted name, the one-shot token and the actual bytes.
    const writeRequest = calls[1]!.args!.request as { fileName: string; saveToken: string; bytesBase64: string };
    expect(writeRequest.fileName).toBe('Bericht.csv');
    expect(writeRequest.saveToken).toBe(TOKEN);
    expect(writeRequest.bytesBase64).toBe(btoa('a,b\n1,2'));
    // A confirmed native write never falls back to a browser download.
    expect(anchorClicks).toBe(0);
  });

  it('does not report success when the atomic write fails', async () => {
    const calls: string[] = [];
    desktop(async (command) => {
      calls.push(command);
      if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Bericht.csv' };
      throw new Error('Sandbox refused the bytes');
    });

    await expect(deliverExportBytes(new Uint8Array([1, 2, 3]), writeOptions()))
      .rejects.toThrow(/konnte nicht geschrieben werden/);
    expect(calls).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    expect(anchorClicks).toBe(0);
  });

  it('passes a cancelled dialog through and classifies it as an abort', async () => {
    desktop(async () => { throw new Error('Native desktop service rejected the request'); });

    const failure = deliverExportBytes(new Uint8Array([1]), writeOptions());
    await expect(failure).rejects.toThrow(/keine Datei geschrieben/u);
    await failure.catch((error: unknown) => {
      expect(isExportDeliveryAbort(error)).toBe(true);
    });
  });

  it('does not classify a real write failure as an abort', async () => {
    desktop(async (command) => {
      if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Bericht.csv' };
      throw new Error('Disk full');
    });
    await deliverExportBytes(new Uint8Array([1]), writeOptions()).catch((error: unknown) => {
      expect(isExportDeliveryAbort(error)).toBe(false);
    });
  });

  it('runs the artifact preflight before opening any dialog', async () => {
    const invoke = vi.fn(async () => ({ token: TOKEN, file_name: 'Bericht.csv' }));
    desktop(invoke);
    await expect(deliverExportBytes(new Uint8Array([1, 2, 3]), writeOptions({
      assertArtifact: () => { throw new Error('signature missing'); },
    }))).rejects.toThrow(/signature missing/u);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects a too-large payload by name before the native transport', async () => {
    const invoke = vi.fn(async () => ({ token: TOKEN, file_name: 'Bericht.csv' }));
    desktop(invoke);
    const failure = deliverExportBytes(new Uint8Array(100), writeOptions({ maxBase64Bytes: 64 }));
    await expect(failure).rejects.toBeInstanceOf(ExportDeliveryError);
    await failure.catch((error: unknown) => {
      expect((error as ExportDeliveryError).code).toBe('too-large');
      expect((error as Error).message).toMatch(/zu groß für den sicheren Export/u);
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('bounds the default native payload at the documented 90 MB base64 ceiling', () => {
    expect(EXPORT_DELIVERY_MAX_BASE64_BYTES).toBe(90 * 1024 * 1024);
    expect(estimateExportBase64Bytes(3)).toBe(4);
    // Synthetic boundary: a ceiling of 4 bytes rejects anything above 3 raw bytes.
    expect(() => assertExportDeliveryByteBudget(new Uint8Array(3), 4)).not.toThrow();
    expect(() => assertExportDeliveryByteBudget(new Uint8Array(4), 4)).toThrow(/zu groß/u);
  });
});

describe('export delivery — browser fallback', () => {
  it('falls back to a download and reports mode "download", never a save', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:present-export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const result = await deliverExportText('hello', writeOptions({ suggestedName: 'Notiz.txt', extensions: ['txt'], mimeType: 'text/plain;charset=utf-8' }));

    expect(result).toEqual({ fileName: 'Notiz.txt', mode: 'download' });
    expect(anchorClicks).toBe(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('text/plain;charset=utf-8');
  });

  it('appends the declared extension instead of downloading a type-less file', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await deliverExportBytes(new Uint8Array([1]), writeOptions({
      suggestedName: 'Bericht',
      extensions: ['csv'],
    }));
    expect(result.fileName).toBe('Bericht.csv');
    expect(result.mode).toBe('download');
  });

  it('rejects invalid names, types and empty payloads by name', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    await expect(deliverExportBytes(new Uint8Array([1]), writeOptions({ suggestedName: '../evil.csv' })))
      .rejects.toMatchObject({ code: 'invalid-name' });
    await expect(deliverExportBytes(new Uint8Array([1]), writeOptions({ extensions: ['do cx'] })))
      .rejects.toMatchObject({ code: 'invalid-type' });
    await expect(deliverExportBytes(new Uint8Array([]), writeOptions()))
      .rejects.toMatchObject({ code: 'empty' });
    await expect(deliverExportBytes(new Uint8Array([1]), writeOptions({ mimeType: 'not-a-mime' })))
      .rejects.toMatchObject({ code: 'invalid-type' });
    expect(anchorClicks).toBe(0);
  });
});

describe('export delivery — data URLs', () => {
  it('decodes a base64 attachment and keeps its MIME type', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:attachment');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const dataUrl = `data:application/pdf;base64,${btoa('%PDF-1.4 test')}`;
    const result = await deliverExportDataUrl(dataUrl, {
      suggestedName: 'attachment.pdf',
      extensions: ['pdf'],
    });
    expect(result).toEqual({ fileName: 'attachment.pdf', mode: 'download' });
    expect(decodeExportDataUrl(dataUrl).mimeType).toBe('application/pdf');
  });

  it('rejects malformed or oversized data URLs', async () => {
    expect(() => decodeExportDataUrl('not-a-data-url')).toThrow(/Base64|ungültig/u);
    expect(() => decodeExportDataUrl('data:text/plain;base64,%%%')).toThrow(/Base64/u);
    expect(() => decodeExportDataUrl(`data:text/plain;base64,${btoa('abc')}`, 2)).toThrow(/zu groß/u);
  });
});
