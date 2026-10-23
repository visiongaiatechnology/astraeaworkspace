/**
 * Copies byte views into an owned ArrayBuffer accepted by WebCrypto and Blob.
 * Typed arrays backed by SharedArrayBuffer remain valid data, but the Web
 * Platform APIs intentionally do not accept SharedArrayBuffer as BufferSource.
 */
export function toOwnedArrayBuffer(bytes: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  const owned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(owned).set(bytes);
  return owned;
}

export function toOwnedBytes(bytes: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  return new Uint8Array(toOwnedArrayBuffer(bytes));
}
