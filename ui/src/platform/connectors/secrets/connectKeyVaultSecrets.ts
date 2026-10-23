// STATUS: GOLD — native KeyVault sealing for Astraea Connect credentials.
import { fetchKeyVaultRuntimeStatus } from '../../operations/appContainerOps';
import { parseHostileJson } from '../../../shared/security/hostileJson';
import { invokeNative, isNativeDesktop } from '../../native/nativeBridge';

const STORAGE_KEY = 'astraea.connect.keyvault.v1';
const MAX_RECORDS = 64;
const MAX_SECRET_BYTES = 4096;
const MAX_STORAGE_BYTES = 2 * 1024 * 1024;
const HANDLE_PATTERN = /^keyvault:\/connect\/[0-9a-f-]{36}$/i;

interface SealedPayload {
  version: number;
  nonce: number[];
  ciphertext: number[];
}

interface ConnectSecretRecord {
  version: 1;
  handle: string;
  scope: string;
  createdAt: number;
  updatedAt: number;
  sealed: SealedPayload;
}

interface NativeSecretResponse {
  success?: boolean;
  sealed?: SealedPayload | null;
  secret?: string | null;
  error?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const expected = new Set(expectedKeys);
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function isByteArray(value: unknown, minLength: number, maxLength: number): value is number[] {
  return Array.isArray(value) && value.length >= minLength && value.length <= maxLength
    && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255);
}

function isConnectSecretRecord(value: unknown): value is ConnectSecretRecord {
  if (!isRecord(value) || value.version !== 1 || typeof value.handle !== 'string' || !HANDLE_PATTERN.test(value.handle)
    || typeof value.scope !== 'string' || !/^connect-mail:[0-9a-f-]{36}$/i.test(value.scope)
    || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.updatedAt) || !isRecord(value.sealed)
    || !hasExactKeys(value, ['version', 'handle', 'scope', 'createdAt', 'updatedAt', 'sealed'])
    || !hasExactKeys(value.sealed, ['version', 'nonce', 'ciphertext'])) return false;
  return value.sealed.version === 1 && isByteArray(value.sealed.nonce, 12, 12)
    && isByteArray(value.sealed.ciphertext, 1, MAX_SECRET_BYTES + 32);
}

function readRecords(): ConnectSecretRecord[] {
  let raw: string | null;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch { throw new Error('connect-keyvault-storage-unavailable'); }
  if (raw === null) return [];
  if (new TextEncoder().encode(raw).byteLength > MAX_STORAGE_BYTES) throw new Error('connect-keyvault-record-limit');
  try {
    const parsed = parseHostileJson(raw, { maxBytes: MAX_STORAGE_BYTES, maxDepth: 12, maxNodes: 400_000, maxStringChars: MAX_SECRET_BYTES + 512, maxObjectKeys: 32, maxArrayItems: MAX_SECRET_BYTES + 32 });
    if (!Array.isArray(parsed) || parsed.length > MAX_RECORDS || !parsed.every(isConnectSecretRecord)) throw new Error('invalid');
    const records = parsed as ConnectSecretRecord[];
    if (new Set(records.map((record) => record.handle)).size !== records.length) throw new Error('duplicate');
    return records;
  } catch {
    throw new Error('connect-keyvault-record-store-invalid');
  }
}

function writeRecords(records: readonly ConnectSecretRecord[]): void {
  if (records.length > MAX_RECORDS) throw new Error('connect-keyvault-record-limit');
  const encoded = JSON.stringify(records);
  if (new TextEncoder().encode(encoded).byteLength > MAX_STORAGE_BYTES) throw new Error('connect-keyvault-record-limit');
  try { localStorage.setItem(STORAGE_KEY, encoded); }
  catch { throw new Error('connect-keyvault-storage-write-failed'); }
}

function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('connect-keyvault-randomness-unavailable');
  return globalThis.crypto.randomUUID();
}

function validateNativeSealed(value: unknown): SealedPayload {
  if (!isRecord(value) || value.version !== 1 || !isByteArray(value.nonce, 12, 12)
    || !isByteArray(value.ciphertext, 1, MAX_SECRET_BYTES + 32)) {
    throw new Error('connect-keyvault-seal-failed');
  }
  return { version: 1, nonce: [...value.nonce], ciphertext: [...value.ciphertext] };
}

export async function canUseConnectKeyVault(): Promise<{ ready: boolean }> {
  if (!isNativeDesktop()) return { ready: false };
  try {
    const status = await fetchKeyVaultRuntimeStatus();
    return { ready: status.connected && status.isUnlocked };
  } catch {
    return { ready: false };
  }
}

export function isConnectCredentialHandle(value: string | undefined): value is string {
  return typeof value === 'string' && HANDLE_PATTERN.test(value);
}

export function hasConnectCredential(handle: string | undefined): boolean {
  if (!isConnectCredentialHandle(handle)) return false;
  return readRecords().some((record) => record.handle === handle);
}

export async function storeConnectCredential(secret: string): Promise<string> {
  if (!isNativeDesktop()) throw new Error('connect-keyvault-desktop-required');
  const byteLength = new TextEncoder().encode(secret).byteLength;
  if (secret.length === 0 || byteLength > MAX_SECRET_BYTES) throw new Error('connect-keyvault-secret-boundary');
  const ready = await canUseConnectKeyVault();
  if (!ready.ready) throw new Error('connect-keyvault-locked-or-offline');

  const id = randomUuid();
  const handle = `keyvault:/connect/${id}`;
  const scope = `connect-mail:${id}`;
  const response = await invokeNative<NativeSecretResponse>('vgt_keyvault_seal_secret', { request: { scope, secret } });
  if (response.success !== true) throw new Error(response.error || 'connect-keyvault-seal-failed');
  const sealed = validateNativeSealed(response.sealed);
  const records = readRecords();
  if (records.some((record) => record.handle === handle)) throw new Error('connect-keyvault-record-collision');
  const now = Date.now();
  records.push({ version: 1, handle, scope, createdAt: now, updatedAt: now, sealed });
  writeRecords(records);
  return handle;
}

export async function unsealConnectCredential(handle: string): Promise<string> {
  if (!isNativeDesktop()) throw new Error('connect-keyvault-desktop-required');
  if (!isConnectCredentialHandle(handle)) throw new Error('connect-keyvault-handle-invalid');
  const record = readRecords().find((candidate) => candidate.handle === handle);
  if (!record) throw new Error('connect-keyvault-credential-not-found');
  const response = await invokeNative<NativeSecretResponse>('vgt_keyvault_unseal_secret', { request: { scope: record.scope, sealed: record.sealed } });
  if (response.success !== true || typeof response.secret !== 'string' || response.secret.length === 0
    || new TextEncoder().encode(response.secret).byteLength > MAX_SECRET_BYTES) {
    throw new Error('connect-keyvault-unseal-failed');
  }
  return response.secret;
}

export function deleteConnectCredential(handle: string | undefined): void {
  if (!isConnectCredentialHandle(handle)) return;
  const records = readRecords();
  const remaining = records.filter((record) => record.handle !== handle);
  if (remaining.length !== records.length) writeRecords(remaining);
}
