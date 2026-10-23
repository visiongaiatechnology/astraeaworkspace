// STATUS: DIAMANT VGT SUPREME — deterministic conflict vocabulary and bounded ingress controls.

import { boundedId, boundedLogicalTime, SyncGraphBoundaryError, SYNCGRAPH_MAX_INGRESS_PER_WINDOW, SYNCGRAPH_MAX_REPLAYS_PER_WINDOW, SYNCGRAPH_RATE_WINDOW_MS } from './syncGraphIngressPolicy';
import type { SyncMergeStrategy, SyncObjectFamily } from './syncGraphIngressPolicy';

export function mergeStrategyForObjectFamily(family: SyncObjectFamily): SyncMergeStrategy {
  switch (family) {
    case 'text': return 'text-sequence';
    case 'ordered-list': return 'stable-ordered-sequence';
    case 'map': return 'optimistic-register';
    case 'table': return 'table-cell-register';
    case 'geometry': return 'geometry-register';
    case 'binary-asset': return 'binary-asset-register';
    case 'review': return 'durable-review-object';
    case 'object-set': return 'observed-remove-object-set';
  }
}

export interface VisibleConflictDecision {
  id: string;
  operationIds: [string, string];
  documentId: string;
  objectId: string;
  strategy: SyncMergeStrategy;
  reasonCode: 'semantic-conflict' | 'deleted-target' | 'binary-divergence' | 'permission-change' | 'unsupported-operation';
  state: 'needs-user-decision' | 'resolved-local' | 'resolved-remote';
}

export function createVisibleConflictDecision(input: Omit<VisibleConflictDecision, 'id' | 'state'>): VisibleConflictDecision {
  const [left, right] = input.operationIds.map((value) => boundedId(value, 'conflict operation id')) as [string, string];
  const documentId = boundedId(input.documentId, 'conflict document id');
  const objectId = boundedId(input.objectId, 'conflict object id');
  const key = [left, right].sort().join(':');
  return { ...input, operationIds: [left, right], documentId, objectId, id: `sync-conflict:${documentId}:${objectId}:${key}`, state: 'needs-user-decision' };
}

export class OperationReplayWindow {
  private readonly seen = new Map<string, number>();
  constructor(private readonly maxEntries = 65_536) {
    if (!Number.isInteger(maxEntries) || maxEntries < 128 || maxEntries > 1_000_000) throw new SyncGraphBoundaryError('BOUNDS');
  }
  admit(operationId: string, logicalTime: number): 'new' | 'duplicate' {
    const id = boundedId(operationId, 'operation id');
    boundedLogicalTime(logicalTime);
    if (this.seen.has(id)) return 'duplicate';
    if (this.seen.size >= this.maxEntries) {
      const oldest = this.seen.keys().next().value as string | undefined;
      if (oldest) this.seen.delete(oldest);
    }
    this.seen.set(id, logicalTime);
    return 'new';
  }
  get size(): number { return this.seen.size; }
}

interface RateWindow { startedAt: number; ingress: number; replays: number; }
export class SyncIngressRateLimiter {
  private readonly windows = new Map<string, RateWindow>();
  check(deviceId: string, now: number, replay: boolean): void {
    const id = boundedId(deviceId, 'device id');
    if (!Number.isFinite(now) || now < 0) throw new SyncGraphBoundaryError('INVALID');
    let window = this.windows.get(id);
    if (!window || now - window.startedAt >= SYNCGRAPH_RATE_WINDOW_MS || now < window.startedAt) {
      window = { startedAt: now, ingress: 0, replays: 0 };
      this.windows.set(id, window);
    }
    window.ingress += 1;
    if (replay) window.replays += 1;
    if (window.ingress > SYNCGRAPH_MAX_INGRESS_PER_WINDOW || window.replays > SYNCGRAPH_MAX_REPLAYS_PER_WINDOW) {
      throw new SyncGraphBoundaryError('RATE_LIMIT');
    }
  }
}
