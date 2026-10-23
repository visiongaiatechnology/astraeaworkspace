// STATUS: PLATIN — persisted custom status mappings
import React, { useState } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { TaskCanonicalStatus, TaskItem, TaskStatusDefinition } from '../../../shared/contracts/workspace';
import { createStableTaskId } from '../model/taskModel';

interface TaskStatusManagerProps {
  tasks: TaskItem[];
  definitions: TaskStatusDefinition[];
  onChange: (definitions: TaskStatusDefinition[]) => void;
}

const CANONICAL: Array<{ id: TaskCanonicalStatus; label: string }> = [
  { id: 'not_started', label: 'Not started' }, { id: 'active', label: 'Active' },
  { id: 'blocked', label: 'Blocked' }, { id: 'waiting', label: 'Waiting' },
  { id: 'done', label: 'Done' }, { id: 'cancelled', label: 'Cancelled' },
];

export const TaskStatusManager: React.FC<TaskStatusManagerProps> = ({ tasks, definitions, onChange }) => {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [mapsTo, setMapsTo] = useState<TaskCanonicalStatus>('active');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const clean = label.trim();
    if (!clean) return;
    if (definitions.some((item) => item.label.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
      setError('A status with this label already exists.'); return;
    }
    const order = definitions.reduce((max, item) => Math.max(max, item.order), -1) + 1;
    onChange([...definitions, { id: createStableTaskId('status'), label: clean.slice(0, 128), mapsTo, order }]);
    setLabel(''); setError(null);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/45 overflow-hidden">
      <button type="button" onClick={() => setOpen((value) => !value)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.04]">
        <span className="flex items-center gap-2"><Settings2 className="w-3.5 h-3.5 text-blue-400" /> Status mappings</span>
        <span className="text-[0.625rem] text-slate-600">{definitions.length} definitions</span>
      </button>
      {open && <div className="border-t border-white/10 p-3 space-y-2">
        {definitions.slice().sort((a, b) => a.order - b.order).map((definition) => {
          const inUse = tasks.some((task) => task.status === definition.id);
          return <div key={definition.id} className="grid grid-cols-[minmax(0,1fr)_150px_34px] gap-2 items-center">
            <input value={definition.label} disabled={definition.system} onChange={(event) => onChange(definitions.map((item) => item.id === definition.id ? { ...item, label: event.target.value.slice(0, 128) } : item))} className="min-w-0 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[0.6875rem] text-slate-200 disabled:text-slate-500" />
            <select value={definition.mapsTo} disabled={definition.system} onChange={(event) => onChange(definitions.map((item) => item.id === definition.id ? { ...item, mapsTo: event.target.value as TaskCanonicalStatus } : item))} className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300 disabled:text-slate-500">
              {CANONICAL.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button type="button" disabled={definition.system || inUse} onClick={() => onChange(definitions.filter((item) => item.id !== definition.id))} aria-label={inUse ? 'Status is in use' : 'Delete custom status'} title={inUse ? 'Status is in use' : 'Delete custom status'} className="p-2 rounded-lg text-slate-600 hover:text-rose-400 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>;
        })}
        <div className="grid grid-cols-[minmax(0,1fr)_150px_34px] gap-2 items-center pt-2 border-t border-white/[0.06]">
          <input value={label} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder="Custom status" className="min-w-0 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[0.6875rem] text-slate-200" />
          <select value={mapsTo} onChange={(event) => setMapsTo(event.target.value as TaskCanonicalStatus)} className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300">{CANONICAL.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <button aria-label="Add task status" type="button" disabled={!label.trim()} onClick={add} className="p-2 rounded-lg bg-blue-600 text-white disabled:opacity-30"><Plus className="w-3.5 h-3.5" /></button>
        </div>
        {error && <div className="text-[0.625rem] text-rose-400">{error}</div>}
      </div>}
    </div>
  );
};
