import {
  WorkspaceDocument,
  VaultFile,
  VaultTrashEntry,
  VaultFolder,
  VaultKeyPolicyModel,
  VaultIntegrityAuditReport,
  VaultFileVersion,
  VaultVersionRetentionPolicy,
  VaultTrashRetentionPolicy,
  VaultRecoverySnapshot,
  VaultBackupPolicy,
  VaultBackupCatalogEntry,
  VaultPeerSyncPolicy,
  VaultPeerDevice,
  VaultPeerResumeState,
  VaultPeerSyncAuditEntry,
  VaultStorageHealthState,
} from './workspace';

export interface TeamSpaceOpenContext { spaceId:string; spaceUri:string; source:'space'; }

export type TeamSpaceRole = 'Owner' | 'Admin' | 'Editor' | 'Commenter' | 'Viewer';
export type TeamSpaceLifecycleState = 'active' | 'archived' | 'trashed';
export type TeamSpaceClassification = 'Public' | 'Internal' | 'Confidential' | 'Restricted';
export type TeamSpaceTheme = 'indigo' | 'violet' | 'emerald' | 'amber' | 'slate';
export type TeamSpaceBuiltInTemplateId = 'blank' | 'team' | 'project-team' | 'software-project' | 'research' | 'marketing-campaign' | 'client-workspace' | 'incident-response' | 'product-launch' | 'knowledge-base' | 'department';
export type TeamSpaceTemplateId = TeamSpaceBuiltInTemplateId | `org:${string}`;
export type TeamSpaceTrustStatus = 'local' | 'unverified' | 'verified' | 'blocked';
export type TeamSpaceIdentityKind = 'local' | 'guest';

export interface TeamSpaceMemberDevice {
  id: string;
  name: string;
  trustStatus: TeamSpaceTrustStatus;
  lastSeenAt?: number;
}

export interface TeamSpaceCustomRole {
  id: string;
  name: string;
  baseRole: TeamSpaceRole;
  capabilities: string[];
  createdAt: number;
}

