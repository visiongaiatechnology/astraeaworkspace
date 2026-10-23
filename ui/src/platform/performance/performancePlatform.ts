// STATUS: DIAMANT VGT SUPREME — bounded scheduling, streaming and degraded-mode policy.
import type { WorkspaceDocument } from '../../shared/contracts/workspace';

export const PERFORMANCE_BUDGETS = Object.freeze({
  targetFrameRate: 60,
  targetFrameMs: 1000 / 60,
  interactiveWorkBudgetMs: 8,
  maxFrameQueue: 256,
  maxBackgroundQueue: 128,
  backgroundChunkItems: 512,
  streamChunkBytes: 1024 * 1024,
  maxBufferedStreamBytes: 8 * 1024 * 1024,
  maxWorkspaceEstimatedBytes: 256 * 1024 * 1024,
  maxWorkspaceObjectNodes: 250_000,
  maxCostScanNodes: 50_000,
});

export type PerformanceMode = 'normal' | 'degraded-readonly';

export interface WorkspacePerformanceAssessment {
  mode: PerformanceMode;
  estimatedBytes: number;
  visitedNodes: number;
  scanTruncated: boolean;
  reason: string | null;
}

export interface FrameSchedulerStats {
  queued: number;
  dropped: number;
  executed: number;
  frames: number;
}

type FrameTask = () => void;
type RequestFrame = (callback: (timestamp: number) => void) => number;
type CancelFrame = (handle: number) => void;
type Clock = () => number;

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function defaultRequestFrame(callback: (timestamp: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(() => callback(defaultNow()), Math.ceil(PERFORMANCE_BUDGETS.targetFrameMs)) as unknown as number;
}

function defaultCancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle);
}

interface ForegroundFrameRecord {
  nativeHandle: number | null;
  visibilityListener: (() => void) | null;
}

let foregroundFrameSequence = 0;
const foregroundFrames = new Map<number, ForegroundFrameRecord>();

export function requestForegroundAnimationFrame(callback: (timestamp: number) => void): number {
  const id = ++foregroundFrameSequence;
  const record: ForegroundFrameRecord = { nativeHandle: null, visibilityListener: null };
  foregroundFrames.set(id, record);
  const schedule = () => {
    if (!foregroundFrames.has(id)) return;
    if (record.visibilityListener && typeof document !== 'undefined') document.removeEventListener('visibilitychange', record.visibilityListener);
    record.visibilityListener = null;
    record.nativeHandle = defaultRequestFrame((timestamp) => {
      foregroundFrames.delete(id);
      callback(timestamp);
    });
  };
  if (typeof document !== 'undefined' && document.hidden) {
    record.visibilityListener = () => { if (!document.hidden) schedule(); };
    document.addEventListener('visibilitychange', record.visibilityListener);
  } else schedule();
  return id;
}

export function cancelForegroundAnimationFrame(id: number): void {
  const record = foregroundFrames.get(id);
  if (!record) return;
  foregroundFrames.delete(id);
  if (record.nativeHandle !== null) defaultCancelFrame(record.nativeHandle);
  if (record.visibilityListener && typeof document !== 'undefined') document.removeEventListener('visibilitychange', record.visibilityListener);
}

export class FrameBudgetScheduler {
  private readonly tasks = new Map<string, FrameTask>();
  private readonly order: string[] = [];
  private frameHandle: number | null = null;
  private disposed = false;
  private dropped = 0;
  private executed = 0;
  private frames = 0;

  constructor(
    private readonly budgetMs = PERFORMANCE_BUDGETS.interactiveWorkBudgetMs,
    private readonly maxQueue = PERFORMANCE_BUDGETS.maxFrameQueue,
    private readonly requestFrame: RequestFrame = defaultRequestFrame,
    private readonly cancelFrame: CancelFrame = defaultCancelFrame,
    private readonly now: Clock = defaultNow,
  ) {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > PERFORMANCE_BUDGETS.targetFrameMs) {
      throw new RangeError('Frame work budget must fit inside the target frame');
    }
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 1) throw new RangeError('Frame queue bound must be positive');
  }

  schedule(key: string, task: FrameTask): 'queued' | 'coalesced' | 'rejected' {
    if (this.disposed || !key || typeof task !== 'function') return 'rejected';
    if (this.tasks.has(key)) {
      this.tasks.set(key, task);
      this.dropped += 1;
      return 'coalesced';
    }
    if (this.tasks.size >= this.maxQueue) {
      this.dropped += 1;
      return 'rejected';
    }
    this.tasks.set(key, task);
    this.order.push(key);
    this.ensureFrame();
    return 'queued';
  }

  cancel(key: string): boolean {
    const deleted = this.tasks.delete(key);
    if (deleted) this.dropped += 1;
    return deleted;
  }

  clear(): void {
    this.dropped += this.tasks.size;
    this.tasks.clear();
    this.order.length = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
    if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  stats(): FrameSchedulerStats {
    return { queued: this.tasks.size, dropped: this.dropped, executed: this.executed, frames: this.frames };
  }

  private ensureFrame(): void {
    if (this.frameHandle !== null || this.disposed || this.tasks.size === 0) return;
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null;
      this.flushFrame();
    });
  }

  private flushFrame(): void {
    if (this.disposed) return;
    this.frames += 1;
    const started = this.now();
    while (this.order.length > 0) {
      if (this.now() - started >= this.budgetMs) break;
      const key = this.order.shift();
      if (!key) continue;
      const task = this.tasks.get(key);
      if (!task) continue;
      this.tasks.delete(key);
      task();
      this.executed += 1;
    }
    while (this.order.length > 0 && !this.tasks.has(this.order[0] ?? '')) this.order.shift();
    this.ensureFrame();
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Operation aborted', 'AbortError');
}

