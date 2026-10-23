// STATUS: DIAMANT VGT SUPREME — Sovereign Review & Collaboration Pane
import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Filter,
  GitCommit,
  Minus,
  Move,
  Palette,
  Plus,
  Settings2,
  Table,
  X,
  XCircle,
} from 'lucide-react';
import type { ReviewerFilter, TrackChangeRevision, WriterRevisionType } from '../types';

export interface WriterReviewPaneProps {
  isOpen: boolean;
  onClose: () => void;
  revisions: readonly TrackChangeRevision[];
  actionsDisabled?: boolean;
  reviewerFilter: ReviewerFilter;
  onChangeReviewerFilter: (filter: ReviewerFilter) => void;
  revisionTypeFilter: 'all' | WriterRevisionType;
  onChangeRevisionTypeFilter: (filter: 'all' | WriterRevisionType) => void;
  onAcceptRevision: (id: string) => void;
  onRejectRevision: (id: string) => void;
  onAcceptSelected: (ids: readonly string[]) => void;
  onRejectSelected: (ids: readonly string[]) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onJumpToParagraph: (paragraphId: string) => void;
}

const REVISION_TYPES: WriterRevisionType[] = ['insert', 'delete', 'move', 'format', 'table', 'property'];

function typeIcon(type: WriterRevisionType) {
  switch (type) {
    case 'insert': return <Plus className="w-3 h-3 text-emerald-400" />;
    case 'delete': return <Minus className="w-3 h-3 text-rose-400" />;
    case 'move': return <Move className="w-3 h-3 text-cyan-400" />;
    case 'format': return <Palette className="w-3 h-3 text-amber-400" />;
    case 'table': return <Table className="w-3 h-3 text-blue-400" />;
    case 'property': return <Settings2 className="w-3 h-3 text-purple-400" />;
  }
}

function statusClass(status: TrackChangeRevision['status']): string {
  if (status === 'accepted') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
  if (status === 'rejected') return 'bg-rose-500/15 text-rose-300 border-rose-500/20';
  return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
}

