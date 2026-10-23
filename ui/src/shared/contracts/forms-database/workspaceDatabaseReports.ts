// STATUS: DIAMANT VGT SUPREME — Database reports Schema
import type { DatabaseQueryAggregateFunction, DatabaseQuerySort } from './workspaceDatabaseQueries';
import type { DatabaseViewColorToken } from './workspaceDatabaseViews';
import type { DbFieldValue } from './workspaceDatabaseCore';

export type DatabaseReportVisibility = 'private' | 'shared';

export type DatabaseReportAggregateFunction = DatabaseQueryAggregateFunction;

export type DatabaseReportConditionalOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'not_empty';

export type DatabaseReportColorToken = DatabaseViewColorToken;

export type DatabaseReportDataSource =
  | { kind: 'table'; tableId: string }
  | { kind: 'query'; queryId: string };

export interface DatabaseReportGrouping {
  field: string;
  label?: string;
}

export interface DatabaseReportAggregate {
  id: string;
  func: DatabaseReportAggregateFunction;
  field?: string;
  label: string;
}

export interface DatabaseReportChart {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'pie';
  categoryField: string;
  valueField?: string;
  aggregate: DatabaseReportAggregateFunction;
  maxPoints?: number;
}

export interface DatabaseReportImage {
  id: string;
  name: string;
  dataUrl: string;
  altText?: string;
  widthPercent?: number;
}

export interface DatabaseReportConditionalRule {
  id: string;
  field: string;
  operator: DatabaseReportConditionalOperator;
  value?: DbFieldValue;
  color: DatabaseReportColorToken;
}

export interface DatabaseReportLabel {
  id: string;
  text: string;
  placement: 'before_table' | 'after_table';
}

export interface DatabaseReportPageBreak {
  kind: 'every_rows' | 'group_change';
  everyRows?: number;
  field?: string;
}

export interface DatabaseReportSchedule {
  enabled: boolean;
  executor: 'local_agent' | 'self_hosted';
  expression?: string;
}

export interface DatabaseReportDefinition {
  id: string;
  name: string;
  visibility?: DatabaseReportVisibility;
  ownerId?: string;
  source: DatabaseReportDataSource;
  visibleFields?: string[];
  grouping?: DatabaseReportGrouping[];
  sorting?: DatabaseQuerySort[];
  headerText?: string;
  footerText?: string;
  pageHeaderText?: string;
  pageFooterText?: string;
  aggregates?: DatabaseReportAggregate[];
  charts?: DatabaseReportChart[];
  images?: DatabaseReportImage[];
  conditionalRules?: DatabaseReportConditionalRule[];
  labels?: DatabaseReportLabel[];
  pageBreak?: DatabaseReportPageBreak;
  schedule?: DatabaseReportSchedule;
  createdAt: number;
  modifiedAt: number;
}
