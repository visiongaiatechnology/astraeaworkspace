// STATUS: DIAMANT VGT SUPREME — threaded local task comments and mentions
import React, { useMemo, useState } from 'react';
import { MessageSquare, Reply } from 'lucide-react';
import type { TaskComment, TaskItem } from '../../../shared/contracts/workspace';
import { addTaskComment } from '../model/taskModel';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../../creativePersonalLocale';

interface TaskCommentsPanelProps {
  task: TaskItem;
  onUpdate: (patch: Partial<TaskItem>) => void;
  localIdentity?: string;
}

function rootCommentId(comment: TaskComment, byId: Map<string, TaskComment>): string {
  let current = comment;
  const seen = new Set<string>();
  for (let depth = 0; depth < 16 && current.parentCommentId; depth += 1) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = byId.get(current.parentCommentId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

export const TaskCommentsPanel: React.FC<TaskCommentsPanelProps> = ({ task, onUpdate, localIdentity = 'Local User' }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(message, locale);
  const [draft, setDraft] = useState('');
  const [replyRootId, setReplyRootId] = useState<string | undefined>(undefined);
  const comments = task.comments ?? [];
  const threads = useMemo(() => {
    const byId = new Map(comments.map((comment) => [comment.id, comment]));
    const roots = comments.filter((comment) => !comment.parentCommentId || !byId.has(comment.parentCommentId));
    return roots.map((root) => ({
      root,
      replies: comments.filter((comment) => comment.id !== root.id && rootCommentId(comment, byId) === root.id),
    }));
  }, [comments]);

  const submit = () => {
    if (!draft.trim()) return;
    onUpdate({ comments: addTaskComment(comments, localIdentity, draft, Date.now(), replyRootId) });
    setDraft('');
    setReplyRootId(undefined);
  };

  const renderComment = (comment: TaskComment, reply = false) => (
    <div key={comment.id} className={`rounded-lg border border-white/10 bg-slate-900/70 p-2.5 ${reply ? 'ml-5 border-l-emerald-500/20' : ''}`}>
      <div className="flex justify-between gap-3 text-[0.5625rem]"><span className="text-emerald-300 font-semibold">{comment.author}</span><span className="text-slate-600">{new Date(comment.createdAt).toLocaleString(locale)}</span></div>
      <div className="mt-1 text-[0.6875rem] text-slate-300 whitespace-pre-wrap break-words">{comment.text}</div>
      {(comment.mentions ?? []).length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{comment.mentions!.map((mention) => <span key={mention} className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-[0.5625rem]">@{mention}</span>)}</div>}
      <button type="button" onClick={() => setReplyRootId(reply ? rootCommentId(comment, new Map(comments.map((item) => [item.id, item]))) : comment.id)} className="mt-1.5 inline-flex items-center gap-1 text-[0.5625rem] text-slate-500 hover:text-emerald-300"><Reply className="w-3 h-3" />{t('Reply')}</button>
    </div>
  );

  return <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-950/55 p-3 space-y-3">
    <div className="flex items-center justify-between"><span className="text-slate-300 font-semibold flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> {t('Comment threads')}</span><span className="text-[0.625rem] text-slate-500">{comments.length}</span></div>
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {threads.map(({ root, replies }) => <div key={root.id} className="space-y-1.5">{renderComment(root)}{replies.map((comment) => renderComment(comment, true))}</div>)}
      {comments.length === 0 && <div className="text-[0.625rem] text-slate-600">{t('No comments')}</div>}
    </div>
    {replyRootId && <div className="flex items-center justify-between rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-2 py-1.5 text-[0.5625rem] text-emerald-300"><span>{t('Replying in thread')}</span><button type="button" onClick={() => setReplyRootId(undefined)} className="text-slate-500 hover:text-slate-300">{t('Cancel')}</button></div>}
    <div className="flex gap-2"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} placeholder={t('Add comment · use @name to mention a local identity')} className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-emerald-500/50 resize-y" /><button type="button" onClick={submit} disabled={!draft.trim()} className="self-end px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40">{t('Comment')}</button></div>
  </div>;
};
