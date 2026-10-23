// STATUS: DIAMANT VGT SUPREME — Grid SyncGraph wire types.
import type { GridCell, WorkspaceDocument } from '../../../shared/contracts/workspace';

export interface GridVectorClock { clock: Record<string, number>; }
export type GridSyncOperation = { SetCell: {
  table_id: string;
  coord: string;
  old_value: GridCell['value'];
  new_value: GridCell['value'];
  old_formula: string | null;
  new_formula: string | null;
} };
export interface GridSyncNode {
  op_id: string; actor_id: string; device_id: string; schema_version: number; object_ids: string[]; lamport_time: number; parent_ids: string[]; timestamp_utc: number;
  operation: GridSyncOperation; document_id: string; signature?: string | null;
}
export interface GridSyncConflict { op_id: string; actor_id: string; lamport_time: number; reason: string; }
export interface GridSyncReport { applied_operation_ids: string[]; conflicts: GridSyncConflict[]; buffered_count: number; }
export interface GridSyncStatus { document: WorkspaceDocument; vectorClock: GridVectorClock; pendingBufferCount: number; nodeCount: number; audit: unknown[]; }
export interface GridSyncRecordResponse { document: WorkspaceDocument; node: GridSyncNode; vectorClock: GridVectorClock; report: GridSyncReport; }
export interface GridSyncMergeResponse { document: WorkspaceDocument; vectorClock: GridVectorClock; report: GridSyncReport; }
export interface GridSyncMissingResponse { nodes: GridSyncNode[]; hasMore: boolean; }

export interface GridPresenceState {
  actorId: string; sessionId: string; displayName: string; documentId: string; activeSheetId?: string; activeCell?: string; updatedAt: number;
}
export type GridCollaborationMessage =
  | { kind:'sync-node'; documentId:string; senderSessionId:string; targetSessionId?:string; node:GridSyncNode }
  | { kind:'sync-request'; documentId:string; senderSessionId:string; vectorClock:GridVectorClock }
  | { kind:'sync-batch-end'; documentId:string; senderSessionId:string; targetSessionId:string; hasMore:boolean }
  | { kind:'presence'; documentId:string; senderSessionId:string; presence:GridPresenceState }
  | { kind:'leave'; documentId:string; senderSessionId:string; actorId:string };
export interface GridCollaborationTransport { label:string; send(message:GridCollaborationMessage):void; subscribe(handler:(message:GridCollaborationMessage)=>void):()=>void; close():void; }
