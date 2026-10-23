// STATUS: PLATIN
// Whiteboard coordinate normalization, viewport transforms, and view configuration.

import type {
  WhiteboardBackgroundStyle,
  WhiteboardBookmark,
  WhiteboardGuide,
  WhiteboardViewConfig,
} from '../../../shared/contracts/workspace';
import type { BoundingBox } from '../rendering/whiteboardSpatialIndexEngine';
import { WHITEBOARD_MAX_ITEMS } from '../types';
import type { WhiteboardItem } from '../types';

export { WHITEBOARD_MAX_ITEMS } from '../types';

export const WHITEBOARD_MIN_ZOOM = 0.05;
export const WHITEBOARD_MAX_ZOOM = 8;
export const WHITEBOARD_MAX_COORDINATE = 10_000_000;
export const WHITEBOARD_MAX_DIMENSION = 2_000_000;
export const WHITEBOARD_DEFAULT_GRID_SIZE = 24;
export const WHITEBOARD_MIN_GRID_SIZE = 8;
export const WHITEBOARD_MAX_GRID_SIZE = 256;
export const WHITEBOARD_MAX_GUIDES = 256;
export const WHITEBOARD_MAX_BOOKMARKS = 256;

const WHITEBOARD_MAX_WORLD_EXTENT = WHITEBOARD_MAX_COORDINATE + WHITEBOARD_MAX_DIMENSION;
const MAX_VIEWPORT_PIXELS = WHITEBOARD_MAX_DIMENSION;
const MAX_SCREEN_PAN = MAX_VIEWPORT_PIXELS * 1_000;

export interface WhiteboardViewportSize {
  width: number;
  height: number;
}

export interface WhiteboardViewportTransform {
  pan: { x: number; y: number };
  zoom: number;
}

export interface WhiteboardMiniMapTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  worldBounds: BoundingBox;
}

const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;

export function clampNumber(value: number, min: number, max: number): number {
  const firstBound = Number.isFinite(min) ? min : 0;
  const secondBound = Number.isFinite(max) ? max : firstBound;
  const lower = Math.min(firstBound, secondBound);
  const upper = Math.max(firstBound, secondBound);
  return Math.min(upper, Math.max(lower, finite(value, lower)));
}

export const clampZoom = (zoom: number): number => clampNumber(zoom, WHITEBOARD_MIN_ZOOM, WHITEBOARD_MAX_ZOOM);
export const clampCoordinate = (value: number): number => clampNumber(value, -WHITEBOARD_MAX_COORDINATE, WHITEBOARD_MAX_COORDINATE);
export const clampDimension = (value: number): number => clampNumber(value, 1, WHITEBOARD_MAX_DIMENSION);

function viewportSize(size: WhiteboardViewportSize): WhiteboardViewportSize {
  return {
    width: clampNumber(size?.width, 1, MAX_VIEWPORT_PIXELS),
    height: clampNumber(size?.height, 1, MAX_VIEWPORT_PIXELS),
  };
}

function safeBounds(bounds: BoundingBox): BoundingBox {
  const candidate = bounds as BoundingBox | null | undefined;
  const values = [candidate?.minX, candidate?.minY, candidate?.maxX, candidate?.maxY];
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  const [firstX, firstY, secondX, secondY] = values as number[];
  const minX = clampNumber(Math.min(firstX, secondX), -WHITEBOARD_MAX_WORLD_EXTENT, WHITEBOARD_MAX_WORLD_EXTENT);
  const minY = clampNumber(Math.min(firstY, secondY), -WHITEBOARD_MAX_WORLD_EXTENT, WHITEBOARD_MAX_WORLD_EXTENT);
  const maxX = clampNumber(Math.max(firstX, secondX), -WHITEBOARD_MAX_WORLD_EXTENT, WHITEBOARD_MAX_WORLD_EXTENT);
  const maxY = clampNumber(Math.max(firstY, secondY), -WHITEBOARD_MAX_WORLD_EXTENT, WHITEBOARD_MAX_WORLD_EXTENT);
  return { minX, minY, maxX, maxY };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

export function normalizeWhiteboardItem(item: WhiteboardItem): WhiteboardItem {
  return {
    ...item,
    x: clampCoordinate(item.x),
    y: clampCoordinate(item.y),
    width: clampDimension(item.width),
    height: clampDimension(item.height),
  };
}

export function validateAndNormalizeWhiteboardItems(
  items: WhiteboardItem[],
): { ok: true; items: WhiteboardItem[] } | { ok: false; reason: string } {
  if (!Array.isArray(items) || items.length > WHITEBOARD_MAX_ITEMS) {
    return { ok: false, reason: `Board object ceiling exceeded (${WHITEBOARD_MAX_ITEMS.toLocaleString()} objects).` };
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !validId(item.id) || seen.has(item.id)) {
      return { ok: false, reason: 'Duplicate or empty whiteboard object id rejected.' };
    }
    seen.add(item.id);
  }
  return { ok: true, items: items.map(normalizeWhiteboardItem) };
}

