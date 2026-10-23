// STATUS: GOLD — isolated Tasks document projection and canonical persistence adapter.
import type { WorkspaceDocument } from '../../../shared/contracts/workspaceCommon';
import type {
  ProjectDependency,
  TaskCaptureState,
  TaskItem,
  TaskNotificationState,
  TaskOrganizationState,
  TaskSharingState,
  TaskStatusDefinition,
  TaskViewPreferences,
  WorkManagementModel,
} from '../../../shared/contracts/work-management/workspaceWork';
import { DEFAULT_TASK_DEPENDENCIES, DEFAULT_TASKS, DEFAULT_TASK_PROJECT_ID } from '../model/taskDefaults';
import { normalizeTaskCaptureState, DEFAULT_TASK_CAPTURE_STATE } from '../capture/taskCapture';
import { normalizeTaskNotificationState, DEFAULT_TASK_NOTIFICATION_STATE } from '../notifications/taskNotifications';
import { DEFAULT_TASK_ORGANIZATION, normalizeTaskOrganization } from '../state/taskOrganization';
import { TASK_SYSTEM_STATUS_DEFINITIONS, normalizeTaskItem } from '../model/taskModel';
import { DEFAULT_TASK_SHARING_STATE, normalizeTaskSharingState } from '../sharing/taskSharing';
import { normalizedTaskViewPreferences } from '../views/taskViews';

const MAX_LEGACY_PAYLOAD_CHARS = 32 * 1024 * 1024;
const TASK_PRIORITIES = new Set(['low', 'medium', 'high']);
const TASK_STATUSES = new Set(['not_started', 'active', 'blocked', 'waiting', 'done', 'cancelled']);
const DEPENDENCY_TYPES = new Set(['FS', 'SS', 'FF', 'SF']);

export interface TasksOnlyDocumentData {
  tasks: TaskItem[];
  dependencies: ProjectDependency[];
  projectId: string;
  taskStatusDefinitions: TaskStatusDefinition[];
  taskOrganization: TaskOrganizationState;
  taskViewPreferences: TaskViewPreferences;
  taskNotifications: TaskNotificationState;
  taskCapture: TaskCaptureState;
  taskSharing: TaskSharingState;
}

export type TasksOnlyDocumentPatch = Partial<Omit<TasksOnlyDocumentData, 'projectId'>>;

type PlainRecord = Record<string, unknown>;

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function recordFromDocument(document: WorkspaceDocument): Partial<WorkManagementModel> {
  const stored = document.workManagementData ?? document.workData;
  if (stored) return stored;

  const legacyObject = document.objects?.['work_mgmt_payload'];
  if (legacyObject?.type !== 'TextBlock') return {};
  const text = legacyObject.data.paragraphs[0]?.spans[0]?.text;
  if (!text || text.length > MAX_LEGACY_PAYLOAD_CHARS) return {};

  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return {};
    // The record is kept opaque except for task-owned keys; Planner/Projects normalize their own fields.
    return parsed as Partial<WorkManagementModel>;
  } catch {
    return {};
  }
}

function isTaskRecord(value: unknown): value is TaskItem {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && value.id.length > 0
    && value.id.length <= 192
    && typeof value.title === 'string'
    && value.title.length <= 16_384
    && typeof value.completed === 'boolean'
    && typeof value.priority === 'string'
    && TASK_PRIORITIES.has(value.priority);
}

function normalizedTasks(value: unknown, projectId: string, now: number): TaskItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  return value.filter(isTaskRecord).filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  }).map((task) => normalizeTaskItem({
    ...task,
    tags: stringArray(task.tags),
    assignees: stringArray(task.assignees),
    watchers: stringArray(task.watchers),
    projectId: stringValue(task.projectId) ?? projectId,
    progress: Number.isFinite(task.progress) ? task.progress : (task.completed ? 100 : 0),
  }, {
    now,
    actor: stringValue(task.updatedBy) ?? stringValue(task.createdBy) ?? 'Local User',
    source: stringValue(task.source) ?? 'astraea.tasks.migration',
  }));
}

function normalizedDependencies(value: unknown): ProjectDependency[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((candidate): candidate is ProjectDependency => {
    if (!isRecord(candidate)) return false;
    return typeof candidate.id === 'string'
      && typeof candidate.predecessorTaskId === 'string'
      && typeof candidate.successorTaskId === 'string'
      && typeof candidate.type === 'string'
      && DEPENDENCY_TYPES.has(candidate.type)
      && Number.isFinite(candidate.lagDays);
  }).slice(0, 100_000).map((dependency) => ({ ...dependency, lagDays: Math.max(-36_500, Math.min(36_500, Math.trunc(dependency.lagDays))) }));
}

