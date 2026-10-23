// STATUS: DIAMANT VGT SUPREME — Database automation Schema
import type { DbFieldValue, DbJsonValue } from './workspaceDatabaseCore';

export type DatabaseAutomationTrigger = 'record_create' | 'record_update' | 'record_delete';

export type DatabaseAutomationConditionOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'not_empty';

export type DatabaseAutomationActionType = 'update_record' | 'create_task' | 'add_planner_card' | 'generate_document' | 'send_gaiacom' | 'webhook' | 'safe_transform';

export interface DatabaseAutomationCondition {
  id: string;
  columnId: string;
  operator: DatabaseAutomationConditionOperator;
  value?: DbFieldValue;
}

export interface DatabaseAutomationAssignment {
  columnId: string;
  mode: 'literal' | 'expression';
  value?: DbFieldValue;
  expression?: string;
}

export type DatabaseAutomationAction =
  | { id: string; type: 'update_record'; assignments: DatabaseAutomationAssignment[] }
  | { id: string; type: 'create_task' }
  | { id: string; type: 'add_planner_card'; planId?: string; columnId?: string }
  | { id: string; type: 'generate_document'; reportId: string }
  | { id: string; type: 'send_gaiacom'; connectorId: string }
  | { id: string; type: 'webhook'; endpointUrl: string; keyVaultSecretRef: string }
  | { id: string; type: 'safe_transform'; assignments: DatabaseAutomationAssignment[] };

export interface DatabaseAutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  tableId: string;
  trigger: DatabaseAutomationTrigger;
  conditions: DatabaseAutomationCondition[];
  actions: DatabaseAutomationAction[];
  retryLimit: number;
  maxPerMinute: number;
  backoffBaseMs: number;
  createdAt: number;
  modifiedAt: number;
}

export interface DatabaseAutomationQueueItem {
  id: string;
  effectId: string;
  eventId: string;
  ruleId: string;
  actionId: string;
  recordId: string;
  tableId: string;
  target: 'planner' | 'gaiacom' | 'webhook';
  targetRef: string;
  payload: Record<string, DbJsonValue>;
  status: 'pending' | 'delivered' | 'failed';
  attemptCount: number;
  createdAt: number;
  nextAttemptAt: number;
  lastAttemptAt?: number;
  deliveredAt?: number;
  lastError?: string;
}

export interface DatabaseAutomationAuditEntry {
  id: string;
  effectId: string;
  eventId: string;
  ruleId: string;
  actionId: string;
  actionType: DatabaseAutomationActionType;
  tableId: string;
  recordId: string;
  status: 'success' | 'queued' | 'delivered' | 'failed' | 'skipped';
  createdAt: number;
  message?: string;
}