async function yieldToHost(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

export async function processIncrementally<T>(
  items: readonly T[],
  consume: (item: T, index: number) => void | Promise<void>,
  options: { signal?: AbortSignal; chunkItems?: number; maxItems?: number } = {},
): Promise<number> {
  const chunkItems = options.chunkItems ?? PERFORMANCE_BUDGETS.backgroundChunkItems;
  const maxItems = options.maxItems ?? PERFORMANCE_BUDGETS.maxWorkspaceObjectNodes;
  if (!Number.isSafeInteger(chunkItems) || chunkItems < 1 || chunkItems > 16_384) throw new RangeError('Invalid incremental chunk size');
  if (!Number.isSafeInteger(maxItems) || maxItems < 0) throw new RangeError('Invalid incremental item bound');
  if (items.length > maxItems) throw new RangeError('Incremental item bound exceeded');

  for (let index = 0; index < items.length; index += 1) {
    throwIfAborted(options.signal);
    await consume(items[index] as T, index);
    if ((index + 1) % chunkItems === 0 && index + 1 < items.length) await yieldToHost(options.signal);
  }
  return items.length;
}

export interface StreamBackpressureStats {
  bytesRead: number;
  chunksRead: number;
  maxObservedChunkBytes: number;
}

export async function streamBlobWithBackpressure(
  blob: Blob,
  consume: (chunk: Uint8Array) => void | Promise<void>,
  options: { signal?: AbortSignal; maxBytes?: number } = {},
): Promise<StreamBackpressureStats> {
  const maxBytes = options.maxBytes ?? PERFORMANCE_BUDGETS.maxWorkspaceEstimatedBytes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid stream byte bound');
  if (blob.size > maxBytes) throw new RangeError('Stream byte bound exceeded');
  const reader = blob.stream().getReader();
  let bytesRead = 0;
  let chunksRead = 0;
  let maxObservedChunkBytes = 0;
  try {
    for (;;) {
      throwIfAborted(options.signal);
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      bytesRead += chunk.byteLength;
      if (bytesRead > maxBytes) throw new RangeError('Stream byte bound exceeded');
      maxObservedChunkBytes = Math.max(maxObservedChunkBytes, chunk.byteLength);
      chunksRead += 1;
      // Awaiting the consumer is the backpressure boundary: no next read happens until downstream accepts this chunk.
      await consume(chunk);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return { bytesRead, chunksRead, maxObservedChunkBytes };
}

function primitiveCost(value: unknown): number {
  if (typeof value === 'string') return Math.min(value.length * 2, 16 * 1024 * 1024);
  if (typeof value === 'number' || typeof value === 'bigint') return 8;
  if (typeof value === 'boolean') return 4;
  return 0;
}

export function assessWorkspaceDocumentPerformance(document: WorkspaceDocument): WorkspacePerformanceAssessment {
  const queue: unknown[] = [document];
  const seen = new Set<object>();
  let estimatedBytes = 0;
  let visitedNodes = 0;
  let scanTruncated = false;

  let cursor = 0;
  while (cursor < queue.length) {
    if (visitedNodes >= PERFORMANCE_BUDGETS.maxCostScanNodes) {
      scanTruncated = true;
      break;
    }
    const value = queue[cursor];
    cursor += 1;
    visitedNodes += 1;
    if (value === null || value === undefined) continue;
    estimatedBytes += primitiveCost(value);
    if (estimatedBytes > PERFORMANCE_BUDGETS.maxWorkspaceEstimatedBytes) break;
    if (typeof value !== 'object') continue;
    if (value instanceof ArrayBuffer) {
      estimatedBytes += value.byteLength;
      continue;
    }
    if (ArrayBuffer.isView(value)) {
      estimatedBytes += value.byteLength;
      continue;
    }
    const object = value as Record<string, unknown>;
    if (seen.has(object)) continue;
    seen.add(object);
    estimatedBytes += Array.isArray(value) ? 24 + value.length * 8 : 48;
    for (const [key, child] of Object.entries(object)) {
      estimatedBytes += key.length * 2 + 8;
      if (child !== null && typeof child === 'object') queue.push(child);
      else estimatedBytes += primitiveCost(child);
    }
  }

  let reason: string | null = null;
  if (estimatedBytes > PERFORMANCE_BUDGETS.maxWorkspaceEstimatedBytes) reason = 'estimated-memory-budget-exceeded';
  else if (visitedNodes > PERFORMANCE_BUDGETS.maxWorkspaceObjectNodes) reason = 'workspace-object-budget-exceeded';
  else if (scanTruncated) reason = 'workspace-complexity-scan-budget-exceeded';

  return {
    mode: reason ? 'degraded-readonly' : 'normal',
    estimatedBytes,
    visitedNodes,
    scanTruncated,
    reason,
  };
}

export function createLinearIndex<T>(
  items: readonly T[],
  keyFor: (item: T) => string,
  maxItems = PERFORMANCE_BUDGETS.maxWorkspaceObjectNodes,
): Map<string, T> {
  if (items.length > maxItems) throw new RangeError('Collection bound exceeded');
  const index = new Map<string, T>();
  for (const item of items) index.set(keyFor(item), item);
  return index;
}
