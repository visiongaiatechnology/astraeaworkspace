// STATUS: DIAMANT VGT SUPREME — Navigation Pane Pages & Search Results
import React, { useMemo } from 'react';
import { FileText, Search, ChevronRight } from 'lucide-react';
import type { Paragraph } from '../../../shared/contracts/workspace';
import type { WriterPaginationPage } from '../layout/pagination/writerPagination';
import type { ActiveTabSidebar } from '../types';
import { findWriterSearchMatches } from '../productivity/search/writerSearchEngine';

interface WriterNavigationSupplementProps {
  activeTab: ActiveTabSidebar;
  query: string;
  paragraphs: readonly Paragraph[];
  pages: readonly WriterPaginationPage[];
  onJumpToParagraph: (paragraphId: string) => void;
}

function paragraphPreview(paragraph?: Paragraph): string {
  return paragraph?.spans.map((span) => span.text).join('').trim().slice(0, 90) || 'Leere Seite';
}

export const WriterNavigationSupplement: React.FC<WriterNavigationSupplementProps> = ({
  activeTab,
  query,
  paragraphs,
  pages,
  onJumpToParagraph,
}) => {
  const search = useMemo(() => query.trim()
    ? findWriterSearchMatches(paragraphs, query.trim(), { matchCase: false, wholeWord: false, mode: 'plain' })
    : { matches: [] }, [paragraphs, query]);

  if (activeTab === 'pages') {
    const needle = query.trim().toLocaleLowerCase();
    const filteredPages = pages.filter((page) => {
      if (!needle) return true;
      const label = `${page.displayPageNumberString ?? page.displayPageNumber}`.toLocaleLowerCase();
      return label.includes(needle) || paragraphPreview(page.paragraphs[0]).toLocaleLowerCase().includes(needle);
    });
    return (
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredPages.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500"><FileText className="w-6 h-6 mx-auto mb-2 opacity-40" />Keine Seiten gefunden.</div>
        ) : filteredPages.map((page) => {
          const paragraphId = page.paragraphs[0]?.id;
          return (
            <button
              key={page.id}
              type="button"
              disabled={!paragraphId}
              onClick={() => paragraphId && onJumpToParagraph(paragraphId)}
              className="w-full rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-left transition-all hover:border-blue-500/40 hover:bg-white/5 disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.6875rem] font-semibold text-blue-300">Seite {page.displayPageNumberString ?? page.displayPageNumber}</span>
                <span className="text-[0.5625rem] text-slate-500">Abschnitt {page.sectionPageIndex + 1}</span>
              </div>
              <p className="mt-1 truncate text-[0.625rem] text-slate-400">{paragraphPreview(page.paragraphs[0])}</p>
            </button>
          );
        })}
      </div>
    );
  }

  if (activeTab !== 'search') return null;
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {!query.trim() ? (
        <div className="p-6 text-center text-xs text-slate-500"><Search className="w-6 h-6 mx-auto mb-2 opacity-40" />Suchtext oben eingeben.</div>
      ) : search.matches.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500">Keine Treffer im Dokument.</div>
      ) : search.matches.map((match, index) => {
        const paragraph = paragraphs[match.paragraphIndex];
        return (
          <button
            key={`${match.paragraphId}:${match.spanIndex}:${match.start}:${index}`}
            type="button"
            onClick={() => onJumpToParagraph(match.paragraphId)}
            className="w-full rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-left transition-all hover:border-blue-500/40 hover:bg-white/5"
          >
            <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-blue-300"><ChevronRight className="h-3 w-3" />Treffer {index + 1}</div>
            <p className="mt-1 line-clamp-2 text-[0.625rem] text-slate-300">{paragraphPreview(paragraph)}</p>
          </button>
        );
      })}
      {search.error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[0.625rem] text-amber-200">{search.error}</div>}
    </div>
  );
};