export interface TeamSpaceInvitation {
  id: string;
  displayName: string;
  role: TeamSpaceRole;
  customRoleId?: string;
  identityKind: TeamSpaceIdentityKind;
  trustStatus: TeamSpaceTrustStatus;
  transport: 'local' | 'GaiaCom' | 'VgtHub';
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

export interface TeamSpaceGuestPolicy {
  enabled: boolean;
  requireVerifiedTrust: boolean;
  allowedTransports: Array<'GaiaCom' | 'VgtHub'>;
}

export type TeamSpacePermissionEffect = 'ALLOW' | 'DENY';
export interface TeamSpaceCapabilityOverride { allow: string[]; deny: string[]; }
export interface TeamSpaceScopedPermissionRule {
  scopeId: string;
  inherit: boolean;
  roleOverrides: Partial<Record<TeamSpaceRole, TeamSpaceCapabilityOverride>>;
  customRoleOverrides?: Record<string, TeamSpaceCapabilityOverride>;
}
export interface TeamSpacePermissionAuditEntry { id: string; at: number; actorId: string; action: string; scope: string; }
export interface TeamSpaceShareLinkGrant { id: string; token: string; role: TeamSpaceRole; createdAt: number; expiresAt?: number; servingTransportId: string; url: string; revokedAt?: number; }
export interface TeamSpacePermissionPolicy {
  version: 1;
  spaceRoleOverrides: Partial<Record<TeamSpaceRole, TeamSpaceCapabilityOverride>>;
  folderRules: TeamSpaceScopedPermissionRule[];
  documentRules: TeamSpaceScopedPermissionRule[];
  shareLinks: TeamSpaceShareLinkGrant[];
  audit: TeamSpacePermissionAuditEntry[];
}

export interface TeamSpaceMember {
  id: string;
  name: string;
  role: TeamSpaceRole;
  status: 'local' | 'active' | 'invited' | 'suspended';
  identityKind?: TeamSpaceIdentityKind;
  trustStatus?: TeamSpaceTrustStatus;
  customRoleId?: string;
  devices?: TeamSpaceMemberDevice[];
}

export interface TeamSpaceActivity {
  id: string;
  at: number;
  text: string;
  event?: 'created' | 'updated' | 'archived' | 'unarchived' | 'cloned' | 'trashed' | 'restored' | 'member' | 'content' | 'exported' | 'governance';
  actorId?: string;
}

export interface TeamSpaceSettings {
  icon: string;
  theme: TeamSpaceTheme;
  classification: TeamSpaceClassification;
  trashRetentionDays: number;
  defaultHomeView: 'dashboard' | 'documents' | 'activity';
}

export type TeamSpaceDashboardCardKind =
  | 'summary'
  | 'recent_documents'
  | 'active_tasks'
  | 'planner'
  | 'project_milestones'
  | 'forms_metrics'
  | 'database_kpi'
  | 'notes_announcements'
  | 'activity'
  | 'members'
  | 'custom_widgets';

export type TeamSpaceDashboardWidgetMetric =
  | 'document_summary'
  | 'record_count'
  | 'response_count'
  | 'open_task_count'
  | 'milestone_progress';

export interface TeamSpaceDashboardCardPreference {
  id: string;
  kind: TeamSpaceDashboardCardKind;
  order: number;
  pinned: boolean;
  hidden?: boolean;
}

export interface TeamSpaceDashboardWidget {
  id: string;
  title: string;
  sourceDocumentId: string;
  metric: TeamSpaceDashboardWidgetMetric;
  createdAt: number;
}

export interface TeamSpaceDashboardConfig {
  version: 1;
  cards: TeamSpaceDashboardCardPreference[];
  widgets: TeamSpaceDashboardWidget[];
}

export interface TeamSpaceRichTextSpan { text: string; bold?: boolean; italic?: boolean; underline?: boolean; link?: string; }
export interface TeamSpacePageTaskItem { id: string; text: string; done: boolean; }
export type TeamSpacePageWorkspaceEmbedKind = 'whiteboard_frame' | 'grid_range' | 'grid_chart' | 'database_view' | 'project_widget' | 'planner_widget' | 'form' | 'live_component';
export type TeamSpacePageBlock =
  | { id: string; kind: 'rich_text'; spans: TeamSpaceRichTextSpan[] }
  | { id: string; kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { id: string; kind: 'table'; rows: string[][] }
  | { id: string; kind: 'task_list'; items: TeamSpacePageTaskItem[] }
  | { id: string; kind: 'callout'; tone: 'info' | 'success' | 'warning'; text: string }
  | { id: string; kind: 'image'; vaultFileId: string; altText: string }
  | { id: string; kind: 'workspace_embed'; embedKind: TeamSpacePageWorkspaceEmbedKind; sourceDocumentId: string; selector?: string; mode: 'Live' | 'Frozen' }
  | { id: string; kind: 'file'; vaultFileId: string; label: string }
  | { id: string; kind: 'space_list'; listId: string; viewId?: string };
export interface TeamSpacePageComment { id: string; authorId: string; authorName: string; text: string; createdAt: number; resolvedAt?: number; }
export interface TeamSpacePageRevision { id: string; at: number; title: string; status: 'draft' | 'published'; parentPageId?: string; order: number; blocks: TeamSpacePageBlock[]; }
export interface TeamSpacePage { id: string; title: string; parentPageId?: string; order: number; status: 'draft' | 'published'; createdAt: number; updatedAt: number; blocks: TeamSpacePageBlock[]; comments: TeamSpacePageComment[]; history: TeamSpacePageRevision[]; }
export interface TeamSpacePageTemplate { id: string; name: string; blocks: TeamSpacePageBlock[]; createdAt: number; builtIn?: boolean; }
export interface TeamSpacePageModel { version: 1; pages: TeamSpacePage[]; templates: TeamSpacePageTemplate[]; revision: number; }


export type TeamSpaceLibraryMetadataType = 'text' | 'number' | 'date' | 'choice';
export type TeamSpaceLibraryApprovalState = 'draft' | 'pending' | 'approved' | 'rejected' | 'published';
export interface TeamSpaceLibraryMetadataColumn { id:string; label:string; type:TeamSpaceLibraryMetadataType; choices?:string[]; }
export interface TeamSpaceLibraryView { id:string; name:string; folderId?:string; tags:string[]; favoriteOnly:boolean; approvalState?:TeamSpaceLibraryApprovalState; sortBy:'name'|'modified'|'size'; sortDirection:'asc'|'desc'; visibleColumnIds:string[]; }
export interface TeamSpaceLibraryEntryState { fileId:string; metadata:Record<string,string|number>; checkedOutBy?:string; checkedOutAt?:number; retentionUntil?:number; approvalState:TeamSpaceLibraryApprovalState; approvedBy?:string; approvedAt?:number; }
export interface TeamSpaceDocumentLibraryModel { version:1; columns:TeamSpaceLibraryMetadataColumn[]; views:TeamSpaceLibraryView[]; entries:TeamSpaceLibraryEntryState[]; defaultViewId:string; revision:number; }

export type TeamSpaceListFieldType='text'|'number'|'boolean'|'date'|'choice'|'relation';
export type TeamSpaceListViewKind='grid'|'gallery'|'board'|'calendar';
export interface TeamSpaceListField { id:string; name:string; type:TeamSpaceListFieldType; required?:boolean; choices?:string[]; relation?:{kind:'space_list'|'database';targetId:string}; }
export interface TeamSpaceListItem { id:string; values:Record<string,string|number|boolean|string[]|null>; createdAt:number; updatedAt:number; }
export interface TeamSpaceListView { id:string; name:string; kind:TeamSpaceListViewKind; filterFieldId?:string; filterValue?:string; sortFieldId?:string; sortDirection?:'asc'|'desc'; groupFieldId?:string; }
export interface TeamSpaceListRule { id:string; event:'created'|'updated'; fieldId?:string; equals?:string; notification:string; enabled:boolean; }
export interface TeamSpaceListNotification { id:string; listId:string; itemId:string; message:string; createdAt:number; }
export interface TeamSpaceStructuredList { id:string; name:string; description:string; fields:TeamSpaceListField[]; items:TeamSpaceListItem[]; views:TeamSpaceListView[]; defaultViewId:string; rules:TeamSpaceListRule[]; createdAt:number; updatedAt:number; }
export interface TeamSpaceListModel { version:1; lists:TeamSpaceStructuredList[]; notifications:TeamSpaceListNotification[]; revision:number; }


export interface TeamSpaceCollaborationComment { id:string; targetId:string; authorId:string; body:string; createdAt:number; parentId?:string; mentions:string[]; }
export interface TeamSpacePresenceSession { memberId:string; deviceId:string; lastSeenAt:number; status:'online'|'idle'; }
export interface TeamSpaceCollaborationChange { id:string; targetId:string; actorId:string; at:number; baseVersion:number; nextVersion:number; summary:string; }
export interface TeamSpaceCollaborationNotification { id:string; memberId?:string; kind:'mention'|'comment'|'change'|'watch'|'conflict'; message:string; targetId:string; createdAt:number; readAt?:number; }
export interface TeamSpaceWatch { memberId:string; targetId:string; createdAt:number; }
export interface TeamSpaceOfflineEdit { id:string; targetId:string; memberId:string; baseVersion:number; summary:string; createdAt:number; }
export interface TeamSpaceConflict { id:string; targetId:string; memberId:string; offlineEditId?:string; baseVersion:number; currentVersion:number; createdAt:number; resolution?:'local'|'remote'|'merged'; resolvedAt?:number; }
export interface TeamSpaceCollaborationModel { version:1; comments:TeamSpaceCollaborationComment[]; changes:TeamSpaceCollaborationChange[]; notifications:TeamSpaceCollaborationNotification[]; watches:TeamSpaceWatch[]; offlineEdits:TeamSpaceOfflineEdit[]; conflicts:TeamSpaceConflict[]; targetVersions:Record<string,number>; revision:number; }

export type TeamSpaceSyncTransportKind = 'local' | 'lan_peer' | 'vgt_hub' | 'gaiacom';
export type TeamSpaceSyncHealthStatus = 'local_only' | 'healthy' | 'offline' | 'degraded' | 'blocked';
export type TeamSpaceSyncDomain =
  | 'identity' | 'lifecycle' | 'membership' | 'permissions' | 'content_links'
  | 'dashboard' | 'pages' | 'document_library' | 'lists' | 'collaboration' | 'governance';
export interface TeamSpaceSyncTarget {
  id:string; kind:TeamSpaceSyncTransportKind; label:string; enabled:boolean; createdAt:number;
  endpoint?:string; peerDeviceId?:string; peerMemberId?:string; federationRoute?:string; e2eeRequired:boolean; keyId?:string;
}
export interface TeamSpaceSyncDeltaOperation { domain:TeamSpaceSyncDomain; beforeHash:string; afterHash:string; valueJson:string; }
export interface TeamSpaceSyncDelta { version:1; spaceId:string; sourceDeviceId:string; sourceMemberId?:string; sequence:number; createdAt:number; operations:TeamSpaceSyncDeltaOperation[]; }
export interface TeamSpaceSyncPacket {
  version:1; spaceId:string; sourceDeviceId:string; sourceMemberId?:string; sequence:number; createdAt:number;
  keyId:string; cipher:'AES-256-GCM-HKDF-SHA256'; saltB64:string; ivB64:string; ciphertextB64:string;
}
export interface TeamSpaceSyncQueueItem { id:string; targetId:string; packet:TeamSpaceSyncPacket; attempts:number; maxAttempts:number; nextAttemptAt:number; createdAt:number; lastError?:string; }
export interface TeamSpaceSyncConflict { id:string; sourceDeviceId:string; sourceMemberId?:string; sequence:number; domain:TeamSpaceSyncDomain; localValueJson:string; remoteValueJson:string; createdAt:number; resolution?:'local'|'remote'|'merged'; resolvedAt?:number; }
export interface TeamSpaceSyncRevocation { kind:'device'|'member'; subjectId:string; revokedAt:number; actorId?:string; reason?:string; }
export interface TeamSpaceSyncCursor {
  targetId:string; lastSentSequence:number; lastAckedSequence:number; lastIncomingSequence:number;
  domainHashes:Partial<Record<TeamSpaceSyncDomain,string>>; updatedAt:number;
}
export interface TeamSpaceSyncHealth { targetId:string; status:TeamSpaceSyncHealthStatus; lastAttemptAt?:number; lastSuccessAt?:number; lastError?:string; queueDepth:number; remoteSequence:number; }
export interface TeamSpaceSyncOfflineCache { cachedAt:number; fingerprint:string; domainHashes:Partial<Record<TeamSpaceSyncDomain,string>>; }
export interface TeamSpaceSyncThreatModel { version:1; remoteE2eeRequired:boolean; hubTrustedForAvailabilityOnly:boolean; relayCanReadPayload:boolean; routingMetadataVisible:boolean; keyMaterialPersistedInSpace:boolean; }

export interface TeamSpaceTemplatePageSeed { title:string; parentIndex?:number; blocks:TeamSpacePageBlock[]; published?:boolean; }
export interface TeamSpaceTemplateAppSeed { kind:'Writer'|'Grid'|'Present'|'Notes'|'Whiteboard'|'Forms'|'Database'|'Tasks'|'Planner'|'Projects'; title:string; }
export interface TeamSpaceTemplateDefinition {
  id:TeamSpaceTemplateId; name:string; description:string; scope:'built_in'|'organization'; createdAt:number;
  folders:string[]; pages:TeamSpaceTemplatePageSeed[]; libraryColumns:TeamSpaceLibraryMetadataColumn[]; libraryViews:TeamSpaceLibraryView[];
  lists:TeamSpaceStructuredList[]; linkedApps:TeamSpaceTemplateAppSeed[]; settings?:Partial<TeamSpaceSettings>;
}


export type TeamSpaceRetentionAction = 'archive' | 'trash';
export interface TeamSpaceGovernanceRetentionPolicy { enabled:boolean; inactiveDays:number; action:TeamSpaceRetentionAction; auditRetentionDays:number; }
export interface TeamSpaceGovernanceAuditEntry { id:string; at:number; actorId:string; actorRole:TeamSpaceRole|'Policy'|'Recovery'; action:string; outcome:'allowed'|'denied'; detail:string; }
export interface TeamSpaceLegalHold { active:boolean; reason:string; caseReference?:string; configuredAt:number; configuredBy:string; releasedAt?:number; releasedBy?:string; }
export interface TeamSpaceOwnershipRecoveryPolicy { enabled:boolean; delegateMemberIds:string[]; quorum:number; configuredAt:number; configuredBy:string; }
export interface TeamSpaceGovernanceBackupEntry { id:string; createdAt:number; createdBy:string; digestSha256:string; sizeBytes:number; documentCount:number; fileCount:number; protection:'encrypted_vgt_container'; }
export interface TeamSpaceGovernanceModel {
  version:1;
  retention:TeamSpaceGovernanceRetentionPolicy;
  classificationLabel:TeamSpaceClassification;
  legalHold?:TeamSpaceLegalHold;
  ownershipRecovery:TeamSpaceOwnershipRecoveryPolicy;
  backupCatalog:TeamSpaceGovernanceBackupEntry[];
  exportCount:number;
  audit:TeamSpaceGovernanceAuditEntry[];
}
export interface TeamSpaceGovernanceExportBundle {
  format:'VGT_SPACE_EXPORT_V1'; version:1; exportedAt:number; exportedBy:string; spaceId:string; classification:TeamSpaceClassification;
  space:TeamSpace; documents:WorkspaceDocument[]; files:VaultFile[]; manifestSha256:string;
}
export interface TeamSpaceGovernanceBackupBundle {
  format:'VGT_SPACE_BACKUP_V1'; version:1; createdAt:number; createdBy:string; spaceId:string; classification:TeamSpaceClassification;
  space:TeamSpace; documents:WorkspaceDocument[]; files:VaultFile[]; manifestSha256:string;
}
export interface TeamSpaceSyncModel {
  version:1; localDeviceId:string; localMemberId?:string; localSequence:number; targets:TeamSpaceSyncTarget[];
  queue:TeamSpaceSyncQueueItem[]; conflicts:TeamSpaceSyncConflict[]; revocations:TeamSpaceSyncRevocation[];
  cursors:TeamSpaceSyncCursor[]; health:TeamSpaceSyncHealth[]; offlineCache?:TeamSpaceSyncOfflineCache;
  threatModel:TeamSpaceSyncThreatModel;
}

export interface TeamSpace {
  id: string;
  name: string;
  description: string;
  role: TeamSpaceRole;
  permissions: string[];
  sharedFolders: string[];
  members?: TeamSpaceMember[];
  ownerMemberIds?: string[];
  customRoles?: TeamSpaceCustomRole[];
  invitations?: TeamSpaceInvitation[];
  guestPolicy?: TeamSpaceGuestPolicy;
  membershipRevision?: number;
  permissionPolicy?: TeamSpacePermissionPolicy;
  documentIds?: string[];
  activity?: TeamSpaceActivity[];
  memberCount?: number;
  documentCount?: number;
  fileIds?: string[];
  securityLevel: 'Local Workspace' | 'Authenticated Local E2EE' | 'Native Secure Transport Required';
  lastActivity: number;
  lifecycleState?: TeamSpaceLifecycleState;
  archivedAt?: number;
  trashedAt?: number;
  deleteAfter?: number;
  templateId?: TeamSpaceTemplateId;
  settings?: TeamSpaceSettings;
  dashboard?: TeamSpaceDashboardConfig;
  pageModel?: TeamSpacePageModel;
  documentLibrary?: TeamSpaceDocumentLibraryModel;
  listModel?: TeamSpaceListModel;
  collaborationModel?: TeamSpaceCollaborationModel;
  syncModel?: TeamSpaceSyncModel;
  governance?: TeamSpaceGovernanceModel;
}


export interface StoredVaultData {
  files: VaultFile[];
  folders: VaultFolder[];
  spaces: TeamSpace[];
  spaceTemplates?: TeamSpaceTemplateDefinition[];
  shares?: unknown[];
  trash: VaultTrashEntry[];
  keyPolicy?: VaultKeyPolicyModel;
  integrityAudits?: VaultIntegrityAuditReport[];
  versions?: VaultFileVersion[];
  versionRetention?: VaultVersionRetentionPolicy;
  trashRetention?: VaultTrashRetentionPolicy;
  recoverySnapshots?: VaultRecoverySnapshot[];
  backupPolicy?: VaultBackupPolicy;
  backupCatalog?: VaultBackupCatalogEntry[];
  peerSyncPolicy?: VaultPeerSyncPolicy;
  peerDevices?: VaultPeerDevice[];
  peerResume?: VaultPeerResumeState[];
  peerSyncAudit?: VaultPeerSyncAuditEntry[];
  searchPolicy?: import('./workspace').VaultSearchIndexPolicy;
  searchIndex?: import('./workspace').VaultSearchIndexModel;
  shareGrants?: import('./workspace').VaultShareGrant[];
  shareAudit?: import('./workspace').VaultShareAuditEntry[];
  storageHealth?: VaultStorageHealthState;
}

export const DEFAULT_VAULT_FILES: VaultFile[] = [];
export const DEFAULT_VAULT_FOLDERS: VaultFolder[] = [];

export const DEFAULT_SPACES: TeamSpace[] = [];

