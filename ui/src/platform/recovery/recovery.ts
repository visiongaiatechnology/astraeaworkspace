// STATUS: DIAMANT VGT SUPREME — Native encrypted crash-recovery bridge
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import { assertVersionRecoveryPublicId } from './versionRecoveryEngine';
import { stringifyJsonWithinUtf8ByteLimit } from '../diagnostics/boundedJsonStringify';
import { validateWorkspaceDocumentInvariants } from '../workspace/model/workspaceObjectModel';
import { isWorkspaceDocumentKind } from '../../shared/workspace-interaction/workspaceInteractionTypes';

export interface RecoverySnapshotInfo {
  snapshot_id: string;
  created_at: number;
  size_bytes: number;
  requires_pin: boolean;
  requires_password: boolean;
  security_profile: 'STANDARD' | 'PQC' | 'VGT_TOP_SECRET' | string;
  document_kind?: string;
}

export interface RecoveryWriteResponse { success: boolean; snapshot_id: string; created_at: number; }
export interface RecoveryRestoreResponse {
  success: boolean;
  document?: WorkspaceDocument | null;
  error?: string | null;
  requires_pin: boolean;
  requires_password: boolean;
}

const RECOVERY_NATIVE_DEADLINE_MS = 8_000;
const MAX_RECOVERY_SNAPSHOTS = 100;
const MAX_RECOVERY_BYTES = 64 * 1024 * 1024;
const MAX_RECOVERY_CHAIN_BYTES = 64 * 1024 * 1024;

function readDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
      record[key] = descriptor.value as unknown;
    }
    return record;
  } catch {
    return null;
  }
}

function isSafeUnsignedInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecoverySnapshotId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 112 || value.includes('\\') || value.startsWith('/')) return false;
  const parts = value.split('/');
  if (parts.length !== 2 || !/^[a-f0-9]{32}$/iu.test(parts[0])) return false;
  const stem = parts[1].endsWith('.vrec') ? parts[1].slice(0, -5) : '';
  if (!stem) return false;
  const timestampAndNonce = stem.split('-');
  return timestampAndNonce.length === 2
    ? /^\d+$/u.test(timestampAndNonce[0]) && /^[a-f0-9]{16}$/iu.test(timestampAndNonce[1])
    : /^\d+$/u.test(stem);
}

export function parseRecoverySnapshotListResponse(value: unknown): RecoverySnapshotInfo[] | null {
  if (!Array.isArray(value)) return null;
  try {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (Object.getPrototypeOf(value) !== Array.prototype || !lengthDescriptor ||
      typeof lengthDescriptor.value !== 'number' || lengthDescriptor.value > MAX_RECOVERY_SNAPSHOTS) return null;
    const result: RecoverySnapshotInfo[] = [];
    const seenIds = new Set<string>();
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const itemDescriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!itemDescriptor || !Object.prototype.hasOwnProperty.call(itemDescriptor, 'value')) return null;
      const item = readDataRecord(itemDescriptor.value, [
        'snapshot_id', 'document_kind', 'created_at', 'size_bytes', 'requires_pin', 'requires_password', 'security_profile',
      ]);
      if (!item || !isRecoverySnapshotId(item.snapshot_id) || !isWorkspaceDocumentKind(item.document_kind) ||
        !isSafeUnsignedInteger(item.created_at) || !Number.isSafeInteger(item.size_bytes) ||
        (item.size_bytes as number) < 1 || (item.size_bytes as number) > MAX_RECOVERY_BYTES ||
        typeof item.requires_pin !== 'boolean' || typeof item.requires_password !== 'boolean' ||
        (item.requires_pin && item.requires_password) ||
        (item.security_profile !== 'STANDARD' && item.security_profile !== 'PQC' && item.security_profile !== 'VGT_TOP_SECRET') ||
        seenIds.has(item.snapshot_id)) return null;
      seenIds.add(item.snapshot_id);
      result.push(item as unknown as RecoverySnapshotInfo);
    }
    return result;
  } catch {
    return null;
  }
}

export function parseRecoveryWriteResponse(value: unknown): RecoveryWriteResponse | null {
  const response = readDataRecord(value, ['success', 'snapshot_id', 'created_at']);
  if (!response || response.success !== true || !isRecoverySnapshotId(response.snapshot_id) || !isSafeUnsignedInteger(response.created_at)) return null;
  return response as unknown as RecoveryWriteResponse;
}

export function parseRecoveryRestoreResponse(value: unknown): RecoveryRestoreResponse | null {
  const response = readDataRecord(value, ['success', 'document', 'error', 'requires_pin', 'requires_password']);
  if (!response || typeof response.success !== 'boolean' || typeof response.requires_pin !== 'boolean' ||
    typeof response.requires_password !== 'boolean' || (response.requires_pin && response.requires_password) ||
    (response.error !== null && (typeof response.error !== 'string' || response.error.length > 256))) return null;
  if (!response.success) {
    if (response.document !== null || (response.error === null && !response.requires_pin && !response.requires_password)) return null;
    return response as unknown as RecoveryRestoreResponse;
  }
  if (response.requires_pin || response.requires_password || response.error !== null || !response.document ||
    typeof response.document !== 'object' || Array.isArray(response.document)) return null;
  try {
    stringifyJsonWithinUtf8ByteLimit(response.document, MAX_RECOVERY_BYTES, 0, { maxDepth: 96, maxNodes: 1_000_000 });
    validateWorkspaceDocumentInvariants(response.document as WorkspaceDocument, { allowFutureSchema: true });
    return response as unknown as RecoveryRestoreResponse;
  } catch {
    return null;
  }
}

