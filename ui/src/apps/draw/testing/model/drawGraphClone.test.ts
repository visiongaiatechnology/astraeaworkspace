import { describe, expect, it } from 'vitest';
import type { DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from '../../model/drawDocumentEngine';
import { cloneDrawGraph } from '../../model/drawGraphClone';

function object(id: string, type: DrawObject['type'] = 'shape'): DrawObject {
  return {
    id,
    pageId: 'page-1',
    layerId: 'layer-main',
    type,
    name: id,
    x: 10,
    y: 20,
    width: 40,
    height: 30,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
    ...(type === 'group' ? { childIds: [] } : {}),
    ...(type === 'connector' ? {
      connector: {
        from: { objectId: 'child', anchor: 'right' as const },
        to: { objectId: 'peer', anchor: 'left' as const },
        route: 'custom' as const,
        autoRoute: false,
        waypoints: [{ x: 60, y: 50 }],
        obstacleAvoidance: true,
        routingPriority: 0,
        crossingStyle: 'none' as const,
        semantic: {},
        arrowStart: 'none' as const,
        arrowEnd: 'triangle' as const,
      },
    } : {}),
  };
}

describe('Draw graph cloning', () => {
  it('remaps group and connector references, page, positions, and waypoints', () => {
    const group = { ...object('group', 'group'), childIds: ['child', 'peer'] };
    const child = { ...object('child'), parentGroupId: 'group' };
    const peer = { ...object('peer'), parentGroupId: 'group', x: 100 };
    const edge = object('edge', 'connector');
    const clones = cloneDrawGraph([group, child, peer, edge], new Map([
      ['group', 'group-copy'],
      ['child', 'child-copy'],
      ['peer', 'peer-copy'],
      ['edge', 'edge-copy'],
    ]), 'page-2', { x: 5, y: -2 });

    const byId = new Map(clones.map((clone) => [clone.id, clone]));
    expect(byId.get('group-copy')?.childIds).toEqual(['child-copy', 'peer-copy']);
    expect(byId.get('child-copy')?.parentGroupId).toBe('group-copy');
    expect(byId.get('edge-copy')?.connector?.from.objectId).toBe('child-copy');
    expect(byId.get('edge-copy')?.connector?.to.objectId).toBe('peer-copy');
    expect(byId.get('edge-copy')?.connector?.waypoints).toEqual([{ x: 65, y: 48 }]);
    expect(byId.get('peer-copy')).toMatchObject({ pageId: 'page-2', x: 105, y: 18 });
  });

  it('detaches partial group copies from external parents and filters external children', () => {
    const parent = { ...object('parent', 'group'), childIds: ['child', 'outside'] };
    const child = { ...object('child'), parentGroupId: 'parent' };

    const clones = cloneDrawGraph([parent, child], new Map([['parent', 'parent-copy'], ['child', 'child-copy']]), 'page-2');

    expect(clones[0].childIds).toEqual(['child-copy']);
    expect(clones[1].parentGroupId).toBe('parent-copy');
    const detached = cloneDrawGraph([child], new Map([['child', 'child-detached']]), 'page-2');
    expect(detached[0].parentGroupId).toBeUndefined();
  });

  it('rejects duplicate target ids, missing mappings, and external connector endpoints', () => {
    const nodes = [object('one'), object('two')];
    expect(() => cloneDrawGraph(nodes, new Map([['one', 'copy'], ['two', 'copy']]), 'page-2'))
      .toThrowError(DrawModelError);
    expect(() => cloneDrawGraph(nodes, new Map([['one', 'copy']]), 'page-2'))
      .toThrowError(DrawModelError);
    expect(() => cloneDrawGraph([object('edge', 'connector')], new Map([['edge', 'edge-copy']]), 'page-2'))
      .toThrowError(DrawModelError);
  });

  it('rejects non-finite translation values before emitting clones', () => {
    expect(() => cloneDrawGraph([object('one')], new Map([['one', 'one-copy']]), 'page-2', { x: Number.NaN, y: 0 }))
      .toThrowError(DrawModelError);
  });
});

