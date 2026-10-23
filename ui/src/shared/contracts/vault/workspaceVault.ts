import type { DocumentKind } from '../documentKind';

// STATUS: DIAMANT VGT SUPREME — Vault data contracts
// --- Astraea Vault ---
export type VaultClassification = 'Public' | 'Internal' | 'Confidential' | 'Restricted';
export type VaultEntryStatus = 'available' | 'quarantined' | 'missing' | 'corrupt';

export interface VaultFileAssociation {
  action: 'workspace' | 'preview' | 'download';
  app?: DocumentKind;
  source: 'native' | 'extension' | 'mime' | 'manual' | 'fallback';
}

export interface VaultFolder {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: number;
  modifiedAt: number;
  owner?: string;
  classification?: VaultClassification;
}


export type VaultProtectionMode = 'device' | 'device_pin' | 'portable_password';
export type VaultAutoLockMinutes = 0 | 1 | 5 | 15 | 30 | 60;

/**
 * Persisted Vault key policy. Deliberately contains policy metadata only: credentials,
 * private keys and raw key material are runtime-only and must never be serialized here.
 */
export interface VaultKeyPolicyModel {
  version: 1;
  encryptionRequired: true;
  protectionMode: VaultProtectionMode;
  autoLockMinutes: VaultAutoLockMinutes;
  keyGeneration: number;
  lastRekeyAt?: number;
  hardwarePreference: 'available' | 'required';
  recoveryPolicy: 'no_universal_recovery';
}


export interface VaultChunkIntegrityManifest {
  version: 1;
  algorithm: 'SHA-256';
  chunkSize: number;
  totalChunks: number;
  merkleRoot: string;
  chunks: Array<{ index: number; hash: string }>;
}

export interface VaultIntegrityAuditEntry {
  fileId: string;
  name: string;
  state: 'verified' | 'mismatch' | 'unavailable';
  digest?: string;
  reason?: string;
}

export interface VaultIntegrityAuditReport {
  id: string;
  createdAt: number;
  totalFiles: number;
  verified: number;
  mismatch: number;
  unavailable: number;
  entries: VaultIntegrityAuditEntry[];
}


export type VaultVersionSource = 'automatic' | 'named' | 'pre_restore';

export interface VaultFileVersion {
  id: string;
  fileId: string;
  createdAt: number;
  source: VaultVersionSource;
  label?: string;
  originalName: string;
  mimeType?: string;
  sizeBytes: number;
  snapshotBytes: number;
  contentDigest: string;
  snapshotKind: 'attachment' | 'workspace-document';
  payloadDataUrl?: string;
  workspaceSnapshotJson?: string;
  workspaceDocumentVersion?: number;
  protectedHold?: boolean;
}

export interface VaultVersionRetentionPolicy {
  version: 1;
  maxVersionsPerFile: number;
  maxAgeDays: number;
  keepProtected: true;
}


export interface VaultTrashRetentionPolicy {
  version: 1;
  maxAgeDays: number;
}

export interface VaultRecoveryDocumentSnapshot {
  documentId: string;
  documentKind: DocumentKind;
  snapshotJson: string;
  contentDigest: string;
  snapshotBytes: number;
}

export interface VaultRecoverySnapshot {
  id: string;
  createdAt: number;
  label?: string;
  integrityVersion?: 2;
  files: VaultFile[];
  folders: VaultFolder[];
  trash: VaultTrashEntry[];
  documents: VaultRecoveryDocumentSnapshot[];
  snapshotBytes: number;
  contentDigest: string;
}

export type VaultBackupTargetKind = 'local_folder' | 'external_drive' | 'removable_media' | 'nas_self_hosted';
export type VaultBackupMode = 'full' | 'incremental';
export type VaultBackupKeyMode = 'inherit_vault' | 'independent_password';
export type VaultBackupScheduleExecutor = 'local_agent' | 'self_hosted';

export interface VaultBackupTargetDefinition {
  id: string;
  label: string;
  kind: VaultBackupTargetKind;
  transport: 'filesystem_access' | 'webdav_https';
  endpointUrl?: string;
  username?: string;
  hostTargetRef?: string;
  airGapped: boolean;
}

export interface VaultBackupSchedule {
  enabled: boolean;
  executor: VaultBackupScheduleExecutor;
  cadence: 'daily' | 'weekly';
  hourLocal: number;
  weekday?: number;
}

export interface VaultBackupPolicy {
  version: 1;
  mode: VaultBackupMode;
  verifyAfterWrite: true;
  keyMode: VaultBackupKeyMode;
  retentionCount: number;
  retentionDays: number;
  target?: VaultBackupTargetDefinition;
  schedule?: VaultBackupSchedule;
}

export interface VaultBackupDocumentDigest {
  documentId: string;
  digest: string;
  sizeBytes: number;
}

export interface VaultBackupCatalogEntry {
  id: string;
  createdAt: number;
  mode: VaultBackupMode;
  baseBackupId?: string;
  packageDigest: string;
  packageBytes: number;
  documentCount: number;
  changedDocumentCount: number;
  deletedDocumentIds: string[];
  documentDigests: VaultBackupDocumentDigest[];
  targetId: string;
  targetKind: VaultBackupTargetKind;
  targetLocator: string;
  keyMode: VaultBackupKeyMode;
  verifiedAt: number;
  airGapped: boolean;
}


export type VaultPeerTransportKind = 'lan' | 'relay';

export interface VaultPeerDevice {
  id: string;
  label: string;
  publicKeyJwk: JsonWebKey;
  publicKeyFingerprint: string;
  pairedAt: number;
  lastSeenAt?: number;
  trusted: true;
  allowedTransports: VaultPeerTransportKind[];
}

