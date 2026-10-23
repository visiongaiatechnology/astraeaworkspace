// STATUS: PLATIN — bounded, rotation-aware Draw hit-testing and marquee candidate resolution.
import type { DrawBounds, DrawObjectId, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import {
  distanceToPolyline,
  drawBoundsContain,
  drawBoundsIntersect,
  drawObjectWorldBounds,
  expandDrawBounds,
  handleWorldPoint,
  isDrawResizeHandle,
  localToWorld,
  normalizeDrawBounds,
  pointInDrawBounds,
  pointInDrawObject,
  type DrawResizeHandle,
} from './drawGeometry';
import { DrawModelError, assertPoint } from '../model/drawDocumentValidation';
import type { DrawScene, DrawSceneEntry } from './drawSceneProjection';
import { queryDrawSpatialIndexExact, type DrawSpatialIndex } from './drawSpatialIndex';

/** Upper bound on candidates examined by one hit-test or marquee pass. */
export const DRAW_HIT_CANDIDATE_LIMIT = 2048;
/** World-space distance from the top edge to the rotation grip. */
export const DRAW_ROTATE_HANDLE_OFFSET = 24;

export type DrawHitRegion = 'body' | 'connector' | 'handle' | 'rotate';

export interface DrawHit {
  readonly objectId: DrawObjectId;
  readonly entry: DrawSceneEntry;
  readonly region: DrawHitRegion;
  readonly handle?: DrawResizeHandle;
  /** Distance used to break ties: smaller wins. */
  readonly distance: number;
}

export interface DrawHitTestOptions {
  /** Extra world-space slack around shapes so thin objects stay clickable. */
  readonly tolerance?: number;
  /** Include objects on locked layers or with `locked: true`. Default false. */
  readonly includeLocked?: boolean;
  /** Include objects on hidden layers. Default false (never true for pointer input). */
  readonly includeHidden?: boolean;
  /** Resolve a hit on a grouped child to its outermost group. Default true. */
  readonly groupSelect?: boolean;
  /** Reject entries before geometry tests. */
  readonly filter?: (entry: DrawSceneEntry) => boolean;
  /** Routed connector polylines, normally produced by `routeDrawConnector`. */
  readonly connectorPaths?: ReadonlyMap<DrawObjectId, readonly DrawPoint[]>;
  /** Spatial index; when present the candidate set is bounded by the grid query. */
  readonly index?: DrawSpatialIndex;
  /** Candidate cap. Defaults to `DRAW_HIT_CANDIDATE_LIMIT`. */
  readonly candidateLimit?: number;
}

function resolveLimit(options: DrawHitTestOptions | undefined): number {
  const limit = options?.candidateLimit ?? DRAW_HIT_CANDIDATE_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new DrawModelError('hit-candidate-limit-invalid');
  return limit;
}

function resolveTolerance(options: DrawHitTestOptions | undefined): number {
  const tolerance = options?.tolerance ?? 2;
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 256) {
    throw new DrawModelError('hit-tolerance-invalid');
  }
  return tolerance;
}

function accepts(entry: DrawSceneEntry, options: DrawHitTestOptions | undefined): boolean {
  if (!entry.visible && !options?.includeHidden) return false;
  if (entry.locked && !options?.includeLocked) return false;
  if (options?.filter && !options.filter(entry)) return false;
  return true;
}

/** Walks `parentGroupId` upwards so a pointer hit inside a group selects the container. */
export function resolveDrawSelectionRoot(scene: DrawScene, id: DrawObjectId): DrawObjectId {
  let current = scene.byId.get(id);
  if (!current) return id;
  const visited = new Set<string>([current.object.id]);
  let parentId = current.object.parentGroupId;
  while (parentId) {
    if (visited.has(parentId)) throw new DrawModelError('group-cycle');
    const parent = scene.byId.get(parentId);
    if (!parent || parent.object.type !== 'group') break;
    visited.add(parentId);
    current = parent;
    parentId = parent.object.parentGroupId;
  }
  return current.object.id;
}

