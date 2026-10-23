// STATUS: DIAMANT VGT SUPREME — fast capture, shell bridge, clipboard and task templates
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, CopyPlus, Inbox, Keyboard, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { TaskCaptureState, TaskItem, TaskRecurrenceFrequency } from '../../../shared/contracts/workspace';
import {
  consumeTaskQuickAddDraft,
  createCapturedTask,
  createTaskCaptureTemplate,
  duplicateTaskForCapture,
  instantiateTaskTemplate,
} from './taskCapture';

interface TaskCapturePanelProps {
  tasks: TaskItem[];
  state: TaskCaptureState;
  localIdentity: string;
  onChangeState: (state: TaskCaptureState) => void;
  onCreateTask: (task: TaskItem) => void;
}

export const TaskCapturePanel: React.FC<TaskCapturePanelProps> = ({ tasks, state, localIdentity, onChangeState, onCreateTask }) => {
  const [text, setText] = useState('');
  const [sourceUri, setSourceUri] = useState<string | undefined>(undefined);
  const [templateName, setTemplateName] = useState('');
  const [templateRecurrence, setTemplateRecurrence] = useState<'none' | TaskRecurrenceFrequency>('none');
  const [duplicateId, setDuplicateId] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const draft = consumeTaskQuickAddDraft();
    if (!draft) return;
    setText(draft.title ?? '');
    setSourceUri(draft.sourceUri);
    inputRef.current?.focus();
  }, []);

  const context = useMemo(() => ({ actor: localIdentity, source: sourceUri ? 'astraea.tasks.capture.workspace' : 'astraea.tasks.capture' }), [localIdentity, sourceUri]);

  const capture = (raw = text) => {
    try {
      const task = createCapturedTask(raw, { naturalLanguageDates: state.naturalLanguageDatesEnabled, sourceUri }, context);
      onCreateTask(task); setText(''); setSourceUri(undefined); setMessage('Task captured locally.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Capture failed.'); }
  };

  const captureClipboard = async () => {
    try {
      const clip = await navigator.clipboard?.readText();
      if (!clip) throw new Error('Clipboard does not contain readable text.');
      setText(clip); setSourceUri(undefined); inputRef.current?.focus();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Clipboard capture failed.'); }
  };

  const saveTemplate = () => {
    try {
      const recurrenceSpec = templateRecurrence === 'none' ? undefined : { frequency: templateRecurrence, interval: 1, end: { mode: 'never' as const } };
      const template = createTaskCaptureTemplate({ name: templateName, titlePattern: text || 'New task', priority: 'medium', recurrenceSpec });
      onChangeState({ ...state, templates: [...state.templates, template] }); setTemplateName(''); setMessage('Template saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Template failed.'); }
  };

  const duplicateSelected = () => {
    const source = tasks.find((task) => task.id === duplicateId); if (!source) return;
    onCreateTask(duplicateTaskForCapture(source, { actor: localIdentity, source: 'astraea.tasks.duplicate' }));
    setMessage('Task duplicated with a new stable ID.');
  };

  return <div className="rounded-2xl border border-white/[0.08] bg-slate-900/40 p-3 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Inbox className="w-4 h-4 text-cyan-400" /><div><h3 className="text-xs font-semibold text-slate-200">Capture</h3><p className="text-[0.5625rem] text-slate-600">Fast add · Ctrl/Cmd+Shift+A anywhere in Astraea</p></div></div>
      <label className="flex items-center gap-1.5 text-[0.625rem] text-slate-500"><input type="checkbox" checked={state.naturalLanguageDatesEnabled} onChange={(event) => onChangeState({ ...state, naturalLanguageDatesEnabled: event.target.checked })} />Local natural-language dates</label>
    </div>
    <div className="flex flex-wrap gap-2">
      <input ref={inputRef} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') capture(); }} placeholder="e.g. Review release tomorrow" className="vgt-input flex-1 min-w-[240px] text-[0.6875rem]" />
      <button type="button" data-vgt-theme-active-control="solid" onClick={() => capture()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[0.6875rem] font-medium shadow-sm transition-all hover:brightness-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2"><Plus className="w-3.5 h-3.5" />Fast add</button>
      <button type="button" onClick={() => void captureClipboard()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-slate-300 text-[0.6875rem]"><Clipboard className="w-3.5 h-3.5" />Clipboard</button>
    </div>
    {sourceUri && <div className="text-[0.5625rem] text-cyan-400/80 font-mono truncate" title={sourceUri}>Source: {sourceUri}</div>}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-400"><Sparkles className="w-3 h-3" />Templates & recurring templates</div>
        <div className="flex flex-wrap gap-2">
          <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" className="vgt-input flex-1 text-[0.625rem]" />
          <select value={templateRecurrence} onChange={(event) => setTemplateRecurrence(event.target.value as 'none' | TaskRecurrenceFrequency)} className="vgt-input text-[0.625rem]"><option value="none">One-off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
          <button type="button" onClick={saveTemplate} className="rounded-lg border border-[var(--vgt-control-border)] px-2 py-1.5 text-[0.625rem] text-[var(--vgt-control-text)] transition-colors hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2">Save</button>
        </div>
        <div className="space-y-1">{state.templates.map((template) => <div key={template.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/40 px-2 py-1.5"><button type="button" onClick={() => onCreateTask(instantiateTaskTemplate(template, undefined, { actor: localIdentity, source: 'astraea.tasks.template' }))} className="min-w-0 flex-1 truncate text-left text-[0.625rem] text-slate-300">{template.name}{template.recurrenceSpec ? ` · ${template.recurrenceSpec.frequency}` : ''}</button><button type="button" aria-label="Delete task template" onClick={() => onChangeState({ ...state, templates: state.templates.filter((item) => item.id !== template.id) })} className="text-slate-600 hover:text-rose-400"><Trash2 className="w-3 h-3" /></button></div>)}</div>
      </section>
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-400"><CopyPlus className="w-3 h-3" />Duplicate task</div>
        <div className="flex gap-2"><select value={duplicateId} onChange={(event) => setDuplicateId(event.target.value)} className="vgt-input min-w-0 flex-1 text-[0.625rem]"><option value="">Select task…</option>{tasks.slice(0, 500).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><button type="button" disabled={!duplicateId} onClick={duplicateSelected} className="rounded-lg border border-[var(--vgt-control-border)] px-2.5 py-1.5 text-[0.625rem] text-[var(--vgt-control-text)] transition-colors hover:bg-[var(--vgt-control-hover)] disabled:cursor-not-allowed disabled:opacity-[var(--vgt-control-disabled-opacity)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2">Duplicate</button></div>
        <div className="flex items-start gap-1.5 text-[0.5625rem] text-slate-600"><Keyboard className="w-3 h-3 mt-0.5" /><span>Shell quick-add can carry selected Writer/Notes/PDF text into this field with a stable Workspace source link.</span></div>
      </section>
    </div>
    {message && <p role="status" className="text-[0.625rem] text-slate-500">{message}</p>}
  </div>;
};
