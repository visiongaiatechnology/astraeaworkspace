// STATUS: GOLD — Draw connector engine: creation, fail-closed paths, routing stability across moves.
import { describe, expect, it } from 'vitest';
import {
  appendDrawConnectorWaypoint, clearDrawConnectorWaypoints, connectorRoutesAfterMove, createDrawConnector,
  deleteDrawConnector, findDrawConnectorsForObject, isDrawConnectorRouteStale, routeDrawConnectorFromModel,
  setDrawConnectorArrowheads, setDrawConnectorLabel, setDrawConnectorObstacleAvoidance, setDrawConnectorRoute,
  setDrawConnectorWaypoints, syncDrawConnectorBounds,
} from '../../interactions/drawConnectorEngine';
import { moveDrawObjects } from '../../interactions/drawCommandEngine';
import { buildDrawModel, connectorFixture } from './drawInteractionFixtures';

function twoNodes() {
  return buildDrawModel({
    layers: [{ id: 'layer-main' }, { id: 'layer-locked', locked: true }],
    objects: [
      { id: 'a', x: 0, y: 0, width: 100, height: 60 },
      { id: 'b', x: 400, y: 300, width: 100, height: 60 },
    ],
  });
}

function connectorIdOf(model: ReturnType<typeof twoNodes>): string {
  const id = Object.keys(model.objects).find((candidate) => model.objects[candidate]?.type === 'connector');
  if (!id) throw new Error('no connector');
  return id;
}

describe('Draw connector engine — creation', () => {
  it('connects two nodes and routes orthogonally through the canonical router', () => {
    const model = createDrawConnector(twoNodes(), 'a', 'b', { idSeed: 'c1' });
    const id = connectorIdOf(model);
    const connector = model.objects[id]!;
    expect(connector.type).toBe('connector');
    expect(connector.connector?.route).toBe('orthogonal');
    expect(connector.connector?.autoRoute).toBe(true);
    const route = routeDrawConnectorFromModel(model, id);
    expect(route.points.length).toBeGreaterThanOrEqual(2);
    expect(route.path.startsWith('M ')).toBe(true);
    // A fresh connector spans both endpoint boxes so marquee selection can reach it immediately …
    expect({ x: connector.x, y: connector.y, width: connector.width, height: connector.height })
      .toEqual({ x: 0, y: 0, width: 500, height: 360 });
    // … and the stored box is reported as stale until the routed extent is written back.
    expect(isDrawConnectorRouteStale(model, id)).toBe(true);
    const synced = syncDrawConnectorBounds(model);
    expect({ x: synced.objects[id]!.x, y: synced.objects[id]!.y, width: synced.objects[id]!.width, height: synced.objects[id]!.height })
      .toEqual({ x: 100, y: 30, width: 300, height: 300 });
    expect(isDrawConnectorRouteStale(synced, id)).toBe(false);
  });

  it('rejects self-connections, connectors as endpoints and locked layers', () => {
    const model = twoNodes();
    expect(() => createDrawConnector(model, 'a', 'a')).toThrowError(/connector-self-connection/);
    const withConnector = createDrawConnector(model, 'a', 'b', { idSeed: 'c1' });
    const id = connectorIdOf(withConnector);
    expect(() => createDrawConnector(withConnector, 'a', id)).toThrowError(/connector-endpoint-invalid/);
    expect(() => createDrawConnector(withConnector, id, 'a')).toThrowError(/connector-endpoint-invalid/);
    expect(() => createDrawConnector(model, 'a', 'b', { layerId: 'layer-locked' })).toThrowError(/layer-locked/);
    expect(() => createDrawConnector(model, 'a', 'b', { layerId: 'layer-nope' })).toThrowError(/object-layer-missing/);
    expect(() => createDrawConnector(model, 'a', 'missing')).toThrowError(/connector-endpoint-missing/);
  });

  it('rejects a purely custom route without waypoints instead of drawing nothing', () => {
    expect(() => createDrawConnector(twoNodes(), 'a', 'b', { route: 'custom', autoRoute: false }))
      .toThrowError(/connector-custom-waypoints-missing/);
  });

  it('rejects a locked endpoint', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 400, y: 0, width: 100, height: 60, locked: true },
      ],
    });
    expect(() => createDrawConnector(model, 'a', 'b')).toThrowError(/object-locked/);
  });
});

