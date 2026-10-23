import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWhiteboardPngDataUrl, drawCanonicalPathData, drawWhiteboardExportScene } from '../../integrations/canvasExport';
import { buildWhiteboardExportScene } from '../../rendering/whiteboardExportScene';
import { WHITEBOARD_EXPORT_MAX_DIMENSION } from '../../rendering/whiteboardExportScene';
import type { WhiteboardItem } from '../../types';
import { WHITEBOARD_MAX_ITEMS } from '../../viewport/whiteboardViewportEngine';

function createTextItem(id: string, x: number, y: number): WhiteboardItem {
  return { id, type: 'text', x, y, width: 40, height: 24, text: 'bounded export' };
}

function createCanvasHarness() {
  const mainContext = {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    ellipse: vi.fn(),
    createPattern: vi.fn(() => ({} as CanvasPattern)),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    textAlign: 'start',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    lineCap: '',
    lineJoin: '',
  } as unknown as CanvasRenderingContext2D;
  const tileContext = {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
  const mainCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => mainContext),
    toDataURL: vi.fn(() => 'data:image/png;base64,AA=='),
  };
  const gridCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => tileContext),
  };
  const canvases = [mainCanvas, gridCanvas];
  const fakeDocument = {
    createElement: vi.fn((_tagName: string) => canvases.shift() as unknown as HTMLElement),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
  } as unknown as Document;

  vi.stubGlobal('window', { document: fakeDocument });
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onerror?.());
    }
  });
  return { mainCanvas, mainContext, tileContext, fakeDocument };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Whiteboard export path rendering', () => {
  it('parses the canonical path data when the host has no Path2D', () => {
    const { mainContext } = createCanvasHarness();
    expect(drawCanonicalPathData(mainContext, 'M 10 20 L 30 40')).toBe(true);
    expect(vi.mocked(mainContext.moveTo)).toHaveBeenCalledWith(10, 20);
    expect(vi.mocked(mainContext.lineTo)).toHaveBeenCalledWith(30, 40);
    expect(vi.mocked(mainContext.stroke)).toHaveBeenCalledOnce();
  });

  it('renders routed curves and ink quadratics through the same renderer', () => {
    const { mainContext } = createCanvasHarness();
    expect(drawCanonicalPathData(mainContext, 'M 0 0 C 10 0, 20 10, 30 10')).toBe(true);
    expect(vi.mocked(mainContext.bezierCurveTo)).toHaveBeenCalledWith(10, 0, 20, 10, 30, 10);
    expect(drawCanonicalPathData(mainContext, 'M 0 0 Q 5 5 10 0 L 12 4')).toBe(true);
    expect(vi.mocked(mainContext.quadraticCurveTo)).toHaveBeenCalledWith(5, 5, 10, 0);
  });

  it('refuses to render an empty or unsupported path', () => {
    const { mainContext } = createCanvasHarness();
    expect(drawCanonicalPathData(mainContext, '')).toBe(false);
    expect(drawCanonicalPathData(mainContext, 'A 1 1 0 0 1 5 5')).toBe(false);
    expect(vi.mocked(mainContext.stroke)).not.toHaveBeenCalled();
  });
});