export function normalizeWhiteboardViewConfig(view?: Partial<WhiteboardViewConfig>): WhiteboardViewConfig {
  const backgroundStyle: WhiteboardBackgroundStyle = ['dots', 'grid', 'plain'].includes(String(view?.backgroundStyle))
    ? view!.backgroundStyle as WhiteboardBackgroundStyle
    : 'dots';

  const guides: WhiteboardGuide[] = [];
  const sourceGuides = Array.isArray(view?.guides) ? view.guides : [];
  for (const guide of sourceGuides.slice(0, WHITEBOARD_MAX_GUIDES)) {
    if (!guide || typeof guide !== 'object' || !validId(guide.id)
      || (guide.axis !== 'x' && guide.axis !== 'y') || !Number.isFinite(guide.position)) continue;
    guides.push({ id: guide.id, axis: guide.axis, position: clampCoordinate(guide.position) });
  }

  const bookmarks: WhiteboardBookmark[] = [];
  const sourceBookmarks = Array.isArray(view?.bookmarks) ? view.bookmarks : [];
  for (const bookmark of sourceBookmarks.slice(0, WHITEBOARD_MAX_BOOKMARKS)) {
    if (!bookmark || typeof bookmark !== 'object' || !validId(bookmark.id)
      || !Number.isFinite(bookmark.x) || !Number.isFinite(bookmark.y) || !Number.isFinite(bookmark.zoom)) continue;
    bookmarks.push({
      id: bookmark.id,
      name: typeof bookmark.name === 'string' ? bookmark.name.slice(0, 120) : 'Location',
      x: clampCoordinate(bookmark.x),
      y: clampCoordinate(bookmark.y),
      zoom: clampZoom(bookmark.zoom),
    });
  }

  const presentationPath: string[] = [];
  const seenFrameIds = new Set<string>();
  const sourcePath = Array.isArray(view?.presentationPath) ? view.presentationPath : [];
  for (const id of sourcePath.slice(0, WHITEBOARD_MAX_ITEMS)) {
    if (!validId(id) || seenFrameIds.has(id)) continue;
    seenFrameIds.add(id);
    presentationPath.push(id);
  }

  return {
    backgroundStyle,
    gridSize: clampNumber(view?.gridSize ?? WHITEBOARD_DEFAULT_GRID_SIZE, WHITEBOARD_MIN_GRID_SIZE, WHITEBOARD_MAX_GRID_SIZE),
    showRulers: view?.showRulers !== false,
    guides,
    bookmarks,
    presentationPath,
    snapToGrid: view?.snapToGrid !== false,
    snapToGuides: view?.snapToGuides !== false,
  };
}

export function viewportToWorldBounds(
  pan: { x: number; y: number },
  zoom: number,
  viewport: WhiteboardViewportSize,
  overscanScreenPx = 320,
): BoundingBox {
  const safeViewport = viewportSize(viewport);
  const safeZoom = clampZoom(zoom);
  const safePanX = clampNumber(pan?.x, -MAX_SCREEN_PAN, MAX_SCREEN_PAN);
  const safePanY = clampNumber(pan?.y, -MAX_SCREEN_PAN, MAX_SCREEN_PAN);
  const overscan = clampNumber(overscanScreenPx, 0, MAX_VIEWPORT_PIXELS) / safeZoom;
  return {
    minX: (-safePanX / safeZoom) - overscan,
    minY: (-safePanY / safeZoom) - overscan,
    maxX: ((safeViewport.width - safePanX) / safeZoom) + overscan,
    maxY: ((safeViewport.height - safePanY) / safeZoom) + overscan,
  };
}

export function fitBoundsToViewport(
  bounds: BoundingBox,
  viewport: WhiteboardViewportSize,
  padding = 72,
  minZoom = WHITEBOARD_MIN_ZOOM,
  maxZoom = WHITEBOARD_MAX_ZOOM,
): WhiteboardViewportTransform {
  const safeBox = safeBounds(bounds);
  const safeViewport = viewportSize(viewport);
  const width = Math.max(1, safeBox.maxX - safeBox.minX);
  const height = Math.max(1, safeBox.maxY - safeBox.minY);
  const safePadding = clampNumber(padding, 0, MAX_VIEWPORT_PIXELS);
  const availableWidth = Math.max(1, safeViewport.width - safePadding * 2);
  const availableHeight = Math.max(1, safeViewport.height - safePadding * 2);
  const lowerZoom = clampZoom(minZoom);
  const upperZoom = Math.max(lowerZoom, clampZoom(maxZoom));
  const zoom = clampNumber(Math.min(availableWidth / width, availableHeight / height), lowerZoom, upperZoom);
  const centerX = (safeBox.minX + safeBox.maxX) / 2;
  const centerY = (safeBox.minY + safeBox.maxY) / 2;
  return {
    zoom,
    pan: {
      x: safeViewport.width / 2 - centerX * zoom,
      y: safeViewport.height / 2 - centerY * zoom,
    },
  };
}

