// STATUS: PLATIN — Draw vector model operations with bounded validation.
import type {
  DrawBounds,
  DrawObject,
  DrawObjectId,
  DrawPathNode,
  DrawPoint,
  DrawShapeKind,
  DrawVectorData,
  DrawVectorStyle,
} from '../../../shared/contracts/draw/workspaceDraw';
import {
  assertDrawObject,
  assertPoint,
  bounded,
  DrawModelError,
  isRecord,
  MAX_OBJECTS,
  safeId,
  safeText,
} from './drawDocumentValidation';

const MAX_VECTOR_COORDINATE = 1_000_000_000;
const MAX_STYLE_DASH_SEGMENTS = 64;
const DRAW_SHAPE_KINDS: ReadonlySet<string> = new Set([
  'rectangle', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'bezier',
  'freehand', 'text', 'callout', 'icon', 'custom-path',
]);
const DRAW_ARROWHEADS: ReadonlySet<string> = new Set(['none', 'triangle', 'open', 'diamond', 'circle']);
const BOOLEAN_OPERATIONS: ReadonlySet<string> = new Set(['union', 'subtract', 'intersect', 'exclude']);
const TRANSFORM_OPERATIONS: ReadonlySet<string> = new Set([
  'align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom',
  'same-width', 'same-height', 'distribute-x', 'distribute-y', 'space-evenly-x', 'space-evenly-y', 'nudge',
]);
const Z_ORDER_ACTIONS: ReadonlySet<string> = new Set(['front', 'back', 'forward', 'backward']);

const EMPTY_DASH: number[] = [];
Object.freeze(EMPTY_DASH);
export const DEFAULT_DRAW_STYLE: Readonly<DrawVectorStyle> = Object.freeze({
  fill: '#1e293b',
  stroke: '#60a5fa',
  strokeWidth: 2,
  dash: EMPTY_DASH,
  opacity: 1,
  cornerRadius: 0,
  arrowStart: 'none',
  arrowEnd: 'none',
});

export type TransformOperation =
  | 'align-left' | 'align-center' | 'align-right'
  | 'align-top' | 'align-middle' | 'align-bottom'
  | 'same-width' | 'same-height'
  | 'distribute-x' | 'distribute-y'
  | 'space-evenly-x' | 'space-evenly-y'
  | 'nudge';
type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';
export type ZOrderAction = 'front' | 'back' | 'forward' | 'backward';

function clone<T>(value: T, code = 'vector-clone-failed'): T {
  try {
    return structuredClone(value);
  } catch {
    throw new DrawModelError(code);
  }
}

function finiteVectorCoordinate(value: unknown, code: string): number {
  return bounded(value as number, -MAX_VECTOR_COORDINATE, MAX_VECTOR_COORDINATE, code);
}

function clonePoint(value: unknown, code: string): DrawPoint {
  assertPoint(value, code);
  const point = value as DrawPoint;
  return {
    x: finiteVectorCoordinate(point.x, code),
    y: finiteVectorCoordinate(point.y, code),
  };
}

function copyArray<T>(value: unknown, maximum: number, code: string, map: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > maximum) throw new DrawModelError(code);
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) throw new DrawModelError(code);
    result.push(map(descriptor.value));
  }
  return result;
}

function isSafeSvgColor(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 64
    && /^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|[a-z]{1,32}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+/-]{1,48}\))$/iu.test(value);
}

