// STATUS: DIAMANT VGT SUPREME — Workspace Fabric public contracts
import type { WorkspaceDocument, WorkspaceObject, WorkspacePermissionRole } from '../contracts/workspace';

export type FabricLinkStatus =
  | 'current'
  | 'changed'
  | 'broken'
  | 'unavailable'
  | 'permission-lost'
  | 'frozen';

export type FabricTransferChoice = 'LiveLink' | 'PasteCopy';
export type FabricExportPolicy = 'RefreshThenFreeze' | 'FreezeCurrent' | 'PreserveLiveLocalOnly';

export interface FabricResolutionPolicy {
  /** Missing IDs are treated as offline/unavailable even if cached in the local map. */
  unavailableDocumentIds?: ReadonlySet<string>;
  /** Optional least-privilege capability decision. False means permission-lost. */
  canReadSource?: (source: WorkspaceDocument, target: WorkspaceDocument) => boolean;
  /** Optional actor role at the source and role ceiling exposed by the target context. */
  sourceRole?: (source: WorkspaceDocument, target: WorkspaceDocument) => WorkspacePermissionRole;
  targetRole?: (source: WorkspaceDocument, target: WorkspaceDocument) => WorkspacePermissionRole;
  /** Remote documents require a NetGate/Sovereign transport capability before resolution. */
  remoteDocumentIds?: ReadonlySet<string>;
  transportCapabilityDocumentIds?: ReadonlySet<string>;
}

export interface FabricLink {
  targetDocId: string;
  targetRefId: string;
  sourceDocId: string;
  sourceObjId: string;
  mode: 'Live' | 'Frozen';
  status: FabricLinkStatus;
  sourceVersion?: number;
  resolvedSourceVersion?: number;
  sourceSnapshotId?: string;
  effectiveRole?: WorkspacePermissionRole;
  expectedType?: WorkspaceObject['type'];
}

export interface FabricResolution {
  link: FabricLink;
  sourceDocument?: WorkspaceDocument;
  sourceObject?: WorkspaceObject;
  snapshot?: WorkspaceObject;
}

export interface FabricNotification {
  id: string;
  at: number;
  sourceDocId: string;
  sourceObjId: string;
  targetDocId: string;
  targetRefId: string;
  previousStatus: FabricLinkStatus;
  status: FabricLinkStatus;
  sourceVersion?: number;
  previousResolvedSourceVersion?: number;
  resolvedSourceVersion?: number;
  kind: 'source-changed' | 'refreshed' | 'frozen' | 'broken' | 'relinked' | 'unavailable' | 'permission-lost';
}

export interface FabricDependencyEdge {
  sourceDocId: string;
  sourceObjId: string;
  targetDocId: string;
  targetRefId: string;
  mode: 'Live' | 'Frozen';
}

export interface FabricDependencyGraph {
  nodes: string[];
  edges: FabricDependencyEdge[];
  cycles: string[][];
}

export interface FabricRenderContract {
  contract: 'astraea.workspace.fabric.render.v1';
  referenceId: string;
  sourceUri: string;
  mode: 'Live' | 'Frozen';
  status: FabricLinkStatus;
  sourceType?: WorkspaceObject['type'];
  sourceVersion?: number;
  resolvedSourceVersion?: number;
  sourceSnapshotId?: string;
  effectiveRole?: WorkspacePermissionRole;
  stale: boolean;
  payload?: WorkspaceObject;
}

export interface FabricTransactionResult {
  updatedDocs: Record<string, WorkspaceDocument>;
  notifications: FabricNotification[];
  touchedDocumentIds: string[];
}

export interface FabricInsertOptions {
  referenceId: string;
  mode?: 'Live' | 'Frozen';
  expectedType?: WorkspaceObject['type'];
  now?: number;
  policy?: FabricResolutionPolicy;
}

export interface FabricTransferPlan {
  sourceDocId: string;
  sourceObjId: string;
  targetDocId: string;
  allowedChoices: FabricTransferChoice[];
  preferredChoice: FabricTransferChoice;
  sourceType: WorkspaceObject['type'];
}


export interface FabricChangeView {
  targetDocId: string;
  targetRefId: string;
  sourceDocId: string;
  sourceObjId: string;
  fromVersion?: number;
  toVersion?: number;
  status: FabricLinkStatus;
  changed: boolean;
  typeChanged: boolean;
}

export interface FabricExternalClipboardPayload {
  representations: ReadonlyArray<{ mime: 'text/plain' | 'text/html'; text: string }>;
}

export interface FabricExportDecision {
  policy: FabricExportPolicy;
  requiresRefresh: boolean;
  requiresSnapshot: boolean;
  mayPreserveLiveLink: boolean;
}
export class WorkspaceFabricError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceFabricError';
  }
}