/** Selecting a group pulls in every descendant so a container moves as one unit. */
export function expandDrawSelection(scene: DrawScene, ids: readonly DrawObjectId[]): DrawObjectId[] {
  const result: DrawObjectId[] = [];
  const seen = new Set<string>();
  const push = (id: DrawObjectId): void => {
    if (seen.has(id)) return;
    seen.add(id);
    result.push(id);
  };
  const visit = (id: DrawObjectId, depth: number): void => {
    if (depth > 64) throw new DrawModelError('group-depth-limit');
    push(id);
    const entry = scene.byId.get(id);
    if (!entry || entry.object.type !== 'group') return;
    for (const childId of entry.object.childIds ?? []) visit(childId, depth + 1);
  };
  for (const id of ids) visit(id, 0);
  return result;
}

function connectorHit(
  scene: DrawScene,
  point: DrawPoint,
  tolerance: number,
  options: DrawHitTestOptions | undefined,
): DrawHit | null {
  if (!options?.connectorPaths) return null;
  let best: DrawHit | null = null;
  for (const entry of scene.hitOrder) {
    if (entry.object.type !== 'connector') continue;
    if (!accepts(entry, options)) continue;
    const path = options.connectorPaths.get(entry.object.id);
    if (!path || path.length < 2) continue;
    const distance = distanceToPolyline(point, path);
    if (distance > tolerance) continue;
    if (!best || distance < best.distance) {
      best = { objectId: entry.object.id, entry, region: 'connector', distance };
    }
  }
  return best;
}

/**
 * Topmost selectable object under `point`. Ordering comes from `scene.hitOrder`, which is derived
 * from the canonical paint order — there is no second z-order rule here.
 */
export function hitTestDrawScene(
  scene: DrawScene,
  point: DrawPoint,
  options?: DrawHitTestOptions,
): DrawHit | null {
  assertPoint(point, 'point-invalid');
  const tolerance = resolveTolerance(options);
  const limit = resolveLimit(options);

  let candidates: readonly DrawSceneEntry[];
  if (options?.index) {
    candidates = queryDrawSpatialIndexExact(
      options.index,
      scene,
      expandDrawBounds({ x: point.x, y: point.y, width: 0, height: 0 }, tolerance),
      limit,
    );
    // Grid buckets are unordered; restore topmost-first semantics from the canonical order.
    candidates = [...candidates].sort((left, right) => right.paintIndex - left.paintIndex);
  } else {
    candidates = scene.hitOrder.slice(0, limit);
  }

  for (const entry of candidates) {
    if (!accepts(entry, options)) continue;
    // Group containers and connectors have no painted body of their own: a group is reached through
    // its children and a connector through its routed polyline.
    if (entry.object.type === 'connector' || entry.object.type === 'group') continue;
    if (!pointInDrawBounds(point, drawObjectWorldBounds(entry.object), tolerance)) continue;
    if (!pointInDrawObject(entry.object, point, tolerance)) continue;
    const objectId = options?.groupSelect === false ? entry.object.id : resolveDrawSelectionRoot(scene, entry.object.id);
    return { objectId, entry, region: 'body', distance: 0 };
  }

  return connectorHit(scene, point, tolerance, options);
}

export function hitTestDrawSceneAll(
  scene: DrawScene,
  point: DrawPoint,
  options?: DrawHitTestOptions,
): DrawHit[] {
  assertPoint(point, 'point-invalid');
  const tolerance = resolveTolerance(options);
  const limit = resolveLimit(options);
  const hits: DrawHit[] = [];
  for (const entry of scene.hitOrder.slice(0, limit)) {
    if (!accepts(entry, options)) continue;
    if (entry.object.type === 'connector' || entry.object.type === 'group') continue;
    if (!pointInDrawObject(entry.object, point, tolerance)) continue;
    hits.push({ objectId: entry.object.id, entry, region: 'body', distance: 0 });
  }
  return hits;
}

