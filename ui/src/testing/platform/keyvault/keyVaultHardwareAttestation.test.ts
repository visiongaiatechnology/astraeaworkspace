import { describe, expect, it } from 'vitest';

import { resolveTpmStatus } from '../../../platform/keyvault/keyVaultHardwareAttestation';

describe('resolveTpmStatus', () => {
  it('reports a verified Windows TPM only when native hardware binding is verified', () => {
    expect(resolveTpmStatus('WindowsDpapi', true, true)).toBe('AVAILABLE');
  });

  it('distinguishes an unverified Windows hardware interface from an available TPM slot', () => {
    expect(resolveTpmStatus('WindowsDpapi', true, false)).toBe('INTERFACE_DETECTED_UNVERIFIED');
  });

  it('reports no TPM when Windows has neither a verified slot nor a detected interface', () => {
    expect(resolveTpmStatus('WindowsDpapi', false, false)).toBe('NOT_DETECTED');
  });

  it('fails closed when verified hardware flags contradict interface detection', () => {
    expect(resolveTpmStatus('WindowsDpapi', false, true)).toBe('NOT_DETECTED');
  });

  it('does not describe non-Windows hardware providers as a TPM', () => {
    expect(resolveTpmStatus('macOS Secure Enclave', true, true)).toBe('NOT_DETECTED');
  });

  it('fails closed for a missing or unknown platform', () => {
    expect(resolveTpmStatus(undefined, true, true)).toBe('NOT_DETECTED');
    expect(resolveTpmStatus('unknown', true, true)).toBe('NOT_DETECTED');
  });
});
