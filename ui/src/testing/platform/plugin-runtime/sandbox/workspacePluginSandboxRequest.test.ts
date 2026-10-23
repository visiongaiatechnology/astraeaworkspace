import { describe, expect, it } from 'vitest';
import {
  parsePluginSandboxWorkerRequest,
  PLUGIN_WORKER_INITIAL_MEMORY_BYTES,
  PLUGIN_WORKER_MAX_ARGS,
  PLUGIN_WORKER_MAX_MEMORY_BYTES,
  PLUGIN_WORKER_MAX_OUTPUT_BYTES,
  PLUGIN_WORKER_MAX_WASM_BYTES,
  PluginSandboxRequestError,
  type PluginSandboxWorkerRequest,
} from '../../../../platform/plugin-runtime/sandbox/workspacePluginSandboxRequest';

const requestId = (value: number): string => value.toString(16).padStart(32, '0');
const validRequest = (overrides: Record<string, unknown> = {}) => ({
  type: 'execute-wasm',
  requestId: requestId(1),
  wasmBytes: new ArrayBuffer(8),
  exportFnName: 'answer',
  args: [1, 2],
  maxLinearMemoryBytes: PLUGIN_WORKER_INITIAL_MEMORY_BYTES,
  maxOutputBytes: 256 * 1024,
  ...overrides,
});

function expectRequestError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected plugin worker request rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(PluginSandboxRequestError);
    expect((error as PluginSandboxRequestError).code).toBe(code);
  }
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof ArrayBuffer) return `ArrayBuffer(${item.byteLength})`;
    if (Array.isArray(item)) {
      return Array.from({ length: item.length }, (_, index) => Object.prototype.hasOwnProperty.call(item, index) ? item[index] : '[hole]');
    }
    return item;
  });
}

