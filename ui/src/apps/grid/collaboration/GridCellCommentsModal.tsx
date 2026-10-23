// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Cell Comments & Notes manager

import React, { useState } from 'react';
import { MessageSquare, X, Plus, CheckCircle2, Trash2, Clock, User } from 'lucide-react';
import { GridCellComment } from '../../../shared/contracts/workspace';
import { createGridComment } from './gridReviewCollaboration';

interface GridCellCommentsModalProps {
  isOpen: boolean;
  selectedCell: string;
  comments: GridCellComment[];
  onClose: () => void;
  onAddComment: (comment: GridCellComment) => void;
  onToggleResolve: (id: string) => void;
  onDeleteComment: (id: string) => void;
}

export const GridCellCommentsModal: React.FC<GridCellCommentsModalProps> = ({
  isOpen,
  selectedCell,
  comments,
  onClose,
  onAddComment,
  onToggleResolve,
  onDeleteComment,
}) => {
  const [newText, setNewText] = useState('');
  const [authorName, setAuthorName] = useState('Architect VGT');
  const [filterMode, setFilterMode] = useState<'cell' | 'all'>('cell');
  const [kind, setKind] = useState<'comment' | 'note'>('comment');
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);

  if (!isOpen) return null;

  const displayedComments = filterMode === 'cell'
    ? comments.filter((c) => c.coord.toUpperCase() === selectedCell.toUpperCase())
    : comments;

  const handleCreate = () => {
    if (!newText.trim()) return;
    const comment = createGridComment({
      coord: selectedCell,
      author: authorName.trim() || 'Anonymous',
      text: newText,
      parentId: replyTo,
      kind,
    });
    onAddComment(comment);
    setNewText('');
    setReplyTo(undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-xs flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span className="font-bold text-slate-100 text-sm">Cell Comments & Notes</span>
            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[0.625rem]">
              {selectedCell}
            </span>
          </div>
          <button aria-label="Close Grid Cell Comments dialog"
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Toggle */}
        <div className="flex border-b border-white/10 bg-slate-950/40 p-1 gap-1 text-[0.6875rem]">
          <button
            type="button"
            onClick={() => setFilterMode('cell')}
            className={`flex-1 py-1 rounded transition-colors font-medium ${
              filterMode === 'cell' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Current Cell ({selectedCell})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`flex-1 py-1 rounded transition-colors font-medium ${
              filterMode === 'all' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Sheet Comments ({comments.length})
          </button>
        </div>

        {/* Comments List */}
        <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
          {displayedComments.length === 0 ? (
            <div className="text-center py-6 text-slate-500 italic text-[0.6875rem]">
              No comments found for {filterMode === 'cell' ? selectedCell : 'this sheet'}.
            </div>
          ) : (
            displayedComments.map((c) => (
              <div
                key={c.id}
                className={`p-2.5 rounded border transition-colors ${c.parentId ? 'ml-5 ' : ''}${
                  c.resolved
                    ? 'bg-white/[0.02] border-white/5 opacity-60'
                    : 'bg-white/[0.04] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                    <User className="w-3 h-3 text-purple-400" />
                    <span>{c.author}</span>
                    <span className="font-mono text-[0.625rem] text-purple-300 font-normal">[{c.coord}]</span>
                    <span className="text-[0.5625rem] uppercase tracking-wide text-slate-500">{c.kind ?? 'comment'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-500 text-[0.625rem]">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                <p className="text-slate-200 select-text whitespace-pre-wrap text-[0.6875rem] mb-2">{c.text}</p>
                {(c.mentions?.length ?? 0) > 0 && <div className="text-[0.5625rem] text-cyan-300 mb-1">Mentions: {c.mentions!.map((m) => `@${m}`).join(', ')}</div>}

                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => onToggleResolve(c.id)}
                    className={`flex items-center gap-1 text-[0.625rem] transition-colors ${
                      c.resolved ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{c.resolved ? 'Resolved' : 'Mark Resolved'}</span>
                  </button>
                  {!c.parentId && <button type="button" onClick={() => setReplyTo(c.id)} className="text-[0.625rem] text-blue-300 hover:text-blue-200">Reply</button>}
                  <button
                    type="button"
                    onClick={() => onDeleteComment(c.id)}
                    className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded"
                    aria-label="Delete Comment" title="Delete Comment"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Comment Input */}
        <div className="p-3 bg-slate-950/70 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between text-[0.625rem] text-slate-400">
            <div className="flex gap-1">
              <button type="button" onClick={() => setKind('comment')} className={`px-2 py-0.5 rounded ${kind==='comment'?'bg-purple-600/30 text-purple-200':'bg-white/5'}`}>Threaded comment</button>
              <button type="button" onClick={() => setKind('note')} className={`px-2 py-0.5 rounded ${kind==='note'?'bg-amber-500/20 text-amber-200':'bg-white/5'}`}>Note</button>
            </div>
            {replyTo && <button type="button" onClick={() => setReplyTo(undefined)} className="text-blue-300">Replying · cancel</button>}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your name"
              className="w-1/3 bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-200 outline-none focus:border-purple-500 text-[0.6875rem]"
            />
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              placeholder={`Add comment for cell ${selectedCell}...`}
              className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-100 outline-none focus:border-purple-500 text-[0.6875rem]"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newText.trim()}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded font-medium text-[0.6875rem] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Post Comment</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