function normalizeStyle(value: unknown): DrawVectorStyle {
  const source = value === undefined ? DEFAULT_DRAW_STYLE : value;
  if (!isRecord(source)) throw new DrawModelError('style-invalid');
  const allowed = new Set(['fill', 'stroke', 'strokeWidth', 'dash', 'opacity', 'cornerRadius', 'shadow', 'arrowStart', 'arrowEnd']);
  if (Object.keys(source).some((key) => !allowed.has(key))) throw new DrawModelError('style-property-invalid');

  const fill = source.fill === undefined ? DEFAULT_DRAW_STYLE.fill : source.fill;
  const stroke = source.stroke === undefined ? DEFAULT_DRAW_STYLE.stroke : source.stroke;
  if (!isSafeSvgColor(fill) || !isSafeSvgColor(stroke)) throw new DrawModelError('style-color-invalid');
  const strokeWidth = bounded(source.strokeWidth === undefined ? DEFAULT_DRAW_STYLE.strokeWidth : source.strokeWidth as number, 0, 1024, 'style-stroke-width-invalid');
  const opacity = bounded(source.opacity === undefined ? DEFAULT_DRAW_STYLE.opacity : source.opacity as number, 0, 1, 'style-opacity-invalid');
  const cornerRadius = bounded(source.cornerRadius === undefined ? DEFAULT_DRAW_STYLE.cornerRadius : source.cornerRadius as number, 0, 100_000, 'style-corner-radius-invalid');
  const arrowStart = source.arrowStart === undefined ? DEFAULT_DRAW_STYLE.arrowStart : source.arrowStart;
  const arrowEnd = source.arrowEnd === undefined ? DEFAULT_DRAW_STYLE.arrowEnd : source.arrowEnd;
  if (typeof arrowStart !== 'string' || !DRAW_ARROWHEADS.has(arrowStart)
    || typeof arrowEnd !== 'string' || !DRAW_ARROWHEADS.has(arrowEnd)) {
    throw new DrawModelError('style-arrowhead-invalid');
  }
  const dash = copyArray(source.dash === undefined ? DEFAULT_DRAW_STYLE.dash : source.dash, MAX_STYLE_DASH_SEGMENTS, 'style-dash-invalid', (item) =>
    bounded(item as number, 0, 10_000, 'style-dash-invalid'));

  let shadow: DrawVectorStyle['shadow'];
  if (source.shadow !== undefined) {
    if (!isRecord(source.shadow) || Object.keys(source.shadow).some((key) => !['x', 'y', 'blur', 'color', 'opacity'].includes(key))) {
      throw new DrawModelError('style-shadow-invalid');
    }
    const shadowColor = source.shadow.color;
    if (!isSafeSvgColor(shadowColor)) throw new DrawModelError('style-shadow-invalid');
    shadow = {
      x: bounded(source.shadow.x as number, -10_000, 10_000, 'style-shadow-invalid'),
      y: bounded(source.shadow.y as number, -10_000, 10_000, 'style-shadow-invalid'),
      blur: bounded(source.shadow.blur as number, 0, 10_000, 'style-shadow-invalid'),
      color: shadowColor,
      opacity: bounded(source.shadow.opacity as number, 0, 1, 'style-shadow-invalid'),
    };
  }

  return {
    fill,
    stroke,
    strokeWidth,
    dash,
    opacity,
    cornerRadius,
    ...(shadow ? { shadow } : {}),
    arrowStart: arrowStart as DrawVectorStyle['arrowStart'],
    arrowEnd: arrowEnd as DrawVectorStyle['arrowEnd'],
  };
}

function normalizePathNode(value: unknown): DrawPathNode {
  if (!isRecord(value)) throw new DrawModelError('path-node-invalid');
  if (Object.keys(value).some((key) => !['id', 'point', 'inHandle', 'outHandle'].includes(key))) {
    throw new DrawModelError('path-node-invalid');
  }
  const id = safeId(value.id, 'path-node-id-invalid');
  const point = clonePoint(value.point, 'path-node-point-invalid');
  const inHandle = value.inHandle === undefined ? undefined : clonePoint(value.inHandle, 'path-node-handle-invalid');
  const outHandle = value.outHandle === undefined ? undefined : clonePoint(value.outHandle, 'path-node-handle-invalid');
  return { id, point, ...(inHandle ? { inHandle } : {}), ...(outHandle ? { outHandle } : {}) };
}

