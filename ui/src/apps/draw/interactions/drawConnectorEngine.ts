// STATUS: PLATIN — Draw connector creation/editing built on the canonical routing + document engines.
//
// There is exactly one routing implementation (`drawRoutingEngine`) and one object writer
// (`upsertDrawObject`). Everything here composes those two; it never re-derives anchor geometry or
// paint order. Every mutation validates the resulting connector by asking the routing engine to route
// it, so an invalid connection fails closed instead of reaching the document.
import type {
  DrawArrowhead, DrawConnectorData, DrawConnectorRoute, DrawDocumentModel, DrawObject, DrawObjectId,
  DrawPoint,
} from '../../../shared/contracts/draw/workspaceDraw';
import {
  DrawModelError, assertDrawDocument,
  removeDrawObjects, selectionBounds, upsertDrawObject,
} from '../model/drawDocumentEngine';
import { MAX_OBJECTS, assertPoint, safeId, safeText } from '../model/drawDocumentValidation';
import { rerouteConnectorsForMovedObjects, routeDrawConnector, type DrawRoutedConnector } from '../model/drawRoutingEngine';
import { projectDrawScene } from './drawSceneProjection';

/** Upper bound on waypoints a single connector may carry. */
export const MAX_DRAW_CONNECTOR_WAYPOINTS = 256;

export interface DrawConnectorCreateOptions {
  readonly route?: DrawConnectorRoute;
  readonly autoRoute?: boolean;
  readonly label?: string;
  readonly arrowStart?: DrawArrowhead;
  readonly arrowEnd?: DrawArrowhead;
  readonly obstacleAvoidance?: boolean;
  /** Layer for the connector itself; defaults to the source object's layer. */
  readonly layerId?: string;
  readonly idSeed?: string;
}

const ROUTES: ReadonlySet<string> = new Set(['straight', 'orthogonal', 'curved', 'custom']);
const ARROWHEADS: ReadonlySet<string> = new Set(['none', 'triangle', 'open', 'diamond', 'circle']);

function requireConnector(model: DrawDocumentModel, id: DrawObjectId): DrawObject {
  safeId(id, 'connector-id-invalid');
  const object = model.objects[id];
  if (!object) throw new DrawModelError('connector-missing');
  if (object.type !== 'connector' || !object.connector) throw new DrawModelError('connector-data-missing');
  return object;
}

