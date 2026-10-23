// STATUS: DIAMANT VGT SUPREME — pure knowledge-graph filtering by tag and path depth
//
// AST-0671 acceptance: "Verbindungen als Graph laden, nach Tags und Pfadtiefe filtern."
// The graph renderer owns no filter rule: this module computes the visible node and edge sets from the
// canonical knowledge index, bounded in nodes, edges and traversal steps.

import type { NoteKnowledgeIndex } from './notesKnowledgeGraph';

export const NOTE_GRAPH_MAX_NODES = 512;
export const NOTE_GRAPH_MAX_EDGES = 2048;
export const NOTE_GRAPH_MAX_DEPTH = 8;

export type NoteGraphScope = 'local' | 'notebook' | 'global';

export interface NoteGraphFilter {
  scope: NoteGraphScope;
  /** Free-text filter over note title and notebook title. */
  query: string;
  /** Every listed tag must be present on the page (empty list = no tag restriction). */
  tags: readonly string[];
  /** Maximum path depth from the root note; `null` = unlimited (bounded by NOTE_GRAPH_MAX_DEPTH). */
  maxDepth: number | null;
  /** Centre/origin of the graph and of the depth measurement. */
  rootPageId: string;
  activeNotebookId: string;
}

export interface NoteGraphNodeEntry {
  pageId: string;
  title: string;
  notebookTitle: string;
  depth: number;
  connections: number;
}

export interface NoteGraphEdgeEntry {
  sourcePageId: string;
  targetPageId: string;
  anchor?: string;
  transclusion: boolean;
}

export interface NoteGraphView {
  nodes: NoteGraphNodeEntry[];
  edges: NoteGraphEdgeEntry[];
  /** Nodes removed because they are outside the selected scope. */
  excludedByScope: number;
  /** Nodes removed because of the tag restriction. */
  excludedByTag: number;
  /** Nodes removed because they are farther from the root than `maxDepth`. */
  excludedByDepth: number;
  /** Nodes removed because the free-text query did not match. */
  excludedByQuery: number;
  /** True when the node or edge cap cut the view; the UI must say so. */
  truncated: boolean;
  /** Tags present on the pages inside the current scope, sorted and bounded. */
  availableTags: string[];
}

function normalizeTagList(tags: readonly string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.normalize('NFKC').trim().toLocaleLowerCase()).filter(Boolean))).slice(0, 32);
}

/**
 * Breadth-first distance from the root note along resolved stable-ID edges, bounded by
 * `NOTE_GRAPH_MAX_DEPTH` and by the edge budget. Unreachable pages are reported as `Infinity`.
 */
