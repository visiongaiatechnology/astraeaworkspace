import { describe, expect, it } from 'vitest';
import type { DrawConnectorData, DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from '../../model/drawDocumentEngine';
import { rerouteConnectorsForMovedObjects, routeDrawConnector } from '../../model/drawRoutingEngine';

function shape(id: string, x: number, y: number, width = 20, height = 20, pageId = 'page-1'): DrawObject {
  return {
    id,
    pageId,
    layerId: 'layer-main',
    type: 'shape',
    name: id,
    x,
    y,
    width,
    height,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
  };
}

function connector(overrides: Partial<DrawConnectorData> = {}): DrawConnectorData {
  return {
    from: { objectId: 'from', anchor: 'auto' },
    to: { objectId: 'to', anchor: 'auto' },
    route: 'orthogonal',
    autoRoute: true,
    waypoints: [],
    obstacleAvoidance: true,
    routingPriority: 0,
    crossingStyle: 'none',
    semantic: {},
    arrowStart: 'none',
    arrowEnd: 'triangle',
    ...overrides,
  };
}

function connectorObject(id: string, data: DrawConnectorData): DrawObject {
  return {
    id,
    pageId: 'page-1',
    layerId: 'layer-main',
    type: 'connector',
    name: id,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
    connector: data,
  };
}

describe('Draw connector routing', () => {
  it('anchors automatic endpoints to facing object edges and avoids a blocking shape', () => {
    const objects = {
      from: shape('from', 0, 0),
      to: shape('to', 100, 0),
      blocker: shape('blocker', 45, -5, 20, 30),
    };

    const routed = routeDrawConnector(connector(), objects);

    expect(routed.points[0]).toEqual({ x: 20, y: 10 });
    expect(routed.points.at(-1)).toEqual({ x: 100, y: 10 });
    expect(routed.points.length).toBeGreaterThan(2);
    expect(routed.obstacleHits).toBe(0);
  });

  it('uses exact segment intersection for manual diagonal waypoints', () => {
    const objects = {
      from: shape('from', 0, 0),
      to: shape('to', 100, 0),
      blocker: shape('blocker', 38, 28, 4, 4),
    };
    const data = connector({
      route: 'custom',
      autoRoute: false,
      from: { objectId: 'from', anchor: 'right' },
      to: { objectId: 'to', anchor: 'left' },
      waypoints: [{ x: 60, y: 50 }],
    });

    expect(routeDrawConnector(data, objects).obstacleHits).toBe(1);
  });

  it('does not let invisible objects or objects on other pages block a route', () => {
    const hidden = { ...shape('hidden', 45, -5, 20, 30), opacity: 0 };
    const otherPage = shape('other-page', 45, -5, 20, 30, 'page-2');
    const routed = routeDrawConnector(connector(), {
      from: shape('from', 0, 0),
      to: shape('to', 100, 0),
      hidden,
      'other-page': otherPage,
    });

    expect(routed.points).toEqual([{ x: 20, y: 10 }, { x: 100, y: 10 }]);
    expect(routed.obstacleHits).toBe(0);
  });

  it('rejects missing endpoints, cross-page links, and unsupported point-anchor identifiers', () => {
    const objects = { from: shape('from', 0, 0), to: shape('to', 100, 0) };

    expect(() => routeDrawConnector(connector({ from: { objectId: 'missing', anchor: 'auto' } }), objects))
      .toThrowError(DrawModelError);
    expect(() => routeDrawConnector(connector({ to: { objectId: 'other-page', anchor: 'auto' } }), {
      ...objects,
      'other-page': shape('other-page', 100, 0, 20, 20, 'page-2'),
    })).toThrowError(DrawModelError);
    expect(() => routeDrawConnector(connector({ from: { objectId: 'from', anchor: 'point:named' } }), objects))
      .toThrowError(DrawModelError);
    expect(() => routeDrawConnector(connector({ route: 'custom', autoRoute: false }), objects))
      .toThrowError(DrawModelError);
  });

  it('excludes endpoint groups from collision scoring and rejects a cyclic parent chain', () => {
    const group: DrawObject = { ...shape('group', 10, -10, 100, 40), type: 'group', childIds: ['from'] };
    const from = { ...shape('from', 0, 0), parentGroupId: 'group' };
    const to = shape('to', 100, 0);

    expect(routeDrawConnector(connector(), { group, from, to }).obstacleHits).toBe(0);
    expect(() => routeDrawConnector(connector(), {
      group: { ...group, parentGroupId: 'group' },
      from: { ...from, parentGroupId: 'group' },
      to,
    })).toThrowError(DrawModelError);
  });

  it('reroutes automatic connectors after obstacle changes and only affected manual routes', () => {
    const automatic = connectorObject('automatic', connector());
    const manual = connectorObject('manual', connector({ autoRoute: false, route: 'straight' }));
    const objects = { from: shape('from', 0, 0), to: shape('to', 100, 0), automatic, manual };

    expect([...rerouteConnectorsForMovedObjects(objects, new Set()).keys()]).toEqual(['automatic']);
    expect([...rerouteConnectorsForMovedObjects(objects, new Set(['from'])).keys()]).toEqual(['automatic', 'manual']);
  });
});

