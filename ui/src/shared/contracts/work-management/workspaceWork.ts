import type { PlannerCard, PlannerColumnDefinition, PlannerSettings, TaskCaptureState, TaskItem, TaskNotificationState, TaskOrganizationState, TaskSharingState, TaskStatusDefinition, TaskViewPreferences } from './workspaceWorkTasks';
import type { ProjectBaseline, ProjectBudgetCategory, ProjectCalendar, ProjectCostSettings, ProjectCustomFieldDefinition, ProjectDecision, ProjectDeliverable, ProjectDependency, ProjectGoal, ProjectInterimPlan, ProjectIssue, ProjectMilestone, ProjectPhase, ProjectPlanMeta, ProjectPortfolioState, ProjectResource, ProjectResourceAssignment, ProjectResourceCalendar, ProjectResourceLevelingOperation, ProjectResourcePool, ProjectRiskItem, ProjectTemplate, ProjectTrackingChange } from './workspaceWorkProjects';
export * from './workspaceWorkShared';
export * from './workspaceWorkProjects';
export * from './workspaceWorkTasks';

// STATUS: DIAMANT VGT SUPREME — Tasks, Planner & Projects Work Management Types
// --- Astraea Work Management (Tasks, Planner, Projects) ---
export interface WorkManagementModel {
  tasks: TaskItem[];
  cards: PlannerCard[];
  milestones: ProjectMilestone[];
  risks?: ProjectRiskItem[];
  project?: ProjectPlanMeta;
  phases?: ProjectPhase[];
  dependencies?: ProjectDependency[];
  baseline?: ProjectBaseline;
  projectBaselines?: ProjectBaseline[];
  projectActiveBaselineId?: string;
  projectInterimPlans?: ProjectInterimPlan[];
  projectStatusDate?: string;
  projectTrackingChanges?: ProjectTrackingChange[];
  projectCalendars?: ProjectCalendar[];
  projectResourceCalendars?: ProjectResourceCalendar[];
  projectResources?: ProjectResource[];
  projectResourcePools?: ProjectResourcePool[];
  projectResourceAssignments?: ProjectResourceAssignment[];
  projectResourceLevelingHistory?: ProjectResourceLevelingOperation[];
  projectBudgetCategories?: ProjectBudgetCategory[];
  projectCostSettings?: ProjectCostSettings;
  projectGoals?: ProjectGoal[];
  projectDeliverables?: ProjectDeliverable[];
  projectIssues?: ProjectIssue[];
  projectDecisions?: ProjectDecision[];
  projectCustomFields?: ProjectCustomFieldDefinition[];
  projectTemplates?: ProjectTemplate[];
  projectPortfolio?: ProjectPortfolioState;
  plannerColumns?: PlannerColumnDefinition[];
  plannerSettings?: PlannerSettings;
  taskStatusDefinitions?: TaskStatusDefinition[];
  taskOrganization?: TaskOrganizationState;
  taskViewPreferences?: TaskViewPreferences;
  taskNotifications?: TaskNotificationState;
  taskCapture?: TaskCaptureState;
  taskSharing?: TaskSharingState;
}
