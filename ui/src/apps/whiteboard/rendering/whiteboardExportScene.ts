// STATUS: PLATIN
// Single canonical geometry source for every Whiteboard raster/vector export.
//
// Before this module existed, `integrations/canvasExport.ts` derived connector endpoints on its own
// (`from.x + from.width` → `to.x`), which is a *second* connector geometry rule that ignored the
// anchors and routing the canvas actually draws (`resolveWhiteboardConnectorPoint` +
// `buildWhiteboardConnectorPaths`). The export scene is now the only place export geometry is
// resolved: paint order comes from `buildWhiteboardRenderProjection`, connector geometry from the
// routing engine's own `bounds`, and label overflow is included so an export can never clip a label
// box. Renderers (canvas 2D, SVG) only consume the scene.

import type { WhiteboardItem } from '../types';
import type { WhiteboardConnectorPath } from '../model/whiteboardDiagramEngine';
import { buildWhiteboardRenderProjection } from './whiteboardRenderProjection';
import type { BoundingBox } from './whiteboardSpatialIndexEngine';
import {
  clampCoordinate,
  clampDimension,
  WHITEBOARD_MAX_COORDINATE,
  WHITEBOARD_MAX_ITEMS,
} from '../viewport/whiteboardViewportEngine';

export const WHITEBOARD_EXPORT_PADDING = 60;
export const WHITEBOARD_EXPORT_MIN_WIDTH = 800;
export const WHITEBOARD_EXPORT_MIN_HEIGHT = 600;
export const WHITEBOARD_EXPORT_MAX_DIMENSION = 4096;

export const WHITEBOARD_EXPORT_ERRORS = Object.freeze({
  objectLimit: 'Whiteboard export object limit exceeded.',
  invalidObject: 'Whiteboard export contains an invalid object.',
  invalidIdentity: 'Whiteboard export contains an invalid object identity.',
  invalidGeometry: 'Whiteboard export contains invalid object geometry.',
  boundsOverflow: 'Whiteboard export bounds exceed the exportable coordinate range.',
});

export interface WhiteboardExportScene {
  /** Canonical paint order, hidden objects already removed. */
  readonly items: readonly WhiteboardItem[];
  readonly byId: ReadonlyMap<string, WhiteboardItem>;
  /** Routed connector geometry exactly as the canvas renders it. */
  readonly connectorPaths: ReadonlyMap<string, WhiteboardConnectorPath>;
  readonly contentBounds: BoundingBox;
  readonly padding: number;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Raster scale that keeps the output inside `WHITEBOARD_EXPORT_MAX_DIMENSION`. */
  readonly scale: number;
}

export interface WhiteboardExportSceneOptions {
  readonly padding?: number;
  readonly maxItems?: number;
  readonly maxDimension?: number;
}

function boundedPadding(value: number | undefined): number {
  if (!Number.isFinite(value)) return WHITEBOARD_EXPORT_PADDING;
  return Math.max(0, Math.min(4096, Math.trunc(value as number)));
}

function union(bounds: BoundingBox | null, box: BoundingBox): BoundingBox {
  if (!bounds) return box;
  return {
    minX: Math.min(bounds.minX, box.minX),
    minY: Math.min(bounds.minY, box.minY),
    maxX: Math.max(bounds.maxX, box.maxX),
    maxY: Math.max(bounds.maxY, box.maxY),
  };
}

/**
 * Resolves export geometry for one board. Invalid or oversized input is rejected with a named error —
 * the export never silently drops an object, and never truncates a label.
 */
export function buildWhiteboardExportScene(
  items: readonly WhiteboardItem[],
  options: WhiteboardExportSceneOptions = {},
): WhiteboardExportScene {
  const maxItems = Number.isFinite(options.maxItems) ? Math.max(1, Math.trunc(options.maxItems as number)) : WHITEBOARD_MAX_ITEMS;
  if (!Array.isArray(items) || items.length > maxItems) throw new Error(WHITEBOARD_EXPORT_ERRORS.objectLimit);

  const seen = new Set<string>();
  for (const candidate of items as unknown[]) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(WHITEBOARD_EXPORT_ERRORS.invalidObject);
    const item = candidate as WhiteboardItem;
    if (typeof item.id !== 'string' || item.id.length === 0 || seen.has(item.id)) throw new Error(WHITEBOARD_EXPORT_ERRORS.invalidIdentity);
    seen.add(item.id);
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || !Number.isFinite(item.width) || !Number.isFinite(item.height)) {
      throw new Error(WHITEBOARD_EXPORT_ERRORS.invalidGeometry);
    }
  }

  const projection = buildWhiteboardRenderProjection(items);
  const normalized: WhiteboardItem[] = projection.items.map((item) => {
    const x = clampCoordinate(item.x);
    const y = clampCoordinate(item.y);
    const width = clampDimension(item.width);
    const height = clampDimension(item.height);
    return x === item.x && y === item.y && width === item.width && height === item.height
      ? item
      : { ...item, x, y, width, height };
  });
  const byId = new Map(normalized.map((item) => [item.id, item]));
  const connectorPaths = projection.connectorPaths;
  const padding = boundedPadding(options.padding);
  const maxDimension = Number.isFinite(options.maxDimension)
    ? Math.max(1, Math.trunc(options.maxDimension as number))
    : WHITEBOARD_EXPORT_MAX_DIMENSION;

  let contentBounds: BoundingBox | null = null;
  for (const item of normalized) {
    if (item.type === 'connector') continue;
    contentBounds = union(contentBounds, {
      minX: item.x,
      minY: item.y,
      maxX: item.x + Math.max(1, item.width),
      maxY: item.y + Math.max(1, item.height),
    });
  }
  // Routed connectors (and their label boxes) can legitimately leave the object union: a curved route
  // bulges beyond its endpoints. The routing engine publishes that hull, so the export simply unions it.
  for (const path of connectorPaths.values()) {
    contentBounds = union(contentBounds, path.bounds);
  }

  const resolved: BoundingBox = contentBounds ?? { minX: 0, minY: 0, maxX: 680, maxY: 480 };
  if (Math.abs(resolved.minX) > WHITEBOARD_MAX_COORDINATE * 2 || Math.abs(resolved.maxX) > WHITEBOARD_MAX_COORDINATE * 2
    || Math.abs(resolved.minY) > WHITEBOARD_MAX_COORDINATE * 2 || Math.abs(resolved.maxY) > WHITEBOARD_MAX_COORDINATE * 2) {
    throw new Error(WHITEBOARD_EXPORT_ERRORS.boundsOverflow);
  }

  const logicalWidth = Math.max(resolved.maxX - resolved.minX + padding * 2, WHITEBOARD_EXPORT_MIN_WIDTH);
  const logicalHeight = Math.max(resolved.maxY - resolved.minY + padding * 2, WHITEBOARD_EXPORT_MIN_HEIGHT);
  const scale = Math.max(1e-6, Math.min(1, maxDimension / logicalWidth, maxDimension / logicalHeight));

  return {
    items: normalized,
    byId,
    connectorPaths,
    contentBounds: resolved,
    padding,
    width: logicalWidth,
    height: logicalHeight,
    offsetX: -resolved.minX + padding,
    offsetY: -resolved.minY + padding,
    scale,
  };
}
