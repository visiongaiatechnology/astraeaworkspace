// @vitest-environment happy-dom
// STATUS: PLATIN — Release Beta 0.1: native Workspace file store bridge (real files, honest status).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  workspaceFileStoreList,
  workspaceFileStoreRead,
  workspaceFileStoreRemove,
  workspaceFileStoreReveal,
  workspaceFileStoreSupported,
  workspaceFileStoreWrite,
} from '../workspaceFileStore';

const FILE_NAME = 'doc-0123456789abcdef0123456789abcdef.vwc';
const SHA = '5dee65c5d8c5c6a144fb18f2e267025c2ca15a927d6c60123f9b7c113eff1e4e';

function desktop(invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
});

describe('Workspace file store bridge (release integrity)', () => {
  it('is optional outside the desktop application', async () => {
    expect(workspaceFileStoreSupported()).toBe(false);
    await expect(workspaceFileStoreList()).resolves.toBeNull();
    await expect(workspaceFileStoreWrite('doc-1', new Uint8Array([1]))).resolves.toBeNull();
    await expect(workspaceFileStoreRead(FILE_NAME)).resolves.toBeNull();
    await expect(workspaceFileStoreRemove(FILE_NAME)).resolves.toBe(false);
    await expect(workspaceFileStoreReveal()).resolves.toBe(false);
  });

  it('writes the document and confirms the exact byte count before the UI may say saved', async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    desktop(async (command, args) => {
      calls.push({ command, args });
      return { file_name: FILE_NAME, size_bytes: 3, sha256: SHA, modified_at_ms: 1_700_000_000_000 };
    });
    const result = await workspaceFileStoreWrite('doc-123:abc', new Uint8Array([1, 2, 3]));
    expect(result).toEqual({ fileName: FILE_NAME, sizeBytes: 3, sha256: SHA, modifiedAtMs: 1_700_000_000_000 });
    expect(calls[0]!.command).toBe('vgt_workspace_store_write');
    const request = calls[0]!.args!.request as { document_id: string; bytes_base64: string };
    expect(request.document_id).toBe('doc-123:abc');
    expect(request.bytes_base64).toBe('AQID');
  });

  it('rejects invalid ids, empty payloads and confirmation mismatches instead of claiming success', async () => {
    const invoke = vi.fn(async () => ({ file_name: FILE_NAME, size_bytes: 2, sha256: SHA, modified_at_ms: 1 }));
    desktop(invoke);
    await expect(workspaceFileStoreWrite('../evil', new Uint8Array([1]))).rejects.toThrow(/document id is invalid/u);
    await expect(workspaceFileStoreWrite('doc-1', new Uint8Array())).rejects.toThrow(/payload is empty/u);
    // The store claims two bytes although three were sent: this must be a visible failure, not "saved".
    await expect(workspaceFileStoreWrite('doc-1', new Uint8Array([1, 2, 3]))).rejects.toThrow(/different byte count/u);
    // A response without a valid sha256/name is rejected as well.
    desktop(async () => ({ file_name: 'evil.exe', size_bytes: 3, sha256: 'x', modified_at_ms: 1 }));
    await expect(workspaceFileStoreWrite('doc-1', new Uint8Array([1, 2, 3]))).rejects.toThrow(/invalid confirmation/u);
  });

  it('lists only valid store files and sanitizes the listing', async () => {
    desktop(async (command) => {
      expect(command).toBe('vgt_workspace_store_list');
      return {
        root_path: 'C:\\Data\\Astraea\\workspace-store',
        files: [
          { file_name: FILE_NAME, size_bytes: 100, modified_at_ms: 5 },
          { file_name: 'evil.exe', size_bytes: 5, modified_at_ms: 9 },
          { file_name: 'doc-ffffffffffffffffffffffffffffffff.vwc', size_bytes: 0, modified_at_ms: 1 },
          'garbage',
        ],
      };
    });
    const listing = await workspaceFileStoreList();
    expect(listing?.rootPath).toBe('C:\\Data\\Astraea\\workspace-store');
    expect(listing?.files.map((file) => file.fileName)).toEqual([FILE_NAME, 'doc-ffffffffffffffffffffffffffffffff.vwc']);
  });

  it('reads, decodes and cross-checks a stored document', async () => {
    const bytes = new Uint8Array([86, 87, 67, 49]); // "VWC1"
    desktop(async (command, args) => {
      expect(command).toBe('vgt_workspace_store_read');
      expect((args!.request as { file_name: string }).file_name).toBe(FILE_NAME);
      return { file_name: FILE_NAME, bytes_base64: btoa('VWC1'), size_bytes: 4, sha256: SHA, modified_at_ms: 7 };
    });
    const result = await workspaceFileStoreRead(FILE_NAME);
    expect(result?.fileName).toBe(FILE_NAME);
    expect(Array.from(result!.bytes)).toEqual(Array.from(bytes));
    expect(result?.sizeBytes).toBe(4);

    desktop(async () => ({ file_name: FILE_NAME, bytes_base64: btoa('VWC1'), size_bytes: 99, sha256: SHA, modified_at_ms: 7 }));
    await expect(workspaceFileStoreRead(FILE_NAME)).rejects.toThrow(/different byte count/u);
  });

  it('rejects foreign file names before they reach the native store', async () => {
    const invoke = vi.fn(async () => ({ file_name: FILE_NAME }));
    desktop(invoke);
    await expect(workspaceFileStoreRead('../doc-0123456789abcdef0123456789abcdef.vwc')).rejects.toThrow(/file name is invalid/u);
    await expect(workspaceFileStoreRemove('C:\\Windows\\system32\\x.vwc')).resolves.toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
