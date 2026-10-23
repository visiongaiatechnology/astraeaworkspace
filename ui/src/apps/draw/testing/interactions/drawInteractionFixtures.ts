// STATUS: GOLD — deterministic Draw fixtures for interaction tests (no DOM, no randomness).
import type {
  DrawConnectorData, DrawDocumentModel, DrawGuide, DrawLayer, DrawObject, DrawPage, DrawShapeKind, DrawViewport,
} from '../../../../shared/contracts/draw/workspaceDraw';
import { createEmptyDrawDocument } from '../../model/drawDocumentEngine';
import { createVectorShape } from '../../model/drawVectorEngine';

export interface DrawFixtureLayer {
  readonly id: string;
  readonly name?: string;
  readonly visible?: boolean;
  readonly locked?: boolean;
}

export interface DrawFixtureObject {
  readonly id: string;
  readonly layerId?: string;
  readonly pageId?: string;
  readonly type?: DrawObject['type'];
  readonly name?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly zIndex?: number;
  readonly rotation?: number;
  readonly locked?: boolean;
  readonly opacity?: number;
  readonly kind?: DrawShapeKind;
  readonly text?: string;
  readonly parentGroupId?: string;
  readonly childIds?: readonly string[];
  readonly connector?: DrawConnectorData;
}

export interface DrawFixtureOptions {
  readonly layers?: readonly DrawFixtureLayer[] | readonly [readonly DrawFixtureLayer[], readonly DrawFixtureLayer[]];
  readonly objects?: readonly DrawFixtureObject[];
  readonly viewport?: Partial<DrawViewport>;
  readonly guides?: readonly DrawGuide[];
  readonly twoPages?: boolean;
}

const DEFAULT_LAYER: DrawFixtureLayer = { id: 'layer-main', name: 'Main' };

function makeLayer(layer: DrawFixtureLayer, order: number): DrawLayer {
  return {
    id: layer.id,
    name: layer.name ?? layer.id,
    visible: layer.visible ?? true,
    locked: layer.locked ?? false,
    printable: true,
    order,
  };
}

export function connectorFixture(fromId: string, toId: string, label?: string): DrawConnectorData {
  return {
    from: { objectId: fromId, anchor: 'auto' },
    to: { objectId: toId, anchor: 'auto' },
    route: 'orthogonal',
    autoRoute: true,
    waypoints: [],
    obstacleAvoidance: true,
    routingPriority: 0,
    crossingStyle: 'none',
    semantic: label ? { label } : {},
    arrowStart: 'none',
    arrowEnd: 'triangle',
  };
}

function makeObject(source: DrawFixtureObject): DrawObject {
  const base = createVectorShape({
    id: source.id,
    pageId: source.pageId ?? 'page-1',
    layerId: source.layerId ?? DEFAULT_LAYER.id,
    name: source.name ?? source.id,
    x: source.x ?? 0,
    y: source.y ?? 0,
    width: source.width ?? 100,
    height: source.height ?? 60,
    rotation: source.rotation ?? 0,
    flipX: false,
    flipY: false,
    opacity: source.opacity ?? 1,
    locked: source.locked ?? false,
    zIndex: source.zIndex ?? 0,
    richText: source.text === undefined
      ? undefined
      : {
        runs: [{ text: source.text }],
        autoFit: 'shrink',
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
        verticalAlign: 'middle',
        rotation: 0,
      },
    vector: { kind: source.kind ?? 'rectangle' },
  });
  const result: DrawObject = { ...base, type: source.type ?? 'shape' };
  if (source.parentGroupId) result.parentGroupId = source.parentGroupId;
  if (source.childIds) result.childIds = [...source.childIds];
  if (source.connector) {
    result.type = 'connector';
    result.connector = source.connector;
    delete (result as { vector?: unknown }).vector;
  }
  if (result.type === 'group') delete (result as { vector?: unknown }).vector;
  return result;
}

/**
 * Builds a document that already satisfies `assertDrawDocument`: every object is listed in its page's
 * `objectIds` and every page layer exists in `layers`.
 */
export function buildDrawModel(options: DrawFixtureOptions = {}): DrawDocumentModel {
  const base = createEmptyDrawDocument();
  const layerSets: readonly (readonly DrawFixtureLayer[])[] = options.twoPages
    ? [
      (options.layers as readonly [readonly DrawFixtureLayer[], readonly DrawFixtureLayer[]] | undefined)?.[0] ?? [DEFAULT_LAYER],
      (options.layers as readonly [readonly DrawFixtureLayer[], readonly DrawFixtureLayer[]] | undefined)?.[1] ?? [DEFAULT_LAYER],
    ]
    : [((options.layers as readonly DrawFixtureLayer[] | undefined) ?? [DEFAULT_LAYER])];

  const layerIds = new Set<string>();
  const layers: DrawLayer[] = [];
  layerSets.forEach((set, pageIndex) => set.forEach((layer, order) => {
    if (layerIds.has(layer.id)) return;
    layerIds.add(layer.id);
    layers.push(makeLayer(layer, pageIndex * 100 + order));
  }));
  if (layers.length === 0) layers.push(makeLayer(DEFAULT_LAYER, 0));

  const objects = (options.objects ?? []).map(makeObject);
  const objectMap: Record<string, DrawObject> = {};
  for (const object of objects) objectMap[object.id] = object;

  const pages: DrawPage[] = layerSets.map((set, pageIndex) => {
    const id = pageIndex === 0 ? 'page-1' : `page-${pageIndex + 1}`;
    return {
      id,
      name: `Page ${pageIndex + 1}`,
      width: 1122,
      height: 793,
      orientation: 'landscape',
      printableBounds: { x: 32, y: 32, width: 1058, height: 729 },
      objectIds: objects.filter((object) => object.pageId === id).map((object) => object.id),
      layerIds: set.map((layer) => layer.id),
    };
  });

  return {
    schemaVersion: 1,
    canvasMode: 'pages',
    activePageId: pages[0]!.id,
    pages,
    layers,
    objects: objectMap,
    viewport: { ...base.viewport, ...(options.viewport ?? {}), guides: [...(options.guides ?? options.viewport?.guides ?? [])] },
    stencils: [],
    dataBindings: [],
    revision: 1,
  };
}

/** Two overlapping shapes plus a hidden layer, used by hit-test and marquee tests. */
export function overlappingModel(): DrawDocumentModel {
  return buildDrawModel({
    layers: [
      { id: 'layer-main', name: 'Main' },
      { id: 'layer-top', name: 'Top' },
      { id: 'layer-hidden', name: 'Hidden', visible: false },
      { id: 'layer-locked', name: 'Locked', locked: true },
    ],
    objects: [
      { id: 'low', layerId: 'layer-main', x: 0, y: 0, width: 200, height: 200, zIndex: 0 },
      { id: 'high', layerId: 'layer-top', x: 50, y: 50, width: 100, height: 100, zIndex: 0 },
      { id: 'hidden-shape', layerId: 'layer-hidden', x: 60, y: 60, width: 40, height: 40, zIndex: 1 },
      { id: 'locked-shape', layerId: 'layer-locked', x: 70, y: 70, width: 40, height: 40, zIndex: 2 },
      { id: 'outside', layerId: 'layer-main', x: 900, y: 700, width: 60, height: 40, zIndex: 1 },
    ],
  });
}
