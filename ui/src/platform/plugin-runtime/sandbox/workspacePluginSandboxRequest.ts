// STATUS: DIAMANT VGT SUPREME — runtime-validated plugin worker message boundary.
export interface ExecuteWasmRequest {
  type: 'execute-wasm';
  requestId: string;
  wasmBytes: ArrayBuffer;
  exportFnName: string;
  args: number[];
  maxLinearMemoryBytes: number;
  maxOutputBytes: number;
}

export interface IsolationProbeRequest {
  type: 'probe-isolation';
  requestId: string;
}

export type PluginSandboxWorkerRequest = ExecuteWasmRequest | IsolationProbeRequest;

export const PLUGIN_WORKER_MAX_WASM_BYTES = 4 * 1024 * 1024;
export const PLUGIN_WORKER_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
export const PLUGIN_WORKER_MAX_ARGS = 32;
export const PLUGIN_WORKER_PAGE_BYTES = 64 * 1024;
export const PLUGIN_WORKER_INITIAL_MEMORY_BYTES = 256 * PLUGIN_WORKER_PAGE_BYTES;
export const PLUGIN_WORKER_MAX_MEMORY_BYTES = 1024 * PLUGIN_WORKER_PAGE_BYTES;

const REQUEST_ID_PATTERN = /^[0-9a-f]{32}$/;
const EXPORT_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/;

export class PluginSandboxRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PluginSandboxRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === allowed.length && keys.every((key) => typeof key === 'string' && allowed.includes(key));
}

function isDenseFiniteNumberArray(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length > PLUGIN_WORKER_MAX_ARGS) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes('length')) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index) || typeof value[index] !== 'number' || !Number.isFinite(value[index])) return false;
  }
  return true;
}

export function safePluginSandboxRequestId(value: unknown): string {
  try {
    if (!isRecord(value) || typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) return '';
    return value.requestId;
  } catch {
    return '';
  }
}

export function parsePluginSandboxWorkerRequest(value: unknown): PluginSandboxWorkerRequest {
  try {
    if (!isRecord(value)) throw new PluginSandboxRequestError('WASM_REQUEST_SCHEMA_REJECTED');
    if (value.type === 'probe-isolation') {
      if (!hasExactKeys(value, ['type', 'requestId'])) throw new PluginSandboxRequestError('WASM_REQUEST_SCHEMA_REJECTED');
      if (typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) throw new PluginSandboxRequestError('WASM_REQUEST_ID_REJECTED');
      return { type: 'probe-isolation', requestId: value.requestId };
    }
    if (value.type !== 'execute-wasm') throw new PluginSandboxRequestError('WASM_REQUEST_TYPE_REJECTED');
    if (!hasExactKeys(value, ['type', 'requestId', 'wasmBytes', 'exportFnName', 'args', 'maxLinearMemoryBytes', 'maxOutputBytes'])) {
      throw new PluginSandboxRequestError('WASM_REQUEST_SCHEMA_REJECTED');
    }
    if (typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) throw new PluginSandboxRequestError('WASM_REQUEST_ID_REJECTED');
    if (!(value.wasmBytes instanceof ArrayBuffer)
      || value.wasmBytes.byteLength < 8 || value.wasmBytes.byteLength > PLUGIN_WORKER_MAX_WASM_BYTES) {
      throw new PluginSandboxRequestError('WASM_BINARY_REJECTED');
    }
    if (typeof value.exportFnName !== 'string' || !EXPORT_NAME_PATTERN.test(value.exportFnName)) throw new PluginSandboxRequestError('WASM_EXPORT_REJECTED');
    if (!isDenseFiniteNumberArray(value.args)) {
      throw new PluginSandboxRequestError('WASM_ARGUMENTS_REJECTED');
    }
    const maxLinearMemoryBytes = value.maxLinearMemoryBytes;
    if (typeof maxLinearMemoryBytes !== 'number' || !Number.isSafeInteger(maxLinearMemoryBytes)
      || maxLinearMemoryBytes < PLUGIN_WORKER_INITIAL_MEMORY_BYTES
      || maxLinearMemoryBytes > PLUGIN_WORKER_MAX_MEMORY_BYTES) throw new PluginSandboxRequestError('WASM_MEMORY_POLICY_REJECTED');
    const maxOutputBytes = value.maxOutputBytes;
    if (typeof maxOutputBytes !== 'number' || !Number.isSafeInteger(maxOutputBytes)
      || maxOutputBytes < 1 || maxOutputBytes > PLUGIN_WORKER_MAX_OUTPUT_BYTES) {
      throw new PluginSandboxRequestError('WASM_OUTPUT_POLICY_REJECTED');
    }
    return {
      type: 'execute-wasm',
      requestId: value.requestId,
      wasmBytes: value.wasmBytes,
      exportFnName: value.exportFnName,
      args: value.args as number[],
      maxLinearMemoryBytes,
      maxOutputBytes,
    };
  } catch (error) {
    if (error instanceof PluginSandboxRequestError) throw error;
    throw new PluginSandboxRequestError('WASM_REQUEST_SCHEMA_REJECTED');
  }
}
