// STATUS: DIAMANT VGT SUPREME — Typed access to native SyncGraph lifecycle/security services.
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import {
  classifyInboundOperation,
  type QuarantinedFutureOperation,
  SyncGraphBoundaryError,
} from './syncGraphCollaborationCore';

export interface SyncVectorClockWire { clock: Record<string, number>; }
export interface SyncNodeWire<T = unknown> {
  op_id: string;
  actor_id: string;
  device_id: string;
  schema_version: number;
  object_ids: string[];
  lamport_time: number;
  parent_ids: string[];
  timestamp_utc: number;
  operation: T;
  document_id: string;
  signature?: string | null;
}
export interface SyncConflictWire { op_id: string; actor_id: string; lamport_time: number; reason: string; }
export interface SyncReportWire { applied_operation_ids: string[]; conflicts: SyncConflictWire[]; buffered_count: number; quarantined_future_count?: number; }
export interface SyncAuditWire { conflicts: SyncConflictWire[]; }
export interface SyncStatusWire {
  document: WorkspaceDocument;
  vectorClock: SyncVectorClockWire;
  pendingBufferCount: number;
  nodeCount: number;
  audit: SyncAuditWire[];
  offlineQueueCount?: number;
  offlineQueueBytes?: number;
  queueCorruptRecovered?: boolean;
  futureQuarantineCount?: number;
  tombstoneCount?: number;
  membershipEpoch?: number;
}
export interface SyncRecordResponseWire<T = unknown> { document: WorkspaceDocument; node: SyncNodeWire<T>; vectorClock: SyncVectorClockWire; report: SyncReportWire; }
export interface SyncMergeResponseWire { document: WorkspaceDocument; vectorClock: SyncVectorClockWire; report: SyncReportWire; }
export interface SyncMissingResponseWire<T = unknown> { nodes: SyncNodeWire<T>[]; hasMore: boolean; }
export interface SyncSnapshotWire {
  schema_version: number;
  document: WorkspaceDocument;
  frontier: SyncVectorClockWire;
  membership_epoch: number;
  created_at_ms: number;
  document_digest_blake3: number[];
}
export type SyncMemberRole = 'owner' | 'editor' | 'commenter' | 'viewer';
export type SyncMembershipChange =
  | { action: 'addMember'; member_id: string; role: SyncMemberRole }
  | { action: 'addDevice'; member_id: string; device_id: string; key_id: string }
  | { action: 'revokeDevice'; member_id: string; device_id: string }
  | { action: 'removeMember'; member_id: string };

export function syncGraphLifecycleNativeAvailable(): boolean { return isNativeDesktop(); }

export function openSyncSession(document: WorkspaceDocument, actorId: string, deviceId?: string): Promise<SyncStatusWire> {
  return invokeNative('vgt_sync_open', { request: { document, actorId, deviceId } });
}
export function recordSyncOperation<T>(documentId: string, operation: T): Promise<SyncRecordResponseWire<T>> {
  return invokeNative('vgt_sync_record', { request: { documentId, operation } });
}
export function mergeSyncNode<T>(documentId: string, node: SyncNodeWire<T>): Promise<SyncMergeResponseWire> {
  return invokeNative('vgt_sync_merge', { request: { documentId, node } });
}
export function getMissingSyncNodes<T>(documentId: string, peerClock: SyncVectorClockWire): Promise<SyncMissingResponseWire<T>> {
  return invokeNative('vgt_sync_missing', { request: { documentId, peerClock } });
}
export function getSyncStatus(documentId: string): Promise<SyncStatusWire> {
  return invokeNative('vgt_sync_status', { request: { documentId } });
}
export function closeSyncSession(documentId: string): Promise<boolean> {
  return invokeNative('vgt_sync_close', { request: { documentId } });
}

export function captureSyncSnapshot(documentId: string): Promise<SyncSnapshotWire> {
  return invokeNative('vgt_sync_snapshot', { request: { documentId } });
}

export function bootstrapSyncSnapshot(documentId: string, snapshot: SyncSnapshotWire): Promise<unknown> {
  return invokeNative('vgt_sync_bootstrap', { request: { documentId, snapshot } });
}

export function garbageCollectSyncTombstones(documentId: string, acknowledgedFrontier: SyncVectorClockWire): Promise<number> {
  return invokeNative('vgt_sync_gc', { request: { documentId, acknowledgedFrontier } });
}

export function changeSyncMembership(
  documentId: string,
  change: SyncMembershipChange,
): Promise<{ membershipEpoch: number; queueRekeyRequired: boolean }> {
  return invokeNative('vgt_sync_membership_change', { request: { documentId, change } });
}

export async function quarantineFutureSyncOperation(entry: QuarantinedFutureOperation): Promise<{ futureQuarantineCount: number }> {
  return invokeNative('vgt_sync_quarantine_future', {
    request: {
      documentId: entry.documentId,
      operationId: entry.operationId,
      schemaVersion: entry.schemaVersion,
      raw: entry.raw,
    },
  });
}

/**
 * Transport ingress is not enabled until a native adapter supplies verified peer authority.
 * Future schemas may be quarantined opaquely; supported operations fail closed before merge.
 */
export async function routeInboundSyncOperation(
  documentId: string,
  raw: unknown,
  signal?: AbortSignal,
): Promise<{ kind: 'quarantined'; count: number }> {
  const classification = classifyInboundOperation(raw, Date.now(), signal);
  if (classification.kind === 'future') {
    if (classification.documentId !== documentId) throw new SyncGraphBoundaryError('POLICY');
    if (signal?.aborted) throw new SyncGraphBoundaryError('CANCELLED', 'SyncGraph input cancelled');
    const result = await quarantineFutureSyncOperation(classification);
    return { kind: 'quarantined', count: result.futureQuarantineCount };
  }
  const source = raw as Record<string, unknown>;
  const envelope = classification.envelope;
  if (envelope.documentId !== documentId) throw new SyncGraphBoundaryError('POLICY');
  const timestamp = source.timestamp_utc ?? source.timestampUtc;
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp)) throw new SyncGraphBoundaryError('INVALID');
  if (signal?.aborted) throw new SyncGraphBoundaryError('CANCELLED', 'SyncGraph input cancelled');
  throw new SyncGraphBoundaryError('POLICY', 'Authenticated SyncGraph transport is unavailable');
}
