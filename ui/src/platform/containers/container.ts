import { toOwnedArrayBuffer } from '../../shared/binary/ownedBufferSource';
import { WorkspaceDocument } from '../../shared/contracts/workspace';
import { migrateWorkspaceDocument } from '../workspace/model/workspaceObjectModel';
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import { getOrCreateBrowserDeviceKey } from './browserDeviceKey';
import { assertBrowserCryptoPolicy, requireWebCrypto } from '../crypto/cryptoCore';
import { securityPolicyForDocument } from '../security/securityProfiles';
import { authenticatedIpcFetch } from '../native/ipcAuth';
import { assertDocumentOpenNetworkIsolated } from '../security/documentNetworkIsolation';
import { importVgtInfinityContainer, isStandaloneInfinityContainer, isTopSecretOuterContainer, packTopSecretContainer, unpackTopSecretContainer } from '../security/topSecretEngine';
import {
  inspectBrowserCredentialMode,
  packBrowserCredentialContainer,
  packBrowserDevicePinContainer,
  packBrowserDeviceEnvelopeContainer,
  unpackBrowserCredentialContainer,
  unpackBrowserDevicePinContainer,
  unpackBrowserDeviceContainer,
  unpackBrowserDeviceEnvelopeContainer,
} from './browserContainerCrypto';
import { parseHostileJson } from '../../shared/security/hostileJson';
import { assertWorkspaceContainerBytes, decodeWorkspaceContainerBase64, encodeWorkspaceContainerBase64 } from './workspaceContainerBase64';

/**
 * Sovereign Core Desktop IPC Endpoint
 * Single authoritative Rust Workspace Core for Cryptography, KeyVault, and Container.
 */
export { VGT_IPC_ENDPOINT } from '../native/ipcAuth';

export interface PackOptions {
  pin?: string;
  password?: string;
  recipientPublicKey?: string;
}

export interface UnpackOptions {
  pin?: string;
  password?: string;
  recipientPrivateKey?: string;
}

/**
 * WebCrypto fallback to securely encrypt and package a WorkspaceDocument
 * when neither native desktop nor the local Rust IPC daemon (5042) is reachable.
 */
async function packWebCryptoFallback(doc: WorkspaceDocument, options: PackOptions): Promise<Uint8Array> {
  doc = migrateWorkspaceDocument(doc);
  requireWebCrypto();
  assertBrowserCryptoPolicy({ recipientPublicKey: options.recipientPublicKey });
  const pin = options.pin?.trim();
  if (pin) {
    // Device+PIN is a cryptographic AND in the browser fallback too. The inner
    // document is protected by the non-exportable device key and the complete
    // inner envelope is independently wrapped by a PIN-derived key.
    const deviceKey = await getOrCreateBrowserDeviceKey();
    return packBrowserDevicePinContainer(doc, deviceKey, pin);
  }
  if (options.password) return packBrowserCredentialContainer(doc, 'password', options.password);

  // Encrypted-by-default browser fallback. The non-exportable device key is persisted
  // through IndexedDB and never serialized into the container or LocalStorage.
  const deviceKey = await getOrCreateBrowserDeviceKey();
  return packBrowserDeviceEnvelopeContainer(doc, deviceKey);
}

/**
 * Local-only encrypted container path used by browser autosave/recovery.
 * It never probes the loopback IPC endpoint and therefore keeps offline
 * persistence independent from network availability while retaining the
 * same authenticated VGT2/VGT3 container format.
 */
export async function packLocalEncryptedContainer(
  doc: WorkspaceDocument,
  options: PackOptions = {},
): Promise<Uint8Array> {
  doc = migrateWorkspaceDocument(doc);
  if (securityPolicyForDocument(doc).profile === 'VGT_TOP_SECRET') {
    if (!isNativeDesktop()) throw new Error('TS_PROVIDER_UNAVAILABLE');
    return packTopSecretContainer(doc, { pin: options.pin, password: options.password });
  }
  if (securityPolicyForDocument(doc).profile === 'PQC') throw new Error('PQC_PROFILE_NOT_OPERATIONAL');
  return packWebCryptoFallback(doc, options);
}

async function unpackLegacyVgt1(bytes: Uint8Array, options: UnpackOptions): Promise<WorkspaceDocument> {
  const credential = options.pin || options.password;
  if (!credential) throw new Error('PASSWORD_REQUIRED');
  if (bytes.byteLength < 48) throw new Error('Legacy encrypted container is truncated');
  const dec = new TextDecoder('utf-8', { fatal: true });
  const salt = bytes.subarray(4, 20);
  const iv = bytes.subarray(20, 32);
  const cipherBytes = bytes.subarray(32);
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw', enc.encode(credential), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  const derivedKey = await globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toOwnedArrayBuffer(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: toOwnedArrayBuffer(iv) }, derivedKey, toOwnedArrayBuffer(cipherBytes));
    const parsed = parseHostileJson(dec.decode(plaintext), { maxBytes: 128 * 1024 * 1024, maxDepth: 160, maxNodes: 4_000_000, maxStringChars: 128 * 1024 * 1024, maxObjectKeys: 1_000_000, maxArrayItems: 1_000_000 });
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { id?: unknown }).id !== 'string') {
      throw new Error('Invalid legacy WorkspaceDocument');
    }
    return migrateWorkspaceDocument(parsed);
  } catch {
    throw new Error('Decryption failed: invalid PIN or password');
  }
}

