// STATUS: GOLD — deterministic hostile-input coverage for the UI SyncGraph ingress boundary.
import { describe, expect, it, vi } from 'vitest';
import {
  classifyInboundOperation,
  SyncGraphBoundaryError,
  SYNCGRAPH_MAX_NODE_BYTES,
  SYNCGRAPH_MAX_NODE_DEPTH,
  type InboundOperationClassification,
} from '../../../platform/syncgraph/syncGraphCollaborationCore';

const nativeBridge = vi.hoisted(() => ({ invokeNative: vi.fn(), isNativeDesktop: vi.fn(() => true) }));
vi.mock('../../../platform/native/nativeBridge', () => nativeBridge);

import { routeInboundSyncOperation } from '../../../platform/syncgraph/syncGraphLifecycleClient';

const MUTATION_CASES = 4_096;
const TEST_MAX_DEPTH = SYNCGRAPH_MAX_NODE_DEPTH;
const ALLOWED_ERROR_CODES = new Set(['INVALID', 'BOUNDS', 'POLICY', 'RATE_LIMIT', 'REPLAY', 'CANCELLED']);

type ExpectedResult = 'supported' | 'future' | 'rejected';
type MutationCase = { input: unknown; expected: ExpectedResult };
type OutcomeCounts = { supported: number; future: number; controlledRejected: number; nativeExceptions: number; unclassifiedErrors: number };

function validEnvelope(index = 0, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    operationId: `op-${index}`,
    documentId: 'doc-main',
    objectIds: [`object-${index}`],
    actorId: 'actor-main',
    deviceId: 'device-main',
    causal: { lamportTime: index + 1, parents: [], vectorClock: { 'actor-main': index + 1 } },
    operation: { kind: 'set-value', value: index },
    timestamp_utc: index + 1,
    ...extra,
  };
}

function snakeCaseEnvelope(index: number): Record<string, unknown> {
  return {
    schema_version: 2,
    op_id: `op-${index}`,
    document_id: 'doc-main',
    object_ids: [`object-${index}`],
    actor_id: 'actor-main',
    device_id: 'device-main',
    parent_ids: [],
    vector_clock: { 'actor-main': index + 1 },
    lamport_time: index + 1,
    operation: { kind: 'set-value', value: index },
    timestamp_utc: index + 1,
  };
}

function nestedValue(wrappers: number): unknown {
  let value: unknown = 'leaf';
  for (let index = 0; index < wrappers; index += 1) value = { next: value };
  return value;
}

function makeMutation(index: number): MutationCase {
  const lane = index % 16;
  switch (lane) {
    case 0:
      return { input: validEnvelope(index), expected: 'supported' };
    case 1:
      return { input: snakeCaseEnvelope(index), expected: 'supported' };
    case 2:
      return { input: validEnvelope(index, { schemaVersion: 3 }), expected: 'future' };
    case 3:
      return { input: validEnvelope(index, { operationId: '' }), expected: 'rejected' };
    case 4:
      return index / 16 % 2 === 0
        ? { input: validEnvelope(index, { operation: undefined }), expected: 'rejected' }
        : { input: validEnvelope(index, { schemaVersion: 1 }), expected: 'rejected' };
    case 5:
      return { input: validEnvelope(index, { objectIds: [`duplicate-${index}`, `duplicate-${index}`] }), expected: 'rejected' };
    case 6:
      return { input: validEnvelope(index, { causal: { lamportTime: 1, parents: ['same', 'same'], vectorClock: {} } }), expected: 'rejected' };
    case 7:
      return { input: validEnvelope(index, { causal: { lamportTime: 1, parents: [], vectorClock: { actor: 1, ' actor ': 2 } } }), expected: 'rejected' };
    case 8:
      return { input: validEnvelope(index, { schemaVersion: 2, schema_version: 3 }), expected: 'rejected' };
    case 9:
      return { input: validEnvelope(index, { operationId: `op-${index}`, op_id: `other-${index}` }), expected: 'rejected' };
    case 10:
      return { input: validEnvelope(index, { operation: { value: BigInt(index) } }), expected: 'rejected' };
    case 11: {
      const operation: Record<string, unknown> = { kind: 'cycle' };
      operation.self = operation;
      return { input: validEnvelope(index, { operation }), expected: 'rejected' };
    }
    case 12:
      return { input: validEnvelope(index, { operation: nestedValue(TEST_MAX_DEPTH + 8) }), expected: 'rejected' };
    case 13:
      return { input: validEnvelope(index, { causal: { lamportTime: 1, parents: [], vectorClock: null } }), expected: 'rejected' };
    case 14:
      return { input: validEnvelope(index, { actorId: `actor\u0000${index}` }), expected: 'rejected' };
    default:
      return { input: validEnvelope(index, { objectIds: [] }), expected: 'rejected' };
  }
}

