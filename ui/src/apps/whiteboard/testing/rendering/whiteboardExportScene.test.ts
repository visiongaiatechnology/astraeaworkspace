import { describe, expect, it } from 'vitest';
import { buildWhiteboardConnectorPaths } from '../../model/whiteboardDiagramEngine';
import {
  WHITEBOARD_EXPORT_ERRORS,
  WHITEBOARD_EXPORT_MAX_DIMENSION,
  WHITEBOARD_EXPORT_MIN_HEIGHT,
  WHITEBOARD_EXPORT_MIN_WIDTH,
  WHITEBOARD_EXPORT_PADDING,
  buildWhiteboardExportScene,
} from '../../rendering/whiteboardExportScene';
import { WHITEBOARD_MAX_ITEMS } from '../../viewport/whiteboardViewportEngine';
import type { WhiteboardItem } from '../../types';

const node = (id: string, x: number, y: number, width = 200, height = 100): WhiteboardItem => ({
  id, type: 'process', x, y, width, height, text: id,
});

describe('Whiteboard export scene', () => {
  it('reuses the routing engine geometry instead of deriving connector endpoints again', () => {
    const items: WhiteboardItem[] = [
      node('from', 0, 0),
      node('to', 400, 300),
      {
        id: 'edge', type: 'connector', x: 0, y: 0, width: 1, height: 1, text: '',
        fromId: 'from', toId: 'to', fromAnchor: 'bottom', toAnchor: 'left',
        connectorStyle: { route: 'straight', autoRoute: false },
      },
    ];
    const scene = buildWhiteboardExportScene(items);
    const canonical = buildWhiteboardConnectorPaths(items).get('edge');
    const exported = scene.connectorPaths.get('edge');
    expect(exported).toBeDefined();
    expect(exported?.path).toBe(canonical?.path);
    expect(exported?.labelX).toBe(canonical?.labelX);
    // Anchored start point: bottom-centre of `from`, which a right-edge-to-left-edge rule cannot produce.
    expect(exported?.path.startsWith('M 100 100')).toBe(true);
    expect(exported?.from).toEqual({ x: 100, y: 100, anchor: 'bottom' });
  });

  it('keeps a curved connector hull and its label box inside the export bounds', () => {
    const items: WhiteboardItem[] = [
      node('from', 0, 0, 40, 40),
      node('to', 600, 0, 40, 40),
      {
        id: 'edge', type: 'connector', x: 0, y: 0, width: 1, height: 1, text: '',
        fromId: 'from', toId: 'to', lineLabel: 'flow',
        connectorStyle: { route: 'curved', autoRoute: false },
      },
    ];
    const scene = buildWhiteboardExportScene(items);
    const path = scene.connectorPaths.get('edge');
    expect(path).toBeDefined();
    expect(scene.contentBounds.minY).toBeLessThanOrEqual(path!.bounds.minY);
    expect(scene.contentBounds.maxY).toBeGreaterThanOrEqual(path!.bounds.maxY);
    // The label rect is 64 wide, so a label near the right edge widens the bounds beyond the objects.
    expect(scene.contentBounds.maxX).toBeGreaterThanOrEqual(640);
  });

  it('resolves padding, minimum extent and offsets deterministically', () => {
    const scene = buildWhiteboardExportScene([node('only', 100, 50, 120, 80)]);
    expect(scene.offsetX).toBe(-100 + WHITEBOARD_EXPORT_PADDING);
    expect(scene.offsetY).toBe(-50 + WHITEBOARD_EXPORT_PADDING);
    expect(scene.width).toBeGreaterThanOrEqual(WHITEBOARD_EXPORT_MIN_WIDTH);
    expect(scene.height).toBeGreaterThanOrEqual(WHITEBOARD_EXPORT_MIN_HEIGHT);
    expect(scene.scale).toBeLessThanOrEqual(1);
    expect(scene.items).toHaveLength(1);
    expect(scene.byId.get('only')).toBeDefined();
  });

  it('drops hidden objects from the paint order rather than exporting them', () => {
    const scene = buildWhiteboardExportScene([node('visible', 0, 0), { ...node('hidden', 0, 0), hidden: true }]);
    expect(scene.items.map((item) => item.id)).toEqual(['visible']);
  });

  it('caps the raster scale so a maximal board stays inside the pixel budget', () => {
    const scene = buildWhiteboardExportScene([node('left', -10_000_000, -10_000_000), node('right', 10_000_000, 10_000_000)]);
    expect(scene.width * scene.scale).toBeLessThanOrEqual(WHITEBOARD_EXPORT_MAX_DIMENSION + 1);
    expect(scene.height * scene.scale).toBeLessThanOrEqual(WHITEBOARD_EXPORT_MAX_DIMENSION + 1);
  });

  it('rejects invalid input with named errors instead of exporting a partial board', () => {
    const oversized = new Array<WhiteboardItem>(WHITEBOARD_MAX_ITEMS + 1);
    expect(() => buildWhiteboardExportScene(oversized)).toThrow(WHITEBOARD_EXPORT_ERRORS.objectLimit);
    expect(() => buildWhiteboardExportScene([null as unknown as WhiteboardItem])).toThrow(WHITEBOARD_EXPORT_ERRORS.invalidObject);
    expect(() => buildWhiteboardExportScene([node('dup', 0, 0), node('dup', 10, 10)])).toThrow(WHITEBOARD_EXPORT_ERRORS.invalidIdentity);
    expect(() => buildWhiteboardExportScene([{ ...node('bad', 0, 0), width: Number.NaN }])).toThrow(WHITEBOARD_EXPORT_ERRORS.invalidGeometry);
  });
});
