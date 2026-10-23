// STATUS: DIAMANT VGT SUPREME — real Notes cross-app dispatch with canonical Workspace targets
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, CheckSquare, FileText, LockKeyhole, Share2, X } from 'lucide-react';
import type { NotePage, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

interface ChecklistCandidate {
  lineIndex: number;
  title: string;
  checked: boolean;
}

type ActionResult = string | void | Promise<string | void>;

interface NotesCrossAppModalProps {
  isOpen: boolean;
  page: NotePage;
  workspaceDocuments: readonly WorkspaceDocument[];
  /** AST-0736: reads the current body selection so a passage — not only the whole note — can be sent. */
  selectionText?: () => string | null;
  onClose: () => void;
  onCreateWriterDraft: (selection?: string) => ActionResult;
  onConvertTasks: (lineIndices: readonly number[], targetDocumentId?: string) => ActionResult;
  onSendVault: (targetDocumentId: string) => ActionResult;
}

function checklistFromPage(page: NotePage): ChecklistCandidate[] {
  return page.content.split('\n').flatMap((line, lineIndex) => {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/);
    return match ? [{ lineIndex, title: match[2].trim().slice(0, 500), checked: match[1].toLowerCase() === 'x' }] : [];
  }).slice(0, 256);
}

export const NotesCrossAppModal: React.FC<NotesCrossAppModalProps> = ({
  isOpen,
  page,
  workspaceDocuments,
  selectionText,
  onClose,
  onCreateWriterDraft,
  onConvertTasks,
  onSendVault,
}) => {
  const checklist = useMemo(() => checklistFromPage(page), [page]);
  const [activeTab, setActiveTab] = useState<'tasks' | 'writer' | 'share'>('tasks');
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [taskTargetId, setTaskTargetId] = useState('');
  const [vaultTargetId, setVaultTargetId] = useState('');
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState('');
  const dialogA11y = useNotesDialogA11y(isOpen, onClose);

  const taskTargets = workspaceDocuments.filter((document) => document.kind === 'Tasks');
  const vaultTargets = workspaceDocuments.filter((document) => document.kind === 'Vault');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedLines(new Set(checklist.map((item) => item.lineIndex)));
    setTaskTargetId(taskTargets[0]?.id ?? '');
    setVaultTargetId(vaultTargets[0]?.id ?? '');
    setStatus(null);
    setBusy(false);
  }, [isOpen, page.id, checklist.length]); // target lists are stable for the lifetime of the open dialog

  if (!isOpen) return null;

  const run = async (action: () => ActionResult, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await action();
      setStatus({ kind: 'success', text: typeof result === 'string' && result.trim() ? result : fallback });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Cross-app action failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none" role="dialog" aria-modal="true" aria-label="Notes cross-app integration">
      <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col text-xs">
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2"><Share2 className="w-4 h-4 text-cyan-400" /><span className="font-bold text-slate-100 text-sm">Cross-App Ecosystem</span></div>
          <button type="button" aria-label="Close cross-app integration" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-3 border-b border-white/10 bg-slate-950/50 p-1 gap-1">
          {([
            ['tasks', CheckSquare, 'Tasks'], ['writer', FileText, 'Writer'], ['share', LockKeyhole, 'Share'],
          ] as const).map(([tab, Icon, label]) => (
            <button key={tab} type="button" onClick={() => { setActiveTab(tab); setStatus(null); }} className={`py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors ${activeTab === tab ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Icon className="w-3.5 h-3.5" /><span>{label}</span>
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 min-h-[290px]">
          {status && <div role="status" className={`p-2.5 rounded-lg border flex items-start gap-2 ${status.kind === 'success' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-rose-500/15 border-rose-500/40 text-rose-200'}`}><Check className="w-4 h-4 mt-0.5 shrink-0" /><span>{status.text}</span></div>}

          {activeTab === 'tasks' && <div className="space-y-3">
            <div><div className="font-semibold text-slate-200">Checklist → Astraea Tasks</div><p className="text-slate-500 mt-1">Selected checklist lines become canonical Task objects linked back to this exact note and line.</p></div>
            <label className="block space-y-1"><span className="text-[0.625rem] uppercase tracking-wider text-slate-500">Target</span><select value={taskTargetId} onChange={(event) => setTaskTargetId(event.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200"><option value="">Create a new Tasks document</option>{taskTargets.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}</select></label>
            {checklist.length ? <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">{checklist.map((item) => <label key={item.lineIndex} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-white/5 cursor-pointer"><input type="checkbox" checked={selectedLines.has(item.lineIndex)} onChange={(event) => setSelectedLines((previous) => { const next = new Set(previous); if (event.target.checked) next.add(item.lineIndex); else next.delete(item.lineIndex); return next; })} /><span className={item.checked ? 'line-through text-slate-500' : 'text-slate-200'}>{item.title}</span></label>)}</div> : <div className="p-5 text-center text-slate-500 bg-slate-950 rounded-lg border border-white/5">No Markdown checklist items found.</div>}
          </div>}

          {activeTab === 'writer' && <div className="space-y-3"><div><div className="font-semibold text-slate-200">Note → Writer draft</div><p className="text-slate-500 mt-1">Creates a real Writer document with structured paragraphs and a stable source-note URI. The note keeps a back-reference to the draft. Select a passage in the body first to send only that passage as a copy plus link.</p></div><div className="p-3 bg-slate-950 rounded-lg border border-white/10"><div className="font-bold text-slate-200">{page.title}</div><div className="text-slate-500 text-[0.6875rem] line-clamp-5 mt-1 font-mono whitespace-pre-wrap">{page.content}</div></div><div className="flex items-center gap-2"><button type="button" onClick={() => setSelection(selectionText?.() ?? '')} className="rounded border border-white/10 px-2 py-1 text-[0.625rem] text-slate-300 hover:text-cyan-200">Use current body selection</button>{selection && <span className="text-[0.625rem] text-cyan-200 truncate">“{selection.slice(0, 60)}…”</span>}</div>{selection && <div className="rounded border border-cyan-500/20 bg-cyan-500/[0.06] p-2 text-[0.625rem] text-cyan-100 whitespace-pre-wrap max-h-24 overflow-auto">{selection}</div>}</div>}

          {activeTab === 'share' && <div className="space-y-4">
            <div><div className="font-semibold text-slate-200">Attachments → Vault</div><p className="text-slate-500 mt-1">Re-hashes every payload before transfer and rejects digest mismatches.</p><div className="flex gap-2 mt-2"><select value={vaultTargetId} onChange={(event) => setVaultTargetId(event.target.value)} className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-slate-200"><option value="">Select Vault…</option>{vaultTargets.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}</select><button type="button" disabled={!vaultTargetId || busy || !(page.attachments?.length)} onClick={() => void run(() => onSendVault(vaultTargetId), 'Attachments transferred to Vault.' )} className="px-3 rounded-lg bg-cyan-600 text-white disabled:opacity-40">Send</button></div></div>
          </div>}
        </div>

        <div className="px-4 py-3 bg-slate-950 border-t border-white/10 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5">Close</button>
          {activeTab === 'tasks' && <button type="button" disabled={busy || selectedLines.size === 0} onClick={() => void run(() => onConvertTasks([...selectedLines].sort((a, b) => a - b), taskTargetId || undefined), 'Checklist converted to Tasks.' )} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-500 flex items-center gap-1.5 disabled:opacity-40"><span>Convert selected</span><ArrowRight className="w-3.5 h-3.5" /></button>}
          {activeTab === 'writer' && <button type="button" disabled={busy} onClick={() => void run(() => onCreateWriterDraft(selection || undefined), selection ? 'Writer draft created from the selection.' : 'Writer draft created.' )} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-500 flex items-center gap-1.5 disabled:opacity-40"><span>{selection ? 'Send selection to Writer' : 'Create Writer draft'}</span><ArrowRight className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
    </div>
  );
};
