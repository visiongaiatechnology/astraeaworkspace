// STATUS: DIAMANT VGT SUPREME — Writer adapter delegates to canonical SyncGraph native client.
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  closeSyncSession, getMissingSyncNodes, getSyncStatus, mergeSyncNode, openSyncSession, recordSyncOperation, syncGraphLifecycleNativeAvailable,
} from '../../../../platform/syncgraph/syncGraphLifecycleClient';
import type {
  WriterSyncMergeResponse, WriterSyncMissingResponse, WriterSyncNode, WriterSyncOperation, WriterSyncRecordResponse, WriterSyncStatus, WriterVectorClock,
} from '../types/writerCollaborationTypes';

export const writerCollaborationNativeAvailable = syncGraphLifecycleNativeAvailable;
export async function openWriterSyncSession(document: WorkspaceDocument, actorId: string): Promise<WriterSyncStatus> {
  return openSyncSession(document, actorId, actorId) as Promise<WriterSyncStatus>;
}
export async function recordWriterSyncOperation(documentId: string, operation: WriterSyncOperation): Promise<WriterSyncRecordResponse> {
  return recordSyncOperation(documentId, operation) as Promise<WriterSyncRecordResponse>;
}
export async function mergeWriterSyncNode(documentId: string, node: WriterSyncNode): Promise<WriterSyncMergeResponse> {
  return mergeSyncNode(documentId, node) as Promise<WriterSyncMergeResponse>;
}
export async function getWriterMissingSyncNodes(documentId: string, peerClock: WriterVectorClock): Promise<WriterSyncMissingResponse> {
  return getMissingSyncNodes(documentId, peerClock) as Promise<WriterSyncMissingResponse>;
}
export async function getWriterSyncStatus(documentId: string): Promise<WriterSyncStatus> {
  return getSyncStatus(documentId) as Promise<WriterSyncStatus>;
}
export async function closeWriterSyncSession(documentId: string): Promise<boolean> { return closeSyncSession(documentId); }
