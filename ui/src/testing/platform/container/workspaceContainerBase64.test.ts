import { describe, expect, it } from 'vitest';
import { VWC_MAX_CONTAINER_BYTES } from '../../../platform/containers/vwcStorage';
import { unpackContainer } from '../../../platform/containers/container';
import {
  assertWorkspaceContainerByteLength,
  decodeWorkspaceContainerBase64,
  encodeWorkspaceContainerBase64,
} from '../../../platform/containers/workspaceContainerBase64';

describe('Workspace container public boundary', () => {
  it('uses the existing VWC byte limit and rejects invalid sizes', () => {
    expect(() => assertWorkspaceContainerByteLength(4)).not.toThrow();
    expect(() => assertWorkspaceContainerByteLength(VWC_MAX_CONTAINER_BYTES)).not.toThrow();
    expect(() => assertWorkspaceContainerByteLength(3)).toThrow('size boundary');
    expect(() => assertWorkspaceContainerByteLength(VWC_MAX_CONTAINER_BYTES + 1)).toThrow('size boundary');
    expect(() => assertWorkspaceContainerByteLength(Number.POSITIVE_INFINITY)).toThrow('size boundary');
  });

  it('rejects over-limit public input before reading format bytes or encoding', async () => {
    const bytes = new Proxy(new Uint8Array(4), {
      get(target, property) {
        if (property === 'byteLength') return VWC_MAX_CONTAINER_BYTES + 1;
        if (property === 'subarray' || property === '0') throw new Error('format dispatch ran before the size guard');
        return Reflect.get(target, property, target);
      },
    });

    await expect(unpackContainer(bytes)).rejects.toThrow('size boundary');
  });

  it('roundtrips base64 across aligned chunk boundaries', () => {
    const bytes = Uint8Array.from({ length: 25_009 }, (_, index) => index % 251);
    const encoded = encodeWorkspaceContainerBase64(bytes);
    expect(decodeWorkspaceContainerBase64(encoded)).toEqual(bytes);
  });

  it('rejects oversized and malformed base64 before decoded-byte allocation', () => {
    expect(() => decodeWorkspaceContainerBase64('AAAAAAAA!!!!')).toThrow();
    const oversizedEncodedLength = 4 * Math.ceil(VWC_MAX_CONTAINER_BYTES / 3);
    expect(() => assertWorkspaceContainerByteLength(Math.floor(oversizedEncodedLength * 3 / 4))).toThrow('size boundary');
    expect(() => decodeWorkspaceContainerBase64(null)).toThrow('size boundary');
  });
});
