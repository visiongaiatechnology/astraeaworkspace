import { describe, expect, it } from 'vitest';
import type { WhiteboardViewConfig } from '../../../../shared/contracts/workspace';
import {
  allFramePresentationPath,
  canvasBackgroundCss,
  clampCoordinate,
  clampDimension,
  clampZoom,
  createMiniMapTransform,
  expandRenderSetForConnectors,
  fitBoundsToViewport,
  miniMapToWorld,
  normalizePresentationPath,
  normalizeWhiteboardViewConfig,
  validateAndNormalizeWhiteboardItems,
  viewportToWorldBounds,
  worldToMiniMap,
  zoomAroundScreenPoint,
} from '../../viewport/whiteboardViewportEngine';
import type { WhiteboardItem } from '../../types';

const item = (id: string, overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 80,
  height: 48,
  text: id,
  ...overrides,
} as WhiteboardItem);

describe('Whiteboard viewport and view-configuration contracts', () => {
  it('normalizes geometry and rejects malformed, duplicate, or oversized identity sets', () => {
    const result = validateAndNormalizeWhiteboardItems([
      item('clamped', { x: Number.POSITIVE_INFINITY, y: 11_000_000, width: Number.NaN, height: 3_000_000 }),
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items[0]).toMatchObject({ x: -10_000_000, y: 10_000_000, width: 1, height: 2_000_000 });
    expect(clampCoordinate(Number.NaN)).toBe(-10_000_000);
    expect(clampDimension(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(0.05);
    expect(validateAndNormalizeWhiteboardItems([item('duplicate'), item('duplicate')]).ok).toBe(false);
    expect(validateAndNormalizeWhiteboardItems([item('x'.repeat(257))]).ok).toBe(false);
    expect(validateAndNormalizeWhiteboardItems(null as unknown as WhiteboardItem[]).ok).toBe(false);
  });

  it('normalizes view arrays defensively, caps nested records, and keeps unique frame paths', () => {
    const guides = Array.from({ length: 260 }, (_, index) => ({ id: `guide-${index}`, axis: 'x' as const, position: 20_000_000 }));
    const bookmarks = Array.from({ length: 260 }, (_, index) => ({
      id: `bookmark-${index}`,
      name: 'n'.repeat(140),
      x: Number.POSITIVE_INFINITY,
      y: 20_000_000,
      zoom: 99,
    }));
    const normalized = normalizeWhiteboardViewConfig({
      backgroundStyle: 'unknown' as WhiteboardViewConfig['backgroundStyle'],
      gridSize: Number.NaN,
      guides,
      bookmarks,
      presentationPath: ['frame-a', 'frame-a', '', 'x'.repeat(257), 'frame-b'],
      showRulers: false,
      snapToGrid: false,
    });

    expect(normalized.backgroundStyle).toBe('dots');
    expect(normalized.gridSize).toBe(8);
    expect(normalized.guides).toHaveLength(256);
    expect(normalized.guides[0]?.position).toBe(10_000_000);
    expect(normalized.bookmarks).toHaveLength(0);
    expect(normalized.presentationPath).toEqual(['frame-a', 'frame-b']);
    expect(normalized.showRulers).toBe(false);
    expect(normalized.snapToGrid).toBe(false);
    expect(normalizeWhiteboardViewConfig({ guides: null, bookmarks: {} } as unknown as Partial<WhiteboardViewConfig>))
      .toMatchObject({ guides: [], bookmarks: [], presentationPath: [] });
  });

  it('keeps viewport bounds finite and preserves the zoom anchor for valid coordinates', () => {
    const bounds = viewportToWorldBounds(
      { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      Number.NaN,
      { width: Number.POSITIVE_INFINITY, height: -100 },
      Number.POSITIVE_INFINITY,
    );
    expect(Object.values(bounds).every(Number.isFinite)).toBe(true);

    const screenPoint = { x: 330, y: 210 };
    const next = zoomAroundScreenPoint({ x: 80, y: 60 }, 2, 4, screenPoint);
    expect((screenPoint.x - next.pan.x) / next.zoom).toBeCloseTo(125);
    expect((screenPoint.y - next.pan.y) / next.zoom).toBeCloseTo(75);

    const fit = fitBoundsToViewport(
      { minX: 100, minY: 200, maxX: -100, maxY: -200 },
      { width: 1_200, height: 800 },
      60,
      0.1,
      3,
    );
    expect(Number.isFinite(fit.pan.x) && Number.isFinite(fit.pan.y)).toBe(true);
    expect(fit.zoom).toBeGreaterThanOrEqual(0.1);
    expect(fit.zoom).toBeLessThanOrEqual(3);
  });

  it('normalizes minimap bounds and keeps point conversion reversible and finite', () => {
    const transform = createMiniMapTransform({ minX: -400, minY: -200, maxX: 800, maxY: 600 }, 196, 124, 8);
    const worldPoint = { x: 300, y: 150 };
    const miniMapPoint = worldToMiniMap(worldPoint, transform);
    const roundTrip = miniMapToWorld(miniMapPoint, transform);
    expect(roundTrip.x).toBeCloseTo(worldPoint.x);
    expect(roundTrip.y).toBeCloseTo(worldPoint.y);

    const malformed = createMiniMapTransform({ minX: Number.NaN, minY: 0, maxX: 0, maxY: 0 }, Infinity, 0);
    expect(malformed.scale).toBeGreaterThan(0);
    expect(Object.values(worldToMiniMap({ x: Infinity, y: Number.NaN }, malformed)).every(Number.isFinite)).toBe(true);
    expect(Object.values(miniMapToWorld({ x: Infinity, y: Number.NaN }, { ...malformed, scale: 0 })).every(Number.isFinite)).toBe(true);
  });

  it('expands visible connectors with their endpoint objects and fails closed on duplicate IDs', () => {
    const source = item('source');
    const target = item('target');
    const connector = item('edge', { type: 'connector', fromId: 'source', toId: 'target' });

    expect(expandRenderSetForConnectors([connector], [source, connector, target])).toEqual([connector, source, target]);
    expect(expandRenderSetForConnectors([connector], [source, item('source'), target])).toEqual([]);
    expect(expandRenderSetForConnectors([source, source], [source, source])).toEqual([]);
  });

  it('keeps presentation paths limited to unique existing frames', () => {
    const items = [item('frame-a', { type: 'frame' }), item('node'), item('frame-b', { type: 'frame' })];
    expect(normalizePresentationPath(items, ['frame-b', 'missing', 'frame-b', 'frame-a'])).toEqual(['frame-b', 'frame-a']);
    expect(allFramePresentationPath(items)).toEqual(['frame-a', 'frame-b']);
  });

  it('keeps ruler and background output valid for invalid numeric settings', () => {
    const background = canvasBackgroundCss('grid', Number.POSITIVE_INFINITY, { x: Number.NaN, y: Infinity }, Number.NaN);
    expect(background.backgroundSize).toBe('0.4px 0.4px');
    expect(background.backgroundPosition).not.toContain('NaN');
    expect(background.backgroundPosition).not.toContain('Infinity');
    expect(canvasBackgroundCss('plain', 24, { x: 0, y: 0 }, 1)).toEqual({ backgroundImage: 'none' });
  });
});