function normalizeVectorData(value: unknown): DrawVectorData {
  if (!isRecord(value)) throw new DrawModelError('vector-data-invalid');
  const allowed = new Set(['kind', 'style', 'points', 'pathNodes', 'closed', 'fillRule', 'iconName', 'compound']);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new DrawModelError('vector-property-invalid');
  const kind = value.kind;
  if (typeof kind !== 'string' || !DRAW_SHAPE_KINDS.has(kind)) throw new DrawModelError('vector-kind-invalid');
  if (value.closed !== undefined && typeof value.closed !== 'boolean') throw new DrawModelError('vector-closed-invalid');
  const fillRule = value.fillRule ?? 'nonzero';
  if (fillRule !== 'nonzero' && fillRule !== 'evenodd') throw new DrawModelError('vector-fill-rule-invalid');
  const points = value.points === undefined ? [] : copyArray(value.points, MAX_OBJECTS, 'path-point-limit', (item) =>
    clonePoint(item, 'path-point-invalid'));
  const pathNodes = value.pathNodes === undefined ? [] : copyArray(value.pathNodes, MAX_OBJECTS, 'path-node-limit', normalizePathNode);
  const nodeIds = new Set<string>();
  for (const node of pathNodes) {
    if (nodeIds.has(node.id)) throw new DrawModelError('path-node-duplicate');
    nodeIds.add(node.id);
  }
  let iconName: string | undefined;
  if (value.iconName !== undefined) iconName = safeText(value.iconName, 'vector-icon-name-invalid');

  let compound: DrawVectorData['compound'];
  if (value.compound !== undefined) {
    if (!isRecord(value.compound)) throw new DrawModelError('vector-compound-invalid');
    if (Object.keys(value.compound).some((key) => !['operation', 'sourceObjectIds', 'sourceRevision'].includes(key))) {
      throw new DrawModelError('vector-compound-invalid');
    }
    const operation = value.compound.operation;
    if (typeof operation !== 'string' || !BOOLEAN_OPERATIONS.has(operation)) throw new DrawModelError('vector-compound-invalid');
    const sourceObjectIds = copyArray(value.compound.sourceObjectIds, MAX_OBJECTS, 'vector-compound-sources-invalid', (item) =>
      safeId(item, 'vector-compound-source-invalid'));
    if (sourceObjectIds.length < 2 || new Set(sourceObjectIds).size !== sourceObjectIds.length) {
      throw new DrawModelError('vector-compound-sources-invalid');
    }
    const sourceRevision = value.compound.sourceRevision;
    if (typeof sourceRevision !== 'number' || !Number.isSafeInteger(sourceRevision) || sourceRevision < 0) {
      throw new DrawModelError('vector-compound-revision-invalid');
    }
    compound = { operation: operation as BooleanOperation, sourceObjectIds, sourceRevision };
  }

  return {
    kind: kind as DrawShapeKind,
    style: normalizeStyle(value.style),
    points,
    pathNodes,
    closed: value.closed ?? !['line', 'arrow', 'bezier', 'freehand'].includes(kind),
    fillRule,
    ...(iconName === undefined ? {} : { iconName }),
    ...(compound === undefined ? {} : { compound }),
  };
}

/**
 * Sets or removes the drop shadow. `updateVectorStyle` merges patches and therefore cannot delete a
 * key, so removal needs its own entry point — this keeps `normalizeStyle` the only style validator.
 */
export function setVectorShadow(object: DrawObject, shadow: DrawVectorStyle['shadow'] | undefined): DrawObject {
  assertDrawObject(object);
  if (object.type !== 'shape' || !object.vector) throw new DrawModelError('shape-required');
  const source: Partial<DrawVectorStyle> = { ...object.vector.style };
  if (shadow === undefined) delete source.shadow;
  else source.shadow = shadow;
  const style = normalizeStyle(source);
  const result = clone(object, 'object-clone-failed');
  result.vector = { ...normalizeVectorData(object.vector), style };
  return result;
}

