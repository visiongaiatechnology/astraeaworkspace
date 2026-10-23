// STATUS: DIAMANT VGT SUPREME — centralized browser CSPRNG / identity helper

const MAX_RANDOM_BYTES = 65_536;

function cryptoApi(): Crypto {
  const candidate = globalThis.crypto;
  if (!candidate || typeof candidate.getRandomValues !== 'function') {
    throw new Error('secure_random_unavailable');
  }
  return candidate;
}

export function secureRandomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0 || length > MAX_RANDOM_BYTES) {
    throw new Error('secure_random_boundary_violation');
  }
  return cryptoApi().getRandomValues(new Uint8Array(length));
}

export function secureRandomHex(bytes = 16): string {
  return Array.from(secureRandomBytes(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

export function secureRandomId(prefix = 'id'): string {
  const normalized = prefix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'id';
  const api = cryptoApi();
  if (typeof api.randomUUID === 'function') return `${normalized}-${api.randomUUID()}`;
  return `${normalized}-${secureRandomHex(16)}`;
}

export function secureRandomUint32(): number {
  return new Uint32Array(secureRandomBytes(4).buffer)[0] ?? 0;
}