function withDeadline<T>(promise: Promise<T>, signal?: AbortSignal, timeoutMs = RECOVERY_NATIVE_DEADLINE_MS): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Recovery operation aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; window.clearTimeout(timer); signal?.removeEventListener('abort', onAbort); fn(); };
    const onAbort = () => finish(() => reject(new DOMException('Recovery operation aborted', 'AbortError')));
    const timer = window.setTimeout(() => finish(() => reject(new Error('RECOVERY_OPERATION_DEADLINE_EXCEEDED'))), Math.max(500, Math.min(30_000, timeoutMs)));
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then((value) => finish(() => resolve(value)), () => finish(() => reject(new Error('RECOVERY_NATIVE_OPERATION_REJECTED'))));
  });
}

export function recoverySupported(): boolean { return isNativeDesktop(); }

export async function writeRecoverySnapshot(
  document: WorkspaceDocument,
  pin: string | null,
  password: string | null,
  signal?: AbortSignal,
): Promise<RecoveryWriteResponse | null> {
  if (!isNativeDesktop()) return null;
  if (!document.id || document.id.length > 256) throw new Error('RECOVERY_DOCUMENT_ID_INVALID');
  const response = await withDeadline(invokeNative<unknown>('vgt_recovery_write', { request: { document, pin, password } }), signal);
  const validated = parseRecoveryWriteResponse(response);
  if (!validated) throw new Error('RECOVERY_NATIVE_RESPONSE_REJECTED');
  return validated;
}

export function boundRecoverySnapshotList(snapshots: readonly RecoverySnapshotInfo[]): RecoverySnapshotInfo[] {
  const valid = snapshots.filter((snapshot) =>
    typeof snapshot.snapshot_id === 'string' && snapshot.snapshot_id.length <= 112 &&
    Number.isFinite(snapshot.created_at) && snapshot.created_at >= 0 &&
    Number.isFinite(snapshot.size_bytes) && snapshot.size_bytes > 0 && snapshot.size_bytes <= MAX_RECOVERY_BYTES
  ).sort((left, right) => right.created_at - left.created_at);
  const bounded: RecoverySnapshotInfo[] = [];
  let totalBytes = 0;
  for (const snapshot of valid) {
    if (bounded.length >= MAX_RECOVERY_SNAPSHOTS || totalBytes + snapshot.size_bytes > MAX_RECOVERY_CHAIN_BYTES) break;
    bounded.push(snapshot);
    totalBytes += snapshot.size_bytes;
  }
  return bounded;
}

export async function listRecoverySnapshots(signal?: AbortSignal): Promise<RecoverySnapshotInfo[]> {
  if (!isNativeDesktop()) return [];
  const response = await withDeadline(invokeNative<unknown>('vgt_recovery_list'), signal);
  const snapshots = parseRecoverySnapshotListResponse(response);
  if (!snapshots) throw new Error('RECOVERY_NATIVE_RESPONSE_REJECTED');
  return boundRecoverySnapshotList(snapshots);
}

export async function restoreRecoverySnapshot(
  snapshotId: string,
  promptPin: () => string | null,
  promptPassword: () => string | null,
  signal?: AbortSignal,
): Promise<WorkspaceDocument> {
  if (!isNativeDesktop()) throw new Error('RECOVERY_NATIVE_UNAVAILABLE');
  const boundedId = assertVersionRecoveryPublicId(snapshotId, 'recovery snapshot id');
  const invokeRestore = async (pin: string | null, password: string | null): Promise<RecoveryRestoreResponse> => {
    const response = await withDeadline(invokeNative<unknown>('vgt_recovery_restore', { request: { snapshot_id: boundedId, pin, password } }), signal);
    const validated = parseRecoveryRestoreResponse(response);
    if (!validated) throw new Error('RECOVERY_NATIVE_RESPONSE_REJECTED');
    return validated;
  };

  let result = await invokeRestore(null, null);
  if (result.requires_pin) {
    const raw = promptPin();
    const pin = raw?.trim() ?? '';
    if (!/^\d{4,8}$/.test(pin)) throw new Error(raw === null ? 'RECOVERY_CANCELLED' : 'RECOVERY_PIN_INVALID');
    result = await invokeRestore(pin, null);
  } else if (result.requires_password) {
    const raw = promptPassword();
    const password = raw ?? '';
    if (password.length < 8 || password.length > 128) throw new Error(raw === null ? 'RECOVERY_CANCELLED' : 'RECOVERY_PASSWORD_INVALID');
    result = await invokeRestore(null, password);
  }
  if (!result.success || !result.document) throw new Error('RECOVERY_RESTORE_REJECTED');
  return result.document;
}

export async function clearAllRecoverySnapshots(signal?: AbortSignal): Promise<number> {
  if (!isNativeDesktop()) return 0;
  const removed = await withDeadline(invokeNative<unknown>('vgt_recovery_clear_all'), signal);
  if (!isSafeUnsignedInteger(removed)) throw new Error('RECOVERY_NATIVE_RESPONSE_REJECTED');
  return removed;
}

export async function deleteRecoverySnapshot(snapshotId: string, signal?: AbortSignal): Promise<boolean> {
  if (!isNativeDesktop()) return false;
  const boundedId = assertVersionRecoveryPublicId(snapshotId, 'recovery snapshot id');
  const deleted = await withDeadline(invokeNative<unknown>('vgt_recovery_delete', { request: { snapshot_id: boundedId } }), signal);
  if (typeof deleted !== 'boolean') throw new Error('RECOVERY_NATIVE_RESPONSE_REJECTED');
  return deleted;
}
