// STATUS: GOLD — Tasks-only Workspace source entry with canonical persistence and bounded history.
import React, { useMemo } from 'react';
import { CheckSquare } from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspaceCommon';
import type { TaskItem } from '../../../shared/contracts/work-management/workspaceWork';
import '../../../design-system/styles/AppThemeSelection.css';
import { TaskHistoryControls } from '../history/TaskHistoryControls';
import { TasksView } from '../views/TasksView';
import {
  applyTaskPatch,
  createTaskItem,
  toggleTaskCompletion,
} from '../model/taskModel';
import { appendImportedTaskBatch } from '../interchange/taskImportBatch';
import {
  checklistItemToSubtask,
  createChildTask,
  reparentTaskBatch,
  rollupTaskHierarchy,
  subtaskToChecklistItem,
  type SubtaskInheritance,
} from '../model/taskHierarchy';
import { createRecurringSuccessor, applyRecurrenceOperation } from '../recurrence/taskRecurrence';
import { DEFAULT_TASK_ORGANIZATION, normalizeTaskOrganization } from '../state/taskOrganization';
import { applyTaskBulkEdit } from '../views/taskViews';
import { applyTaskBoardMove } from '../views/taskBoardMove';
import { evaluateTaskCompletionGate } from '../dependencies/taskCompletionGate';
import { buildTaskNoteDocument, taskPatchForDerivedNote } from '../interchange/taskDerivedDocuments';
import type { RecurrenceOperation, RecurrenceScope } from '../recurrence/taskRecurrence';
import { useTaskDocumentHistory } from '../history/useTaskDocumentHistory';
import { readTasksOnlyDocumentData, updateTasksOnlyDocument } from '../persistence/tasksOnlyDocument';

export interface TasksOnlyManagementProps {
  document: WorkspaceDocument;
  onUpdateDocument: (document: WorkspaceDocument) => void;
  /**
   * AST-1001: the shell already provides these for every app; without them a task cannot be brought
   * into a note or report, and a stored link cannot be followed. Optional so an embedding host that
   * cannot create or open documents still works — the actions then fail with a visible reason
   * instead of pretending.
   */
  onCreateDerivedDocument?: (document: WorkspaceDocument) => void;
  documents?: WorkspaceDocument[];
  onOpenDocument?: (documentId: string) => void;
}

