import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  inspectBrowserCredentialMode,
  packBrowserCredentialContainer,
  packBrowserDeviceContainer,
  unpackBrowserCredentialContainer,
  unpackBrowserDeviceContainer,
} from '../../../platform/containers/browserContainerCrypto';

const document: WorkspaceDocument = {
  id: 'writer-q', title: 'Ciphertext only', kind: 'Writer', created_at: 1, modified_at: 1,
  version: 7, theme_id: 'astraea-dark', root_object_ids: [], objects: {},
};
const magic = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(0, 4));

async function deviceKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

describe('encrypted browser container packet Q', () => {
  it('uses device-bound AES-GCM by default and rejects another device key', async () => {
    const first = await deviceKey();
    const second = await deviceKey();
    const bytes = await packBrowserDeviceContainer(document, first);
    expect(magic(bytes)).toBe('VGT2');
    expect(new TextDecoder().decode(bytes).includes('Ciphertext only')).toBe(false);
    expect((await unpackBrowserDeviceContainer(bytes, first)).id).toBe(document.id);
    await expect(unpackBrowserDeviceContainer(bytes, second)).rejects.toThrow();
  });

  it('records PIN mode in authenticated credential-bound containers', async () => {
    const bytes = await packBrowserCredentialContainer(document, 'pin', '482913');
    expect(magic(bytes)).toBe('VGT3');
    expect(inspectBrowserCredentialMode(bytes)).toBe('pin');
    expect((await unpackBrowserCredentialContainer(bytes, '482913')).title).toBe(document.title);
    await expect(unpackBrowserCredentialContainer(bytes, '482914')).rejects.toThrow();
  });

  it('records password mode and detects ciphertext tampering', async () => {
    const bytes = await packBrowserCredentialContainer(document, 'password', 'correct horse battery staple');
    expect(inspectBrowserCredentialMode(bytes)).toBe('password');
    const tampered = new Uint8Array(bytes);
    tampered[tampered.length - 1] ^= 0x01;
    await expect(unpackBrowserCredentialContainer(tampered, 'correct horse battery staple')).rejects.toThrow();
  });
});
