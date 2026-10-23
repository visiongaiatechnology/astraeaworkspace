// STATUS: PLATIN — localized permission-aware global Search Hub.
import { isImeCompositionEvent } from '../../../shared/accessibility/accessibilityPlatform';
import React, { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, ClipboardCopy, Search, ShieldCheck } from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  fetchSearchPreferences,
  queryWorkspaceSearch,
  recordSearchQuery,
  saveNativeSearch,
  type WorkspaceSearchHit,
} from '../../../platform/search/services/workspaceSearchClient';
import { AstraeaAppIcon } from '../../../design-system/brand/AstraeaAppIcon';
import { scanWorkspaceForSearchCandidates } from '../../../platform/search/searchLocalCandidateCore';
import { normalizeSearchHits, searchDocumentMetadata } from '../../../platform/search/searchScopeCore';
import { addSavedSearch, createMetadataMap, parseSearchQuery, pushQueryHistory, rankSearchHits } from '../../../platform/search/searchQueryCore';
import type { SearchContentGroup, SearchHistoryEntry, SearchHubHit, SearchSavedSearch } from '../../../platform/search/searchTypes';
import { useWorkspaceLocale } from '../../localization/workspaceLocale';
import { formatSearchCopy, SEARCH_HUB_COPY } from '../searchHubLocale';
import { SearchAdminPanel } from './SearchAdminPanel';

interface SearchHubPanelProps {
  documents: Record<string, WorkspaceDocument>;
  metadataLocked: boolean;
  query: string;
  onOpenDocument: (documentId: string) => void;
}

const GROUP_IDS: readonly SearchContentGroup[] = ['all', 'documents', 'people', 'work', 'messages', 'data', 'spaces'];

function nativeToHub(hit: WorkspaceSearchHit): Omit<SearchHubHit, 'deepLink' | 'group' | 'modifiedAt' | 'finalScore' | 'why'> {
  return {
    documentId: hit.document_id,
    documentTitle: hit.document_title,
    documentKind: hit.document_kind,
    objectId: hit.object_id,
    objectType: hit.object_type,
    field: hit.field,
    snippet: hit.snippet,
    lexicalScore: hit.relevance_score,
    metadataProtected: hit.metadata_protected,
  };
}

