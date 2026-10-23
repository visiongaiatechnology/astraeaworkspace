// STATUS: DIAMANT VGT SUPREME — Notes cross-workspace embed chooser
import React, { useMemo, useState } from 'react';
import { Link2, RefreshCw, Snowflake, X } from 'lucide-react';
import type { NoteWorkspaceEmbedData, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { createNoteWorkspaceEmbed, listNoteWorkspaceEmbedTargets } from './notesWorkspaceEmbed';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { notesExtendedText } from '../notesExtendedLocale';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

interface Props {
  isOpen: boolean;
  currentDocumentId: string;
  workspaceDocuments: readonly WorkspaceDocument[];
  onClose: () => void;
  onInsert: (embed: NoteWorkspaceEmbedData) => void;
}

const SUPPORTED = new Set(['Writer','Grid','Present','PdfStudio','Whiteboard','Draw','Database','Tasks','Planner','Projects']);

export const NotesWorkspaceEmbedModal: React.FC<Props> = ({ isOpen, currentDocumentId, workspaceDocuments, onClose, onInsert }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => notesExtendedText(message, locale);
  const sources = useMemo(() => workspaceDocuments.filter((document) => document.id !== currentDocumentId && SUPPORTED.has(document.kind) && listNoteWorkspaceEmbedTargets(document).length > 0), [currentDocumentId, workspaceDocuments]);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<'Live' | 'Frozen'>('Live');
  const [error, setError] = useState<string | null>(null);
  const source = sources.find((document) => document.id === sourceId) ?? sources[0];
  const targets = useMemo(() => source ? listNoteWorkspaceEmbedTargets(source) : [], [source]);
  const target = targets.find((candidate) => candidate.id === targetId) ?? targets[0];
  const dialogA11y = useNotesDialogA11y(isOpen, onClose);
  if (!isOpen) return null;
  const insert = () => {
    if (!source || !target) { setError(t('No compatible local Workspace source is available.')); return; }
    try { onInsert(createNoteWorkspaceEmbed(source, target, mode)); onClose(); }
    catch { setError(t('Workspace reference could not be created.')); }
  };
  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={t('Insert Workspace embed')}><div className="w-full max-w-2xl rounded-2xl border border-cyan-500/20 bg-slate-950 shadow-2xl overflow-hidden">
    <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3"><Link2 className="w-4 h-4 text-cyan-300"/><div className="flex-1"><div className="text-sm font-bold text-slate-100">{t('Insert local Workspace reference')}</div><div className="text-[0.5625rem] text-slate-500">{t('Stable IDs · bounded local snapshot · no network fetch')}</div></div><button type="button" onClick={onClose} aria-label={t('Close')} className="p-1 text-slate-500 hover:text-white"><X className="w-4 h-4"/></button></header>
    <div className="p-4 space-y-3"><label className="block text-[0.625rem] text-slate-500">{t('Source document')}<select value={source?.id ?? ''} onChange={(event) => { setSourceId(event.target.value); setTargetId(''); setError(null); }} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200">{sources.map((document) => <option key={document.id} value={document.id}>{document.kind} · {document.title}</option>)}</select></label><label className="block text-[0.625rem] text-slate-500">{t('Object / view')}<select value={target?.id ?? ''} onChange={(event) => setTargetId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200">{targets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setMode('Live')} className={`flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs ${mode === 'Live' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 text-slate-500'}`}><RefreshCw className="w-3.5 h-3.5"/>{t('Live')}</button><button type="button" onClick={() => setMode('Frozen')} className={`flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs ${mode === 'Frozen' ? 'border-slate-500/40 bg-slate-800 text-slate-200' : 'border-white/10 text-slate-500'}`}><Snowflake className="w-3.5 h-3.5"/>{t('Frozen')}</button></div>
      {source && target && <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[0.625rem] text-slate-400"><div className="font-semibold text-slate-200">{target.label}</div><div className="mt-1 font-mono text-slate-600">{source.id} · v{source.version} · {target.kind}</div></div>}{error && <div className="rounded border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[0.625rem] text-rose-200">{error}</div>}
    </div><footer className="flex justify-end gap-2 border-t border-white/10 px-4 py-3"><button type="button" onClick={onClose} className="rounded border border-white/10 px-3 py-2 text-xs text-slate-400">{t('Cancel')}</button><button type="button" onClick={insert} disabled={!source || !target} className="rounded bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{t('Insert reference')}</button></footer>
  </div></div>;
};