export function graphDepthFromRoot(
  index: Pick<NoteKnowledgeIndex, 'edges'>,
  rootPageId: string,
): Map<string, number> {
  const depth = new Map<string, number>();
  if (!rootPageId) return depth;
  const adjacency = new Map<string, string[]>();
  for (const edge of index.edges.slice(0, NOTE_GRAPH_MAX_EDGES)) {
    const forward = adjacency.get(edge.sourcePageId) ?? [];
    forward.push(edge.targetPageId);
    adjacency.set(edge.sourcePageId, forward);
    const backward = adjacency.get(edge.targetPageId) ?? [];
    backward.push(edge.sourcePageId);
    adjacency.set(edge.targetPageId, backward);
  }
  depth.set(rootPageId, 0);
  let frontier = [rootPageId];
  for (let level = 1; level <= NOTE_GRAPH_MAX_DEPTH && frontier.length; level += 1) {
    const next: string[] = [];
    for (const pageId of frontier) {
      for (const neighbour of adjacency.get(pageId) ?? []) {
        if (depth.has(neighbour)) continue;
        depth.set(neighbour, level);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return depth;
}

/**
 * Applies scope, tag, depth and text filters to the canonical index in one pass.
 * Fail-closed: an unsatisfiable filter yields an empty graph, never an unfiltered one.
 */
export function buildNoteGraphView(index: NoteKnowledgeIndex, filter: NoteGraphFilter): NoteGraphView {
  const wantedTags = normalizeTagList(filter.tags);
  const query = filter.query.normalize('NFKC').trim().toLocaleLowerCase();
  const depth = graphDepthFromRoot(index, filter.rootPageId);
  const effectiveMaxDepth = filter.maxDepth === null
    ? NOTE_GRAPH_MAX_DEPTH
    : Math.max(0, Math.min(NOTE_GRAPH_MAX_DEPTH, Math.trunc(filter.maxDepth)));
  const depthRestricted = filter.scope === 'local' || filter.maxDepth !== null;

  const tagsByPageId = new Map(index.pages.map((entry) => [
    entry.page.id,
    entry.page.tags.map((tag) => tag.normalize('NFKC').trim().toLocaleLowerCase()),
  ]));

  const inScope = (entry: NoteKnowledgeIndex['pages'][number]): boolean => {
    if (filter.scope === 'global') return true;
    if (filter.scope === 'notebook') return entry.notebookId === filter.activeNotebookId;
    return entry.page.id === filter.rootPageId
      || (depth.get(entry.page.id) ?? Number.POSITIVE_INFINITY) <= effectiveMaxDepth;
  };
  const withinDepth = (pageId: string): boolean => pageId === filter.rootPageId
    || (depth.get(pageId) ?? Number.POSITIVE_INFINITY) <= effectiveMaxDepth;

  const availableTags = Array.from(new Set(index.pages
    .filter((entry) => filter.scope === 'global'
      || (filter.scope === 'notebook' ? entry.notebookId === filter.activeNotebookId : withinDepth(entry.page.id)))
    .flatMap((entry) => tagsByPageId.get(entry.page.id) ?? [])))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 64);

  let excludedByScope = 0;
  let excludedByTag = 0;
  let excludedByDepth = 0;
  let excludedByQuery = 0;
  const allowed = new Set<string>();

  for (const entry of index.pages) {
    if (!inScope(entry)) { excludedByScope += 1; continue; }
    if (depthRestricted && !withinDepth(entry.page.id)) { excludedByDepth += 1; continue; }
    const pageTags = tagsByPageId.get(entry.page.id) ?? [];
    if (wantedTags.length && !wantedTags.every((tag) => pageTags.includes(tag))) { excludedByTag += 1; continue; }
    if (query && !`${entry.page.title} ${entry.notebookTitle}`.normalize('NFKC').toLocaleLowerCase().includes(query)) { excludedByQuery += 1; continue; }
    allowed.add(entry.page.id);
  }

  const allowedEdges = index.edges.filter((edge) => allowed.has(edge.sourcePageId) && allowed.has(edge.targetPageId));
  const edges = allowedEdges.slice(0, NOTE_GRAPH_MAX_EDGES);
  const connections = new Map<string, number>();
  for (const edge of edges) {
    connections.set(edge.sourcePageId, (connections.get(edge.sourcePageId) ?? 0) + 1);
    connections.set(edge.targetPageId, (connections.get(edge.targetPageId) ?? 0) + 1);
  }

  const nodes: NoteGraphNodeEntry[] = index.pages
    .filter((entry) => allowed.has(entry.page.id))
    .slice(0, NOTE_GRAPH_MAX_NODES)
    .map((entry) => ({
      pageId: entry.page.id,
      title: entry.page.title,
      notebookTitle: entry.notebookTitle,
      depth: depth.get(entry.page.id) ?? Number.POSITIVE_INFINITY,
      connections: connections.get(entry.page.id) ?? 0,
    }));

  return {
    nodes,
    edges,
    excludedByScope,
    excludedByTag,
    excludedByDepth,
    excludedByQuery,
    truncated: nodes.length < allowed.size || edges.length < allowedEdges.length,
    availableTags,
  };
}

/**
 * Deterministic ring layout for the visible nodes: the root stays centred and the rings follow the
 * measured depth, so a filtered graph never reshuffles unrelated nodes.
 */
export function layoutNoteGraphNodes(
  view: NoteGraphView,
  rootPageId: string,
  center = { x: 400, y: 300 },
): Array<NoteGraphNodeEntry & { x: number; y: number }> {
  const byDepth = new Map<number, NoteGraphNodeEntry[]>();
  for (const node of view.nodes) {
    const ring = node.pageId === rootPageId ? -1 : Math.min(NOTE_GRAPH_MAX_DEPTH, Number.isFinite(node.depth) ? node.depth : NOTE_GRAPH_MAX_DEPTH);
    const bucket = byDepth.get(ring) ?? [];
    bucket.push(node);
    byDepth.set(ring, bucket);
  }
  const out: Array<NoteGraphNodeEntry & { x: number; y: number }> = [];
  for (const [ring, bucket] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    if (ring < 0) {
      for (const node of bucket) out.push({ ...node, x: center.x, y: center.y });
      continue;
    }
    const sorted = [...bucket].sort((a, b) => a.pageId.localeCompare(b.pageId));
    const radius = 135 + Math.max(0, ring - 1) * 82;
    sorted.forEach((node, position) => {
      const angle = (position / Math.max(1, sorted.length)) * Math.PI * 2 - Math.PI / 2;
      out.push({ ...node, x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
    });
  }
  return out;
}
