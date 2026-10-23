// STATUS: DIAMANT VGT SUPREME — Canonical operation/history contracts
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';

export type OperationPathSegment = string | number;
export type HistoryBoundaryReason = 'manual-save' | 'autosave' | 'named-version' | 'remote-merge' | 'recovery' | 'compaction' | 'security-reseal';

export interface OperationValue { present: boolean; value?: unknown; }

export interface WorkspaceDeltaOperation {
  operationId: string;
  documentId: string;
  path: OperationPathSegment[];
  before: OperationValue;
  after: OperationValue;
}

export interface WorkspaceOperationTransaction {
  id: string;
  groupId?: string;
  documentId: string;
  baseVersion: number;
  boundaryEpoch: number;
  timestamp: number;
  description: string;
  operations: WorkspaceDeltaOperation[];
}

export interface WorkspaceOperationGroup {
  id: string;
  description: string;
  timestamp: number;
  transactionIds: string[];
  documentIds: string[];
}

export interface HistoryBoundary {
  id: string;
  documentId: string;
  epoch: number;
  version: number;
  timestamp: number;
  reason: HistoryBoundaryReason;
  label: string;
  hard: boolean;
}

export interface NamedWorkspaceVersion {
  id: string;
  documentId: string;
  name: string;
  createdAt: number;
  sourceVersion: number;
  snapshot: WorkspaceDocument;
}

export interface OperationAutosaveSnapshot {
  id: string;
  documentId: string;
  createdAt: number;
  reason: string;
  sourceVersion: number;
  historyCursor: string | null;
  snapshot: WorkspaceDocument;
}

export interface CompactedHistoryAnchor {
  documentId: string;
  version: number;
  createdAt: number;
  compactedTransactions: number;
  snapshot: WorkspaceDocument;
}

export interface DocumentHistoryState {
  undo: WorkspaceOperationTransaction[];
  redo: WorkspaceOperationTransaction[];
  boundaryEpoch: number;
  boundaries: HistoryBoundary[];
  namedVersions: NamedWorkspaceVersion[];
  autosaveSnapshots: OperationAutosaveSnapshot[];
  compactedAnchor?: CompactedHistoryAnchor;
}

export interface OperationEngineOptions {
  maxOperationsPerTransaction?: number;
  maxHistoryTransactions?: number;
  maxHistoryBytes?: number;
  keepRecentTransactions?: number;
  maxNamedVersions?: number;
  maxAutosaveSnapshots?: number;
  now?: () => number;
  idFactory?: () => string;
}

export interface CommitResult { document: WorkspaceDocument; transaction: WorkspaceOperationTransaction | null; }
export interface GroupCommitResult { documents: Record<string, WorkspaceDocument>; group: WorkspaceOperationGroup | null; touchedDocumentIds: string[]; }

export class WorkspaceOperationError extends Error {
  constructor(public readonly code: 'INVALID' | 'CONFLICT' | 'BOUNDARY' | 'EMPTY' | 'LIMIT', message: string) {
    super(message);
    this.name = 'WorkspaceOperationError';
  }
}
