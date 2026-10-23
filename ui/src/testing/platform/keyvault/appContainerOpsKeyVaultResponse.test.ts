// STATUS: PLATIN — verifies native KeyVault status and lock responses fail closed at their caller.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchKeyVaultRuntimeStatus, lockKeyVaultRuntime, unlockSoftwareKeyProvider } from '../../../platform/operations/appContainerOps';
import { invokeNative, isNativeDesktop } from '../../../platform/native/nativeBridge';

vi.mock('../../../platform/native/nativeBridge', () => ({ invokeNative: vi.fn(), isNativeDesktop: vi.fn() }));
vi.mock('../../../platform/native/ipcAuth', () => ({ authenticatedIpcFetch: vi.fn() }));

const validStatus = {
  success: true,
  platform: 'Windows',
  provider_name: 'Windows CNG',
  provider_available: true,
  secure_persistence: true,
  hardware_interface_detected: true,
  hardware_slot_supported: false,
  provider_capabilities: ['NativeSecurePersistence'],
  provider_detail: 'Provider available.',
  is_unlocked: true,
  pqc_unlocked: false,
  top_secret_enrolled: false,
  top_secret_unlocked: false,
  hardware_backed: false,
  hardware_attestation_verified: false,
};

describe('appContainerOps KeyVault response boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNativeDesktop).mockReturnValue(true);
  });

  it('projects a valid native KeyVault status after schema validation', async () => {
    vi.mocked(invokeNative).mockResolvedValue(validStatus);

    await expect(fetchKeyVaultRuntimeStatus()).resolves.toMatchObject({
      connected: true,
      platform: 'Windows',
      providerAvailable: true,
      hardwareInterfaceDetected: true,
      hardwareSlotSupported: false,
      hardwareAttestationVerified: false,
      softwareProviderConfigured: false,
    });
  });

  it('explicitly unlocks the software provider and projects its configured state', async () => {
    vi.mocked(invokeNative).mockResolvedValue({
      ...validStatus,
      platform: 'SoftwareEncrypted',
      provider_name: 'Passphrase-protected software key',
      software_provider_configured: true,
    });

    await expect(unlockSoftwareKeyProvider('correct horse battery staple')).resolves.toMatchObject({
      connected: true,
      platform: 'SoftwareEncrypted',
      softwareProviderConfigured: true,
    });
    expect(invokeNative).toHaveBeenCalledWith('vgt_keyvault_software_provider_unlock', {
      request: { passphrase: 'correct horse battery staple' },
    });
  });

  it('returns the disconnected fail-closed projection for malformed status or lock responses', async () => {
    vi.mocked(invokeNative).mockResolvedValue({ ...validStatus, hardware_attestation_verified: undefined });
    await expect(fetchKeyVaultRuntimeStatus()).resolves.toMatchObject({
      connected: false,
      providerAvailable: false,
      hardwareBacked: false,
      hardwareAttestationVerified: false,
    });

    vi.mocked(invokeNative).mockResolvedValue({ ...validStatus, provider_capabilities: Array.from({ length: 33 }, () => 'NativeSecurePersistence') });
    await expect(lockKeyVaultRuntime()).resolves.toMatchObject({
      connected: false,
      providerAvailable: false,
      hardwareSlotSupported: false,
    });
  });
});
