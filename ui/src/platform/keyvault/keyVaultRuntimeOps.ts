// STATUS: PLATIN — KeyVault runtime operations validate native and authenticated loopback responses.
import { authenticatedIpcFetch } from '../native/ipcAuth';
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import { parseKeyVaultStatusPayload } from './keyVaultStatusSchema';
import { parseTopSecretAccessPayload, rejectedTopSecretAccessResult, type TopSecretAccessResult } from './topSecretAccessSchema';

export interface KeyVaultRuntimeStatus {
  connected: boolean;
  platform: string;
  providerName: string;
  providerAvailable: boolean;
  securePersistence: boolean;
  hardwareInterfaceDetected: boolean;
  hardwareSlotSupported: boolean;
  providerCapabilities: string[];
  providerDetail: string;
  isUnlocked: boolean;
  pqcUnlocked: boolean;
  topSecretEnrolled: boolean;
  topSecretUnlocked: boolean;
  hardwareBacked: boolean;
  hardwareAttestationVerified: boolean;
  softwareProviderConfigured: boolean;
}

export async function fetchKeyVaultRuntimeStatus(): Promise<KeyVaultRuntimeStatus> {
  try {
    const data = isNativeDesktop()
      ? await invokeNative<unknown>('vgt_keyvault_status')
      : await (async () => {
          const response = await authenticatedIpcFetch('/api/v1/keyvault/status', { method: 'GET' });
          if (!response.ok) throw new Error(`status ${response.status}`);
          return response.json() as Promise<unknown>;
        })();
    const parsed = parseKeyVaultStatusPayload(data);
    if (!parsed) throw new Error('KEYVAULT_STATUS_RESPONSE_REJECTED');
    return normalizeKeyVaultStatus(parsed);
  } catch {
    return disconnectedKeyVaultStatus();
  }
}

function disconnectedKeyVaultStatus(): KeyVaultRuntimeStatus {
  return {
    connected: false,
    platform: 'Rust Workspace Core not connected',
    providerName: 'Unavailable',
    providerAvailable: false,
    securePersistence: false,
    hardwareInterfaceDetected: false,
    hardwareSlotSupported: false,
    providerCapabilities: [],
    providerDetail: 'Native KeyVault status is unavailable.',
    isUnlocked: false,
    pqcUnlocked: false,
    topSecretEnrolled: false,
    topSecretUnlocked: false,
    hardwareBacked: false,
    hardwareAttestationVerified: false,
    softwareProviderConfigured: false,
  };
}

function normalizeKeyVaultStatus(data: NonNullable<ReturnType<typeof parseKeyVaultStatusPayload>>): KeyVaultRuntimeStatus {
  return {
    connected: data.success,
    platform: data.platform,
    providerName: data.provider_name,
    providerAvailable: data.provider_available,
    securePersistence: data.secure_persistence,
    hardwareInterfaceDetected: data.hardware_interface_detected,
    hardwareSlotSupported: data.hardware_slot_supported,
    providerCapabilities: data.provider_capabilities,
    providerDetail: data.provider_detail,
    isUnlocked: data.is_unlocked,
    pqcUnlocked: data.pqc_unlocked,
    topSecretEnrolled: data.top_secret_enrolled,
    topSecretUnlocked: data.top_secret_unlocked,
    hardwareBacked: data.hardware_backed,
    hardwareAttestationVerified: data.hardware_attestation_verified,
    softwareProviderConfigured: data.software_provider_configured === true,
  };
}

export async function createSoftwareKeyProvider(passphrase: string): Promise<KeyVaultRuntimeStatus> {
  return runSoftwareProviderOperation('vgt_keyvault_software_provider_create', passphrase);
}

export async function unlockSoftwareKeyProvider(passphrase: string): Promise<KeyVaultRuntimeStatus> {
  return runSoftwareProviderOperation('vgt_keyvault_software_provider_unlock', passphrase);
}

type SoftwareProviderCommand = 'vgt_keyvault_software_provider_create' | 'vgt_keyvault_software_provider_unlock';

async function runSoftwareProviderOperation(command: SoftwareProviderCommand, passphrase: string): Promise<KeyVaultRuntimeStatus> {
  if (!isNativeDesktop()) throw new Error('Native KeyVault required for software provider');
  const data = await invokeNative<unknown>(command, { request: { passphrase } });
  const parsed = parseKeyVaultStatusPayload(data);
  if (!parsed) throw new Error('KEYVAULT_STATUS_RESPONSE_REJECTED');
  return normalizeKeyVaultStatus(parsed);
}

export async function lockKeyVaultRuntime(): Promise<KeyVaultRuntimeStatus> {
  try {
    const data = isNativeDesktop()
      ? await invokeNative<unknown>('vgt_keyvault_lock')
      : await (async () => {
          const response = await authenticatedIpcFetch('/api/v1/keyvault/lock', { method: 'POST' });
          if (!response.ok) throw new Error(`status ${response.status}`);
          return response.json() as Promise<unknown>;
        })();
    const parsed = parseKeyVaultStatusPayload(data);
    if (!parsed) throw new Error('KEYVAULT_STATUS_RESPONSE_REJECTED');
    return normalizeKeyVaultStatus(parsed);
  } catch {
    return disconnectedKeyVaultStatus();
  }
}

export async function enrollTopSecretAccess(
  userSecret: string,
  requireOfflineFactor: boolean,
): Promise<TopSecretAccessResult> {
  if (!isNativeDesktop()) throw new Error('Native KeyVault required for Top Secret enrollment');
  const data = await invokeNative<unknown>('vgt_keyvault_top_secret_enroll', {
    request: { user_secret: userSecret, require_offline_factor: requireOfflineFactor },
  });
  return parseTopSecretAccessPayload(data, { operation: 'enroll', requireOfflineFactor })
    ?? rejectedTopSecretAccessResult('enroll');
}

export async function unlockTopSecretAccess(
  userSecret: string,
  offlineFactorHex?: string,
): Promise<TopSecretAccessResult> {
  if (!isNativeDesktop()) throw new Error('Native KeyVault required for Top Secret unlock');
  const data = await invokeNative<unknown>('vgt_keyvault_top_secret_unlock', {
    request: { user_secret: userSecret, offline_factor_hex: offlineFactorHex || null },
  });
  return parseTopSecretAccessPayload(data, { operation: 'unlock' })
    ?? rejectedTopSecretAccessResult('unlock');
}

export type { TopSecretAccessResult };
