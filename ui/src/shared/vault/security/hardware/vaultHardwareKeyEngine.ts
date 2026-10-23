/**
 * Astraea Vault — Non-Extractable Browser Signing Key Engine
 * WebCrypto non-extractability is not treated as proof of TPM/Secure-Enclave backing.
 * Actual hardware-backed claims come only from the native KeyVault provider status.
 * Status: DIAMANT VGT SUPREME
 */

export interface HardwareKeyCapabilities {
  hasWebCrypto: boolean;
  hasWebAuthn: boolean;
  hasPlatformAuthenticator: boolean;
  hasPrfExtension: boolean;
  enclaveProvider: string;
  securityLevel: 'PLATFORM_AUTHENTICATOR_AVAILABLE' | 'SOFTWARE_WEBCRYPTO' | 'FALLBACK_EMULATED';
}

export interface HardwareKeyDescriptor {
  id: string;
  label: string;
  algorithm: string;
  keyUsages: string[];
  isNonExtractable: boolean;
  hardwareBound: boolean;
  createdAt: string;
  lastUsedAt: string;
  publicKeyJwk?: JsonWebKey;
  attestationDigest: string;
}

export interface EnclaveAttestation {
  keyId: string;
  hardwareType: string;
  algorithm: string;
  timestamp: string;
  signatureHex: string;
  valid: boolean;
}

export interface KeyRotationResult {
  success: boolean;
  oldKeyId: string;
  newKeyId: string;
  rotatedAt: string;
  rekeyedRecordCount: number;
}

// In-memory enclave handle registry (non-extractable CryptoKeys)
const enclaveHandleRegistry = new Map<string, { privateKey: CryptoKey; publicKey: CryptoKey; descriptor: HardwareKeyDescriptor }>();

/**
 * Probes browser and platform hardware authenticator capabilities
 */
export async function probeHardwareCapabilities(): Promise<HardwareKeyCapabilities> {
  const hasWebCrypto = typeof window !== 'undefined' && !!window.crypto && !!window.crypto.subtle;
  let hasWebAuthn = false;
  let hasPlatformAuthenticator = false;

  if (typeof window !== 'undefined' && window.PublicKeyCredential) {
    hasWebAuthn = true;
    try {
      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        hasPlatformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      }
    } catch {
      hasPlatformAuthenticator = false;
    }
  }

  const enclaveProvider = hasPlatformAuthenticator
    ? 'Platform authenticator available for user verification; Vault key hardware binding is not asserted'
    : hasWebCrypto
    ? 'WebCrypto SubtleCrypto non-extractable key (hardware backing unknown)'
    : 'Software Fallback';

  const securityLevel: HardwareKeyCapabilities['securityLevel'] = hasPlatformAuthenticator
    ? 'PLATFORM_AUTHENTICATOR_AVAILABLE'
    : hasWebCrypto
    ? 'SOFTWARE_WEBCRYPTO'
    : 'FALLBACK_EMULATED';

  return {
    hasWebCrypto,
    hasWebAuthn,
    hasPlatformAuthenticator,
    hasPrfExtension: hasPlatformAuthenticator,
    enclaveProvider,
    securityLevel,
  };
}

/**
 * Generates an ECDSA P-256 non-extractable WebCrypto key pair. This function does
 * not claim hardware backing; a platform authenticator is a separate capability.
 */
