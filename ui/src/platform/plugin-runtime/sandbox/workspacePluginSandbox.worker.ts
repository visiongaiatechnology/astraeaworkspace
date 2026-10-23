// STATUS: DIAMANT VGT SUPREME — Importless WASM worker with bounded linear memory and output.
import {
  parsePluginSandboxWorkerRequest,
  PLUGIN_WORKER_INITIAL_MEMORY_BYTES,
  PLUGIN_WORKER_MAX_MEMORY_BYTES,
  PLUGIN_WORKER_PAGE_BYTES,
  safePluginSandboxRequestId,
  type ExecuteWasmRequest,
  type PluginSandboxWorkerRequest,
} from './workspacePluginSandboxRequest';

interface WorkerResponse {
  requestId: string;
  ok: boolean;
  data?: number | string;
  memoryBytes: number;
  error?: string;
}

const FORBIDDEN_PLUGIN_GLOBALS = ['window', 'document', 'localStorage', 'indexedDB'] as const;

function shadowForbiddenPluginGlobal(name: string): void {
  if (!(name in globalThis)) return;
  try { Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false, enumerable: false }); } catch { /* validated below */ }
}

function assertPluginRealmIsolation(): void {
  for (const name of FORBIDDEN_PLUGIN_GLOBALS) {
    shadowForbiddenPluginGlobal(name);
    if (typeof (globalThis as unknown as Record<string, unknown>)[name] !== 'undefined') throw new Error(`PLUGIN_AMBIENT_GLOBAL_EXPOSED:${name}`);
  }
}

assertPluginRealmIsolation();

self.onmessage = async (event: MessageEvent<unknown>) => {
  let request: PluginSandboxWorkerRequest;
  try {
    request = parsePluginSandboxWorkerRequest(event.data);
  } catch (error) {
    self.postMessage({
      requestId: safePluginSandboxRequestId(event.data),
      ok: false,
      memoryBytes: 0,
      error: error instanceof Error ? error.message : 'WASM_REQUEST_REJECTED',
    });
    return;
  }
  if (request.type === 'probe-isolation') {
    let ok = true; let error: string | undefined;
    try { assertPluginRealmIsolation(); } catch (cause) { ok = false; error = cause instanceof Error ? cause.message : 'PLUGIN_REALM_ISOLATION_FAILED'; }
    self.postMessage({ requestId: request.requestId, ok, memoryBytes: 0, error, isolation: Object.fromEntries(FORBIDDEN_PLUGIN_GLOBALS.map((name) => [name, typeof (globalThis as unknown as Record<string, unknown>)[name] === 'undefined'])) });
    return;
  }
  const executeRequest: ExecuteWasmRequest = request;
  let response: WorkerResponse;
  try {
    preflightWasmMemory(executeRequest.wasmBytes, executeRequest.maxLinearMemoryBytes);
    const module = await WebAssembly.compile(executeRequest.wasmBytes);
    if (WebAssembly.Module.imports(module).length !== 0) throw new Error('WASM_IMPORTS_DENIED');
    const instance = await WebAssembly.instantiate(module, {});
    const memory = instance.exports.memory;
    const memoryBytes = memory instanceof WebAssembly.Memory ? memory.buffer.byteLength : 0;
    if (memoryBytes > executeRequest.maxLinearMemoryBytes) throw new Error('WASM_LINEAR_MEMORY_LIMIT');
    const target = instance.exports[executeRequest.exportFnName];
    if (typeof target !== 'function') throw new Error('WASM_EXPORT_NOT_FOUND');
    const raw = (target as (...args: number[]) => unknown)(...executeRequest.args);
    if (typeof raw !== 'number' && typeof raw !== 'bigint') throw new Error('WASM_RESULT_TYPE_REJECTED');
    const data = typeof raw === 'bigint' ? raw.toString(10) : raw;
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    if (encoded.byteLength > executeRequest.maxOutputBytes) throw new Error('WASM_OUTPUT_LIMIT');
    response = { requestId: request.requestId, ok: true, data, memoryBytes };
  } catch (error) {
    response = {
      requestId: request.requestId,
      ok: false,
      memoryBytes: 0,
      error: error instanceof Error ? error.message : 'WASM_WORKER_FAULT',
    };
  }
  self.postMessage(response);
};

function preflightWasmMemory(buffer: ArrayBuffer, maxMemoryBytes: number): void {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d
      || bytes[4] !== 0x01 || bytes[5] !== 0x00 || bytes[6] !== 0x00 || bytes[7] !== 0x00) {
    throw new Error('WASM_MAGIC_VERSION_REJECTED');
  }
  const maxPages = Math.min(PLUGIN_WORKER_MAX_MEMORY_BYTES / PLUGIN_WORKER_PAGE_BYTES, Math.floor(maxMemoryBytes / PLUGIN_WORKER_PAGE_BYTES));
  let offset = 8;
  let memorySections = 0;
  while (offset < bytes.length) {
    const sectionId = bytes[offset++];
    const sectionSize = readU32(bytes, offset);
    offset = sectionSize.next;
    const end = offset + sectionSize.value;
    if (end > bytes.length) throw new Error('WASM_SECTION_TRUNCATED');
    if (sectionId === 2) {
      const imports = readU32(bytes, offset);
      if (imports.value !== 0) throw new Error('WASM_IMPORTS_DENIED');
    }
    if (sectionId === 5) {
      memorySections += 1;
      if (memorySections > 1) throw new Error('WASM_MEMORY_SECTION_REJECTED');
      let cursor = offset;
      const count = readU32(bytes, cursor);
      cursor = count.next;
      if (count.value > 1) throw new Error('WASM_MULTIPLE_MEMORIES_REJECTED');
      if (count.value === 1) {
        const flags = readU32(bytes, cursor);
        cursor = flags.next;
        if (flags.value !== 1) throw new Error('WASM_MEMORY_MAX_REQUIRED');
        const minimum = readU32(bytes, cursor);
        cursor = minimum.next;
        const maximum = readU32(bytes, cursor);
        if (minimum.value > PLUGIN_WORKER_INITIAL_MEMORY_BYTES / PLUGIN_WORKER_PAGE_BYTES || minimum.value > maximum.value || maximum.value > maxPages) throw new Error('WASM_LINEAR_MEMORY_LIMIT');
      }
    }
    offset = end;
  }
}

function readU32(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let cursor = start;
  for (let count = 0; count < 5; count += 1) {
    if (cursor >= bytes.length) throw new Error('WASM_LEB_TRUNCATED');
    const byte = bytes[cursor++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: value >>> 0, next: cursor };
    shift += 7;
  }
  throw new Error('WASM_LEB_OVERFLOW');
}
