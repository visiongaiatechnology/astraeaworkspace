// STATUS: PLATIN — personal organization views over canonical TaskItem[]
import React, { useMemo, useState } from 'react';
import { Folder, List, Plus, Save, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react';
import type {
  TaskFilterDefinition,
  TaskOrganizationState,
  TaskStatusDefinition,
} from '../../../shared/contracts/work-management/workspaceWork';
import type { TaskItem } from '../../../shared/contracts/work-management/workspaceWork';
import {
  TaskOrganizationSelection,
  createSavedFilter,
  createSmartList,
  createTaskFolder,
  createTaskList,
  filterTasksForSelection,
  normalizeTaskOrganization,
} from '../state/taskOrganization';

interface TaskOrganizationPanelProps {
  tasks: TaskItem[];
  organization: TaskOrganizationState;
  statusDefinitions: TaskStatusDefinition[];
  selection: TaskOrganizationSelection;
  currentFilter: TaskFilterDefinition;
  onSelect: (selection: TaskOrganizationSelection) => void;
  onChange: (state: TaskOrganizationState) => void;
}

const BUILT_INS: Array<{ id: TaskOrganizationSelection; label: string }> = [
  { id: 'builtin:my_day', label: 'My Day' },
  { id: 'builtin:inbox', label: 'Inbox' },
  { id: 'builtin:all', label: 'All Tasks' },
  { id: 'builtin:important', label: 'Important' },
  { id: 'builtin:planned', label: 'Planned' },
  { id: 'builtin:upcoming', label: 'Upcoming' },
  { id: 'builtin:overdue', label: 'Overdue' },
  { id: 'builtin:completed', label: 'Completed' },
  { id: 'builtin:assigned_to_me', label: 'Assigned to Me' },
  { id: 'builtin:created_by_me', label: 'Created by Me' },
  { id: 'builtin:waiting_blocked', label: 'Waiting / Blocked' },
];

export const TaskOrganizationPanel: React.FC<TaskOrganizationPanelProps> = ({
  tasks,
  organization,
  statusDefinitions,
  selection,
  currentFilter,
  onSelect,
  onChange,
}) => {
  const normalized = useMemo(() => normalizeTaskOrganization(organization), [organization]);
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState('');

  const count = (id: TaskOrganizationSelection) => filterTasksForSelection(tasks, id, normalized, undefined, statusDefinitions).length;
  const cleanName = name.trim();

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-slate-900/55 shadow-xl backdrop-blur-xl overflow-hidden" aria-label="Task organization">
      <button type="button" onClick={() => setOpen((value) => !value)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-200"><SlidersHorizontal className="w-4 h-4 text-cyan-400" /> Personal organization</span>
        <span className="text-[0.625rem] text-slate-500">{normalized.localIdentity}</span>
      </button>
      {open && <div className="border-t border-white/[0.07] p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {BUILT_INS.map((item) => <button key={item.id} type="button" aria-pressed={selection === item.id} data-vgt-theme-active-control={selection === item.id ? 'soft' : undefined} onClick={() => onSelect(item.id)} className={`px-2.5 py-1.5 rounded-lg border text-[0.625rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2 ${selection === item.id ? '' : 'border-white/10 bg-slate-950/60 text-slate-400 hover:text-slate-200'}`}>{item.label} <span className="ml-1 text-slate-600">{count(item.id)}</span></button>)}
        </div>

        {(normalized.folders.length > 0 || normalized.lists.length > 0) && <div className="space-y-2">
          <div className="text-[0.5625rem] uppercase tracking-widest text-slate-600">Lists & folders</div>
          {normalized.folders.map((folder) => <div key={folder.id} className="rounded-lg border border-white/[0.07] bg-slate-950/45 p-2">
            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-400"><Folder className="w-3 h-3" /> {folder.name}</span><button type="button" disabled={normalized.lists.some((list) => list.folderId === folder.id)} onClick={() => onChange({ ...normalized, folders: normalized.folders.filter((item) => item.id !== folder.id) })} className="text-slate-700 hover:text-rose-400 disabled:opacity-20" aria-label="Delete empty folder" title="Delete empty folder"><Trash2 className="w-3 h-3" /></button></div>
            <div className="mt-1.5 flex flex-wrap gap-1">{normalized.lists.filter((list) => list.folderId === folder.id).map((list) => <button key={list.id} type="button" aria-pressed={selection === `list:${list.id}`} data-vgt-theme-active-control={selection === `list:${list.id}` ? 'soft' : undefined} onClick={() => onSelect(`list:${list.id}`)} className={`px-2 py-1 rounded border text-[0.625rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2 ${selection === `list:${list.id}` ? '' : 'border-white/10 text-slate-500'}`}>{list.name} · {count(`list:${list.id}`)}</button>)}</div>
          </div>)}
          {normalized.lists.filter((list) => !list.folderId).map((list) => <button key={list.id} type="button" aria-pressed={selection === `list:${list.id}`} data-vgt-theme-active-control={selection === `list:${list.id}` ? 'soft' : undefined} onClick={() => onSelect(`list:${list.id}`)} className={`inline-flex items-center gap-1.5 mr-1 px-2 py-1 rounded border text-[0.625rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] focus-visible:outline-offset-2 ${selection === `list:${list.id}` ? '' : 'border-white/10 text-slate-500'}`}><List className="w-3 h-3" />{list.name} · {count(`list:${list.id}`)}</button>)}
        </div>}

        {(normalized.smartLists.length > 0 || normalized.savedFilters.length > 0) && <div className="flex flex-wrap gap-1.5">
          {normalized.smartLists.map((smart) => <button key={smart.id} type="button" onClick={() => onSelect(`smart:${smart.id}`)} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[0.625rem] ${selection === `smart:${smart.id}` ? 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200' : 'border-white/10 text-slate-500'}`}><Sparkles className="w-3 h-3" />{smart.name} · {count(`smart:${smart.id}`)}</button>)}
          {normalized.savedFilters.map((saved) => <button key={saved.id} type="button" onClick={() => onSelect(`saved:${saved.id}`)} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[0.625rem] ${selection === `saved:${saved.id}` ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 text-slate-500'}`}><Save className="w-3 h-3" />{saved.name} · {count(`saved:${saved.id}`)}</button>)}
        </div>}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px_auto] gap-2 pt-2 border-t border-white/[0.06]">
          <input value={name} onChange={(event) => setName(String(event.target.value).slice(0, 128))} placeholder="Name for list / folder / smart view" className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-[0.6875rem] text-slate-200 outline-none focus:border-cyan-500/40" />
          <select value={folderId} onChange={(event) => setFolderId(String(event.target.value))} className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-[0.6875rem] text-slate-300"><option value="">No folder</option>{normalized.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
          <div className="flex flex-wrap gap-1">
            <button type="button" disabled={!cleanName} onClick={() => { const folder = createTaskFolder(cleanName); onChange({ ...normalized, folders: [...normalized.folders, folder] }); setName(''); }} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[0.625rem] text-slate-300 disabled:opacity-30"><Plus className="inline w-3 h-3 mr-1" />Folder</button>
            <button type="button" disabled={!cleanName} onClick={() => { const list = createTaskList(cleanName, folderId || undefined); onChange({ ...normalized, lists: [...normalized.lists, list] }); setName(''); }} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[0.625rem] text-slate-300 disabled:opacity-30">List</button>
            <button type="button" disabled={!cleanName} onClick={() => { const smart = createSmartList(cleanName, currentFilter); onChange({ ...normalized, smartLists: [...normalized.smartLists, smart] }); setName(''); }} className="px-2.5 py-1.5 rounded-lg border border-fuchsia-500/20 text-[0.625rem] text-fuchsia-300 disabled:opacity-30">Smart</button>
            <button type="button" disabled={!cleanName} onClick={() => { const saved = createSavedFilter(cleanName, currentFilter); onChange({ ...normalized, savedFilters: [...normalized.savedFilters, saved] }); setName(''); }} className="px-2.5 py-1.5 rounded-lg border border-emerald-500/20 text-[0.625rem] text-emerald-300 disabled:opacity-30">Save filter</button>
          </div>
        </div>
      </div>}
    </section>
  );
};
