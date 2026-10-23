// STATUS: DIAMANT VGT SUPREME — canonical knowledge insights panel
import React from 'react';
import { AlertTriangle, ExternalLink, Link2, Network, Sparkles, Unlink } from 'lucide-react';
import type { PageFlatItem } from '../contracts/notesEditor';
import type { BrokenNoteLink, RelatedNoteScore, UnlinkedMention } from './notesKnowledgeGraph';

interface BacklinksPanelProps {
  linkedMentions: PageFlatItem[];
  outgoingLinks: PageFlatItem[];
  unlinkedMentions: UnlinkedMention[];
  brokenLinks: BrokenNoteLink[];
  relatedNotes: RelatedNoteScore[];
  allPagesList: PageFlatItem[];
  referenceCount: { incoming: number; outgoing: number; mentions: number };
  onNavigateToPage: (id: string) => void;
}

const PageButtons: React.FC<{ items: PageFlatItem[]; empty: string; onNavigateToPage: (id: string) => void }> = ({ items, empty, onNavigateToPage }) => (
  <div className="space-y-1.5">
    {items.map((item) => (
      <button key={item.id} type="button" onClick={() => onNavigateToPage(item.id)} className="w-full text-left px-2 py-1.5 rounded bg-white/[0.03] hover:bg-blue-600/20 text-xs text-blue-300 flex items-center justify-between transition-colors">
        <span className="truncate">{item.title}</span>
        <ExternalLink className="w-3 h-3 text-slate-500 shrink-0 ml-1" />
      </button>
    ))}
    {items.length === 0 && <span className="text-[0.6875rem] text-slate-600 italic">{empty}</span>}
  </div>
);

export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({
  linkedMentions,
  outgoingLinks,
  unlinkedMentions,
  brokenLinks,
  relatedNotes,
  allPagesList,
  referenceCount,
  onNavigateToPage,
}) => {
  const pageById = new Map(allPagesList.map((page) => [page.id, page]));
  const unlinkedSources = unlinkedMentions.map((mention) => pageById.get(mention.sourcePageId)).filter((page): page is PageFlatItem => Boolean(page));

  return (
    <section className="mt-12 pt-6 border-t border-white/10 space-y-4" aria-label="Knowledge graph insights">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
        <Network className="w-3.5 h-3.5 text-blue-400" />
        <span>Knowledge Connections</span>
        <span className="ml-auto text-[0.625rem] font-mono normal-case text-slate-500">
          {referenceCount.incoming} in · {referenceCount.outgoing} out · {referenceCount.mentions} unlinked
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <article className="p-3 rounded-xl bg-slate-950/60 border border-white/[0.06] space-y-2">
          <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-slate-300"><Link2 className="w-3 h-3 text-blue-400" />Incoming backlinks ({linkedMentions.length})</div>
          <PageButtons items={linkedMentions} empty="No incoming backlinks yet" onNavigateToPage={onNavigateToPage} />
        </article>

        <article className="p-3 rounded-xl bg-slate-950/60 border border-white/[0.06] space-y-2">
          <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-slate-300"><ExternalLink className="w-3 h-3 text-cyan-400" />Outgoing links ({outgoingLinks.length})</div>
          <PageButtons items={outgoingLinks} empty="No outgoing links in this note" onNavigateToPage={onNavigateToPage} />
        </article>

        <article className="p-3 rounded-xl bg-slate-950/60 border border-white/[0.06] space-y-2">
          <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-slate-300"><Unlink className="w-3 h-3 text-amber-400" />Unlinked mentions ({unlinkedMentions.length})</div>
          <PageButtons items={unlinkedSources} empty="No unlinked mentions found" onNavigateToPage={onNavigateToPage} />
          {unlinkedMentions.slice(0, 8).map((mention, index) => (
            <div key={`${mention.sourcePageId}-${mention.targetPageId}-${index}`} className="text-[0.625rem] text-slate-500 px-1">Matched “{mention.matchedLabel}”</div>
          ))}
        </article>

        <article className="p-3 rounded-xl bg-slate-950/60 border border-white/[0.06] space-y-2">
          <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-slate-300"><Sparkles className="w-3 h-3 text-purple-400" />Related notes ({relatedNotes.length})</div>
          <div className="space-y-1.5">
            {relatedNotes.map((related) => {
              const page = pageById.get(related.pageId);
              if (!page) return null;
              return <button key={related.pageId} type="button" onClick={() => onNavigateToPage(related.pageId)} className="w-full text-left px-2 py-1.5 rounded bg-white/[0.03] hover:bg-purple-600/15 transition-colors">
                <div className="flex items-center justify-between gap-2"><span className="truncate text-xs text-purple-200">{page.title}</span><span className="text-[0.5625rem] font-mono text-slate-500">{Math.round(related.score * 100)}%</span></div>
                <div className="truncate text-[0.5625rem] text-slate-600 mt-0.5">{related.sharedTerms.join(' · ')}</div>
              </button>;
            })}
            {relatedNotes.length === 0 && <span className="text-[0.6875rem] text-slate-600 italic">No strong local similarity yet</span>}
          </div>
        </article>
      </div>

      {brokenLinks.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3" role="status">
          <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-red-300 mb-2"><AlertTriangle className="w-3.5 h-3.5" />Broken references ({brokenLinks.length})</div>
          <div className="flex flex-wrap gap-1.5">{brokenLinks.slice(0, 24).map((link, index) => <span key={`${link.rawTarget}-${link.anchor ?? ''}-${index}`} className="px-2 py-1 rounded bg-red-950/40 border border-red-500/15 text-[0.625rem] font-mono text-red-200">[[{link.rawTarget}{link.anchor ? `#${link.anchor}` : ''}]]</span>)}</div>
        </div>
      )}
    </section>
  );
};
