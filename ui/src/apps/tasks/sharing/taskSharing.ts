// STATUS: DIAMANT VGT SUPREME — local-first Tasks sharing/permission model
import type {
  TaskAccessRole,
  TaskItem,
  TaskListSharingRule,
  TaskPermissionCapability,
  TaskSharingState,
} from '../../../shared/contracts/work-management/workspaceWork';
import { createStableTaskId } from '../model/taskModel';

export const DEFAULT_TASK_SHARING_STATE: TaskSharingState = { rules: [], audit: [], offlineQueue: [] };
export const TASK_PERMISSION_AUDIT_MAX = 2_000;
export const TASK_OFFLINE_QUEUE_MAX = 1_000;

function cleanIdentity(value: string): string { return value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 192); }
function key(value: string): string { return cleanIdentity(value).toLocaleLowerCase(); }
function cloneRule(rule: TaskListSharingRule): TaskListSharingRule { return { ...rule, memberRoles: { ...rule.memberRoles } }; }

export function createPersonalTaskListRule(scopeId: string, ownerId: string): TaskListSharingRule {
  const cleanScope = cleanIdentity(scopeId); const cleanOwner = cleanIdentity(ownerId);
  if (!cleanScope || !cleanOwner) throw new Error('Task list scope and owner are required.');
  return { scopeId: cleanScope, visibility: 'personal', ownerId: cleanOwner, memberRoles: {} };
}

export function normalizeTaskSharingState(state?: Partial<TaskSharingState>): TaskSharingState {
  const seen = new Set<string>();
  const rules = (state?.rules ?? []).filter((rule) => {
    const scope = cleanIdentity(rule.scopeId); if (!scope || seen.has(scope)) return false; seen.add(scope); return true;
  }).slice(0, 500).map((rule) => ({ ...cloneRule(rule), scopeId: cleanIdentity(rule.scopeId), ownerId: cleanIdentity(rule.ownerId) }));
  return { rules, audit: (state?.audit ?? []).slice(-TASK_PERMISSION_AUDIT_MAX), offlineQueue: (state?.offlineQueue ?? []).slice(-TASK_OFFLINE_QUEUE_MAX) };
}

function audit(state: TaskSharingState, scopeId: string, actor: string, action: string, detail: string, now: number): TaskSharingState {
  return { ...state, audit: [...state.audit, { id: createStableTaskId('task-permission-audit'), at: now, actor: cleanIdentity(actor), action, scopeId, detail: detail.slice(0, 512) }].slice(-TASK_PERMISSION_AUDIT_MAX) };
}
function queue(state: TaskSharingState, scopeId: string, actor: string, operation: TaskSharingState['offlineQueue'][number]['operation'], now: number, offline: boolean): TaskSharingState {
  if (!offline) return state;
  return { ...state, offlineQueue: [...state.offlineQueue, { id: createStableTaskId('task-permission-queue'), at: now, actor: cleanIdentity(actor), scopeId, operation }].slice(-TASK_OFFLINE_QUEUE_MAX) };
}
function replaceRule(state: TaskSharingState, rule: TaskListSharingRule): TaskSharingState {
  const exists = state.rules.some((candidate) => candidate.scopeId === rule.scopeId);
  return { ...state, rules: exists ? state.rules.map((candidate) => candidate.scopeId === rule.scopeId ? rule : candidate) : [...state.rules, rule] };
}
export function taskSharingRule(state: TaskSharingState, scopeId: string, ownerId: string): TaskListSharingRule {
  return cloneRule(state.rules.find((rule) => rule.scopeId === scopeId) ?? createPersonalTaskListRule(scopeId, ownerId));
}

export function setTaskListShared(state: TaskSharingState, scopeId: string, actor: string, shared: boolean, offline = true, now = Date.now()): TaskSharingState {
  const rule = taskSharingRule(state, scopeId, actor);
  if (key(rule.ownerId) !== key(actor)) throw new Error('Only the list owner can change sharing mode.');
  rule.visibility = shared ? 'shared' : 'personal';
  if (!shared) rule.memberRoles = {};
  let next = replaceRule(state, rule);
  next = audit(next, scopeId, actor, shared ? 'list_shared' : 'list_personal', shared ? 'List changed to shared.' : 'List changed to personal.', now);
  return queue(next, scopeId, actor, shared ? 'share' : 'unshare', now, offline);
}

export function setTaskListMemberRole(state: TaskSharingState, scopeId: string, actor: string, memberId: string, role: Exclude<TaskAccessRole, 'owner' | 'assignee'>, offline = true, now = Date.now()): TaskSharingState {
  const rule = taskSharingRule(state, scopeId, actor);
  if (key(rule.ownerId) !== key(actor)) throw new Error('Only the owner can edit task-list roles.');
  if (rule.visibility !== 'shared') throw new Error('Personal lists cannot have member roles.');
  const member = cleanIdentity(memberId); if (!member || key(member) === key(rule.ownerId)) throw new Error('Invalid member identity.');
  rule.memberRoles[member] = role;
  let next = replaceRule(state, rule);
  next = audit(next, scopeId, actor, 'member_role_changed', `${member} -> ${role}`, now);
  return queue(next, scopeId, actor, 'role', now, offline);
}

export function effectiveTaskAccessRole(rule: TaskListSharingRule, identity: string, task?: TaskItem): TaskAccessRole | undefined {
  if (key(identity) === key(rule.ownerId)) return 'owner';
  if (rule.visibility === 'personal') return undefined;
  const direct = Object.entries(rule.memberRoles).find(([member]) => key(member) === key(identity))?.[1];
  if (direct) return direct;
  const assigned = task && (task.assignees ?? (task.assignee ? [task.assignee] : [])).some((member) => key(member) === key(identity));
  return assigned ? 'assignee' : undefined;
}

const capabilities: Record<TaskAccessRole, TaskPermissionCapability[]> = {
  owner: ['view', 'comment', 'edit', 'manage_sharing'], assignee: ['view', 'comment', 'edit'], editor: ['view', 'comment', 'edit'], commenter: ['view', 'comment'], viewer: ['view'],
};
export function taskRoleCan(role: TaskAccessRole | undefined, capability: TaskPermissionCapability): boolean { return Boolean(role && capabilities[role].includes(capability)); }

export function transferTaskListOwnership(state: TaskSharingState, scopeId: string, actor: string, newOwnerId: string, offline = true, now = Date.now()): TaskSharingState {
  const rule = taskSharingRule(state, scopeId, actor);
  if (key(rule.ownerId) !== key(actor)) throw new Error('Only the current owner can transfer ownership.');
  const newOwner = cleanIdentity(newOwnerId); if (!newOwner || key(newOwner) === key(actor)) throw new Error('A distinct new owner is required.');
  rule.memberRoles[rule.ownerId] = 'editor'; delete rule.memberRoles[newOwner]; rule.ownerId = newOwner; rule.visibility = 'shared';
  let next = replaceRule(state, rule); next = audit(next, scopeId, actor, 'ownership_transferred', `Ownership transferred to ${newOwner}.`, now);
  return queue(next, scopeId, actor, 'owner_transfer', now, offline);
}

export function flushTaskPermissionOfflineQueue(state: TaskSharingState, acknowledgedIds: string[]): TaskSharingState {
  const acknowledged = new Set(acknowledgedIds); return { ...state, offlineQueue: state.offlineQueue.filter((item) => !acknowledged.has(item.id)) };
}
