// STATUS: DIAMANT VGT SUPREME — bounded hostile envelope admission and schema quarantine.
// This owner validates input shape only; Rust vgt-syncgraph remains durable merge authority.

export const SYNCGRAPH_SCHEMA_VERSION = 2 as const;
export const SYNCGRAPH_MAX_NODE_BYTES = 2 * 1024 * 1024;
export const SYNCGRAPH_MAX_NODE_DEPTH = 128;
export const SYNCGRAPH_MAX_NODE_COUNT = 1_000_000;
export const SYNCGRAPH_MAX_OBJECT_IDS = 32;
export const SYNCGRAPH_MAX_PARENT_IDS = 64;
export const SYNCGRAPH_MAX_VECTOR_ACTORS = 4096;
export const SYNCGRAPH_MAX_FRAME_BYTES = 8 * 1024 * 1024;
export const SYNCGRAPH_MAX_QUARANTINED_FUTURE = 1024;
export const SYNCGRAPH_MAX_PRESENCE = 512;
export const SYNCGRAPH_PRESENCE_TTL_MS = 45_000;
export const SYNCGRAPH_MAX_REVIEW_COMMENTS = 2_000;
export const SYNCGRAPH_MAX_COMMENT_BODY = 16_384;
export const SYNCGRAPH_MAX_MENTIONS = 64;
export const SYNCGRAPH_RATE_WINDOW_MS = 1_000;
export const SYNCGRAPH_MAX_INGRESS_PER_WINDOW = 512;
export const SYNCGRAPH_MAX_REPLAYS_PER_WINDOW = 128;

const MAX_ID = 256;
export const MAX_SELECTION = 2_048;
export const MAX_DISPLAY_NAME = 512;
const MAX_SCHEMA = 0xffff;

export type SyncObjectFamily = 'text' | 'ordered-list' | 'map' | 'table' | 'geometry' | 'binary-asset' | 'review' | 'object-set';
export type SyncMergeStrategy =
  | 'text-sequence'
  | 'stable-ordered-sequence'
  | 'optimistic-register'
  | 'table-cell-register'
  | 'geometry-register'
  | 'binary-asset-register'
  | 'durable-review-object'
  | 'observed-remove-object-set';

export interface SyncCausalMetadata {
  lamportTime: number;
  parents: string[];
  vectorClock: Record<string, number>;
}

export interface SyncOperationEnvelope<T = unknown> {
  schemaVersion: number;
  operationId: string;
  documentId: string;
  objectIds: string[];
  actorId: string;
  deviceId: string;
  causal: SyncCausalMetadata;
  operation: T;
}

export interface QuarantinedFutureOperation {
  kind: 'future';
  operationId: string;
  documentId: string;
  schemaVersion: number;
  receivedAt: number;
  raw: unknown;
  encodedBytes: number;
}

export type InboundOperationClassification<T = unknown> =
  | { kind: 'supported'; envelope: SyncOperationEnvelope<T>; encodedBytes: number }
  | QuarantinedFutureOperation;

export class SyncGraphBoundaryError extends Error {
  readonly code: 'INVALID' | 'BOUNDS' | 'POLICY' | 'RATE_LIMIT' | 'REPLAY' | 'CANCELLED';
  constructor(code: SyncGraphBoundaryError['code'], message = 'SyncGraph input rejected') {
    super(message);
    this.name = 'SyncGraphBoundaryError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type JsonScanFrame =
  | { kind: 'visit'; value: unknown; depth: number }
  | { kind: 'array'; value: readonly unknown[]; depth: number; index: number }
  | { kind: 'object'; value: Record<string, unknown>; depth: number; keys: IterableIterator<string>; first: boolean };

function* ownEnumerableKeys(value: Record<string, unknown>): IterableIterator<string> {
  for (const key in value) if (Object.hasOwn(value, key)) yield key;
}

function measureJsonStringBytes(value: string, addBytes: (count: number) => void): void {
  addBytes(2);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      addBytes(2);
    } else if (code < 0x20) {
      addBytes(code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6);
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        addBytes(4);
        index += 1;
      } else {
        addBytes(6);
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      addBytes(6);
    } else if (code < 0x80) {
      addBytes(1);
    } else if (code < 0x800) {
      addBytes(2);
    } else {
      addBytes(3);
    }
  }
}

