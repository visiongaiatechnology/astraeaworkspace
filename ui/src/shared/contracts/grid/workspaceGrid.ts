// STATUS: DIAMANT VGT SUPREME — Grid & Table Object Model Types
import type { GridChartTemplate } from '../visualization/workspaceShapesChartsCore';
import type { GridQueryDefinition, GridPublishObjectDefinition, GridAnalysisAuditRecord } from './workspaceGridQuery';
export type { GridQuerySourceKind, GridQuerySourceDefinition, GridQueryPersistedStep, GridQueryLineageEntry, GridQueryErrorRow, GridQueryDefinition, GridPublishObjectKind, GridPublishObjectDefinition, GridAnalysisAuditKind, GridAnalysisAuditRecord } from './workspaceGridQuery';
export type GridFilterOperator =
  | 'equals'
  | 'not-equals'
  | 'contains'
  | 'not-contains'
  | 'starts-with'
  | 'ends-with'
  | 'greater-than'
  | 'greater-than-or-equal'
  | 'less-than'
  | 'less-than-or-equal'
  | 'between'
  | 'empty'
  | 'not-empty'
  | 'before'
  | 'after'
  | 'on-date';

export interface GridFilterRule {
  id: string;
  column: string;
  operator: GridFilterOperator;
  value?: string | number;
  value2?: string | number;
  caseSensitive?: boolean;
}

export interface GridSortRule {
  column: string;
  direction: 'asc' | 'desc';
  sortBy?: 'value' | 'cell-color' | 'font-color' | 'icon';
  customList?: string[];
}

export interface GridAdvancedFilter {
  groups: GridFilterRule[][];
  uniqueOnly?: boolean;
}

export type GridConditionalOperator = 'greater-than' | 'less-than' | 'equals' | 'not-equals' | 'contains' | 'between';
export type GridConditionalKind =
  | 'cell'
  | 'formula'
  | 'color-scale'
  | 'data-bar'
  | 'icon-set'
  | 'duplicate'
  | 'unique'
  | 'top'
  | 'bottom'
  | 'date';
export type GridConditionalDatePeriod =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'last-7-days'
  | 'this-month'
  | 'last-month'
  | 'next-month';

export interface GridConditionalFormattingRule {
  id: string;
  range: string;
  kind?: GridConditionalKind;
  operator?: GridConditionalOperator;
  value?: string | number;
  value2?: string | number;
  formula?: string;
  background?: string;
  textColor?: string;
  priority?: number;
  stopIfTrue?: boolean;
  minColor?: string;
  midColor?: string;
  maxColor?: string;
  dataBarColor?: string;
  iconSet?: 'arrows' | 'traffic-lights' | 'ratings';
  rankCount?: number;
  rankPercent?: boolean;
  datePeriod?: GridConditionalDatePeriod;
}

export type GridValidationKind = 'number' | 'whole-number' | 'decimal' | 'list' | 'text-length' | 'date' | 'time' | 'custom';

export interface GridDataValidationRule {
  id: string;
  range: string;
  kind: GridValidationKind;
  operator?: string;
  min?: number;
  max?: number;
  options?: string[];
  allowBlank?: boolean;
  inputMessage?: string;
  errorMessage?: string;
  formula?: string;
  listSource?: string;
}

export interface GridPrintSettings {
  paperSize: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margins: 'normal' | 'narrow' | 'wide' | 'custom';
  customMarginsMm?: { top: number; right: number; bottom: number; left: number };
  fitToWidth: boolean;
  fitToPagesWide?: number;
  fitToPagesTall?: number;
  showGridlines: boolean;
  showHeadings?: boolean;
  repeatHeaderRow: boolean;
  repeatRows?: string;
  repeatColumns?: string;
  printArea?: string;
  pageBreakRows?: number[];
  pageBreakColumns?: number[];
  firstPageNumber?: number;
  headerLeft?: string;
  headerCenter?: string;
  headerRight?: string;
  footerLeft?: string;
  footerCenter?: string;
  footerRight?: string;
}

export interface GridInteropPreservation {
  sourceFormat: 'xlsx' | 'ods';
  preservedXmlParts: Record<string, string>;
}

export interface GridNamedFormula {
  id: string;
  name: string;
  formula: string;
  comment?: string;
}

export interface GridNamedRange {
  id: string;
  name: string;
  sheetId: string;
  range: string;
}

export type GridPivotAggregation = 'sum' | 'count' | 'average' | 'min' | 'max' | 'distinct_count';

export interface GridPivotValueField {
  column: string;
  aggregation: GridPivotAggregation;
  label?: string;
}

