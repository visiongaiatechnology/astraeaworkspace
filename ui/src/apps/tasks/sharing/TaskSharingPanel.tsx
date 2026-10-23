// STATUS: DIAMANT VGT SUPREME — Tasks list sharing and permission administration
import React, { useState } from 'react';
import { KeyRound, Lock, Share2, ShieldCheck } from 'lucide-react';
import type { TaskAccessRole, TaskOrganizationState, TaskSharingState } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../../creativePersonalLocale';
import {
  setTaskListMemberRole,
  setTaskListShared,
  taskSharingRule,
  transferTaskListOwnership,
} from './taskSharing';

interface TaskSharingPanelProps {
  organization: TaskOrganizationState;
  state: TaskSharingState;
  onChange: (state: TaskSharingState) => void;
}

export const TaskSharingPanel: React.FC<TaskSharingPanelProps> = ({ organization, state, onChange }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(message, locale);
  const [scopeId, setScopeId] = useState(organization.lists[0]?.id ?? 'inbox');
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState<Exclude<TaskAccessRole, 'owner' | 'assignee'>>('editor');
  const [newOwner, setNewOwner] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const rule = taskSharingRule(state, scopeId, organization.localIdentity);

  const mutate = (operation: () => TaskSharingState) => {
    try { onChange(operation()); setError(undefined); } catch { setError(t('Permission change failed.')); }
  };

  return <div className="rounded-2xl border border-white/[0.08] bg-slate-900/40 p-3 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-violet-400" /><div><h3 className="text-xs font-semibold text-slate-200">{t('Sharing & Permissions')}</h3><p className="text-[0.5625rem] text-slate-600">{t('Local-first access controls · explicit member roles')}</p></div></div><span className="text-[0.5625rem] text-slate-600">{t('Offline queue')} {state.offlineQueue.length} · {t('Audit')} {state.audit.length}</span></div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
      <select aria-label={t('Task list sharing scope')} value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-[0.625rem] text-slate-300"><option value="inbox">{t('Inbox / personal scope')}</option>{organization.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950/50 border border-white/10 text-[0.625rem] text-slate-400"><Lock className="w-3 h-3" />{t(rule.visibility)} · {t('owner')} {rule.ownerId}</div>
      <button type="button" onClick={() => mutate(() => setTaskListShared(state, scopeId, organization.localIdentity, rule.visibility !== 'shared'))} className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-violet-500/20 text-[0.625rem] text-violet-300"><Share2 className="w-3 h-3" />{rule.visibility === 'shared' ? t('Make personal') : t('Share list')}</button>
    </div>

    {rule.visibility === 'shared' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
      <section className="space-y-2"><h4 className="text-[0.625rem] font-semibold text-slate-400">{t('Members')}</h4><div className="flex gap-2"><input value={memberId} onChange={(event) => setMemberId(event.target.value)} placeholder={t('Member identity')} className="min-w-0 flex-1 bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[0.625rem] text-slate-300" /><select value={role} onChange={(event) => setRole(event.target.value as Exclude<TaskAccessRole, 'owner' | 'assignee'>)} className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[0.625rem] text-slate-300"><option value="editor">{t('Editor')}</option><option value="commenter">{t('Commenter')}</option><option value="viewer">{t('Viewer')}</option></select><button type="button" onClick={() => mutate(() => setTaskListMemberRole(state, scopeId, organization.localIdentity, memberId, role))} className="px-2 py-1 rounded-lg border border-white/10 text-[0.625rem] text-slate-300">{t('Set')}</button></div>
        <div className="flex gap-2"><input value={newOwner} onChange={(event) => setNewOwner(event.target.value)} placeholder={t('Transfer ownership to identity')} className="min-w-0 flex-1 bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[0.625rem] text-slate-300" /><button type="button" onClick={() => mutate(() => transferTaskListOwnership(state, scopeId, organization.localIdentity, newOwner))} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-[0.625rem] text-slate-300"><KeyRound className="w-3 h-3" />{t('Transfer')}</button></div>
      </section>

    </div>}
    {error && <p role="alert" className="text-[0.625rem] text-rose-300">{error}</p>}
  </div>;
};
