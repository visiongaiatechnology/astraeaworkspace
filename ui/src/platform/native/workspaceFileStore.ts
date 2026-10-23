// STATUS: PLATIN — native Workspace document file store bridge (Release Beta 0.1).
//
// Release blocker #1: a "saved" indicator must only appear after a real document file was written,
// not merely after an IndexedDB transaction. This bridge is the UI side of the native atomic store
// in `crates/vgt-desktop/src/workspace_store_bridge.rs`; it is optional and returns `null`/`false`
// outside the desktop application so the browser build keeps its existing persistence.
import { invokeNative, isNativeDesktop } from './nativeBridge';

export interface WorkspaceFileStoreEntry {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly modifiedAtMs: number;
}

export interface WorkspaceFileStoreListing {
  readonly rootPath: string;
  readonly files: readonly WorkspaceFileStoreEntry[];
}

export interface WorkspaceFileStoreWriteResult {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly modifiedAtMs: number;
}

export interface WorkspaceFileStoreReadResult extends WorkspaceFileStoreWriteResult {
  readonly bytes: Uint8Array;
}

const MAX_STORE_FILE_BYTES = 128 * 1024 * 1024;
const MAX_STORE_LIST_ENTRIES = 4_096;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/u;
const FILE_NAME_PATTERN = /^doc-[0-9a-f]{32}\.vwc$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export function workspaceFileStoreSupported(): boolean {
  return isNativeDesktop();
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validateDocumentId(documentId: string): void {
  if (!DOCUMENT_ID_PATTERN.test(documentId)) throw new Error('Workspace document id is invalid');
}

function validateFileName(fileName: string): void {
  if (!FILE_NAME_PATTERN.test(fileName)) throw new Error('Workspace store file name is invalid');
}

function sanitizeWriteResult(raw: unknown): WorkspaceFileStoreWriteResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const fileName = safeString(record.file_name, 64);
  const sha256 = safeString(record.sha256, 64);
  const sizeBytes = safeCount(record.size_bytes);
  const modifiedAtMs = safeCount(record.modified_at_ms);
  if (!fileName || !FILE_NAME_PATTERN.test(fileName)) return null;
  if (!sha256 || !SHA256_PATTERN.test(sha256)) return null;
  return { fileName, sizeBytes, sha256, modifiedAtMs };
}

export async function workspaceFileStoreList(): Promise<WorkspaceFileStoreListing | null> {
  if (!isNativeDesktop()) return null;
  try {
    const raw = await invokeNative<unknown>('vgt_workspace_store_list');
    if (typeof raw !== 'object' || raw === null) return null;
    const record = raw as Record<string, unknown>;
    const rootPath = safeString(record.root_path, 4_096);
    const rawFiles = record.files;
    if (!rootPath || !Array.isArray(rawFiles)) return null;
    const files: WorkspaceFileStoreEntry[] = [];
    for (const entry of rawFiles.slice(0, MAX_STORE_LIST_ENTRIES)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const file = entry as Record<string, unknown>;
      const fileName = safeString(file.file_name, 64);
      const sizeBytes = safeCount(file.size_bytes);
      if (!fileName || !FILE_NAME_PATTERN.test(fileName) || sizeBytes > MAX_STORE_FILE_BYTES) continue;
      files.push({ fileName, sizeBytes, modifiedAtMs: safeCount(file.modified_at_ms) });
    }
    return { rootPath, files };
  } catch {
    return null;
  }
}

export async function workspaceFileStoreWrite(
  documentId: string,
  bytes: Uint8Array,
): Promise<WorkspaceFileStoreWriteResult | null> {
  if (!isNativeDesktop()) return null;
  validateDocumentId(documentId);
  if (bytes.byteLength === 0) throw new Error('Workspace document payload is empty');
  if (bytes.byteLength > MAX_STORE_FILE_BYTES) throw new Error('Workspace document payload is too large');
  const raw = await invokeNative<unknown>('vgt_workspace_store_write', {
    request: { document_id: documentId, bytes_base64: bytesToBase64(bytes) },
  });
  const result = sanitizeWriteResult(raw);
  if (!result) throw new Error('Workspace store write returned an invalid confirmation');
  if (result.sizeBytes !== bytes.byteLength) throw new Error('Workspace store wrote a different byte count');
  return result;
}

export async function workspaceFileStoreRead(fileName: string): Promise<WorkspaceFileStoreReadResult | null> {
  if (!isNativeDesktop()) return null;
  validateFileName(fileName);
  const raw = await invokeNative<unknown>('vgt_workspace_store_read', { request: { file_name: fileName } });
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const confirmedName = safeString(record.file_name, 64);
  const bytesBase64 = safeString(record.bytes_base64, Math.ceil((MAX_STORE_FILE_BYTES * 4) / 3) + 8);
  const sizeBytes = safeCount(record.size_bytes);
  const sha256 = safeString(record.sha256, 64);
  if (!confirmedName || confirmedName !== fileName || !bytesBase64 || !sha256 || !SHA256_PATTERN.test(sha256)) return null;
  if (sizeBytes <= 0 || sizeBytes > MAX_STORE_FILE_BYTES) return null;
  const bytes = base64ToBytes(bytesBase64);
  if (bytes.byteLength !== sizeBytes) throw new Error('Workspace store read returned a different byte count');
  return { fileName: confirmedName, sizeBytes, sha256, modifiedAtMs: safeCount(record.modified_at_ms), bytes };
}

export async function workspaceFileStoreRemove(fileName: string): Promise<boolean> {
  if (!isNativeDesktop()) return false;
  try {
    validateFileName(fileName);
    const raw = await invokeNative<unknown>('vgt_workspace_store_remove', { request: { file_name: fileName } });
    return raw === true;
  } catch {
    return false;
  }
}

export async function workspaceFileStoreReveal(): Promise<boolean> {
  if (!isNativeDesktop()) return false;
  try {
    return (await invokeNative<unknown>('vgt_workspace_store_reveal')) === true;
  } catch {
    return false;
  }
}