export const TasksOnlyManagement: React.FC<TasksOnlyManagementProps> = ({ document, onUpdateDocument, onCreateDerivedDocument, documents, onOpenDocument }) => {
  const history = useTaskDocumentHistory(document, onUpdateDocument);
  // One visible channel for actions that were refused, so no refusal is silent.
  const [actionNotice, setActionNotice] = React.useState<{ text: string; tone: 'error' | 'info' } | undefined>(undefined);
  const taskData = useMemo(
    () => readTasksOnlyDocumentData(document),
    [document.workManagementData, document.workData, document.objects, document.modified_at],
  );

  const persist = (patch: Parameters<typeof updateTasksOnlyDocument>[2]) => {
    history.commit(updateTasksOnlyDocument(document, taskData, patch));
  };

  /**
   * AST-1001: "Aufgabe als Live-Link in Notiz oder Bericht aufnehmen."
   *
   * Builds a real Notes document from the task (pure builder), hands it to the host, and records
   * the canonical page link back on the task so the reference is bidirectional. Every failure is a
   * named, visible reason — there is no success path that did not create a document.
   */
  const handleTakeTaskIntoNote = (taskId: string): string | undefined => {
    const task = taskData.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      setActionNotice({ text: 'That task no longer exists.', tone: 'error' });
      return 'That task no longer exists.';
    }
    if (!onCreateDerivedDocument) {
      const reason = 'This host cannot create a Notes document, so the task cannot be taken into a note.';
      setActionNotice({ text: reason, tone: 'error' });
      return reason;
    }
    try {
      const derived = buildTaskNoteDocument(task, document);
      onCreateDerivedDocument(derived.document);
      persist({ tasks: taskData.tasks.map((candidate) => candidate.id === task.id
        ? applyTaskPatch(candidate, taskPatchForDerivedNote(candidate, derived.pageUri), { actor: 'Local User', source: 'astraea.tasks.take-into-note' })
        : candidate) });
      const message = `Created note “${derived.document.title}” linked to this task.`;
      setActionNotice({ text: message, tone: 'info' });
      return undefined;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The note could not be created.';
      setActionNotice({ text: reason, tone: 'error' });
      return reason;
    }
  };

  const handleToggleTask = (id: string) => {
    const current = taskData.tasks.find((task) => task.id === id);
    if (!current) return;
    // D2 / W-406: a finish-constraining predecessor that is still open refuses the completion and
    // says which task is in the way, instead of closing blocked work silently.
    const gate = evaluateTaskCompletionGate(current, taskData.tasks, taskData.dependencies, !current.completed);
    if (!gate.allowed) {
      setActionNotice({ text: gate.reason ?? 'This task is still blocked by an open predecessor.', tone: 'error' });
      return;
    }
    setActionNotice(gate.advisory ? { text: gate.advisory, tone: 'info' } : undefined);
    const changed = toggleTaskCompletion(current, { actor: 'Local User', source: 'astraea.tasks.ui' });
    let tasks = taskData.tasks.map((task) => task.id === id ? changed : task);
    if (changed.completed) {
      const successor = createRecurringSuccessor(changed, tasks);
      if (successor) tasks = [...tasks, successor];
    }
    persist({ tasks: rollupTaskHierarchy(tasks, { actor: 'Local User', source: 'astraea.tasks.rollup' }) });
  };

  const handleAddTask = (input: {
    title: string;
    priority: 'low' | 'medium' | 'high';
    dueDate?: string;
    important?: boolean;
    myDayDate?: string;
    inbox?: boolean;
    listId?: string;
  }) => {
    if (!input.title.trim()) return;
    const actor = taskData.taskOrganization.localIdentity || DEFAULT_TASK_ORGANIZATION.localIdentity;
    const task = createTaskItem({ ...input, title: input.title.trim(), projectId: taskData.projectId }, {
      actor,
      source: 'astraea.tasks.quick-add',
    });
    persist({ tasks: [task, ...taskData.tasks] });
  };

  const handleImportTasks = (importedTasks: TaskItem[]) => {
    if (importedTasks.length === 0) return;
    const tasks = appendImportedTaskBatch(taskData.tasks, importedTasks, {
      actor: taskData.taskOrganization.localIdentity || DEFAULT_TASK_ORGANIZATION.localIdentity,
      source: 'astraea.tasks.import',
      defaultProjectId: taskData.projectId,
    });
    persist({ tasks });
  };

  const handleDeleteTask = (id: string) => {
    if (!taskData.tasks.some((task) => task.id === id)) return;
    const remaining = taskData.tasks
      .filter((task) => task.id !== id)
      .map((task) => task.parentTaskId === id ? { ...task, parentTaskId: undefined } : task);
    persist({
      tasks: rollupTaskHierarchy(remaining, { actor: 'Local User', source: 'astraea.tasks.delete-rollup' }),
      dependencies: taskData.dependencies.filter((dependency) => dependency.predecessorTaskId !== id && dependency.successorTaskId !== id),
    });
  };

  const handleAddSubtask = (parentTaskId: string, title: string, inheritance?: SubtaskInheritance) => {
    const parent = taskData.tasks.find((task) => task.id === parentTaskId);
    if (!parent || !title.trim()) return;
    const task = createChildTask(parent, title, inheritance, { actor: 'Local User', source: 'astraea.tasks.subtask' });
    persist({ tasks: rollupTaskHierarchy([...taskData.tasks, task], { actor: 'Local User', source: 'astraea.tasks.rollup' }) });
  };

  const handleChecklistToSubtask = (parentTaskId: string, checklistId: string, inheritance?: SubtaskInheritance) => {
    const parent = taskData.tasks.find((task) => task.id === parentTaskId);
    const checklistItem = parent?.checklist?.find((candidate) => candidate.id === checklistId);
    if (!parent || !checklistItem) return;
    const child = checklistItemToSubtask(parent, checklistItem, inheritance, { actor: 'Local User', source: 'astraea.tasks.checklist-to-subtask' });
    const updatedParent = applyTaskPatch(parent, {
      checklist: (parent.checklist ?? []).filter((candidate) => candidate.id !== checklistId),
    }, { actor: 'Local User', source: 'astraea.tasks.checklist-to-subtask' });
    const tasks = [...taskData.tasks.map((task) => task.id === parent.id ? updatedParent : task), child];
    persist({ tasks: rollupTaskHierarchy(tasks, { actor: 'Local User', source: 'astraea.tasks.rollup' }) });
  };

  const handleSubtaskToChecklist = (parentTaskId: string, childTaskId: string) => {
    const parent = taskData.tasks.find((task) => task.id === parentTaskId);
    const child = taskData.tasks.find((task) => task.id === childTaskId && task.parentTaskId === parentTaskId);
    if (!parent || !child || taskData.tasks.some((task) => task.parentTaskId === child.id)) return;
    const updatedParent = applyTaskPatch(parent, {
      checklist: [...(parent.checklist ?? []), subtaskToChecklistItem(child)],
    }, { actor: 'Local User', source: 'astraea.tasks.subtask-to-checklist' });
    const remaining = taskData.tasks
      .filter((task) => task.id !== child.id)
      .map((task) => task.id === parent.id ? updatedParent : task);
    persist({
      tasks: rollupTaskHierarchy(remaining, { actor: 'Local User', source: 'astraea.tasks.rollup' }),
      dependencies: taskData.dependencies.filter((dependency) => dependency.predecessorTaskId !== child.id && dependency.successorTaskId !== child.id),
    });
  };

  const handleReparentTasks = (taskIds: string[], parentTaskId?: string) => {
    const result = reparentTaskBatch(taskData.tasks, taskIds, parentTaskId, { actor: 'Local User', source: 'astraea.tasks.bulk-reparent' });
    if (result.ok) persist({ tasks: result.tasks });
  };

  const handleUpdateTask = (id: string, patch: Partial<TaskItem>) => {
    if (!taskData.tasks.some((task) => task.id === id)) return;
    const tasks = taskData.tasks.map((task) => task.id === id
      ? applyTaskPatch(task, patch, { actor: 'Local User', source: 'astraea.tasks.ui' }, taskData.taskStatusDefinitions)
      : task);
    persist({ tasks: rollupTaskHierarchy(tasks, { actor: 'Local User', source: 'astraea.tasks.rollup' }) });
  };

  const handleBulkEdit = (taskIds: string[], patch: Partial<TaskItem>): string | undefined => {
    const result = applyTaskBulkEdit(taskData.tasks, taskIds, patch, {
      actor: taskData.taskOrganization.localIdentity || DEFAULT_TASK_ORGANIZATION.localIdentity,
      source: 'astraea.tasks.bulk-edit',
    }, taskData.taskStatusDefinitions);
    if (!result.ok) return result.error;
    persist({ tasks: result.tasks });
    return undefined;
  };

  const handleCreateCapturedTask = (task: TaskItem) => {
    if (taskData.tasks.some((candidate) => candidate.id === task.id)) return;
    persist({ tasks: [task, ...taskData.tasks] });
  };

  /**
   * Board drag/keyboard move. The legality decision and the resulting patch come from the pure
   * core (views/taskBoardMove.ts); this handler only applies the patch through the canonical
   * mutation path and persists the board order.
   */
  const handleMoveTaskToColumn = (taskId: string, columnId: string, reportNotice = true): string | undefined => {
    const boardBy = taskData.taskViewPreferences.boardBy;
    const actor = taskData.taskOrganization.localIdentity || DEFAULT_TASK_ORGANIZATION.localIdentity;
    const moved = taskData.tasks.find((task) => task.id === taskId);
    if (!moved) return 'That task no longer exists.';
    // The completion gate has to hold on the board too, or a drag would be a way around the rule
    // that the checkbox enforces. Same pure decision, same message.
    if (boardBy === 'status' && columnId.startsWith('status:')) {
      const target = taskData.taskStatusDefinitions.find((definition) => definition.id === columnId.slice('status:'.length));
      const gate = evaluateTaskCompletionGate(moved, taskData.tasks, taskData.dependencies, target?.mapsTo === 'done');
      if (!gate.allowed) {
        const reason = gate.reason ?? 'This task is still blocked by an open predecessor.';
        // The board's own live region already announces whatever this returns.
        if (reportNotice) setActionNotice({ text: reason, tone: 'error' });
        return reason;
      }
    }
    const result = applyTaskBoardMove(
      taskData.tasks,
      [taskId],
      columnId,
      boardBy,
      (task, patch) => applyTaskPatch(task, patch, { actor, source: 'astraea.tasks.board-move' }, taskData.taskStatusDefinitions),
      taskData.taskStatusDefinitions,
    );
    if (!result.ok) {
      if (reportNotice) setActionNotice({ text: result.error ?? 'The move was refused.', tone: 'error' });
      return result.error;
    }
    if (!result.changedIds.length) return 'That card is already in this column.';
    setActionNotice(undefined);
    persist({ tasks: rollupTaskHierarchy(result.tasks, { actor, source: 'astraea.tasks.board-move-rollup' }) });
    return undefined;
  };

  /**
   * Board completion toggle: on a status board the checkbox must MOVE the card, so it delegates to
   * the move handler (which owns the completion gate) and does not also run the generic toggle —
   * that would toggle twice and land back where it started.
   */
  const handleToggleBoardTask = (id: string) => {
    const task = taskData.tasks.find((candidate) => candidate.id === id);
    if (!task) return;
    if (taskData.taskViewPreferences.boardBy === 'status') {
      const done = taskData.taskStatusDefinitions.find((definition) => definition.mapsTo === 'done');
      const open = taskData.taskStatusDefinitions.slice().sort((a, b) => a.order - b.order).find((definition) => definition.mapsTo !== 'done');
      if (done && open) {
        const target = task.completed ? open.id : done.id;
        handleMoveTaskToColumn(id, `status:${target}`);
        return;
      }
    }
    handleToggleTask(id);
  };

  const handleRecurrenceOperation = (
    taskId: string,
    operation: RecurrenceOperation,
    scope: RecurrenceScope,
    patch: Partial<TaskItem> = {},
  ) => {
    const actor = taskData.taskOrganization.localIdentity || DEFAULT_TASK_ORGANIZATION.localIdentity;
    const result = applyRecurrenceOperation(taskData.tasks, taskId, operation, scope, patch, {
      actor,
      source: `astraea.tasks.recurrence.${operation}.${scope}`,
    });
    const tasks = rollupTaskHierarchy(result.tasks, { actor, source: 'astraea.tasks.rollup' });
    if (tasks !== taskData.tasks) persist({ tasks });
  };

  return (
    <div data-vgt-app-theme-root="work-management" data-vgt-tasks-root="true" role="region" aria-label="Astraea Tasks" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0d14] text-slate-100">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] bg-slate-950/70 px-6 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400"><CheckSquare className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-wide text-slate-100">Astraea Tasks</h1>
            <p className="truncate text-[0.6875rem] text-slate-400">Canonical local task backlog</p>
          </div>
        </div>
        <TaskHistoryControls canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {actionNotice && (
          <p
            role={actionNotice.tone === 'error' ? 'alert' : 'status'}
            aria-live={actionNotice.tone === 'error' ? 'assertive' : 'polite'}
            data-task-action-notice={actionNotice.tone}
            className={`mb-4 rounded-xl border px-3 py-2 text-[0.6875rem] ${actionNotice.tone === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-cyan-500/25 bg-cyan-500/[0.07] text-cyan-200'}`}
          >
            {actionNotice.text}
          </p>
        )}
        {history.historyNotice && (
          <p
            role="alert"
            aria-live="assertive"
            data-task-history-notice
            className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.6875rem] text-amber-200"
          >
            {history.historyNotice}
          </p>
        )}
        <TasksView
          notificationDocumentId={document.id}
          tasks={taskData.tasks}
          dependencies={taskData.dependencies}
          organization={taskData.taskOrganization}
          onUpdateOrganization={(taskOrganization) => persist({ taskOrganization: normalizeTaskOrganization(taskOrganization) })}
          viewPreferences={taskData.taskViewPreferences}
          onUpdateViewPreferences={(taskViewPreferences) => persist({ taskViewPreferences })}
          statusDefinitions={taskData.taskStatusDefinitions}
          onUpdateStatusDefinitions={(taskStatusDefinitions) => persist({ taskStatusDefinitions })}
          onToggleTask={handleToggleTask}
          onAddTask={handleAddTask}
          onImportTasks={handleImportTasks}
          onDeleteTask={handleDeleteTask}
          onUpdateTask={handleUpdateTask}
          onAddSubtask={handleAddSubtask}
          onChecklistToSubtask={handleChecklistToSubtask}
          onSubtaskToChecklist={handleSubtaskToChecklist}
          onReparentTasks={handleReparentTasks}
          onRecurrenceOperation={handleRecurrenceOperation}
          onBulkEdit={handleBulkEdit}
          onMoveTaskToColumn={handleMoveTaskToColumn}
          onToggleBoardTask={handleToggleBoardTask}
          onTakeTaskIntoNote={handleTakeTaskIntoNote}
          documents={documents}
          onOpenDocument={onOpenDocument}
          currentDocumentId={document.id}
          notificationState={taskData.taskNotifications}
          onUpdateNotificationState={(taskNotifications) => persist({ taskNotifications })}
          captureState={taskData.taskCapture}
          onUpdateCaptureState={(taskCapture) => persist({ taskCapture })}
          onCreateCapturedTask={handleCreateCapturedTask}
          sharingState={taskData.taskSharing}
          onUpdateSharingState={(taskSharing) => persist({ taskSharing })}
        />
      </main>
    </div>
  );
};

export default TasksOnlyManagement;
