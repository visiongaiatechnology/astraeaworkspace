import { toOwnedArrayBuffer } from '../../shared/binary/ownedBufferSource';
export const WEB_CRYPTO_SUITE_VERSION = 1 as const;
export const WEB_CRYPTO_PROFILE_ID = 'vgt-webcrypto-v1' as const;
export const WEB_CRYPTO_PBKDF2_ITERATIONS = 310_000;
export const WEB_CRYPTO_KEY_BYTES = 32;
export const WEB_CRYPTO_NONCE_BYTES = 12;
export const MAX_HKDF_CONTEXT_BYTES = 1024;

export type BrowserCryptoDomain =
  | 'container-chunk'
  | 'device-key-slot'
  | 'device-pin-key-slot'
  | 'portable-password-key-slot'
  | 'application-secret'
  | 'backup';

const DOMAIN_LABELS: Readonly<Record<BrowserCryptoDomain, string>> = {
  'container-chunk': 'vgt.crypto.web.v1.container-chunk',
  'device-key-slot': 'vgt.crypto.web.v1.keyslot.device',
  'device-pin-key-slot': 'vgt.crypto.web.v1.keyslot.device-pin',
  'portable-password-key-slot': 'vgt.crypto.web.v1.keyslot.portable-password',
  'application-secret': 'vgt.crypto.web.v1.application-secret',
  backup: 'vgt.crypto.web.v1.backup',
};

const encoder = new TextEncoder();

export interface BrowserCryptoPolicyRequest {
  recipientPublicKey?: string | null;
  recipientPrivateKey?: string | null;
  securityProfile?: 'standard' | 'top-secret';
}

export function requireWebCrypto(): Crypto {
  const candidate = globalThis.crypto;
  if (!candidate?.subtle || typeof candidate.getRandomValues !== 'function') {
    throw new Error('Production WebCrypto is unavailable');
  }
  return candidate;
}

export function randomBytesCsprng(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0 || length > 65_536) {
    throw new Error('CSPRNG request boundary violation');
  }
  const output = new Uint8Array(length);
  requireWebCrypto().getRandomValues(output);
  return output;
}


/**
 * Fixed-work browser byte comparison for non-WebCrypto protocol glue. JavaScript engines cannot
 * provide the same timing proof as Rust `subtle`; all MAC/tag verification remains delegated to
 * WebCrypto/native crypto. This helper deliberately performs no data-dependent early return.
 */
export function constantTimeEqualBrowserBytes(left: Uint8Array, right: Uint8Array): boolean {
  const max = Math.max(left.byteLength, right.byteLength);
  let diff = left.byteLength ^ right.byteLength;
  for (let index = 0; index < max; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

export async function deriveHkdfSha256(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  domain: BrowserCryptoDomain,
  context: Uint8Array = new Uint8Array(),
  lengthBytes = WEB_CRYPTO_KEY_BYTES,
): Promise<Uint8Array> {
  if (!inputKeyMaterial.byteLength || !salt.byteLength || context.byteLength > MAX_HKDF_CONTEXT_BYTES) {
    throw new Error('HKDF input boundary violation');
  }
  if (!Number.isInteger(lengthBytes) || lengthBytes <= 0 || lengthBytes > 8_160) {
    throw new Error('HKDF output boundary violation');
  }
  const cryptoApi = requireWebCrypto();
  const material = await cryptoApi.subtle.importKey('raw', toOwnedArrayBuffer(inputKeyMaterial), 'HKDF', false, ['deriveBits']);
  const label = encoder.encode(DOMAIN_LABELS[domain]);
  const info = new Uint8Array(label.byteLength + 1 + context.byteLength);
  info.set(label, 0);
  info[label.byteLength] = 0;
  info.set(context, label.byteLength + 1);
  const bits = await cryptoApi.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toOwnedArrayBuffer(salt), info: toOwnedArrayBuffer(info) },
    material,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Browser memory erasure is best-effort only. JavaScript engines may retain copies in
 * registers, GC arenas, snapshots, crash dumps, or immutable strings. Use non-exportable
 * CryptoKey objects for long-lived keys and wipe only mutable byte buffers we own.
 */
export function zeroizeBrowserBytesBestEffort(bytes: Uint8Array): void {
  bytes.fill(0);
}

/**
 * A browser profile may be used only for policies it can faithfully satisfy. X25519
 * recipient slots remain native-only here; they never degrade to password/device wrapping.
 */
export function assertBrowserCryptoPolicy(request: BrowserCryptoPolicyRequest): typeof WEB_CRYPTO_PROFILE_ID {
  if (request.securityProfile === 'top-secret') {
    throw new Error('Top Secret requires the native vgt-top-secret / VGT Infinity provider');
  }
  if (request.recipientPublicKey?.trim() || request.recipientPrivateKey?.trim()) {
    throw new Error('Recipient encryption requires the native X25519 KeyVault provider');
  }
  requireWebCrypto();
  return WEB_CRYPTO_PROFILE_ID;
}
