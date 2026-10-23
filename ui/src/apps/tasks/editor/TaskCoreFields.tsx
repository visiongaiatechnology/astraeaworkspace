// STATUS: DIAMANT VGT SUPREME — canonical Task Model editor
import React from 'react';
import { Clock3, GitBranch, UserRound } from 'lucide-react';
import { TaskItem, TaskOrganizationState, TaskStatusDefinition } from '../../../shared/contracts/workspace';
import { TaskRichDescriptionEditor } from './TaskRichDescriptionEditor';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { taskCoreText } from '../taskCoreLocale';
import { taskRecurrenceSpec, localTaskTimeZone } from '../recurrence/taskRecurrence';

interface TaskCoreFieldsProps {
  task: TaskItem;
  statusDefinitions: TaskStatusDefinition[];
  organization: TaskOrganizationState;
  onUpdate: (patch: Partial<TaskItem>) => void;
}

function localDateTimeValue(value?: string): string {
  if (!value) return '';
  const match = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  return match ? match[0].slice(0, 16) : '';
}

/**
 * AST-0921: a timed due value is a LOCAL wall clock. Without naming the zone, "17:45" is
 * ambiguous — the same instant shows a different time in another zone. The recurrence spec
 * carries an explicit IANA zone when the user set one; otherwise the host zone applies. One
 * resolution, used for both the start and the due hint.
 */
export function taskDueZoneLabel(task: TaskItem): string {
  const spec = taskRecurrenceSpec(task);
  return spec?.timezone ?? localTaskTimeZone();
}

