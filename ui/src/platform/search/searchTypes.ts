// STATUS: DIAMANT VGT SUPREME — canonical UI/domain contracts for Astraea Search.
import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';

export type SearchContentGroup = 'all'|'documents'|'people'|'work'|'messages'|'data'|'spaces';
export type SearchBooleanOperator = 'AND'|'OR';
export type SearchSensitivity = 'STANDARD'|'PQC'|'VGT_TOP_SECRET';

export interface SearchTermClause {
  value: string;
  phrase: boolean;
  prefix: boolean;
  fuzzyDistance: 0|1|2;
  negated: boolean;
  operator: SearchBooleanOperator;
}

export interface SearchRangeFilter {
  min?: number;
  max?: number;
}

export interface SearchAdvancedFilters {
  modules: DocumentKind[];
  objectTypes: string[];
  tags: string[];
  owners: string[];
  members: string[];
  spaces: string[];
  statuses: string[];
  projects: string[];
  sensitivity: SearchSensitivity[];
  extensions: string[];
  exactIds: string[];
  createdAt: SearchRangeFilter;
  modifiedAt: SearchRangeFilter;
  sizeBytes: SearchRangeFilter;
}

export interface SearchQueryPlan {
  raw: string;
  clauses: SearchTermClause[];
  filters: SearchAdvancedFilters;
  nativeQuery: string;
  usesAdvancedPostFilter: boolean;
}

export interface SearchDocumentMetadata {
  documentId: string;
  canonicalId: string;
  kind: DocumentKind;
  extension: string;
  title: string;
  createdAt: number;
  modifiedAt: number;
  sizeBytes: number;
  owner?: string;
  members: string[];
  tags: string[];
  spaces: string[];
  statuses: string[];
  projects: string[];
  sensitivity: SearchSensitivity;
  favorite: boolean;
  pinned: boolean;
}

export interface SearchDerivedField {
  kind: 'ocr'|'transcript';
  sourceId: string;
  text: string;
  provenance: string;
  confidence?: number;
  generatedAt: number;
  provider: 'local'|'configured-provider';
}

export interface SearchHubHit {
  documentId: string;
  documentTitle: string;
  documentKind: DocumentKind;
  objectId: string;
  objectType: string;
  field: string;
  snippet: string;
  lexicalScore: number;
  finalScore: number;
  modifiedAt: number;
  deepLink: string;
  group: SearchContentGroup;
  why: string[];
  metadataProtected: boolean;
}

export interface SearchSavedSearch {
  id: string;
  name: string;
  query: string;
  group: SearchContentGroup;
  createdAt: number;
  updatedAt: number;
}

export interface SearchHistoryEntry {
  query: string;
  executedAt: number;
}

export interface SearchAdminPolicy {
  schema: 'vgt.search.policy/1';
  enabledModules: DocumentKind[];
  excludedDocumentIds: string[];
  excludedSpaces: string[];
  maxEncryptedIndexBytes: number;
  maxHistoryEntries: number;
  historyEnabled: boolean;
  semanticRankingEnabled: boolean;
  localOcrEnabled: boolean;
  transcription: { enabled: boolean; provider: 'local'|'configured-provider'; connectorId?: string };
  externalConnectorIndexing: { enabled: boolean; allowedConnectorIds: string[] };
}

export interface SearchHealthState {
  phase: 'idle'|'indexing'|'rebuilding'|'healthy'|'degraded'|'locked';
  generation: number;
  indexedDocuments: number;
  encryptedIndexBytes: number;
  lastCheckpointAt?: number;
  lastRebuildAt?: number;
  excludedDocuments: number;
  detail: string;
}

export interface SearchWorkspaceSnapshot {
  documents: Record<string, WorkspaceDocument>;
  metadata: Map<string, SearchDocumentMetadata>;
}
