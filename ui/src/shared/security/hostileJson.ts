// STATUS: DIAMANT VGT SUPREME — bounded JSON intake with recursive prototype-pollution key elimination.

export interface HostileJsonLimits {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxStringChars: number;
  maxObjectKeys: number;
  maxArrayItems: number;
  rejectForbiddenKeys: boolean;
}

export const DEFAULT_HOSTILE_JSON_LIMITS: Readonly<HostileJsonLimits> = Object.freeze({
  maxBytes: 64 * 1024 * 1024,
  maxDepth: 96,
  maxNodes: 1_000_000,
  maxStringChars: 1_048_576,
  maxObjectKeys: 100_000,
  maxArrayItems: 1_000_000,
  rejectForbiddenKeys: false,
});

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function validatedLimits(input: Partial<HostileJsonLimits>): HostileJsonLimits {
  const limits = { ...DEFAULT_HOSTILE_JSON_LIMITS, ...input };
  const numericLimitKeys = ['maxBytes', 'maxDepth', 'maxNodes', 'maxStringChars', 'maxObjectKeys', 'maxArrayItems'] as const;
  for (const key of numericLimitKeys) {
    const value = limits[key];
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`HOSTILE_JSON_${key.toUpperCase()}_INVALID`);
  }
  if (typeof limits.rejectForbiddenKeys !== 'boolean') throw new Error('HOSTILE_JSON_FORBIDDEN_KEY_POLICY_INVALID');
  if (limits.maxDepth > 256 || limits.maxNodes > 4_000_000 || limits.maxBytes > 128 * 1024 * 1024) {
    throw new Error('HOSTILE_JSON_LIMIT_WEAKENING_REJECTED');
  }
  return limits;
}

export function sanitizeHostileJsonValue(value: unknown, inputLimits: Partial<HostileJsonLimits> = {}): unknown {
  const limits = validatedLimits(inputLimits);
  const state = { nodes: 0 };
  const walk = (node: unknown, depth: number): unknown => {
    state.nodes += 1;
    if (state.nodes > limits.maxNodes) throw new Error('HOSTILE_JSON_NODE_LIMIT');
    if (depth > limits.maxDepth) throw new Error('HOSTILE_JSON_DEPTH_LIMIT');
    if (node === null || typeof node === 'boolean') return node;
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) throw new Error('HOSTILE_JSON_NON_FINITE_NUMBER');
      return node;
    }
    if (typeof node === 'string') {
      if (node.length > limits.maxStringChars) throw new Error('HOSTILE_JSON_STRING_LIMIT');
      return node.replace(/\0/g, '');
    }
    if (Array.isArray(node)) {
      if (node.length > limits.maxArrayItems) throw new Error('HOSTILE_JSON_ARRAY_LIMIT');
      return node.map((child) => walk(child, depth + 1));
    }
    if (typeof node !== 'object') throw new Error('HOSTILE_JSON_VALUE_TYPE_REJECTED');
    const entries = Object.entries(node as Record<string, unknown>);
    if (entries.length > limits.maxObjectKeys) throw new Error('HOSTILE_JSON_OBJECT_KEY_LIMIT');
    const out: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      if (FORBIDDEN_KEYS.has(key)) {
        if (limits.rejectForbiddenKeys) throw new Error('HOSTILE_JSON_FORBIDDEN_KEY');
        continue;
      }
      if (!key || key.length > 1024) throw new Error('HOSTILE_JSON_KEY_LIMIT');
      out[key] = walk(child, depth + 1);
    }
    return out;
  };
  return walk(value, 0);
}

export function parseHostileJson(text: string, inputLimits: Partial<HostileJsonLimits> = {}): unknown {
  if (typeof text !== 'string') throw new Error('HOSTILE_JSON_INPUT_TYPE_REJECTED');
  const limits = validatedLimits(inputLimits);
  const size = new TextEncoder().encode(text).byteLength;
  if (size < 2 || size > limits.maxBytes) throw new Error('HOSTILE_JSON_BYTE_LIMIT');
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; }
  catch { throw new Error('HOSTILE_JSON_MALFORMED'); }
  return sanitizeHostileJsonValue(parsed, limits);
}
