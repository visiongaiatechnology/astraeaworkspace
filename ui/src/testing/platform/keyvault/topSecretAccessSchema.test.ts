// STATUS: PLATIN — hostile native payloads cannot forge Top Secret unlock or disclose malformed factors.
import { describe, expect, it } from 'vitest';
import { parseTopSecretAccessPayload } from '../../../platform/keyvault/topSecretAccessSchema';

const FACTOR = 'a'.repeat(64);
const ENROLL_WITH_FACTOR = {
  success: true,
  generation: 1,
  offline_factor_hex: FACTOR,
  recovery_hint: 'Store the offline factor separately.',
  error: null,
};
const ENROLL_WITHOUT_FACTOR = {
  success: true,
  generation: 1,
  offline_factor_hex: null,
  recovery_hint: 'Use the native device factor and user secret.',
  error: null,
};
const UNLOCKED = {
  success: true,
  generation: null,
  offline_factor_hex: null,
  recovery_hint: null,
  error: null,
};
const REJECTED = {
  success: false,
  generation: null,
  offline_factor_hex: null,
  recovery_hint: null,
  error: 'Top Secret operation rejected.',
};

describe('parseTopSecretAccessPayload', () => {
  it('projects a successful enrollment with the requested offline factor', () => {
    expect(parseTopSecretAccessPayload(ENROLL_WITH_FACTOR, { operation: 'enroll', requireOfflineFactor: true }))
      .toMatchObject({ success: true, generation: 1, offlineFactorHex: FACTOR, error: null });
  });

  it('accepts enrollment only when factor presence matches the requested policy', () => {
    expect(parseTopSecretAccessPayload(ENROLL_WITHOUT_FACTOR, { operation: 'enroll', requireOfflineFactor: false }))
      .toMatchObject({ success: true, generation: 1, offlineFactorHex: null });
    expect(parseTopSecretAccessPayload(ENROLL_WITHOUT_FACTOR, { operation: 'enroll', requireOfflineFactor: true }))
      .toBeNull();
    expect(parseTopSecretAccessPayload(ENROLL_WITH_FACTOR, { operation: 'enroll', requireOfflineFactor: false }))
      .toBeNull();
  });

  it('accepts an unlock only when enrollment-only fields are absent', () => {
    expect(parseTopSecretAccessPayload(UNLOCKED, { operation: 'unlock' }))
      .toMatchObject({ success: true, generation: null, offlineFactorHex: null, recoveryHint: null });
    expect(parseTopSecretAccessPayload({ ...UNLOCKED, generation: 1 }, { operation: 'unlock' })).toBeNull();
    expect(parseTopSecretAccessPayload({ ...UNLOCKED, offline_factor_hex: FACTOR }, { operation: 'unlock' })).toBeNull();
  });

  it('converts native failures into operation-specific opaque errors and discards sensitive fields', () => {
    expect(parseTopSecretAccessPayload(REJECTED, { operation: 'enroll', requireOfflineFactor: true }))
      .toMatchObject({ success: false, offlineFactorHex: null, error: 'Top Secret enrollment was rejected.' });
    expect(parseTopSecretAccessPayload(REJECTED, { operation: 'unlock' }))
      .toMatchObject({ success: false, offlineFactorHex: null, error: 'Top Secret unlock was rejected.' });
    expect(parseTopSecretAccessPayload({ ...REJECTED, offline_factor_hex: FACTOR }, { operation: 'unlock' })).toBeNull();
  });

  it('rejects unknown keys, missing keys, invalid generations, malformed factors, and unbounded text', () => {
    const invalid = [
      { ...ENROLL_WITHOUT_FACTOR, extra: true },
      { success: true, generation: 1, offline_factor_hex: null, recovery_hint: 'x' },
      { ...ENROLL_WITHOUT_FACTOR, generation: Number.MAX_SAFE_INTEGER + 1 },
      { ...ENROLL_WITH_FACTOR, offline_factor_hex: 'z'.repeat(64) },
      { ...ENROLL_WITHOUT_FACTOR, recovery_hint: 'x'.repeat(513) },
      { ...REJECTED, error: 'x'.repeat(193) },
      { ...REJECTED, error: null },
      { ...ENROLL_WITHOUT_FACTOR, success: true, error: 'conflicting result' },
    ];

    for (const payload of invalid) {
      expect(parseTopSecretAccessPayload(payload, { operation: 'enroll', requireOfflineFactor: false })).toBeNull();
    }
  });

  it('does not invoke accessors while validating native records', () => {
    let getterCalls = 0;
    const payload = {
      ...ENROLL_WITHOUT_FACTOR,
      get offline_factor_hex() {
        getterCalls += 1;
        return null;
      },
    };

    expect(parseTopSecretAccessPayload(payload, { operation: 'enroll', requireOfflineFactor: false })).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it('rejects arrays, primitives, null, and custom prototypes', () => {
    for (const payload of [null, false, [], 'native', Object.assign(Object.create({ inherited: true }), ENROLL_WITHOUT_FACTOR)]) {
      expect(parseTopSecretAccessPayload(payload, { operation: 'enroll', requireOfflineFactor: false })).toBeNull();
    }
  });
});
