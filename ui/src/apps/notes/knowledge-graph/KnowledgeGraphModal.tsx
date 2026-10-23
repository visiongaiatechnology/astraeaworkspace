// STATUS: DIAMANT VGT SUPREME — local stable-ID knowledge graph renderer
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Network, Search, Tag, Unlink, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { NoteNotebook } from '../../../shared/contracts/workspace';
import { buildKnowledgeIndex } from './notesKnowledgeGraph';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';
import {
  NOTE_GRAPH_MAX_DEPTH,
  buildNoteGraphView,
  layoutNoteGraphNodes,
  type NoteGraphScope,
} from './notesGraphFilter';

interface KnowledgeGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePageId: string;
  activeNotebookId: string;
  notebooks: NoteNotebook[];
  onNavigateToPage: (pageId: string) => void;
}

export const KnowledgeGraphModal: React.FC<KnowledgeGraphModalProps> = ({
  isOpen,
  onClose,
  activePageId,
  activeNotebookId,
  notebooks,
  onNavigateToPage,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [maxDepth, setMaxDepth] = useState<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [scope, setScope] = useState<NoteGraphScope>('local');
  const index = useMemo(() => buildKnowledgeIndex(notebooks), [notebooks]);

  /**
   * AST-0671: the visible graph is the filtered view, and the layout follows the measured depth from the
   * active note, so "filter by tag and path depth" changes the real node/edge set instead of only the labels.
   */
  const view = useMemo(() => buildNoteGraphView(index, {
    scope,
    query: filterQuery,
    tags: tagFilter ? [tagFilter] : [],
    maxDepth,
    rootPageId: activePageId,
    activeNotebookId,
  }), [index, scope, filterQuery, tagFilter, maxDepth, activePageId, activeNotebookId]);
  const graph = useMemo(
    () => ({ nodes: layoutNoteGraphNodes(view, activePageId), edges: view.edges }),
    [view, activePageId]
  );

  const dialogA11y = useNotesDialogA11y(isOpen, onClose);
  if (!isOpen) return null;
  const pageTitle = new Map(index.pages.map((entry) => [entry.page.id, entry.page.title]));
  const nodeById = new Map(graph.nodes.map((node) => [node.pageId, node]));
  const hidden = view.excludedByScope + view.excludedByTag + view.excludedByDepth + view.excludedByQuery;

  return (
    <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none" role="dialog" aria-modal="true" aria-label="Knowledge graph">
      <div className="w-full max-w-6xl h-[86vh] bg-[#070a12] border border-white/15 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        <header className="min-h-14 px-5 py-2 border-b border-white/10 flex flex-wrap items-center gap-3 bg-slate-950/80">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400"><Network className="w-5 h-5" /></div>
          <div className="mr-auto"><h3 className="text-sm font-bold text-slate-100">Knowledge Graph</h3><p className="text-[0.625rem] text-slate-500 font-mono">{graph.nodes.length} nodes · {graph.edges.length} stable-ID links{hidden > 0 ? ` · ${hidden} filtered out` : ''}</p></div>
          <div className="flex rounded-lg border border-white/10 bg-slate-900 p-0.5">{(['local','notebook','global'] as NoteGraphScope[]).map((value) => <button key={value} type="button" onClick={() => setScope(value)} aria-pressed={scope === value} className={`px-2 py-1 rounded-md text-[0.625rem] capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${scope === value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{value}</button>)}</div>
          <label className="relative w-52"><Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" /><input value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Filter nodes…" aria-label="Filter graph nodes" className="w-full bg-slate-900 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60" /></label>
          <label className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.625rem] text-slate-400">
            <span>Depth</span>
            <select value={maxDepth === null ? 'all' : String(maxDepth)} onChange={(event) => setMaxDepth(event.target.value === 'all' ? null : Number(event.target.value))} aria-label="Filter by path depth" className="bg-transparent text-[0.625rem] text-slate-200 outline-none">
              <option value="all">All</option>
              {Array.from({ length: NOTE_GRAPH_MAX_DEPTH }, (_, index) => index + 1).map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
          <div className="flex items-center bg-slate-900 border border-white/10 rounded-lg p-0.5"><button type="button" onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))} className="p-1.5 hover:bg-white/10 rounded text-slate-400" aria-label="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button><span className="px-1 text-[0.5625rem] font-mono text-slate-500">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.2))} className="p-1.5 hover:bg-white/10 rounded text-slate-400" aria-label="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button></div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400" aria-label="Close graph"><X className="w-5 h-5" /></button>
        </header>

        <div className="flex items-center gap-1.5 border-b border-white/10 bg-slate-950/60 px-5 py-1.5 text-[0.625rem]">
          <span className="flex items-center gap-1 text-slate-500"><Tag className="w-3 h-3" />Tags</span>
          {view.availableTags.length === 0 && <span className="italic text-slate-600">No tags in this scope</span>}
          {view.availableTags.slice(0, 18).map((tag) => (
            <button key={tag} type="button" onClick={() => setTagFilter(tagFilter === tag ? null : tag)} aria-pressed={tagFilter === tag} className={`rounded-full border px-1.5 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${tagFilter === tag ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'}`}>#{tag}</button>
          ))}
          {(tagFilter || maxDepth !== null || filterQuery) && <button type="button" onClick={() => { setTagFilter(null); setMaxDepth(null); setFilterQuery(''); }} className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-slate-400 hover:text-white">Clear filters</button>}
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 relative overflow-hidden bg-[#05070d]">
            {view.truncated && <div role="status" className="absolute left-3 top-3 z-10 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[0.625rem] text-amber-200">The graph is capped at {graph.nodes.length} nodes; narrow the filters to see the rest.</div>}
            {graph.nodes.length === 0 && <div role="status" className="absolute inset-0 flex items-center justify-center text-[0.6875rem] text-slate-500">No note matches the active tag and depth filters.</div>}
            <svg className="w-full h-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" aria-label={`${scope} knowledge graph`}>
              <g transform={`translate(${400 - 400 * zoom} ${300 - 300 * zoom}) scale(${zoom})`}>
                {graph.edges.map((edge, idx) => {
                  const source = nodeById.get(edge.sourcePageId);
                  const target = nodeById.get(edge.targetPageId);
                  if (!source || !target) return null;
                  const highlighted = hoveredNodeId === source.pageId || hoveredNodeId === target.pageId;
                  return <line key={`${edge.sourcePageId}-${edge.targetPageId}-${idx}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={highlighted ? '#60a5fa' : edge.transclusion ? '#a855f7' : '#334155'} strokeWidth={highlighted ? 2.5 : edge.transclusion ? 1.7 : 1} strokeOpacity={highlighted ? 0.95 : 0.45} strokeDasharray={edge.transclusion ? '2 2' : '4 2'} />;
                })}
                {graph.nodes.map((node) => {
                  const active = node.pageId === activePageId;
                  const hovered = hoveredNodeId === node.pageId;
                  const radius = active ? 17 : Math.min(17, Math.max(9, 9 + node.connections * 1.5));
                  return <g key={node.pageId} transform={`translate(${node.x} ${node.y})`} className="cursor-pointer" tabIndex={0} role="button" aria-label={`Open note ${node.title}${Number.isFinite(node.depth) ? `, ${node.depth} links from the current note` : ''}`} onMouseEnter={() => setHoveredNodeId(node.pageId)} onMouseLeave={() => setHoveredNodeId(null)} onClick={() => { onNavigateToPage(node.pageId); onClose(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigateToPage(node.pageId); onClose(); } }}>
                    {(active || hovered) && <circle r={radius + 7} fill="none" stroke={active ? '#3b82f6' : '#a855f7'} strokeWidth="1.5" strokeOpacity="0.65" />}
                    <circle r={radius} fill={active ? '#2563eb' : hovered ? '#7c3aed' : '#1e293b'} stroke={active ? '#60a5fa' : hovered ? '#c084fc' : '#475569'} strokeWidth="2" />
                    <text y={radius + 14} textAnchor="middle" fill={active ? '#93c5fd' : hovered ? '#f1f5f9' : '#94a3b8'} fontSize={active ? '11' : '10'} fontWeight={active || hovered ? 'bold' : 'normal'} className="pointer-events-none">{node.title.length > 24 ? `${node.title.slice(0, 22)}…` : node.title}</text>
                  </g>;
                })}
              </g>
            </svg>
          </div>

          <aside className="w-64 shrink-0 border-l border-white/10 bg-slate-950/70 p-3 overflow-y-auto space-y-4">
            <div><div className="flex items-center gap-1.5 text-[0.625rem] uppercase font-bold tracking-wider text-red-300"><AlertTriangle className="w-3 h-3" />Broken links ({index.broken.length})</div><div className="mt-2 space-y-1">{index.broken.slice(0, 12).map((link, idx) => <button key={`${link.sourcePageId}-${idx}`} type="button" onClick={() => onNavigateToPage(link.sourcePageId)} className="w-full text-left rounded px-2 py-1 bg-red-500/[0.05] text-[0.625rem] text-red-200 hover:bg-red-500/10"><span className="block truncate">{pageTitle.get(link.sourcePageId) ?? link.sourcePageId}</span><span className="font-mono text-red-400 truncate block">→ {link.rawTarget}{link.anchor ? `#${link.anchor}` : ''}</span></button>)}</div></div>
            <div><div className="flex items-center gap-1.5 text-[0.625rem] uppercase font-bold tracking-wider text-amber-300"><Unlink className="w-3 h-3" />Orphan pages ({index.orphans.length})</div><div className="mt-2 space-y-1">{index.orphans.slice(0, 16).map((id) => <button key={id} type="button" onClick={() => onNavigateToPage(id)} className="w-full text-left rounded px-2 py-1 bg-white/[0.03] text-[0.625rem] text-slate-300 hover:bg-amber-500/10 hover:text-amber-200 truncate">{pageTitle.get(id) ?? id}</button>)}</div></div>
            {hidden > 0 && <div><div className="text-[0.625rem] uppercase font-bold tracking-wider text-slate-500">Filtered out</div><div className="mt-1 space-y-0.5 text-[0.625rem] text-slate-400"><div>Scope: {view.excludedByScope}</div><div>Tags: {view.excludedByTag}</div><div>Depth: {view.excludedByDepth}</div><div>Text: {view.excludedByQuery}</div></div></div>}
          </aside>
        </div>
      </div>
    </div>
  );
};
