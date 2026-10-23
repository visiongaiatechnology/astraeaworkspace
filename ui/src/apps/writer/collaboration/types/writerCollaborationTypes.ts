// STATUS: DIAMANT VGT SUPREME — Writer Collaboration Wire Types
import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';

export type WriterSyncOperation =
  | { InsertParagraph: { block_id: string; index: number; paragraph: Paragraph } }
  | { DeleteParagraph: { block_id: string; paragraph_id: string; index: number; cached_paragraph: Paragraph } }
  | { ReplaceParagraph: { block_id: string; paragraph_id: string; before: Paragraph; after: Paragraph } }
  | { MoveParagraph: { block_id: string; paragraph_id: string; from_index: number; to_index: number } }
  | { SetWriterData: { before: WorkspaceDocument['writerData'] | null; after: WorkspaceDocument['writerData'] | null } }
  | { SetWriterDataField: { field: string; before: unknown | null; after: unknown | null } };

export interface WriterVectorClock {
  clock: Record<string, number>;
}

export interface WriterSyncNode {
  op_id: string;
  actor_id: string;
  device_id: string;
  schema_version: number;
  object_ids: string[];
  lamport_time: number;
  parent_ids: string[];
  timestamp_utc: number;
  operation: WriterSyncOperation;
  document_id: string;
  signature?: string | null;
}

export interface WriterSyncConflict {
  op_id: string;
  actor_id: string;
  device_id: string;
  schema_version: number;
  object_ids: string[];
  lamport_time: number;
  reason: string;
}

export interface WriterSyncReport {
  applied_operation_ids: string[];
  conflicts: WriterSyncConflict[];
  buffered_count: number;
}

export interface WriterSyncAuditEntry {
  id: string;
  timestampUtc: number;
  direction: 'local' | 'remote' | 'replay';
  opId?: string | null;
  actorId?: string | null;
  appliedCount: number;
  conflicts: WriterSyncConflict[];
  bufferedCount: number;
}

export interface WriterSyncStatus {
  document: WorkspaceDocument;
  vectorClock: WriterVectorClock;
  pendingBufferCount: number;
  nodeCount: number;
  audit: WriterSyncAuditEntry[];
}

export interface WriterSyncRecordResponse {
  document: WorkspaceDocument;
  node: WriterSyncNode;
  vectorClock: WriterVectorClock;
  report: WriterSyncReport;
}

export interface WriterSyncMergeResponse {
  document: WorkspaceDocument;
  vectorClock: WriterVectorClock;
  report: WriterSyncReport;
}

export interface WriterSyncMissingResponse {
  nodes: WriterSyncNode[];
  hasMore: boolean;
}

export interface WriterPresenceCursor {
  paragraphId: string;
  anchor: number;
  focus: number;
}

export interface WriterPresenceState {
  actorId: string;
  sessionId: string;
  displayName: string;
  documentId: string;
  cursor?: WriterPresenceCursor;
  activeParagraphId?: string | null;
  updatedAt: number;
}

export type WriterCollaborationTransportMessage =
  | { kind: 'sync-node'; documentId: string; senderSessionId: string; targetSessionId?: string; node: WriterSyncNode }
  | { kind: 'sync-request'; documentId: string; senderSessionId: string; vectorClock: WriterVectorClock }
  | { kind: 'sync-batch-end'; documentId: string; senderSessionId: string; targetSessionId: string; hasMore: boolean }
  | { kind: 'presence'; documentId: string; senderSessionId: string; presence: WriterPresenceState }
  | { kind: 'leave'; documentId: string; senderSessionId: string; actorId: string };

export interface WriterCollaborationTransport {
  readonly id: string;
  readonly label: string;
  send(message: WriterCollaborationTransportMessage): void;
  subscribe(handler: (message: WriterCollaborationTransportMessage) => void): () => void;
  close(): void;
}

export interface WriterCollaborationPeer extends WriterPresenceState {
  stale: boolean;
}

export interface WriterCollaborationState {
  enabled: boolean;
  available: boolean;
  connecting: boolean;
  actorId: string;
  sessionId: string;
  peers: WriterCollaborationPeer[];
  conflictCount: number;
  bufferedOperationCount: number;
  lastError: string | null;
}
