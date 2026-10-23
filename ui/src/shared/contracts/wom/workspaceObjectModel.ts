// STATUS: DIAMANT VGT SUPREME — Workspace Object and Reference Contracts
import type { TextBlockObject } from '../writer/workspaceWriter';
import type { TableObject } from '../grid/workspaceGrid';
import type { ChartObject, ShapeObject } from '../visualization/workspaceShapesChartsCore';
import type { WorkspaceCommentReviewObject, WorkspaceDataRecordObject, WorkspaceExtensionObject, WorkspaceMediaAssetObject, WorkspaceObjectMetadata, WorkspacePolicyMetadataObject, WorkspaceWorkItemReferenceObject, WorkspacePermissionRole } from './workspaceWom';

export type WorkspaceObject =
  | { type: 'TextBlock'; data: TextBlockObject }
  | { type: 'Table'; data: TableObject }
  | { type: 'Shape'; data: ShapeObject }
  | { type: 'Chart'; data: ChartObject }
  | { type: 'WorkspaceReference'; data: WorkspaceReferenceObject & { common?: WorkspaceObjectMetadata } }
  | { type: 'MediaAsset'; data: WorkspaceMediaAssetObject & { common?: WorkspaceObjectMetadata } }
  | { type: 'CommentReview'; data: WorkspaceCommentReviewObject & { common?: WorkspaceObjectMetadata } }
  | { type: 'WorkItemRef'; data: WorkspaceWorkItemReferenceObject & { common?: WorkspaceObjectMetadata } }
  | { type: 'DataRecord'; data: WorkspaceDataRecordObject & { common?: WorkspaceObjectMetadata } }
  | { type: 'PolicyMetadata'; data: WorkspacePolicyMetadataObject & { common?: WorkspaceObjectMetadata } }
  | { type: 'ExtensionObject'; data: WorkspaceExtensionObject & { common?: WorkspaceObjectMetadata } };

export type ReferenceMode = 'Live' | 'Frozen';

export type WorkspaceReferenceStatus = 'current' | 'changed' | 'broken' | 'unavailable' | 'permission-lost' | 'frozen';

export interface WorkspaceReferencePermissionProvenance {
  source_document_id: string;
  source_policy_version?: number;
  source_role_ceiling?: WorkspacePermissionRole;
  snapshot_explicitly_embedded?: boolean;
}

export type WorkspaceReferencePermissionState = 'allowed' | 'denied' | 'unknown';

export interface WorkspaceReferenceObject {
  id: string;
  uri: string;
  mode: ReferenceMode;
  cached_snapshot?: WorkspaceObject;
  expected_type?: WorkspaceObject['type'];
  source_snapshot_id?: string;
  source_version?: number;
  resolved_source_version?: number;
  fabric_status?: WorkspaceReferenceStatus;
  frozen_at?: number;
  permission_provenance?: WorkspaceReferencePermissionProvenance;
  permission_state?: WorkspaceReferencePermissionState;
  fallback_snapshot?: WorkspaceObject;
  fallback_policy?: 'allowed' | 'forbidden';
  common?: WorkspaceObjectMetadata;
}