export const WriterReviewPane: React.FC<WriterReviewPaneProps> = ({
  isOpen,
  onClose,
  revisions,
  actionsDisabled = false,
  reviewerFilter,
  onChangeReviewerFilter,
  revisionTypeFilter,
  onChangeRevisionTypeFilter,
  onAcceptRevision,
  onRejectRevision,
  onAcceptSelected,
  onRejectSelected,
  onAcceptAll,
  onRejectAll,
  onJumpToParagraph,
}) => {
  const [selectedRevisionIds, setSelectedRevisionIds] = useState<Set<string>>(() => new Set());
  const authors = useMemo(() => Array.from(new Set(revisions.map((revision) => revision.author))), [revisions]);
  const filteredRevisions = useMemo(() => revisions.filter((revision) =>
    (reviewerFilter === 'all' || revision.author === reviewerFilter)
    && (revisionTypeFilter === 'all' || revision.type === revisionTypeFilter)
  ), [reviewerFilter, revisionTypeFilter, revisions]);
  const pendingFiltered = filteredRevisions.filter((revision) => revision.status === 'pending');
  const selectedPending = pendingFiltered.filter((revision) => selectedRevisionIds.has(revision.id));

  if (!isOpen) return null;

  const toggleSelected = (revisionId: string) => {
    if (actionsDisabled) return;
    setSelectedRevisionIds((current) => {
      const next = new Set(current);
      if (next.has(revisionId)) next.delete(revisionId);
      else next.add(revisionId);
      return next;
    });
  };

  const runSelected = (action: (ids: readonly string[]) => void) => {
    const ids = selectedPending.map((revision) => revision.id);
    if (actionsDisabled || ids.length === 0) return;
    action(ids);
    setSelectedRevisionIds(new Set());
  };

  return (
    <aside data-vgt-workspace-chrome="panel" className="w-96 bg-slate-900 border-l border-white/10 flex flex-col h-full shrink-0 z-20 shadow-2xl">
      <div className="h-12 border-b border-white/10 px-4 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-rose-400">
          <GitCommit className="w-4 h-4" />
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">Review & Tracking</span>
        </div>
        <button aria-label="Close Writer Review panel" type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 py-2.5 bg-slate-950/60 border-b border-white/5 flex items-center justify-between text-[0.6875rem] font-mono">
        <span className="text-slate-400 font-bold">{pendingFiltered.length} offen</span>
        <span className="text-slate-500">{filteredRevisions.length} sichtbar · {revisions.length} gesamt</span>
      </div>
      {actionsDisabled && (
        <div className="px-4 py-2 border-b border-amber-500/20 bg-amber-500/10 text-[0.625rem] text-amber-200">
          Revisionsverwaltung ist durch den aktiven Dokumentschutz gesperrt.
        </div>
      )}

      <div className="p-3 border-b border-white/10 space-y-2 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <select
            value={reviewerFilter}
            onChange={(event) => onChangeReviewerFilter(event.target.value)}
            className="min-w-0 flex-1 bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
          >
            <option value="all">Alle Reviewer</option>
            {authors.map((author) => <option key={author} value={author}>{author}</option>)}
          </select>
          <select
            value={revisionTypeFilter}
            onChange={(event) => onChangeRevisionTypeFilter(event.target.value as 'all' | WriterRevisionType)}
            className="min-w-0 flex-1 bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
          >
            <option value="all">Alle Typen</option>
            {REVISION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onAcceptAll} disabled={actionsDisabled || pendingFiltered.length === 0} className="flex-1 py-1 px-2 rounded-lg bg-emerald-600/20 disabled:opacity-40 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
            Alle annehmen
          </button>
          <button type="button" onClick={onRejectAll} disabled={actionsDisabled || pendingFiltered.length === 0} className="flex-1 py-1 px-2 rounded-lg bg-rose-600/20 disabled:opacity-40 text-rose-300 border border-rose-500/30 text-xs font-semibold">
            Alle ablehnen
          </button>
        </div>

        {selectedPending.length > 0 && (
          <div className="flex gap-2">
            <button type="button" disabled={actionsDisabled} onClick={() => runSelected(onAcceptSelected)} className="flex-1 py-1 px-2 rounded-lg bg-emerald-600/25 text-emerald-200 border border-emerald-400/30 text-xs font-semibold">
              {selectedPending.length} ausgewählte annehmen
            </button>
            <button type="button" disabled={actionsDisabled} onClick={() => runSelected(onRejectSelected)} className="flex-1 py-1 px-2 rounded-lg bg-rose-600/25 text-rose-200 border border-rose-400/30 text-xs font-semibold">
              {selectedPending.length} ausgewählte ablehnen
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredRevisions.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500 italic">Keine Revisionen für diesen Filter.</div>
        ) : filteredRevisions.map((revision) => (
          <div
            key={revision.id}
            // GAP-0052, Runde 289: die Revisionszeile war ein `<div>` mit
            // `onClick` und `cursor-pointer` — der Sprung zum Absatz war damit
            // Maus-only.
            role="button"
            tabIndex={0}
            onClick={() => onJumpToParagraph(revision.paragraphId)}
            onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
              // In der Zeile sitzen eine Auswahlbox und zwei Knoepfe. Deren
              // Tasten gehoeren ihnen; nur die Zeile selbst springt.
              if (event.target !== event.currentTarget) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              // Die Leertaste scrollt von sich aus.
              event.preventDefault();
              onJumpToParagraph(revision.paragraphId);
            }}
            className="p-2.5 rounded-xl bg-slate-950/70 border border-white/10 hover:border-blue-500/50 cursor-pointer space-y-2 transition-all"
          >
            <div className="flex items-center justify-between text-[0.6875rem] gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {revision.status === 'pending' && (
                  <input
                    type="checkbox"
                    checked={selectedRevisionIds.has(revision.id)}
                    disabled={actionsDisabled}
                    onChange={() => toggleSelected(revision.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Revision ${revision.id} auswählen`}
                  />
                )}
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: revision.authorColor || '#3b82f6' }} />
                <span className="font-semibold text-slate-200 truncate">{revision.author}</span>
                <span className="p-0.5 rounded bg-white/5 border border-white/5">{typeIcon(revision.type)}</span>
              </div>
              <span className={`text-[0.5625rem] px-1.5 py-0.5 rounded border uppercase font-mono ${statusClass(revision.status)}`}>
                {revision.status}
              </span>
            </div>

            <div className="text-xs font-mono bg-slate-900 p-2 rounded-lg space-y-1 overflow-hidden">
              {revision.originalText !== undefined && revision.originalText !== '' && (
                <div className="text-rose-400 line-through opacity-80 truncate">− {revision.originalText}</div>
              )}
              {revision.newText !== undefined && revision.newText !== '' && (
                <div className="text-emerald-400 truncate">+ {revision.newText}</div>
              )}
              {revision.details && <div className="text-slate-400 text-[0.625rem] italic">{revision.details}</div>}
              {revision.conflictReason && (
                <div className="text-amber-300 text-[0.625rem] border border-amber-500/20 bg-amber-500/10 rounded p-1.5">
                  Konflikt: {revision.conflictReason}
                </div>
              )}
            </div>

            {revision.status === 'pending' && (
              <div className="flex items-center justify-end space-x-1.5 pt-1">
                <button type="button" disabled={actionsDisabled} onClick={(event) => { event.stopPropagation(); onRejectRevision(revision.id); }} className="p-1 px-2 rounded-lg text-[0.6875rem] font-semibold text-rose-400 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-35 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /><span>Ablehnen</span>
                </button>
                <button type="button" disabled={actionsDisabled} onClick={(event) => { event.stopPropagation(); onAcceptRevision(revision.id); }} className="p-1 px-2.5 rounded-lg text-[0.6875rem] font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-35 text-white flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /><span>Annehmen</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
};