/** WebCrypto compatibility reader. VGT0/VGT1 are legacy read-only formats. */
async function unpackWebCryptoFallback(bytes: Uint8Array, options: UnpackOptions): Promise<WorkspaceDocument> {
  requireWebCrypto();
  if (bytes.byteLength < 4 || bytes.byteLength > 128 * 1024 * 1024) throw new Error('Container size boundary violation');
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));

  if (magic === 'VGT2') {
    const deviceKey = await getOrCreateBrowserDeviceKey();
    return unpackBrowserDeviceContainer(bytes, deviceKey);
  }
  if (magic === 'VGT3') {
    const mode = inspectBrowserCredentialMode(bytes);
    const credential = mode === 'pin' ? options.pin : options.password;
    if (!credential) throw new Error(mode === 'pin' ? 'PIN_REQUIRED' : 'PASSWORD_REQUIRED');
    return unpackBrowserCredentialContainer(bytes, credential);
  }
  if (magic === 'VGT4') {
    if (!options.pin) throw new Error('PIN_REQUIRED');
    const deviceKey = await getOrCreateBrowserDeviceKey();
    return unpackBrowserDevicePinContainer(bytes, deviceKey, options.pin);
  }
  if (magic === 'VGT5') {
    const deviceKey = await getOrCreateBrowserDeviceKey();
    return unpackBrowserDeviceEnvelopeContainer(bytes, deviceKey);
  }
  if (magic === 'VGT1') return unpackLegacyVgt1(bytes, options);
  if (magic === 'VGT0') {
    // Legacy import only. New containers never emit VGT0.
    try {
      const parsed = parseHostileJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4)), { maxBytes: 128 * 1024 * 1024, maxDepth: 160, maxNodes: 4_000_000, maxStringChars: 128 * 1024 * 1024, maxObjectKeys: 1_000_000, maxArrayItems: 1_000_000 });
      if (!parsed || typeof parsed !== 'object' || typeof (parsed as { id?: unknown }).id !== 'string') {
        throw new Error('Invalid legacy WorkspaceDocument');
      }
      return migrateWorkspaceDocument(parsed);
    } catch {
      throw new Error('Legacy VGT0 container is invalid');
    }
  }
  throw new Error('Unrecognized container format');
}

/** Local-only counterpart to packLocalEncryptedContainer for IndexedDB persistence. */
export async function unpackLocalEncryptedContainer(
  bytes: Uint8Array,
  options: UnpackOptions = {},
): Promise<WorkspaceDocument> {
  assertWorkspaceContainerBytes(bytes);
  if (isTopSecretOuterContainer(bytes)) {
    return assertDocumentOpenNetworkIsolated(await unpackTopSecretContainer(bytes, { pin: options.pin, password: options.password, recipientPrivateKey: options.recipientPrivateKey }));
  }
  if (isStandaloneInfinityContainer(bytes)) {
    return assertDocumentOpenNetworkIsolated(await importVgtInfinityContainer(bytes, { pin: options.pin, password: options.password, recipientPrivateKey: options.recipientPrivateKey }));
  }
  return assertDocumentOpenNetworkIsolated(await unpackWebCryptoFallback(bytes, options));
}

function isIpcTransportUnavailable(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Packs a WorkspaceDocument into an authentic VWC binary file using the authoritative
 * Rust Core or sovereign client WebCrypto fallback when offline.
 */
export async function packContainer(
  doc: WorkspaceDocument,
  options: PackOptions = {}
): Promise<Uint8Array> {
  doc = migrateWorkspaceDocument(doc);
  const profile = securityPolicyForDocument(doc).profile;
  if (profile === 'VGT_TOP_SECRET') {
    if (!isNativeDesktop()) throw new Error('TS_PROVIDER_UNAVAILABLE');
    return packTopSecretContainer(doc, { pin: options.pin, password: options.password });
  }
  if (profile === 'PQC') throw new Error('PQC_PROFILE_NOT_OPERATIONAL');
  if (isNativeDesktop()) {
    const data = await invokeNative<{ success?: boolean; container_base64?: string | null; error?: string | null }>('vgt_pack_container', {
      request: {
        document: doc,
        pin: options.pin || null,
        password: options.password || null,
        recipient_public_key: options.recipientPublicKey || null,
      },
    });
    if (!data.success || !data.container_base64) {
      throw new Error(data.error || 'Rust Core container packing failed');
    }
    return decodeWorkspaceContainerBase64(data.container_base64);
  }

  // Attempt Rust IPC Server at port 5042. Only a transport-level outage may fall back.
  // An HTTP response or explicit Core rejection is authoritative and stays fail-closed.
  try {
    const response = await authenticatedIpcFetch('/api/v1/container/pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: doc,
        pin: options.pin || null,
        password: options.password || null,
        recipient_public_key: options.recipientPublicKey || null,
      }),
    });
    if (!response.ok) throw new Error(`Rust Core container packing rejected request (${response.status})`);
    const data = await response.json() as { success?: boolean; container_base64?: string | null; error?: string | null };
    if (!data.success || !data.container_base64) throw new Error(data.error || 'Rust Core container packing failed');
    return decodeWorkspaceContainerBase64(data.container_base64);
  } catch (error) {
    if (!isIpcTransportUnavailable(error)) throw error;
  }

  assertBrowserCryptoPolicy({ recipientPublicKey: options.recipientPublicKey });
  return packWebCryptoFallback(doc, options);
}

