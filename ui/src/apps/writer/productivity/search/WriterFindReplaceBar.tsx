// STATUS: DIAMANT VGT SUPREME — Bounded Find/Replace with Regex, Wildcards, Format & Style Filters
import React, { useEffect, useMemo, useState } from 'react';
import type { Paragraph, WriterStyleCatalog } from '../../../../shared/contracts/workspace';
import { Search, ChevronUp, ChevronDown, X, SlidersHorizontal } from 'lucide-react';
import {
  findWriterSearchMatches,
  type WriterSearchFormatFilter,
  type WriterSearchMode,
  type WriterSearchOptions,
} from './writerSearchEngine';
import type { WriterProductivityOperationResult } from '../useWriterProductivityState';
import type { WriterSearchMatch } from './writerSearchEngine';
import {
  buildWriterSearchHighlightMap,
  EMPTY_WRITER_SEARCH_HIGHLIGHTS,
  type WriterSearchHighlightMap,
} from './writerSearchHighlights';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { writerSearchCopy } from './writerSearchLocale';

export interface WriterFindReplaceBarProps {
  isOpen: boolean;
  onClose: () => void;
  paragraphs: Paragraph[];
  styleCatalog: WriterStyleCatalog;
  onReplaceAll: (query: string, replacement: string, options: WriterSearchOptions) => WriterProductivityOperationResult;
  /** Replaces only the given matches; without it the selection controls stay hidden. */
  onReplaceSelection?: (matches: readonly WriterSearchMatch[], replacement: string) => WriterProductivityOperationResult;
  onHighlightMatch?: (paragraphId: string) => void;
  /**
   * WR-036 — report the visible hits.
   *
   * Without this the bar only scrolled to the paragraph and the user could not see *what*
   * matched. The map is decoration for the run projection; nothing is written to the model.
   */
  onHighlightsChange?: (highlights: WriterSearchHighlightMap) => void;
  /** WR-036 — `Ctrl+H`: a new token value expands the replace row. */
  replaceRequestToken?: number;
}

const EMPTY_FORMAT: WriterSearchFormatFilter = {};

