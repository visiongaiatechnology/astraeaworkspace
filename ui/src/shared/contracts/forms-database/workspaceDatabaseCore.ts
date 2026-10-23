// STATUS: DIAMANT VGT SUPREME — Database core Schema

// STATUS: DIAMANT VGT SUPREME — Database Types
export interface DbAttachmentValue {
  kind: 'attachment' | 'image';
  name: string;
  mime: string;
  size: number;
  sha256?: string;
  dataUrl?: string;
}

export interface DbWorkspaceReferenceValue {
  kind: 'workspace_ref';
  documentId: string;
  objectId?: string;
  workspaceUri?: string;
  label?: string;
}

export type DbJsonValue = string | number | boolean | null | DbJsonValue[] | { [key: string]: DbJsonValue };

export type DbFieldValue = DbJsonValue | DbAttachmentValue | DbWorkspaceReferenceValue;

export type DbColumnType =
  | 'short_text' | 'long_text' | 'integer' | 'decimal' | 'currency' | 'percent' | 'boolean'
  | 'date' | 'time' | 'datetime' | 'duration' | 'single_select' | 'multi_select'
  | 'url' | 'email' | 'phone' | 'uuid' | 'attachment' | 'image' | 'json'
  | 'formula' | 'relation' | 'lookup' | 'rollup' | 'workspace_ref'
  | 'created_at' | 'modified_at' | 'created_by' | 'modified_by'
  /** Legacy import aliases. New columns should use canonical types above. */
  | 'string' | 'number';

export interface DbColumnConfig {
  precision?: number;
  currencyCode?: string;
  selectOptions?: string[];
  formula?: string;
  relationTableId?: string;
  relationMultiple?: boolean;
  relationColumnId?: string;
  targetColumnId?: string;
  rollup?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  workspaceKinds?: string[];
}

export type DbCheckOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'min_length' | 'max_length' | 'pattern' | 'in';

export interface DbCheckConstraint {
  id: string;
  name: string;
  operator: DbCheckOperator;
  value?: DbFieldValue;
  values?: DbFieldValue[];
  enabled?: boolean;
}

export interface DbColumn {
  id: string;
  name: string;
  type: DbColumnType;
  label?: string;
  required?: boolean;
  unique?: boolean;
  defaultValue?: DbFieldValue;
  checks?: DbCheckConstraint[];
  config?: DbColumnConfig;
  relationTarget?: string;
  sourceFormsFieldId?: string;
  sourceState?: 'active' | 'retired';
}

export interface DbRecord {
  id: string;
  /** Canonical values are keyed by stable column IDs. Legacy column-name keys are import-only. */
  fields: Record<string, DbFieldValue>;
  deletedAt?: number;
  deletedBy?: string;
}

export type DbRecordHistoryAction = 'create' | 'update' | 'bulk_update' | 'duplicate' | 'import' | 'soft_delete' | 'restore' | 'delete';

export interface DbRecordHistoryEntry {
  id: string;
  tableId: string;
  recordId: string;
  action: DbRecordHistoryAction;
  createdAt: number;
  actor?: string;
  before?: Record<string, DbFieldValue>;
  after?: Record<string, DbFieldValue>;
}

export interface DbIndex {
  id: string;
  name: string;
  columnIds: string[];
  unique: boolean;
}

export interface DbUniqueConstraint {
  id: string;
  name: string;
  columnIds: string[];
}

export type DbReferentialAction = 'cascade' | 'restrict' | 'set_null';

export type DbRelationshipCardinality = 'one_to_one' | 'one_to_many';

export interface DbForeignKey {
  id: string;
  name: string;
  sourceTableId: string;
  sourceColumnIds: string[];
  targetTableId: string;
  targetColumnIds: string[];
  onDelete: DbReferentialAction;
  onUpdate: DbReferentialAction;
  enforced: boolean;
  /** Cardinality is explicit for visual modeling; omitted legacy relationships normalize to one_to_many. */
  cardinality?: DbRelationshipCardinality;
  /** Present on the two foreign keys backing one logical many-to-many junction relationship. */
  junctionGroupId?: string;
  junctionTableId?: string;
}

export interface DbTable {
  id: string;
  name: string;
  label?: string;
  columns: DbColumn[];
  records: DbRecord[];
  primaryKeyColumnIds: string[];
  uniqueConstraints: DbUniqueConstraint[];
  indexes: DbIndex[];
  createdAt: number;
  modifiedAt: number;
}

export type DbMigrationOperation =
  | { kind: 'create_table'; table: DbTable }
  | { kind: 'drop_table'; tableId: string }
  | { kind: 'rename_table'; tableId: string; name: string }
  | { kind: 'add_column'; tableId: string; column: DbColumn }
  | { kind: 'drop_column'; tableId: string; columnId: string }
  | { kind: 'rename_column'; tableId: string; columnId: string; name: string }
  | { kind: 'alter_column'; tableId: string; columnId: string; patch: Partial<Pick<DbColumn, 'label' | 'required' | 'unique' | 'defaultValue' | 'checks'>> }
  | { kind: 'set_primary_key'; tableId: string; columnIds: string[] }
  | { kind: 'add_index'; tableId: string; index: DbIndex }
  | { kind: 'drop_index'; tableId: string; indexId: string }
  | { kind: 'add_unique'; tableId: string; constraint: DbUniqueConstraint }
  | { kind: 'drop_unique'; tableId: string; constraintId: string }
  | { kind: 'add_foreign_key'; relationship: DbForeignKey }
  | { kind: 'set_foreign_key_enforcement'; relationshipId: string; enforced: boolean }
  | { kind: 'drop_foreign_key'; relationshipId: string };

export interface DbSchemaMigration {
  id: string;
  fromVersion: number;
  toVersion: number;
  createdAt: number;
  summary: string;
  destructive: boolean;
  operations: DbMigrationOperation[];
}
