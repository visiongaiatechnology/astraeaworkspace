import React, { useMemo, useRef, useState } from 'react';
import type { NotePage, NoteSavedSearch, NoteSection } from '../../../shared/contracts/workspace';
import { Calendar, Clock, CornerDownRight, Heart, Pin, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { getPageDepth, type NoteParentRejection } from '../model/notesHierarchy';
import { NOTE_TEMPLATES, type NoteTemplateId } from '../model/noteModel';
import { buildNoteTreeItems, resolveNoteTreeCommand } from './notesPageTree';
import { NOTE_PAGE_DRAG_MIME, createNotePageDragPayload, serializeNotePageDragPayload } from '../canvas/notesCanvasDrop';
import type { NoteSearchResult, NotesSearchScope } from '../search/notesSearchEngine';
import { NotesSearchControls } from '../search/NotesSearchControls';
import type { NotesPageCollection } from '../notebooks/useNotesManager';

interface NotesPagesListProps {
  activeSection: NoteSection | null;
  activePageId: string;
  filteredPages: NotePage[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchScope: NotesSearchScope;
  onSearchScopeChange: (scope: NotesSearchScope) => void;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (show: boolean) => void;
  searchDateFrom: string;
  onSearchDateFromChange: (value: string) => void;
  searchDateTo: string;
  onSearchDateToChange: (value: string) => void;
  searchResultsByPageId: Map<string, NoteSearchResult>;
  /** AST-0684: a truncated scan must be visible, never presented as a complete result set. */
  searchScanTruncated?: boolean;
  searchScannedPages?: number;
  /** AST-0751/AST-0754: how many notes the index deliberately withholds. */
  searchIndexBoundary?: { indexedPages: number; lockedPages: number; sensitivePages: number };
  savedSearches: NoteSavedSearch[];
  selectedSavedSearchId: string | null;
  onApplySavedSearch: (id: string | null) => void;
  onSaveSearch: (name: string) => void;
  onDeleteSavedSearch: (id: string) => void;
  pageCollection: NotesPageCollection;
  onPageCollectionChange: (collection: NotesPageCollection) => void;
  onSelectPage: (id: string) => void;
  onCreatePage: (templateId?: NoteTemplateId | string) => void;
  onCreateDailyNote?: () => void;
  onDeletePage: (id: string) => void;
  onRestorePage: (id: string) => void;
  onSetPageParent: (pageId: string, parentPageId: string | null) => NoteParentRejection | null;
  customPageTemplates?: Array<{ id: string; name: string }>;
  formatTime: (ms: number) => string;
}

/**
 * AST-0654: a rejected hierarchy change is announced (screen reader) and named (visible text), so the
 * outcome is distinguishable without relying on colour alone. `null` renders nothing.
 */
export const NotesHierarchyNotice: React.FC<{ message: string | null }> = ({ message }) => {
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[0.625rem] text-amber-200">
      {message}
    </div>
  );
};

/**
 * AST-0684: a bounded search that stopped early must say so, otherwise the result list looks complete.
 * Exported so the contract is server-renderable and counter-checkable.
 */
export const NotesSearchScanNotice: React.FC<{ truncated: boolean; scannedPages: number }> = ({ truncated, scannedPages }) => {
  if (!truncated) return null;
  // Deterministic grouping instead of `toLocaleString()`, so the message does not depend on the host ICU data.
  const safe = Number.isFinite(scannedPages) ? Math.max(0, Math.trunc(scannedPages)) : 0;
  const formatted = String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (
    <div role="status" aria-live="polite" className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[0.625rem] text-amber-200">
      Search stopped after {formatted} notes. Narrow the scope or the query to see the rest.
    </div>
  );
};

/**
 * AST-0751/AST-0754: the search index deliberately withholds locked notes, and a sensitive note is indexed
 * without ever exposing a preview. That boundary is stated in visible text so "gesperrte Inhalte nicht
 * indexieren" is auditable rather than an invisible assumption. Renders nothing when nothing is withheld.
 */
export const NotesSearchIndexNotice: React.FC<{ boundary?: { indexedPages: number; lockedPages: number; sensitivePages: number } }> = ({ boundary }) => {
  if (!boundary || (boundary.lockedPages === 0 && boundary.sensitivePages === 0)) return null;
  const parts: string[] = [`${boundary.indexedPages} note(s) indexed`];
  if (boundary.lockedPages > 0) parts.push(`${boundary.lockedPages} locked and not indexed`);
  if (boundary.sensitivePages > 0) parts.push(`${boundary.sensitivePages} sensitive without preview`);
  return (
    <div role="status" aria-live="polite" className="rounded-md border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-1 text-[0.625rem] text-[var(--vgt-control-muted)]">
      Search index: {parts.join(' · ')}.
    </div>
  );
};

function SearchHitPreview({ hit }: { hit: NoteSearchResult['hits'][number] }) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  hit.ranges.forEach((range, index) => {
    if (range.start > cursor) nodes.push(hit.text.slice(cursor, range.start));
    nodes.push(<mark key={`${range.start}-${range.end}-${index}`} className="bg-amber-400/25 text-amber-100 rounded-sm px-0.5">{hit.text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < hit.text.length) nodes.push(hit.text.slice(cursor));
  return <div className="mt-1.5 rounded-md border border-amber-500/10 bg-amber-500/[0.03] px-1.5 py-1 text-[0.5625rem] leading-relaxed text-slate-500"><span className="mr-1 font-semibold text-amber-300/80">{hit.label}:</span>{nodes}</div>;
}

export const NotesPagesList: React.FC<NotesPagesListProps> = ({
  activeSection, activePageId, filteredPages, searchQuery, onSearchChange, searchScope,
  onSearchScopeChange, showArchived, onShowArchivedChange, favoritesOnly,
  onFavoritesOnlyChange, searchDateFrom, onSearchDateFromChange, searchDateTo, onSearchDateToChange,
  searchResultsByPageId, savedSearches, selectedSavedSearchId, onApplySavedSearch, onSaveSearch, onDeleteSavedSearch,
  pageCollection, onPageCollectionChange, onSelectPage,
  onCreatePage, onCreateDailyNote, onDeletePage, onRestorePage, onSetPageParent,
  customPageTemplates = [], formatTime, searchScanTruncated = false, searchScannedPages = 0, searchIndexBoundary,
}) => {
  const [templateId, setTemplateId] = useState<string>('blank');
  const [treeMessage, setTreeMessage] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const liveSectionPages = useMemo(() => activeSection?.pages.filter((page) => !page.trashedAt) ?? [], [activeSection]);
  /**
   * AST-0651/AST-0746: the same visible order is used for rendering and for arrow-key navigation, so a
   * focused row and the pressed arrow key can never disagree. `trash` keeps the flat list — deleted rows
   * are not a hierarchy.
   */
  const treeItems = useMemo(
    () => (pageCollection === 'trash' ? [] : buildNoteTreeItems(liveSectionPages)),
    [liveSectionPages, pageCollection]
  );
  const treeItemByPageId = useMemo(() => new Map(treeItems.map((item) => [item.pageId, item])), [treeItems]);

  const applyParentChange = (pageId: string, parentPageId: string | null) => {
    const rejection = onSetPageParent(pageId, parentPageId);
    setTreeMessage(rejection ? rejection.message : null);
  };

  const handleRowKeyDown = (event: React.KeyboardEvent, pageId: string) => {
    const page = liveSectionPages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    // Rows outside the active section (notebook/global search scope) are not part of the tree, but they
    // must still be openable from the keyboard.
    if (!treeItemByPageId.has(pageId)) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectPage(pageId); }
      return;
    }
    if (!activeSection) return;
    const command = resolveNoteTreeCommand(treeItems, pageId, {
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
    });
    if (!command) return;
    event.preventDefault();
    if (command.type === 'focus') {
      itemRefs.current.get(command.pageId)?.focus();
      return;
    }
    if (command.type === 'open') { onSelectPage(command.pageId); return; }
    if (command.type === 'indent') { applyParentChange(command.pageId, command.parentPageId); return; }
    applyParentChange(command.pageId, command.parentPageId);
  };

  return (
    <section data-vgt-notes-chrome="page-list" className="w-72 bg-slate-900/60 border-r border-white/[0.08] flex flex-col shrink-0">
      <div className="p-3 border-b border-white/[0.08] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider truncate">{pageCollection === 'recent' ? 'Recent Notes' : pageCollection === 'trash' ? 'Trash' : searchScope === 'page' ? 'Current Page' : searchScope === 'section' ? activeSection?.title || 'Pages' : searchScope === 'notebook' ? 'Notebook Search' : 'All Notes'}</span>
          {onCreateDailyNote && pageCollection !== 'trash' && <button type="button" onClick={onCreateDailyNote} className="flex items-center gap-1 px-1.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[0.6875rem] font-medium" title="Create or jump to today's Daily Note"><Calendar className="w-3 h-3" />Daily</button>}
        </div>

        <div className="grid grid-cols-3 gap-1 text-[0.625rem]">
          {(['pages', 'recent', 'trash'] as NotesPageCollection[]).map((collection) => <button type="button" key={collection} onClick={() => onPageCollectionChange(collection)} data-vgt-theme-active-control={pageCollection === collection ? 'soft' : undefined} className={`px-2 py-1 rounded border ${pageCollection === collection ? 'border-blue-500/50 bg-blue-500/15 text-blue-300' : 'border-white/10 text-slate-500 hover:text-slate-300'}`}>{collection === 'pages' ? 'Pages' : collection === 'recent' ? 'Recent' : 'Trash'}</button>)}
        </div>

        {pageCollection !== 'trash' && <div className="flex gap-1.5">
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="min-w-0 flex-1 bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300 focus:outline-none focus:border-blue-500/60" title="New note template">
            {NOTE_TEMPLATES.filter((template) => template.id !== 'daily').map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            {customPageTemplates.length > 0 && <optgroup label="Notebook templates">{customPageTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</optgroup>}
          </select>
          <button type="button" onClick={() => onCreatePage(templateId)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium"><Plus className="w-3 h-3" />New</button>
        </div>}

        <NotesSearchControls
          query={searchQuery}
          onQueryChange={onSearchChange}
          scope={searchScope}
          onScopeChange={onSearchScopeChange}
          showArchived={showArchived}
          onShowArchivedChange={onShowArchivedChange}
          favoritesOnly={favoritesOnly}
          onFavoritesOnlyChange={onFavoritesOnlyChange}
          dateFrom={searchDateFrom}
          onDateFromChange={onSearchDateFromChange}
          dateTo={searchDateTo}
          onDateToChange={onSearchDateToChange}
          savedSearches={savedSearches}
          selectedSavedSearchId={selectedSavedSearchId}
          onApplySavedSearch={onApplySavedSearch}
          onSaveSearch={onSaveSearch}
          onDeleteSavedSearch={onDeleteSavedSearch}
        />
        <NotesSearchScanNotice truncated={searchScanTruncated} scannedPages={searchScannedPages} />
        <NotesSearchIndexNotice boundary={searchIndexBoundary} />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5" role={pageCollection === 'trash' ? undefined : 'tree'} aria-label={pageCollection === 'trash' ? undefined : 'Note page hierarchy'}>
        <NotesHierarchyNotice message={treeMessage} />
        {filteredPages.map((page) => {
          const active = page.id === activePageId;
          const depth = activeSection && activeSection.pages.some((candidate) => candidate.id === page.id) ? Math.min(8, getPageDepth(activeSection, page.id)) : 0;
          const treeItem = treeItemByPageId.get(page.id);
          return <div key={page.id}
            ref={(node) => { if (node) itemRefs.current.set(page.id, node); else itemRefs.current.delete(page.id); }}
            role={treeItem ? 'treeitem' : undefined}
            aria-level={treeItem?.level}
            aria-selected={active}
            aria-expanded={treeItem && treeItem.childIds.length > 0 ? true : undefined}
            tabIndex={page.trashedAt ? -1 : active ? 0 : -1}
            draggable={!page.trashedAt}
            onDragStart={(event) => {
              if (page.trashedAt) return;
              // AST-0686: the card drop target reads this Notes-internal payload (bounded, no network).
              const payload = createNotePageDragPayload(page);
              event.dataTransfer.setData(NOTE_PAGE_DRAG_MIME, serializeNotePageDragPayload(payload));
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onKeyDown={(event) => !page.trashedAt && handleRowKeyDown(event, page.id)}
            onClick={() => !page.trashedAt && onSelectPage(page.id)} data-vgt-theme-selected-surface={active ? 'true' : undefined} style={{ marginLeft: `${depth * 12}px` }} className={`group relative p-2.5 rounded-xl transition-all border focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${page.trashedAt ? 'cursor-default opacity-70 bg-slate-950/30 border-red-500/10' : 'cursor-pointer'} ${active ? 'bg-blue-600/15 border-blue-500/40 shadow-lg shadow-blue-500/5' : 'bg-slate-950/40 border-white/[0.05] hover:border-white/15 hover:bg-slate-900/40'} ${page.archived ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex items-center gap-1.5">{depth > 0 && <CornerDownRight className="w-3 h-3 text-slate-600 shrink-0" />}{page.pinned && <Pin className="w-3 h-3 text-blue-400 shrink-0" fill="currentColor" />}{page.favorite && <Heart className="w-3 h-3 text-rose-400 shrink-0" fill="currentColor" />}<h4 data-vgt-theme-selected-text={active ? 'true' : undefined} className={`text-xs font-semibold truncate ${active ? 'text-blue-300' : 'text-slate-200'}`}>{page.title || 'Untitled Note'}</h4></div>
              {page.trashedAt ? <button type="button" onClick={(event) => { event.stopPropagation(); onRestorePage(page.id); }} className="p-0.5 rounded text-slate-500 hover:text-emerald-300" aria-label="Restore page" title="Restore page"><RotateCcw className="w-3 h-3" /></button> : <button type="button" onClick={(event) => { event.stopPropagation(); onDeletePage(page.id); }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400" aria-label="Move page and subpages to trash" title="Move page and subpages to trash"><Trash2 className="w-3 h-3" /></button>}
            </div>
            <p className="text-[0.6875rem] text-slate-400 line-clamp-2 mt-1 select-none leading-relaxed">{page.content.replace(/^#+\s+/gm, '').replace(/\[\[(.*?)\]\]/g, '$1').slice(0, 90) || 'Empty page...'}</p>{searchQuery && searchResultsByPageId.get(page.id)?.hits[0] && <SearchHitPreview hit={searchResultsByPageId.get(page.id)!.hits[0]} />}
            {!page.trashedAt && searchScope === 'section' && pageCollection === 'pages' && <div className="mt-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"><select value={page.parentPageId ?? ''} onChange={(event) => { event.stopPropagation(); applyParentChange(page.id, event.target.value || null); }} onClick={(event) => event.stopPropagation()} aria-label={`Set subpage parent of ${page.title}`} className="w-full bg-slate-950 border border-white/10 rounded px-1.5 py-1 text-[0.5625rem] text-slate-500" title="Set subpage parent"><option value="">Top-level page</option>{liveSectionPages.filter((candidate) => candidate.id !== page.id).map((candidate) => <option key={candidate.id} value={candidate.id}>Subpage of: {candidate.title}</option>)}</select></div>}
            <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/[0.04] text-[0.625rem] text-slate-500 gap-2"><span className="flex items-center gap-1 shrink-0"><Clock className="w-2.5 h-2.5" />{formatTime(page.last_modified)}</span><div className="flex items-center gap-1 min-w-0">{page.archived && <span className="px-1 rounded bg-amber-500/10 text-amber-300">Archived</span>}{page.trashedAt && <span className="px-1 rounded bg-red-500/10 text-red-300">Trash</span>}{page.tags.slice(0, 1).map((tag) => <span key={tag} data-vgt-theme-accent-label="true" className="px-1 rounded bg-white/[0.05] text-[0.5625rem] text-blue-300 truncate">#{tag}</span>)}</div></div>
          </div>;
        })}
        {filteredPages.length === 0 && <div className="text-center py-8 text-xs text-slate-500">No notes match this view.</div>}
      </div>
    </section>
  );
};
