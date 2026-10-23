// STATUS: DIAMANT VGT SUPREME — bounded platform capabilities and redacted counters.

import { SyncGraphBoundaryError, SYNCGRAPH_MAX_FRAME_BYTES, SYNCGRAPH_MAX_NODE_BYTES, SYNCGRAPH_SCHEMA_VERSION } from './syncGraphIngressPolicy';

export type SyncGraphPlatform = 'windows' | 'linux' | 'macos' | 'astraeaos';
export interface SyncGraphPlatformContract {
  platform: SyncGraphPlatform;
  schemaVersion: typeof SYNCGRAPH_SCHEMA_VERSION;
  durableMergeOwner: 'vgt-syncgraph';
  queueEncryptionRequired: true;
  transportPlaintextForbidden: true;
  futureOperationQuarantineRequired: true;
  maxNodeBytes: number;
  maxFrameBytes: number;
}
export function syncGraphPlatformContract(platform: SyncGraphPlatform): SyncGraphPlatformContract {
  return {
    platform, schemaVersion: SYNCGRAPH_SCHEMA_VERSION, durableMergeOwner: 'vgt-syncgraph',
    queueEncryptionRequired: true, transportPlaintextForbidden: true, futureOperationQuarantineRequired: true,
    maxNodeBytes: SYNCGRAPH_MAX_NODE_BYTES, maxFrameBytes: SYNCGRAPH_MAX_FRAME_BYTES,
  };
}

export interface SyncDiagnosticsSafe {
  nodeCount: number;
  causalBufferCount: number;
  outboundQueueCount: number;
  futureQuarantineCount: number;
  conflictCount: number;
  membershipEpoch: number;
  activePresenceCount: number;
}
export function createSafeSyncDiagnostics(input: SyncDiagnosticsSafe): SyncDiagnosticsSafe {
  for (const value of Object.values(input)) if (!Number.isSafeInteger(value) || value < 0) throw new SyncGraphBoundaryError('INVALID');
  return { ...input };
}
