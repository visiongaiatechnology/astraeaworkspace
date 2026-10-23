import { describe, expect, it } from 'vitest';
import { buildWhiteboardRenderProjection } from '../../rendering/whiteboardRenderProjection';
import type { WhiteboardItem } from '../../types';

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

const connector = (id: string, fromId: string, toId: string, overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => item(id, {
  type: 'connector',
  fromId,
  toId,
  connectorStyle: { route: 'straight', autoRoute: false },
  ...overrides,
});

describe('Whiteboard render projection', () => {
  it('filters hidden records, sorts visible records deterministically, and routes only visible valid connectors', () => {
    const nodeB = item('node-b', { x: 200, zIndex: 5 });
    const hiddenNode = item('hidden-node', { x: 400, hidden: true, zIndex: -1 });
    const nodeA = item('node-a', { zIndex: 5 });
    const visibleEdge = connector('visible-edge', nodeA.id, nodeB.id, { zIndex: 0 });
    const hiddenEdge = connector('hidden-edge', nodeA.id, nodeB.id, { hidden: true, zIndex: -5 });
    const danglingEdge = connector('dangling-edge', nodeA.id, hiddenNode.id, { zIndex: 1 });
    const source = [nodeB, hiddenNode, nodeA, visibleEdge, hiddenEdge, danglingEdge];
    const originalOrder = source.map(({ id }) => id);

    const projection = buildWhiteboardRenderProjection(source);

    expect(projection.items.map(({ id }) => id)).toEqual(['visible-edge', 'dangling-edge', 'node-a', 'node-b']);
    expect(projection.connectorPaths.has('visible-edge')).toBe(true);
    expect(projection.connectorPaths.has('hidden-edge')).toBe(false);
    expect(projection.connectorPaths.has('dangling-edge')).toBe(false);
    expect(source.map(({ id }) => id)).toEqual(originalOrder);
    expect(projection.items[0]).toBe(visibleEdge);
    expect(projection.items[2]).toBe(nodeA);
  });
});
