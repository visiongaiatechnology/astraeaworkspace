// STATUS: DIAMANT VGT SUPREME — canonical Tasks details, hierarchy and collaboration
import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CornerDownRight,
  ListChecks,
  Trash2,
  X,
} from 'lucide-react';
import type { ProjectDependency, TaskItem, TaskOrganizationState, TaskStatusDefinition, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../../creativePersonalLocale';
import { TaskCollaborationPanel } from '../collaboration/TaskCollaborationPanel';
import { TaskCommentsPanel } from '../comments/TaskCommentsPanel';
import { TaskCoreFields } from '../editor/TaskCoreFields';
import { TaskDependencyPanel } from '../dependencies/TaskDependencyPanel';
import { TaskRecurrencePanel } from '../recurrence/TaskRecurrencePanel';
import { canAssignTaskParent } from '../model/taskModel';
import type { RecurrenceOperation, RecurrenceScope } from '../recurrence/taskRecurrence';
import {
  createChecklistItem,
  DEFAULT_SUBTASK_INHERITANCE,
  type SubtaskInheritance,
} from '../model/taskHierarchy';

export interface TaskDetailDrawerProps {
  selectedTask: TaskItem;
  tasks: TaskItem[];
  dependencies: ProjectDependency[];
  onClose: () => void;
  onUpdateTask: (id: string, patch: Partial<TaskItem>) => void;
  onToggleTask: (id: string) => void;
  onSelectTask: (id: string) => void;
  onAddSubtask: (parentTaskId: string, title: string, inheritance?: SubtaskInheritance) => void;
  onChecklistToSubtask: (parentTaskId: string, checklistId: string, inheritance?: SubtaskInheritance) => void;
  onSubtaskToChecklist: (parentTaskId: string, childTaskId: string) => void;
  onReparentTasks: (taskIds: string[], parentTaskId?: string) => void;
  onRecurrenceOperation: (taskId: string, operation: RecurrenceOperation, scope: RecurrenceScope, patch?: Partial<TaskItem>) => void;
  statusDefinitions: TaskStatusDefinition[];
  organization: TaskOrganizationState;
  /** AST-1001: take this task into a Notes document as a live link. */
  onTakeTaskIntoNote?: (taskId: string) => string | undefined;
  /** AST-1001: documents a task can be linked to, and the shell's own navigator. */
  documents?: WorkspaceDocument[];
  onOpenDocument?: (documentId: string) => void;
  currentDocumentId?: string;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  selectedTask,
  tasks,
  dependencies,
  onClose,
  onUpdateTask,
  onToggleTask,
  onSelectTask,
  onAddSubtask,
  onChecklistToSubtask,
  onSubtaskToChecklist,
  onReparentTasks,
  onRecurrenceOperation,
  statusDefinitions,
  organization,
  onTakeTaskIntoNote,
  documents,
  onOpenDocument,
  currentDocumentId,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(message, locale);
  const [checklistDraft, setChecklistDraft] = useState('');
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtasksExpanded, setSubtasksExpanded] = useState(true);
  const [selectedSubtaskIds, setSelectedSubtaskIds] = useState<string[]>([]);
  const [reparentTarget, setReparentTarget] = useState('__root__');
  const [inheritance, setInheritance] = useState<SubtaskInheritance>(DEFAULT_SUBTASK_INHERITANCE);

  const children = useMemo(
    () => tasks.filter((task) => task.parentTaskId === selectedTask.id),
    [tasks, selectedTask.id],
  );
  const possibleParents = useMemo(
    () => tasks.filter((candidate) =>
      !selectedSubtaskIds.includes(candidate.id)
      && selectedSubtaskIds.every((id) => canAssignTaskParent(tasks, id, candidate.id))),
    [tasks, selectedSubtaskIds],
  );

  const addChecklist = () => {
    if (!checklistDraft.trim()) return;
    onUpdateTask(selectedTask.id, {
      checklist: [...(selectedTask.checklist ?? []), createChecklistItem(checklistDraft)],
    });
    setChecklistDraft('');
  };

  const addSubtask = () => {
    if (!subtaskDraft.trim()) return;
    onAddSubtask(selectedTask.id, subtaskDraft.trim(), inheritance);
    setSubtaskDraft('');
  };

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/80 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-950/70">
        <div><div className="text-xs font-semibold text-slate-100">{t('Task Details')}</div><div className="text-[0.625rem] font-mono text-blue-300 mt-0.5">{selectedTask.id}</div></div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10" aria-label={t('Close')} title={t('Close')}><X className="w-4 h-4" /></button>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <TaskCoreFields task={selectedTask} organization={organization} statusDefinitions={statusDefinitions} onUpdate={(patch) => onUpdateTask(selectedTask.id, patch)} />

        <TaskRecurrencePanel
          task={selectedTask}
          onUpdateOccurrence={(patch) => onUpdateTask(selectedTask.id, patch)}
          onModifySeries={(patch) => onRecurrenceOperation(selectedTask.id, 'modify', 'series', patch)}
          onOperation={(operation, scope) => onRecurrenceOperation(selectedTask.id, operation, scope)}
        />

        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1"><ListChecks className="w-3 h-3" /> {t('Checklist')}</span>
            <span className="text-[0.625rem] text-slate-500">{(selectedTask.checklist ?? []).filter((item) => item.completed).length}/{(selectedTask.checklist ?? []).length}</span>
          </div>
          <div className="space-y-1.5">
            {(selectedTask.checklist ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-2">
                <input type="checkbox" checked={item.completed} onChange={() => onUpdateTask(selectedTask.id, { checklist: (selectedTask.checklist ?? []).map((candidate) => candidate.id === item.id ? { ...candidate, completed: !candidate.completed } : candidate) })} />
                <input value={item.title} onChange={(event) => onUpdateTask(selectedTask.id, { checklist: (selectedTask.checklist ?? []).map((candidate) => candidate.id === item.id ? { ...candidate, title: event.target.value } : candidate) })} className={`flex-1 bg-transparent outline-none ${item.completed ? 'line-through text-slate-500' : 'text-slate-200'}`} />
                <button type="button" onClick={() => onChecklistToSubtask(selectedTask.id, item.id, inheritance)} className="px-2 py-1 rounded border border-indigo-500/20 text-[0.5625rem] text-indigo-300 hover:bg-indigo-500/10" title={t('Convert checklist item to canonical subtask')}>{t('To subtask')}</button>
                <button aria-label={t('Delete checklist item')} type="button" onClick={() => onUpdateTask(selectedTask.id, { checklist: (selectedTask.checklist ?? []).filter((candidate) => candidate.id !== item.id) })} className="p-1 text-slate-500 hover:text-rose-400"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
          <input value={checklistDraft} onChange={(event) => setChecklistDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChecklist(); } }} placeholder={t('Add checklist item...')} className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
            <button type="button" onClick={addChecklist} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold">{t('Add')}</button>
          </div>
        </div>

        <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-950/55 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setSubtasksExpanded((value) => !value)} className="text-slate-300 font-semibold flex items-center gap-1.5">
              {subtasksExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}<CornerDownRight className="w-3.5 h-3.5 text-indigo-400" /> {t('Subtasks')}
            </button>
            <span className="text-[0.625rem] text-slate-500">{children.length} {t('linked work item(s)')}</span>
          </div>

          {subtasksExpanded && <>
            <div className="space-y-1.5">
              {children.map((child) => {
                const hasChildren = tasks.some((task) => task.parentTaskId === child.id);
                return <div key={child.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-2">
                  <input type="checkbox" checked={selectedSubtaskIds.includes(child.id)} onChange={(event) => setSelectedSubtaskIds((ids) => event.target.checked ? [...new Set([...ids, child.id])] : ids.filter((id) => id !== child.id))} aria-label={t('Select {task} for bulk reparent').replace('{task}', child.title)} />
                  <button aria-label={t(child.completed ? 'Mark task incomplete' : 'Mark task complete')} type="button" onClick={() => onToggleTask(child.id)} className="text-slate-500 hover:text-emerald-400">{child.completed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4" />}</button>
                  <button type="button" onClick={() => onSelectTask(child.id)} className={`flex-1 text-left text-xs ${child.completed ? 'line-through text-slate-500' : 'text-slate-200 hover:text-blue-300'}`}>{child.title}</button>
                  <span className="text-[0.5625rem] text-slate-600">{child.progress ?? 0}%</span>
                  <button type="button" disabled={hasChildren} onClick={() => onSubtaskToChecklist(selectedTask.id, child.id)} className="px-2 py-1 rounded border border-blue-500/20 text-[0.5625rem] text-blue-300 disabled:opacity-25" title={t(hasChildren ? 'Nested subtasks must be moved first' : 'Convert canonical subtask to checklist item')}>{t('To checklist')}</button>
                </div>;
              })}
              {children.length === 0 && <div className="text-[0.625rem] text-slate-600">{t('No subtasks yet.')}</div>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-white/[0.06] bg-slate-900/45 p-2">
              <div className="flex flex-wrap gap-3 text-[0.625rem] text-slate-500">
                {(['project', 'phase', 'plan'] as const).map((key) => <label key={key} className="flex items-center gap-1.5"><input type="checkbox" checked={inheritance[key]} onChange={(event) => setInheritance((value) => ({ ...value, [key]: event.target.checked }))} /> {t(`inherit ${key}`)}</label>)}
              </div>
              <span className="text-[0.5625rem] text-slate-600">{t('Inheritance is explicit per new/converted subtask')}</span>
            </div>

            <div className="flex gap-2">
              <input value={subtaskDraft} onChange={(event) => setSubtaskDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubtask(); } }} placeholder={t('Create canonical subtask...')} className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-indigo-500/50" />
              <button type="button" onClick={addSubtask} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">{t('Add')}</button>
            </div>

            {selectedSubtaskIds.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04] p-2">
              <span className="text-[0.625rem] text-cyan-300">{selectedSubtaskIds.length} {t('selected')}</span>
              <select value={reparentTarget} onChange={(event) => setReparentTarget(event.target.value)} className="flex-1 min-w-[180px] bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-[0.625rem] text-slate-300"><option value="__root__">{t('Move to root')}</option>{possibleParents.map((task) => <option key={task.id} value={task.id}>{t('Move under:')} {task.title}</option>)}</select>
              <button type="button" onClick={() => { onReparentTasks(selectedSubtaskIds, reparentTarget === '__root__' ? undefined : reparentTarget); setSelectedSubtaskIds([]); }} className="px-2.5 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-[0.625rem] text-white">{t('Move selected')}</button>
            </div>}
          </>}
        </div>

        <TaskDependencyPanel task={selectedTask} tasks={tasks} dependencies={dependencies} onSelectTask={onSelectTask} />
        <TaskCollaborationPanel selectedTask={selectedTask} onUpdateTask={onUpdateTask} onTakeTaskIntoNote={onTakeTaskIntoNote ? () => onTakeTaskIntoNote(selectedTask.id) : undefined} documents={documents} onOpenDocument={onOpenDocument} currentDocumentId={currentDocumentId} />
        <TaskCommentsPanel task={selectedTask} localIdentity={organization.localIdentity} onUpdate={(patch) => onUpdateTask(selectedTask.id, patch)} />
      </div>
    </div>
  );
};
