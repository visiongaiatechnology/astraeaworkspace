import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';
// STATUS: PLATIN — Worker-isolated importless WASM execution surface.
// Package trust and host capabilities are authorized by native vgt-plugin-runtime.
import {
  MAX_PLUGIN_WASM_BYTES,
  PLUGIN_API_VERSION,
  PLUGIN_MANIFEST_SCHEMA,
  createUnprivilegedDemoPermit,
  type PluginCapabilityManifest,
  type PluginExecutionPermit,
} from '../pluginRuntimePolicy';

export type { PluginCapabilityManifest, PluginExecutionPermit } from '../pluginRuntimePolicy';

export type SandboxExecutionStatus = 'READY' | 'EXECUTING' | 'COMPLETED' | 'TERMINATED_TIMEOUT' | 'TERMINATED_OOM' | 'POLICY_VIOLATION' | 'FAULT';
export interface SandboxExecutionResult<T = unknown> {
  success: boolean; data: T | null; status: SandboxExecutionStatus; executionTimeMs: number;
  memoryAllocatedBytes: number; error?: string; auditLog: string[];
}

export const PLUGIN_INITIAL_LINEAR_MEMORY_BYTES = 16 * 1024 * 1024;
export const PLUGIN_MAX_LINEAR_MEMORY_BYTES = 64 * 1024 * 1024;
export const PLUGIN_EXECUTION_DEADLINE_MS = 5_000;

export const DEFAULT_RESOURCE_LIMITS = {
  maxLinearMemoryBytes: PLUGIN_MAX_LINEAR_MEMORY_BYTES, maxCpuMs: PLUGIN_EXECUTION_DEADLINE_MS, maxExecutionMs: PLUGIN_EXECUTION_DEADLINE_MS,
  maxInputBytes: 256 * 1024, maxOutputBytes: 256 * 1024, maxStorageBytes: 8 * 1024 * 1024,
};

const MATH_DEMO_SHA256 = '3245a799ceaa2b0fe59d6e2d8846b838e817f85f73a5d3173434cf34d824215a';
const SUMMARY_DEMO_SHA256 = 'e5b4200f5012e38d8a0a56c7ef28451e5f2a38984820cce235169d41a6707fc4';

export const STANDARD_MATH_PLUGIN_MANIFEST: PluginCapabilityManifest = {
  schemaVersion: PLUGIN_MANIFEST_SCHEMA, pluginId: 'vgt.plugin.math-transform', name: 'Deterministic Math & Formula Solver',
  version: '1.0.0', publisher: 'VisionGaiaTechnology', apiCompatibility: { minimumInclusive: PLUGIN_API_VERSION, maximumExclusive: 'vgt.workspace.plugin/2' },
  entrypoints: [{ kind: 'wasm', exportName: 'answer' }], requestedCapabilities: [], resourceLimits: { ...DEFAULT_RESOURCE_LIMITS, maxLinearMemoryBytes: PLUGIN_INITIAL_LINEAR_MEMORY_BYTES, maxCpuMs: 800, maxExecutionMs: 1000 },
  packageSha256: MATH_DEMO_SHA256, updateSource: { kind: 'offline-file', sourceId: 'builtin-demo' },
};
export const STANDARD_SUMMARY_PLUGIN_MANIFEST: PluginCapabilityManifest = {
  schemaVersion: PLUGIN_MANIFEST_SCHEMA, pluginId: 'vgt.plugin.wom-metrics', name: 'Canonical WOM Metric Plugin',
  version: '1.0.0', publisher: 'VisionGaiaTechnology', apiCompatibility: { minimumInclusive: PLUGIN_API_VERSION, maximumExclusive: 'vgt.workspace.plugin/2' },
  entrypoints: [{ kind: 'wasm', exportName: 'answer' }], requestedCapabilities: ['document.read'], resourceLimits: { ...DEFAULT_RESOURCE_LIMITS },
  packageSha256: SUMMARY_DEMO_SHA256, updateSource: { kind: 'offline-file', sourceId: 'builtin-demo' },
};

interface WorkerResponse<T> { requestId: string; ok: boolean; data?: T; memoryBytes: number; error?: string; }

