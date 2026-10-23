// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — local PDF.js display surface: canvas, thumbnails, OCG, forms, annotations, search, selection and tagged reflow.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Layers3, ListFilter, Search, TextSearch, X } from 'lucide-react';
import { decodePdfDataUrl } from '../../security/pdfNativeDataUrl';
import type { NativeContrastMode, NativeFitMode, NativeRotation } from '../contracts/pdfNativeViewerState';
import { openPdfJsDisplayDocument } from './pdfJsDisplayClient';
import type { PdfJsOpenedDisplayDocument, PdfJsOptionalContentConfig } from '../contracts/pdfJsDisplayTypes';
import { PdfJsPageView } from './PdfJsPageView';
import { PdfJsReflowView } from '../reflow/PdfJsReflowView';
import { PdfJsThumbnail } from '../thumbnails/PdfJsThumbnail';
import {
  PDF_SEARCH_LIMITS,
  buildPdfSearchResults,
  clampPdfSearchCursor,
  describePdfSearchPosition,
  normalizePdfSearchQuery,
  stepPdfSearchCursor,
  type PdfSearchCursor,
  type PdfSearchPageResult,
} from '../search/pdfSearchNavigator';

export type PdfJsDisplayMode = 'continuous' | 'page' | 'two-page';

interface PdfJsDisplayViewerProps {
  dataUrl: string;
  byteLength: number;
  page: number;
  pageLabels?: string[] | null;
  mode: PdfJsDisplayMode;
  fit: NativeFitMode;
  zoom: number;
  rotation: NativeRotation;
  contrast: NativeContrastMode;
  onPageChange: (page: number) => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
  password?: string;
}

interface OcgEntry { id: string; name: string; visible: boolean; depth: number; }

const MAX_RENDERED_CONTINUOUS_PAGES = 200;
const MAX_SEARCH_TEXT_PER_PAGE = 4 * 1024 * 1024;
/** Total text the search pass may pull out of the document in one run. */
const MAX_SEARCH_TOTAL_TEXT_BYTES = 64 * 1024 * 1024;

const flattenOcgOrder = (config: PdfJsOptionalContentConfig): OcgEntry[] => {
  const order = config.getOrder();
  if (!Array.isArray(order)) return [];
  const output: OcgEntry[] = [];
  const visit = (candidate: unknown, depth: number) => {
    if (typeof candidate === 'string') {
      const group = config.getGroup(candidate);
      if (group) output.push({ id: candidate, name: group.name || candidate, visible: group.visible, depth });
      return;
    }
    if (Array.isArray(candidate)) {
      for (const child of candidate) visit(child, depth + 1);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as { name?: unknown; order?: unknown[] };
    if (Array.isArray(record.order)) for (const child of record.order) visit(child, depth + 1);
  };
  for (const candidate of order) visit(candidate, 0);
  return output.slice(0, 10_000);
};

const extractText = (items: unknown[]): string => {
  let output = '';
  for (const candidate of items) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as { str?: unknown; hasEOL?: unknown };
    if (typeof record.str !== 'string') continue;
    output += record.str;
    output += record.hasEOL === true ? '\n' : ' ';
    if (output.length > MAX_SEARCH_TEXT_PER_PAGE) throw new Error('PDF search text exceeded the per-page safety budget');
  }
  return output;
};