/**
 * Selection adorners are tested before bodies so a grip on top of a neighbouring shape still wins.
 * `point` is in page/world coordinates.
 */
export function hitTestDrawSelectionAdorner(
  scene: DrawScene,
  selectedIds: readonly DrawObjectId[],
  point: DrawPoint,
  options?: DrawHitTestOptions,
): DrawHit | null {
  assertPoint(point, 'point-invalid');
  const grab = options?.tolerance ?? 8;
  const handles = options?.candidateLimit ?? DRAW_HIT_CANDIDATE_LIMIT;
  let best: DrawHit | null = null;
  let checked = 0;
  for (const id of selectedIds) {
    if (checked >= handles) break;
    checked += 1;
    const entry = scene.byId.get(id);
    // Connectors and group containers own no resizable/reorientable body box in this app.
    if (!entry || entry.object.type === 'connector' || entry.object.type === 'group') continue;
    if (entry.locked && !options?.includeLocked) continue;
    const object = entry.object;
    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
      const world = handleWorld(object, handle);
      const distance = Math.hypot(point.x - world.x, point.y - world.y);
      if (distance > grab) continue;
      if (!best || distance < best.distance) {
        best = { objectId: object.id, entry, region: 'handle', handle, distance };
      }
    }
    const rotatePoint = rotateHandleWorld(object);
    const rotateDistance = Math.hypot(point.x - rotatePoint.x, point.y - rotatePoint.y);
    if (rotateDistance <= grab && (!best || rotateDistance < best.distance)) {
      best = { objectId: object.id, entry, region: 'rotate', distance: rotateDistance };
    }
  }
  return best;
}

function handleWorld(object: DrawSceneEntry['object'], handle: DrawResizeHandle): DrawPoint {
  return handleWorldPoint(object, handle);
}

/** The rotation grip sits 24 world units above the top edge midpoint in the object's local frame. */
export function rotateHandleWorld(object: DrawSceneEntry['object']): DrawPoint {
  return localToWorld(object, { x: object.width / 2, y: -DRAW_ROTATE_HANDLE_OFFSET });
}

/** Marquee hit test. Containment (not intersection) matches the Draw/Visio selection convention. */
export function marqueeDrawEntries(
  scene: DrawScene,
  rect: DrawBounds,
  options?: DrawHitTestOptions & { readonly mode?: 'contain' | 'intersect' },
): DrawSceneEntry[] {
  const normalized = normalizeDrawBounds(rect);
  const limit = resolveLimit(options);
  const mode = options?.mode ?? 'contain';
  const candidates = options?.index
    ? queryDrawSpatialIndexExact(options.index, scene, normalized, limit)
    : scene.entries;
  const result: DrawSceneEntry[] = [];
  for (const entry of candidates) {
    if (!accepts(entry, options)) continue;
    const bounds = drawObjectWorldBounds(entry.object);
    const matches = mode === 'contain' ? drawBoundsContain(normalized, bounds) : drawBoundsIntersect(normalized, bounds);
    if (!matches) continue;
    result.push(entry);
    if (result.length >= limit) break;
  }
  return result.sort((left, right) => left.paintIndex - right.paintIndex);
}

export function marqueeDrawSelection(
  scene: DrawScene,
  rect: DrawBounds,
  options?: DrawHitTestOptions & { readonly mode?: 'contain' | 'intersect' },
): DrawObjectId[] {
  const entries = marqueeDrawEntries(scene, rect, options);
  const groupSelect = options?.groupSelect !== false;
  const ids = entries.map((entry) => (groupSelect ? resolveDrawSelectionRoot(scene, entry.object.id) : entry.object.id));
  return [...new Set(ids)];
}

/** Hit-test used by resize/rotate grips; kept separate so bodies never shadow grips. */
export function isDrawResizeHandleHit(hit: DrawHit | null): hit is DrawHit & { handle: DrawResizeHandle } {
  return Boolean(hit && hit.region === 'handle' && isDrawResizeHandle(hit.handle));
}