export class WorkspaceWasmSandbox {
  private readonly permit: PluginExecutionPermit;
  private status: SandboxExecutionStatus = 'READY';
  constructor(permit: PluginExecutionPermit) {
    if (!permit.standardTierImportlessWasm || permit.negotiatedApiVersion !== PLUGIN_API_VERSION) throw new Error('PLUGIN_EXECUTION_PERMIT_REJECTED');
    if (permit.authority === 'unprivileged-demo' && permit.hostCapabilities.length !== 0) throw new Error('PLUGIN_DEMO_HOST_CAPABILITY_REJECTED');
    this.permit = structuredClone(permit);
  }
  public getStatus(): SandboxExecutionStatus { return this.status; }
  public async executeScript<T = unknown>(_scriptCode: string, _payload: unknown): Promise<SandboxExecutionResult<T>> {
    this.status = 'POLICY_VIOLATION';
    return { success: false, data: null, status: 'POLICY_VIOLATION', executionTimeMs: 0, memoryAllocatedBytes: 0,
      error: 'ARBITRARY_SCRIPT_EXECUTION_DISABLED_USE_WASM_OR_AUTOMATION_IR', auditLog: ['[Policy] Standard plugins execute importless WASM only.'] };
  }
  public async executeWasmModule<T = number | string>(wasmBytes: Uint8Array, exportFnName: string, args: number[]): Promise<SandboxExecutionResult<T>> {
    const started = performance.now(); const auditLog: string[] = [];
    try {
      if (wasmBytes.byteLength === 0 || wasmBytes.byteLength > Math.min(MAX_PLUGIN_WASM_BYTES, this.permit.resourceLimits.maxInputBytes)) throw new Error('WASM_BINARY_SIZE_REJECTED');
      if (exportFnName !== this.permit.entrypointExport) throw new Error('WASM_ENTRYPOINT_MISMATCH');
      const digest = await sha256Hex(wasmBytes);
      if (!constantTimeAsciiEqual(digest, this.permit.packageSha256)) throw new Error('PLUGIN_PERMIT_PACKAGE_DIGEST_MISMATCH');
      if (typeof Worker === 'undefined') throw new Error('PLUGIN_WORKER_UNAVAILABLE');
      this.status = 'EXECUTING';
      const worker = new Worker(new URL('./workspacePluginSandbox.worker.ts', import.meta.url), { type: 'module', name: `vgt-plugin-${this.permit.pluginId}` });
      const requestId = randomRequestId(); const transferable = wasmBytes.slice().buffer;
      const result = await new Promise<WorkerResponse<T>>((resolve, reject) => {
        const deadlineMs = Math.min(PLUGIN_EXECUTION_DEADLINE_MS, this.permit.resourceLimits.maxCpuMs, this.permit.resourceLimits.maxExecutionMs);
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('PLUGIN_EXECUTION_DEADLINE_EXCEEDED')); }, deadlineMs);
        worker.onmessage = (event: MessageEvent<WorkerResponse<T>>) => { if (event.data.requestId !== requestId) return; clearTimeout(timer); worker.terminate(); resolve(event.data); };
        worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('PLUGIN_WORKER_CRASHED')); };
        worker.postMessage({ type: 'execute-wasm', requestId, wasmBytes: transferable, exportFnName, args,
          maxLinearMemoryBytes: this.permit.resourceLimits.maxLinearMemoryBytes, maxOutputBytes: this.permit.resourceLimits.maxOutputBytes }, [transferable]);
      });
      const duration = roundMs(performance.now() - started);
      if (!result.ok) { this.status = result.error === 'WASM_LINEAR_MEMORY_LIMIT' ? 'TERMINATED_OOM' : 'POLICY_VIOLATION';
        return { success: false, data: null, status: this.status, executionTimeMs: duration, memoryAllocatedBytes: result.memoryBytes, error: result.error ?? 'PLUGIN_EXECUTION_REJECTED', auditLog: [`[Worker] ${result.error ?? 'Rejected'}`] }; }
      this.status = 'COMPLETED'; auditLog.push(`[Worker] Importless WASM completed in ${duration}ms`);
      auditLog.push(`[Permit] authority=${this.permit.authority}; cpu<=${this.permit.resourceLimits.maxCpuMs}ms; wall<=${this.permit.resourceLimits.maxExecutionMs}ms; memory<=${this.permit.resourceLimits.maxLinearMemoryBytes}B; ambient network/fs/clipboard/key imports=denied`);
      return { success: true, data: result.data ?? null, status: 'COMPLETED', executionTimeMs: duration, memoryAllocatedBytes: result.memoryBytes, auditLog };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PLUGIN_EXECUTION_FAILED';
      if (message === 'PLUGIN_EXECUTION_DEADLINE_EXCEEDED') this.status = 'TERMINATED_TIMEOUT'; else if (this.status === 'EXECUTING') this.status = 'FAULT'; else this.status = 'POLICY_VIOLATION';
      return { success: false, data: null, status: this.status, executionTimeMs: roundMs(performance.now() - started), memoryAllocatedBytes: 0, error: message, auditLog: [`[Sandbox] ${message}`] };
    }
  }
}

export function demoPermitForManifest(manifest: PluginCapabilityManifest): PluginExecutionPermit { return createUnprivilegedDemoPermit(manifest); }
export function demoWasmConstant(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 127) throw new Error('DEMO_WASM_VALUE_REJECTED');
  return Uint8Array.from([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,10,1,6,97,110,115,119,101,114,0,0,10,6,1,4,0,65,value,11]);
}
async function sha256Hex(bytes: Uint8Array): Promise<string> { const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', toOwnedArrayBuffer(bytes))); return Array.from(digest, v => v.toString(16).padStart(2, '0')).join(''); }
function constantTimeAsciiEqual(left: string, right: string): boolean { let diff = left.length ^ right.length; const max = Math.max(left.length, right.length); for (let i=0;i<max;i+=1) diff |= (left.charCodeAt(i)||0) ^ (right.charCodeAt(i)||0); return diff===0; }
function randomRequestId(): string { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes, v => v.toString(16).padStart(2,'0')).join(''); }
function roundMs(value: number): number { return Math.round(value * 100) / 100; }
