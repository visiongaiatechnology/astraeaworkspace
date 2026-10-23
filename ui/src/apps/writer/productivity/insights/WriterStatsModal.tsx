// STATUS: DIAMANT VGT SUPREME
import React, { useState } from 'react';
import { X, BarChart3, Clock, BookOpen, GitCommit, CheckCheck, Trash2, Check, Ban } from 'lucide-react';
import type { TrackChangeRevision } from '../../types';
import type { TextStatistics } from '../../utils/writerUtils';

export interface WriterStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  statistics: TextStatistics;
  revisions: TrackChangeRevision[];
  onAcceptAllRevisions?: () => void;
  onRejectAllRevisions?: () => void;
  onAcceptRevision?: (id: string) => void;
  onRejectRevision?: (id: string) => void;
}

export const WriterStatsModal: React.FC<WriterStatsModalProps> = ({
  isOpen,
  onClose,
  statistics,
  revisions,
  onAcceptAllRevisions,
  onRejectAllRevisions,
  onAcceptRevision,
  onRejectRevision,
}) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'revisions'>('stats');

  if (!isOpen) return null;

  const pendingRevisions = revisions.filter((r) => r.status === 'pending');
  const acceptedRevisions = revisions.filter((r) => r.status === 'accepted').length;
  const rejectedRevisions = revisions.filter((r) => r.status === 'rejected').length;
  const revisionTypeSummary = Array.from(new Set(revisions.map((revision) => revision.type)))
    .map((type) => ({ type, count: revisions.filter((revision) => revision.type === type).length }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150 select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <BarChart3 className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">Dokumentstatistik & Revisionsinventar</h3>
          </div>
          <button aria-label="Close Dokumentstatistik & Revisionsinventar dialog" type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-slate-950/60 p-1 rounded-xl space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'stats'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Dokumentmetriken</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('revisions')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'revisions'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>Änderungsinventar ({pendingRevisions.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'stats' ? (
          <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
            {/* Primary Counts */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 text-center">
                <span className="text-[0.625rem] text-slate-400 font-medium block">Wörter</span>
                <span className="text-lg font-bold text-slate-100 font-mono">{statistics.words.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 text-center">
                <span className="text-[0.625rem] text-slate-400 font-medium block">Zeichen (inkl. LZ)</span>
                <span className="text-lg font-bold text-slate-100 font-mono">{statistics.charsWithSpaces.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 text-center">
                <span className="text-[0.625rem] text-slate-400 font-medium block">Zeichen (ohne LZ)</span>
                <span className="text-lg font-bold text-slate-100 font-mono">{statistics.charsWithoutSpaces.toLocaleString()}</span>
              </div>
            </div>

            {/* Structure Counts */}
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2 bg-slate-950/40 rounded-xl border border-white/5 text-center">
                <span className="text-[0.625rem] text-slate-400 block">Absätze</span>
                <span className="text-sm font-semibold text-slate-200 font-mono">{statistics.paragraphs}</span>
              </div>
              <div className="p-2 bg-slate-950/40 rounded-xl border border-white/5 text-center">
                <span className="text-[0.625rem] text-slate-400 block">Sätze</span>
                <span className="text-sm font-semibold text-slate-200 font-mono">{statistics.sentences}</span>
              </div>
              <div className="p-2 bg-slate-950/40 rounded-xl border border-white/5 text-center">
                <span className="text-[0.625rem] text-slate-400 block">Tabellen</span>
                <span className="text-sm font-semibold text-slate-200 font-mono">{statistics.tables}</span>
              </div>
              <div className="p-2 bg-slate-950/40 rounded-xl border border-white/5 text-center">
                <span className="text-[0.625rem] text-slate-400 block">Seiten</span>
                <span className="text-sm font-semibold text-slate-200 font-mono">{statistics.pages}</span>
              </div>
            </div>

            {/* Time & Readability */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Lesezeit:</span>
                </div>
                <span className="font-semibold text-slate-100 font-mono">~{statistics.readingTimeMinutes} Min. (200 WPM)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>Sprechzeit:</span>
                </div>
                <span className="font-semibold text-slate-100 font-mono">~{statistics.speakingTimeMinutes} Min. (130 WPM)</span>
              </div>
              <p className="pt-2 border-t border-white/5 text-[0.625rem] text-slate-400 leading-relaxed">
                Zeichen werden als Unicode-Grapheme gezählt. Seiten entsprechen der aktuellen Druck-Paginierung;
                Tabellen, Fußnoten sowie Bild- und Formelbeschriftungen fließen in Wort- und Zeichenzahlen ein.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><span className="block text-[0.625rem] text-slate-500">Offen</span><strong className="text-amber-300 font-mono">{pendingRevisions.length}</strong></div>
                <div><span className="block text-[0.625rem] text-slate-500">Angenommen</span><strong className="text-emerald-300 font-mono">{acceptedRevisions}</strong></div>
                <div><span className="block text-[0.625rem] text-slate-500">Abgelehnt</span><strong className="text-rose-300 font-mono">{rejectedRevisions}</strong></div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
                {revisionTypeSummary.length === 0 ? (
                  <span className="text-[0.625rem] text-slate-500">Keine Änderungen erfasst.</span>
                ) : revisionTypeSummary.map(({ type, count }) => (
                  <span key={type} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.625rem] text-slate-300">
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
            {/* Batch Controls */}
            {pendingRevisions.length > 0 && (
              <div className="flex items-center justify-between p-2 bg-slate-950/70 rounded-xl border border-white/5">
                <span className="text-xs text-slate-300 font-medium">
                  {pendingRevisions.length} ausstehende Revision(en)
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={onAcceptAllRevisions}
                    className="px-2.5 py-1 rounded text-[0.6875rem] font-medium bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 flex items-center space-x-1"
                  >
                    <CheckCheck className="w-3 h-3" />
                    <span>Alle annehmen</span>
                  </button>
                  <button
                    type="button"
                    onClick={onRejectAllRevisions}
                    className="px-2.5 py-1 rounded text-[0.6875rem] font-medium bg-rose-600/30 text-rose-300 hover:bg-rose-600/50 flex items-center space-x-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Alle ablehnen</span>
                  </button>
                </div>
              </div>
            )}

            {/* Revisions List */}
            {revisions.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 italic">
                Keine nachverfolgten Revisionen im Dokument vorhanden.
              </div>
            ) : (
              revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="p-2.5 bg-slate-950/50 rounded-xl border border-white/5 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-200">{rev.author}</span>
                      <span className="text-[0.625rem] text-slate-500 font-mono">
                        {new Date(rev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span
                      className={`text-[0.625rem] uppercase font-bold px-1.5 py-0.5 rounded ${
                        rev.status === 'accepted'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : rev.status === 'rejected'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {rev.status}
                    </span>
                  </div>

                  <div className="text-slate-300 text-[0.6875rem]">
                    {rev.type === 'delete' && <span className="line-through text-rose-400">{rev.originalText}</span>}
                    {rev.type === 'insert' && <span className="text-emerald-400 font-medium">{rev.newText}</span>}
                  </div>

                  {rev.status === 'pending' && (
                    <div className="flex items-center justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onAcceptRevision?.(rev.id)}
                        className="p-1 rounded hover:bg-emerald-600/20 text-emerald-400"
                        aria-label="Revision annehmen" title="Revision annehmen"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectRevision?.(rev.id)}
                        className="p-1 rounded hover:bg-rose-600/20 text-rose-400"
                        aria-label="Revision ablehnen" title="Revision ablehnen"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
