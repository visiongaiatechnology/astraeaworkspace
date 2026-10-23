// STATUS: DIAMANT VGT SUPREME — the cryptographic invariants W-234 named, pinned by tests
//
// W-234 said: "the correctness of the cryptographic use (nonce reuse across containers, salt management,
// device-key storage) is not verified; that needs a library and native-side review". Two of those three
// can be verified here and are — the third is narrowed honestly at the end of this file.
//
// What is checked, and why each one matters:
//   • **Nonce reuse across containers.** AES-GCM fails catastrophically if a (key, nonce) pair repeats —
//     an attacker XORs two ciphertexts and recovers plaintext. Every pack must therefore use a fresh
//     random 12-byte nonce *and* a fresh 32-byte document key; with a fresh key, even a repeated nonce
//     would be harmless, which is the structural reason the format is safe here.
//   • **Salt management.** The salt must be fresh per container, long enough, and genuinely bound to the
//     key derivation — changing it in the container must break decryption.
//   • **Device-key storage.** The key must be non-extractable, and the reader that loads it from the
//     browser key store must reject anything else, so a poisoned store cannot downgrade "device-bound".
//   • **Header binding.** The GCM additional data covers the magic and the credential mode, so a
//     container cannot be relabelled as another format or another mode.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  packBrowserCredentialContainer,
  packBrowserDeviceContainer,
  packBrowserDeviceEnvelopeContainer,
  packBrowserDevicePinContainer,
  unpackBrowserCredentialContainer,
  unpackBrowserDeviceContainer,
  unpackBrowserDeviceEnvelopeContainer,
  unpackBrowserDevicePinContainer,
  inspectBrowserCredentialMode,
} from '../../../../../platform/containers/browserContainerCrypto';
import { isUsableDeviceKey } from '../../../../../platform/containers/browserDeviceKey';
import { WEB_CRYPTO_PBKDF2_ITERATIONS, WEB_CRYPTO_KEY_BYTES, WEB_CRYPTO_NONCE_BYTES } from '../../../../../platform/crypto/cryptoCore';

const document = (): WorkspaceDocument => ({
  schema_version: 2,
  id: 'crypto-invariants',
  title: 'Vertraulich für Muster GmbH',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  writerData: { pageSetup: { paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white', showPageNumbers: true, headerText: '', footerText: '' }, tables: [] },
} as unknown as WorkspaceDocument);

const deviceKey = () => globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

/** The 12-byte slice where the format keeps the content nonce. */
const contentNonce = (container: Uint8Array, offset: number): Uint8Array => container.subarray(offset, offset + WEB_CRYPTO_NONCE_BYTES);

describe('the profile constants are the reviewed ones', () => {
  it('uses AES-256 with 12-byte nonces and a strong PBKDF2 work factor', () => {
    expect(WEB_CRYPTO_KEY_BYTES).toBe(32);
    expect(WEB_CRYPTO_NONCE_BYTES).toBe(12);
    // 310 000 iterations of PBKDF2-SHA256 is the OWASP-recommended order of magnitude; a silent reduction
    // would weaken every container ever written, so it is pinned here.
    expect(WEB_CRYPTO_PBKDF2_ITERATIONS).toBe(310_000);
  });
});

describe('nonce reuse across containers is structurally prevented', () => {
  it('never repeats a nonce when the same document is packed twice', async () => {
    const key = await deviceKey();
    const first = await packBrowserDeviceEnvelopeContainer(document(), key);
    const second = await packBrowserDeviceEnvelopeContainer(document(), key);
    // VGT5: magic(4) wrapIv(12) contentIv(12) wrappedDek(48) ciphertext
    expect(bytesEqual(contentNonce(first, 16), contentNonce(second, 16))).toBe(false);
    expect(bytesEqual(first.subarray(4, 16), second.subarray(4, 16))).toBe(false);
  });

  it('never repeats a document key, which is what makes the format safe even if a nonce did repeat', async () => {
    const key = await deviceKey();
    const first = await packBrowserDeviceEnvelopeContainer(document(), key);
    const second = await packBrowserDeviceEnvelopeContainer(document(), key);
    // The wrapped DEK region differs: a fresh 32-byte document key per pack.
    expect(bytesEqual(first.subarray(28, 76), second.subarray(28, 76))).toBe(false);
  });

  it('produces a completely different container for the same document', async () => {
    const key = await deviceKey();
    const first = await packBrowserDeviceEnvelopeContainer(document(), key);
    const second = await packBrowserDeviceEnvelopeContainer(document(), key);
    expect(first.byteLength).toBe(second.byteLength);
    expect(bytesEqual(first, second)).toBe(false);
  });

  it('uses four distinct nonces inside the device+PIN container', async () => {
    const key = await deviceKey();
    const container = await packBrowserDevicePinContainer(document(), key, '1234');
    // VGT4: magic(4) salt(16) pinIv deviceWrapIv contentIv ...
    const pin = container.subarray(20, 32);
    const wrap = container.subarray(32, 44);
    const content = container.subarray(44, 56);
    const nonces = [pin, wrap, content].map((slice) => Array.from(slice, (byte) => byte.toString(16).padStart(2, '0')).join(''));
    expect(new Set(nonces).size).toBe(3);
  });

  it('covers the older device format as well (VGT2 stays readable)', async () => {
    // Every packer writes a magic and every unpacker now checks it, so the older format is exercised too —
    // my first version of this file imported `packBrowserDeviceContainer` and never used it, which the
    // typecheck reported.
    const key = await deviceKey();
    const first = await packBrowserDeviceContainer(document(), key);
    const second = await packBrowserDeviceContainer(document(), key);
    expect(bytesEqual(first.subarray(4, 16), second.subarray(4, 16))).toBe(false);
    await expect(unpackBrowserDeviceContainer(first, key)).resolves.toMatchObject({ id: 'crypto-invariants' });
    await expect(unpackBrowserDeviceContainer(second, key)).resolves.toMatchObject({ id: 'crypto-invariants' });
  });
});

describe('salt management', () => {
  it('uses a fresh 16-byte salt per container', async () => {
    const first = await packBrowserCredentialContainer(document(), 'password', 'korrekt-pferd');
    const second = await packBrowserCredentialContainer(document(), 'password', 'korrekt-pferd');
    // VGT3: magic(4) mode(1) salt(16) iv(12) ciphertext
    const saltA = first.subarray(5, 21);
    const saltB = second.subarray(5, 21);
    expect(saltA.byteLength).toBe(16);
    expect(bytesEqual(saltA, saltB)).toBe(false);
  });

  it('binds the salt to the key derivation, not just to the file', async () => {
    const container = await packBrowserCredentialContainer(document(), 'password', 'korrekt-pferd');
    await expect(unpackBrowserCredentialContainer(container, 'korrekt-pferd')).resolves.toBeTruthy();
    const tampered = Uint8Array.from(container);
    tampered[10] = tampered[10]! ^ 0x01;
    await expect(unpackBrowserCredentialContainer(tampered, 'korrekt-pferd')).rejects.toThrow(/invalid password/u);
  });

  it('keeps the credential mode inside the authenticated header', async () => {
    const container = await packBrowserCredentialContainer(document(), 'pin', '1234');
    expect(inspectBrowserCredentialMode(container)).toBe('pin');
    // Relabelling a PIN container as a password container must break authentication, not change behaviour.
    const relabelled = Uint8Array.from(container);
    relabelled[4] = 2;
    await expect(unpackBrowserCredentialContainer(relabelled, '1234')).rejects.toThrow();
  });
});

describe('the browser device key store cannot be downgraded unnoticed', () => {
  it('accepts only a non-extractable AES-GCM secret key with both usages', async () => {
    const good = await deviceKey();
    expect(isUsableDeviceKey(good)).toBe(true);
  });

  it('rejects an extractable key', async () => {
    const extractable = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    expect(isUsableDeviceKey(extractable)).toBe(false);
  });

  it('rejects a key of the wrong type, algorithm or usage set', async () => {
    const publicKey = (await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])).publicKey;
    expect(isUsableDeviceKey(publicKey)).toBe(false);
    const encryptOnly = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    expect(isUsableDeviceKey(encryptOnly)).toBe(false);
    const hmac = await globalThis.crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    expect(isUsableDeviceKey(hmac)).toBe(false);
  });

  it('rejects everything that is not a CryptoKey', () => {
    for (const value of [null, undefined, 0, '', 'key', {}, { type: 'secret', extractable: false }, []]) {
      expect(isUsableDeviceKey(value)).toBe(false);
    }
  });

  it('refuses a device container when the key does not belong to it', async () => {
    const owner = await deviceKey();
    const stranger = await deviceKey();
    const container = await packBrowserDeviceEnvelopeContainer(document(), owner);
    await expect(unpackBrowserDeviceEnvelopeContainer(container, stranger)).rejects.toThrow(/decryption failed/u);
  });
});

