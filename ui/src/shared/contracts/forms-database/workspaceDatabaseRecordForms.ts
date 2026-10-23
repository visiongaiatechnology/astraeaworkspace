// STATUS: DIAMANT VGT SUPREME — Database record Forms Schema
import type { DbFieldValue } from './workspaceDatabaseCore';

export type DatabaseRecordFormSectionKind = 'section' | 'tab';

export type DatabaseRecordFormWidth = 'full' | 'half' | 'third';

export type DatabaseRecordFormVisibilityOperator = 'eq' | 'neq' | 'empty' | 'not_empty';

export type DatabaseRecordFormApprovedAction = 'save' | 'duplicate' | 'soft_delete' | 'print';

export interface DatabaseRecordFormSection {
  id: string;
  label: string;
  kind: DatabaseRecordFormSectionKind;
  order: number;
}

export interface DatabaseRecordFormControl {
  id: string;
  columnId: string;
  sectionId: string;
  order: number;
  label?: string;
  width?: DatabaseRecordFormWidth;
  required?: boolean;
  readOnly?: boolean;
  lookup?: { relationshipId: string; displayColumnId: string };
}

export interface DatabaseRecordFormVisibilityRule {
  id: string;
  targetControlId: string;
  sourceColumnId: string;
  operator: DatabaseRecordFormVisibilityOperator;
  value?: DbFieldValue;
}

export interface DatabaseRecordSubform {
  id: string;
  label: string;
  sectionId: string;
  relationshipId: string;
  maxRecords?: number;
}

export interface DatabaseRecordFormButton {
  id: string;
  label: string;
  action: DatabaseRecordFormApprovedAction;
  approved: true;
}

export interface DatabaseRecordFormDefinition {
  id: string;
  name: string;
  tableId: string;
  sections: DatabaseRecordFormSection[];
  controls: DatabaseRecordFormControl[];
  visibilityRules?: DatabaseRecordFormVisibilityRule[];
  subforms?: DatabaseRecordSubform[];
  buttons?: DatabaseRecordFormButton[];
  responsive?: boolean;
  printable?: boolean;
  templateKey?: 'compact' | 'tabbed' | 'review';
  isTemplate?: boolean;
  createdAt: number;
  modifiedAt: number;
}
