// STATUS: DIAMANT VGT SUPREME
import type { TaskItem } from '../../../shared/contracts/work-management/workspaceWork';
import {
  createStableTaskId,
  isValidTaskId,
  normalizeTaskItem,
  type TaskMutationContext,
} from '../model/taskModel';

export interface ImportedTaskBatchContext extends TaskMutationContext {
  defaultProjectId?: string;
}

/** Appends a validated import as one identity-safe batch without rebuilding task records from a quick-add form. */
export function appendImportedTaskBatch(
  existingTasks: TaskItem[],
  importedTasks: TaskItem[],
  context: ImportedTaskBatchContext = {},
): TaskItem[] {
  if (importedTasks.length === 0) return existingTasks;
  const actor = context.actor?.trim() || 'Local User';
  const source = context.source?.trim() || 'astraea.tasks';
  const now = context.now ?? Date.now();
  const existingTaskIds = new Set(existingTasks.map((task) => task.id));
  const incomingTaskIds = new Set<string>();

  for (const task of importedTasks) {
    const sourceId = task.id.trim();
    if (!sourceId || incomingTaskIds.has(sourceId)) {
      throw new Error('Imported task identifiers must be present and unique.');
    }
    incomingTaskIds.add(sourceId);
  }

  const reservedTaskIds = new Set([...existingTaskIds, ...incomingTaskIds]);
  const nextTaskId = (): string => {
    let candidate = createStableTaskId('task-import');
    while (reservedTaskIds.has(candidate)) candidate = createStableTaskId('task-import');
    reservedTaskIds.add(candidate);
    return candidate;
  };
  const taskIdMap = new Map<string, string>();
  for (const task of importedTasks) {
    const sourceId = task.id.trim();
    const targetId = isValidTaskId(sourceId) && !existingTaskIds.has(sourceId) ? sourceId : nextTaskId();
    taskIdMap.set(sourceId, targetId);
    reservedTaskIds.add(targetId);
  }

  const existingSeriesIds = new Set(existingTasks.flatMap((task) => task.recurrenceSeriesId?.trim() ? [task.recurrenceSeriesId.trim()] : []));
  const incomingSeriesIds = new Set(importedTasks.flatMap((task) => task.recurrenceSeriesId?.trim() ? [task.recurrenceSeriesId.trim()] : []));
  const reservedSeriesIds = new Set([...existingSeriesIds, ...incomingSeriesIds]);
  const nextSeriesId = (): string => {
    let candidate = createStableTaskId('task-series-import');
    while (reservedSeriesIds.has(candidate)) candidate = createStableTaskId('task-series-import');
    reservedSeriesIds.add(candidate);
    return candidate;
  };
  const seriesIdMap = new Map<string, string>();
  for (const sourceId of incomingSeriesIds) {
    const taskTargetId = taskIdMap.get(sourceId);
    const collidesWithLocalIdentity = existingSeriesIds.has(sourceId) || existingTaskIds.has(sourceId);
    const targetId = taskTargetId ?? (collidesWithLocalIdentity ? nextSeriesId() : sourceId);
    seriesIdMap.set(sourceId, targetId);
    reservedSeriesIds.add(targetId);
  }

  const appendedTasks = importedTasks.map((task) => {
    const sourceSeriesId = task.recurrenceSeriesId?.trim();
    const recurrenceSeriesId = sourceSeriesId ? seriesIdMap.get(sourceSeriesId) : undefined;
    const seriesWasRemapped = Boolean(sourceSeriesId && recurrenceSeriesId !== sourceSeriesId);
    const recurrenceAnchor = task.dueAt ?? task.dueDate ?? task.startAt ?? task.startDate;
    return normalizeTaskItem({
      ...task,
      id: taskIdMap.get(task.id.trim())!,
      // Imported references resolve only within this validated batch. Retaining an
      // unresolved foreign ID could accidentally bind to an unrelated local task.
      parentTaskId: task.parentTaskId ? taskIdMap.get(task.parentTaskId.trim()) : undefined,
      generatedFromTaskId: task.generatedFromTaskId ? taskIdMap.get(task.generatedFromTaskId.trim()) : undefined,
      recurrenceSeriesId,
      occurrenceKey: seriesWasRemapped && recurrenceAnchor
        ? `${recurrenceSeriesId}:${Math.max(0, Math.floor(task.recurrenceIndex ?? 0))}:${recurrenceAnchor}`
        : task.occurrenceKey,
      projectId: task.projectId ?? context.defaultProjectId,
      updatedAt: now,
      updatedBy: actor,
      source,
    }, { now, actor, source });
  });

  return [...existingTasks, ...appendedTasks];
}
