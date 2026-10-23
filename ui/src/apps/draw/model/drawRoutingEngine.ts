// STATUS: PLATIN — bounded Draw connector routing with validated model geometry.
import type { DrawBounds, DrawConnectorData, DrawObject, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import {
  assertDrawConnector,
  assertDrawObject,
  assertPoint,
  DrawModelError,
  isRecord,
  MAX_OBJECTS,
  safeId,
} from './drawDocumentValidation';

const ROUTING_CLEARANCE = 6;
const MAX_GROUP_DEPTH = 64;
const MAX_DETOUR_BLOCKERS = 64;

export interface DrawRoutedConnector {
  points: DrawPoint[];
  path: string;
  obstacleHits: number;
}

interface RoutingContext {
  readonly byId: ReadonlyMap<string, DrawObject>;
  readonly visibleObstaclesByPage: ReadonlyMap<string, readonly DrawObject[]>;
}

function createRoutingContext(objects: Readonly<Record<string, DrawObject>>): RoutingContext {
  if (!isRecord(objects)) throw new DrawModelError('routing-object-map-invalid');

  const entries = Object.keys(objects);
  if (entries.length > MAX_OBJECTS) throw new DrawModelError('routing-object-limit');

  const byId = new Map<string, DrawObject>();
  const visibleObstaclesByPage = new Map<string, DrawObject[]>();
  for (const id of entries) {
    const object = objects[id];
    assertDrawObject(object, id);
    if (!Number.isFinite(object.x + object.width) || !Number.isFinite(object.y + object.height)) {
      throw new DrawModelError('routing-bounds-invalid');
    }
    byId.set(id, object);
    if (object.type === 'connector' || object.opacity === 0) continue;
    const obstacles = visibleObstaclesByPage.get(object.pageId) ?? [];
    obstacles.push(object);
    visibleObstaclesByPage.set(object.pageId, obstacles);
  }

  return { byId, visibleObstaclesByPage };
}

function objectCenter(object: DrawObject): DrawPoint {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

function anchorPoint(object: DrawObject, anchor: DrawConnectorData['from']['anchor'], toward: DrawObject): DrawPoint {
  const center = objectCenter(object);
  if (anchor === 'auto') {
    const target = objectCenter(toward);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { x: object.x + object.width, y: center.y } : { x: object.x, y: center.y };
    return dy >= 0 ? { x: center.x, y: object.y + object.height } : { x: center.x, y: object.y };
  }
  if (anchor === 'top') return { x: center.x, y: object.y };
  if (anchor === 'right') return { x: object.x + object.width, y: center.y };
  if (anchor === 'bottom') return { x: center.x, y: object.y + object.height };
  if (anchor === 'left') return { x: object.x, y: center.y };

  if (anchor.startsWith('point:')) {
    const rawIndex = anchor.slice('point:'.length);
    if (!/^(0|[1-9][0-9]*)$/.test(rawIndex)) throw new DrawModelError('connector-anchor-index-invalid');
    const index = Number(rawIndex);
    if (!Number.isSafeInteger(index) || !Array.isArray(object.vector?.points)) {
      throw new DrawModelError('connector-anchor-point-missing');
    }
    const point = object.vector.points[index];
    if (!point) throw new DrawModelError('connector-anchor-point-missing');
    assertPoint(point, 'connector-anchor-point-invalid');
    return { x: object.x + point.x, y: object.y + point.y };
  }

  throw new DrawModelError('connector-anchor-invalid');
}

function addParentGroups(object: DrawObject, context: RoutingContext, excluded: Set<string>): void {
  let parentId = object.parentGroupId;
  const visited = new Set<string>();
  let depth = 0;
  while (parentId) {
    if (visited.has(parentId)) throw new DrawModelError('connector-group-cycle');
    if (depth >= MAX_GROUP_DEPTH) throw new DrawModelError('connector-group-depth-limit');
    visited.add(parentId);
    const parent = context.byId.get(parentId);
    if (!parent || parent.type !== 'group' || parent.pageId !== object.pageId) {
      throw new DrawModelError('connector-group-parent-invalid');
    }
    excluded.add(parent.id);
    parentId = parent.parentGroupId;
    depth += 1;
  }
}

function segmentIntersectsRect(a: DrawPoint, b: DrawPoint, bounds: DrawBounds, padding = ROUTING_CLEARANCE): boolean {
  const minimumX = bounds.x - padding;
  const maximumX = bounds.x + bounds.width + padding;
  const minimumY = bounds.y - padding;
  const maximumY = bounds.y + bounds.height + padding;
  const deltaX = b.x - a.x;
  const deltaY = b.y - a.y;
  let lower = 0;
  let upper = 1;

  if (deltaX === 0) {
    if (a.x < minimumX || a.x > maximumX) return false;
  } else {
    const first = (minimumX - a.x) / deltaX;
    const second = (maximumX - a.x) / deltaX;
    lower = Math.max(lower, Math.min(first, second));
    upper = Math.min(upper, Math.max(first, second));
    if (lower > upper) return false;
  }
  if (deltaY === 0) {
    if (a.y < minimumY || a.y > maximumY) return false;
  } else {
    const first = (minimumY - a.y) / deltaY;
    const second = (maximumY - a.y) / deltaY;
    lower = Math.max(lower, Math.min(first, second));
    upper = Math.min(upper, Math.max(first, second));
  }
  return lower <= upper;
}

function compact(points: readonly DrawPoint[]): DrawPoint[] {
  const output: DrawPoint[] = [];
  for (const point of points) {
    const previous = output[output.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) output.push({ x: point.x, y: point.y });
  }
  for (let index = output.length - 2; index > 0; index -= 1) {
    const before = output[index - 1];
    const current = output[index];
    const after = output[index + 1];
    if ((before.x === current.x && current.x === after.x) || (before.y === current.y && current.y === after.y)) {
      output.splice(index, 1);
    }
  }
  return output;
}

function pathHits(points: readonly DrawPoint[], obstacles: readonly DrawObject[]): number {
  let count = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    for (const obstacle of obstacles) {
      if (segmentIntersectsRect(start, end, obstacle)) count += 1;
    }
  }
  return count;
}

function pathHitsObstacle(points: readonly DrawPoint[], obstacle: DrawObject): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsRect(points[index - 1], points[index], obstacle)) return true;
  }
  return false;
}

