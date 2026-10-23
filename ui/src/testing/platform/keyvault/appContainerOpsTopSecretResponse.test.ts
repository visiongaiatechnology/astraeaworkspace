// STATUS: PLATIN — appContainerOps fails closed on malformed native Top Secret responses.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enrollTopSecretAccess, unlockTopSecretAccess } from '../../../platform/operations/appContainerOps';
import { invokeNative, isNativeDesktop } from '../../../platform/native/nativeBridge';

vi.mock('../../../platform/native/nativeBridge', () => ({ invokeNative: vi.fn(), isNativeDesktop: vi.fn() }));
vi.mock('../../../platform/native/ipcAuth', () => ({ authenticatedIpcFetch: vi.fn() }));

const OFFLINE_FACTOR = 'c'.repeat(64);

describe('appContainerOps Top Secret response boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNativeDesktop).mockReturnValue(true);
  });

  it('projects a valid native enrollment and preserves its one-time offline factor', async () => {
    vi.mocked(invokeNative).mockResolvedValue({
      success: true,
      generation: 1,
      offline_factor_hex: OFFLINE_FACTOR,
      recovery_hint: 'Store this factor separately.',
      error: null,
    });

    await expect(enrollTopSecretAccess('user-secret', true)).resolves.toMatchObject({
      success: true,
      generation: 1,
      offlineFactorHex: OFFLINE_FACTOR,
      error: null,
    });
  });

  it('rejects an enrollment response that omits the requested factor', async () => {
    vi.mocked(invokeNative).mockResolvedValue({
      success: true,
      generation: 1,
      offline_factor_hex: null,
      recovery_hint: 'Store this factor separately.',
      error: null,
    });

    await expect(enrollTopSecretAccess('user-secret', true)).resolves.toMatchObject({
      success: false,
      generation: null,
      offlineFactorHex: null,
      error: 'Top Secret enrollment was rejected.',
    });
  });

  it('accepts a valid unlock but rejects untrusted factor data on unlock', async () => {
    vi.mocked(invokeNative).mockResolvedValue({
      success: true,
      generation: null,
      offline_factor_hex: null,
      recovery_hint: null,
      error: null,
    });
    await expect(unlockTopSecretAccess('user-secret')).resolves.toMatchObject({ success: true, error: null });

    vi.mocked(invokeNative).mockResolvedValue({
      success: true,
      generation: null,
      offline_factor_hex: OFFLINE_FACTOR,
      recovery_hint: null,
      error: null,
    });
    await expect(unlockTopSecretAccess('user-secret')).resolves.toMatchObject({
      success: false,
      offlineFactorHex: null,
      error: 'Top Secret unlock was rejected.',
    });
  });
});
