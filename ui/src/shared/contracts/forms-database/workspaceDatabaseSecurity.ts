// STATUS: DIAMANT VGT SUPREME — Database security Schema
import type { DbFieldValue } from './workspaceDatabaseCore';

export type DatabaseSecurityRole = 'owner' | 'editor' | 'analyst' | 'viewer' | 'auditor';

export type DatabaseSecurityPermission = 'manage_security' | 'manage_schema' | 'read' | 'write' | 'query' | 'export' | 'manage_automation';

export type DatabaseSecurityResourceKind = 'database' | 'table' | 'view' | 'form' | 'report';

export type DatabaseFieldVisibility = 'visible' | 'masked' | 'hidden';

export interface DatabaseResourceAccessRule {
  id: string;
  resourceKind: DatabaseSecurityResourceKind;
  resourceId?: string;
  role: DatabaseSecurityRole;
  permission: DatabaseSecurityPermission;
  effect: 'allow' | 'deny';
}

export interface DatabaseFieldSecurityRule {
  id: string;
  tableId: string;
  columnId: string;
  roleVisibility: Partial<Record<DatabaseSecurityRole, DatabaseFieldVisibility>>;
}

export interface DatabaseRowSecurityRule {
  id: string;
  tableId: string;
  roles: DatabaseSecurityRole[];
  spaces?: string[];
  columnId: string;
  operator: 'eq' | 'neq' | 'contains' | 'empty' | 'not_empty';
  value?: DbFieldValue;
  effect: 'allow' | 'deny';
}

export interface DatabaseSecurityConfig {
  atRestPolicy: 'workspace-vgt-encrypted-required';
  defaultRole: DatabaseSecurityRole;
  roleGrants: Record<DatabaseSecurityRole, DatabaseSecurityPermission[]>;
  resourceRules: DatabaseResourceAccessRule[];
  fieldRules: DatabaseFieldSecurityRule[];
  rowRules: DatabaseRowSecurityRule[];
  locked: boolean;
  keyVaultPolicyRef?: string;
}

export interface DatabaseIntegrityManifest {
  algorithm: 'SHA-256';
  digestHex: string;
  schemaVersion: number;
  createdAt: number;
}