function routeLength(points: readonly DrawPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

function distanceFromRouteBox(obstacle: DrawObject, start: DrawPoint, end: DrawPoint): number {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const obstacleRight = obstacle.x + obstacle.width;
  const obstacleBottom = obstacle.y + obstacle.height;
  const dx = Math.max(left - obstacleRight, obstacle.x - right, 0);
  const dy = Math.max(top - obstacleBottom, obstacle.y - bottom, 0);
  return Math.hypot(dx, dy);
}

function orthogonalCandidates(start: DrawPoint, end: DrawPoint, obstacles: readonly DrawObject[]): DrawPoint[][] {
  const base = [
    compact([start, { x: end.x, y: start.y }, end]),
    compact([start, { x: start.x, y: end.y }, end]),
  ];
  const blocking = obstacles
    .filter((obstacle) => base.some((candidate) => pathHitsObstacle(candidate, obstacle)))
    .sort((left, right) => distanceFromRouteBox(left, start, end) - distanceFromRouteBox(right, start, end)
      || left.id.localeCompare(right.id))
    .slice(0, MAX_DETOUR_BLOCKERS);
  const candidates = [...base];
  const detourClearance = ROUTING_CLEARANCE + 1;
  for (const obstacle of blocking) {
    const left = obstacle.x - detourClearance;
    const right = obstacle.x + obstacle.width + detourClearance;
    const top = obstacle.y - detourClearance;
    const bottom = obstacle.y + obstacle.height + detourClearance;
    candidates.push(compact([start, { x: left, y: start.y }, { x: left, y: end.y }, end]));
    candidates.push(compact([start, { x: right, y: start.y }, { x: right, y: end.y }, end]));
    candidates.push(compact([start, { x: start.x, y: top }, { x: end.x, y: top }, end]));
    candidates.push(compact([start, { x: start.x, y: bottom }, { x: end.x, y: bottom }, end]));
  }
  const unique = new Map<string, DrawPoint[]>();
  for (const candidate of candidates) unique.set(candidate.map((point) => `${point.x},${point.y}`).join(';'), candidate);
  return [...unique.values()];
}

function createRoute(connector: DrawConnectorData, context: RoutingContext): DrawRoutedConnector {
  if (connector.route === 'custom' && !connector.autoRoute && connector.waypoints.length === 0) {
    throw new DrawModelError('connector-custom-waypoints-missing');
  }
  const from = context.byId.get(connector.from.objectId);
  const to = context.byId.get(connector.to.objectId);
  if (!from || !to) throw new DrawModelError('connector-endpoint-missing');
  if (from.type === 'connector' || to.type === 'connector' || from.id === to.id) {
    throw new DrawModelError('connector-endpoint-invalid');
  }
  if (from.pageId !== to.pageId) throw new DrawModelError('connector-cross-page');

  const start = anchorPoint(from, connector.from.anchor, to);
  const end = anchorPoint(to, connector.to.anchor, from);
  const excluded = new Set([from.id, to.id]);
  addParentGroups(from, context, excluded);
  addParentGroups(to, context, excluded);
  const obstacles = (context.visibleObstaclesByPage.get(from.pageId) ?? []).filter((object) => !excluded.has(object.id));

  let points: DrawPoint[];
  let useCurve = false;
  if (!connector.autoRoute && connector.waypoints.length > 0) {
    points = compact([start, ...connector.waypoints, end]);
  } else if (connector.route === 'straight') {
    points = compact([start, end]);
  } else if (connector.route === 'curved') {
    points = [
      start,
      { x: (start.x + end.x) / 2, y: start.y },
      { x: (start.x + end.x) / 2, y: end.y },
      end,
    ];
    useCurve = true;
  } else {
    const candidates = orthogonalCandidates(start, end, connector.obstacleAvoidance ? obstacles : []);
    let best = candidates[0];
    let bestHits = connector.obstacleAvoidance ? pathHits(best, obstacles) : 0;
    let bestLength = routeLength(best);
    for (const candidate of candidates.slice(1)) {
      const candidateHits = connector.obstacleAvoidance ? pathHits(candidate, obstacles) : 0;
      const candidateLength = routeLength(candidate);
      if (candidateHits < bestHits || (candidateHits === bestHits && candidateLength < bestLength)) {
        best = candidate;
        bestHits = candidateHits;
        bestLength = candidateLength;
      }
    }
    points = best;
  }

  const obstacleHits = connector.obstacleAvoidance ? pathHits(points, obstacles) : 0;
  const path = useCurve && points.length === 4
    ? `M ${points[0].x} ${points[0].y} C ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${points[3].x} ${points[3].y}`
    : `M ${points.map((point, index) => `${index === 0 ? '' : 'L '}${point.x} ${point.y}`).join(' ')}`;
  return { points, path, obstacleHits };
}

export function routeDrawConnector(connector: DrawConnectorData, objects: Readonly<Record<string, DrawObject>>): DrawRoutedConnector {
  assertDrawConnector(connector);
  return createRoute(connector, createRoutingContext(objects));
}

export function rerouteConnectorsForMovedObjects(
  objects: Readonly<Record<string, DrawObject>>,
  movedIds: ReadonlySet<string>,
): Map<string, DrawRoutedConnector> {
  if (!movedIds || typeof movedIds.has !== 'function' || typeof movedIds[Symbol.iterator] !== 'function') {
    throw new DrawModelError('moved-object-set-invalid');
  }
  const moved = new Set<string>();
  for (const rawId of movedIds) moved.add(safeId(rawId, 'moved-object-id-invalid'));

  const context = createRoutingContext(objects);
  const routes = new Map<string, DrawRoutedConnector>();
  for (const [id, object] of context.byId) {
    if (object.type !== 'connector' || !object.connector) continue;
    const connector = object.connector;
    if (connector.autoRoute || moved.has(connector.from.objectId) || moved.has(connector.to.objectId)) {
      routes.set(id, createRoute(connector, context));
    }
  }
  return routes;
}