/**
 * Der **Rahmen** (`type: 'frame'`) — dieselbe Normalisierung wie eine Form, andere Objektart.
 *
 * Warum diese Fabrik nötig war (Befund dieser Runde, gemessen): `createVectorShape` setzt **immer**
 * `type: 'shape'`. Danach erzeugte **kein** Pfad der Zone ein `type: 'frame'`-Objekt aus der Oberfläche —
 * nur der Import (`drawInterchangeCore.ts:209`). Damit waren **alle** Leser unerreichbar, die auf
 * `type === 'frame'` prüfen: `presentWorkspaceIntegration`/`notesWorkspaceEmbed` (Rahmen als
 * Live-Einbettung), `drawProjectionAdapter.ts:66`, der Rahmen-Zweig in `drawSceneRenderModel.ts:103` und
 * `registerDrawEmbedAnchor({ kind: 'frame' })`. *Eine Fähigkeit ohne Erzeuger ist nicht geliefert.*
 */
export function createVectorFrame(
  input: Omit<DrawObject, 'type' | 'vector'> & {
    vector?: Omit<Partial<DrawVectorData>, 'style'> & Pick<DrawVectorData, 'kind'> & { style?: Partial<DrawVectorStyle> };
  },
): DrawObject {
  if (!isRecord(input)) throw new DrawModelError('frame-invalid');
  const { vector, ...rest } = input;
  // Der **eine** Normalisierer bleibt `createVectorShape`; hier wird nur die Objektart gesetzt und erneut geprüft.
  const shape = createVectorShape({ ...rest, vector: vector ?? { kind: 'rectangle' } });
  const frame: DrawObject = { ...shape, type: 'frame' };
  assertDrawObject(frame);
  return frame;
}

function validateObjectList(objects: readonly DrawObject[]): void {
  if (!Array.isArray(objects) || objects.length > MAX_OBJECTS) throw new DrawModelError('object-list-limit');
  const ids = new Set<string>();
  for (let index = 0; index < objects.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(objects, String(index));
    if (!descriptor || !('value' in descriptor)) throw new DrawModelError('object-list-invalid');
    const object = descriptor.value as DrawObject;
    assertDrawObject(object);
    bounded(object.x, -MAX_VECTOR_COORDINATE, MAX_VECTOR_COORDINATE, 'object-geometry-invalid');
    bounded(object.y, -MAX_VECTOR_COORDINATE, MAX_VECTOR_COORDINATE, 'object-geometry-invalid');
    bounded(object.width, 0, MAX_VECTOR_COORDINATE, 'object-geometry-invalid');
    bounded(object.height, 0, MAX_VECTOR_COORDINATE, 'object-geometry-invalid');
    if (!Number.isFinite(object.x + object.width) || !Number.isFinite(object.y + object.height)) {
      throw new DrawModelError('object-geometry-invalid');
    }
    if (ids.has(object.id)) throw new DrawModelError('object-id-duplicate');
    ids.add(object.id);
  }
}

function cloneObjectList(objects: readonly DrawObject[]): DrawObject[] {
  return objects.map((object) => clone(object, 'object-clone-failed'));
}

