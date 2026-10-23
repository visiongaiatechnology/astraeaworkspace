// STATUS: DIAMANT VGT SUPREME — Tasks and Planner Schema
import type { ProjectConstraintType, ProjectSchedulingMode, ProjectTaskSplit, TaskComment } from './workspaceWorkShared';

export interface PlannerColumnDefinition {
  id: string;
  label: string;
  order: number;
  wipLimit?: number;
}

export interface PlannerFilters {
  search?: string;
  assignee?: string;
  priority?: 'low' | 'medium' | 'high';
  tag?: string;
  due?: 'all' | 'overdue' | 'today' | 'upcoming' | 'none';
}

export interface PlannerSettings {
  view: 'board' | 'list' | 'calendar' | 'workload';
  filters: PlannerFilters;
}

export interface TaskChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string;
  workspaceUri?: string;
  sha256?: string;
  createdAt?: number;
  createdBy?: string;
}

export type TaskCanonicalStatus =
  | 'not_started'
  | 'active'
  | 'blocked'
  | 'waiting'
  | 'done'
  | 'cancelled';

export interface TaskStatusDefinition {
  id: string;
  label: string;
  mapsTo: TaskCanonicalStatus;
  order: number;
  system?: boolean;
}

export type TaskActivityKind =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'assignment_changed'
  | 'comment_added'
  | 'attachment_added'
  | 'attachment_removed'
  | 'link_changed'
  | 'reminder_changed'
  | 'recurrence_changed';

export interface TaskActivityEvent {
  id: string;
  kind: TaskActivityKind;
  at: number;
  actor: string;
  summary: string;
  source?: string;
}

export type TaskRecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface TaskRecurrenceSpec {
  frequency: TaskRecurrenceFrequency;
  interval: number;
  weekdays?: number[];
  monthDay?: number;
  nthWeekday?: { ordinal: 1 | 2 | 3 | 4 | -1; weekday: number };
  end?: { mode: 'never' } | { mode: 'count'; count: number } | { mode: 'until'; until: string };
  timezone?: string;
  rrule?: string;
}

export interface TaskReminderRule {
  id: string;
  at?: string;
  offsetMinutes?: number;
  enabled: boolean;
  snoozedUntil?: string;
  label?: string;
}

export type TaskBuiltInView =
  | 'my_day'
  | 'inbox'
  | 'all'
  | 'important'
  | 'planned'
  | 'upcoming'
  | 'overdue'
  | 'completed'
  | 'assigned_to_me'
  | 'created_by_me'
  | 'waiting_blocked';

export interface TaskFilterDefinition {
  text?: string;
  statuses?: string[];
  priorities?: Array<'low' | 'medium' | 'high'>;
  tags?: string[];
  assignees?: string[];
  projectIds?: string[];
  listIds?: string[];
  due?: 'any' | 'none' | 'overdue' | 'today' | 'future';
  completed?: boolean;
  important?: boolean;
}

export interface TaskSmartList {
  id: string;
  name: string;
  filter: TaskFilterDefinition;
  createdAt: number;
}

export interface TaskSavedFilter {
  id: string;
  name: string;
  filter: TaskFilterDefinition;
  createdAt: number;
}

export interface TaskUserList {
  id: string;
  name: string;
  folderId?: string;
  createdAt: number;
}

export interface TaskListFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface TaskOrganizationState {
  localIdentity: string;
  lists: TaskUserList[];
  folders: TaskListFolder[];
  smartLists: TaskSmartList[];
  savedFilters: TaskSavedFilter[];
}

export interface TaskItem {
  /** Stable immutable canonical Workspace task identifier. */
  id: string;
  title: string;
  description?: string;
  descriptionFormat?: 'markdown';

  /** Canonical status id. System ids map directly; custom ids map through taskStatusDefinitions. */
  status?: string;
  statusReason?: string;
  completed: boolean;
  progress?: number;
  priority: 'low' | 'medium' | 'high';

  /** Legacy date-only compatibility fields consumed by Planner/Projects. */
  startDate?: string;
  dueDate?: string;
  /** Canonical date/time values. Local date-time strings are preserved without implicit UTC coercion. */
  startAt?: string;
  dueAt?: string;
  completionDate?: string;