export function zoomAroundScreenPoint(
  pan: { x: number; y: number },
  currentZoom: number,
  nextZoom: number,
  screenPoint: { x: number; y: number },
): WhiteboardViewportTransform {
  const from = clampZoom(currentZoom);
  const to = clampZoom(nextZoom);
  const safePanX = clampNumber(pan?.x, -MAX_SCREEN_PAN, MAX_SCREEN_PAN);
  const safePanY = clampNumber(pan?.y, -MAX_SCREEN_PAN, MAX_SCREEN_PAN);
  const screenX = clampNumber(screenPoint?.x, -MAX_SCREEN_PAN, MAX_SCREEN_PAN);
  const screenY = clampNumber(screenPoint?.y, -MAX_SCREEN_PAN, MAX_SCREEN_PAN);
  const worldX = (screenX - safePanX) / from;
  const worldY = (screenY - safePanY) / from;
  return {
    zoom: to,
    pan: {
      x: screenX - worldX * to,
      y: screenY - worldY * to,
    },
  };
}

export function centerWorldPoint(
  point: { x: number; y: number },
  zoom: number,
  viewport: WhiteboardViewportSize,
): WhiteboardViewportTransform {
  const safeZoom = clampZoom(zoom);
  const safeViewport = viewportSize(viewport);
  return {
    zoom: safeZoom,
    pan: {
      x: safeViewport.width / 2 - clampCoordinate(finite(point?.x)) * safeZoom,
      y: safeViewport.height / 2 - clampCoordinate(finite(point?.y)) * safeZoom,
    },
  };
}

export function itemBounds(item: WhiteboardItem): BoundingBox {
  const x = clampCoordinate(item?.x);
  const y = clampCoordinate(item?.y);
  const width = clampDimension(item?.width);
  const height = clampDimension(item?.height);
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}

export function expandRenderSetForConnectors(visible: WhiteboardItem[], allItems: WhiteboardItem[]): WhiteboardItem[] {
  if (!Array.isArray(visible) || !Array.isArray(allItems)
    || visible.length > WHITEBOARD_MAX_ITEMS || allItems.length > WHITEBOARD_MAX_ITEMS) return [];
  if (visible.length === allItems.length && visible.every((item, index) => item === allItems[index])) {
    const seenIds = new Set<string>();
    for (const item of visible) {
      if (!item || !validId(item.id) || seenIds.has(item.id)) return [];
      seenIds.add(item.id);
    }
    return visible;
  }

  const byId = new Map<string, WhiteboardItem>();
  for (const item of allItems) {
    if (!item || !validId(item.id) || byId.has(item.id)) return [];
    byId.set(item.id, item);
  }
  const result = new Map<string, WhiteboardItem>();
  for (const item of visible) {
    if (!item || !validId(item.id)) return [];
    result.set(item.id, item);
  }
  for (const item of visible) {
    if (item.type !== 'connector') continue;
    if (item.fromId) {
      const source = byId.get(item.fromId);
      if (source) result.set(source.id, source);
    }
    if (item.toId) {
      const target = byId.get(item.toId);
      if (target) result.set(target.id, target);
    }
  }
  return [...result.values()];
}

