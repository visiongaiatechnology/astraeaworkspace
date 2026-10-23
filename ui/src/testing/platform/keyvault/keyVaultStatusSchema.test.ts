// STATUS: PLATIN — exercises complete KeyVault response validation and fail-closed bounds.
import { describe, expect, it } from 'vitest';
import { parseKeyVaultStatusPayload } from '../../../platform/keyvault/keyVaultStatusSchema';

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

describe('parseKeyVaultStatusPayload', () => {
  it('accepts the complete native capability response without conflating interface detection and attestation', () => {
    expect(parseKeyVaultStatusPayload(validStatus)).toEqual({ ...validStatus, software_provider_configured: false });
    expect(parseKeyVaultStatusPayload({ ...validStatus, software_provider_configured: true }))
      .toEqual({ ...validStatus, software_provider_configured: true });
  });

  it('rejects missing or mistyped trust fields and oversized nested capability data', () => {
    expect(parseKeyVaultStatusPayload({ ...validStatus, hardware_attestation_verified: undefined })).toBeNull();
    expect(parseKeyVaultStatusPayload({ ...validStatus, provider_available: 'true' })).toBeNull();
    expect(parseKeyVaultStatusPayload({ ...validStatus, provider_capabilities: Array.from({ length: 33 }, () => 'NativeSecurePersistence') })).toBeNull();
    expect(parseKeyVaultStatusPayload({ ...validStatus, provider_capabilities: ['x'.repeat(97)] })).toBeNull();
    expect(parseKeyVaultStatusPayload({ ...validStatus, provider_detail: 'x'.repeat(1_025) })).toBeNull();
  });

  it('rejects arrays, non-plain roots, and accessors without invoking getters', () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({ ...validStatus }, 'hardware_backed', {
      enumerable: true,
      get: () => { getterCalls += 1; return false; },
    });

    expect(parseKeyVaultStatusPayload([])).toBeNull();
    expect(parseKeyVaultStatusPayload(Object.create({ ...validStatus }))).toBeNull();
    expect(parseKeyVaultStatusPayload(accessor)).toBeNull();
    expect(getterCalls).toBe(0);
  });
});
