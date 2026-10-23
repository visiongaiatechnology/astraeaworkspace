// STATUS: DIAMANT VGT SUPREME — local notification center and desktop delivery
import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, CheckCheck, Moon, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { ProjectDependency, TaskItem, TaskNotificationKind, TaskNotificationState } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../../creativePersonalLocale';
import {
  browserLocalNotificationApi,
  clearReadTaskNotifications,
  evaluateAndDeliverTaskNotifications,
  hasTaskNotificationPersistenceChanges,
  markTaskNotificationRead,
} from './taskNotifications';

interface TaskNotificationCenterProps {
  documentId: string;
  tasks: TaskItem[];
  dependencies: ProjectDependency[];
  localIdentity: string;
  state: TaskNotificationState;
  onChange: (state: TaskNotificationState) => void;
}

interface NotificationRuntime {
  documentId: string;
  state: TaskNotificationState;
  externalState: TaskNotificationState;
}

function minutesToClock(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
function clockToMinutes(value: string): number | undefined {
  const match = value.match(/^(\d{2}):(\d{2})$/); if (!match) return undefined;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

export const TaskNotificationCenter: React.FC<TaskNotificationCenterProps> = ({ documentId, tasks, dependencies, localIdentity, state, onChange }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(message, locale);
  const [open, setOpen] = useState(false);
  const [policyScope, setPolicyScope] = useState<'list' | 'project'>('list');
  const [policyScopeId, setPolicyScopeId] = useState('');
  const runtimeRef = useRef<NotificationRuntime | null>(null);
  const inputsRef = useRef({ tasks, dependencies, localIdentity });
  const onChangeRef = useRef(onChange);
  inputsRef.current = { tasks, dependencies, localIdentity };
  onChangeRef.current = onChange;
  if (!runtimeRef.current || runtimeRef.current.documentId !== documentId) {
    runtimeRef.current = { documentId, state, externalState: state };
  } else if (runtimeRef.current.externalState !== state) {
    const runtime = runtimeRef.current;
    const lastEvaluatedAt = Math.max(runtime.state.lastEvaluatedAt ?? 0, state.lastEvaluatedAt ?? 0) || undefined;
    const externalDataChanged = hasTaskNotificationPersistenceChanges(runtime.externalState, state);
    runtime.state = externalDataChanged ? { ...state, lastEvaluatedAt } : { ...runtime.state, lastEvaluatedAt };
    runtime.externalState = state;
  }
  const apiRef = useRef(browserLocalNotificationApi());

  const evaluate = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const currentInputs = inputsRef.current;
    const update = evaluateAndDeliverTaskNotifications(
      currentInputs.tasks,
      currentInputs.dependencies,
      runtime.state,
      currentInputs.localIdentity,
      apiRef.current,
      Date.now(),
    );
    runtime.state = update.state;
    if (update.shouldPersist) onChangeRef.current(update.state);
  };

  const commitState = (next: TaskNotificationState) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const lastEvaluatedAt = Math.max(runtime.state.lastEvaluatedAt ?? 0, next.lastEvaluatedAt ?? 0) || undefined;
    const committed = { ...next, lastEvaluatedAt };
    const changed = hasTaskNotificationPersistenceChanges(runtime.state, committed);
    runtime.state = committed;
    if (changed) onChangeRef.current(committed);
  };

  useEffect(() => {
    evaluate();
    const interval = window.setInterval(evaluate, 60_000);
    return () => window.clearInterval(interval);
  }, [documentId, tasks, dependencies, localIdentity]);

  const unread = state.items.filter((item) => !item.read).length;
  const requestDesktop = async () => {
    await apiRef.current.requestPermission();
    evaluate();
  };
  const addMutedPolicy = () => {
    const scopeId = policyScopeId.trim(); if (!scopeId) return;
    const allKinds: TaskNotificationKind[] = ['reminder', 'due_soon', 'overdue', 'mention', 'comment', 'assignment_change', 'dependency_unblocked'];
    const current = runtimeRef.current?.state ?? state;
    commitState({ ...current, policies: [...current.policies.filter((policy) => !(policy.scope === policyScope && policy.scopeId === scopeId)), { id: `policy:${policyScope}:${scopeId}`, scope: policyScope, scopeId, enabled: true, mutedKinds: allKinds }] });
    setPolicyScopeId('');
  };

  return <div className="rounded-2xl border border-white/[0.08] bg-slate-900/40 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 p-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 text-xs text-slate-200">
        {unread ? <BellRing className="w-4 h-4 text-amber-300" /> : <Bell className="w-4 h-4 text-slate-500" />}
        <span>{t('Notification Center')}</span><span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">{unread}</span>
      </button>
      <div className="flex items-center gap-2">
        <button type="button" onClick={requestDesktop} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[0.6875rem] text-slate-300">{t('Local desktop reminders')}</button>
        <button type="button" onClick={evaluate} className="p-1.5 rounded-lg border border-white/10 text-slate-400" aria-label={t('Refresh local notifications')} title={t('Refresh local notifications')}><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
    </div>

    {open && <div className="border-t border-white/[0.08] p-3 space-y-4">
      <section className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr] gap-2 items-center">
        <label className="flex items-center gap-2 text-[0.6875rem] text-slate-400"><Moon className="w-3.5 h-3.5" /><input type="checkbox" checked={state.quietHours.enabled} onChange={(event) => { const current = runtimeRef.current?.state ?? state; commitState({ ...current, quietHours: { ...current.quietHours, enabled: event.target.checked } }); }} />{t('Quiet hours')}</label>
        <input aria-label={`${t('Quiet hours')} · ${locale === 'en-US' ? 'start' : locale === 'de-DE' ? 'Beginn' : locale === 'es-ES' ? 'inicio' : locale === 'it-IT' ? 'inizio' : locale === 'ja-JP' ? '開始' : locale === 'ru-RU' ? 'начало' : '开始'}`} type="time" value={minutesToClock(state.quietHours.startMinutes)} onChange={(event) => { const value = clockToMinutes(event.target.value); if (value !== undefined) { const current = runtimeRef.current?.state ?? state; commitState({ ...current, quietHours: { ...current.quietHours, startMinutes: value } }); } }} className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300" />
        <input aria-label={`${t('Quiet hours')} · ${locale === 'en-US' ? 'end' : locale === 'de-DE' ? 'Ende' : locale === 'es-ES' ? 'fin' : locale === 'it-IT' ? 'fine' : locale === 'ja-JP' ? '終了' : locale === 'ru-RU' ? 'конец' : '结束'}`} type="time" value={minutesToClock(state.quietHours.endMinutes)} onChange={(event) => { const value = clockToMinutes(event.target.value); if (value !== undefined) { const current = runtimeRef.current?.state ?? state; commitState({ ...current, quietHours: { ...current.quietHours, endMinutes: value } }); } }} className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300" />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select value={policyScope} onChange={(event) => setPolicyScope(event.target.value as 'list' | 'project')} className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[0.6875rem] text-slate-300"><option value="list">{t('List policy')}</option><option value="project">{t('Project policy')}</option></select>
          <input value={policyScopeId} onChange={(event) => setPolicyScopeId(event.target.value)} placeholder={`${t(policyScope === 'list' ? 'List' : 'Project')} ID · ${t('Mute scope').toLowerCase()}`} className="min-w-[180px] bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[0.6875rem] text-slate-300" />
          <button type="button" onClick={addMutedPolicy} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-[0.6875rem] text-slate-300"><Plus className="w-3 h-3" />{t('Mute scope')}</button>
        </div>
        {state.policies.map((policy) => <div key={policy.id} className="flex items-center justify-between text-[0.625rem] text-slate-500 bg-slate-950/50 rounded-lg px-2.5 py-1.5"><span>{t(policy.scope === 'list' ? 'List' : 'Project')}: {policy.scopeId} · {(policy.mutedKinds ?? []).length} {t('muted kinds')}</span><button type="button" aria-label={t('Delete notification policy')} onClick={() => { const current = runtimeRef.current?.state ?? state; commitState({ ...current, policies: current.policies.filter((candidate) => candidate.id !== policy.id) }); }}><Trash2 className="w-3 h-3" /></button></div>)}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><span className="text-[0.6875rem] font-semibold text-slate-400">{t('Local events')}</span><button type="button" onClick={() => commitState(clearReadTaskNotifications(runtimeRef.current?.state ?? state))} className="flex items-center gap-1 text-[0.625rem] text-slate-500"><CheckCheck className="w-3 h-3" />{t('Clear read')}</button></div>
        {state.items.length === 0 ? <p className="text-[0.6875rem] text-slate-600">{t('No local notifications.')}</p> : state.items.slice(0, 80).map((item) => <button key={item.id} type="button" onClick={() => commitState(markTaskNotificationRead(runtimeRef.current?.state ?? state, item.id, !item.read))} className={`w-full text-left rounded-xl border px-3 py-2 ${item.read ? 'border-white/[0.05] bg-slate-950/30 opacity-60' : 'border-amber-500/20 bg-amber-500/5'}`}><div className="flex items-center justify-between gap-3"><span className="text-[0.6875rem] font-medium text-slate-300">{item.title}</span><span className="text-[0.5625rem] uppercase text-slate-600">{t(item.kind.replaceAll('_', ' '))}</span></div><p className="text-[0.625rem] text-slate-500 mt-0.5 truncate">{item.body}</p></button>)}
      </section>

      <p className="text-[0.5625rem] text-slate-600">{t('Local-only delivery. No external push service is required or contacted.')}</p>
    </div>}
  </div>;
};