export const TaskCoreFields: React.FC<TaskCoreFieldsProps> = ({ task, statusDefinitions, organization, onUpdate }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof taskCoreText>[0]) => taskCoreText(message, locale);
  const assignees = task.assignees ?? (task.assignee ? [task.assignee] : []);
  const zoneLabel = taskDueZoneLabel(task);
  const zoneHint = (value?: string) => Boolean(value) && (
    <span data-task-zone-hint={zoneLabel} className="text-[0.5625rem] text-slate-500 font-mono">{value} · {zoneLabel}</span>
  );

  return (
    <>
      <label className="md:col-span-2 space-y-1">
        <span className="text-slate-400">{t('title')}</span>
        <input value={task.title} maxLength={4_096} onChange={(event) => onUpdate({ title: event.target.value })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
      </label>

      <div className="md:col-span-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">{t('description')}</span>
          <span className="text-[0.5625rem] text-slate-600">{t('descriptionHint')}</span>
        </div>
        <TaskRichDescriptionEditor value={task.description ?? ''} onChange={(description) => onUpdate({ description, descriptionFormat: 'markdown' })} />
      </div>

      <label className="space-y-1">
        <span className="text-slate-400">{t('status')}</span>
        <select value={task.status ?? (task.completed ? 'done' : 'not_started')} onChange={(event) => onUpdate({ status: event.target.value })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50">
          {statusDefinitions.slice().sort((a, b) => a.order - b.order).map((definition) => <option key={definition.id} value={definition.id}>{definition.label}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-slate-400">{t('priority')}</span>
        <select value={task.priority} onChange={(event) => onUpdate({ priority: event.target.value as TaskItem['priority'] })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50">
          <option value="low">{t('low')}</option><option value="medium">{t('medium')}</option><option value="high">{t('high')}</option>
        </select>
      </label>

      <label className="md:col-span-2 space-y-1">
        <span className="text-slate-400">{t('statusReason')}</span>
        <input value={task.statusReason ?? ''} maxLength={8_192} onChange={(event) => onUpdate({ statusReason: event.target.value || undefined })} placeholder={t('statusReasonPlaceholder')} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
      </label>

      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-2 rounded-xl border border-white/10 bg-slate-950/55 p-3">
        <label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={Boolean(task.important)} onChange={(event) => onUpdate({ important: event.target.checked })} /><span>{t('important')}</span></label>
        <label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={Boolean(task.inbox)} onChange={(event) => onUpdate({ inbox: event.target.checked })} /><span>{t('inbox')}</span></label>
        <label className="space-y-1"><span className="text-slate-500">{t('myDay')}</span><input type="date" value={task.myDayDate ?? ''} onChange={(event) => onUpdate({ myDayDate: event.target.value || undefined })} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200" /></label>
        <label className="space-y-1"><span className="text-slate-500">{t('personalList')}</span><select value={task.listId ?? ''} onChange={(event) => onUpdate({ listId: event.target.value || undefined, inbox: event.target.value ? false : task.inbox })} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200"><option value="">{t('noList')}</option>{organization.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
      </div>

      <label className="space-y-1">
        <span className="text-slate-400">{t('progress')}</span>
        <div className="flex items-center gap-2">
          <input type="range" min="0" max="100" value={task.progress ?? 0} onChange={(event) => onUpdate({ progress: Number(event.target.value) })} className="flex-1" />
          <input type="number" min="0" max="100" value={task.progress ?? 0} onChange={(event) => onUpdate({ progress: Number(event.target.value) })} className="w-16 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100" />
          <span className="text-slate-500">%</span>
        </div>
      </label>

      <label className="space-y-1">
        <span className="text-slate-400 flex items-center gap-1"><UserRound className="w-3 h-3" /> {t('assignees')}</span>
        <input value={assignees.join(', ')} onChange={(event) => onUpdate({ assignees: String(event.target.value).split(',').map((value: string) => value.trim()).filter(Boolean) })} placeholder={t('assigneesPlaceholder')} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
      </label>

      <label className="space-y-1">
        <span className="text-slate-400">{t('startDate')}</span>
        <input type="datetime-local" value={localDateTimeValue(task.startAt)} onChange={(event) => onUpdate({ startAt: event.target.value || undefined })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
        {!task.startAt && task.startDate && <span className="text-[0.5625rem] text-slate-600">{t('legacyDate')}: {task.startDate}</span>}
        {zoneHint(task.startAt)}
      </label>

      <label className="space-y-1">
        <span className="text-slate-400">{t('dueDate')}</span>
        <input type="datetime-local" value={localDateTimeValue(task.dueAt)} onChange={(event) => onUpdate({ dueAt: event.target.value || undefined })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
        {!task.dueAt && task.dueDate && <span className="text-[0.5625rem] text-slate-600">{t('legacyDate')}: {task.dueDate}</span>}
        {zoneHint(task.dueAt)}
      </label>

      <label className="space-y-1">
        <span className="text-slate-400">{t('estimateHours')}</span>
        <input type="number" min="0" step="0.25" value={task.estimateHours ?? ''} onChange={(event) => onUpdate({ estimateHours: event.target.value ? Math.max(0, Number(event.target.value)) : undefined })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
      </label>

      <label className="space-y-1">
        <span className="text-slate-400">{t('actualHours')}</span>
        <input type="number" min="0" step="0.25" value={task.actualHours ?? ''} onChange={(event) => onUpdate({ actualHours: event.target.value ? Math.max(0, Number(event.target.value)) : undefined })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
      </label>

      <label className="md:col-span-2 space-y-1">
        <span className="text-slate-400">{t('tags')}</span>
        <input value={(task.tags ?? []).join(', ')} onChange={(event) => onUpdate({ tags: String(event.target.value).split(',').map((tag: string) => tag.trim()).filter(Boolean) })} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-blue-500/50" />
      </label>

      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-2 rounded-xl border border-white/10 bg-slate-950/55 p-3">
        <label className="space-y-1"><span className="text-slate-500 flex items-center gap-1"><GitBranch className="w-3 h-3" /> {t('projectId')}</span><input value={task.projectId ?? ''} onChange={(event) => onUpdate({ projectId: event.target.value || undefined })} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200" /></label>
        <label className="space-y-1"><span className="text-slate-500">{t('phaseId')}</span><input value={task.phaseId ?? ''} onChange={(event) => onUpdate({ phaseId: event.target.value || undefined })} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200" /></label>
        <label className="space-y-1"><span className="text-slate-500">{t('planId')}</span><input value={task.planId ?? ''} onChange={(event) => onUpdate({ planId: event.target.value || undefined })} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200" /></label>
      </div>

      <div className="md:col-span-2 space-y-1">
        <span className="text-slate-400 flex items-center gap-1"><Clock3 className="w-3 h-3" /> {t('completion')}</span>
        <div className="min-h-[34px] rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-slate-500">{task.completionDate ? new Date(task.completionDate).toLocaleString(locale) : t('notCompleted')}</div>
      </div>

      <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-950/55 p-3">
        <div className="text-[0.625rem] uppercase tracking-wider text-slate-600 mb-2">{t('auditMetadata')}</div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[0.625rem]">
          <div className="flex justify-between gap-3"><dt className="text-slate-600">{t('created')}</dt><dd className="text-slate-400">{task.createdAt ? new Date(task.createdAt).toLocaleString(locale) : t('legacy')}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-600">{t('createdBy')}</dt><dd className="text-slate-400">{task.createdBy ?? t('legacy')}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-600">{t('updated')}</dt><dd className="text-slate-400">{task.updatedAt ? new Date(task.updatedAt).toLocaleString(locale) : t('legacy')}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-600">{t('updatedBy')}</dt><dd className="text-slate-400">{task.updatedBy ?? t('legacy')}</dd></div>
          <div className="md:col-span-2 flex justify-between gap-3"><dt className="text-slate-600">{t('source')}</dt><dd className="text-slate-400 font-mono truncate">{task.source ?? t('legacy')}</dd></div>
        </dl>
      </div>
    </>
  );
};
