// STATUS: DIAMANT VGT SUPREME — encrypted Workspace persistence boundary.
import { secureRandomId } from '../../../shared/crypto/secureRandom';
import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';

export function collisionSafeId(prefix: string, documentId: string, now = Date.now()): string {
  const random = secureRandomId('storage');
  return `${prefix}_${documentId}_${now}_${random}`.slice(0, 512);
}

export async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', toOwnedArrayBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexText(value: string): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(value));
}
