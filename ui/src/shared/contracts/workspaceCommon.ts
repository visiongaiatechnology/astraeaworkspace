// STATUS: DIAMANT VGT SUPREME — Core Workspace & WOM Aggregator Types
import type { WriterDocumentModel } from './writer/workspaceWriter';
import type { GridDocumentModel } from './grid/workspaceGrid';
import type { NoteNotebook, NoteDocumentModel, PdfDocumentModel } from './notes-pdf/workspaceNotes';
import type { FormsModel, DatabaseDocumentModel } from './forms-database/workspaceFormsDb';
import type { WhiteboardDocumentModel } from './whiteboard/workspaceWhiteboard';
import type { DrawDocumentModel } from './draw/workspaceDraw';
import type { PublishDocumentModel } from './publish/workspacePublish';
import type { WorkManagementModel } from './work-management/workspaceWork';
import type { VaultManifestModel } from './vault/workspaceVault';
import type { PresentDocumentModel } from './present/workspacePresent';
import type { DocumentKind } from './documentKind';
import type { WorkspaceObject } from './wom/workspaceObjectModel';
import type { WorkspaceExtensionNamespaces, WorkspacePermissionsMetadata, WorkspaceProtectionMetadata } from './wom/workspaceWom';
export { WOM_SCHEMA_VERSION } from './wom/workspaceWom';
export type { DocumentKind } from './documentKind';
export type { WorkspaceObject } from './wom/workspaceObjectModel';


export type SecurityProfile = 'STANDARD' | 'PQC' | 'VGT_TOP_SECRET';

export interface ForeignInteropPart {
  path: string;
  mimeHint: string;
  dataBase64: string;
  sizeBytes: number;
  quarantined: boolean;
}

export interface ForeignInteropFidelity {
  source_format: string;
  supported_features: string[];
  unsupported_features: string[];
  preserved_foreign_parts: Array<{ path: string; size_bytes: number; blake3: string; media_hint: string; quarantined: boolean }>;
  dropped_active_parts: string[];
  warnings: string[];
  destructive_roundtrip_requires_confirmation: boolean;
}

export interface ForeignInteropInspection {
  contract: 'VGT-IMPORT-SANDBOX-3';
  format: 'docx'|'xlsx'|'pptx'|'odt'|'ods'|'odp'|'pdf'|'csv'|'json'|'png'|'jpeg'|'gif'|'webp';
  file_name_hint: string;
  size_bytes: number;
  entry_count: number;
  expanded_bytes: number;
  max_observed_ratio_milli: number;
  active_content: 'none'|'quarantined_preserved'|'rejected';
  integrity_verified: boolean;
  parser_boundary: string;
  image_width: number|null;
  image_height: number|null;
  untrusted_resources: { embedded_fonts: number; icc_profiles: number; external_references: number };
  fidelity: ForeignInteropFidelity;
}

export interface ForeignInteropEnvelope {
  sourceFormat: ForeignInteropInspection['format'];
  inspection: ForeignInteropInspection;
  preservedParts: ForeignInteropPart[];
}

export interface WorkspaceSecurityPolicy {
  profile: SecurityProfile;
  inherited_from_workspace?: boolean;
  downgrade_authorized?: boolean;
  infinity_suite?: string;
  infinity_commit?: string;
}

export interface WorkspaceDocument {
  schema_version?: number;
  permissions?: WorkspacePermissionsMetadata;
  protection?: WorkspaceProtectionMetadata;
  wom_extensions?: WorkspaceExtensionNamespaces;
  id: string;
  title: string;
  kind: DocumentKind;
  created_at: number;
  modified_at: number;
  version: number;
  theme_id: string;
  securityPolicy?: WorkspaceSecurityPolicy;
  foreignInterop?: ForeignInteropEnvelope;
  root_object_ids: string[];
  objects: Record<string, WorkspaceObject>;
  notebooks?: NoteNotebook[];
  noteData?: NoteDocumentModel;
  pdfData?: PdfDocumentModel;
  presentData?: PresentDocumentModel;
  gridData?: GridDocumentModel;
  formsData?: FormsModel;
  databaseData?: DatabaseDocumentModel;
  workData?: WorkManagementModel;
  workManagementData?: WorkManagementModel;
  vaultData?: VaultManifestModel;
  writerData?: WriterDocumentModel;
  whiteboardData?: WhiteboardDocumentModel;
  drawData?: DrawDocumentModel;
  publishData?: PublishDocumentModel;
  insightData?: any;
  connectData?: any;
  automateData?: any;
  adminPolicyData?: any;
}

export type SelectionType = 'text' | 'cell' | 'shape' | 'chart';

export type NetworkCapability = 'None' | 'LocalLanOnly' | 'WhitelistedOnly' | 'FullUserApproved';

export type NetworkDecisionVerdict =
  | 'BlockedByDefault'
  | 'BlockedUserPolicy'
  | 'BlockedTelemetryBlacklist'
  | 'BlockedResolution'
  | 'BlockedRateLimit'
  | 'BlockedResourceLimit'
  | 'BlockedExpiredCapability'
  | 'BlockedTlsPolicy'
  | 'BlockedCancelled'
  | 'Allowed';

export interface NetworkAuditEntry {
  id: number;
  timestamp: number;
  component: string;
  document_id?: string | null;
  automation_id?: string | null;
  target_host: string;
  target_port: number;
  protocol: string;
  purpose: string;
  verdict: NetworkDecisionVerdict;
  capability_id?: string | null;
  destination_classes?: string[];
  preview_only?: boolean;
  resolution_required?: boolean;
}

export interface KeyVaultStatus {
  isLocked: boolean;
  hasPin: boolean;
  hasPortablePassword?: boolean;
  platform: string;
  providerName?: string;
  providerAvailable?: boolean;
  securePersistence?: boolean;
  hardwareInterfaceDetected?: boolean;
  hardwareSlotSupported?: boolean;
  providerCapabilities?: string[];
  providerDetail?: string;
  privacyMode: boolean;
  coreConnected?: boolean;
  hardwareBacked?: boolean;
  hardwareAttestationVerified?: boolean;
  softwareProviderConfigured?: boolean;
  pqcUnlocked?: boolean;
  topSecretEnrolled?: boolean;
  topSecretUnlocked?: boolean;
}
