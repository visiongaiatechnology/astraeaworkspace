import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { deserializeWorkspaceDocumentCanonical, serializeWorkspaceDocumentCanonical } from '../workspace/model/workspaceObjectModel';
import { randomBytesCsprng, WEB_CRYPTO_PBKDF2_ITERATIONS, zeroizeBrowserBytesBestEffort } from '../crypto/cryptoCore';
import { toOwnedArrayBuffer } from '../../shared/binary/ownedBufferSource';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAGIC_DEVICE = encoder.encode('VGT2');
const MAGIC_CREDENTIAL = encoder.encode('VGT3');
const MAGIC_DEVICE_PIN = encoder.encode('VGT4');
const MAGIC_DEVICE_ENVELOPE = encoder.encode('VGT5');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MAX_BROWSER_CONTAINER_BYTES = 128 * 1024 * 1024;
const MAX_DOCUMENT_JSON_BYTES = 96 * 1024 * 1024;

export type BrowserCredentialMode = 'pin' | 'password';

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function validateContainerSize(bytes: Uint8Array): void {
  if (bytes.byteLength < 4 || bytes.byteLength > MAX_BROWSER_CONTAINER_BYTES) {
    throw new Error('Container size boundary violation');
  }
}

const KNOWN_MAGICS: Readonly<Record<string, string>> = Object.freeze({
  VGT2: 'gerätegebunden (VGT2)',
  VGT3: 'PIN/Passwort (VGT3)',
  VGT4: 'Gerät+PIN (VGT4)',
  VGT5: 'Geräteumschlag (VGT5)',
});

/**
 * W-234: the magic was **written** by every packer but **checked** by only one unpacker.
 *
 * Feeding a container of the wrong format to a device unpacker therefore did not say so: the bytes were
 * parsed with the wrong layout, the GCM tag failed, and the user was told "decryption failed" — which
 * reads like a wrong key or a corrupted file, not like "this is a different container format". The check
 * is four bytes and turns a misleading failure into a named one.
 */
function requireContainerMagic(bytes: Uint8Array, expected: Uint8Array, expectedLabel: string): void {
  validateContainerSize(bytes);
  const magic = decoder.decode(bytes.subarray(0, 4));
  const expectedMagic = decoder.decode(expected);
  if (magic === expectedMagic) return;
  const actual = KNOWN_MAGICS[magic];
  throw new Error(actual
    ? `Containerformat passt nicht: erwartet ${expectedLabel}, gefunden ${actual}`
    : `Unbekanntes Containerformat: erwartet ${expectedLabel}`);
}

function documentBytes(document: WorkspaceDocument): Uint8Array {
  const bytes = encoder.encode(serializeWorkspaceDocumentCanonical(document));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOCUMENT_JSON_BYTES) {
    throw new Error('Document size boundary violation');
  }
  return bytes;
}

function decodeDocument(plaintext: ArrayBuffer): WorkspaceDocument {
  if (plaintext.byteLength === 0 || plaintext.byteLength > MAX_DOCUMENT_JSON_BYTES) {
    throw new Error('Decrypted document size boundary violation');
  }
  try {
    return deserializeWorkspaceDocumentCanonical(decoder.decode(plaintext));
  } catch (error) {
    throw new Error(error instanceof Error ? `Decrypted payload is not a valid WorkspaceDocument: ${error.message}` : 'Decrypted payload is not a valid WorkspaceDocument');
  }
}

function randomBytes(length: number): Uint8Array {
  return randomBytesCsprng(length);
}

function credentialModeByte(mode: BrowserCredentialMode): number {
  return mode === 'pin' ? 1 : 2;
}

function modeFromByte(value: number): BrowserCredentialMode {
  if (value === 1) return 'pin';
  if (value === 2) return 'password';
  throw new Error('Unsupported credential mode');
}

function validateCredential(mode: BrowserCredentialMode, credential: string): string {
  if (mode === 'pin') {
    const normalized = credential.trim();
    if (!/^\d{4,8}$/.test(normalized)) throw new Error('PIN must contain 4-8 digits');
    return normalized;
  }
  if (credential.length < 8 || credential.length > 128) {
    throw new Error('Portable password must contain 8-128 characters');
  }
  return credential;
}

async function deriveCredentialKey(mode: BrowserCredentialMode, credential: string, salt: Uint8Array): Promise<CryptoKey> {
  const normalized = validateCredential(mode, credential);
  const material = await globalThis.crypto.subtle.importKey(
    'raw', encoder.encode(normalized), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toOwnedArrayBuffer(salt), iterations: WEB_CRYPTO_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function packBrowserDeviceContainer(document: WorkspaceDocument, key: CryptoKey): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const plaintext = documentBytes(document);
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toOwnedArrayBuffer(iv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE) }, key, toOwnedArrayBuffer(plaintext),
  ));
  return concat([MAGIC_DEVICE, iv, ciphertext]);
}

