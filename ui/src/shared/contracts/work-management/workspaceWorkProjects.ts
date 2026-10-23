// STATUS: DIAMANT VGT SUPREME — Project Management Schema
import type { TaskComment } from './workspaceWorkShared';

export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface ProjectPlanMeta {
  id: string;
  name: string;
  owner?: string;
  sponsor?: string;
  status?: ProjectStatus;
  objective?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  calendarId?: string;
  projectCode?: string;
  customFieldValues?: Record<string, ProjectCustomFieldValue>;
  viewSettings?: ProjectViewSettings;
}

export interface ProjectPortfolioResourceDemand {
  resourceKey: string;
  resourceName: string;
  units: number;
  workHours: number;
}

export interface ProjectPortfolioMilestoneRef {
  id: string;
  name: string;
  date?: string;
}

export interface ProjectPortfolioProjectLink {
  id: string;
  projectId: string;
  name: string;
  workspaceUri: string;
  programId?: string;
  status?: ProjectStatus;
  startDate?: string;
  endDate?: string;
  progress: number;
  plannedCost: number;
  actualCost: number;
  calendarIds: string[];
  resourcePoolIds: string[];
  milestones: ProjectPortfolioMilestoneRef[];
  resourceDemand: ProjectPortfolioResourceDemand[];
  dependencyProjectIds: string[];
}

export interface ProjectProgram {
  id: string;
  name: string;
  projectIds: string[];
}

export interface ProjectPortfolioScenarioProject {
  projectId: string;
  name: string;
  status?: ProjectStatus;
  progress: number;
  plannedCost: number;
  actualCost: number;
}

export interface ProjectPortfolioScenario {
  id: string;
  name: string;
  capturedAt: number;
  projects: ProjectPortfolioScenarioProject[];
  resourceWorkload: Array<{ resourceKey: string; resourceName: string; workHours: number; units: number }>;
}

export interface ProjectPortfolioState {
  linkedProjects: ProjectPortfolioProjectLink[];
  programs: ProjectProgram[];
  sharedCalendarIds: string[];
  sharedResourcePoolIds: string[];
  scenarios: ProjectPortfolioScenario[];
}

export type ProjectReportSection =
  | 'overview'
  | 'milestones'
  | 'late_tasks'
  | 'critical_tasks'
  | 'resources'
  | 'costs'
  | 'earned_value'
  | 'risks'
  | 'variance';