function boundsOf(objects: readonly DrawObject[]): DrawBounds {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const object of objects) {
    left = Math.min(left, object.x);
    top = Math.min(top, object.y);
    right = Math.max(right, object.x + object.width);
    bottom = Math.max(bottom, object.y + object.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function createVectorShape(
  input: Omit<DrawObject, 'type' | 'vector'> & {
    vector: Omit<Partial<DrawVectorData>, 'style'> & Pick<DrawVectorData, 'kind'> & { style?: Partial<DrawVectorStyle> };
  },
): DrawObject {
  if (!isRecord(input)) throw new DrawModelError('shape-invalid');
  const vector = normalizeVectorData(input.vector);
  const result = { ...clone(input), type: 'shape', vector } as DrawObject;
  assertDrawObject(result);
  validateObjectList([result]);
  return result;
}

export function updateVectorStyle(object: DrawObject, patch: Partial<DrawVectorStyle>): DrawObject {  assertDrawObject(object);
  if (object.type !== 'shape' || !object.vector) throw new DrawModelError('shape-required');
  if (!isRecord(patch)) throw new DrawModelError('style-patch-invalid');
  if (Object.values(patch).some((value) => value === undefined)) throw new DrawModelError('style-patch-invalid');
  const style = normalizeStyle({ ...object.vector.style, ...patch });
  const result = clone(object, 'object-clone-failed');
  result.vector = { ...normalizeVectorData(object.vector), style };
  return result;
}

function sortCoordinate(axis: 'x' | 'y'): (object: DrawObject) => number {
  return axis === 'x' ? (object) => object.x : (object) => object.y;
}

function distributePositions(objects: DrawObject[], axis: 'x' | 'y'): void {
  const coordinate = sortCoordinate(axis);
  const sorted = [...objects].sort((a, b) => coordinate(a) - coordinate(b) || a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const anchors = new Set<number>([0, sorted.length - 1]);
  for (let index = 1; index < sorted.length - 1; index += 1) if (sorted[index].locked) anchors.add(index);
  const anchorIndexes = [...anchors].sort((a, b) => a - b);
  for (let segment = 1; segment < anchorIndexes.length; segment += 1) {
    const start = anchorIndexes[segment - 1];
    const end = anchorIndexes[segment];
    const startPosition = coordinate(sorted[start]);
    const endPosition = coordinate(sorted[end]);
    const step = (endPosition - startPosition) / (end - start);
    for (let index = start + 1; index < end; index += 1) {
      if (!sorted[index].locked) {
        if (axis === 'x') sorted[index].x = startPosition + step * (index - start);
        else sorted[index].y = startPosition + step * (index - start);
      }
    }
  }
}

function spaceEvenly(objects: DrawObject[], axis: 'x' | 'y'): void {
  const coordinate = sortCoordinate(axis);
  const dimension = axis === 'x' ? (object: DrawObject) => object.width : (object: DrawObject) => object.height;
  const sorted = [...objects].sort((a, b) => coordinate(a) - coordinate(b) || a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  if (sorted.length < 3) return;
  const bounds = boundsOf(sorted);
  const start = axis === 'x' ? bounds.x : bounds.y;
  const span = axis === 'x' ? bounds.width : bounds.height;
  const total = sorted.reduce((sum, object) => sum + dimension(object), 0);
  const gap = Math.max(0, (span - total) / (sorted.length - 1));
  let cursor = start;
  for (const object of sorted) {
    if (!object.locked) {
      if (axis === 'x') object.x = cursor;
      else object.y = cursor;
    }
    cursor += dimension(object) + gap;
  }
}

export function transformDrawObjects(
  objects: readonly DrawObject[],
  operation: TransformOperation,
  amount: DrawPoint = { x: 1, y: 1 },
): DrawObject[] {
  validateObjectList(objects);
  if (typeof operation !== 'string' || !TRANSFORM_OPERATIONS.has(operation)) throw new DrawModelError('transform-operation-invalid');
  const delta = clonePoint(amount, 'transform-amount-invalid');
  const result = cloneObjectList(objects);
  if (result.length === 0) return result;
  const bounds = boundsOf(result);

  if (operation === 'nudge') {
    for (const object of result) if (!object.locked) {
      object.x += delta.x;
      object.y += delta.y;
    }
  } else if (operation === 'same-width' || operation === 'same-height') {
    const first = result[0];
    for (const object of result) if (!object.locked) {
      if (operation === 'same-width') object.width = first.width;
      else object.height = first.height;
    }
  } else if (operation === 'align-left' || operation === 'align-center' || operation === 'align-right') {
    for (const object of result) if (!object.locked) {
      if (operation === 'align-left') object.x = bounds.x;
      else if (operation === 'align-center') object.x = bounds.x + (bounds.width - object.width) / 2;
      else object.x = bounds.x + bounds.width - object.width;
    }
  } else if (operation === 'align-top' || operation === 'align-middle' || operation === 'align-bottom') {
    for (const object of result) if (!object.locked) {
      if (operation === 'align-top') object.y = bounds.y;
      else if (operation === 'align-middle') object.y = bounds.y + (bounds.height - object.height) / 2;
      else object.y = bounds.y + bounds.height - object.height;
    }
  } else if (operation === 'distribute-x') distributePositions(result, 'x');
  else if (operation === 'distribute-y') distributePositions(result, 'y');
  else if (operation === 'space-evenly-x') spaceEvenly(result, 'x');
  else spaceEvenly(result, 'y');

  validateObjectList(result);
  return result;
}

export function reorderZ(
  objects: readonly DrawObject[],
  ids: readonly DrawObjectId[],
  action: ZOrderAction,
): DrawObject[] {
  validateObjectList(objects);
  if (typeof action !== 'string' || !Z_ORDER_ACTIONS.has(action)) throw new DrawModelError('z-order-action-invalid');
  const selectedIds = copyArray(ids, MAX_OBJECTS, 'z-order-selection-invalid', (id) => safeId(id, 'z-order-selection-invalid'));
  if (new Set(selectedIds).size !== selectedIds.length) throw new DrawModelError('z-order-selection-duplicate');
  const objectIds = new Set(objects.map((object) => object.id));
  if (selectedIds.some((id) => !objectIds.has(id))) throw new DrawModelError('z-order-object-missing');

  const selected = new Set(selectedIds);
  const sorted = cloneObjectList(objects).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const chosen = sorted.filter((object) => selected.has(object.id));
  const remaining = sorted.filter((object) => !selected.has(object.id));
  let next: DrawObject[];
  if (action === 'front') next = [...remaining, ...chosen];
  else if (action === 'back') next = [...chosen, ...remaining];
  else {
    next = [...sorted];
    if (action === 'forward') {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (selected.has(next[index].id) && !selected.has(next[index + 1].id)) {
          [next[index], next[index + 1]] = [next[index + 1], next[index]];
        }
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        if (selected.has(next[index].id) && !selected.has(next[index - 1].id)) {
          [next[index], next[index - 1]] = [next[index - 1], next[index]];
        }
      }
    }
  }
  return next.map((object, index) => ({ ...object, zIndex: index }));
}

export function createNonDestructiveBooleanObject(
  id: string,
  pageId: string,
  layerId: string,
  sources: readonly DrawObject[],
  operation: BooleanOperation,
  revision: number,
): DrawObject {
  safeId(id, 'boolean-object-id-invalid');
  safeId(pageId, 'boolean-page-id-invalid');
  safeId(layerId, 'boolean-layer-id-invalid');
  if (!Array.isArray(sources) || sources.length < 2 || sources.length > MAX_OBJECTS) {
    throw new DrawModelError('boolean-source-invalid');
  }
  if (typeof operation !== 'string' || !BOOLEAN_OPERATIONS.has(operation)) throw new DrawModelError('boolean-operation-invalid');
  if (!Number.isSafeInteger(revision) || revision < 0) throw new DrawModelError('boolean-revision-invalid');
  validateObjectList(sources);
  const first = sources[0];
  if (sources.some((source) => source.type !== 'shape' || !source.vector
    || source.pageId !== first.pageId || source.layerId !== first.layerId
    || source.pageId !== pageId || source.layerId !== layerId)) {
    throw new DrawModelError('boolean-source-invalid');
  }
  const sourceIds = sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) throw new DrawModelError('boolean-source-duplicate');
  for (const source of sources) normalizeVectorData(source.vector);
  const bounds = boundsOf(sources);
  const zIndex = sources.reduce((maximum, source) => Math.max(maximum, source.zIndex), Number.NEGATIVE_INFINITY) + 1;
  return createVectorShape({
    id,
    pageId,
    layerId,
    name: `${operation} compound`,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex,
    vector: {
      kind: 'custom-path',
      style: normalizeStyle(DEFAULT_DRAW_STYLE),
      compound: { operation: operation as BooleanOperation, sourceObjectIds: sourceIds, sourceRevision: revision },
    },
  });
}

export function objectBounds(object: DrawObject): DrawBounds {
  assertDrawObject(object);
  return { x: object.x, y: object.y, width: object.width, height: object.height };
}