function controlledErrorCode(error: unknown): string | null {
  if (!(error instanceof SyncGraphBoundaryError)) return null;
  return ALLOWED_ERROR_CODES.has(error.code) ? error.code : null;
}

function assertAcceptedBounds(result: InboundOperationClassification, expected: ExpectedResult): boolean {
  if (result.kind !== expected || result.encodedBytes <= 0 || result.encodedBytes > SYNCGRAPH_MAX_NODE_BYTES) return false;
  if (result.kind === 'future') {
    return result.schemaVersion > 2
      && result.operationId.length > 0 && result.operationId.length <= 256
      && result.documentId.length > 0 && result.documentId.length <= 256;
  }
  const envelope = result.envelope;
  const vectorActors = Object.keys(envelope.causal.vectorClock);
  return envelope.schemaVersion === 2
    && envelope.operationId.length > 0 && envelope.operationId.length <= 256
    && envelope.documentId.length > 0 && envelope.documentId.length <= 256
    && envelope.objectIds.length >= 1 && envelope.objectIds.length <= 32
    && envelope.causal.parents.length <= 64
    && vectorActors.length <= 4_096
    && new Set(vectorActors).size === vectorActors.length;
}

function envelopeWithExactJsonBytes(targetBytes: number): Record<string, unknown> {
  const empty = validEnvelope(0, { operation: { payload: '' } });
  const paddingLength = targetBytes - JSON.stringify(empty).length;
  if (paddingLength < 0) throw new Error('Exact-size SyncGraph fixture underflow');
  const result = validEnvelope(0, { operation: { payload: 'x'.repeat(paddingLength) } });
  if (JSON.stringify(result).length !== targetBytes) throw new Error('Exact-size SyncGraph fixture mismatch');
  return result;
}

