// STATUS: DIAMANT VGT SUPREME — Database queries Schema
import type { DbFieldValue } from './workspaceDatabaseCore';

export type DatabaseQueryJoinType = 'inner' | 'left' | 'right' | 'full';

export type DatabaseQueryVisibility = 'private' | 'shared';

export type DatabaseQueryFilterOperator =
  | 'eq' | 'neq' | 'contains' | 'starts_with' | 'ends_with'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'not_empty' | 'in' | 'not_in';

export type DatabaseQueryAggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type DatabaseQueryOperand =
  | { kind: 'literal'; value?: DbFieldValue }
  | { kind: 'parameter'; name: string }
  | { kind: 'field'; field: string };

export interface DatabaseQueryCondition {
  kind: 'condition';
  field: string;
  operator: DatabaseQueryFilterOperator;
  operand?: DatabaseQueryOperand;
}

export interface DatabaseQueryGroup {
  kind: 'group';
  mode: 'and' | 'or';
  clauses: DatabaseQueryPredicate[];
}

export type DatabaseQueryPredicate = DatabaseQueryCondition | DatabaseQueryGroup;

export interface DatabaseQuerySelectField {
  kind: 'field';
  field: string;
  alias?: string;
}

export interface DatabaseQueryCalculatedField {
  kind: 'expression';
  expression: string;
  alias: string;
}

export type DatabaseQuerySelect = DatabaseQuerySelectField | DatabaseQueryCalculatedField;

export interface DatabaseQueryJoin {
  type: DatabaseQueryJoinType;
  targetSource: string;
  alias?: string;
  sourceField: string;
  targetField: string;
}

export interface DatabaseQueryAggregate {
  func: DatabaseQueryAggregateFunction;
  field?: string;
  alias: string;
}

export interface DatabaseQuerySort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface DatabaseQueryParameter {
  name: string;
  required?: boolean;
  defaultValue?: DbFieldValue;
}

export interface DatabaseQueryPivot {
  rowFields: string[];
  columnField: string;
  valueField?: string;
  aggregate: DatabaseQueryAggregateFunction;
  maxColumns?: number;
}

export interface DatabaseNamedSubquery {
  alias: string;
  query: DatabaseQueryDefinition;
}

export interface DatabaseQueryUnion {
  all?: boolean;
  query: DatabaseQueryDefinition;
}

export interface DatabaseQueryDefinition {
  fromSource: string;
  fromAlias?: string;
  select: DatabaseQuerySelect[];
  joins?: DatabaseQueryJoin[];
  where?: DatabaseQueryPredicate;
  groupBy?: string[];
  aggregates?: DatabaseQueryAggregate[];
  orderBy?: DatabaseQuerySort[];
  parameters?: DatabaseQueryParameter[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
  subqueries?: DatabaseNamedSubquery[];
  pivot?: DatabaseQueryPivot;
  unions?: DatabaseQueryUnion[];
}

export interface DatabaseSavedQuery {
  id: string;
  name: string;
  visibility?: DatabaseQueryVisibility;
  ownerId?: string;
  query: DatabaseQueryDefinition;
  createdAt: number;
  modifiedAt: number;
}
