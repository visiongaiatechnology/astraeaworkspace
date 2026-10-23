// STATUS: DIAMANT VGT SUPREME — KeyVault Attestation Capability Audit
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import { parseKeyVaultStatusPayload, type KeyVaultStatusPayload } from './keyVaultStatusSchema';
/**
 * VisionGaiaTechnology — Astraea Workspace Sovereign KeyVault
 * 
 * Audits browser-visible security capabilities without overstating hardware residency:
 * - Checks WebAuthn platform-authenticator availability as a capability signal only
 * - Verifies WebCrypto non-extractable-key semantics with a sign/verify roundtrip
 * - Rejects hardware-backed KeyVault claims unless native key-bound attestation exists
 * - Performs best-effort buffer overwrites without claiming guaranteed memory erasure
 */

export type HardwareAttestationTier =
  | 'HARDWARE_ATTESTED_TPM'
  | 'PLATFORM_AUTHENTICATOR_ENCLAVE'
  | 'NON_EXTRACTABLE_SECURE_ELEMENT'
  | 'SOFTWARE_KEYSTORE_FALLBACK';

export type AttestationVerdict =
  | 'VERIFIED_HARDWARE'
  | 'VERIFIED_ENCLAVE'
  | 'VERIFIED_NON_EXTRACTABLE'
  | 'UNVERIFIED_CLAIM_DEGRADED'
  | 'SOFTWARE_ONLY';

export type TpmStatus =
  | 'AVAILABLE'
  | 'INTERFACE_DETECTED_UNVERIFIED'
  | 'NOT_DETECTED';

type NativeKeyVaultStatus = KeyVaultStatusPayload;

export interface AttestationReport {
  tier: HardwareAttestationTier;
  verdict: AttestationVerdict;
  hardwareBacked: boolean;
  isNonExtractable: boolean;
  platformAuthenticatorAvailable: boolean;
  tpmStatus: TpmStatus;
  attestationChallengeHex: string;
  signatureDigestHex: string;
  claimAuditedTruthfully: boolean;
  providerName: string;
  nativeProviderAvailable: boolean;
  hardwareSlotSupported: boolean;
  hardwareAttestationVerified: boolean;
  explanation: string;
  timestamp: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Best-effort secure memory zeroization.
 * Overwrites sensitive buffer with zeroes immediately upon lifecycle termination.
 */
export function secureZeroizeBuffer(buffer: Uint8Array): void {
  try {
    buffer.fill(0);
  } catch {
    // Fail-safe
  }
}

/**
 * Checks whether WebAuthn reports a user-verifying platform authenticator.
 * This is not proof that the Workspace KeyVault root is stored in that authenticator.
 */
async function checkPlatformAuthenticator(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Exercises WebCrypto non-extractable-key semantics.
 * This is a capability test, not TPM/Secure-Enclave attestation of the KeyVault root.
 */
async function testNonExtractableCryptoKey(): Promise<{
  nonExtractable: boolean;
  challengeHex: string;
  signatureDigestHex: string;
}> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeHex = bytesToHex(challenge);

  try {
    // Generate an ephemeral ECDSA keypair with extractable: false
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false, // non-extractable
      ['sign', 'verify']
    );

    // Verify non-extractability invariant: exporting raw private key MUST throw
    let exportBlocked = false;
    try {
      await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    } catch {
      exportBlocked = true;
    }

    if (!exportBlocked) {
      return {
        nonExtractable: false,
        challengeHex,
        signatureDigestHex: '',
      };
    }

    // Sign the challenge to prove the non-extractable key remains usable
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        keyPair.privateKey,
        challenge as unknown as BufferSource
      )
    );

    const sigDigest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', signature as unknown as BufferSource)
    );

    // Verify signature with public key
    const isValid = await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      keyPair.publicKey,
      signature as unknown as BufferSource,
      challenge as unknown as BufferSource
    );

    return {
      nonExtractable: isValid && exportBlocked,
      challengeHex,
      signatureDigestHex: bytesToHex(sigDigest),
    };
  } catch (err) {
    console.warn('[VGT KeyVault] Non-extractable key test error:', err);
    return {
      nonExtractable: false,
      challengeHex,
      signatureDigestHex: '',
    };
  } finally {
    secureZeroizeBuffer(challenge);
  }
}

async function readNativeKeyVaultStatus(): Promise<NativeKeyVaultStatus | null> {
  if (!isNativeDesktop()) return null;
  try {
    const status = parseKeyVaultStatusPayload(await invokeNative<unknown>('vgt_keyvault_status'));
    return status?.success ? status : null;
  } catch {
    return null;
  }
}

function nativeHardwareTier(status: NativeKeyVaultStatus): HardwareAttestationTier {
  const platform = status.platform.toLowerCase();
  if (platform.includes('windows')) return 'HARDWARE_ATTESTED_TPM';
  if (platform.includes('mac')) return 'PLATFORM_AUTHENTICATOR_ENCLAVE';
  return 'NON_EXTRACTABLE_SECURE_ELEMENT';
}