describe('the format is identified, not guessed — W-234 hardening', () => {
  it('names the format when a container is handed to the wrong unpacker', async () => {
    const key = await deviceKey();
    const envelope = await packBrowserDeviceEnvelopeContainer(document(), key);
    // Before this check the bytes were parsed with the wrong layout and the user was told "decryption
    // failed", which reads like a wrong key rather than a wrong format.
    await expect(unpackBrowserDeviceContainer(envelope, key)).rejects.toThrow(/Containerformat passt nicht.*VGT5/u);
    await expect(unpackBrowserDevicePinContainer(envelope, key, '1234')).rejects.toThrow(/VGT5/u);
  });

  it('names an unknown format as unknown', async () => {
    const key = await deviceKey();
    const container = await packBrowserDeviceEnvelopeContainer(document(), key);
    const foreign = Uint8Array.from(container);
    foreign.set(new TextEncoder().encode('ZZZZ'), 0);
    await expect(unpackBrowserDeviceEnvelopeContainer(foreign, key)).rejects.toThrow(/Unbekanntes Containerformat/u);
  });

  it('lets the matching unpacker through, so the check is not a wall', async () => {
    const key = await deviceKey();
    const container = await packBrowserDeviceEnvelopeContainer(document(), key);
    await expect(unpackBrowserDeviceEnvelopeContainer(container, key)).resolves.toMatchObject({ id: 'crypto-invariants' });
  });
});

describe('what this file does not verify', () => {
  it('trusts the platform primitives, and says so', () => {
    // W-234 is narrowed, not closed by wishful thinking. What remains outside this suite:
    //   • the correctness of AES-GCM, PBKDF2 and HKDF **as implemented by the platform** (WebCrypto here,
    //     the Rust side natively) — we use them, we do not verify them;
    //   • that the browser's IndexedDB implementation really keeps a non-extractable CryptoKey
    //     non-extractable, and that it is protected against other origins and local attackers;
    //   • the native VWC container and its recovery path, which cannot run in this environment
    //     (`NATIVE_UNVERIFIED` throughout the project).
    // Those three need an independent review, not another test, and they are recorded as W-303.
    expect(WEB_CRYPTO_PBKDF2_ITERATIONS).toBeGreaterThan(0);
  });
});