export const WriterFindReplaceBar: React.FC<WriterFindReplaceBarProps> = ({
  isOpen,
  onClose,
  paragraphs,
  styleCatalog,
  onReplaceAll,
  onReplaceSelection,
  onHighlightMatch,
  onHighlightsChange,
  replaceRequestToken = 0,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = writerSearchCopy(locale);
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [mode, setMode] = useState<WriterSearchMode>('plain');
  const [format, setFormat] = useState<WriterSearchFormatFilter>(EMPTY_FORMAT);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  /**
   * The matches the user ticked. Kept as keys rather than objects so a new search
   * cannot carry a stale selection into a different result set.
   */
  const [selectedMatches, setSelectedMatches] = useState<ReadonlySet<string>>(() => new Set());

  const matchKey = (match: WriterSearchMatch) => `${match.paragraphId}:${match.spanIndex}:${match.start}:${match.end}`;

  const options = useMemo<WriterSearchOptions>(() => ({ matchCase, wholeWord, mode, format }), [format, matchCase, mode, wholeWord]);
  const result = useMemo(() => findWriterSearchMatches(paragraphs, query, options), [options, paragraphs, query]);
  const matches = result.matches;

  /**
   * WR-036 — publish the hits for the run projection.
   *
   * The effect runs even while the bar is closed (the element stays mounted and returns
   * `null`), which is exactly what clears the marks when the user closes the bar.
   */
  useEffect(() => {
    if (!isOpen) {
      onHighlightsChange?.(EMPTY_WRITER_SEARCH_HIGHLIGHTS);
      return;
    }
    onHighlightsChange?.(buildWriterSearchHighlightMap(paragraphs, matches, matches[currentMatchIndex]));
  }, [currentMatchIndex, isOpen, matches, onHighlightsChange, paragraphs]);

  /** WR-036 — `Ctrl+H` opens the replace row; `Ctrl+F` leaves it as the user left it. */
  useEffect(() => {
    if (replaceRequestToken > 0) setShowReplace(true);
  }, [replaceRequestToken]);

  if (!isOpen) return null;

  const handleNavigate = (direction: 'next' | 'prev') => {
    if (matches.length === 0) return;
    const delta = direction === 'next' ? 1 : -1;
    const nextIndex = (currentMatchIndex + delta + matches.length) % matches.length;
    setCurrentMatchIndex(nextIndex);
    const target = matches[nextIndex];
    if (target) onHighlightMatch?.(target.paragraphId);
  };

  const handleReplaceAll = () => {
    if (!query) return;
    const operation = onReplaceAll(query, replaceText, options);
    // WR-036: a refusal must say **why** (protection, invalid pattern), not just "failed".
    setOperationMessage(operation.ok ? copy.replaceDone : (operation.message ?? copy.replaceFailed));
    if (operation.ok) setCurrentMatchIndex(0);
  };

  const toggleMatch = (match: WriterSearchMatch) => {
    setSelectedMatches((current) => {
      const next = new Set(current);
      const key = matchKey(match);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Replaces exactly the ticked matches — "nur gewählte Treffer ersetzen". */
  const handleReplaceSelected = () => {
    if (!onReplaceSelection) return;
    const chosen = matches.filter((match) => selectedMatches.has(matchKey(match)));
    if (chosen.length === 0) return;
    const operation = onReplaceSelection(chosen, replaceText);
    setOperationMessage(operation.ok ? operation.message ?? copy.replaceDone : (operation.message ?? copy.replaceFailed));
    if (operation.ok) setSelectedMatches(new Set());
  };

  /** Replaces the match the user is currently on — one single hit. */
  const handleReplaceCurrent = () => {
    if (!onReplaceSelection) return;
    const target = matches[currentMatchIndex] ?? matches[0];
    if (!target) return;
    const operation = onReplaceSelection([target], replaceText);
    setOperationMessage(operation.ok ? operation.message ?? copy.replaceDone : (operation.message ?? copy.replaceFailed));
    if (operation.ok) {
      setSelectedMatches(new Set());
      setCurrentMatchIndex((index) => (matches.length <= 1 ? 0 : Math.min(index, matches.length - 2)));
    }
  };

  const hasFormatFilter = Object.values(format).some((value) => value !== undefined && value !== '');
  const feedbackMessage = result.error
    ? !query && !hasFormatFilter ? copy.searchPrompt : copy.searchError
    : operationMessage;
  const setBooleanFilter = (key: 'bold' | 'italic' | 'underline') => {
    setFormat((current) => ({ ...current, [key]: current[key] === true ? undefined : true }));
    setCurrentMatchIndex(0);
  };

  return (
    <div className="absolute top-28 right-8 z-30 w-[30rem] space-y-2 rounded-2xl border border-white/15 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            aria-label={copy.searchPlaceholder}
            placeholder={hasFormatFilter ? copy.optionalSearchPlaceholder : copy.searchPlaceholder}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setCurrentMatchIndex(0); setOperationMessage(null); }}
            className="w-full rounded-lg border border-white/10 bg-slate-950 py-1.5 pl-8 pr-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
            autoFocus
          />
        </div>
        <button type="button" onClick={() => setShowFormat((value) => !value)} className={`rounded-lg border px-2 py-1.5 text-[0.625rem] ${showFormat || hasFormatFilter ? 'border-purple-500/50 bg-purple-500/15 text-purple-200' : 'border-white/10 bg-slate-950 text-slate-400'}`} aria-label={copy.searchFormat} title={copy.searchFormat}><SlidersHorizontal className="h-3.5 w-3.5" /></button>
        <button aria-label={copy.close} type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950 p-0.5 text-[0.625rem]">
          {(['plain', 'wildcard', 'regex'] as WriterSearchMode[]).map((searchMode) => (
            <button key={searchMode} type="button" onClick={() => { setMode(searchMode); setCurrentMatchIndex(0); }} className={`rounded px-2 py-1 font-medium ${mode === searchMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{copy[searchMode]}</button>
          ))}
          <button type="button" onClick={() => setMatchCase((value) => !value)} className={`rounded px-1.5 py-1 font-bold ${matchCase ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`} title={copy.matchCase} aria-label={copy.matchCase}>Aa</button>
          <button type="button" onClick={() => setWholeWord((value) => !value)} className={`rounded px-1.5 py-1 font-mono ${wholeWord ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`} title={copy.wholeWord} aria-label={copy.wholeWord}>\b</button>
        </div>
        <div className="flex items-center gap-1 text-[0.625rem] text-slate-400">
          <span className="font-mono text-blue-400" aria-label={matches.length ? copy.matchCount(Math.min(currentMatchIndex + 1, matches.length), matches.length) : copy.noMatches}>{matches.length ? `${Math.min(currentMatchIndex + 1, matches.length)}/${matches.length}` : '0'}</span>
          <button aria-label={copy.previousMatch} type="button" disabled={matches.length === 0} onClick={() => handleNavigate('prev')} className="rounded border border-white/10 bg-slate-950 p-1 text-slate-300 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button aria-label={copy.nextMatch} type="button" disabled={matches.length === 0} onClick={() => handleNavigate('next')} className="rounded border border-white/10 bg-slate-950 p-1 text-slate-300 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setShowReplace((value) => !value)} className={`rounded px-2 py-1 font-semibold ${showReplace ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{copy.replace}</button>
        </div>
      </div>

      {showFormat && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-slate-950/70 p-2">
          <label className="text-[0.625rem] text-slate-400">{copy.paragraphStyle}
            <select value={format.paragraphStyle ?? ''} onChange={(event) => setFormat((current) => ({ ...current, paragraphStyle: event.target.value ? event.target.value as WriterSearchFormatFilter['paragraphStyle'] : undefined }))} className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-[0.625rem] text-slate-200">
              <option value="">{copy.all}</option>{styleCatalog.paragraphStyles.map((style) => <option key={style.name} value={style.name}>{style.label}</option>)}
            </select>
          </label>
          <label className="text-[0.625rem] text-slate-400">{copy.characterStyle}
            <select value={format.characterStyleId ?? ''} onChange={(event) => setFormat((current) => ({ ...current, characterStyleId: event.target.value || undefined }))} className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-[0.625rem] text-slate-200">
              <option value="">{copy.all}</option>{styleCatalog.characterStyles.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
            </select>
          </label>
          <label className="text-[0.625rem] text-slate-400">{copy.fontFamily}<input aria-label={copy.fontFamily} value={format.fontFamily ?? ''} onChange={(event) => setFormat((current) => ({ ...current, fontFamily: event.target.value || undefined }))} maxLength={128} className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-[0.625rem] text-slate-200" /></label>
          <div className="flex items-end gap-1">
            {(['bold', 'italic', 'underline'] as const).map((key) => <button key={key} type="button" onClick={() => setBooleanFilter(key)} aria-pressed={Boolean(format[key])} className={`flex-1 rounded py-1 text-[0.625rem] ${format[key] ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400'}`}>{copy[key]}</button>)}
            <button type="button" onClick={() => setFormat(EMPTY_FORMAT)} className="rounded bg-white/5 px-2 py-1 text-[0.625rem] text-slate-400">{copy.reset}</button>
          </div>
        </div>
      )}

      {showReplace && (
        <div className="flex items-center gap-2 border-t border-white/10 pt-2">
          <input type="text" aria-label={copy.replacePlaceholder} placeholder={copy.replacePlaceholder} value={replaceText} onChange={(event) => setReplaceText(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500" />
          <button type="button" disabled={!query || matches.length === 0} onClick={handleReplaceCurrent} className="rounded-lg bg-white/10 px-3 py-1.5 text-[0.6875rem] font-semibold text-slate-100 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:opacity-40">{copy.replaceCurrent}</button>
          <button type="button" disabled={!query || matches.length === 0} onClick={handleReplaceAll} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[0.6875rem] font-semibold text-white focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-40">{copy.replaceAll(matches.length)}</button>
        </div>
      )}

      {matches.length > 0 && showReplace && (
        <div className="flex flex-wrap items-center gap-1 border-t border-white/10 pt-2">
          <span className="text-[0.625rem] text-slate-400">{copy.selectionHint}</span>
          {matches.map((match, index) => (
            <label key={`${match.paragraphId}:${match.spanIndex}:${match.start}`} className="flex items-center gap-1 rounded border border-white/10 bg-slate-950/60 px-1.5 py-0.5 text-[0.625rem] text-slate-300">
              <input
                type="checkbox"
                checked={selectedMatches.has(matchKey(match))}
                onChange={() => toggleMatch(match)}
                aria-label={`${copy.matchCount(index + 1, matches.length)}: ${match.text.slice(0, 40)}`}
                className="h-3 w-3 focus-visible:ring-2 focus-visible:ring-blue-400/70"
              />
              <span className="max-w-[9rem] truncate" title={match.text}>{match.text || '␠'}</span>
            </label>
          ))}
          <button type="button" disabled={selectedMatches.size === 0} onClick={handleReplaceSelected} className="rounded-lg bg-white/10 px-3 py-1.5 text-[0.6875rem] font-semibold text-slate-100 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:opacity-40">{copy.replaceSelected(selectedMatches.size)}</button>
        </div>
      )}

      {feedbackMessage && <div role="status" className={`rounded-lg border px-2 py-1 text-[0.625rem] ${result.error ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'}`}>{feedbackMessage}</div>}
    </div>
  );
};
