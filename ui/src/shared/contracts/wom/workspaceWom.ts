// STATUS: DIAMANT VGT SUPREME — Canonical Workspace Object Model contracts
import type { TaskItem } from '../work-management/workspaceWork';

export const WOM_SCHEMA_VERSION = 2 as const;
export const WOM_MIN_READABLE_SCHEMA_VERSION = 1 as const;
export const WOM_MAX_ID_LENGTH = 192;
export const WOM_MAX_EXTENSION_NAMESPACES = 256;
export const WOM_MAX_EXTENSION_BYTES = 8 * 1024 * 1024;
export const WOM_MAX_BINARY_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
export const WOM_MAX_INLINE_METADATA_BYTES = 256 * 1024;

export type WorkspacePermissionRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface WorkspacePermissionGrant {
  principalId: string;
  role: WorkspacePermissionRole;
  deviceIds?: string[];
  expiresAt?: number;
}

export interface WorkspacePermissionsMetadata {
  policyVersion: 1;
  ownerId?: string;
  inheritedFrom?: string;
  grants: WorkspacePermissionGrant[];
}

export type WorkspaceProtectionClassification = 'standard' | 'sensitive' | 'confidential' | 'restricted';

/** Authenticated document protection truth. UI lock icons derive from this metadata; they do not define it. */
export interface WorkspaceProtectionMetadata {
  version: 1;
  classification: WorkspaceProtectionClassification;
  locked: boolean;
  readOnly: boolean;
  policyId?: string;
  sensitivityLabel?: string;
  retentionPolicyId?: string;
}

export type WorkspaceObjectOwnership = 'Strong' | 'ExternalLive' | 'ExternalFrozen';

export interface WorkspaceGeometryMetadata {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
}

export interface WorkspaceAccessibilityMetadata {
  label?: string;
  description?: string;
  role?: string;
  readingOrder?: number;
  decorative?: boolean;
}

export interface WorkspaceProvenanceMetadata {
  sourceDocumentId?: string;
  sourceObjectId?: string;
  sourceVersion?: number;
  createdBy?: string;
  importedFrom?: string;
  derivedFrom?: string[];
}

export interface WorkspaceNormalizedLink {
  uri: string;
  relation: 'source' | 'derived-from' | 'related' | 'attachment' | 'parent' | 'child';
}

/** Cross-family properties live on the typed envelope rather than being re-invented by every app. */
export interface WorkspaceObjectMetadata {
  ownership?: WorkspaceObjectOwnership;
  permissions?: WorkspacePermissionsMetadata;
  createdAt?: number;
  modifiedAt?: number;
  geometry?: WorkspaceGeometryMetadata;
  style?: Record<string, string | number | boolean | null>;
  accessibility?: WorkspaceAccessibilityMetadata;
  provenance?: WorkspaceProvenanceMetadata;
  links?: WorkspaceNormalizedLink[];
}

export interface WorkspaceMediaAssetObject {
  id: string;
  mime: string;
  byteLength: number;
  sha256: string;
  storage: 'container-chunk' | 'external-capability';
  chunkId?: string;
  capabilityUri?: string;
  fileName?: string;
}

export interface WorkspaceCommentReviewEntry {
  id: string;
  authorId?: string;
  createdAt: number;
  body: string;
  resolved?: boolean;
}

export interface WorkspaceCommentReviewObject {
  id: string;
  targetUri: string;
  status: 'open' | 'resolved';
  comments: WorkspaceCommentReviewEntry[];
}

/** This object never duplicates task fields; it points at workManagementData.tasks. */
export interface WorkspaceWorkItemReferenceObject {
  id: string;
  workItemId: string;
}

export type WorkspaceDataScalar = string | number | boolean | null;
export interface WorkspaceDataRecordObject {
  id: string;
  schemaId?: string;
  fields: Record<string, WorkspaceDataScalar>;
}

export interface WorkspacePolicyMetadataObject {
  id: string;
  namespace: string;
  policyVersion: number;
  values: Record<string, string | number | boolean | null>;
}

/** Explicit extension envelope: future modules do not need to fork the core schema. */
export interface WorkspaceExtensionObject {
  id: string;
  namespace: string;
  family: string;
  payload: unknown;
}

export type WorkspaceExtensionNamespaces = Record<string, unknown>;

export type WorkspaceLinkMode = 'Live' | 'Frozen';

export type WorkspaceChangeOperation =
  | { kind: 'set_title'; operationId: string; at: number; title: string }
  | { kind: 'upsert_object'; operationId: string; at: number; objectId: string; object: unknown; asRoot?: boolean }
  | { kind: 'remove_object'; operationId: string; at: number; objectId: string; authorSignature: string }
  | { kind: 'set_root_order'; operationId: string; at: number; rootObjectIds: string[] }
  | { kind: 'set_permissions'; operationId: string; at: number; permissions: WorkspacePermissionsMetadata }
  | { kind: 'set_protection'; operationId: string; at: number; protection: WorkspaceProtectionMetadata };

/** Tasks, Planner and Projects intentionally share the same canonical task entity. */
export type CanonicalWorkItem = TaskItem;
export const CANONICAL_WORK_ITEM_COLLECTION = 'workManagementData.tasks' as const;

/** Runtime/UI state must live outside WorkspaceDocument and is never serialized as WOM truth. */
export interface WorkspaceTransientUiState {
  activePanel?: string;
  selectedObjectIds?: string[];
  hoveredObjectId?: string;
  zoom?: number;
  [key: string]: unknown;
}