describe('Plugin WASM worker request ingress', () => {
  it('runs 4,096 different bounded message mutations through the worker request parser', () => {
    const casesPerFamily = 256;
    const familyCount = 16;
    const mutationCaseCount = casesPerFamily * familyCount;
    expect(mutationCaseCount).toBe(4096);
    const oversizedBuffer = new ArrayBuffer(PLUGIN_WORKER_MAX_WASM_BYTES + 1);
    const fingerprints = new Set<string>();
    const errorCounts = new Map<string, number>();
    let accepted = 0;
    let rejected = 0;
    let nativeErrors = 0;

    for (let caseIndex = 0; caseIndex < mutationCaseCount; caseIndex += 1) {
      const family = Math.floor(caseIndex / casesPerFamily);
      const variant = caseIndex % casesPerFamily;
      const id = requestId(caseIndex + 1);
      let input: unknown;
      let shouldAccept = false;
      switch (family) {
        case 0:
          input = validRequest({ requestId: id, args: [variant] });
          shouldAccept = true;
          break;
        case 1:
          input = { type: 'probe-isolation', requestId: id };
          shouldAccept = true;
          break;
        case 2:
          input = { type: `unknown-${variant}`, requestId: id };
          break;
        case 3:
          input = { type: 'execute-wasm', wasmBytes: new ArrayBuffer(8), exportFnName: 'answer', args: [variant], maxLinearMemoryBytes: PLUGIN_WORKER_INITIAL_MEMORY_BYTES, maxOutputBytes: 1, mutation: variant };
          break;
        case 4:
          input = validRequest({ requestId: `${variant.toString(16).padStart(31, '0')}G` });
          break;
        case 5:
          input = validRequest({ requestId: id, wasmBytes: { byteLength: variant } });
          break;
        case 6:
          input = validRequest({ requestId: id, wasmBytes: new ArrayBuffer(variant % 8) });
          break;
        case 7:
          input = validRequest({ requestId: id, wasmBytes: oversizedBuffer });
          break;
        case 8:
          input = validRequest({ requestId: id, exportFnName: 'x'.repeat(129 + variant) });
          break;
        case 9:
          input = validRequest({ requestId: id, args: Array.from({ length: PLUGIN_WORKER_MAX_ARGS + 1 + variant }, (_, index) => index) });
          break;
        case 10:
          input = validRequest({ requestId: id, args: [variant, Number.NaN] });
          break;
        case 11: {
          const sparseArgs = new Array<number>(1 + (variant % PLUGIN_WORKER_MAX_ARGS));
          input = validRequest({ requestId: id, args: sparseArgs });
          break;
        }
        case 12:
          input = validRequest({ requestId: id, maxLinearMemoryBytes: PLUGIN_WORKER_INITIAL_MEMORY_BYTES - 1 - variant });
          break;
        case 13:
          input = validRequest({ requestId: id, maxLinearMemoryBytes: PLUGIN_WORKER_MAX_MEMORY_BYTES + 1 + variant });
          break;
        case 14:
          input = validRequest({ requestId: id, maxOutputBytes: PLUGIN_WORKER_MAX_OUTPUT_BYTES + 1 + variant });
          break;
        default:
          input = variant % 2 === 0
            ? { type: 'probe-isolation', requestId: id, mutation: variant }
            : validRequest({ requestId: id, mutation: variant });
          break;
      }

      const uniqueKey = fingerprint(input);
      expect(fingerprints.has(uniqueKey), `mutation ${caseIndex} must be unique`).toBe(false);
      fingerprints.add(uniqueKey);
      try {
        const parsed = parsePluginSandboxWorkerRequest(input);
        expect(shouldAccept, `mutation ${caseIndex} family ${family} should reject`).toBe(true);
        expect(parsed.requestId).toBe(id);
        accepted += 1;
      } catch (error) {
        if (!(error instanceof PluginSandboxRequestError)) {
          nativeErrors += 1;
          throw error;
        }
        expect(shouldAccept, `mutation ${caseIndex} family ${family} should accept`).toBe(false);
        rejected += 1;
        errorCounts.set(error.code, (errorCounts.get(error.code) ?? 0) + 1);
      }
    }

    expect(fingerprints.size).toBe(4096);
    expect({ accepted, rejected, nativeErrors }).toEqual({ accepted: 512, rejected: 3584, nativeErrors: 0 });
    expect([...errorCounts.values()].reduce((sum, count) => sum + count, 0)).toBe(3584);
  });

  it('enforces exact execute payload, schema, request-ID, export, argument, and policy boundaries', () => {
    expect(parsePluginSandboxWorkerRequest(validRequest({ wasmBytes: new ArrayBuffer(8) })).type).toBe('execute-wasm');
    expect(parsePluginSandboxWorkerRequest(validRequest({ wasmBytes: new ArrayBuffer(PLUGIN_WORKER_MAX_WASM_BYTES) })).type).toBe('execute-wasm');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ wasmBytes: new ArrayBuffer(7) })), 'WASM_BINARY_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ wasmBytes: new ArrayBuffer(PLUGIN_WORKER_MAX_WASM_BYTES + 1) })), 'WASM_BINARY_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ requestId: 'a'.repeat(31) })), 'WASM_REQUEST_ID_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ requestId: 'A'.repeat(32) })), 'WASM_REQUEST_ID_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ mutation: true })), 'WASM_REQUEST_SCHEMA_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest({ ...validRequest(), maxOutputBytes: undefined }), 'WASM_OUTPUT_POLICY_REJECTED');
    const missingOutputPolicy: Record<string, unknown> = { ...validRequest() };
    delete missingOutputPolicy.maxOutputBytes;
    expectRequestError(() => parsePluginSandboxWorkerRequest(missingOutputPolicy), 'WASM_REQUEST_SCHEMA_REJECTED');
    expect(parsePluginSandboxWorkerRequest(validRequest({ exportFnName: 'x'.repeat(128) })).type).toBe('execute-wasm');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ exportFnName: 'x'.repeat(129) })), 'WASM_EXPORT_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ exportFnName: '' })), 'WASM_EXPORT_REJECTED');
    expect(parsePluginSandboxWorkerRequest(validRequest({ args: Array.from({ length: PLUGIN_WORKER_MAX_ARGS }, (_, index) => index) })).type).toBe('execute-wasm');
    expect(parsePluginSandboxWorkerRequest(validRequest({ args: [] })).type).toBe('execute-wasm');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ args: new Array<number>(1) })), 'WASM_ARGUMENTS_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ args: [Number.POSITIVE_INFINITY] })), 'WASM_ARGUMENTS_REJECTED');
    expect(parsePluginSandboxWorkerRequest(validRequest({ maxLinearMemoryBytes: PLUGIN_WORKER_INITIAL_MEMORY_BYTES })).type).toBe('execute-wasm');
    expect(parsePluginSandboxWorkerRequest(validRequest({ maxLinearMemoryBytes: PLUGIN_WORKER_MAX_MEMORY_BYTES })).type).toBe('execute-wasm');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ maxLinearMemoryBytes: PLUGIN_WORKER_INITIAL_MEMORY_BYTES - 1 })), 'WASM_MEMORY_POLICY_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ maxLinearMemoryBytes: PLUGIN_WORKER_MAX_MEMORY_BYTES + 1 })), 'WASM_MEMORY_POLICY_REJECTED');
    expect(parsePluginSandboxWorkerRequest(validRequest({ maxOutputBytes: 1 })).type).toBe('execute-wasm');
    expect(parsePluginSandboxWorkerRequest(validRequest({ maxOutputBytes: PLUGIN_WORKER_MAX_OUTPUT_BYTES })).type).toBe('execute-wasm');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ maxOutputBytes: 0 })), 'WASM_OUTPUT_POLICY_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest(validRequest({ maxOutputBytes: PLUGIN_WORKER_MAX_OUTPUT_BYTES + 1 })), 'WASM_OUTPUT_POLICY_REJECTED');
  });

  it('accepts only the exact isolation-probe envelope', () => {
    const probe = { type: 'probe-isolation', requestId: requestId(100) } as const;
    expect(parsePluginSandboxWorkerRequest(probe)).toEqual(probe satisfies PluginSandboxWorkerRequest);
    expectRequestError(() => parsePluginSandboxWorkerRequest({ ...probe, extra: 1 }), 'WASM_REQUEST_SCHEMA_REJECTED');
    expectRequestError(() => parsePluginSandboxWorkerRequest({ type: 'unknown', requestId: requestId(100) }), 'WASM_REQUEST_TYPE_REJECTED');
  });
});
