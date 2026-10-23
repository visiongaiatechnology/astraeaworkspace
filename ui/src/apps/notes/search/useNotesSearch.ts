// STATUS: DIAMANT VGT SUPREME — isolated Notes search state, saved searches and ranked result projection

import { useMemo, useState } from 'react';
import type { NoteNotebook, NotePage, NoteSmartCollection } from '../../../shared/contracts/workspace';
import { createNoteEntityId } from '../model/notesHierarchy';
import { queryNotesBySmartCollection } from '../model/notesTagsTasks';
import { createNoteSavedSearch, createNotesSearchScan, searchNotesDetailed, type NoteSearchResult, type NotesSearchScope } from './notesSearchEngine';
import type { NotesPageCollection } from '../contracts/notesEditor';

interface UseNotesSearchInput {
  notebooks: NoteNotebook[];
  activeNotebook: NoteNotebook | null;
  activeSectionId: string;
  activePageId: string;
  pageCollection: NotesPageCollection;
  activeSmartCollection: NoteSmartCollection | null;
  replaceNotebook: (notebookId: string, update: (notebook: NoteNotebook) => NoteNotebook) => void;
}

function parseDateInput(value: string, inclusiveEnd: boolean): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return inclusiveEnd ? parsed + 86_400_000 - 1 : parsed;
}

function dateInputFromTimestamp(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function useNotesSearch({
  notebooks,
  activeNotebook,
  activeSectionId,
  activePageId,
  pageCollection,
  activeSmartCollection,
  replaceNotebook,
}: UseNotesSearchInput) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [searchScope, setSearchScope] = useState<NotesSearchScope>('section');
  const [showArchived, setShowArchived] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState<string | null>(null);

  const savedSearches = activeNotebook?.savedSearches ?? [];
  /**
   * AST-0684: the scan budget is measured per search, and a truncated scan is reported to the UI instead
   * of being presented as a complete result set.
   */
  const scan = useMemo(() => createNotesSearchScan(), []);
  /**
   * **W-429/W-369:** der Bezugszeitpunkt des Rangs gehört zur **Suche**, nicht zum Rendern.
   *
   * Vorher las der Rang je Seite den Zeitgeber. Damit konnte dieselbe Suche bei einer erneuten Auswertung anders
   * sortieren, ohne dass der Nutzer etwas getan hätte. Hier wird der Zeitpunkt **einmal je Suchsignatur**
   * festgehalten und in die Engine gereicht — *eine Suche, eine Reihenfolge.*
   */
  const searchSignature = [searchQuery, selectedTagFilter ?? '', searchScope, activeSmartCollection?.id ?? '', activeNotebook?.id ?? '', activeSectionId, activePageId, String(showArchived), String(favoritesOnly), pageCollection, searchDateFrom, searchDateTo].join('\u0000');
  const searchReferenceTime = useMemo(() => Date.now(), [searchSignature]);
  const filteredPageResults = useMemo<NoteSearchResult[]>(() => searchNotesDetailed(notebooks, {
    query: searchQuery,
    tag: selectedTagFilter,
    scope: activeSmartCollection ? 'notebook' : searchScope,
    activeNotebookId: activeNotebook?.id,
    activeSectionId,
    activePageId,
    includeArchived: showArchived,
    includeTrashed: pageCollection === 'trash',
    favoritesOnly,
    dateFrom: parseDateInput(searchDateFrom, false),
    dateTo: parseDateInput(searchDateTo, true),
    now: searchReferenceTime,
  }, scan), [notebooks, searchQuery, selectedTagFilter, searchScope, activeSmartCollection, activeNotebook?.id, activeSectionId, activePageId, showArchived, favoritesOnly, pageCollection, searchDateFrom, searchDateTo, scan, searchReferenceTime]);

  const filteredPages = useMemo<NotePage[]>(() => {
    let pages = filteredPageResults.map((result) => result.page);
    if (activeSmartCollection) {
      const matches = new Set(queryNotesBySmartCollection(notebooks, activeSmartCollection).map((entry) => entry.pageId));
      pages = pages.filter((page) => matches.has(page.id));
    }
    if (pageCollection === 'trash') return pages.filter((page) => Boolean(page.trashedAt));
    pages = pages.filter((page) => !page.trashedAt);
    if (pageCollection === 'recent' && activeNotebook) {
      const order = new Map((activeNotebook.recentPageIds ?? []).map((id, index) => [id, index]));
      pages = pages.filter((page) => order.has(page.id)).sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    }
    return pages;
  }, [filteredPageResults, pageCollection, activeNotebook, activeSmartCollection, notebooks]);

  const searchResultsByPageId = useMemo(() => new Map(filteredPageResults.map((result) => [result.page.id, result])), [filteredPageResults]);

  const saveCurrentSearch = (name: string) => {
    if (!activeNotebook) return;
    const safeName = name.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 96);
    if (!safeName) return;
    const now = Date.now();
    const record = createNoteSavedSearch({
      id: createNoteEntityId('search'),
      name: safeName,
      query: searchQuery,
      scope: searchScope,
      tag: selectedTagFilter,
      dateFrom: parseDateInput(searchDateFrom, false),
      dateTo: parseDateInput(searchDateTo, true),
      includeArchived: showArchived,
      favoritesOnly,
      now,
    });
    replaceNotebook(activeNotebook.id, (notebook) => ({ ...notebook, savedSearches: [...(notebook.savedSearches ?? []), record].slice(-128), updatedAt: now }));
    setSelectedSavedSearchId(record.id);
  };

  const applySavedSearch = (searchId: string | null) => {
    setSelectedSavedSearchId(searchId);
    if (!searchId) return;
    const record = savedSearches.find((candidate) => candidate.id === searchId);
    if (!record) return;
    setSearchQuery(record.query);
    setSearchScope(record.scope);
    setSelectedTagFilter(record.tag ?? null);
    setSearchDateFrom(dateInputFromTimestamp(record.dateFrom));
    setSearchDateTo(dateInputFromTimestamp(record.dateTo));
    setShowArchived(Boolean(record.includeArchived));
    setFavoritesOnly(Boolean(record.favoritesOnly));
  };

  const deleteSavedSearch = (searchId: string) => {
    if (!activeNotebook) return;
    replaceNotebook(activeNotebook.id, (notebook) => ({ ...notebook, savedSearches: (notebook.savedSearches ?? []).filter((entry) => entry.id !== searchId), updatedAt: Date.now() }));
    if (selectedSavedSearchId === searchId) setSelectedSavedSearchId(null);
  };

  return {
    searchQuery, setSearchQuery, selectedTagFilter, setSelectedTagFilter, searchScope, setSearchScope,
    showArchived, setShowArchived, favoritesOnly, setFavoritesOnly, searchDateFrom, setSearchDateFrom,
    searchDateTo, setSearchDateTo, filteredPageResults, filteredPages, searchResultsByPageId,
    savedSearches, selectedSavedSearchId, applySavedSearch, saveCurrentSearch, deleteSavedSearch,
    searchScanTruncated: scan.truncated, searchScannedPages: scan.scannedPages,
  };
}