  estimateHours?: number;
  actualHours?: number;
  plannedCost?: number;
  actualCost?: number;
  fixedCost?: number;
  fixedCostAccrual?: 'start' | 'prorated' | 'end';
  /** Projects scheduling metadata. 1.0 units means one full-time resource equivalent. */
  schedulingMode?: ProjectSchedulingMode;
  durationHours?: number;
  workHours?: number;
  units?: number;
  constraintType?: ProjectConstraintType;
  constraintDate?: string;
  deadlineDate?: string;
  taskCalendarId?: string;
  resourceCalendarIds?: string[];
  splitSegments?: ProjectTaskSplit[];
  actualStartDate?: string;
  actualFinishDate?: string;
  tags?: string[];
  /** Legacy primary assignee. */
  assignee?: string;
  /** Canonical multi-assignee collection. */
  assignees?: string[];
  watchers?: string[];
  important?: boolean;
  myDayDate?: string;
  inbox?: boolean;
  listId?: string;

  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  updatedBy?: string;
  source?: string;

  parentTaskId?: string;
  projectId?: string;
  phaseId?: string;
  planId?: string;
  milestoneId?: string;
  plannerColumn?: string;

  linkedWorkspaceUris?: string[];
  attachments?: TaskAttachment[];
  comments?: TaskComment[];
  activity?: TaskActivityEvent[];
  checklist?: TaskChecklistItem[];

  /** Legacy simple recurrence retained for portable/interchange compatibility. */
  recurrence?: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
  recurrenceSpec?: TaskRecurrenceSpec;
  reminders?: TaskReminderRule[];
  /** Stable identity shared by all occurrences of one recurring series. */
  recurrenceSeriesId?: string;
  /** Zero-based occurrence index inside the recurring series. */
  recurrenceIndex?: number;
  generatedFromTaskId?: string;
  occurrenceKey?: string;
  occurrenceState?: 'scheduled' | 'skipped';

  blocked?: boolean;
}

export interface PlannerCard {
  id: string;
  title: string;
  column: string;
  assignee?: string;
  tags: string[];
  linkedTaskId?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  description?: string;
  checklist?: TaskChecklistItem[];
}

export type TaskViewMode = 'list' | 'compact' | 'board' | 'calendar' | 'timeline';

export type TaskBoardGroupBy = 'status' | 'priority' | 'tag' | 'project';

export type TaskGroupBy = 'none' | 'project' | 'list' | 'assignee' | 'tag' | 'status';

export type TaskSortBy = 'due' | 'priority' | 'created' | 'updated' | 'manual';

export interface TaskViewPreferences {
  mode: TaskViewMode;
  boardBy: TaskBoardGroupBy;
  groupBy: TaskGroupBy;
  sortBy: TaskSortBy;
  sortDirection: 'asc' | 'desc';
  filter: TaskFilterDefinition;
  manualOrder: string[];
}

export type TaskNotificationKind =
  | 'reminder'
  | 'due_soon'
  | 'overdue'
  | 'mention'
  | 'comment'
  | 'assignment_change'
  | 'dependency_unblocked';

export interface TaskQuietHours {
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
}

export interface TaskNotificationPolicy {
  id: string;
  scope: 'list' | 'project';
  scopeId: string;
  enabled: boolean;
  mutedKinds?: TaskNotificationKind[];
}

export interface TaskNotificationItem {
  id: string;
  kind: TaskNotificationKind;
  taskId: string;
  createdAt: number;
  title: string;
  body: string;
  read: boolean;
  desktopDeliveredAt?: number;
  source: 'local';
}

export interface TaskNotificationState {
  quietHours: TaskQuietHours;
  policies: TaskNotificationPolicy[];
  items: TaskNotificationItem[];
  lastEvaluatedAt?: number;
}

export interface TaskCaptureTemplate {
  id: string;
  name: string;
  titlePattern: string;
  priority: 'low' | 'medium' | 'high';
  tags?: string[];
  listId?: string;
  projectId?: string;
  recurrenceSpec?: TaskRecurrenceSpec;
  createdAt: number;
}

export interface TaskCaptureState {
  templates: TaskCaptureTemplate[];
  naturalLanguageDatesEnabled: boolean;
}

export type TaskAccessRole = 'owner' | 'assignee' | 'editor' | 'commenter' | 'viewer';

export type TaskPermissionCapability = 'view' | 'comment' | 'edit' | 'manage_sharing';

export interface TaskPermissionAuditEntry {
  id: string;
  at: number;
  actor: string;
  action: string;
  scopeId: string;
  detail: string;
}

export interface TaskOfflinePermissionChange {
  id: string;
  at: number;
  actor: string;
  scopeId: string;
  operation: 'share' | 'unshare' | 'role' | 'owner_transfer';
}

export interface TaskListSharingRule {
  scopeId: string;
  visibility: 'personal' | 'shared';
  ownerId: string;
  memberRoles: Record<string, Exclude<TaskAccessRole, 'owner' | 'assignee'>>;
}

export interface TaskSharingState {
  rules: TaskListSharingRule[];
  audit: TaskPermissionAuditEntry[];
  offlineQueue: TaskOfflinePermissionChange[];
}