/** Measures JSON-compatible values iteratively before any stringify or structured clone. */
function boundedJsonBytes(root: unknown, signal?: AbortSignal): number {
  let byteCount = 0;
  let nodeCount = 0;
  const active = new WeakSet<object>();
  const stack: JsonScanFrame[] = [{ kind: 'visit', value: root, depth: 0 }];
  const addBytes = (count: number): void => {
    byteCount += count;
    if (byteCount > SYNCGRAPH_MAX_NODE_BYTES) throw new SyncGraphBoundaryError('BOUNDS');
  };

  try {
    while (stack.length > 0) {
      throwIfAborted(signal);
      const frame = stack[stack.length - 1]!;
      if (frame.kind === 'array') {
        if (frame.index >= frame.value.length) {
          addBytes(1);
          stack.pop();
          active.delete(frame.value);
          continue;
        }
        if (frame.index > 0) addBytes(1);
        const index = frame.index;
        frame.index += 1;
        const descriptor = Object.getOwnPropertyDescriptor(frame.value, String(index));
        if (!descriptor || !('value' in descriptor)) throw new SyncGraphBoundaryError('INVALID');
        stack.push({ kind: 'visit', value: descriptor.value, depth: frame.depth + 1 });
        continue;
      }
      if (frame.kind === 'object') {
        const next = frame.keys.next();
        if (next.done) {
          addBytes(1);
          stack.pop();
          active.delete(frame.value);
          continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(frame.value, next.value);
        if (!descriptor || !descriptor.enumerable) continue;
        if (!('value' in descriptor)) throw new SyncGraphBoundaryError('INVALID');
        if (!frame.first) addBytes(1);
        frame.first = false;
        measureJsonStringBytes(next.value, addBytes);
        addBytes(1);
        stack.push({ kind: 'visit', value: descriptor.value, depth: frame.depth + 1 });
        continue;
      }

      stack.pop();
      nodeCount += 1;
      if (nodeCount > SYNCGRAPH_MAX_NODE_COUNT || frame.depth > SYNCGRAPH_MAX_NODE_DEPTH) {
        throw new SyncGraphBoundaryError('BOUNDS');
      }
      if (frame.value === null) {
        addBytes(4);
      } else if (typeof frame.value === 'boolean') {
        addBytes(frame.value ? 4 : 5);
      } else if (typeof frame.value === 'string') {
        measureJsonStringBytes(frame.value, addBytes);
      } else if (typeof frame.value === 'number') {
        if (!Number.isFinite(frame.value)) throw new SyncGraphBoundaryError('INVALID');
        addBytes(String(frame.value).length);
      } else if (Array.isArray(frame.value)) {
        if (frame.value.length > SYNCGRAPH_MAX_NODE_COUNT) throw new SyncGraphBoundaryError('BOUNDS');
        if (active.has(frame.value)) throw new SyncGraphBoundaryError('INVALID');
        active.add(frame.value);
        addBytes(1);
        stack.push({ kind: 'array', value: frame.value, depth: frame.depth, index: 0 });
      } else if (typeof frame.value === 'object') {
        const prototype = Object.getPrototypeOf(frame.value);
        if (prototype !== Object.prototype && prototype !== null) throw new SyncGraphBoundaryError('INVALID');
        if (active.has(frame.value)) throw new SyncGraphBoundaryError('INVALID');
        active.add(frame.value);
        addBytes(1);
        stack.push({ kind: 'object', value: frame.value as Record<string, unknown>, depth: frame.depth, keys: ownEnumerableKeys(frame.value as Record<string, unknown>), first: true });
      } else {
        throw new SyncGraphBoundaryError('INVALID');
      }
    }
  } catch (error) {
    if (error instanceof SyncGraphBoundaryError) throw error;
    throw new SyncGraphBoundaryError('INVALID');
  }
  return byteCount;
}

export function boundedId(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new SyncGraphBoundaryError('INVALID', `${label} rejected`);
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_ID || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new SyncGraphBoundaryError('BOUNDS', `${label} rejected`);
  }
  return normalized;
}

export function boundedLogicalTime(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER - 1) {
    throw new SyncGraphBoundaryError('BOUNDS');
  }
  return value;
}

export function parseVectorClock(value: unknown): Record<string, number> {
  if (!isRecord(value)) throw new SyncGraphBoundaryError('INVALID');
  const entries = Object.entries(value);
  if (entries.length > SYNCGRAPH_MAX_VECTOR_ACTORS) throw new SyncGraphBoundaryError('BOUNDS');
  const out: Record<string, number> = {};
  for (const [actor, logicalTime] of entries) {
    const id = boundedId(actor, 'vector actor');
    if (Object.hasOwn(out, id)) throw new SyncGraphBoundaryError('INVALID');
    out[id] = boundedLogicalTime(logicalTime);
  }
  return out;
}

function parseIdList(value: unknown, max: number, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) throw new SyncGraphBoundaryError('BOUNDS');
  const out = value.map((entry) => boundedId(entry, label));
  if (new Set(out).size !== out.length) throw new SyncGraphBoundaryError('INVALID');
  return out;
}

function aliasValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]));
  }
  return false;
}