export interface ProjectReportDefinition {
  id: string;
  name: string;
  sections: ProjectReportSection[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectReportState {
  definitions: ProjectReportDefinition[];
  activeDefinitionId?: string;
}

export type ProjectCollaborationRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export type ProjectApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ProjectApprovalRequest {
  id: string;
  title: string;
  requestedBy: string;
  requestedAt: number;
  status: ProjectApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  note?: string;
}

export interface ProjectChangeHistoryEntry {
  id: string;
  at: number;
  actor: string;
  kind: 'project' | 'schedule' | 'baseline' | 'approval' | 'comment' | 'status_report' | 'space' | 'role';
  summary: string;
  taskId?: string;
}

export interface ProjectStatusReportRecord {
  id: string;
  createdAt: number;
  author: string;
  statusDate: string;
  progress: number;
  summary: string;
}

export interface ProjectOfflineOperation {
  id: string;
  at: number;
  actor: string;
  kind: 'comment' | 'role_change' | 'approval' | 'status_report' | 'schedule_change' | 'space_link';
  summary: string;
}

export interface ProjectCollaborationState {
  ownerId: string;
  memberRoles: Record<string, Exclude<ProjectCollaborationRole, 'owner'>>;
  baselineRoles: ProjectCollaborationRole[];
  approvalWorkflowEnabled: boolean;
  approvals: ProjectApprovalRequest[];
  comments: TaskComment[];
  changeHistory: ProjectChangeHistoryEntry[];
  statusReports: ProjectStatusReportRecord[];
  offlineQueue: ProjectOfflineOperation[];
  spaceUris: string[];
  scheduleAudit: ProjectChangeHistoryEntry[];
}

export type ProjectViewKind = 'gantt' | 'tracking_gantt' | 'timeline' | 'network' | 'calendar' | 'task_sheet' | 'task_usage' | 'resource_sheet' | 'resource_usage' | 'team_planner' | 'milestones' | 'risks_issues' | 'custom';

export type ProjectViewFilterField = 'status' | 'priority' | 'phaseId' | 'assignee' | 'completed' | 'text';

export type ProjectViewFilterOperator = 'equals' | 'not_equals' | 'contains';

export type ProjectViewGroupBy = 'none' | 'status' | 'priority' | 'phaseId' | 'assignee';

export interface ProjectViewFilter {
  id: string;
  field: ProjectViewFilterField;
  operator: ProjectViewFilterOperator;
  value: string;
}

export interface ProjectSavedView {
  id: string;
  name: string;
  columns: string[];
  filters: ProjectViewFilter[];
  groupBy: ProjectViewGroupBy;
}

export interface ProjectViewSettings {
  activeView: ProjectViewKind;
  activeCustomViewId?: string;
  splitSecondaryView?: ProjectViewKind;
  ganttSettings?: { timescale: 'day' | 'week' | 'month' | 'quarter' | 'year'; zoom: number; columns: string[] };
  customViews: ProjectSavedView[];
}

export interface ProjectWorkingHours {
  start: string;
  end: string;
}

export interface ProjectCalendar {
  id: string;
  name: string;
  timezone: string;
  workingWeekdays: number[];
  workingHours: ProjectWorkingHours[];
  nonWorkingDates: string[];
  workingDateOverrides: string[];
}

export interface ProjectResourceCalendar extends ProjectCalendar {
  resourceId: string;
}

export type ProjectResourceType = 'people' | 'equipment' | 'material' | 'cost';

export type ProjectResourceMetadataValue = string | number | boolean | null;

export interface ProjectResourceRate {
  id: string;
  effectiveFrom: string;
  standardRate: number;
  overtimeRate?: number;
  costPerUse?: number;
  currency?: string;
  unit?: string;
}

export interface ProjectResourceAvailability {
  startDate?: string;
  endDate?: string;
  /** 1.0 = 100% of one full resource unit. */
  maxUnits: number;
}

export interface ProjectResource {
  id: string;
  name: string;
  type: ProjectResourceType;
  /** 1.0 = 100%; values above 1 support crews/equipment pools. */
  maxUnits: number;
  calendarId?: string;
  materialLabel?: string;
  group?: string;
  email?: string;
  skills: string[];
  customMetadata: Record<string, ProjectResourceMetadataValue>;
  rates: ProjectResourceRate[];
  availability: ProjectResourceAvailability[];
  active: boolean;
  isBudgetResource?: boolean;
  budgetCategoryId?: string;
  budgetAmount?: number;
}

export type ProjectWorkContour =
  | 'flat'
  | 'front_loaded'
  | 'back_loaded'
  | 'double_peak'
  | 'early_peak'
  | 'late_peak'
  | 'bell'
  | 'turtle'
  | 'manual';

export interface ProjectTimephasedAllocation {
  date: string;
  workHours: number;
  units?: number;
}

export interface ProjectResourceAssignment {
  id: string;
  taskId: string;
  resourceId: string;
  /** 1.0 = 100% assignment units. */
  units: number;
  workHours?: number;
  overtimeHours?: number;
  quantity?: number;
  fixedCost?: number;
  contour: ProjectWorkContour;
  manualTimephased?: ProjectTimephasedAllocation[];
}

export interface ProjectResourcePool {
  id: string;
  name: string;
  resourceIds: string[];
  source: 'local' | 'linked';
  workspaceUri?: string;
}

export interface ProjectResourceLevelingTaskChange {
  taskId: string;
  beforeStartDate?: string;
  beforeDueDate?: string;
  afterStartDate?: string;
  afterDueDate?: string;
  reasonResourceIds: string[];
}

export interface ProjectResourceLevelingOperation {
  id: string;
  projectId: string;
  createdAt: number;
  taskChanges: ProjectResourceLevelingTaskChange[];
}

export type ProjectCostAccessRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface ProjectCostSettings {
  currency: string;
  locale: string;
  hiddenForRoles: ProjectCostAccessRole[];
}

export interface ProjectBudgetCategory {
  id: string;
  name: string;
  budgetAmount: number;
  parentId?: string;
}

export interface ProjectPhase {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
}

export type ProjectDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface ProjectDependency {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  /** Explicit project identity is mandatory for cross-project links. Legacy same-project links may omit it. */
  predecessorProjectId?: string;
  successorProjectId?: string;
  /** Optional stable Workspace URI used when an endpoint is not loaded in the current document. */
  predecessorWorkspaceUri?: string;
  successorWorkspaceUri?: string;
  type: ProjectDependencyType;
  lagDays: number;
}

export interface ProjectBaselineTaskSnapshot {
  taskId: string;
  startDate?: string;
  dueDate?: string;
  durationHours?: number;
  workHours?: number;
  plannedCost?: number;
  completed: boolean;
  progress: number;
  estimateHours?: number;
}

export interface ProjectBaseline {
  id: string;
  name: string;
  createdAt: number;
  scope?: 'project' | 'selection';
  selectedTaskIds?: string[];
  statusDate?: string;
  tasks: ProjectBaselineTaskSnapshot[];
  milestones: Array<Pick<ProjectMilestone, 'id' | 'startDate' | 'endDate' | 'progress'>>;
}

export interface ProjectInterimPlan {
  id: string;
  name: string;
  createdAt: number;
  taskIds: string[];
  tasks: Array<{ taskId: string; startDate?: string; dueDate?: string }>;
}

export interface ProjectTrackingChange {
  id: string;
  capturedAt: number;
  baselineId: string;
  taskId: string;
  field: 'startDate' | 'dueDate' | 'durationHours' | 'workHours' | 'plannedCost' | 'actualStartDate' | 'actualFinishDate' | 'actualHours' | 'actualCost' | 'progress';
  before?: string | number;
  after?: string | number;
}

export type ProjectRecordStatus = 'planned' | 'active' | 'blocked' | 'done' | 'cancelled';

export interface ProjectGoal {
  id: string;
  title: string;
  description?: string;
  owner?: string;
  targetDate?: string;
  status: ProjectRecordStatus;
  linkedTaskIds: string[];
}

export interface ProjectDeliverable {
  id: string;
  title: string;
  description?: string;
  owner?: string;
  dueDate?: string;
  status: ProjectRecordStatus;
  linkedTaskIds: string[];
  milestoneId?: string;
}

export interface ProjectIssue {
  id: string;
  title: string;
  description?: string;
  owner?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  dueDate?: string;
  linkedTaskIds: string[];
  milestoneId?: string;
  linkedWorkspaceUris?: string[];
}

export interface ProjectDecision {
  id: string;
  title: string;
  decision: string;
  rationale?: string;
  owner?: string;
  decidedAt: string;
  linkedTaskIds: string[];
  milestoneId?: string;
  linkedWorkspaceUris?: string[];
}

export type ProjectCustomFieldValue = string | number | boolean | null;

export type ProjectCustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'choice';

export interface ProjectCustomFieldDefinition {
  id: string;
  name: string;
  code: string;
  type: ProjectCustomFieldType;
  options?: string[];
  required?: boolean;
}

export interface ProjectTemplateTask {
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  estimateHours?: number;
  phaseName?: string;
  parentIndex?: number;
  milestone?: boolean;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  project: Pick<ProjectPlanMeta, 'owner' | 'sponsor' | 'status' | 'objective' | 'description' | 'projectCode'>;
  phases: Array<Pick<ProjectPhase, 'name'>>;
  tasks: ProjectTemplateTask[];
  createdAt: number;
}

export interface ProjectRiskItem {
  id: string;
  title: string;
  impact: 'high' | 'medium' | 'low';
  probability: 'high' | 'medium' | 'low';
  mitigation: string;
  isMitigated: boolean;
}

export interface ProjectMilestone {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  phaseId?: string;
}