function nativeHardwareVerdict(status: NativeKeyVaultStatus): AttestationVerdict {
  return status.platform.toLowerCase().includes('mac')
    ? 'VERIFIED_ENCLAVE'
    : 'VERIFIED_HARDWARE';
}

export function resolveTpmStatus(
  platform: string | null | undefined,
  hardwareInterfaceDetected: boolean,
  verifiedNativeHardware: boolean,
): TpmStatus {
  if (!platform?.toLowerCase().includes('windows') || !hardwareInterfaceDetected) return 'NOT_DETECTED';
  if (verifiedNativeHardware) return 'AVAILABLE';
  return 'INTERFACE_DETECTED_UNVERIFIED';
}

/**
 * KeyVault attestation capability audit.
 * A hardware claim is degraded unless a native provider can bind attestation to the actual KeyVault root.
 */
export async function runKeyVaultHardwareAttestation(
  claimedHardware: boolean = false
): Promise<AttestationReport> {
  const timestamp = Date.now();
  const [platformAuth, cryptoAttestation, nativeStatus] = await Promise.all([
    checkPlatformAuthenticator(),
    testNonExtractableCryptoKey(),
    readNativeKeyVaultStatus(),
  ]);

  const verifiedNativeHardware = Boolean(
    nativeStatus?.provider_available &&
      nativeStatus.secure_persistence &&
      nativeStatus.hardware_slot_supported &&
      nativeStatus.hardware_backed &&
      nativeStatus.hardware_attestation_verified
  );

  let tier: HardwareAttestationTier = 'SOFTWARE_KEYSTORE_FALLBACK';
  let verdict: AttestationVerdict = 'SOFTWARE_ONLY';
  let hardwareBacked = false;
  const tpmStatus = resolveTpmStatus(
    nativeStatus?.platform,
    nativeStatus?.hardware_interface_detected ?? false,
    verifiedNativeHardware,
  );
  let claimAuditedTruthfully = !claimedHardware;
  let explanation = '';

  if (verifiedNativeHardware && nativeStatus) {
    tier = nativeHardwareTier(nativeStatus);
    verdict = nativeHardwareVerdict(nativeStatus);
    hardwareBacked = true;
    claimAuditedTruthfully = true;
    explanation =
      `Verified native hardware slot: ${nativeStatus.provider_name}. ` +
      'The native provider reports secure persistence, hardware-backed root storage, and verified key-bound attestation.';
  } else if (nativeStatus?.hardware_interface_detected) {
    // Crucial SEC-012 downgrade rule: interface presence is never silently treated as a
    // usable hardware-backed root. The Rust provider policy fails root persistence closed.
    verdict = 'UNVERIFIED_CLAIM_DEGRADED';
    claimAuditedTruthfully = !claimedHardware;
    explanation =
      `Hardware security interface detected by ${nativeStatus.provider_name}, but no verified key-bound root slot is available. ` +
      'Hardware-backed persistence is therefore degraded and the native KeyVault policy fails closed instead of falling back silently.';
  } else if (claimedHardware) {
    verdict = 'UNVERIFIED_CLAIM_DEGRADED';
    claimAuditedTruthfully = false;
    explanation =
      'Hardware-backed KeyVault claim rejected: neither browser capability signals nor a separate WebCrypto key prove that the Workspace root is hardware-backed.';
  } else if (cryptoAttestation.nonExtractable) {
    tier = 'NON_EXTRACTABLE_SECURE_ELEMENT';
    verdict = 'VERIFIED_NON_EXTRACTABLE';
    explanation = platformAuth
      ? 'WebCrypto private-key export is blocked and a platform authenticator is available. No Workspace-root hardware claim is made without native key-bound attestation.'
      : 'WebCrypto non-extractable key semantics are available. No Workspace-root hardware claim is made.';
  } else {
    explanation =
      'No verified key-bound hardware attestation is available. Hardware backing is not asserted.';
  }

  return {
    tier,
    verdict,
    hardwareBacked,
    isNonExtractable: cryptoAttestation.nonExtractable,
    platformAuthenticatorAvailable: platformAuth,
    tpmStatus,
    attestationChallengeHex: cryptoAttestation.challengeHex,
    signatureDigestHex: cryptoAttestation.signatureDigestHex,
    claimAuditedTruthfully,
    providerName: nativeStatus?.provider_name ?? 'Browser-only capability audit',
    nativeProviderAvailable: Boolean(nativeStatus?.provider_available),
    hardwareSlotSupported: Boolean(nativeStatus?.hardware_slot_supported),
    hardwareAttestationVerified: Boolean(nativeStatus?.hardware_attestation_verified),
    explanation,
    timestamp,
  };
}