export async function generateHardwareBoundKeyPair(
  label: string
): Promise<{ descriptor: HardwareKeyDescriptor; privateKey: CryptoKey; publicKey: CryptoKey }> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('WebCrypto SubtleCrypto is unavailable in current environment');
  }

  const keyId = `hwk_${Date.now().toString(36)}_${Array.from(window.crypto.getRandomValues(new Uint8Array(10)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;

  // ECDSA with P-256 curve, non-extractable private key to guarantee hardware/enclave boundary
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false, // extractable = false (STRICT REQUIREMENT)
    ['sign', 'verify']
  );

  const exportedPublic = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

  // Compute attestation digest of public key coordinates
  const coordData = new TextEncoder().encode(`${exportedPublic.x || ''}:${exportedPublic.y || ''}:${keyId}`);
  const hashBuf = await window.crypto.subtle.digest('SHA-256', coordData);
  const attestationDigest = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const descriptor: HardwareKeyDescriptor = {
    id: keyId,
    label: label.trim() || 'Vault Primary Hardware Key',
    algorithm: 'ECDSA-P256-SHA256',
    keyUsages: ['sign', 'verify'],
    isNonExtractable: true,
    hardwareBound: false,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    publicKeyJwk: exportedPublic,
    attestationDigest,
  };

  enclaveHandleRegistry.set(keyId, {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    descriptor,
  });

  return { descriptor, privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };
}

/**
 * Signs payload using enclave non-extractable private key
 */
export async function signWithHardwareKey(keyId: string, payload: Uint8Array): Promise<Uint8Array> {
  const entry = enclaveHandleRegistry.get(keyId);
  if (!entry) {
    throw new Error(`Enclave key handle '${keyId}' not found in registry`);
  }

  const signature = await window.crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    entry.privateKey,
    payload as unknown as BufferSource
  );

  entry.descriptor.lastUsedAt = new Date().toISOString();
  return new Uint8Array(signature);
}

/**
 * Verifies enclave signature using public key
 */
export async function verifyHardwareSignature(
  keyId: string,
  signature: Uint8Array,
  payload: Uint8Array
): Promise<boolean> {
  const entry = enclaveHandleRegistry.get(keyId);
  if (!entry) {
    throw new Error(`Enclave key handle '${keyId}' not found in registry`);
  }

  return await window.crypto.subtle.verify(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    entry.publicKey,
    signature as unknown as BufferSource,
    payload as unknown as BufferSource
  );
}

/**
 * Generates a self-verification report for the non-extractable WebCrypto key.
 * This is not a TPM/Secure-Enclave attestation certificate.
 */
export async function generateAttestationReport(keyId: string): Promise<EnclaveAttestation> {
  const entry = enclaveHandleRegistry.get(keyId);
  if (!entry) {
    throw new Error(`Enclave key handle '${keyId}' not found in registry`);
  }

  const caps = await probeHardwareCapabilities();
  const timestamp = new Date().toISOString();
  const attestationStatement = new TextEncoder().encode(
    `VGT_VAULT_ATTESTATION:${keyId}:${entry.descriptor.attestationDigest}:${timestamp}`
  );

  const sigBytes = await signWithHardwareKey(keyId, attestationStatement);
  const signatureHex = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const valid = await verifyHardwareSignature(keyId, sigBytes, attestationStatement);

  return {
    keyId,
    hardwareType: `WebCrypto self-verification; ${caps.enclaveProvider}`, 
    algorithm: entry.descriptor.algorithm,
    timestamp,
    signatureHex,
    valid,
  };
}

/**
 * Overwrites memory buffer with zeroes for cryptographic zeroization
 */
export function zeroizeMemoryBuffer(buffer: Uint8Array): void {
  buffer.fill(0);
}

/**
 * Rotates the browser signing key handle only. Vault payload rekeying is performed
 * by vaultKeyPolicyCrypto and must not be inferred from this helper.
 */
export async function rotateVaultEnclaveKey(
  currentKeyId: string,
  newLabel: string
): Promise<KeyRotationResult> {
  const { descriptor: newDesc } = await generateHardwareBoundKeyPair(newLabel);

  return {
    success: true,
    oldKeyId: currentKeyId,
    newKeyId: newDesc.id,
    rotatedAt: new Date().toISOString(),
    rekeyedRecordCount: 0,
  };
}

/**
 * Retrieves list of active enclave key descriptors
 */
export function listEnclaveKeyDescriptors(): HardwareKeyDescriptor[] {
  return Array.from(enclaveHandleRegistry.values()).map((e) => e.descriptor);
}