function normalizedStatuses(value: unknown): TaskStatusDefinition[] {
  if (!Array.isArray(value)) return TASK_SYSTEM_STATUS_DEFINITIONS;
  const seen = new Set<string>();
  const result = value.filter((candidate): candidate is TaskStatusDefinition => {
    if (!isRecord(candidate)) return false;
    return typeof candidate.id === 'string'
      && candidate.id.length > 0
      && candidate.id.length <= 128
      && typeof candidate.label === 'string'
      && candidate.label.length <= 128
      && typeof candidate.mapsTo === 'string'
      && TASK_STATUSES.has(candidate.mapsTo)
      && Number.isFinite(candidate.order);
  }).slice(0, 256).filter((definition) => {
    if (seen.has(definition.id)) return false;
    seen.add(definition.id);
    return true;
  }).map((definition) => ({ ...definition, label: definition.label.trim(), order: Math.max(0, Math.min(255, Math.floor(definition.order))) }));
  return result;
}

function objectState<T extends object>(value: unknown): Partial<T> | undefined {
  return isRecord(value) ? value as Partial<T> : undefined;
}

function normalizeSafely<T>(normalize: () => T, fallback: T): T {
  try {
    return normalize();
  } catch {
    return fallback;
  }
}

export function readTasksOnlyDocumentData(document: WorkspaceDocument, now = document.modified_at || Date.now()): TasksOnlyDocumentData {
  const payload = recordFromDocument(document);
  const firstTaskProjectId = Array.isArray(payload.tasks)
    ? payload.tasks.map((task) => isRecord(task) ? stringValue(task.projectId) : undefined).find(Boolean)
    : undefined;
  const projectId = stringValue(payload.project && isRecord(payload.project) ? payload.project.id : undefined)
    ?? firstTaskProjectId
    ?? DEFAULT_TASK_PROJECT_ID;
  const sourceTasks = normalizedTasks(payload.tasks, projectId, now);
  const tasks = sourceTasks ?? normalizedTasks(DEFAULT_TASKS, DEFAULT_TASK_PROJECT_ID, now) ?? [];
  const dependencies = normalizedDependencies(payload.dependencies)
    ?? (sourceTasks === undefined ? DEFAULT_TASK_DEPENDENCIES : []);

  return {
    tasks,
    dependencies,
    projectId,
    taskStatusDefinitions: normalizedStatuses(payload.taskStatusDefinitions),
    taskOrganization: normalizeSafely(
      () => normalizeTaskOrganization(objectState<TaskOrganizationState>(payload.taskOrganization)),
      DEFAULT_TASK_ORGANIZATION,
    ),
    taskViewPreferences: normalizeSafely(
      () => normalizedTaskViewPreferences(objectState<TaskViewPreferences>(payload.taskViewPreferences)),
      normalizedTaskViewPreferences(),
    ),
    taskNotifications: normalizeSafely(
      () => normalizeTaskNotificationState(objectState<TaskNotificationState>(payload.taskNotifications)),
      DEFAULT_TASK_NOTIFICATION_STATE,
    ),
    taskCapture: normalizeSafely(
      () => normalizeTaskCaptureState(objectState<TaskCaptureState>(payload.taskCapture)),
      DEFAULT_TASK_CAPTURE_STATE,
    ),
    taskSharing: normalizeSafely(
      () => normalizeTaskSharingState(objectState<TaskSharingState>(payload.taskSharing)),
      DEFAULT_TASK_SHARING_STATE,
    ),
  };
}

export function updateTasksOnlyDocument(
  document: WorkspaceDocument,
  current: TasksOnlyDocumentData,
  patch: TasksOnlyDocumentPatch,
  now = Date.now(),
): WorkspaceDocument {
  const base = recordFromDocument(document);
  const next: TasksOnlyDocumentData = { ...current, ...patch };
  const payload: WorkManagementModel = {
    ...base,
    tasks: next.tasks,
    cards: Array.isArray(base.cards) ? base.cards : [],
    milestones: Array.isArray(base.milestones) ? base.milestones : [],
    dependencies: next.dependencies,
    taskStatusDefinitions: next.taskStatusDefinitions,
    taskOrganization: next.taskOrganization,
    taskViewPreferences: next.taskViewPreferences,
    taskNotifications: next.taskNotifications,
    taskCapture: next.taskCapture,
    taskSharing: next.taskSharing,
  };
  return {
    ...document,
    version: document.version + 1,
    modified_at: now,
    workManagementData: payload,
    objects: {
      ...document.objects,
      work_mgmt_payload: {
        type: 'TextBlock',
        data: {
          id: 'work_mgmt_payload',
          paragraphs: [{
            id: 'p-work-1',
            style: { alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 },
            spans: [{ text: JSON.stringify(payload) }],
          }],
        },
      },
    },
  };
}