export async function unpackBrowserDeviceContainer(bytes: Uint8Array, key: CryptoKey): Promise<WorkspaceDocument> {
  requireContainerMagic(bytes, MAGIC_DEVICE, 'gerätegebunden (VGT2)');
  if (bytes.byteLength < 4 + IV_BYTES + GCM_TAG_BYTES) throw new Error('Device container is truncated');
  const iv = bytes.subarray(4, 4 + IV_BYTES);
  const ciphertext = bytes.subarray(4 + IV_BYTES);
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(iv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE) }, key, toOwnedArrayBuffer(ciphertext),
    );
    return decodeDocument(plaintext);
  } catch {
    throw new Error('Device-bound container decryption failed');
  }
}


/**
 * Browser Device+PIN container. Every pack creates a fresh random document encryption
 * key (DEK). The DEK is wrapped by the non-exportable device key and that wrapped key
 * is independently protected by a PIN-derived key. Recovering the DEK therefore
 * requires both factors. Repacking rotates the DEK instead of merely rotating an IV.
 */
export async function packBrowserDevicePinContainer(
  document: WorkspaceDocument,
  deviceKey: CryptoKey,
  pin: string,
): Promise<Uint8Array> {
  const normalizedPin = validateCredential('pin', pin);
  const salt = randomBytes(SALT_BYTES);
  const pinIv = randomBytes(IV_BYTES);
  const deviceWrapIv = randomBytes(IV_BYTES);
  const contentIv = randomBytes(IV_BYTES);
  const rawDek = randomBytes(32);
  try {
    const dek = await globalThis.crypto.subtle.importKey('raw', toOwnedArrayBuffer(rawDek), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const documentCiphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(contentIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_PIN) },
      dek,
      toOwnedArrayBuffer(documentBytes(document)),
    ));
    const deviceWrappedDek = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(deviceWrapIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_PIN) },
      deviceKey,
      toOwnedArrayBuffer(rawDek),
    ));
    const pinKey = await deriveCredentialKey('pin', normalizedPin, salt);
    const doublyWrappedDek = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(pinIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_PIN) },
      pinKey,
      toOwnedArrayBuffer(deviceWrappedDek),
    ));
    return concat([MAGIC_DEVICE_PIN, salt, pinIv, deviceWrapIv, contentIv, doublyWrappedDek, documentCiphertext]);
  } finally {
    zeroizeBrowserBytesBestEffort(rawDek);
  }
}

export async function unpackBrowserDevicePinContainer(
  bytes: Uint8Array,
  deviceKey: CryptoKey,
  pin: string,
): Promise<WorkspaceDocument> {
  requireContainerMagic(bytes, MAGIC_DEVICE_PIN, 'Gerät+PIN (VGT4)');
  const WRAPPED_DEK_BYTES = 32 + GCM_TAG_BYTES + GCM_TAG_BYTES;
  const minimum = 4 + SALT_BYTES + IV_BYTES * 3 + WRAPPED_DEK_BYTES + GCM_TAG_BYTES;
  if (bytes.byteLength < minimum) throw new Error('Device+PIN container is truncated');
  const saltStart = 4;
  const pinIvStart = saltStart + SALT_BYTES;
  const deviceIvStart = pinIvStart + IV_BYTES;
  const contentIvStart = deviceIvStart + IV_BYTES;
  const wrappedDekStart = contentIvStart + IV_BYTES;
  const documentCipherStart = wrappedDekStart + WRAPPED_DEK_BYTES;
  const salt = bytes.subarray(saltStart, pinIvStart);
  const pinIv = bytes.subarray(pinIvStart, deviceIvStart);
  const deviceWrapIv = bytes.subarray(deviceIvStart, contentIvStart);
  const contentIv = bytes.subarray(contentIvStart, wrappedDekStart);
  const doublyWrappedDek = bytes.subarray(wrappedDekStart, documentCipherStart);
  const documentCiphertext = bytes.subarray(documentCipherStart);
  const pinKey = await deriveCredentialKey('pin', pin, salt);
  let deviceWrappedDek: Uint8Array;
  try {
    deviceWrappedDek = new Uint8Array(await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(pinIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_PIN) }, pinKey, toOwnedArrayBuffer(doublyWrappedDek),
    ));
  } catch {
    throw new Error('Decryption failed: invalid PIN');
  }
  let rawDek: Uint8Array;
  try {
    rawDek = new Uint8Array(await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(deviceWrapIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_PIN) }, deviceKey, toOwnedArrayBuffer(deviceWrappedDek),
    ));
  } catch {
    throw new Error('Device-bound container decryption failed');
  }
  try {
    const dek = await globalThis.crypto.subtle.importKey('raw', toOwnedArrayBuffer(rawDek), { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(contentIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_PIN) }, dek, toOwnedArrayBuffer(documentCiphertext),
    );
    return decodeDocument(plaintext);
  } catch {
    throw new Error('Device+PIN document authentication failed');
  } finally {
    zeroizeBrowserBytesBestEffort(rawDek);
  }
}

/**
 * Current browser device container. A fresh random DEK encrypts the document and is
 * wrapped by the persistent non-exportable device key. VGT2 remains read-compatible,
 * while VGT5 provides real per-save DEK rotation.
 */
