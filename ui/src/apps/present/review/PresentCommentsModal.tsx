// STATUS: DIAMANT VGT SUPREME — threaded Present comments/replies/mentions/resolve.
import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, MessageSquare, Plus, Reply, Trash2, User, X } from 'lucide-react';
import type { PresentSlide, PresentSlideComment } from '../../../shared/contracts/workspace';
import { createPresentComment } from './presentReviewCollaboration';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_REVIEW_COPY, presentCommentFailureCopy } from '../locale/presentReviewLocale';
import { PresentReviewErrorAlert } from './PresentReviewErrorAlert';

interface Props {
  isOpen: boolean;
  slide: PresentSlide;
  onClose: () => void;
  onAddComment: (comment: PresentSlideComment) => void;
  onToggleResolve: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export const PresentCommentsModal: React.FC<Props> = ({ isOpen, slide, onClose, onAddComment, onToggleResolve, onDeleteComment }) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_REVIEW_COPY[locale].comments;
  const [author, setAuthor] = useState(copy.defaultReviewer);
  const [newText, setNewText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const comments = slide.comments ?? [];
  const roots = useMemo(() => comments.filter((comment) => !comment.parentId), [comments]);
  if (!isOpen) return null;

  const post = (parentId?: string) => {
    try {
      const comment = createPresentComment({ slideId: slide.id, author: author || copy.anonymous, text: newText, parentId });
      onAddComment(comment); setNewText(''); setReplyTo(null); setError(null);
    } catch (cause) { setError(presentCommentFailureCopy(locale, cause)); }
  };

  const renderComment = (comment: PresentSlideComment, isReply = false) => <div key={comment.id} className={`rounded border p-2.5 ${isReply?'ml-5 bg-black/20 border-white/5':'bg-white/[0.04] border-white/10'} ${comment.resolved?'opacity-55':''}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-1"><div className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold text-slate-300"><User className="w-3 h-3 shrink-0 text-purple-400"/><span className="break-words">{comment.author}</span>{comment.mentions?.length ? <span className="break-words text-[0.5625rem] text-cyan-400">@{comment.mentions.join(' @')}</span>:null}</div><div className="flex shrink-0 items-center gap-1 text-[0.5625rem] text-slate-500"><Clock className="w-3 h-3"/>{new Date(comment.timestamp).toLocaleTimeString(locale, {hour:'2-digit',minute:'2-digit'})}</div></div>
    <p className="whitespace-pre-wrap select-text text-[0.6875rem] text-slate-200">{comment.text}</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-1">
      <div className="flex flex-wrap gap-2">{!isReply&&<button type="button" onClick={()=>{setReplyTo(comment.id);setNewText('');}} className="flex items-center gap-1 whitespace-normal text-[0.625rem] text-cyan-400"><Reply className="w-3 h-3 shrink-0"/>{copy.reply}</button>}<button type="button" onClick={()=>onToggleResolve(comment.id)} className={`flex items-center gap-1 whitespace-normal text-[0.625rem] ${comment.resolved?'text-emerald-400':'text-slate-400'}`}><CheckCircle2 className="w-3 h-3 shrink-0"/>{comment.resolved?copy.resolved:copy.resolveThread}</button></div>
      <button aria-label={copy.deleteComment(comment.author)} type="button" onClick={()=>onDeleteComment(comment.id)} className="p-1 rounded text-rose-400 hover:bg-rose-500/10"><Trash2 className="w-3 h-3"/></button>
    </div>
  </div>;

  return <div role="dialog" aria-modal="true" aria-labelledby="present-comments-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-white/15 bg-slate-900 text-xs shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><MessageSquare className="h-4 w-4 shrink-0 text-purple-400"/><b id="present-comments-title" className="break-words">{copy.title}</b><span className="max-w-full break-words rounded bg-purple-500/20 px-1.5 py-0.5 font-mono text-[0.625rem] text-purple-300">{slide.title||copy.untitled}</span></div><button aria-label={copy.close} type="button" onClick={onClose} className="shrink-0 rounded p-1 hover:bg-white/10"><X className="w-4 h-4"/></button></div>
      <div className="min-h-0 max-h-[430px] flex-1 overflow-y-auto p-4 space-y-3">{roots.length===0?<div className="break-words py-8 text-center italic text-slate-500">{copy.empty}</div>:roots.map((root)=><div key={root.id} className="space-y-1.5">{renderComment(root)}{comments.filter((comment)=>comment.parentId===root.id).map((reply)=>renderComment(reply,true))}</div>)}</div>
      <div className="border-t border-white/10 bg-slate-950/70 p-3 space-y-2">{replyTo&&<div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded bg-cyan-500/10 px-2 py-1 text-[0.625rem] text-cyan-300"><span className="break-words">{copy.replyToThread(replyTo.slice(-8))}</span><button type="button" onClick={()=>setReplyTo(null)} className="whitespace-normal">{copy.cancelReply}</button></div>}{error&&<PresentReviewErrorAlert message={error}/>}<div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2"><input aria-label={copy.authorName} value={author} onChange={(e)=>setAuthor(e.target.value.slice(0,128))} className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1" placeholder={copy.authorPlaceholder}/><input aria-label={replyTo?copy.replyPlaceholder:copy.commentPlaceholder} value={newText} onChange={(e)=>setNewText(e.target.value.slice(0,16384))} onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();post(replyTo??undefined);}}} className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1" placeholder={replyTo?copy.replyPlaceholder:copy.commentPlaceholder}/><button aria-label={copy.post} type="button" disabled={!newText.trim()} onClick={()=>post(replyTo??undefined)} className="justify-self-start rounded bg-purple-600 px-3 py-1 font-semibold text-white disabled:opacity-40"><Plus className="w-3 h-3"/></button></div></div>
    </div>
  </div>;
};
