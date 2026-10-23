// STATUS: DIAMANT VGT SUPREME
// Productive Whiteboard collaboration UI: local realtime, comments/mentions, activity and authorship.
import React, { useMemo, useState } from 'react';
import { Activity, MessageSquare, UserRoundCheck, Users, Wifi, WifiOff, X } from 'lucide-react';
import type { WhiteboardCollaborationController } from './useWhiteboardCollaboration';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardDeepText } from '../whiteboardDeepLocale';
import { creativePersonalText } from '../../creativePersonalLocale';

interface Props {
  controller: WhiteboardCollaborationController;
  selectedItemId: string | null;
  onClose: () => void;
}

export const WhiteboardCollaborationPanel: React.FC<Props> = ({ controller, selectedItemId, onClose }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message:string) => creativePersonalText(whiteboardDeepText(message, locale), locale);
  const [comment, setComment] = useState('');

  const roots = useMemo(() => controller.state.comments.filter((entry) => !entry.parentId).slice(-80).reverse(), [controller.state.comments]);
  const selectedAuthor = selectedItemId ? controller.state.objectAuthors[selectedItemId] : undefined;

  const addComment = () => {
    const body = comment.trim();
    if (!body) return;
    try { controller.addComment(body, selectedItemId ?? undefined); setComment(''); }
    catch { /* controller exposes the fail-closed permission state in the UI */ }
  };

  return <aside data-whiteboard-collaboration-panel="true" data-whiteboard-dock="collaboration" className="whiteboard-dock whiteboard-dock--right-top absolute right-4 top-20 z-50 w-[min(94vw,430px)] max-h-[72vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl" aria-label={t('Whiteboard collaboration')}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Users className="h-4 w-4 text-cyan-300"/>{t('Collaboration')}</h3><p className="mt-1 text-[0.625rem] text-slate-500">{t('Local-first realtime with deterministic offline merge. Remote/guest access stays disabled unless a verified secure transport is supplied.')}</p></div>
      <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200" aria-label={t('Close collaboration panel')}><X className="h-4 w-4"/></button>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-3">
        <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-300">{controller.state.enabled ? <Wifi className="h-3.5 w-3.5 text-emerald-300"/> : <WifiOff className="h-3.5 w-3.5 text-slate-500"/>}{t('Realtime session')}</div>
        <div className="mt-1 text-[0.5625rem] text-slate-500">{controller.transportLabel ?? (controller.transportAvailable ? t('Ready · same-origin local transport') : t('Transport unavailable'))}</div>
        <label className="mt-2 flex items-center gap-2 text-[0.5625rem] text-slate-400"><input type="checkbox" checked={controller.state.enabled} disabled={!controller.transportAvailable} onChange={(event) => controller.setEnabled(event.target.checked)} className="accent-cyan-500"/>{t('Enable local realtime')}</label>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-slate-900/60 p-3">
        <div className="text-[0.625rem] font-semibold text-slate-300">{t('Identity & presence')}</div>
        <input value={controller.state.localDisplayName} onChange={(event) => controller.setDisplayName(event.target.value)} maxLength={128} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[0.625rem] text-slate-200 outline-none" aria-label={t('Collaboration display name')}/>
        <div className="mt-1 text-[0.5625rem] text-slate-500">{controller.participants.length} live peer(s) · role {controller.roleLabel}</div>
      </div>
    </div>

    {controller.lastError && <div role="status" title={controller.lastError} className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-2.5 py-2 text-[0.5625rem] text-rose-300">{t('Collaboration could not be completed.')}</div>}

    <section className="mt-3 rounded-xl border border-white/[0.07] bg-slate-900/50 p-3" aria-label={t('Comments & mentions')}>
      <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-300"><MessageSquare className="h-3.5 w-3.5 text-blue-300"/>{t('Comments & mentions')}</div>
      <div className="mt-2 flex gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); addComment(); } }} maxLength={16384} placeholder={selectedItemId ? `${t('Comment on object')} ${selectedItemId} · ${t('use @name')}` : `${t('Board comment')} · ${t('use @name')}`} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[0.625rem] text-slate-200 outline-none"/><button type="button" disabled={!controller.canComment || !comment.trim()} onClick={addComment} className="rounded-lg bg-blue-600 px-2.5 text-[0.5625rem] text-white disabled:opacity-40">{t('Add')}</button></div>
      <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">{roots.map((entry) => <div key={entry.id} className="rounded-lg border border-white/[0.06] bg-slate-950/80 p-2"><div className="flex items-center justify-between gap-2"><span className="text-[0.5625rem] font-semibold text-blue-300">{entry.authorName}</span><span className="text-[0.5rem] text-slate-600">{new Date(entry.createdAt).toLocaleString(locale)}</span></div><div className="mt-0.5 whitespace-pre-wrap break-words text-[0.625rem] text-slate-300">{entry.body}</div>{entry.mentions.length > 0 && <div className="mt-1 text-[0.5rem] text-violet-300">{t('Mentions:')} {entry.mentions.map((name) => `@${name}`).join(', ')}</div>}<div className="mt-1 flex justify-between"><span className="text-[0.5rem] text-slate-600">{entry.objectId ? `${t('Object')} ${entry.objectId}` : t('Board')}{entry.resolvedAt ? ` · ${t('resolved')}` : ''}</span><button type="button" disabled={!controller.canComment} onClick={() => controller.setCommentResolved(entry.id, !entry.resolvedAt)} className="text-[0.5rem] text-slate-500 hover:text-slate-300 disabled:opacity-40">{t(entry.resolvedAt ? 'Reopen' : 'Resolve')}</button></div></div>)}{roots.length === 0 && <div className="text-[0.5625rem] text-slate-600">{t('No comments yet.')}</div>}</div>
    </section>

    <div className="mt-3 grid grid-cols-2 gap-2">
      <section className="rounded-xl border border-white/[0.07] bg-slate-900/50 p-3" aria-label={t('Object authorship')}><div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-300"><UserRoundCheck className="h-3.5 w-3.5 text-emerald-300"/>{t('Object authorship')}</div><label className="mt-2 flex items-center gap-2 text-[0.5625rem] text-slate-400"><input type="checkbox" checked={controller.state.objectAuthorshipEnabled} onChange={(event) => controller.setAuthorshipEnabled(event.target.checked)} className="accent-emerald-500"/>{t('Track last editor')}</label><div className="mt-2 text-[0.5625rem] text-slate-500">{selectedItemId ? selectedAuthor ? `${selectedAuthor.actorName} · ${new Date(selectedAuthor.updatedAt).toLocaleString(locale)}` : t('Selected object has no tracked author yet.') : t('Select an object to inspect authorship.')}</div></section>
      <section className="rounded-xl border border-white/[0.07] bg-slate-900/50 p-3" aria-label={t('Offline merge')}><div className="text-[0.625rem] font-semibold text-slate-300">{t('Offline merge')}</div><p className="mt-1 text-[0.5625rem] text-slate-500">{t('Every edited object receives a persisted Lamport version. Rejoining exchanges snapshots and resolves concurrent object versions deterministically.')}</p><div className="mt-2 text-[0.5625rem] text-cyan-300">Lamport {controller.state.lamport} · {Object.keys(controller.state.objectVersions).length} {t('tracked object(s)')}</div></section>
    </div>

    <section className="mt-3 rounded-xl border border-white/[0.07] bg-slate-900/50 p-3" aria-label={t('Activity history')}><div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-300"><Activity className="h-3.5 w-3.5 text-fuchsia-300"/>{t('Activity history')}</div><div className="mt-2 max-h-36 space-y-1 overflow-y-auto">{[...controller.state.activity].reverse().slice(0,80).map((entry) => <div key={entry.id} className="text-[0.5rem] text-slate-500"><span className="text-slate-400">{new Date(entry.at).toLocaleString(locale)}</span> · {entry.actorName} · {entry.detail}</div>)}{controller.state.activity.length === 0 && <div className="text-[0.5625rem] text-slate-600">{t('No collaboration activity yet.')}</div>}</div></section>
  </aside>;
};
