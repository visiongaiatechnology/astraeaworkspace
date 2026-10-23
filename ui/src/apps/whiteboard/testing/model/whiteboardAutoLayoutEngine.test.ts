import { describe, expect, it } from 'vitest';
import type { WhiteboardItem } from '../../types';
import { alignWhiteboardItems, applyTreeAutoLayout, calculateOrthogonalRoute } from '../../model/whiteboardAutoLayoutEngine';

const item = (id: string, type: WhiteboardItem['type'] = 'sticky', overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id,
  type,
  x: 0,
  y: 0,
  width: 20,
  height: 20,
  text: id,
  color: 'yellow',
  ...overrides,
});

const connector = (id: string, fromId: string, toId: string): WhiteboardItem => item(id, 'connector', { fromId, toId });

describe('Whiteboard layout model', () => {
  it('routes between facing anchors and emits an orthogonal path', () => {
    const route = calculateOrthogonalRoute(item('source', 'sticky', { x: 0, y: 0, width: 30, height: 20 }), item('target', 'sticky', { x: 100, y: 10, width: 20, height: 20 }), 'connector-1');

    expect(route.sourceAnchor.side).toBe('right');
    expect(route.targetAnchor.side).toBe('left');
    expect(route.waypoints).toEqual([{ x: 30, y: 10 }, { x: 65, y: 10 }, { x: 65, y: 20 }, { x: 100, y: 20 }]);
    expect(route.svgPathData).toBe('M 30 10 L 65 10 L 65 20 L 100 20');
  });

  it('preserves connected nodes, connectors, and frames during tree layout', () => {
    const root = item('root');
    const child = item('child');
    const edge = connector('edge', root.id, child.id);
    const frame = item('frame', 'frame', { width: 640, height: 360 });

    const result = applyTreeAutoLayout([root, child, edge, frame]);

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ id: 'root', x: 100, y: 100 });
    expect(result[1]).toMatchObject({ id: 'child', x: 200, y: 100 });
    expect(result[2]).toBe(edge);
    expect(result[3]).toBe(frame);
  });

  it('terminates on cycles and lays out disconnected nodes', () => {
    const first = item('first');
    const second = item('second');
    const isolated = item('isolated');
    const result = applyTreeAutoLayout([
      first,
      second,
      isolated,
      connector('forward', first.id, second.id),
      connector('back', second.id, first.id),
    ]);

    expect(result).toHaveLength(5);
    expect(result.slice(0, 3).every((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y))).toBe(true);
  });

  it('lays out a deep chain iteratively without recursive stack growth', () => {
    const count = 12_000;
    const nodes = Array.from({ length: count }, (_, index) => item(`node-${index}`));
    const edges = Array.from({ length: count - 1 }, (_, index) => connector(`edge-${index}`, `node-${index}`, `node-${index + 1}`));

    const result = applyTreeAutoLayout([...nodes, ...edges]);

    expect(result).toHaveLength(count * 2 - 1);
    expect(result[0]).toMatchObject({ id: 'node-0', x: 100, y: 100 });
    expect(result[count - 1]).toMatchObject({ id: `node-${count - 1}`, x: 100 + (count - 1) * 100, y: 100 });
  });

  it('handles a high fan-out without spreading the child coordinates into function arguments', () => {
    const count = 12_000;
    const root = item('root');
    const children = Array.from({ length: count }, (_, index) => item(`child-${index}`));
    const edges = children.map((child) => connector(`edge-${child.id}`, root.id, child.id));

    const result = applyTreeAutoLayout([root, ...children, ...edges]);

    expect(result).toHaveLength(1 + count * 2);
    expect(result[0]?.id).toBe('root');
    expect(result[0]?.y).toBeGreaterThan(100);
    expect(result[1]?.id).toBe('child-0');
    expect(result[count]?.id).toBe(`child-${count - 1}`);
  });

  it('aligns selected unlocked items while preserving locked objects and connectors', () => {
    const first = item('first', 'sticky', { x: 10, y: 5 });
    const second = item('second', 'sticky', { x: 80, y: 30 });
    const locked = item('locked', 'sticky', { x: 40, y: 70, locked: true });
    const edge = connector('edge', first.id, second.id);

    const result = alignWhiteboardItems([first, second, locked, edge], ['first', 'second', 'locked'], 'left');

    expect(result[0]?.x).toBe(10);
    expect(result[1]?.x).toBe(10);
    expect(result[2]).toBe(locked);
    expect(result[3]).toBe(edge);
  });
});
