import type { KeyVaultStatus, VaultKeyPolicyModel, WorkspaceDocument } from '../../contracts/workspace';
import { packContainer, unpackContainer } from '../../../platform/containers/container';
import { markVaultRekeySucceeded, normalizeVaultKeyPolicy, validateVaultCredential, validateVaultPolicyPrerequisites } from './vaultKeyPolicyEngine';

export interface VaultPolicyCredentials {
  pin?: string | null;
  password?: string | null;
}

export interface VaultRekeyResult {
  bytes: Uint8Array;
  nextPolicy: VaultKeyPolicyModel;
  magic: string;
}

function containerMagic(bytes: Uint8Array): string {
  if (bytes.byteLength < 4) return 'UNKNOWN';
  return new TextDecoder().decode(bytes.subarray(0, 4));
}

function policyPackOptions(policy: VaultKeyPolicyModel, credentials: VaultPolicyCredentials): { pin?: string; password?: string } {
  const normalized = normalizeVaultKeyPolicy(policy);
  if (normalized.protectionMode === 'device') return {};
  if (normalized.protectionMode === 'device_pin') {
    const pin = validateVaultCredential('device_pin', credentials.pin);
    if (!pin) throw new Error('vault_pin_required');
    return { pin };
  }
  const password = validateVaultCredential('portable_password', credentials.password);
  if (!password) throw new Error('vault_password_required');
  return { password };
}

export async function packVaultByPolicy(
  document: WorkspaceDocument,
  policy: VaultKeyPolicyModel,
  credentials: VaultPolicyCredentials,
  status: KeyVaultStatus,
): Promise<Uint8Array> {
  const normalized = normalizeVaultKeyPolicy(policy);
  validateVaultPolicyPrerequisites(normalized, status);
  return packContainer(document, policyPackOptions(normalized, credentials));
}

/**
 * Re-packs the Vault using a fresh document-encryption key. Native VWC always creates a
 * fresh DEK. Browser device/device+PIN containers use VGT5/VGT4 envelope formats which
 * also create a fresh random DEK on every pack; portable-password VGT3 creates fresh
 * salt/IV-derived key material on every pack.
 */
export async function rekeyVaultPackage(
  document: WorkspaceDocument,
  policy: VaultKeyPolicyModel,
  credentials: VaultPolicyCredentials,
  status: KeyVaultStatus,
  at: number,
): Promise<VaultRekeyResult> {
  const bytes = await packVaultByPolicy(document, policy, credentials, status);
  return { bytes, nextPolicy: markVaultRekeySucceeded(policy, at), magic: containerMagic(bytes) };
}

export async function exportRecipientEncryptedVaultPackage(
  document: WorkspaceDocument,
  recipientPublicKey: string,
  status: KeyVaultStatus,
): Promise<{ bytes: Uint8Array; magic: string }> {
  const key = recipientPublicKey.trim();
  if (!/^(?:x25519:)?[0-9a-fA-F]{64}$/.test(key)) throw new Error('vault_recipient_public_key_invalid');
  if (!status.coreConnected || status.isLocked) throw new Error('vault_recipient_keyvault_unavailable');
  const bytes = await packContainer(document, { recipientPublicKey: key });
  return { bytes, magic: containerMagic(bytes) };
}

/** Test/diagnostic helper: wrong credentials must never yield a document. */
export async function verifyVaultPackageCredentialFailure(
  bytes: Uint8Array,
  mode: 'pin' | 'password',
  wrongCredential: string,
): Promise<boolean> {
  try {
    await unpackContainer(bytes, mode === 'pin' ? { pin: wrongCredential } : { password: wrongCredential });
    return false;
  } catch {
    return true;
  }
}
