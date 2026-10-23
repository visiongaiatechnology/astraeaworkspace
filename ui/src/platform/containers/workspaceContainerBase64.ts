import { VWC_MAX_CONTAINER_BYTES } from './vwcStorage';

const MIN_CONTAINER_BYTES = 4;
const BASE64_CHUNK_BYTES = 12_288;
const MAX_BASE64_CHARS = 4 * Math.ceil(VWC_MAX_CONTAINER_BYTES / 3);

export function assertWorkspaceContainerByteLength(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < MIN_CONTAINER_BYTES || byteLength > VWC_MAX_CONTAINER_BYTES) {
    throw new Error('Workspace container size boundary violation');
  }
}

export function assertWorkspaceContainerBytes(value: unknown): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error('Workspace container size boundary violation');
  assertWorkspaceContainerByteLength(value.byteLength);
}

export function encodeWorkspaceContainerBase64(bytes: Uint8Array): string {
  assertWorkspaceContainerBytes(bytes);
  const encodedChunks: string[] = [];

  for (let offset = 0; offset < bytes.byteLength; offset += BASE64_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, Math.min(offset + BASE64_CHUNK_BYTES, bytes.byteLength));
    encodedChunks.push(globalThis.btoa(String.fromCharCode(...chunk)));
  }

  return encodedChunks.join('');
}

export function decodeWorkspaceContainerBase64(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length < 8 || value.length > MAX_BASE64_CHARS) {
    throw new Error('Workspace container size boundary violation');
  }

  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (value.length % 4 === 1) throw new Error('Workspace container base64 is invalid');
  const decodedLength = Math.floor(value.length * 3 / 4) - padding;
  assertWorkspaceContainerByteLength(decodedLength);

  const binary = globalThis.atob(value);
  if (binary.length !== decodedLength) throw new Error('Workspace container base64 is invalid');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
