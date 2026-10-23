// STATUS: PLATIN

import { describe, expect, it } from 'vitest';
import type { WhiteboardItem } from '../../types';
import {
  WHITEBOARD_DIAGRAM_MAX_FIELDS,
  WHITEBOARD_DIAGRAM_MAX_LAYOUT_NODES,
  buildWhiteboardConnectorPath,
  buildWhiteboardConnectorPaths,
  autoLayoutWhiteboardDiagram,
  createWhiteboardDiagramPreset,
  normalizeWhiteboardDiagramItem,
  setWhiteboardConnectorLabel,
  setWhiteboardConnectorRoute,
  type WhiteboardDiagramLayoutMode,
  type WhiteboardDiagramPreset,
} from '../../model/whiteboardDiagramEngine';
import { WHITEBOARD_MAX_ITEMS } from '../../viewport/whiteboardViewportEngine';

const item = (id: string, overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id,
  type: 'shape',
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  text: id,
  ...overrides,
});

const diagramNode = (id: string, overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => item(id, {
  diagram: { family: 'flowchart', kind: 'process', title: id },
  ...overrides,
});

const connector = (id: string, fromId: string, toId: string, route: 'straight' | 'orthogonal' | 'curved' = 'straight'): WhiteboardItem => item(id, {
  type: 'connector',
  fromId,
  toId,
  connectorStyle: { route, autoRoute: true },
});

describe('Whiteboard diagram model boundaries', () => {
  it('normalizes text without coercing hostile values and reads no discarded fields', () => {
    const coercionTrap = { toString: () => { throw new Error('coercion executed'); } } as unknown as string;
    const fields = Array.from({ length: WHITEBOARD_DIAGRAM_MAX_FIELDS + 1 }, (_, index) => `field-${index}`);
    Object.defineProperty(fields, WHITEBOARD_DIAGRAM_MAX_FIELDS, {
      get: () => { throw new Error('discarded field was read'); },
    });

    const normalized = normalizeWhiteboardDiagramItem(diagramNode('node', {
      diagram: { family: 'flowchart', kind: 'process', title: coercionTrap, fields },
      lineLabel: coercionTrap,
    }));

    expect(normalized.diagram?.title).toBe('');
    expect(normalized.diagram?.fields).toHaveLength(WHITEBOARD_DIAGRAM_MAX_FIELDS);
    expect(normalized.lineLabel).toBe('');
  });

  it('creates bounded, uniquely identified nodes and connectors for every supported preset', () => {
    const presets: readonly WhiteboardDiagramPreset[] = [
      'flowchart', 'uml', 'network', 'org-chart', 'mind-map', 'erd', 'swimlane', 'process-map', 'journey-map',
    ];

    for (const preset of presets) {
      const generated = createWhiteboardDiagramPreset(preset, 40, -20);
      const ids = new Set(generated.map((entry) => entry.id));
      const nodeIds = new Set(generated.filter((entry) => entry.type !== 'connector').map((entry) => entry.id));
      const links = generated.filter((entry) => entry.type === 'connector');

      expect(generated.length).toBeLessThan(40);
      expect(ids.size).toBe(generated.length);
      expect(links.every((link) => nodeIds.has(link.fromId ?? '') && nodeIds.has(link.toId ?? ''))).toBe(true);
      expect(generated.every((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y))).toBe(true);
    }
  });

  it('rejects unknown presets, routes, layout modes, and non-boolean routing flags', () => {
    expect(() => createWhiteboardDiagramPreset('unknown' as WhiteboardDiagramPreset, 0, 0)).toThrow(RangeError);
    expect(() => setWhiteboardConnectorRoute([], [], 'unknown' as 'straight', true)).toThrow(RangeError);
    expect(() => setWhiteboardConnectorRoute([], [], 'straight', 'yes' as unknown as boolean)).toThrow(TypeError);
    expect(() => autoLayoutWhiteboardDiagram([], [], 'unknown' as WhiteboardDiagramLayoutMode)).toThrow(RangeError);
  });

  it('builds straight, curved, and obstacle-aware orthogonal connector paths', () => {
    const from = item('from', { x: 0, y: 0 });
    const to = item('to', { x: 300, y: 0 });
    const straight = buildWhiteboardConnectorPath(connector('straight', 'from', 'to'), [from, to]);
    const curved = buildWhiteboardConnectorPath(connector('curved', 'from', 'to', 'curved'), [from, to]);
    const obstacle = item('obstacle', { x: 140, y: -30, width: 60, height: 100 });
    const orthogonal = buildWhiteboardConnectorPath(connector('orthogonal', 'from', 'to', 'orthogonal'), [from, to, obstacle]);
    const invalidRoute = { ...connector('invalid-route', 'from', 'to'), connectorStyle: { route: 'unknown' as 'straight', autoRoute: true } };

    expect(straight?.path).toBe('M 100 20 L 300 20');
    expect(curved?.path).toContain(' C ');
    expect(orthogonal?.route).toBe('orthogonal');
    expect(orthogonal?.path).toContain(' L ');
    expect(buildWhiteboardConnectorPath(connector('missing', 'from', 'absent'), [from])).toBeNull();
    expect(buildWhiteboardConnectorPath({ ...connector('empty-id', 'from', 'to'), fromId: '' }, [item(''), from, to])).toBeNull();
    expect(buildWhiteboardConnectorPath(connector('hidden', 'from', 'to'), [from, { ...to, hidden: true }])).toBeNull();
    expect(buildWhiteboardConnectorPath(invalidRoute, [from, to])?.route).toBe('curved');
  });

  it('indexes connector endpoints once for a complete render projection and respects the item ceiling', () => {
    const from = item('from', { x: 0, y: 0 });
    const to = item('to', { x: 300, y: 0 });
    const edge = connector('edge', 'from', 'to');
    const paths = buildWhiteboardConnectorPaths([from, to, edge]);
    expect(paths.get('edge')?.path).toBe('M 100 20 L 300 20');

    const oversized: WhiteboardItem[] = new Array(WHITEBOARD_MAX_ITEMS + 1);
    oversized[0] = from;
    oversized[1] = to;
    oversized[2] = edge;
    Object.defineProperty(oversized, WHITEBOARD_MAX_ITEMS, {
      get: () => { throw new Error('routing read beyond the canonical item ceiling'); },
    });
    expect(buildWhiteboardConnectorPaths(oversized).get('edge')?.path).toBe('M 100 20 L 300 20');
  });

  it('updates only selected connectors and caps the selected-ID traversal', () => {
    const first = connector('first', 'a', 'b');
    const second = connector('second', 'a', 'b');
    const items = [first, second];
    const routed = setWhiteboardConnectorRoute(items, ['first'], 'orthogonal', false);
    expect(routed[0]?.connectorStyle).toEqual({ route: 'orthogonal', autoRoute: false });
    expect(routed[1]).toBe(second);

    const labeled = setWhiteboardConnectorLabel(items, ['second'], '  approved\u0000  ');
    expect(labeled[0]).toBe(first);
    expect(labeled[1]?.lineLabel).toBe('  approved  ');

    const excessiveSelection = [...Array.from({ length: 5_000 }, (_, index) => `unused-${index}`), 'second'];
    expect(setWhiteboardConnectorRoute(items, excessiveSelection, 'curved')[1]).toBe(second);
  });

  it('lays out selected unlocked diagram nodes while preserving other nodes and connectors', () => {
    const root = diagramNode('root', { x: 10, y: 20 });
    const child = diagramNode('child', { x: 400, y: 120 });
    const outside = diagramNode('outside', { x: 700, y: 400 });
    const locked = diagramNode('locked', { x: 900, y: 600, locked: true });
    const edge = connector('edge', root.id, child.id);
    const source = [root, child, outside, locked, edge];

    const result = autoLayoutWhiteboardDiagram(source, ['root', 'child', 'locked'], 'tree-horizontal');

    expect(result[0]).toMatchObject({ id: 'root', x: 10, y: 20 });
    expect(result[1]).toMatchObject({ id: 'child', x: 310, y: 20 });
    expect(result[2]).toBe(outside);
    expect(result[3]).toBe(locked);
    expect(result[4]).toBe(edge);
  });

  it('caps layout nodes and leaves nodes beyond the ceiling unchanged', () => {
    const nodes = Array.from({ length: WHITEBOARD_DIAGRAM_MAX_LAYOUT_NODES + 1 }, (_, index) => diagramNode(`node-${index}`));
    const result = autoLayoutWhiteboardDiagram(nodes, [], 'graph');

    expect(result).toHaveLength(nodes.length);
    expect(result[WHITEBOARD_DIAGRAM_MAX_LAYOUT_NODES]).toBe(nodes[WHITEBOARD_DIAGRAM_MAX_LAYOUT_NODES]);
  });
});
