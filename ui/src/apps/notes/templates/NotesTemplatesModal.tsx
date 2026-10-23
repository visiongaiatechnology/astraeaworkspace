// STATUS: PLATIN — Notes templates dialog, bound to the one dialog contract (W-432)
import React, { useState } from 'react';
import type { NoteNotebook, NoteTemplateRecord } from '../../../shared/contracts/workspace';
import { CopyPlus, FileStack, Save, Trash2, X } from 'lucide-react';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

interface NotesTemplatesModalProps {
  isOpen: boolean;
  notebook: NoteNotebook;
  onClose: () => void;
  onSaveTemplate: (scope: 'page' | 'section' | 'notebook', name: string) => void;
  onInstantiateTemplate: (template: NoteTemplateRecord) => void;
  onDeleteTemplate: (templateId: string) => void;
}

export const NotesTemplatesModal: React.FC<NotesTemplatesModalProps> = ({ isOpen, notebook, onClose, onSaveTemplate, onInstantiateTemplate, onDeleteTemplate }) => {
  const [scope, setScope] = useState<'page' | 'section' | 'notebook'>('page');
  const [name, setName] = useState('');
  const dialogA11y = useNotesDialogA11y(isOpen, onClose);
  if (!isOpen) return null;
  const templates = notebook.templates ?? [];
  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Notes templates">
    <div className="w-full max-w-xl max-h-[80vh] overflow-hidden bg-slate-900 border border-white/15 rounded-2xl shadow-2xl flex flex-col">
      <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-bold text-slate-100"><FileStack className="w-4 h-4 text-cyan-400" />Templates</span><button aria-label="Close Notes Templates dialog" type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button></div>
      <div className="p-4 border-b border-white/10 grid grid-cols-[110px_1fr_auto] gap-2"><select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="bg-slate-950 border border-white/10 rounded-lg px-2 text-xs text-slate-300"><option value="page">Page</option><option value="section">Section</option><option value="notebook">Notebook</option></select><input value={name} onChange={(event) => setName(event.target.value)} maxLength={240} data-notes-dialog-initial-focus placeholder="Template name" className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50" /><button type="button" disabled={!name.trim()} onClick={() => { onSaveTemplate(scope, name.trim()); setName(''); }} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold disabled:opacity-40 flex items-center gap-1"><Save className="w-3.5 h-3.5" />Save</button></div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">{templates.map((template) => <div key={template.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-white/[0.08]"><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-200 truncate">{template.name}</div><div className="text-[0.625rem] uppercase tracking-wider text-slate-500">{template.scope} · {new Date(template.updatedAt).toLocaleDateString()}</div></div><button type="button" onClick={() => onInstantiateTemplate(template)} className="px-2 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 text-[0.6875rem] flex items-center gap-1"><CopyPlus className="w-3 h-3" />Create</button><button type="button" onClick={() => onDeleteTemplate(template.id)} className="p-1.5 text-slate-500 hover:text-red-300" aria-label="Delete template" title="Delete template"><Trash2 className="w-3.5 h-3.5" /></button></div>)}{templates.length === 0 && <div className="py-10 text-center text-xs text-slate-500">No custom templates yet.</div>}</div>
    </div>
  </div>;
};