export const SearchHubPanel: React.FC<SearchHubPanelProps> = ({ documents, metadataLocked, query, onOpenDocument }) => {
  const [uiScale, setUiScale] = useState(100);
  const [hits, setHits] = useState<SearchHubHit[]>([]);
  const [state, setState] = useState<'searching' | 'ready' | 'unavailable' | 'invalid'>('searching');
  const [group, setGroup] = useState<SearchContentGroup>('all');
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState<SearchSavedSearch[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const metadata = useMemo(() => createMetadataMap(documents, searchDocumentMetadata), [documents]);
  const { locale } = useWorkspaceLocale();
  const copy = SEARCH_HUB_COPY[locale];

  useEffect(() => {
    let live = true;
    void fetchSearchPreferences().then((value) => {
      if (live) {
        setSaved(value.savedSearches);
        setHistory(value.recentQueries);
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setState('ready');
      return () => { cancelled = true; };
    }

    let plan;
    try {
      plan = parseSearchQuery(trimmed);
    } catch {
      setState('invalid');
      setHits([]);
      return () => { cancelled = true; };
    }

    setState('searching');
    setHistory((current) => pushQueryHistory(current, trimmed, true));
    void recordSearchQuery(trimmed).catch(() => undefined);
    const timer = setTimeout(() => {
      void queryWorkspaceSearch(plan.nativeQuery, documents, metadataLocked)
        .then((nativeHits) => {
          if (cancelled) return;
          const normalized = normalizeSearchHits(nativeHits.map(nativeToHub), documents);
          const local = plan.usesAdvancedPostFilter ? scanWorkspaceForSearchCandidates(documents, plan) : [];
          const deduplicated = new Map<string, SearchHubHit>();
          for (const hit of [...normalized, ...local]) deduplicated.set(`${hit.documentId}\u0000${hit.objectId}\u0000${hit.field}`, hit);
          setHits(rankSearchHits([...deduplicated.values()], plan, metadata));
          setState('ready');
          setActive(0);
        })
        .catch(() => {
          if (cancelled) return;
          const local = scanWorkspaceForSearchCandidates(documents, plan);
          setHits(rankSearchHits(local, plan, metadata));
          setState(local.length ? 'ready' : 'unavailable');
          setActive(0);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [documents, metadata, metadataLocked, query]);

  const visible = useMemo(() => group === 'all' ? hits : hits.filter((hit) => hit.group === group), [group, hits]);
  const open = (hit: SearchHubHit): void => {
    onOpenDocument(hit.documentId);
    try {
      window.dispatchEvent(new CustomEvent('vgt:search-deeplink', {
        detail: { uri: hit.deepLink, documentId: hit.documentId, objectId: hit.objectId },
      }));
    } catch {
      // Opening the document remains authoritative when deeplink dispatch is unavailable.
    }
  };
  const copyLink = (value: string): void => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
  };

  const status = state === 'searching'
    ? copy.searching
    : state === 'invalid'
      ? copy.invalidQuery
      : state === 'unavailable'
        ? copy.unavailable
        : formatSearchCopy(copy.resultCount, { visible: visible.length, saved: saved.length, history: history.length });

  return (
    <section
      data-vgt-search-hub="true"
      aria-label={copy.title}
      style={{ zoom: uiScale / 100 } as React.CSSProperties}
      className="rounded-2xl border border-purple-500/15 bg-purple-950/15 p-5 backdrop-blur-xl"
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
          // Die eigene Prüfung war schwächer als die gemeinsame Regel (W-279).
        if (isImeCompositionEvent({ isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode, key: event.key })) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActive((index) => Math.min(Math.max(visible.length - 1, 0), index + 1));
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActive((index) => Math.max(0, index - 1));
        } else if (event.key === 'Enter' && visible[active]) {
          event.preventDefault();
          open(visible[active]);
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-purple-300" />
          <h3 className="text-xs font-semibold text-slate-100">{copy.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {metadataLocked && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300"><ShieldCheck className="h-3 w-3" />{copy.metadataProtected}</span>}
          <button
            type="button"
            disabled={!query.trim()}
            onClick={() => {
              try {
                setSaved((current) => {
                  const next = addSavedSearch(current, { name: query.trim().slice(0, 48), query: query.trim(), group });
                  const savedItem = next[next.length - 1];
                  if (savedItem) void saveNativeSearch(savedItem).catch(() => undefined);
                  return next;
                });
              } catch {
                // Invalid queries are rejected by the parser and remain unsaved.
              }
            }}
            className="rounded-lg border border-white/10 px-2 py-1 text-[10px]"
            title={copy.saveSearchTitle}
          >
            <BookmarkPlus className="mr-1 inline h-3 w-3" />{copy.saveSearch}
          </button>
          <select aria-label={copy.scale} value={uiScale} onChange={(event) => setUiScale(Number(event.target.value))} className="rounded border border-white/10 bg-black/30 px-1 py-1 text-[9px]">
            {[100, 125, 150, 200, 250, 300].map((value) => <option key={value} value={value}>{value}%</option>)}
          </select>
        </div>
      </div>

      <div role="tablist" aria-label={copy.groupsLabel} className="mt-3 flex flex-wrap gap-1">
        {GROUP_IDS.map((id) => (
          <button
            type="button"
            role="tab"
            aria-selected={group === id}
            key={id}
            onClick={() => { setGroup(id); setActive(0); }}
            className={`rounded-full border px-2 py-1 text-[10px] ${group === id ? 'border-purple-400/40 bg-purple-500/15 text-purple-200' : 'border-white/[0.06] text-slate-400'}`}
          >{copy.groups[id]}</button>
        ))}
      </div>

      <div aria-live="polite" className="mt-2 text-[10px] text-slate-500">{status}</div>
      <SearchAdminPanel onHistoryCleared={() => setHistory([])} />
      <div role="listbox" aria-label={copy.resultsLabel} className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {visible.slice(0, 100).map((hit, index) => (
          <div role="option" aria-selected={index === active} key={`${hit.documentId}-${hit.objectId}-${hit.field}`} className={`rounded-xl border p-3 ${index === active ? 'border-purple-400/35 bg-purple-900/20' : 'border-white/[0.06] bg-black/20'}`}>
            <button type="button" onClick={() => open(hit)} className="flex w-full items-start gap-3 text-left">
              <AstraeaAppIcon kind={hit.documentKind} className="h-7 w-7 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-slate-200">{hit.documentTitle}</span>
                <span className="mt-0.5 line-clamp-2 block text-[10px] text-slate-400">{hit.snippet}</span>
                <span className="mt-1 block font-mono text-[9px] text-slate-500">{hit.documentKind} · {hit.objectType} · {hit.field}</span>
                <span className="mt-1 block text-[9px] text-purple-300">{hit.why.join(' · ') || copy.lexicalMatch}</span>
              </span>
            </button>
            <div className="mt-2 flex justify-end gap-1">
              <button type="button" onClick={() => copyLink(hit.deepLink)} className="rounded border border-white/10 px-2 py-1 text-[9px]"><ClipboardCopy className="mr-1 inline h-3 w-3" />{copy.copyLink}</button>
              <button type="button" onClick={() => open(hit)} className="rounded border border-white/10 px-2 py-1 text-[9px]">{copy.openDocument}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