export interface GridPivotFilterDefinition {
  column: string;
  allowedValues?: string[];
  min?: number;
  max?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface GridPivotGroupingDefinition {
  column: string;
  dateGrouping?: 'year' | 'quarter' | 'month' | 'day';
  numberBinSize?: number;
  manualGroups?: Record<string, string>;
}

export interface GridPivotCalculatedFieldDefinition {
  name: string;
  formula: string;
}

export interface GridPivotCalculatedItemDefinition {
  field: string;
  name: string;
  formula: string;
}

export interface GridPivotStyleDefinition {
  headerBackground?: string;
  headerTextColor?: string;
  totalBackground?: string;
  alternateRows?: boolean;
  numberFormatCode?: string;
}

export interface GridPivotDefinition {
  id: string;
  name: string;
  sourceRange: string;
  rowColumn: string;
  valueColumn: string;
  aggregation: GridPivotAggregation;
  rowColumns?: string[];
  columnColumns?: string[];
  valueFields?: GridPivotValueField[];
  filters?: GridPivotFilterDefinition[];
  groupings?: GridPivotGroupingDefinition[];
  calculatedFields?: GridPivotCalculatedFieldDefinition[];
  calculatedItems?: GridPivotCalculatedItemDefinition[];
  collapsedKeys?: string[];
  style?: GridPivotStyleDefinition;
  timelineFilters?: Array<{ column: string; from?: string; to?: string }>;
}

export interface GridDataModelRelationship {
  id: string;
  primaryTableId: string;
  primaryColumn: string;
  foreignTableId: string;
  foreignColumn: string;
}

export interface GridDataModelMeasure {
  id: string;
  name: string;
  formula: string;
}

export interface GridDataModel {
  relationships: GridDataModelRelationship[];
  measures: GridDataModelMeasure[];
}

export interface GridCellComment {
  id: string;
  coord: string;
  author: string;
  text: string;
  timestamp: number;
  resolved?: boolean;
  parentId?: string;
  mentions?: string[];
  kind?: 'comment' | 'note';
}

export interface GridRangePermissionRule {
  id: string;
  range: string;
  allowedUsers: string[];
  allowedRoles: string[];
  isReadOnly: boolean;
}

export interface GridWorkbookProtectionSettings {
  isProtected: boolean;
  allowStructureChanges?: boolean;
  allowWindowChanges?: boolean;
}

export interface GridCellConflictRecord {
  id: string;
  coord: string;
  baseValue?: string | number | boolean;
  localValue?: string | number | boolean;
  remoteValue?: string | number | boolean;
  resolvedValue?: string | number | boolean;
  localTimestamp: number;
  remoteTimestamp: number;
  resolutionStrategy: 'local' | 'remote' | 'lww' | 'manual';
  resolved?: boolean;
}

export interface GridSlicerDefinition {
  id: string;
  title: string;
  column: string;
  selectedValues: string[];
}

export interface GridSheetModel {
  id: string;
  name: string;
  tableObjectId: string;
  tabColor?: string;
  hidden?: boolean;
  veryHidden?: boolean;
  hiddenRows?: number[];
  hiddenCols?: number[];
  rowGroups?: GridAxisGroup[];
  colGroups?: GridAxisGroup[];
  freezeRows?: number;
  freezeCols?: number;
  showGridlines?: boolean;
  zoom?: number;
  colWidths?: Record<number, number>;
  rowHeights?: Record<number, number>;
  mergedCells?: string[];
  filters?: GridFilterRule[];
  sort?: GridSortRule[];
  advancedFilter?: GridAdvancedFilter;
  conditionalFormatting?: GridConditionalFormattingRule[];
  validations?: GridDataValidationRule[];
  printSettings?: GridPrintSettings;
  pivots?: GridPivotDefinition[];
  comments?: GridCellComment[];
  slicers?: GridSlicerDefinition[];
  viewMode?: 'normal' | 'page-layout' | 'page-break';
  splitPanes?: { row?: number; col?: number };
  tables?: GridStructuredTable[];
  scenarios?: GridScenario[];
  dataTables?: GridWhatIfDataTable[];
  namedViews?: GridNamedView[];
  activeNamedViewId?: string;
  protection?: GridProtectionSettings;
  rangePermissions?: GridRangePermissionRule[];
  history?: GridCellHistoryEntry[];
  conflicts?: GridCellConflictRecord[];
  stableRanges?: GridStableRangeIdentity[];
  useVirtualCanvas?: boolean;
}

export interface GridAxisGroup {
  start: number;
  end: number;
  collapsed?: boolean;
}

export interface GridStableRangeIdentity {
  id: string;
  name?: string;
  startCellId: string;
  endCellId: string;
  fallbackRange: string;
}

export interface GridNamedView {
  id: string;
  name: string;
  sheetId: string;
  filters?: GridFilterRule[];
  sort?: GridSortRule[];
  zoom?: number;
}

export interface GridTableColumn {
  name: string;
  totalFunction?: 'none' | 'sum' | 'count' | 'average' | 'min' | 'max' | 'stdDev' | 'var';
  calculatedFormula?: string;
}

export interface GridStructuredTable {
  id: string;
  name: string;
  sheetId: string;
  range: string;
  hasHeaders: boolean;
  hasTotalsRow: boolean;
  styleTheme?: 'blue' | 'dark' | 'emerald' | 'purple' | 'amber';
  columns: GridTableColumn[];
}

export interface GridScenario {
  id: string;
  name: string;
  sheetId?: string;
  changingCells: string[];
  values: Record<string, string | number>;
  comment?: string;
}

export interface GridWhatIfDataTable {
  id: string;
  sheetId: string;
  range: string;
  rowInputCell?: string;
  colInputCell?: string;
}

export interface GridGoalSeekConfig {
  setCell: string;
  targetValue: number;
  byChangingCell: string;
  maxIterations?: number;
  tolerance?: number;
}

export interface GridProtectionSettings {
  isProtected: boolean;
  allowSelectLockedCells?: boolean;
  allowSelectUnlockedCells?: boolean;
  allowFormatCells?: boolean;
  allowSort?: boolean;
  allowFilter?: boolean;
  passwordHash?: string;
}

export interface GridCellHistoryEntry {
  id: string;
  coord: string;
  oldValue?: string | number | boolean;
  newValue?: string | number | boolean;
  author: string;
  timestamp: number;
}

export type GridPasteSpecialMode =
  | 'all'
  | 'values'
  | 'formulas'
  | 'formats'
  | 'all-except-borders'
  | 'column-widths';

export type GridPasteSpecialOperation = 'none' | 'add' | 'subtract' | 'multiply' | 'divide';

export interface GridPasteSpecialOptions {
  mode: GridPasteSpecialMode;
  operation: GridPasteSpecialOperation;
  skipBlanks?: boolean;
  transpose?: boolean;
}

export type GridSeriesType = 'linear' | 'growth' | 'date-day' | 'date-weekday' | 'date-month' | 'date-year' | 'auto';

export interface GridDocumentModel {
  sheets: GridSheetModel[];
  activeSheetId?: string;
  namedRanges?: GridNamedRange[];
  namedFormulas?: GridNamedFormula[];
  calculationMode?: 'automatic' | 'manual' | 'automatic-except-data-tables';
  locale?: string;
  properties?: Record<string, string>;
  iterativeCalculation?: { enabled: boolean; maxIterations: number; maxChange: number };
  chartTemplates?: GridChartTemplate[];
  dataModel?: GridDataModel;
  queries?: GridQueryDefinition[];
  analysisAudits?: GridAnalysisAuditRecord[];
  publishObjects?: GridPublishObjectDefinition[];
  workbookProtection?: GridWorkbookProtectionSettings;
  interopPreservation?: GridInteropPreservation;
}


// --- Grid / Table Model ---
export interface TableObject {
  id: string;
  rows: number;
  cols: number;
  cells: Record<string, GridCell>; // "row:col" or "A1"
}

export interface GridCell {
  value: string | number | boolean;
  formula?: string;
  dataType?: 'empty' | 'text' | 'integer' | 'decimal' | 'currency' | 'percent' | 'date' | 'time' | 'datetime' | 'duration' | 'boolean' | 'error' | 'formula' | 'rich-text';
  format?: 'currency' | 'percent' | 'number' | 'text' | 'date' | 'time' | 'datetime' | 'duration' | 'accounting' | 'scientific' | 'fraction';
  richTextRuns?: Array<{ text:string; bold?:boolean; italic?:boolean; underline?:boolean; textColor?:string }>;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  fontFamily?: string;
  alignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'top' | 'middle' | 'bottom';
  indent?: number;
  orientation?: number; // rotation in degrees e.g. 0, 45, 90, -45
  wrap?: boolean;
  shrinkToFit?: boolean;
  locked?: boolean;
  background?: string;
  text_color?: string;
  border?: 'none' | 'all' | 'outline' | 'top' | 'bottom' | 'left' | 'right' | 'double-bottom';
  numberFormatCode?: string;
  sparkline?: number[];
  sparklineSourceRange?: string;
  sparklineType?: 'line' | 'column' | 'win-loss';
  sparklineColor?: string;
  commentId?: string;
  stableId?: string;
}


