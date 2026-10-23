// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — native KeyVault sealed-secret persistence for PDF protection credentials.

import { fetchKeyVaultRuntimeStatus } from '../../../../platform/operations/appContainerOps';
import { invokeNative, isNativeDesktop } from '../../../../platform/native/nativeBridge';

export interface PdfKeyVaultSecretRecord {
  version: 1;
  id: string;
  label: string;
  scope: string;
  createdAt: number;
  sealed: { version: number; nonce: number[]; ciphertext: number[] };
}

interface NativeSecretResponse {
  success?: boolean;
  sealed?: { version?: number; nonce?: number[]; ciphertext?: number[] } | null;
  secret?: string | null;
  error?: string | null;
}

const STORAGE_KEY = 'astraea.pdf.keyvault.secrets.v1';
const MAX_RECORDS = 128;
const MAX_SECRET_LENGTH = 4096;

const safeRecords = (): PdfKeyVaultSecretRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is PdfKeyVaultSecretRecord => Boolean(
      value && value.version === 1 && typeof value.id === 'string' && typeof value.scope === 'string' &&
      typeof value.label === 'string' && Number.isFinite(value.createdAt) && value.sealed &&
      value.sealed.version === 1 && Array.isArray(value.sealed.nonce) && value.sealed.nonce.length === 12 &&
      Array.isArray(value.sealed.ciphertext) && value.sealed.ciphertext.length > 0 && value.sealed.ciphertext.length <= MAX_SECRET_LENGTH + 32,
    )).slice(-MAX_RECORDS);
  } catch {
    return [];
  }
};

const persistRecords = (records: PdfKeyVaultSecretRecord[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
};

export async function canUsePdfKeyVaultSecrets(): Promise<{ ready: boolean; reason: string }> {
  if (!isNativeDesktop()) return { ready: false, reason: 'PDF credential KeyVault requires Astraea Desktop.' };
  const status = await fetchKeyVaultRuntimeStatus();
  if (!status.connected) return { ready: false, reason: 'Native KeyVault provider is offline.' };
  if (!status.isUnlocked) return { ready: false, reason: 'Native KeyVault is locked.' };
  return { ready: true, reason: `${status.platform} KeyVault is ready.` };
}

export async function sealPdfCredentialInKeyVault(label: string, secret: string): Promise<PdfKeyVaultSecretRecord> {
  if (!isNativeDesktop()) throw new Error('Native KeyVault is unavailable in the browser runtime.');
  if (!secret || secret.length > MAX_SECRET_LENGTH) throw new Error('PDF credential violates the KeyVault secret-size policy.');
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('Cryptographically strong record identifiers are unavailable.');
  const id = globalThis.crypto.randomUUID();
  const scope = `pdf-protection:${id}`;
  const result = await invokeNative<NativeSecretResponse>('vgt_keyvault_seal_secret', { request: { scope, secret } });
  const sealed = result.sealed;
  if (result.success !== true || !sealed || sealed.version !== 1 || !Array.isArray(sealed.nonce) || sealed.nonce.length !== 12 || !Array.isArray(sealed.ciphertext) || sealed.ciphertext.length === 0) {
    throw new Error(result.error || 'Native KeyVault refused the PDF credential.');
  }
  const record: PdfKeyVaultSecretRecord = {
    version: 1,
    id,
    label: label.normalize('NFKC').slice(0, 160) || 'Protected PDF owner password',
    scope,
    createdAt: Date.now(),
    sealed: { version: 1, nonce: sealed.nonce.map(Number), ciphertext: sealed.ciphertext.map(Number) },
  };
  const records = safeRecords();
  records.push(record);
  persistRecords(records);
  return record;
}

export async function unsealPdfCredentialFromKeyVault(id: string): Promise<string> {
  if (!isNativeDesktop()) throw new Error('Native KeyVault is unavailable in the browser runtime.');
  const record = safeRecords().find((candidate) => candidate.id === id);
  if (!record) throw new Error('KeyVault PDF credential record was not found.');
  const result = await invokeNative<NativeSecretResponse>('vgt_keyvault_unseal_secret', { request: { scope: record.scope, sealed: record.sealed } });
  if (result.success !== true || typeof result.secret !== 'string' || !result.secret) throw new Error(result.error || 'Native KeyVault could not unseal the PDF credential.');
  return result.secret;
}

export function listPdfKeyVaultSecretRecords(): Array<Omit<PdfKeyVaultSecretRecord, 'sealed'>> {
  return safeRecords().map(({ sealed: _sealed, ...record }) => record);
}