function aliasedValue(record: Record<string, unknown>, canonical: string, legacy: string): unknown {
  const hasCanonical = Object.hasOwn(record, canonical);
  const hasLegacy = Object.hasOwn(record, legacy);
  if (hasCanonical && hasLegacy && !aliasValuesEqual(record[canonical], record[legacy])) {
    throw new SyncGraphBoundaryError('INVALID');
  }
  return hasCanonical ? record[canonical] : record[legacy];
}

function nestedOrTopLevelValue(
  nested: Record<string, unknown>,
  canonical: string,
  legacy: string,
  outer: Record<string, unknown>,
  outerCanonical: string,
  outerLegacy: string,
): unknown {
  const hasNested = Object.hasOwn(nested, canonical) || Object.hasOwn(nested, legacy);
  const hasOuter = Object.hasOwn(outer, outerCanonical) || Object.hasOwn(outer, outerLegacy);
  const nestedValue = aliasedValue(nested, canonical, legacy);
  const outerValue = aliasedValue(outer, outerCanonical, outerLegacy);
  if (hasNested && hasOuter && !aliasValuesEqual(nestedValue, outerValue)) throw new SyncGraphBoundaryError('INVALID');
  return hasNested ? nestedValue : outerValue;
}

/**
 * Hostile JSON boundary. Future schemas are preserved opaque and must be routed to the native encrypted
 * quarantine instead of being interpreted by this version.
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new SyncGraphBoundaryError('CANCELLED', 'SyncGraph input cancelled');
}

export function classifyInboundOperation(raw: unknown, now = Date.now(), signal?: AbortSignal): InboundOperationClassification {
  throwIfAborted(signal);
  const encodedBytes = boundedJsonBytes(raw, signal);
  throwIfAborted(signal);
  if (!isRecord(raw)) throw new SyncGraphBoundaryError('INVALID');
  const schemaVersion = aliasedValue(raw, 'schemaVersion', 'schema_version');
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion <= 0 || schemaVersion > MAX_SCHEMA) {
    throw new SyncGraphBoundaryError('INVALID');
  }
  const operationId = boundedId(aliasedValue(raw, 'operationId', 'op_id'), 'operation id');
  const documentId = boundedId(aliasedValue(raw, 'documentId', 'document_id'), 'document id');
  const actorId = boundedId(aliasedValue(raw, 'actorId', 'actor_id'), 'actor id');
  const deviceId = boundedId(aliasedValue(raw, 'deviceId', 'device_id'), 'device id');
  const objectIds = parseIdList(aliasedValue(raw, 'objectIds', 'object_ids'), SYNCGRAPH_MAX_OBJECT_IDS, 'object id');
  if (!Object.hasOwn(raw, 'operation')) throw new SyncGraphBoundaryError('INVALID');
  if (Object.hasOwn(raw, 'causal') && !isRecord(raw.causal)) throw new SyncGraphBoundaryError('INVALID');
  const causalRaw = Object.hasOwn(raw, 'causal') ? raw.causal as Record<string, unknown> : raw;
  const parentIds = nestedOrTopLevelValue(causalRaw, 'parents', 'parent_ids', raw, 'parents', 'parent_ids');
  const parents = Array.isArray(parentIds) && parentIds.length === 0 ? [] : parseIdList(parentIds, SYNCGRAPH_MAX_PARENT_IDS, 'parent id');
  if (parents.includes(operationId)) throw new SyncGraphBoundaryError('INVALID');
  const rawVectorClock = nestedOrTopLevelValue(causalRaw, 'vectorClock', 'vector_clock', raw, 'vectorClock', 'vector_clock');
  const vectorClock = parseVectorClock(rawVectorClock === undefined ? {} : rawVectorClock);
  const rawLamportTime = nestedOrTopLevelValue(causalRaw, 'lamportTime', 'lamport_time', raw, 'lamportTime', 'lamport_time');
  const lamportTime = boundedLogicalTime(rawLamportTime);
  if (schemaVersion > SYNCGRAPH_SCHEMA_VERSION) {
    try {
      return { kind: 'future', operationId, documentId, schemaVersion, receivedAt: now, raw: structuredClone(raw), encodedBytes };
    } catch {
      throw new SyncGraphBoundaryError('INVALID');
    }
  }
  if (schemaVersion !== SYNCGRAPH_SCHEMA_VERSION) throw new SyncGraphBoundaryError('POLICY');
  throwIfAborted(signal);
  throwIfAborted(signal);
  let clonedOperation: unknown;
  try { clonedOperation = structuredClone(raw.operation); }
  catch { throw new SyncGraphBoundaryError('INVALID'); }
  return {
    kind: 'supported',
    encodedBytes,
    envelope: { schemaVersion, operationId, documentId, objectIds, actorId, deviceId, causal: { lamportTime, parents, vectorClock }, operation: clonedOperation },
  };
}
