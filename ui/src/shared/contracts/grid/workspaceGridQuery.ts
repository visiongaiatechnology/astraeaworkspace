// STATUS: DIAMANT VGT SUPREME — Grid query, publish and analysis integration types
export type GridQuerySourceKind = 'csv' | 'tsv' | 'json' | 'xml' | 'xlsx' | 'ods' | 'local-database' | 'vgt-database' | 'sql' | 'rest' | 'file';
export interface GridQuerySourceDefinition { kind: GridQuerySourceKind; label: string; documentId?: string; host?: string; resource?: string; dialect?: 'sqlite' | 'postgres' | 'mysql'; credentialKeyId?: string; }
export interface GridQueryPersistedStep { id: string; type: string; description: string; params: Record<string, unknown>; }
export interface GridQueryLineageEntry { sourceKind: GridQuerySourceKind; sourceLabel: string; sourceDocumentId?: string; refreshedAt: number; schemaDigest: string; rowCount: number; }
export interface GridQueryErrorRow { sourceRow: number; stepId: string; column?: string; message: string; }
export interface GridQueryDefinition {
  id: string;
  name: string;
  source: GridQuerySourceDefinition;
  steps: GridQueryPersistedStep[];
  schema: Array<{ name: string; type: 'text' | 'number' | 'date' | 'boolean' }>;
  schemaDriftPolicy: 'strict' | 'additive' | 'permissive';
  lineage: GridQueryLineageEntry[];
  errorRows: GridQueryErrorRow[];
  offlineCache: { mode: 'none' | 'encrypted-device'; maxAgeMinutes?: number; encryptedContainerBase64?: string; cachedAt?: number };
  lastRefreshAt?: number;
  lastSchemaDigest?: string;
}
export type GridPublishObjectKind = 'cell' | 'range' | 'table' | 'pivot' | 'kpi';
export interface GridPublishObjectDefinition {
  id: string;
  objectId: string;
  kind: GridPublishObjectKind;
  title: string;
  sourceSheetId: string;
  sourceRange: string;
  stableRangeId?: string;
  sourceTableId?: string;
  sourcePivotId?: string;
  createdAt: number;
  updatedAt: number;
}
export type GridAnalysisAuditKind = 'goal-seek' | 'scenario' | 'data-table' | 'solver' | 'statistics' | 'monte-carlo';
export interface GridAnalysisAuditRecord { id: string; kind: GridAnalysisAuditKind; createdAt: number; engineVersion: string; sheetId?: string; inputDigest: string; resultDigest: string; summary: string; }