/** Axis-aligned box spanning both endpoint boxes, clamped to non-negative extents. */
function connectorBox(model: DrawDocumentModel, from: DrawObject, to: DrawObject) {
  const bounds = selectionBounds(model, [from.id, to.id]);
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

function nextConnectorZIndex(model: DrawDocumentModel): number {
  return Object.values(model.objects).reduce((maximum, object) => Math.max(maximum, object.zIndex), -1) + 1;
}

/**
 * Connects two objects on the active page. The connection is failed closed when:
 * source/target are missing, are connectors, are identical, live on different pages, the target layer
 * is locked, or the routing engine cannot route the resulting connector.
 */
export function createDrawConnector(
  model: DrawDocumentModel,
  fromId: DrawObjectId,
  toId: DrawObjectId,
  options?: DrawConnectorCreateOptions,
): DrawDocumentModel {
  assertDrawDocument(model);
  safeId(fromId, 'connector-endpoint-invalid');
  safeId(toId, 'connector-endpoint-invalid');
  if (fromId === toId) throw new DrawModelError('connector-self-connection');
  if (Object.values(model.objects).length >= MAX_OBJECTS) throw new DrawModelError('object-limit');

  const scene = projectDrawScene(model, model.activePageId);
  const fromEntry = scene.byId.get(fromId);
  const toEntry = scene.byId.get(toId);
  if (!fromEntry || !toEntry) throw new DrawModelError('connector-endpoint-missing');
  if (fromEntry.locked || toEntry.locked) throw new DrawModelError('object-locked');
  if (fromEntry.object.pageId !== toEntry.object.pageId) throw new DrawModelError('connector-cross-page');

  const route = options?.route ?? 'orthogonal';
  if (!ROUTES.has(route)) throw new DrawModelError('connector-route-invalid');
  if (route === 'custom' && (options?.autoRoute ?? false) === false) {
    // A purely custom route without waypoints cannot be routed; fail closed with a stable code.
    throw new DrawModelError('connector-custom-waypoints-missing');
  }
  const arrowStart = options?.arrowStart ?? 'none';
  const arrowEnd = options?.arrowEnd ?? 'triangle';
  if (!ARROWHEADS.has(arrowStart) || !ARROWHEADS.has(arrowEnd)) throw new DrawModelError('connector-arrowhead-invalid');
  const label = options?.label;
  if (label !== undefined) safeText(label, 'connector-semantic-invalid');

  const connector: DrawConnectorData = {
    from: { objectId: fromId, anchor: 'auto' },
    to: { objectId: toId, anchor: 'auto' },
    route,
    autoRoute: options?.autoRoute ?? true,
    waypoints: [],
    obstacleAvoidance: options?.obstacleAvoidance ?? true,
    routingPriority: 0,
    crossingStyle: 'none',
    semantic: label === undefined ? {} : { label },
    arrowStart,
    arrowEnd,
  };

  // Fail closed before touching the document: the canonical router must accept this connection.
  routeDrawConnector(connector, model.objects);

  const box = connectorBox(model, fromEntry.object, toEntry.object);
  const layerId = options?.layerId ?? fromEntry.object.layerId;
  const page = model.pages.find((candidate) => candidate.id === model.activePageId);
  if (!page) throw new DrawModelError('page-missing');
  if (!page.layerIds.includes(layerId)) throw new DrawModelError('object-layer-missing');
  const layer = model.layers.find((candidate) => candidate.id === layerId);
  if (layer?.locked) throw new DrawModelError('layer-locked');

  const seed = options?.idSeed ?? `connector${model.revision + 1}`;
  const object: DrawObject = {
    id: safeId(`${seed}-${fromId}-${toId}`.slice(0, 240), 'connector-id-invalid'),
    pageId: model.activePageId,
    layerId,
    type: 'connector',
    name: label && label.trim().length > 0 ? label : `Connector ${fromEntry.object.name} → ${toEntry.object.name}`.slice(0, 512),
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: nextConnectorZIndex(model),
    connector,
  };
  return upsertDrawObject(model, object);
}

function withConnector(
  model: DrawDocumentModel,
  connectorId: DrawObjectId,
  mutate: (connector: DrawConnectorData) => DrawConnectorData,
): DrawDocumentModel {
  assertDrawDocument(model);
  const object = requireConnector(model, connectorId);
  const next = { ...object, connector: mutate({ ...object.connector!, waypoints: [...object.connector!.waypoints], semantic: { ...object.connector!.semantic } }) };
  // Re-validate against the canonical router so a broken connector never reaches the document.
  routeDrawConnector(next.connector!, model.objects);
  return upsertDrawObject(model, next);
}

export function setDrawConnectorRoute(
  model: DrawDocumentModel,
  connectorId: DrawObjectId,
  route: DrawConnectorRoute,
  autoRoute?: boolean,
): DrawDocumentModel {
  if (!ROUTES.has(route)) throw new DrawModelError('connector-route-invalid');
  return withConnector(model, connectorId, (connector) => ({
    ...connector,
    route,
    autoRoute: autoRoute ?? (route === 'custom' ? connector.waypoints.length > 0 && connector.autoRoute : true),
  }));
}

export function setDrawConnectorLabel(model: DrawDocumentModel, connectorId: DrawObjectId, label: string): DrawDocumentModel {
  if (typeof label !== 'string') throw new DrawModelError('connector-semantic-invalid');
  safeText(label, 'connector-semantic-invalid');
  return withConnector(model, connectorId, (connector) => ({ ...connector, semantic: { ...connector.semantic, label } }));
}

export function setDrawConnectorWaypoints(
  model: DrawDocumentModel,
  connectorId: DrawObjectId,
  waypoints: readonly DrawPoint[],
): DrawDocumentModel {
  if (!Array.isArray(waypoints) || waypoints.length > MAX_DRAW_CONNECTOR_WAYPOINTS) {
    throw new DrawModelError('connector-waypoint-limit');
  }
  for (const point of waypoints) assertPoint(point, 'connector-waypoint-invalid');
  return withConnector(model, connectorId, (connector) => ({
    ...connector,
    route: connector.route === 'custom' ? 'custom' : connector.route,
    autoRoute: false,
    waypoints: waypoints.map((point) => ({ x: point.x, y: point.y })),
  }));
}

export function appendDrawConnectorWaypoint(
  model: DrawDocumentModel,
  connectorId: DrawObjectId,
  point: DrawPoint,
): DrawDocumentModel {
  assertPoint(point, 'connector-waypoint-invalid');
  const object = requireConnector(model, connectorId);
  if (object.connector!.waypoints.length >= MAX_DRAW_CONNECTOR_WAYPOINTS) throw new DrawModelError('connector-waypoint-limit');
  return setDrawConnectorWaypoints(model, connectorId, [...object.connector!.waypoints, point]);
}

export function removeDrawConnectorWaypoint(
  model: DrawDocumentModel,
  connectorId: DrawObjectId,
  index: number,
): DrawDocumentModel {
  const object = requireConnector(model, connectorId);
  if (!Number.isSafeInteger(index) || index < 0 || index >= object.connector!.waypoints.length) {
    throw new DrawModelError('connector-waypoint-index-invalid');
  }
  const waypoints = object.connector!.waypoints.filter((_, position) => position !== index);
  return setDrawConnectorWaypoints(model, connectorId, waypoints);
}

/** Clears manual routing so the connector follows the automatic route again. */
export function clearDrawConnectorWaypoints(model: DrawDocumentModel, connectorId: DrawObjectId): DrawDocumentModel {
  return withConnector(model, connectorId, (connector) => ({ ...connector, autoRoute: true, waypoints: [] }));
}

export function setDrawConnectorArrowheads(
  model: DrawDocumentModel,
  connectorId: DrawObjectId,
  arrowStart: DrawArrowhead,
  arrowEnd: DrawArrowhead,
): DrawDocumentModel {
  if (!ARROWHEADS.has(arrowStart) || !ARROWHEADS.has(arrowEnd)) throw new DrawModelError('connector-arrowhead-invalid');
  return withConnector(model, connectorId, (connector) => ({ ...connector, arrowStart, arrowEnd }));
}

export function setDrawConnectorObstacleAvoidance(
  model: DrawDocumentModel,
  connectorId: DrawObjectId,
  obstacleAvoidance: boolean,
): DrawDocumentModel {
  if (typeof obstacleAvoidance !== 'boolean') throw new DrawModelError('connector-obstacle-avoidance-invalid');
  return withConnector(model, connectorId, (connector) => ({ ...connector, obstacleAvoidance }));
}

export function deleteDrawConnector(model: DrawDocumentModel, connectorId: DrawObjectId): DrawDocumentModel {
  requireConnector(model, connectorId);
  return removeDrawObjects(model, [connectorId]);
}

/** The connector attached to `objectId` in either direction, if any. */
export function findDrawConnectorsForObject(model: DrawDocumentModel, objectId: DrawObjectId): DrawObject[] {
  safeId(objectId, 'connector-endpoint-invalid');
  return Object.values(model.objects).filter((object) => object.type === 'connector'
    && object.pageId === model.activePageId
    && (object.connector?.from.objectId === objectId || object.connector?.to.objectId === objectId));
}

/** Routed polyline of one connector, resolved through the canonical routing engine. */
export function routeDrawConnectorFromModel(model: DrawDocumentModel, connectorId: DrawObjectId): DrawRoutedConnector {
  const object = requireConnector(model, connectorId);
  return routeDrawConnector(object.connector!, model.objects);
}

/**
 * Routes of every connector affected by a move. Delegates to the canonical incremental re-router so a
 * layout change re-routes through the same rule as a first-time route.
 */
export function connectorRoutesAfterMove(
  model: DrawDocumentModel,
  movedIds: ReadonlySet<DrawObjectId>,
): Map<DrawObjectId, DrawRoutedConnector> {
  assertDrawDocument(model);
  if (!(movedIds instanceof Set)) throw new DrawModelError('moved-object-set-invalid');
  return rerouteConnectorsForMovedObjects(model.objects, movedIds);
}

/** True when the connector's stored geometry no longer matches its current route (UI hint only). */
export function isDrawConnectorRouteStale(model: DrawDocumentModel, connectorId: DrawObjectId): boolean {
  const object = requireConnector(model, connectorId);
  const route = routeDrawConnector(object.connector!, model.objects);
  if (route.points.length < 2) return false;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of route.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return object.x !== minX || object.y !== minY
    || object.width !== Math.max(0, maxX - minX) || object.height !== Math.max(0, maxY - minY);
}

/**
 * Writes the current routed bounds back onto the connector object. Called after a layout change so the
 * stored box (used by marquee selection and the spatial index) matches the drawn polyline.
 */
export function syncDrawConnectorBounds(model: DrawDocumentModel, connectorIds?: readonly DrawObjectId[]): DrawDocumentModel {
  assertDrawDocument(model);
  const ids = connectorIds ?? Object.values(model.objects)
    .filter((object) => object.type === 'connector' && object.pageId === model.activePageId)
    .map((object) => object.id);
  let next = model;
  for (const id of ids) {
    const object = requireConnector(next, id);
    const before = { x: object.x, y: object.y, width: object.width, height: object.height };
    const route = routeDrawConnector(object.connector!, next.objects);
    if (route.points.length < 2) continue;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of route.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const box = { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
    if (box.x === before.x && box.y === before.y && box.width === before.width && box.height === before.height) continue;
    next = upsertDrawObject(next, { ...object, ...box });
  }
  return next;
}