/**
 * Decrypts and unpacks a VWC container via Rust Workspace Core or sovereign client fallback.
 */
export async function unpackContainer(
  bytes: Uint8Array,
  credentials?: string | UnpackOptions
): Promise<WorkspaceDocument> {
  assertWorkspaceContainerBytes(bytes);
  let pin: string | null = null;
  let password: string | null = null;
  let recipientPrivateKey: string | null = null;

  if (typeof credentials === 'string') {
    if (/^\d{4,8}$/.test(credentials)) pin = credentials;
    else password = credentials;
  } else if (credentials) {
    pin = credentials.pin || null;
    password = credentials.password || null;
    recipientPrivateKey = credentials.recipientPrivateKey || null;
  }

  if (isTopSecretOuterContainer(bytes)) {
    return assertDocumentOpenNetworkIsolated(await unpackTopSecretContainer(bytes, {
      pin: pin || undefined,
      password: password || undefined,
      recipientPrivateKey: recipientPrivateKey || undefined,
    }));
  }

  if (isStandaloneInfinityContainer(bytes)) {
    return assertDocumentOpenNetworkIsolated(await importVgtInfinityContainer(bytes, {
      pin: pin || undefined,
      password: password || undefined,
      recipientPrivateKey: recipientPrivateKey || undefined,
    }));
  }

  // Check if this is a WebCrypto sovereign container
  const dec = new TextDecoder();
  const magic = dec.decode(bytes.subarray(0, 4));
  if (magic === 'VGT0' || magic === 'VGT1' || magic === 'VGT2' || magic === 'VGT3' || magic === 'VGT4' || magic === 'VGT5') {
    if (recipientPrivateKey) {
      throw new Error('RecipientOnly native container could not reach the X25519 KeyVault provider');
    }
    return assertDocumentOpenNetworkIsolated(await unpackWebCryptoFallback(bytes, { pin: pin || undefined, password: password || undefined }));
  }

  const base64 = encodeWorkspaceContainerBase64(bytes);

  if (isNativeDesktop()) {
    const data = await invokeNative<{
      success?: boolean;
      document?: WorkspaceDocument | null;
      error?: string | null;
      requires_pin?: boolean;
      requires_password?: boolean;
    }>('vgt_unpack_container', {
      request: { container_base64: base64, pin, password, recipient_private_key: recipientPrivateKey },
    });
    if (data.requires_pin) throw new Error('PIN_REQUIRED');
    if (data.requires_password) throw new Error('PASSWORD_REQUIRED');
    if (data.error === 'RECIPIENT_KEY_REQUIRED') throw new Error('RECIPIENT_KEY_REQUIRED');
    if (!data.success || !data.document) throw new Error(data.error || 'Decryption failed');
    return assertDocumentOpenNetworkIsolated(migrateWorkspaceDocument(data.document));
  }

  // Attempt Rust IPC Server at port 5042
  try {
    const response = await authenticatedIpcFetch('/api/v1/container/unpack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ container_base64: base64, pin, password, recipient_private_key: recipientPrivateKey }),
    });
    if (response.ok) {
      const data = await response.json() as {
        success?: boolean;
        document?: WorkspaceDocument | null;
        error?: string | null;
        requires_pin?: boolean;
        requires_password?: boolean;
      };
      if (data.requires_pin) throw new Error('PIN_REQUIRED');
      if (data.requires_password) throw new Error('PASSWORD_REQUIRED');
      if (data.error === 'RECIPIENT_KEY_REQUIRED') throw new Error('RECIPIENT_KEY_REQUIRED');
      if (data.success && data.document) return assertDocumentOpenNetworkIsolated(migrateWorkspaceDocument(data.document));
      throw new Error(data.error || 'Rust Core container decryption failed');
    }
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'PIN_REQUIRED' ||
      error.message === 'PASSWORD_REQUIRED' ||
      error.message === 'RECIPIENT_KEY_REQUIRED' ||
      !error.message.toLowerCase().includes('fetch')
    )) {
      throw error;
    }
    // IPC unreachable: only legacy/browser-native formats may use the local fallback below.
  }

  assertBrowserCryptoPolicy({ recipientPrivateKey });
  return assertDocumentOpenNetworkIsolated(await unpackWebCryptoFallback(bytes, { pin: pin || undefined, password: password || undefined }));
}
