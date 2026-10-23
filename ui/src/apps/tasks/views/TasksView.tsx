// STATUS: PLATIN — canonical task list + personal organization with theme-aware workspace controls
import React, { useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Cpu,
  Filter,
  Plus,
  Search,
} from 'lucide-react';
import type {
  TaskFilterDefinition,
  TaskItem,
  TaskOrganizationState,
  ProjectDependency,
  TaskStatusDefinition,
  TaskViewPreferences,
  TaskNotificationState,
  TaskCaptureState,
  TaskSharingState,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import { TaskDetailDrawer } from '../details/TaskDetailDrawer';
import { TaskOrganizationPanel } from '../organization/TaskOrganizationPanel';
import { TaskRoundtripModal } from '../interchange/TaskRoundtripModal';
import { TaskStatusManager } from '../status/TaskStatusManager';
import { TaskViewsPanel } from './TaskViewsPanel';
import { TaskNotificationCenter } from '../notifications/TaskNotificationCenter';
import { TaskCapturePanel } from '../capture/TaskCapturePanel';
import { TaskSharingPanel } from '../sharing/TaskSharingPanel';
import '../../../design-system/styles/AppThemeSelection.css';
import {
  filterTasksForSelection,
  organizationPatchForSelection,
  type TaskOrganizationSelection,
} from '../state/taskOrganization';
import type { SubtaskInheritance } from '../model/taskHierarchy';
import type { RecurrenceOperation, RecurrenceScope } from '../recurrence/taskRecurrence';

interface TasksViewProps {
  notificationDocumentId: string;
  tasks: TaskItem[];
  dependencies: ProjectDependency[];
  onToggleTask: (id: string) => void;
  onAddTask: (task: {
    title: string;
    priority: 'low' | 'medium' | 'high';
    dueDate?: string;
    important?: boolean;
    myDayDate?: string;
    inbox?: boolean;
    listId?: string;
  }) => void;
  onImportTasks: (tasks: TaskItem[]) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<TaskItem>) => void;
  onAddSubtask: (parentTaskId: string, title: string, inheritance?: SubtaskInheritance) => void;
  onChecklistToSubtask: (parentTaskId: string, checklistId: string, inheritance?: SubtaskInheritance) => void;
  onSubtaskToChecklist: (parentTaskId: string, childTaskId: string) => void;
  onReparentTasks: (taskIds: string[], parentTaskId?: string) => void;
  onRecurrenceOperation: (taskId: string, operation: RecurrenceOperation, scope: RecurrenceScope, patch?: Partial<TaskItem>) => void;
  statusDefinitions: TaskStatusDefinition[];
  onUpdateStatusDefinitions: (definitions: TaskStatusDefinition[]) => void;
  organization: TaskOrganizationState;
  onUpdateOrganization: (organization: TaskOrganizationState) => void;
  viewPreferences: TaskViewPreferences;
  onUpdateViewPreferences: (preferences: TaskViewPreferences) => void;
  onBulkEdit: (taskIds: string[], patch: Partial<TaskItem>) => string | undefined;
  onMoveTaskToColumn: (taskId: string, columnId: string) => string | undefined;
  onToggleBoardTask: (id: string) => void;
  /** AST-1001: create a Notes document from a task and record the link back on it. */
  onTakeTaskIntoNote: (taskId: string) => string | undefined;
  /** AST-1001: the workspace documents a task can be linked to, and the shell's own navigator. */
  documents?: WorkspaceDocument[];
  onOpenDocument?: (documentId: string) => void;
  currentDocumentId?: string;
  notificationState: TaskNotificationState;
  onUpdateNotificationState: (state: TaskNotificationState) => void;
  captureState: TaskCaptureState;
  onUpdateCaptureState: (state: TaskCaptureState) => void;
  onCreateCapturedTask: (task: TaskItem) => void;
  sharingState: TaskSharingState;
  onUpdateSharingState: (state: TaskSharingState) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  notificationDocumentId,
  tasks,
  dependencies,
  onToggleTask,
  onAddTask,
  onImportTasks,
  onUpdateTask,
  onAddSubtask,
  onChecklistToSubtask,
  onSubtaskToChecklist,
  onReparentTasks,
  onRecurrenceOperation,
  statusDefinitions,
  onUpdateStatusDefinitions,
  organization,
  onUpdateOrganization,
  viewPreferences,
  onUpdateViewPreferences,
  onBulkEdit,
  onMoveTaskToColumn,
  onToggleBoardTask,
  onTakeTaskIntoNote,
  documents,
  onOpenDocument,
  currentDocumentId,
  notificationState,
  onUpdateNotificationState,
  captureState,
  onUpdateCaptureState,
  onCreateCapturedTask,
  sharingState,
  onUpdateSharingState,
}) => {
  const [taskSearch, setTaskSearch] = useState('');
  const [taskFilterStatus, setTaskFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [taskFilterPriority, setTaskFilterPriority] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [organizationSelection, setOrganizationSelection] = useState<TaskOrganizationSelection>('builtin:all');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isRoundtripModalOpen, setIsRoundtripModalOpen] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement | null>(null);

  const currentFilter = useMemo<TaskFilterDefinition>(() => ({
    text: taskSearch.trim() || undefined,
    priorities: taskFilterPriority === 'all' ? undefined : [taskFilterPriority],
    completed: taskFilterStatus === 'all' ? undefined : taskFilterStatus === 'completed',
  }), [taskSearch, taskFilterPriority, taskFilterStatus]);

  const organizationTasks = useMemo(
    () => filterTasksForSelection(tasks, organizationSelection, organization, undefined, statusDefinitions),
    [tasks, organizationSelection, organization, statusDefinitions],
  );

  const completedTaskCount = tasks.filter((task) => task.completed).length;
  const taskProgressPercent = tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0;
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;

  const handleSubmitNewTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    onAddTask({
      title: newTaskTitle.trim(),
      priority: newTaskPriority,
      dueDate: newTaskDueDate || undefined,
      ...organizationPatchForSelection(organizationSelection),
    });
    setNewTaskTitle('');
    setNewTaskDueDate('');
    // Acceptance for quick add: "Titel tippen, Enter speichern, Fokus bleibt für nächste Aufgabe."
    // Submitting with the mouse moved focus to the submit button, so the caret is returned to the
    // title field explicitly instead of relying on the browser keeping it there.
    quickAddInputRef.current?.focus();
  };

  return (
    <div data-vgt-app-theme-root="tasks" className="max-w-4xl mx-auto space-y-6">
      <div className="bg-slate-900/60 border border-white/[0.08] rounded-2xl p-5 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center space-x-2">
              <CheckSquare data-vgt-theme-accent-label="true" className="w-4 h-4" />
              <span>Sovereign Action Items</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Canonical local task backlog with due dates and assignments</p>
          </div>
          <div className="flex items-center space-x-4">
            <button type="button" onClick={() => setIsRoundtripModalOpen(true)} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 text-xs font-medium transition-colors" title="Interoperability, Sync & Roundtrip Suite">
              <Cpu className="w-3.5 h-3.5" /><span>Interoperability & Sync</span>
            </button>
            <div className="text-right"><span className="text-xs text-slate-400 font-medium">Completion Rate</span><p data-vgt-theme-accent-label="true" className="text-lg font-bold">{taskProgressPercent}%</p></div>
            <div className="w-24 bg-[var(--vgt-control-surface)] h-2.5 rounded-full overflow-hidden border border-[var(--vgt-control-border)]"><div className="bg-[var(--vgt-accent-solid)] h-full transition-all duration-300" style={{ width: `${taskProgressPercent}%` }} /></div>
          </div>
        </div>

        <form onSubmit={handleSubmitNewTask} className="mt-5 pt-5 border-t border-white/[0.08] flex flex-wrap gap-2.5 items-center">
          <input ref={quickAddInputRef} aria-label="New task title" data-vgt-app-guide-anchor="Tasks:first" type="text" placeholder="New task title..." value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} className="vgt-input flex-1 min-w-[240px] text-xs" />
          <div className="flex items-center space-x-2">
            <select aria-label="New task priority" value={newTaskPriority} onChange={(event) => setNewTaskPriority(event.target.value as 'low' | 'medium' | 'high')} className="vgt-input text-xs">
              <option value="low">Low Priority</option><option value="medium">Medium Priority</option><option value="high">High Priority</option>
            </select>
            <input aria-label="Task due date" type="date" value={newTaskDueDate} onChange={(event) => setNewTaskDueDate(event.target.value)} className="vgt-input text-xs" />
            <button type="submit" disabled={!newTaskTitle.trim()} data-vgt-app-guide-anchor="Tasks:second" data-vgt-theme-active-control="solid" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-[var(--vgt-control-disabled-opacity)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2"><Plus className="w-3.5 h-3.5" /><span>Add Task</span></button>
          </div>
        </form>
      </div>

      <TaskOrganizationPanel tasks={tasks} organization={organization} statusDefinitions={statusDefinitions} selection={organizationSelection} currentFilter={currentFilter} onSelect={setOrganizationSelection} onChange={onUpdateOrganization} />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/30 p-2 rounded-xl border border-white/[0.05]">
        <div className="flex items-center gap-2 w-full sm:w-64">
          <Search aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <input aria-label="Filter tasks" type="text" placeholder="Filter tasks..." value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} className="vgt-input min-w-0 flex-1 text-xs" />
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <div className="flex bg-slate-950/70 p-0.5 rounded-lg border border-white/10 text-xs">
            {(['all', 'pending', 'completed'] as const).map((status) => (
              <button key={status} type="button" aria-pressed={taskFilterStatus === status} data-vgt-theme-active-control={taskFilterStatus === status ? 'soft' : undefined} onClick={() => setTaskFilterStatus(status)} className={`px-2.5 py-1 rounded-md text-[0.6875rem] font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${taskFilterStatus === status ? 'shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
                {status === 'all' ? `All (${organizationTasks.length})` : status === 'pending' ? 'Pending' : 'Done'}
              </button>
            ))}
          </div>
          <select aria-label="Filter by task priority" value={taskFilterPriority} onChange={(event) => setTaskFilterPriority(event.target.value as 'all' | 'high' | 'medium' | 'low')} className="vgt-input text-[0.6875rem]">
            <option value="all">Any Priority</option><option value="high">High Priority</option><option value="medium">Medium Priority</option><option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      <TaskStatusManager tasks={tasks} definitions={statusDefinitions} onChange={onUpdateStatusDefinitions} />

      <TaskNotificationCenter
        documentId={notificationDocumentId}
        tasks={tasks}
        dependencies={dependencies}
        localIdentity={organization.localIdentity}
        state={notificationState}
        onChange={onUpdateNotificationState}
      />

      <TaskCapturePanel
        tasks={tasks}
        state={captureState}
        localIdentity={organization.localIdentity}
        onChangeState={onUpdateCaptureState}
        onCreateTask={onCreateCapturedTask}
      />

      <TaskSharingPanel organization={organization} state={sharingState} onChange={onUpdateSharingState} />

      <TaskViewsPanel
        tasks={organizationTasks}
        preferences={viewPreferences}
        statusDefinitions={statusDefinitions}
        externalFilter={currentFilter}
        onChangePreferences={onUpdateViewPreferences}
        onToggleTask={onToggleTask}
        onOpenTask={setSelectedTaskId}
        onBulkEdit={onBulkEdit}
        onMoveTaskToColumn={onMoveTaskToColumn}
        onToggleBoardTask={onToggleBoardTask}
      />

      {selectedTask && <TaskDetailDrawer selectedTask={selectedTask} tasks={tasks} dependencies={dependencies} organization={organization} onClose={() => setSelectedTaskId(null)} onUpdateTask={onUpdateTask} onToggleTask={onToggleTask} onSelectTask={setSelectedTaskId} onAddSubtask={onAddSubtask} onChecklistToSubtask={onChecklistToSubtask} onSubtaskToChecklist={onSubtaskToChecklist} onReparentTasks={onReparentTasks} onRecurrenceOperation={onRecurrenceOperation} statusDefinitions={statusDefinitions} onTakeTaskIntoNote={onTakeTaskIntoNote} documents={documents} onOpenDocument={onOpenDocument} currentDocumentId={currentDocumentId} />}

      <TaskRoundtripModal isOpen={isRoundtripModalOpen} onClose={() => setIsRoundtripModalOpen(false)} tasks={tasks} onImportTasks={(imported) => onImportTasks(
        imported.map((task) => ({ ...task, ...organizationPatchForSelection(organizationSelection) })),
      )} />
    </div>
  );
};
