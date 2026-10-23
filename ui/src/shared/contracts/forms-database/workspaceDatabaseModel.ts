// STATUS: DIAMANT VGT SUPREME — Database model Schema
import type { DbColumn, DbForeignKey, DbRecord, DbRecordHistoryEntry, DbSchemaMigration, DbTable } from './workspaceDatabaseCore';
import type { DatabaseSavedView } from './workspaceDatabaseViews';
import type { DatabaseSavedQuery } from './workspaceDatabaseQueries';
import type { DatabaseReportDefinition } from './workspaceDatabaseReports';
import type { DatabaseRecordFormDefinition } from './workspaceDatabaseRecordForms';
import type { DatabaseAutomationAuditEntry, DatabaseAutomationQueueItem, DatabaseAutomationRule } from './workspaceDatabaseAutomation';
import type { DatabaseIntegrityManifest, DatabaseSecurityConfig } from './workspaceDatabaseSecurity';

export interface DatabaseDocumentModel {
  sourceFormsDocumentId?: string;
  sourceFormsWorkspaceUri?: string;
  sourceFormsMappingMode?: 'create-update';
  sourceFormsDeduplicationFieldIds?: string[];
  sourceFormsSchemaRevision?: number;
  schemaVersion?: number;
  activeTableId?: string;
  tables?: DbTable[];
  relationships?: DbForeignKey[];
  migrationLog?: DbSchemaMigration[];
  recordHistory?: DbRecordHistoryEntry[];
  savedViews?: DatabaseSavedView[];
  savedQueries?: DatabaseSavedQuery[];
  savedReports?: DatabaseReportDefinition[];
  recordForms?: DatabaseRecordFormDefinition[];
  savedAutomations?: DatabaseAutomationRule[];
  automationQueue?: DatabaseAutomationQueueItem[];
  automationAudit?: DatabaseAutomationAuditEntry[];
  security?: DatabaseSecurityConfig;
  integrityManifest?: DatabaseIntegrityManifest;
  /** @deprecated Read-only import compatibility for pre-schema Database documents. */
  columns?: DbColumn[];
  /** @deprecated Read-only import compatibility for pre-schema Database documents. */
  records?: DbRecord[];
}