describe('Whiteboard PNG export bounds', () => {
  it('wraps long process labels inside their exported shape bounds', async () => {
    const { mainContext } = createCanvasHarness();
    const process: WhiteboardItem = {
      id: 'crypto-process',
      type: 'process',
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      text: 'Argon2id + AES-256 Envelope Encryption',
    };

    await buildWhiteboardPngDataUrl('Bounded labels', [process]);

    const renderedLabels = vi.mocked(mainContext.fillText).mock.calls
      .map(([text]) => String(text))
      .filter((text) => text.includes('Argon2id') || text.includes('Envelope'));
    expect(renderedLabels.join(' ')).toContain('Argon2id');
    expect(renderedLabels.join(' ')).toContain('Envelope');
    expect(renderedLabels.every((text) => text.length * 8 <= process.width)).toBe(true);
  });

  it('wraps every label-bearing object kind inside its own box', async () => {
    const { mainContext } = createCanvasHarness();
    const items: WhiteboardItem[] = [
      { id: 'sticky', type: 'sticky', x: 0, y: 0, width: 180, height: 140, text: 'A very long sticky note body that must wrap instead of being clipped', color: 'yellow' },
      { id: 'card', type: 'card', x: 300, y: 0, width: 240, height: 160, text: 'Workspace task card with a long title', card: { cardKind: 'task', title: 'Workspace task card with a long title', subtitle: 'Canonical task card subtitle' } },
      { id: 'shape', type: 'shape', x: 600, y: 0, width: 180, height: 120, text: 'Shape label', shape: { kind: 'ellipse', fill: '#0f172a', stroke: '#38bdf8', strokeWidth: 2 } },
    ];

    await buildWhiteboardPngDataUrl('Label bounds', items);

    const labels = vi.mocked(mainContext.fillText).mock.calls.map(([text]) => String(text));
    const joined = labels.join(' ');
    expect(joined).toContain('sticky note');
    expect(joined).toContain('Workspace task card');
    expect(joined).toContain('Shape label');
    for (const label of labels) expect(label.length * 8).toBeLessThanOrEqual(600);
  });

  it('draws ink through the canonical ink path data', async () => {
    const { mainContext } = createCanvasHarness();
    const ink: WhiteboardItem = {
      id: 'stroke', type: 'ink', x: 50, y: 60, width: 200, height: 100, text: '',
      ink: {
        preset: 'pen', inputType: 'pen', color: '#60a5fa', width: 3, opacity: 1,
        points: [
          { x: 0, y: 0, t: 0, pressure: 0.5, tiltX: 0, tiltY: 0 },
          { x: 20, y: 10, t: 1, pressure: 0.5, tiltX: 0, tiltY: 0 },
          { x: 40, y: 0, t: 2, pressure: 0.5, tiltX: 0, tiltY: 0 },
        ],
      },
    };

    await buildWhiteboardPngDataUrl('Ink board', [ink]);

    expect(vi.mocked(mainContext.translate)).toHaveBeenCalledWith(50 + buildWhiteboardExportScene([ink]).offsetX, 60 + buildWhiteboardExportScene([ink]).offsetY);
    expect(vi.mocked(mainContext.quadraticCurveTo)).toHaveBeenCalled();
    expect(vi.mocked(mainContext.stroke)).toHaveBeenCalled();
    expect(String(vi.mocked(mainContext.strokeStyle))).toBe('#60a5fa');
  });

  it('shows a visible placeholder when an image cannot be decoded', async () => {
    const { mainContext } = createCanvasHarness();
    const image: WhiteboardItem = { id: 'img', type: 'image', x: 0, y: 0, width: 120, height: 80, text: '', dataUrl: 'data:image/png;base64,AA==' };

    await buildWhiteboardPngDataUrl('Broken image', [image]);

    const labels = vi.mocked(mainContext.fillText).mock.calls.map(([text]) => String(text));
    expect(labels).toContain('Image decode failed');
  });

  it('limits raster work for objects spanning the maximum whiteboard coordinate range', async () => {
    const { mainCanvas, mainContext, tileContext } = createCanvasHarness();
    const items = [
      createTextItem('left', -10_000_000, -10_000_000),
      createTextItem('right', 10_000_000, 10_000_000),
    ];

    const result = await buildWhiteboardPngDataUrl('Large Board', items);

    expect(result).toBe('data:image/png;base64,AA==');
    expect(mainCanvas.width).toBeLessThanOrEqual(WHITEBOARD_EXPORT_MAX_DIMENSION);
    expect(mainCanvas.height).toBeLessThanOrEqual(WHITEBOARD_EXPORT_MAX_DIMENSION);
    expect(mainCanvas.width * mainCanvas.height).toBeLessThanOrEqual(WHITEBOARD_EXPORT_MAX_DIMENSION ** 2);
    expect(tileContext.arc).toHaveBeenCalledOnce();
    expect(mainContext.arc).not.toHaveBeenCalled();
    expect(mainContext.createPattern).toHaveBeenCalledOnce();
  });

  it('draws one canonical path per connector for a large board', async () => {
    const { mainContext } = createCanvasHarness();
    const connectorCount = 1_000;
    const items: WhiteboardItem[] = [];
    for (let index = 0; index < connectorCount; index += 1) {
      items.push(createTextItem(`from-${index}`, index * 4, 0));
      items.push(createTextItem(`to-${index}`, index * 4 + 2, 50));
    }
    for (let index = 0; index < connectorCount; index += 1) {
      items.push({
        id: `connector-${index}`,
        type: 'connector',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        text: '',
        fromId: `from-${index}`,
        toId: `to-${index}`,
        connectorStyle: { route: 'straight', autoRoute: false },
      });
    }

    await buildWhiteboardPngDataUrl('Connector Board', items);

    // Every connector is stroked from the routed path, and no connector is dropped silently.
    expect(vi.mocked(mainContext.stroke).mock.calls.length).toBeGreaterThanOrEqual(connectorCount);
    const scene = buildWhiteboardExportScene(items);
    expect(scene.connectorPaths.size).toBe(connectorCount);
    expect(vi.mocked(mainContext.moveTo).mock.calls.length).toBeGreaterThanOrEqual(connectorCount);
  });

  it('rejects an oversized board before creating a canvas', async () => {
    const { fakeDocument } = createCanvasHarness();
    const items = new Array<WhiteboardItem>(WHITEBOARD_MAX_ITEMS + 1);

    await expect(buildWhiteboardPngDataUrl('Oversized Board', items)).rejects.toThrow('Whiteboard export object limit exceeded.');
    expect(fakeDocument.createElement).not.toHaveBeenCalled();
  });

  it('draws the scene deterministically for the same input', async () => {
    const items: WhiteboardItem[] = [createTextItem('a', 0, 0), createTextItem('b', 200, 100)];
    const first = createCanvasHarness();
    await drawWhiteboardExportScene(first.mainContext, buildWhiteboardExportScene(items), 'Determinism');
    const firstCalls = vi.mocked(first.mainContext.fillText).mock.calls.map(([text]) => String(text));
    vi.unstubAllGlobals();
    const second = createCanvasHarness();
    await drawWhiteboardExportScene(second.mainContext, buildWhiteboardExportScene(items), 'Determinism');
    const secondCalls = vi.mocked(second.mainContext.fillText).mock.calls.map(([text]) => String(text));
    expect(secondCalls).toEqual(firstCalls);
  });
});
