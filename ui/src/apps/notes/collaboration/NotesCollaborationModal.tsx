// STATUS: DIAMANT VGT SUPREME — comments, mentions, snapshots, attribution and optional live collaboration controls
import React, { useMemo, useState } from 'react';
import { MessageSquare, Radio, Save, ShieldCheck, Users, X } from 'lucide-react';
import type { NotePage } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { notesExtendedText } from '../notesExtendedLocale';
import { parseSelectionComment } from './notesCommentAnchor';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

interface NotesCollaborationModalProps {
  isOpen: boolean;
  page: NotePage | null;
  authorId: string;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  supported: boolean;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  peers: Array<{ sessionId: string; displayName: string; pageId: string | null }>;
  conflictCount: number;
  lastError: string | null;
  authorAttributionEnabled: boolean;
  onAuthorAttributionChange: (value: boolean) => void;
  onAddComment: (body: string, authorId: string, authorName: string, parentId?: string | null) => void;
  onResolveComment: (rootId: string, resolved: boolean) => void;
  onCreateSnapshot: (name: string) => void;
  /** AST-0721: reads the body selection so the comment can be anchored to the exact passage. */
  selectionText?: () => string | null;
  onClose: () => void;
}

export const NotesCollaborationModal: React.FC<NotesCollaborationModalProps> = (props) => {
  const { locale } = useWorkspaceLocale();
  const t = (message:string) => notesExtendedText(message, locale);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState('');
  const [selection, setSelection] = useState('');
  const roots = useMemo(() => (props.page?.comments ?? []).filter((comment) => !comment.parentId), [props.page?.comments]);
  const dialogA11y = useNotesDialogA11y(props.isOpen, props.onClose);
  if (!props.isOpen) return null;
  const submit = () => {
    if (!body.trim()) return;
    props.onAddComment(body, props.authorId, props.displayName, replyTo);
    setBody(''); setReplyTo(null); setSelection('');
  };
  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('Collaboration and comments')}>
    <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0d121c] shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10"><div><h2 className="text-sm font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-cyan-300" />{t('Collaboration & Comments')}</h2><p className="text-[0.625rem] text-slate-500 mt-0.5">{t('Offline-first. Live transport is opt-in and same-origin only.')}</p></div><button aria-label={t('Close')} type="button" onClick={props.onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><X className="w-4 h-4" /></button></div>
      <div className="overflow-y-auto p-5 space-y-5">
        <section className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2"><div className="text-xs font-semibold flex items-center gap-2"><Radio className="w-3.5 h-3.5 text-emerald-300" />{t('Live coauthoring')}</div><input value={props.displayName} onChange={(event) => props.onDisplayNameChange(event.target.value)} aria-label={t('Collaboration display name')} className="w-full rounded bg-slate-950 border border-white/10 px-2 py-1.5 text-xs" /><label className="flex items-center gap-2 text-[0.6875rem] text-slate-300"><input type="checkbox" checked={props.enabled} disabled={!props.supported} onChange={(event) => props.onEnabledChange(event.target.checked)} />{t('Enable BroadcastChannel transport')}</label><div className="text-[0.625rem] text-slate-500">{props.supported ? `${props.peers.length} ${t('peers visible')}` : t('BroadcastChannel unavailable in this runtime')} · {props.conflictCount} {t('conflict fields')}</div>{props.lastError && <div title={props.lastError} className="text-[0.625rem] text-amber-300 border border-amber-500/20 rounded p-2">{t('Live collaboration is unavailable.')}</div>}{props.peers.map((peer) => <div key={peer.sessionId} className="text-[0.625rem] text-cyan-300 truncate">● {peer.displayName}{peer.pageId ? ` · ${t('Page')} ${peer.pageId.slice(-8)}` : ''}</div>)}</div>
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2"><div className="text-xs font-semibold flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-violet-300" />{t('Attribution & snapshot')}</div><label className="flex items-start gap-2 text-[0.6875rem] text-slate-300"><input type="checkbox" checked={props.authorAttributionEnabled} onChange={(event) => props.onAuthorAttributionChange(event.target.checked)} /><span>{t('Record the latest local author on changed pages in this notebook.')}</span></label>{props.page?.lastAuthor && <div className="text-[0.625rem] text-slate-500">{t('Last author:')} {props.page.lastAuthor.displayName}</div>}<div className="flex gap-1"><input value={snapshotName} onChange={(event) => setSnapshotName(event.target.value)} placeholder={t('Snapshot name')} className="min-w-0 flex-1 rounded bg-slate-950 border border-white/10 px-2 py-1.5 text-xs" /><button type="button" onClick={() => { if (snapshotName.trim()) { props.onCreateSnapshot(snapshotName); setSnapshotName(''); } }} className="px-2 rounded border border-violet-500/25 bg-violet-500/10 text-violet-200" aria-label={t('Create named snapshot')} title={t('Create named snapshot')}><Save className="w-3.5 h-3.5" /></button></div></div>
        </section>
        <section className="space-y-2"><div className="text-xs font-semibold flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 text-blue-300" />{t('Page comments & @mentions')}</div><div className="space-y-2 max-h-72 overflow-y-auto">{roots.map((root) => { const replies=(props.page?.comments ?? []).filter((entry) => entry.parentId === root.id); const resolved=Boolean(root.resolvedAt); return <div key={root.id} className={`rounded-lg border p-2.5 ${resolved ? 'border-white/5 opacity-60' : 'border-white/10 bg-white/[0.02]'}`}><div className="flex items-center justify-between gap-2"><span className="text-[0.625rem] font-semibold text-slate-300">{root.authorName}</span><button type="button" onClick={() => props.onResolveComment(root.id, !resolved)} className="text-[0.5625rem] text-slate-500 hover:text-emerald-300">{t(resolved ? 'Reopen' : 'Resolve')}</button></div><div className="text-xs text-slate-200 whitespace-pre-wrap break-words mt-1">{parseSelectionComment(root.body).selection && <span className="block mb-1 border-l-2 border-cyan-500/60 pl-2 text-[0.625rem] italic text-cyan-200">{parseSelectionComment(root.body).selection}</span>}{parseSelectionComment(root.body).body}</div>{root.mentions.length > 0 && <div className="text-[0.5625rem] text-blue-400 mt-1">{t('Mentions:')} {root.mentions.map((mention) => `@${mention}`).join(', ')}</div>}<button type="button" onClick={() => setReplyTo(root.id)} className="text-[0.5625rem] text-cyan-400 mt-1.5">{t('Reply')}</button>{replies.map((reply) => <div key={reply.id} className="ml-4 mt-2 pl-2 border-l border-white/10"><div className="text-[0.5625rem] font-semibold text-slate-400">{reply.authorName}</div><div className="text-[0.6875rem] text-slate-300 whitespace-pre-wrap break-words">{reply.body}</div></div>)}</div>; })}{roots.length === 0 && <div className="text-[0.625rem] italic text-slate-600">{t('No comments on this page.')}</div>}</div><div className="rounded-lg border border-white/10 bg-slate-950/70 p-2"><div className="text-[0.5625rem] text-slate-500 mb-1">{replyTo ? t('Replying to thread') : t('New page comment')} · {t('use @name for mentions')}</div><div className="mb-1.5 flex items-center gap-2"><button type="button" onClick={() => setSelection(props.selectionText?.() ?? '')} className="rounded border border-white/10 px-1.5 py-0.5 text-[0.5625rem] text-slate-300 hover:text-cyan-200">Comment on body selection</button>{selection && <span className="min-w-0 truncate text-[0.5625rem] text-cyan-200">“{selection.slice(0, 60)}…”</span>}</div>{selection && <div role="note" className="mb-1.5 rounded border border-cyan-500/20 bg-cyan-500/[0.06] p-1.5 text-[0.5625rem] italic text-cyan-100 whitespace-pre-wrap max-h-16 overflow-auto">{selection}</div>}<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={16384} className="w-full h-20 resize-none bg-transparent text-xs outline-none" aria-label="Comment text" /><div className="flex justify-between"><button type="button" onClick={() => { setReplyTo(null); setBody(''); }} className="text-[0.5625rem] text-slate-500">{t('Clear')}</button><button type="button" onClick={submit} className="px-2 py-1 rounded bg-blue-600/20 border border-blue-500/20 text-[0.625rem] text-blue-200">{t('Post')}</button></div></div></section>
      </div>
    </div>
  </div>;
};
