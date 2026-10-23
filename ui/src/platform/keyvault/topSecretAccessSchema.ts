// STATUS: PLATIN — validates native Top Secret access responses before exposing factors or state.

export interface TopSecretAccessResult {
  success: boolean;
  generation: number | null;
  offlineFactorHex: string | null;
  recoveryHint: string | null;
  error: string | null;
}

export type TopSecretAccessExpectation =
  | { operation: 'enroll'; requireOfflineFactor: boolean }
  | { operation: 'unlock' };

const RESPONSE_FIELDS = [
  'success',
  'generation',
  'offline_factor_hex',
  'recovery_hint',
  'error',
] as const;

function readExactDataRecord(value: unknown): Record<(typeof RESPONSE_FIELDS)[number], unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const keys = Reflect.ownKeys(value);
    if (keys.length !== RESPONSE_FIELDS.length || keys.some((key) => typeof key !== 'string')) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const record = Object.create(null) as Record<(typeof RESPONSE_FIELDS)[number], unknown>;

    for (const field of RESPONSE_FIELDS) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
      record[field] = descriptor.value;
    }

    return record;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/\p{Cc}/u.test(value);
}

function isGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOfflineFactor(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value);
}

function rejectedResult(operation: TopSecretAccessExpectation['operation']): TopSecretAccessResult {
  return {
    success: false,
    generation: null,
    offlineFactorHex: null,
    recoveryHint: null,
    error: operation === 'enroll' ? 'Top Secret enrollment was rejected.' : 'Top Secret unlock was rejected.',
  };
}

export function parseTopSecretAccessPayload(
  value: unknown,
  expectation: TopSecretAccessExpectation,
): TopSecretAccessResult | null {
  const record = readExactDataRecord(value);
  if (!record || typeof record.success !== 'boolean') return null;

  const generation = record.generation === null ? null : record.generation;
  const offlineFactorHex = record.offline_factor_hex === null ? null : record.offline_factor_hex;
  const recoveryHint = record.recovery_hint === null ? null : record.recovery_hint;
  const error = record.error === null ? null : record.error;

  if (generation !== null && !isGeneration(generation)) return null;
  if (offlineFactorHex !== null && !isOfflineFactor(offlineFactorHex)) return null;
  if (recoveryHint !== null && !boundedText(recoveryHint, 512)) return null;
  if (error !== null && !boundedText(error, 192)) return null;

  if (!record.success) {
    if (generation !== null || offlineFactorHex !== null || recoveryHint !== null || error === null) return null;
    return rejectedResult(expectation.operation);
  }

  if (error !== null) return null;
  if (expectation.operation === 'enroll') {
    if (!isGeneration(generation) || !boundedText(recoveryHint, 512)) return null;
    if (expectation.requireOfflineFactor !== (offlineFactorHex !== null)) return null;
    return {
      success: true,
      generation,
      offlineFactorHex,
      recoveryHint,
      error: null,
    };
  }

  if (generation !== null || offlineFactorHex !== null || recoveryHint !== null) return null;
  return {
    success: true,
    generation: null,
    offlineFactorHex: null,
    recoveryHint: null,
    error: null,
  };
}

export function rejectedTopSecretAccessResult(operation: TopSecretAccessExpectation['operation']): TopSecretAccessResult {
  return rejectedResult(operation);
}