export function normalizePresentationPath(items: WhiteboardItem[], path: string[]): string[] {
  if (!Array.isArray(items) || !Array.isArray(path)) return [];
  const frameIds = new Set<string>();
  for (const item of items.slice(0, WHITEBOARD_MAX_ITEMS)) {
    if (item?.type === 'frame' && validId(item.id)) frameIds.add(item.id);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of path.slice(0, WHITEBOARD_MAX_ITEMS)) {
    if (!validId(id) || !frameIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function allFramePresentationPath(items: WhiteboardItem[]): string[] {
  if (!Array.isArray(items)) return [];
  const frameIds: string[] = [];
  for (const item of items.slice(0, WHITEBOARD_MAX_ITEMS)) {
    if (item?.type === 'frame' && validId(item.id)) frameIds.push(item.id);
  }
  return frameIds;
}

export function createMiniMapTransform(bounds: BoundingBox, width: number, height: number, padding = 8): WhiteboardMiniMapTransform {
  const safeBox = safeBounds(bounds);
  const safeWidth = clampNumber(width, 1, MAX_VIEWPORT_PIXELS);
  const safeHeight = clampNumber(height, 1, MAX_VIEWPORT_PIXELS);
  const safePadding = clampNumber(padding, 0, MAX_VIEWPORT_PIXELS);
  const worldWidth = Math.max(1, safeBox.maxX - safeBox.minX);
  const worldHeight = Math.max(1, safeBox.maxY - safeBox.minY);
  const innerWidth = Math.max(1, safeWidth - safePadding * 2);
  const innerHeight = Math.max(1, safeHeight - safePadding * 2);
  const scale = Math.min(innerWidth / worldWidth, innerHeight / worldHeight);
  const drawnWidth = worldWidth * scale;
  const drawnHeight = worldHeight * scale;
  return {
    scale,
    offsetX: (safeWidth - drawnWidth) / 2 - safeBox.minX * scale,
    offsetY: (safeHeight - drawnHeight) / 2 - safeBox.minY * scale,
    worldBounds: safeBox,
  };
}

function safeMiniMapScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? clampNumber(value, 1e-12, MAX_VIEWPORT_PIXELS) : 1;
}

export function worldToMiniMap(point: { x: number; y: number }, transform: WhiteboardMiniMapTransform) {
  const scale = safeMiniMapScale(transform?.scale);
  return {
    x: clampNumber(finite(point?.x, 0), -WHITEBOARD_MAX_WORLD_EXTENT, WHITEBOARD_MAX_WORLD_EXTENT) * scale + finite(transform?.offsetX),
    y: clampNumber(finite(point?.y, 0), -WHITEBOARD_MAX_WORLD_EXTENT, WHITEBOARD_MAX_WORLD_EXTENT) * scale + finite(transform?.offsetY),
  };
}

export function miniMapToWorld(point: { x: number; y: number }, transform: WhiteboardMiniMapTransform) {
  const scale = safeMiniMapScale(transform?.scale);
  return {
    x: clampNumber((finite(point?.x, 0) - finite(transform?.offsetX)) / scale, -WHITEBOARD_MAX_WORLD_EXTENT, WHITEBOARD_MAX_WORLD_EXTENT),
    y: clampNumber((finite(point?.y, 0) - finite(transform?.offsetY)) / scale, -WHITEBOARD_MAX_WORLD_EXTENT, WHITEBOARD_MAX_WORLD_EXTENT),
  };
}

/**
 * Keyboard navigation for the mini-map: the same camera step the canvas itself uses, resolved purely.
 * Returns `null` for keys the mini-map does not own so the caller can let the event bubble.
 */
export function stepWorldCenterByKey(
  center: { x: number; y: number },
  key: string,
  stepWorld: number,
): { x: number; y: number } | null {
  const step = clampNumber(finite(stepWorld, 0), 0, WHITEBOARD_MAX_COORDINATE);
  const x = clampCoordinate(finite(center?.x, 0));
  const y = clampCoordinate(finite(center?.y, 0));
  if (typeof key !== 'string') return null;
  if (key === 'ArrowLeft') return { x: clampCoordinate(x - step), y };
  if (key === 'ArrowRight') return { x: clampCoordinate(x + step), y };
  if (key === 'ArrowUp') return { x, y: clampCoordinate(y - step) };
  if (key === 'ArrowDown') return { x, y: clampCoordinate(y + step) };
  return null;
}

export function rulerStepForZoom(zoom: number): number {  const targetWorldStep = 80 / clampZoom(zoom);
  const exponent = Math.floor(Math.log10(Math.max(targetWorldStep, 0.0001)));
  const base = 10 ** exponent;
  for (const multiplier of [1, 2, 5, 10]) {
    if (base * multiplier >= targetWorldStep) return base * multiplier;
  }
  return base * 10;
}

export function canvasBackgroundCss(
  style: WhiteboardBackgroundStyle,
  gridSize: number,
  pan: { x: number; y: number },
  zoom: number,
): Record<string, string> {
  const size = clampNumber(gridSize, WHITEBOARD_MIN_GRID_SIZE, WHITEBOARD_MAX_GRID_SIZE) * clampZoom(zoom);
  if (style === 'plain') return { backgroundImage: 'none' };
  const backgroundPosition = `${clampNumber(pan?.x, -MAX_SCREEN_PAN, MAX_SCREEN_PAN)}px ${clampNumber(pan?.y, -MAX_SCREEN_PAN, MAX_SCREEN_PAN)}px`;
  if (style === 'grid') {
    return {
      backgroundImage: 'linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)',
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition,
    };
  }
  return {
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.10) 1px, transparent 1px)',
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition,
  };
}
