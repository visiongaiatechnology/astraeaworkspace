// STATUS: DIAMANT VGT SUPREME — project schedule dependency projection for task details
import React from 'react';
import type { ProjectDependency, TaskItem } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../../creativePersonalLocale';
import { dependencyPeerTaskId, taskScheduleDependencies } from './taskDependencies';

interface TaskDependencyPanelProps {
  task: TaskItem;
  tasks: TaskItem[];
  dependencies: ProjectDependency[];
  onSelectTask: (id: string) => void;
}

export const TaskDependencyPanel: React.FC<TaskDependencyPanelProps> = ({ task, tasks, dependencies, onSelectTask }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(message, locale);
  const related = taskScheduleDependencies(task.id, dependencies);
  if (!task.projectId && related.length === 0) return null;
  const title = (id: string) => tasks.find((candidate) => candidate.id === id)?.title ?? id;
  return <div className="md:col-span-2 rounded-xl border border-indigo-500/15 bg-slate-950/55 p-3 space-y-2">
    <div className="flex items-center justify-between"><span className="text-slate-300 font-semibold">{t('Project schedule dependencies')}</span><span className="text-[0.5625rem] text-slate-600">{related.length} {t('relation(s)')}</span></div>
    {related.map((dependency) => {
      const predecessor = dependency.predecessorTaskId === task.id;
      const otherId = dependencyPeerTaskId(task.id, dependency)!;
      return <button key={dependency.id} type="button" onClick={() => onSelectTask(otherId)} className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-slate-900/60 px-2.5 py-2 text-left hover:border-indigo-500/30"><span className="text-[0.625rem] text-slate-300 truncate">{t(predecessor ? 'Precedes' : 'Depends on')} · {title(otherId)}</span><span className="text-[0.5625rem] font-mono text-indigo-300 shrink-0">{dependency.type}{dependency.lagDays ? ` ${dependency.lagDays > 0 ? '+' : ''}${dependency.lagDays}d` : ''}</span></button>;
    })}
    {related.length === 0 && <div className="text-[0.625rem] text-slate-600">{t('This project task has no schedule dependencies.')}</div>}
  </div>;
};
