// STATUS: DIAMANT VGT SUPREME — persisted Notes revision history viewer

import React, { useMemo, useState } from 'react';
import { Clock, History, RotateCcw, X } from 'lucide-react';
import type { NotePage, NotePageRevision } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { notesExtendedText } from '../notesExtendedLocale';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

interface NotesVersionHistoryModalProps {
  isOpen: boolean;
  page: NotePage;
  onClose: () => void;
  onRestoreVersion: (revision: NotePageRevision) => void;
}

export const NotesVersionHistoryModal: React.FC<NotesVersionHistoryModalProps> = ({ isOpen, page, onClose, onRestoreVersion }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => notesExtendedText(message, locale);
  const revisions = useMemo(() => [...(page.revisions ?? [])].sort((a, b) => b.timestamp - a.timestamp), [page.revisions]);
  const [selectedId, setSelectedId] = useState<string>('');
  const dialogA11y = useNotesDialogA11y(isOpen, onClose);
  if (!isOpen) return null;
  const selected = revisions.find((revision) => revision.id === selectedId) ?? revisions[0] ?? null;
  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={t('Page revision history')}>
    <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col text-xs max-h-[85vh]">
      <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between"><div className="flex items-center gap-2"><History className="w-4 h-4 text-purple-400" /><span className="font-bold text-slate-100 text-sm">{t('Persisted Revision History')}</span><span className="text-slate-500 font-mono text-[0.6875rem]">— {page.title}</span></div><button aria-label={t('Close')} type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button></div>
      <div className="flex-1 flex overflow-hidden min-h-[320px]">
        <div className="w-64 border-r border-white/10 overflow-y-auto p-2 space-y-1.5 bg-slate-950/40 shrink-0">{revisions.map((revision) => <button type="button" key={revision.id} onClick={() => setSelectedId(revision.id)} className={`w-full text-left p-2.5 rounded-lg border ${selected?.id === revision.id ? 'bg-purple-600/20 border-purple-500/50 text-purple-200' : 'border-white/5 bg-slate-900/60 text-slate-400 hover:bg-white/5'}`}><div className="font-semibold text-slate-200 truncate">{revision.name || revision.title || t('Revision')}</div><div className="flex items-center gap-1 text-[0.625rem] text-slate-500 mt-1"><Clock className="w-3 h-3" />{new Date(revision.timestamp).toLocaleString(locale)}</div></button>)}{revisions.length === 0 && <div className="py-10 px-3 text-center text-slate-500">{t('No prior revisions yet. Notes creates bounded persisted revisions while the page changes.')}</div>}</div>
        <div className="flex-1 flex flex-col p-4 overflow-hidden bg-[#07090e]">{selected ? <><div className="pb-2 border-b border-white/10 mb-3"><div className="font-semibold text-slate-200">{selected.title}</div><div className="text-[0.625rem] text-slate-500">{selected.tags.map((tag) => `#${tag}`).join(' ')}</div></div><pre className="flex-1 font-mono text-[0.6875rem] text-slate-300 leading-relaxed whitespace-pre-wrap overflow-auto select-text">{selected.content}</pre></> : <div className="m-auto text-slate-500">{t('No revision selected.')}</div>}</div>
      </div>
      <div className="px-4 py-3 bg-slate-950 border-t border-white/10 flex items-center justify-between"><span className="text-[0.625rem] text-slate-500">{t('Bounded to the most recent 100 persisted revisions.')}</span><div className="flex items-center gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5">{t('Close')}</button><button type="button" disabled={!selected} onClick={() => { if (selected) { onRestoreVersion(selected); onClose(); } }} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 flex items-center gap-1.5 disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5" />{t('Restore')}</button></div></div>
    </div>
  </div>;
};
