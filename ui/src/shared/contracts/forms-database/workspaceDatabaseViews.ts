// STATUS: DIAMANT VGT SUPREME — Database views Schema
import type { DbFieldValue } from './workspaceDatabaseCore';

export type DatabaseViewType = 'grid' | 'list' | 'form' | 'gallery' | 'kanban' | 'calendar' | 'timeline' | 'grouped_summary' | 'chart';

export type DatabaseViewVisibility = 'private' | 'shared';

export type DatabaseViewColorToken = 'slate' | 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet';

export interface DatabaseViewColorRule {
  id: string;
  columnId: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'not_empty';
  value?: DbFieldValue;
  color: DatabaseViewColorToken;
}

export interface DatabaseSavedView {
  id: string;
  name: string;
  type: DatabaseViewType;
  tableId?: string;
  visibility?: DatabaseViewVisibility;
  ownerId?: string;
  filterColumn?: string;
  filterValue?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  groupByColumnId?: string;
  dateColumnId?: string;
  endDateColumnId?: string;
  titleColumnId?: string;
  visibleColumnIds?: string[];
  fieldOrder?: string[];
  colorRules?: DatabaseViewColorRule[];
  pageSize?: number;
}
