// STATUS: DIAMANT VGT SUPREME — accessible Notes search controls with saved-query persistence

import React, { useState } from 'react';
import type { NoteSavedSearch } from '../../../shared/contracts/workspace';
import { Archive, BookmarkPlus, CalendarDays, Heart, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { NotesSearchScope } from './notesSearchEngine';

interface NotesSearchControlsProps {
  query: string;
  onQueryChange: (query: string) => void;
  scope: NotesSearchScope;
  onScopeChange: (scope: NotesSearchScope) => void;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (show: boolean) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  savedSearches: NoteSavedSearch[];
  selectedSavedSearchId: string | null;
  onApplySavedSearch: (id: string | null) => void;
  onSaveSearch: (name: string) => void;
  onDeleteSavedSearch: (id: string) => void;
}

export const NotesSearchControls: React.FC<NotesSearchControlsProps> = ({
  query, onQueryChange, scope, onScopeChange, showArchived, onShowArchivedChange,
  favoritesOnly, onFavoritesOnlyChange, dateFrom, onDateFromChange, dateTo, onDateToChange,
  savedSearches, selectedSavedSearchId, onApplySavedSearch, onSaveSearch, onDeleteSavedSearch,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const save = () => {
    const name = saveName.trim();
    if (!name) return;
    onSaveSearch(name);
    setSaveName('');
  };

  return <div className="space-y-1.5">
    <div className="relative">
      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={'Search…  "exact phrase"  tag:idea  prop:status=open'}
        aria-label="Search notes"
        className="w-full bg-slate-950/80 border border-white/10 rounded-lg pl-8 pr-16 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
      />
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
        {query && <button type="button" onClick={() => onQueryChange('')} className="p-1 text-slate-500 hover:text-slate-300" aria-label="Clear search"><X className="w-3 h-3" /></button>}
        <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className={`p-1 rounded ${advancedOpen ? 'text-blue-300 bg-blue-500/15' : 'text-slate-500 hover:text-slate-300'}`} aria-expanded={advancedOpen} aria-label="Advanced search"><SlidersHorizontal className="w-3 h-3" /></button>
      </div>
    </div>

    <div className="flex items-center gap-1 text-[0.625rem]" role="group" aria-label="Search scope">
      {(['page', 'section', 'notebook', 'all'] as NotesSearchScope[]).map((candidate) => <button
        type="button"
        key={candidate}
        onClick={() => onScopeChange(candidate)}
        className={`px-1.5 py-1 rounded border ${scope === candidate ? 'border-blue-500/50 bg-blue-500/15 text-blue-300' : 'border-white/10 text-slate-500 hover:text-slate-300'}`}
      >{candidate === 'page' ? 'Page' : candidate === 'section' ? 'Section' : candidate === 'notebook' ? 'Notebook' : 'All'}</button>)}
      <button type="button" onClick={() => onFavoritesOnlyChange(!favoritesOnly)} className={`ml-auto p-1 rounded border ${favoritesOnly ? 'border-rose-500/50 bg-rose-500/15 text-rose-300' : 'border-white/10 text-slate-500 hover:text-rose-300'}`} aria-label="Favorites only" title="Favorites only" aria-pressed={favoritesOnly}><Heart className="w-3 h-3" fill={favoritesOnly ? 'currentColor' : 'none'} /></button>
      <button type="button" onClick={() => onShowArchivedChange(!showArchived)} className={`p-1 rounded border ${showArchived ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-white/10 text-slate-500 hover:text-amber-300'}`} aria-label="Include archived notes" title="Include archived notes" aria-pressed={showArchived}><Archive className="w-3 h-3" /></button>
    </div>

    {advancedOpen && <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-2 space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[0.5625rem] text-slate-500"><span className="flex items-center gap-1 mb-1"><CalendarDays className="w-2.5 h-2.5" />From</span><input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} className="w-full bg-slate-950 border border-white/10 rounded px-1.5 py-1 text-[0.625rem] text-slate-300" /></label>
        <label className="text-[0.5625rem] text-slate-500"><span className="flex items-center gap-1 mb-1"><CalendarDays className="w-2.5 h-2.5" />To</span><input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} className="w-full bg-slate-950 border border-white/10 rounded px-1.5 py-1 text-[0.625rem] text-slate-300" /></label>
      </div>
      <div className="text-[0.5625rem] leading-relaxed text-slate-600">Filters: <span className="text-slate-500">tag:</span>, <span className="text-slate-500">prop:key=value</span>, <span className="text-slate-500">file:</span>, <span className="text-slate-500">mime:</span>, <span className="text-slate-500">source:ocr|handwriting|transcript</span>, <span className="text-slate-500">after:</span>, <span className="text-slate-500">before:</span>, <span className="text-slate-500">is:favorite|pinned|archived</span>.</div>
      <div className="flex gap-1">
        <input value={saveName} onChange={(event) => setSaveName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} placeholder="Saved search name" maxLength={96} className="min-w-0 flex-1 bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" />
        <button type="button" onClick={save} disabled={!saveName.trim()} className="p-1.5 rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 disabled:opacity-30" aria-label="Save current search" title="Save current search"><BookmarkPlus className="w-3 h-3" /></button>
      </div>
      {savedSearches.length > 0 && <div className="flex gap-1">
        <select value={selectedSavedSearchId ?? ''} onChange={(event) => onApplySavedSearch(event.target.value || null)} aria-label="Saved searches" className="min-w-0 flex-1 bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-300"><option value="">Saved searches…</option>{savedSearches.map((search) => <option key={search.id} value={search.id}>{search.name}</option>)}</select>
        {selectedSavedSearchId && <button type="button" onClick={() => onDeleteSavedSearch(selectedSavedSearchId)} className="p-1.5 rounded border border-red-500/20 text-red-300 hover:bg-red-500/10" aria-label="Delete saved search" title="Delete saved search"><Trash2 className="w-3 h-3" /></button>}
      </div>}
    </div>}
  </div>;
};