export interface VaultPeerSyncPolicy {
  version: 1;
  enabled: boolean;
  selectedFolderIds: string[];
  selectedFileIds: string[];
  ignorePatterns: string[];
  bandwidthLimitKibPerSec: number;
  lanDiscoveryEnabled: boolean;
  relayEnabled: boolean;
  relayEndpoint?: string;
  conflictStrategy: 'three_way_text_else_conflict_copy';
  onlineOnlyPlaceholders: {
    enabled: false;
    requiresRobustOsIntegration: true;
  };
}

export interface VaultPeerFileBlockManifest {
  index: number;
  offset: number;
  sizeBytes: number;
  hash: string;
}

export interface VaultPeerFileManifest {
  version: 1;
  fileId: string;
  fileName: string;
  sizeBytes: number;
  blockSize: number;
  contentHash: string;
  blocks: VaultPeerFileBlockManifest[];
  vectorClock: Record<string, number>;
}

export interface VaultPeerResumeState {
  sessionId: string;
  fileId: string;
  peerId: string;
  acknowledgedBlockIndexes: number[];
  transferredBytes: number;
  updatedAt: number;
}

export interface VaultPeerSyncAuditEntry {
  id: string;
  at: number;
  peerId: string;
  direction: 'send' | 'receive' | 'pair' | 'discovery';
  fileId?: string;
  outcome: 'ok' | 'conflict_copy' | 'merged' | 'blocked' | 'failed';
  detail: string;
}



export type VaultShareDelivery = 'encrypted_export' | 'gaiacom' | 'space' | 'hosted_live';
export type VaultSharePermission = 'view' | 'download' | 'edit';
export interface VaultShareGrant {
  id:string; fileId:string; delivery:VaultShareDelivery; permissions:VaultSharePermission[]; createdAt:number;
  recipientKey?:string; recipientFingerprint?:string; spaceId?:string; serviceRef?:string; expiresAt?:number; revokedAt?:number;
  status:'active'|'exported_copy'|'sent_copy'|'revoked'; copyControl:'exported_copy_unrevocable'|'controlled_future_access'; packageDigest?:string;
}
export interface VaultShareAuditEntry { id:string; at:number; shareId:string; fileId:string; action:'created'|'exported'|'sent'|'revoked'|'revoke_not_applicable'|'access_denied'; detail:string; }

export interface VaultSearchIndexPolicy {
  version: 1;
  contentIndexingEnabled: boolean;
  ocrIndexingEnabled: boolean;
  excludedFileIds: string[];
  excludedFolderIds: string[];
}

export interface VaultSearchIndexEntry {
  fileId: string;
  indexedAt: number;
  name: string;
  mimeType: string;
  kind: DocumentKind;
  modifiedAt: number;
  owner: string;
  tags: string[];
  properties: Record<string,string>;
  spaceIds: string[];
  folderId: string | null;
  contentText: string;
  ocrText: string;
  privacyExcluded: boolean;
  sourceDigest?: string;
  documentVersion?: number;
}

export interface VaultSearchIndexModel {
  version: 1;
  builtAt: number;
  protection: 'vault_container_aead';
  entries: VaultSearchIndexEntry[];
}


export interface VaultStorageHealthState {
  version: 1;
  migrationVersion: number;
  readOnlyRecoveryMode: boolean;
  readOnlyReason?: string;
  lastHealthScanAt?: number;
  lastTransactionCleanupAt?: number;
}

export interface VaultStorageCapacitySnapshot {
  source: 'browser_quota' | 'host_disk' | 'unavailable';
  totalBytes?: number;
  usedBytes?: number;
  freeBytes?: number;
  capturedAt: number;
}

export interface VaultManifestModel {
  files: VaultFile[];
  folders?: VaultFolder[];
  spaces?: any[];
  spaceTemplates?: any[];
  shares?: unknown[];
  trash?: VaultTrashEntry[];
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
  searchPolicy?: VaultSearchIndexPolicy;
  searchIndex?: VaultSearchIndexModel;
  shareGrants?: VaultShareGrant[];
  shareAudit?: VaultShareAuditEntry[];
  storageHealth?: VaultStorageHealthState;
}

export interface VaultTrashEntry {
  id: string;
  deletedAt: number;
  file: VaultFile;
  originalFolderId?: string | null;
}

export interface VaultFile {
  id: string;
  name: string;
  kind: DocumentKind;
  sizeBytes: number;
  encryptedHash: string;
  lastModified: number;
  sourceType?: 'workspace-document' | 'attachment';
  documentId?: string;
  mimeType?: string;
  payloadDataUrl?: string;
  contentDigest?: string;
  digestAlgorithm?: 'SHA-256';
  integrityState?: 'unverified' | 'verified' | 'mismatch' | 'unavailable';
  integrityVerifiedAt?: number;
  chunkIntegrity?: VaultChunkIntegrityManifest;
  documentVersion?: number;
  folderId?: string | null;
  tags?: string[];
  favorite?: boolean;
  pinned?: boolean;
  createdAt?: number;
  lastAccessedAt?: number;
  owner?: string;
  classification?: VaultClassification;
  status?: VaultEntryStatus;
  securityLabel?: 'safe' | 'unknown' | 'executable' | 'archive' | 'office' | 'pdf';
  quarantineReason?: string;
  quarantinedAt?: number;
  association?: VaultFileAssociation;
  properties?: Record<string,string>;
  spaceIds?: string[];
}