export async function packBrowserDeviceEnvelopeContainer(document: WorkspaceDocument, deviceKey: CryptoKey): Promise<Uint8Array> {
  const wrapIv = randomBytes(IV_BYTES);
  const contentIv = randomBytes(IV_BYTES);
  const rawDek = randomBytes(32);
  try {
    const dek = await globalThis.crypto.subtle.importKey('raw', toOwnedArrayBuffer(rawDek), { name: 'AES-GCM' }, false, ['encrypt']);
    const documentCiphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(contentIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_ENVELOPE) }, dek, toOwnedArrayBuffer(documentBytes(document)),
    ));
    const wrappedDek = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(wrapIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_ENVELOPE) }, deviceKey, toOwnedArrayBuffer(rawDek),
    ));
    return concat([MAGIC_DEVICE_ENVELOPE, wrapIv, contentIv, wrappedDek, documentCiphertext]);
  } finally {
    zeroizeBrowserBytesBestEffort(rawDek);
  }
}

export async function unpackBrowserDeviceEnvelopeContainer(bytes: Uint8Array, deviceKey: CryptoKey): Promise<WorkspaceDocument> {
  requireContainerMagic(bytes, MAGIC_DEVICE_ENVELOPE, 'Geräteumschlag (VGT5)');
  const WRAPPED_DEK_BYTES = 32 + GCM_TAG_BYTES;
  const minimum = 4 + IV_BYTES * 2 + WRAPPED_DEK_BYTES + GCM_TAG_BYTES;
  if (bytes.byteLength < minimum) throw new Error('Device container is truncated');
  const wrapIvStart = 4;
  const contentIvStart = wrapIvStart + IV_BYTES;
  const wrappedDekStart = contentIvStart + IV_BYTES;
  const documentCipherStart = wrappedDekStart + WRAPPED_DEK_BYTES;
  const wrapIv = bytes.subarray(wrapIvStart, contentIvStart);
  const contentIv = bytes.subarray(contentIvStart, wrappedDekStart);
  const wrappedDek = bytes.subarray(wrappedDekStart, documentCipherStart);
  const documentCiphertext = bytes.subarray(documentCipherStart);
  let rawDek: Uint8Array;
  try {
    rawDek = new Uint8Array(await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(wrapIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_ENVELOPE) }, deviceKey, toOwnedArrayBuffer(wrappedDek),
    ));
  } catch {
    throw new Error('Device-bound container decryption failed');
  }
  try {
    const dek = await globalThis.crypto.subtle.importKey('raw', toOwnedArrayBuffer(rawDek), { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(contentIv), additionalData: toOwnedArrayBuffer(MAGIC_DEVICE_ENVELOPE) }, dek, toOwnedArrayBuffer(documentCiphertext),
    );
    return decodeDocument(plaintext);
  } catch {
    throw new Error('Device container authentication failed');
  } finally {
    zeroizeBrowserBytesBestEffort(rawDek);
  }
}

export async function packBrowserCredentialContainer(
  document: WorkspaceDocument,
  mode: BrowserCredentialMode,
  credential: string,
): Promise<Uint8Array> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const modeByte = new Uint8Array([credentialModeByte(mode)]);
  const aad = concat([MAGIC_CREDENTIAL, modeByte]);
  const key = await deriveCredentialKey(mode, credential, salt);
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toOwnedArrayBuffer(iv), additionalData: toOwnedArrayBuffer(aad) }, key, toOwnedArrayBuffer(documentBytes(document)),
  ));
  return concat([MAGIC_CREDENTIAL, modeByte, salt, iv, ciphertext]);
}

export function inspectBrowserCredentialMode(bytes: Uint8Array): BrowserCredentialMode {
  validateContainerSize(bytes);
  if (decoder.decode(bytes.subarray(0, 4)) !== 'VGT3') throw new Error('Not a credential-bound browser container');
  return modeFromByte(bytes[4]);
}

export async function unpackBrowserCredentialContainer(bytes: Uint8Array, credential: string): Promise<WorkspaceDocument> {
  requireContainerMagic(bytes, MAGIC_CREDENTIAL, 'PIN/Passwort (VGT3)');
  const minimum = 4 + 1 + SALT_BYTES + IV_BYTES + GCM_TAG_BYTES;
  if (bytes.byteLength < minimum) throw new Error('Credential container is truncated');
  const mode = modeFromByte(bytes[4]);
  const saltStart = 5;
  const ivStart = saltStart + SALT_BYTES;
  const cipherStart = ivStart + IV_BYTES;
  const salt = bytes.subarray(saltStart, ivStart);
  const iv = bytes.subarray(ivStart, cipherStart);
  const ciphertext = bytes.subarray(cipherStart);
  const aad = bytes.subarray(0, 5);
  const key = await deriveCredentialKey(mode, credential, salt);
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: toOwnedArrayBuffer(iv), additionalData: toOwnedArrayBuffer(aad) }, key, toOwnedArrayBuffer(ciphertext));
    return decodeDocument(plaintext);
  } catch {
    throw new Error(mode === 'pin' ? 'Decryption failed: invalid PIN' : 'Decryption failed: invalid password');
  }
}
