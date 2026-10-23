// STATUS: PLATIN — AST-0671/AST-0674: the knowledge graph filters by tag and path depth, bounded and visible.
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage } from '../../../../shared/contracts/workspace';
import { buildKnowledgeIndex, reconcileKnowledgeNotebooks } from '../../knowledge-graph/notesKnowledgeGraph';
import {
  NOTE_GRAPH_MAX_DEPTH,
  NOTE_GRAPH_MAX_NODES,
  buildNoteGraphView,
  graphDepthFromRoot,
  layoutNoteGraphNodes,
} from '../../knowledge-graph/notesGraphFilter';

/**
 * Chain root → c1 → c2 → … so the depth filter has a measurable meaning, plus two side notes that are
 * only reachable through their own tags.
 */
function page(id: string, tags: string[], links: string[] = []): NotePage {
  return {
    id,
    title: id,
    content: links.map((target) => `[[${target}]]`).join(' '),
    tags,
    backlinks: [],
    last_modified: 1_700_000_000_000,
    revisions: [],
  };
}

function chainNotebook(): NoteNotebook {
  const pages: NotePage[] = [
    page('root', ['research'], ['c1']),
    page('c1', ['research'], ['c2']),
    page('c2', ['deep'], ['c3']),
    page('c3', ['deep'], []),
    page('side', ['other'], []),
  ];
  return reconcileKnowledgeNotebooks([{
    id: 'nb', title: 'Research Notebook', createdAt: 1, updatedAt: 1, trashedAt: null,
    sections: [{ id: 'sec', title: 'Evidence', pages, createdAt: 1, updatedAt: 1, trashedAt: null }],
  }], 1_700_000_000_000)[0];
}

const notebook = chainNotebook();
const index = buildKnowledgeIndex([notebook]);
const baseFilter = { scope: 'global' as const, query: '', tags: [] as string[], maxDepth: null, rootPageId: 'root', activeNotebookId: 'nb' };

describe('AST-0672 depth measurement', () => {
  it('measures the shortest link distance from the root, in both directions', () => {
    const depth = graphDepthFromRoot(index, 'root');
    expect(depth.get('root')).toBe(0);
    expect(depth.get('c1')).toBe(1);
    expect(depth.get('c2')).toBe(2);
    expect(depth.get('c3')).toBe(3);
    expect(depth.has('side')).toBe(false);
    expect(graphDepthFromRoot(index, '').size).toBe(0);
  });
});

describe('AST-0671/AST-0674 filtering by tag and path depth', () => {
  it('returns the whole reachable graph when no filter is active', () => {
    const view = buildNoteGraphView(index, baseFilter);
    expect(view.nodes.map((node) => node.pageId).sort()).toEqual(['c1', 'c2', 'c3', 'root', 'side']);
    expect(view.excludedByTag).toBe(0);
    expect(view.availableTags).toEqual(['deep', 'other', 'research']);
  });

  it('keeps only pages that carry every requested tag', () => {
    const view = buildNoteGraphView(index, { ...baseFilter, tags: ['research'] });
    expect(view.nodes.map((node) => node.pageId).sort()).toEqual(['c1', 'root']);
    expect(view.excludedByTag).toBe(3);
    const impossible = buildNoteGraphView(index, { ...baseFilter, tags: ['research', 'deep'] });
    expect(impossible.nodes).toEqual([]);
    expect(impossible.excludedByTag).toBe(5);
  });

  it('cuts the graph at the requested path depth and reports how many nodes it removed', () => {
    const view = buildNoteGraphView(index, { ...baseFilter, maxDepth: 1 });
    expect(view.nodes.map((node) => node.pageId).sort()).toEqual(['c1', 'root']);
    expect(view.excludedByDepth).toBe(3);
  });

  it('clamps the depth into the bounded range instead of scanning unbounded', () => {
    const tooDeep = buildNoteGraphView(index, { ...baseFilter, maxDepth: 99 });
    // An explicit depth filter is a reachability filter: the unreachable side note is excluded as well.
    expect(tooDeep.nodes.map((node) => node.pageId).sort()).toEqual(['c1', 'c2', 'c3', 'root']);
    expect(tooDeep.excludedByDepth).toBe(1);
    const zero = buildNoteGraphView(index, { ...baseFilter, maxDepth: 0 });
    expect(zero.nodes.map((node) => node.pageId)).toEqual(['root']);
    const negative = buildNoteGraphView(index, { ...baseFilter, maxDepth: -3 });
    expect(negative.nodes.map((node) => node.pageId)).toEqual(['root']);
  });

  it('applies local scope as reachability, and never leaves a dangling edge', () => {
    const view = buildNoteGraphView(index, { ...baseFilter, scope: 'local', maxDepth: null });
    expect(view.nodes.map((node) => node.pageId).sort()).toEqual(['c1', 'c2', 'c3', 'root']);
    expect(view.nodes.some((node) => node.pageId === 'side')).toBe(false);
    for (const edge of view.edges) {
      expect(view.nodes.some((node) => node.pageId === edge.sourcePageId)).toBe(true);
      expect(view.nodes.some((node) => node.pageId === edge.targetPageId)).toBe(true);
    }
  });

  it('drops everything when the text query matches nothing, and counts the removals', () => {
    const view = buildNoteGraphView(index, { ...baseFilter, query: 'zzz' });
    expect(view.nodes).toEqual([]);
    expect(view.edges).toEqual([]);
    expect(view.excludedByQuery).toBe(5);
  });

  it('caps nodes and reports the truncation instead of pretending the graph is complete', () => {
    const many: NotePage[] = Array.from({ length: NOTE_GRAPH_MAX_NODES + 20 }, (_, i) => page(`p${i}`, ['bulk']));
    const bigNotebook = reconcileKnowledgeNotebooks([{
      id: 'nb-big', title: 'Big', createdAt: 1, updatedAt: 1, trashedAt: null,
      sections: [{ id: 'sec-big', title: 'Bulk', pages: many, createdAt: 1, updatedAt: 1, trashedAt: null }],
    }], 1)[0];
    const view = buildNoteGraphView(buildKnowledgeIndex([bigNotebook]), { ...baseFilter, rootPageId: 'p0', activeNotebookId: 'nb-big' });
    expect(view.nodes).toHaveLength(NOTE_GRAPH_MAX_NODES);
    expect(view.truncated).toBe(true);
  });
});

describe('AST-0671 deterministic ring layout', () => {
  it('centres the root and groups the other nodes by their measured depth', () => {
    const view = buildNoteGraphView(index, baseFilter);
    const laid = layoutNoteGraphNodes(view, 'root');
    const root = laid.find((node) => node.pageId === 'root')!;
    expect({ x: root.x, y: root.y }).toEqual({ x: 400, y: 300 });
    const radius = (id: string) => {
      const node = laid.find((entry) => entry.pageId === id)!;
      return Math.round(Math.hypot(node.x - 400, node.y - 300));
    };
    expect(radius('c1')).toBe(135);
    expect(radius('c2')).toBe(217);
    // Layout is deterministic: the same view always yields the same coordinates.
    expect(layoutNoteGraphNodes(view, 'root')).toEqual(laid);
  });

  it('never exceeds the documented depth cap when laying out unreachable nodes', () => {
    const view = buildNoteGraphView(index, { ...baseFilter, query: '' });
    const laid = layoutNoteGraphNodes(view, 'root');
    const side = laid.find((node) => node.pageId === 'side')!;
    expect(Math.hypot(side.x - 400, side.y - 300)).toBeLessThanOrEqual(135 + NOTE_GRAPH_MAX_DEPTH * 82);
  });
});