export const PdfJsDisplayViewer: React.FC<PdfJsDisplayViewerProps> = ({
  dataUrl,
  byteLength,
  page,
  pageLabels,
  mode,
  fit,
  zoom,
  rotation,
  contrast,
  onPageChange,
  onOpenExternalUrl,
  password,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<PdfJsOpenedDisplayDocument | null>(null);
  const [optionalContentConfig, setOptionalContentConfig] = useState<PdfJsOptionalContentConfig | null>(null);
  const [fieldObjects, setFieldObjects] = useState<Record<string, unknown[]> | null>(null);
  const [hasJavaScriptActions, setHasJavaScriptActions] = useState(false);
  const [ocgRevision, setOcgRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 960, height: 720 });
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [showLayers, setShowLayers] = useState(false);
  const [reflow, setReflow] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PdfSearchPageResult[] | null>(null);
  const [searchCursor, setSearchCursor] = useState<PdfSearchCursor | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const searchRunRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let active: PdfJsOpenedDisplayDocument | null = null;
    setOpened(null);
    setOptionalContentConfig(null);
    setError(null);
    try {
      const bytes = decodePdfDataUrl(dataUrl, byteLength);
      void openPdfJsDisplayDocument(bytes, password).then(async (next) => {
        active = next;
        const [config, fields, actions] = await Promise.all([
          next.document.getOptionalContentConfig({ intent: 'display' }),
          next.document.getFieldObjects(),
          next.document.getJSActions(),
        ]);
        if (cancelled) {
          await next.loadingTask.destroy().catch(() => undefined);
          return;
        }
        setOpened(next);
        setOptionalContentConfig(config);
        setFieldObjects(fields);
        setHasJavaScriptActions(Boolean(actions && (actions instanceof Map ? actions.size : Object.keys(actions as object).length)));
      }).catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'PDF.js display initialization failed');
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'PDF.js display initialization failed');
    }
    return () => {
      cancelled = true;
      if (active) void active.loadingTask.destroy().catch(() => undefined);
    };
  }, [dataUrl, byteLength, password]);

  useEffect(() => {
    const target = viewportRef.current;
    if (!target || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      const height = Math.max(320, Math.floor(entry.contentRect.height));
      setSize({ width, height });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [opened]);

  const pageCount = opened?.document.numPages ?? 0;
  const pageNumbers = useMemo(() => {
    if (!pageCount) return [];
    if (mode === 'page') return [Math.min(pageCount, page)];
    if (mode === 'two-page') return [Math.min(pageCount, page), Math.min(pageCount, page + 1)].filter((value, index, array) => array.indexOf(value) === index);
    if (pageCount <= MAX_RENDERED_CONTINUOUS_PAGES) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const start = Math.max(1, page - 4);
    const end = Math.min(pageCount, page + 5);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [mode, page, pageCount]);

  const ocgEntries = useMemo(() => optionalContentConfig ? flattenOcgOrder(optionalContentConfig) : [], [optionalContentConfig, ocgRevision]);
  const thumbnailPages = useMemo(() => {
    if (!pageCount) return [];
    if (pageCount <= 100) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const start = Math.max(1, page - 25);
    const end = Math.min(pageCount, page + 25);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [page, pageCount]);

  const resolveDestination = async (destination: unknown) => {
    if (!opened) return;
    let resolved = destination;
    if (typeof destination === 'string') resolved = await opened.document.getDestination(destination);
    if (!Array.isArray(resolved) || resolved.length === 0) return;
    const target = resolved[0];
    if (Number.isInteger(target)) {
      onPageChange(Math.max(1, Math.min(pageCount, Number(target) + 1)));
      return;
    }
    if (target && typeof target === 'object') {
      const index = await opened.document.getPageIndex(target);
      onPageChange(Math.max(1, Math.min(pageCount, index + 1)));
    }
  };

  const namedAction = (action: string) => {
    if (action === 'NextPage') onPageChange(Math.min(pageCount, page + 1));
    else if (action === 'PrevPage') onPageChange(Math.max(1, page - 1));
    else if (action === 'FirstPage') onPageChange(1);
    else if (action === 'LastPage') onPageChange(pageCount);
  };

  const searchPosition = useMemo(() => describePdfSearchPosition(searchResults ?? [], searchCursor), [searchResults, searchCursor]);

  const runSearch = async (rawQuery?: string) => {
    const query = normalizePdfSearchQuery(rawQuery ?? searchQuery);
    if (!opened || !query) {
      searchRunRef.current += 1;
      setSearchResults(null);
      setSearchCursor(null);
      setSearchTruncated(false);
      setSearchError(null);
      return;
    }
    const run = searchRunRef.current + 1;
    searchRunRef.current = run;
    setSearching(true);
    setSearchError(null);
    try {
      const collected: Array<{ pageNumber: number; text: string }> = [];
      let totalTextBytes = 0;
      const limit = Math.min(opened.document.numPages, PDF_SEARCH_LIMITS.maxResultPages);
      for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
        if (searchRunRef.current !== run) return; // superseded: a newer search owns the state
        const proxy = await opened.document.getPage(pageNumber);
        const text = extractText((await proxy.getTextContent({ includeMarkedContent: false, disableNormalization: false })).items);
        totalTextBytes += text.length;
        if (totalTextBytes > MAX_SEARCH_TOTAL_TEXT_BYTES) {
          setSearchResults(null);
          setSearchCursor(null);
          setSearchError('PDF search stopped: the document text exceeds the bounded search budget.');
          return;
        }
        collected.push({ pageNumber, text });
      }
      if (searchRunRef.current !== run) return;
      const { results, truncated } = buildPdfSearchResults(collected, query);
      const cursor = clampPdfSearchCursor(results, null);
      setSearchResults(results);
      setSearchTruncated(truncated);
      setSearchCursor(cursor);
      if (cursor) onPageChange(results[cursor.resultIndex].pageNumber);
    } catch (reason) {
      if (searchRunRef.current !== run) return;
      setSearchResults(null);
      setSearchCursor(null);
      setSearchTruncated(false);
      setSearchError(reason instanceof Error ? reason.message : 'PDF search failed');
    } finally {
      if (searchRunRef.current === run) setSearching(false);
    }
  };

  const stepSearch = (direction: 1 | -1) => {
    const results = searchResults ?? [];
    if (!results.length) return;
    const next = stepPdfSearchCursor(results, searchCursor, direction);
    if (!next) return;
    setSearchCursor(next);
    onPageChange(results[next.resultIndex].pageNumber);
  };

  const clearSearch = () => {
    searchRunRef.current += 1;
    setSearchQuery('');
    setSearchResults(null);
    setSearchCursor(null);
    setSearchTruncated(false);
    setSearchError(null);
  };

  if (error) return <div className="m-4 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-4 text-xs text-rose-200">{error}</div>;
  if (!opened || !optionalContentConfig) return <div className="grid h-full place-items-center text-xs text-slate-500">Starting isolated PDF.js 6.3.289 display runtime…</div>;

  const activeSearchPage = searchPosition ? searchPosition.pageNumber : null;
  const activeSearchHit = searchPosition ? searchPosition.hitIndex : null;

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col" data-pdfjs-display="6.3.289">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/[0.07] bg-slate-950/80 px-2 py-1.5">
        <button type="button" onClick={() => setShowThumbnails((value) => !value)} className={`native-control flex items-center gap-1 rounded px-2 py-1 text-[0.5625rem] ${showThumbnails ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-500'}`}><ListFilter className="h-3 w-3" />Thumbnails</button>
        <button type="button" onClick={() => setShowLayers((value) => !value)} className={`native-control flex items-center gap-1 rounded px-2 py-1 text-[0.5625rem] ${showLayers ? 'bg-violet-500/15 text-violet-200' : 'text-slate-500'}`}><Layers3 className="h-3 w-3" />Layers {ocgEntries.length ? `(${ocgEntries.length})` : ''}</button>
        <button type="button" onClick={() => setReflow((value) => !value)} className={`native-control flex items-center gap-1 rounded px-2 py-1 text-[0.5625rem] ${reflow ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-500'}`}><Eye className="h-3 w-3" />Reading mode</button>
        <div className="ml-auto flex min-w-56 items-center gap-1 rounded border border-white/10 bg-black/20 px-1.5 py-0.5">
          <TextSearch className="h-3 w-3 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value.slice(0, PDF_SEARCH_LIMITS.maxQueryCharacters))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void runSearch(); return; }
              if (event.key === 'F3') { event.preventDefault(); stepSearch(event.shiftKey ? -1 : 1); return; }
              if (event.key === 'Escape') { event.preventDefault(); clearSearch(); }
            }}
            placeholder="Search and highlight"
            aria-label="Search PDF text"
            aria-keyshortcuts="Enter F3 Shift+F3 Escape"
            data-pdf-search-input="true"
            className="min-w-0 flex-1 bg-transparent py-1 text-[0.5625rem] text-slate-200 outline-none"
          />
          <button aria-label="Previous match" type="button" disabled={!searchPosition} onClick={() => stepSearch(-1)} className="native-control p-1 text-slate-400 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
          <button aria-label="Next match" type="button" disabled={!searchPosition} onClick={() => stepSearch(1)} className="native-control p-1 text-slate-400 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
          <button aria-label="Run search" type="button" disabled={!searchQuery.trim() || searching} onClick={() => void runSearch()} className="native-control p-1 text-slate-400 disabled:opacity-30"><Search className="h-3 w-3" /></button>
          {searchQuery ? <button aria-label="Clear search" type="button" onClick={clearSearch} className="native-control p-1 text-slate-500 hover:text-slate-300"><X className="h-3 w-3" /></button> : null}
        </div>
      </div>

      <div role="status" aria-live="polite" data-pdf-search-status={searching ? 'running' : searchError ? 'error' : searchResults === null ? 'idle' : searchResults.length === 0 ? 'empty' : 'hits'} className="shrink-0 border-b border-white/[0.07] bg-slate-950/60 px-2 py-1 text-[0.5625rem] text-slate-400">
        {searching ? 'Searching the bounded text layer…'
          : searchError ? <span className="text-amber-200">{searchError}</span>
          : searchResults === null ? 'Search a term to highlight and step through every match.'
          : searchResults.length === 0 ? <span className="text-amber-200">No match for “{normalizePdfSearchQuery(searchQuery)}”.</span>
          : <span>
              Match <strong className="font-mono text-slate-200">{searchPosition?.documentHitOrdinal}</strong> of <strong className="font-mono text-slate-200">{searchPosition?.totalHits}</strong>
              {' '}· {searchPosition?.hitIndex !== null && searchPosition ? `hit ${searchPosition.hitIndex + 1}/${searchResults[searchPosition.resultIndex]?.hitCount}` : ''} on page <strong className="font-mono text-cyan-300">{searchPosition?.pageNumber}</strong>
              {' '}· {searchResults.length.toLocaleString()} page(s) with matches{searchTruncated ? ' · result list truncated by policy' : ''}
            </span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {showThumbnails ? (
          <aside className="w-40 shrink-0 overflow-y-auto border-r border-white/[0.07] bg-slate-950/65 p-2" aria-label="PDF thumbnails">
            {thumbnailPages[0] && thumbnailPages[0] > 1 ? <div className="mb-2 text-center text-[0.5rem] text-slate-600">Showing nearby pages</div> : null}
            {thumbnailPages.map((pageNumber) => <PdfJsThumbnail key={pageNumber} document={opened.document} pageNumber={pageNumber} active={pageNumber === page} label={pageLabels?.[pageNumber - 1]} onSelect={onPageChange} />)}
          </aside>
        ) : null}

        <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-auto bg-[#11151d]" aria-label="PDF.js standards rendering viewport">
          {showLayers ? (
            <aside className="sticky top-2 z-30 ml-auto mr-2 mt-2 w-64 rounded-xl border border-violet-500/20 bg-slate-950/95 p-2 shadow-2xl" aria-label="PDF optional content layers">
              <div className="mb-1 text-[0.625rem] font-semibold text-violet-200">Optional content groups</div>
              {ocgEntries.length ? <div className="max-h-52 overflow-y-auto">{ocgEntries.map((entry) => (
                <label key={entry.id} className="flex items-center gap-2 py-1 text-[0.5625rem] text-slate-300" style={{ paddingLeft: `${entry.depth * 10}px` }}>
                  <input type="checkbox" checked={entry.visible} onChange={(event) => { optionalContentConfig.setVisibility(entry.id, event.target.checked, true); setOcgRevision((revision) => revision + 1); }} />
                  <span className="truncate">{entry.name}</span>
                </label>
              ))}</div> : <div className="text-[0.5625rem] text-slate-600">This PDF has no Optional Content Groups.</div>}
            </aside>
          ) : null}

          {searchError ? <div className="sticky top-2 z-20 mx-2 rounded border border-amber-500/20 bg-slate-950/95 p-2 text-[0.5625rem] text-amber-200">{searchError}</div> : null}
          {searchResults && searchResults.length ? <div className="sticky top-2 z-20 ml-2 mt-2 w-72 rounded-xl border border-amber-500/20 bg-slate-950/95 p-2 shadow-xl"><div className="mb-1 text-[0.5625rem] text-amber-200">{searchResults.length.toLocaleString()} page(s) with matches</div><div className="max-h-28 overflow-y-auto">{searchResults.slice(0, 200).map((result, index) => <button key={result.pageNumber} type="button" onClick={() => { const next = clampPdfSearchCursor(searchResults, { resultIndex: index, hitIndex: 0 }); setSearchCursor(next); onPageChange(result.pageNumber); }} aria-current={searchPosition?.resultIndex === index ? 'true' : undefined} className={`block w-full truncate rounded px-1.5 py-1 text-left text-[0.5rem] hover:bg-white/[0.05] ${searchPosition?.resultIndex === index ? 'bg-amber-500/10 text-amber-100' : 'text-slate-400'}`}><span className="mr-1 font-mono text-cyan-300">p.{result.pageNumber}</span><span className="mr-1 font-mono text-slate-500">×{result.hitCount}</span>{result.snippet}</button>)}</div></div> : null}

          {reflow ? <PdfJsReflowView document={opened.document} pageNumbers={pageNumbers} /> : (
            <div className={mode === 'two-page' ? 'grid grid-cols-2 items-start gap-3 px-2' : ''} data-pdf-layout={mode}>
              {pageNumbers.map((pageNumber) => <PdfJsPageView
                key={`${pageNumber}-${ocgRevision}`}
                module={opened.module}
                document={opened.document}
                pageNumber={pageNumber}
                fit={fit}
                zoom={zoom}
                rotation={rotation}
                contrast={contrast}
                availableWidth={mode === 'two-page' ? Math.max(240, size.width / 2 - 12) : size.width}
                availableHeight={size.height}
                optionalContentConfig={optionalContentConfig}
                ocgRevision={ocgRevision}
                searchQuery={searchQuery}
                activeSearchHit={activeSearchPage === pageNumber ? activeSearchHit : null}
                fieldObjects={fieldObjects}
                hasJavaScriptActions={hasJavaScriptActions}
                onNavigateDestination={resolveDestination}
                onOpenExternalUrl={onOpenExternalUrl}
                onNamedAction={namedAction}
                onOcgChanged={() => setOcgRevision((revision) => revision + 1)}
              />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
