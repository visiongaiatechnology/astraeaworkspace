// STATUS: DIAMANT VGT SUPREME — bounded resume and recovery request projections.

import { boundedId, parseVectorClock, SyncGraphBoundaryError } from './syncGraphIngressPolicy';

export interface SyncFrontier { clock: Record<string, number>; }
export interface SyncResumeRequest { documentId: string; acknowledgedFrontier: SyncFrontier; maxBatch: number; }
export function createResumeRequest(documentId: string, frontier: SyncFrontier, maxBatch = 256): SyncResumeRequest {
  const id = boundedId(documentId, 'document id');
  const clock = parseVectorClock(frontier.clock);
  if (!Number.isInteger(maxBatch) || maxBatch < 1 || maxBatch > 256) throw new SyncGraphBoundaryError('BOUNDS');
  return { documentId: id, acknowledgedFrontier: { clock }, maxBatch };
}

export interface QueueRecoveryDiagnostic {
  recoveredFromCorruption: boolean;
  outboundCount: number;
  inboundBufferedCount: number;
  futureQuarantineCount: number;
  totalBytes: number;
}
export function createQueueRecoveryDiagnostic(input: QueueRecoveryDiagnostic): QueueRecoveryDiagnostic {
  for (const value of [input.outboundCount, input.inboundBufferedCount, input.futureQuarantineCount, input.totalBytes]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new SyncGraphBoundaryError('INVALID');
  }
  return { ...input };
}
