// STATUS: DIAMANT VGT SUPREME — Grid adapter delegates to canonical SyncGraph native client.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { closeSyncSession, getMissingSyncNodes, mergeSyncNode, openSyncSession, recordSyncOperation, syncGraphLifecycleNativeAvailable } from '../../../platform/syncgraph/syncGraphLifecycleClient';
import type { GridSyncMergeResponse, GridSyncMissingResponse, GridSyncNode, GridSyncOperation, GridSyncRecordResponse, GridSyncStatus, GridVectorClock } from './gridCollaborationTypes';
export const gridCollaborationNativeAvailable = syncGraphLifecycleNativeAvailable;
export const openGridSyncSession = (document: WorkspaceDocument, actorId: string): Promise<GridSyncStatus> => openSyncSession(document, actorId, actorId) as Promise<GridSyncStatus>;
export const recordGridSyncOperation = (documentId: string, operation: GridSyncOperation): Promise<GridSyncRecordResponse> => recordSyncOperation(documentId, operation) as Promise<GridSyncRecordResponse>;
export const mergeGridSyncNode = (documentId: string, node: GridSyncNode): Promise<GridSyncMergeResponse> => mergeSyncNode(documentId, node) as Promise<GridSyncMergeResponse>;
export const getGridMissingSyncNodes = (documentId: string, peerClock: GridVectorClock): Promise<GridSyncMissingResponse> => getMissingSyncNodes(documentId, peerClock) as Promise<GridSyncMissingResponse>;
export const closeGridSyncSession = closeSyncSession;