describe('SEC-096 UI SyncGraph ingress mutation corpus', () => {
  it('dispatches exactly 4,096 hostile and valid envelopes with controlled outcomes', () => {
    const counts: OutcomeCounts = { supported: 0, future: 0, controlledRejected: 0, nativeExceptions: 0, unclassifiedErrors: 0 };
    let dispatched = 0;
    let invariantFailures = 0;
    let unexpectedAccepts = 0;

    for (let index = 0; index < MUTATION_CASES; index += 1) {
      const testCase = makeMutation(index);
      dispatched += 1;
      try {
        const result = classifyInboundOperation(testCase.input, 1_700_000_000_000);
        if (result.kind === 'supported') counts.supported += 1;
        else counts.future += 1;
        if (testCase.expected !== result.kind) unexpectedAccepts += 1;
        if (!assertAcceptedBounds(result, testCase.expected)) invariantFailures += 1;
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) counts.nativeExceptions += 1;
        else if (controlledErrorCode(error)) counts.controlledRejected += 1;
        else counts.unclassifiedErrors += 1;
        if (testCase.expected !== 'rejected') unexpectedAccepts += 1;
      }
    }

    console.info(`[SEC-096 SyncGraph ingress] ${dispatched} cases; supported=${counts.supported}; future=${counts.future}; controlled-rejected=${counts.controlledRejected}; native-exception=${counts.nativeExceptions}; unclassified=${counts.unclassifiedErrors}`);
    expect(dispatched).toBe(MUTATION_CASES);
    expect(counts.supported).toBe(MUTATION_CASES / 8);
    expect(counts.future).toBe(MUTATION_CASES / 16);
    expect(counts.controlledRejected).toBe(MUTATION_CASES * 13 / 16);
    expect(counts.nativeExceptions).toBe(0);
    expect(counts.unclassifiedErrors).toBe(0);
    expect(invariantFailures).toBe(0);
    expect(unexpectedAccepts).toBe(0);
  });

  it('enforces exact JSON byte, depth, identifier, list, and vector-clock boundaries', () => {
    const atByteLimit = envelopeWithExactJsonBytes(SYNCGRAPH_MAX_NODE_BYTES);
    const acceptedAtByteLimit = classifyInboundOperation(atByteLimit);
    expect(acceptedAtByteLimit.kind).toBe('supported');
    expect(acceptedAtByteLimit.encodedBytes).toBe(SYNCGRAPH_MAX_NODE_BYTES);
    const overByteLimit = envelopeWithExactJsonBytes(SYNCGRAPH_MAX_NODE_BYTES + 1);
    const stringifySpy = vi.spyOn(JSON, 'stringify');
    const cloneSpy = vi.spyOn(globalThis, 'structuredClone');
    let byteBoundaryError: unknown;
    try { classifyInboundOperation(overByteLimit); } catch (error) { byteBoundaryError = error; }
    const stringifyCallsBeforeReject = stringifySpy.mock.calls.length;
    const cloneCallsBeforeReject = cloneSpy.mock.calls.length;
    stringifySpy.mockRestore();
    cloneSpy.mockRestore();
    expect(byteBoundaryError).toBeInstanceOf(SyncGraphBoundaryError);
    expect(stringifyCallsBeforeReject).toBe(0);
    expect(cloneCallsBeforeReject).toBe(0);

    const exactId = 'i'.repeat(256);
    expect(classifyInboundOperation(validEnvelope(0, { operationId: exactId })).kind).toBe('supported');
    expect(() => classifyInboundOperation(validEnvelope(0, { operationId: `${exactId}x` }))).toThrow(SyncGraphBoundaryError);

    const exactDepth = validEnvelope(0, { operation: nestedValue(TEST_MAX_DEPTH - 1) });
    expect(classifyInboundOperation(exactDepth).kind).toBe('supported');
    expect(() => classifyInboundOperation(validEnvelope(0, { operation: nestedValue(TEST_MAX_DEPTH) }))).toThrow(SyncGraphBoundaryError);
    const escapedText = validEnvelope(0, { operation: { value: `quote" slash\\ nul\u0000 line\n café 💎 lone\uD800` } });
    expect(classifyInboundOperation(escapedText).encodedBytes).toBe(new TextEncoder().encode(JSON.stringify(escapedText)).byteLength);
    expect(classifyInboundOperation(validEnvelope(0, { operationId: 'op-0', op_id: 'op-0' })).kind).toBe('supported');
    expect(() => classifyInboundOperation(validEnvelope(0, { actorId: 'actor-a', actor_id: 'actor-b' }))).toThrow(SyncGraphBoundaryError);
    expect(() => classifyInboundOperation(validEnvelope(0, { schemaVersion: 3, operation: undefined }))).toThrow(SyncGraphBoundaryError);
    expect(() => classifyInboundOperation(validEnvelope(0, { schemaVersion: 3, deviceId: '' }))).toThrow(SyncGraphBoundaryError);

    const objectIds = Array.from({ length: 32 }, (_, index) => `object-${index}`);
    expect(classifyInboundOperation(validEnvelope(0, { objectIds })).kind).toBe('supported');
    expect(() => classifyInboundOperation(validEnvelope(0, { objectIds: [...objectIds, 'object-32'] }))).toThrow(SyncGraphBoundaryError);

    const parents = Array.from({ length: 64 }, (_, index) => `parent-${index}`);
    expect(classifyInboundOperation(validEnvelope(0, { causal: { lamportTime: 100, parents, vectorClock: {} } })).kind).toBe('supported');
    expect(() => classifyInboundOperation(validEnvelope(0, { causal: { lamportTime: 100, parents: [...parents, 'parent-64'], vectorClock: {} } }))).toThrow(SyncGraphBoundaryError);

    const vectorClock = Object.fromEntries(Array.from({ length: 4_096 }, (_, index) => [`actor-${index}`, index + 1]));
    expect(classifyInboundOperation(validEnvelope(0, { causal: { lamportTime: 1, parents: [], vectorClock } })).kind).toBe('supported');
    const oversizedClock = { ...vectorClock, 'actor-4096': 4_097 };
    expect(() => classifyInboundOperation(validEnvelope(0, { causal: { lamportTime: 1, parents: [], vectorClock: oversizedClock } }))).toThrow(SyncGraphBoundaryError);
  });

  it('fails supported transport input closed without native peer authority and quarantines future schemas', async () => {
    nativeBridge.invokeNative.mockReset();
    await expect(routeInboundSyncOperation('doc-main', validEnvelope(1))).rejects.toMatchObject({ code: 'POLICY' });
    expect(nativeBridge.invokeNative).not.toHaveBeenCalled();

    await expect(routeInboundSyncOperation('doc-other', validEnvelope(2))).rejects.toMatchObject({ code: 'POLICY' });
    expect(nativeBridge.invokeNative).not.toHaveBeenCalled();
    await expect(routeInboundSyncOperation('doc-main', validEnvelope(2, { timestamp_utc: 'invalid' }))).rejects.toMatchObject({ code: 'INVALID' });
    expect(nativeBridge.invokeNative).not.toHaveBeenCalled();

    nativeBridge.invokeNative.mockResolvedValue({ futureQuarantineCount: 1 });
    const quarantined = await routeInboundSyncOperation('doc-main', validEnvelope(3, { schemaVersion: 3 }));
    expect(quarantined).toEqual({ kind: 'quarantined', count: 1 });
    expect(nativeBridge.invokeNative).toHaveBeenCalledWith('vgt_sync_quarantine_future', expect.anything());
  });
});