describe('Draw connector engine — layout change re-routes', () => {
  it('produces a different path after a node moves and ignores an unrelated move', () => {
    const model = createDrawConnector(twoNodes(), 'a', 'b', { idSeed: 'c1' });
    const id = connectorIdOf(model);
    const before = routeDrawConnectorFromModel(model, id).path;

    const moved = moveDrawObjects(model, ['b'], { x: 0, y: 260 }, { snap: false }).model;
    const after = routeDrawConnectorFromModel(moved, id).path;
    expect(after).not.toBe(before);
    expect(isDrawConnectorRouteStale(moved, id)).toBe(true);

    const rerouted = connectorRoutesAfterMove(moved, new Set(['b']));
    expect(rerouted.get(id)?.path).toBe(after);
    // A move of an unrelated object re-routes nothing (bounded work, no global recompute).
    expect(connectorRoutesAfterMove(moved, new Set(['a']))?.get(id)?.path).toBeTruthy();

    const synced = syncDrawConnectorBounds(moved);
    expect(isDrawConnectorRouteStale(synced, id)).toBe(false);
  });

  it('keeps links stable when a node changes layer', () => {
    const model = createDrawConnector(twoNodes(), 'a', 'b', { idSeed: 'c1' });
    const id = connectorIdOf(model);
    expect(findDrawConnectorsForObject(model, 'a').map((object) => object.id)).toEqual([id]);
    expect(findDrawConnectorsForObject(model, 'b').map((object) => object.id)).toEqual([id]);
    expect(findDrawConnectorsForObject(model, 'a-nope')).toEqual([]);
  });
});

describe('Draw connector engine — editing', () => {
  it('edits route, label, arrowheads and obstacle avoidance', () => {
    let model = createDrawConnector(twoNodes(), 'a', 'b', { idSeed: 'c1' });
    const id = connectorIdOf(model);
    model = setDrawConnectorRoute(model, id, 'straight');
    expect(model.objects[id]?.connector?.route).toBe('straight');
    model = setDrawConnectorLabel(model, id, 'depends on');
    expect(model.objects[id]?.connector?.semantic.label).toBe('depends on');
    model = setDrawConnectorArrowheads(model, id, 'diamond', 'circle');
    expect(model.objects[id]?.connector?.arrowStart).toBe('diamond');
    model = setDrawConnectorObstacleAvoidance(model, id, false);
    expect(model.objects[id]?.connector?.obstacleAvoidance).toBe(false);
    expect(() => setDrawConnectorRoute(model, id, 'nope' as 'straight')).toThrowError(/connector-route-invalid/);
    expect(() => setDrawConnectorArrowheads(model, id, 'nope' as 'none', 'none')).toThrowError(/connector-arrowhead-invalid/);
  });

  it('adds, removes and clears waypoints and switches auto-routing off', () => {
    let model = createDrawConnector(twoNodes(), 'a', 'b', { idSeed: 'c1' });
    const id = connectorIdOf(model);
    model = appendDrawConnectorWaypoint(model, id, { x: 250, y: 30 });
    expect(model.objects[id]?.connector?.waypoints).toEqual([{ x: 250, y: 30 }]);
    expect(model.objects[id]?.connector?.autoRoute).toBe(false);
    model = setDrawConnectorWaypoints(model, id, [{ x: 250, y: 30 }, { x: 250, y: 200 }]);
    expect(model.objects[id]?.connector?.waypoints.length).toBe(2);
    model = clearDrawConnectorWaypoints(model, id);
    expect(model.objects[id]?.connector?.waypoints).toEqual([]);
    expect(model.objects[id]?.connector?.autoRoute).toBe(true);
    expect(() => setDrawConnectorWaypoints(model, id, Array.from({ length: 257 }, (_, index) => ({ x: index, y: 0 }))))
      .toThrowError(/connector-waypoint-limit/);
  });

  it('deletes a connector and refuses to edit a non-connector', () => {
    const model = createDrawConnector(twoNodes(), 'a', 'b', { idSeed: 'c1' });
    const id = connectorIdOf(model);
    const without = deleteDrawConnector(model, id);
    expect(without.objects[id]).toBeUndefined();
    expect(() => setDrawConnectorLabel(model, 'a', 'nope')).toThrowError(/connector-data-missing/);
  });
});

describe('Draw connector engine — routing bounds', () => {
  it('routes a fixture connector between two nodes and reports obstacle hits', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 400, y: 0, width: 100, height: 60 },
        { id: 'c1', type: 'connector', x: 100, y: 0, width: 300, height: 60, connector: connectorFixture('a', 'b') },
      ],
    });
    const route = routeDrawConnectorFromModel(model, 'c1');
    expect(route.obstacleHits).toBe(0);
    expect(route.path).toContain('L ');
  });
});
