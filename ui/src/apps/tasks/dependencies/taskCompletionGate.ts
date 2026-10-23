// STATUS: DIAMANT VGT SUPREME — dependency gate for task completion (pure)
//
// AST-0974 / W-406. Before this module the app could only ANNOUNCE the positive case
// (`taskNotifications.dependencyUnblocked` → "Dependency unblocked"). Completing a task whose
// predecessor was still open was neither refused nor warned, so the dependency graph was
// decorative in exactly the direction where it matters: you could close work that was still
// blocked.
//
// Edge semantics (single definition, stated once):
//   FS  finish-to-start  — the predecessor must finish before the successor finishes. HARD gate.
//   FF  finish-to-finish — the successor may not finish before the predecessor finishes. HARD gate.
//   SF  start-to-finish  — the predecessor must have started before the successor finishes. The
//                          model has no "started" flag, so a completed predecessor is the only
//                          honest test available; treated as a HARD gate.
//   SS  start-to-start   — constrains the START, not the finish. Advisory only: warned, never
//                          refused, because refusing would block work that is legitimately running.
import type { ProjectDependency, TaskItem } from '../../../shared/contracts/workspace';

export interface TaskCompletionBlocker {
  id: string;
  title: string;
  type: ProjectDependency['type'];
  /** Hard blockers refuse the completion; advisory ones only warn. */
  severity: 'blocking' | 'advisory';
}

export interface TaskCompletionGate {
  /** True when the task may be marked complete. */
  allowed: boolean;
  /** Hard blockers only. */
  blockingTaskIds: string[];
  blockers: TaskCompletionBlocker[];
  /** One human-readable sentence naming the hard blockers, or undefined when allowed. */
  reason?: string;
  /** A warning for the advisory (SS) case, shown when the completion is still allowed. */
  advisory?: string;
}

const ALLOWED: TaskCompletionGate = { allowed: true, blockingTaskIds: [], blockers: [] };

/** FS/FF/SF constrain the finish; SS constrains the start only. */
function severityFor(type: ProjectDependency['type']): TaskCompletionBlocker['severity'] {
  return type === 'SS' ? 'advisory' : 'blocking';
}

/**
 * Decides whether `task` may be completed given the project dependency graph.
 *
 * A predecessor counts when the edge points at this task as successor, the predecessor is a
 * different task that still exists, and that predecessor is not complete. A task may always be
 * reopened: this gate never blocks `completed: false`.
 */
export function evaluateTaskCompletionGate(
  task: TaskItem,
  tasks: TaskItem[],
  dependencies: ProjectDependency[],
  nextCompleted: boolean,
): TaskCompletionGate {
  if (!nextCompleted) return ALLOWED;

  const blockers: TaskCompletionBlocker[] = [];
  for (const dependency of dependencies) {
    if (dependency.successorTaskId !== task.id) continue;
    const predecessorId = dependency.predecessorTaskId;
    if (!predecessorId || predecessorId === task.id) continue;
    const predecessor = tasks.find((candidate) => candidate.id === predecessorId);
    // A predecessor that no longer exists cannot block work; a dangling edge is not a gate.
    if (!predecessor || predecessor.completed) continue;
    if (blockers.some((entry) => entry.id === predecessorId)) continue;
    blockers.push({ id: predecessorId, title: predecessor.title, type: dependency.type, severity: severityFor(dependency.type) });
  }

  const hard = blockers.filter((entry) => entry.severity === 'blocking');
  const advisory = blockers.filter((entry) => entry.severity === 'advisory');
  const advisoryText = advisory.length
    ? ` Note: ${advisory.length === 1 ? `"${advisory[0].title}" has` : `${advisory.length} start-to-start predecessors have`} not finished; this task starts while they are still open.`
    : undefined;

  if (!hard.length) {
    return advisoryText
      ? { allowed: true, blockingTaskIds: [], blockers, advisory: advisoryText.trim() }
      : { allowed: true, blockingTaskIds: [], blockers };
  }
  const titles = hard.map((entry) => entry.title);
  return {
    allowed: false,
    blockingTaskIds: hard.map((entry) => entry.id),
    blockers,
    reason: hard.length === 1
      ? `Cannot complete yet: "${titles[0]}" must finish first.`
      : `Cannot complete yet: ${hard.length} predecessors must finish first (${titles.join(', ')}).`,
    advisory: advisoryText?.trim(),
  };
}

/** Unfinished predecessors regardless of edge type — feeds the visible warning list. */
export function openPredecessors(
  task: TaskItem,
  tasks: TaskItem[],
  dependencies: ProjectDependency[],
): TaskCompletionBlocker[] {
  const result: TaskCompletionBlocker[] = [];
  for (const dependency of dependencies) {
    if (dependency.successorTaskId !== task.id) continue;
    const predecessor = tasks.find((candidate) => candidate.id === dependency.predecessorTaskId);
    if (!predecessor || predecessor.completed || predecessor.id === task.id) continue;
    if (result.some((entry) => entry.id === predecessor.id)) continue;
    result.push({ id: predecessor.id, title: predecessor.title, type: dependency.type, severity: severityFor(dependency.type) });
  }
  return result;
}
