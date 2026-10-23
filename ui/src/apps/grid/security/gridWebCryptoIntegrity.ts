// STATUS: DIAMANT VGT SUPREME
// Grid integrity primitives delegate exclusively to platform WebCrypto.

export interface GridSigningProvider {
  id: string;
  signDigest: (digest: Uint8Array) => Promise<{ algorithm: string; keyId: string; signature: string }>;
}

function requireCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('webcrypto_unavailable');
  return globalThis.crypto;
}

export function createGridSecureId(prefix: string): string {
  const cryptoApi = requireCrypto();
  const suffix = typeof cryptoApi.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${suffix}`;
}

export function canonicalGridJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalGridJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalGridJson(object[key])}`).join(',')}}`;
}

export async function sha256GridHex(value: unknown): Promise<{ digestHex: string; digestBytes: Uint8Array }> {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonicalGridJson(value));
  const digest = new Uint8Array(await requireCrypto().subtle.digest('SHA-256', bytes));
  return { digestBytes: digest, digestHex: Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('') };
}
