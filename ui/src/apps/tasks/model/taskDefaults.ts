// STATUS: GOLD — task-owned seed records shared without Planner or Projects runtime dependencies.
import type { ProjectDependency, TaskItem } from '../../../shared/contracts/work-management/workspaceWork';

export const DEFAULT_TASK_PROJECT_ID = 'project-workspace-release';

export const DEFAULT_TASKS: TaskItem[] = [
  {
    id: 'task-1',
    title: 'Consolidate canonical Workspace document persistence',
    completed: true,
    progress: 100,
    priority: 'high',
    startDate: '2026-09-01',
    dueDate: '2026-09-08',
    projectId: DEFAULT_TASK_PROJECT_ID,
    phaseId: 'phase-foundation',
    estimateHours: 24,
    plannerColumn: 'done',
  },
  {
    id: 'task-2',
    title: 'Complete professional Writer editing and export workflows',
    completed: false,
    progress: 75,
    priority: 'high',
    startDate: '2026-09-09',
    dueDate: '2026-10-10',
    projectId: DEFAULT_TASK_PROJECT_ID,
    phaseId: 'phase-apps',
    estimateHours: 48,
    plannerColumn: 'in_progress',
  },
  {
    id: 'task-3',
    title: 'Complete professional Grid calculation and data workflows',
    completed: false,
    progress: 70,
    priority: 'high',
    startDate: '2026-09-12',
    dueDate: '2026-10-20',
    projectId: DEFAULT_TASK_PROJECT_ID,
    phaseId: 'phase-apps',
    estimateHours: 56,
    plannerColumn: 'in_progress',
  },
  {
    id: 'task-4',
    title: 'Run full release regression and export validation',
    completed: false,
    progress: 5,
    priority: 'high',
    startDate: '2026-12-01',
    dueDate: '2026-12-20',
    projectId: DEFAULT_TASK_PROJECT_ID,
    phaseId: 'phase-release',
    estimateHours: 40,
    plannerColumn: 'todo',
  },
];

export const DEFAULT_TASK_DEPENDENCIES: ProjectDependency[] = [
  { id: 'dep-1', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FS', lagDays: 0 },
  { id: 'dep-2', predecessorTaskId: 'task-1', successorTaskId: 'task-3', type: 'FS', lagDays: 0 },
  { id: 'dep-3', predecessorTaskId: 'task-2', successorTaskId: 'task-4', type: 'FS', lagDays: 0 },
  { id: 'dep-4', predecessorTaskId: 'task-3', successorTaskId: 'task-4', type: 'FS', lagDays: 0 },
];
