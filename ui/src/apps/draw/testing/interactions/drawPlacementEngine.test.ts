// STATUS: GOLD — Draw placement maths + fail-closed drop targets (packages 01/02 acceptance path).
import { describe, expect, it } from 'vitest';
import {
  DRAW_STENCIL_MIME, clampDrawPlacement, clientToPagePoint, dropDrawStencil, isDrawDragGesture,
  pageToClientPoint, readDrawStencilDragPayload, resolveDrawPlacement,
} from '../../interactions/drawPlacementEngine';
import { findDrawStencil } from '../../interactions/drawStencilCatalog';
import { buildDrawModel } from './drawInteractionFixtures';

const transform = { rect: { left: 100, top: 50, width: 561, height: 396.5 }, pageWidth: 1122, pageHeight: 793 };

describe('Draw placement — viewport translation', () => {
  it('maps client pixels onto page units for a half-scale canvas', () => {
    expect(clientToPagePoint({ clientX: 100, clientY: 50 }, transform)).toEqual({ x: 0, y: 0 });
    expect(clientToPagePoint({ clientX: 661, clientY: 446.5 }, transform)).toEqual({ x: 1122, y: 793 });
    const mid = clientToPagePoint({ clientX: 380.5, clientY: 248.25 }, transform);
    expect(mid.x).toBeCloseTo(561, 6);
    expect(mid.y).toBeCloseTo(396.5, 6);
  });

  it('round-trips a page point through client space', () => {
    const point = { x: 321.5, y: 123.25 };
    const client = pageToClientPoint(point, transform);
    expect(clientToPagePoint({ clientX: client.x, clientY: client.y }, transform).x).toBeCloseTo(point.x, 6);
  });

  it('rejects a degenerate viewport instead of dividing by zero', () => {
    expect(() => clientToPagePoint({ clientX: 1, clientY: 1 }, { ...transform, rect: { left: 0, top: 0, width: 0, height: 0 } }))
      .toThrowError(/viewport-rect-invalid/);
    expect(() => pageToClientPoint({ x: 1, y: 1 }, { ...transform, pageWidth: 0 })).toThrowError(/viewport-page-invalid/);
  });

  it('separates a click from a drag by the pointer travel threshold', () => {
    expect(isDrawDragGesture({ clientX: 0, clientY: 0 }, { clientX: 1, clientY: 1 })).toBe(false);
    expect(isDrawDragGesture({ clientX: 0, clientY: 0 }, { clientX: 4, clientY: 0 })).toBe(true);
    expect(() => isDrawDragGesture({ clientX: 0, clientY: 0 }, { clientX: 0, clientY: 0 }, -1)).toThrowError(/drag-threshold-invalid/);
  });
});

describe('Draw placement — drop target', () => {
  it('centres the stencil on the drop point and clamps it into the page', () => {
    const model = buildDrawModel({});
    const stencil = findDrawStencil(model, 'draw-core-shapes:process');
    const placement = resolveDrawPlacement(model, { x: 400, y: 300 }, stencil);
    expect(placement.layerId).toBe('layer-main');
    expect(placement.position).toEqual({ x: 400 - stencil.objectTemplate.width / 2, y: 300 - stencil.objectTemplate.height / 2 });
    // A drop far outside the page is clamped, never placed at an unreachable coordinate.
    const clamped = clampDrawPlacement({ x: 99999, y: 99999 }, { width: 160, height: 80 }, { width: 1122, height: 793 });
    expect(clamped).toEqual({ x: 962, y: 713 });
    expect(clampDrawPlacement({ x: -500, y: -500 }, { width: 160, height: 80 }, { width: 1122, height: 793 })).toEqual({ x: 0, y: 0 });
  });

  it('fails closed for a missing page, a foreign layer and a locked layer', () => {
    const model = buildDrawModel({ layers: [{ id: 'layer-main' }, { id: 'layer-locked', locked: true }] });
    const stencil = findDrawStencil(model, 'draw-core-shapes:process');
    expect(() => resolveDrawPlacement(model, { x: 10, y: 10 }, stencil, { pageId: 'page-nope' })).toThrowError(/page-missing/);
    expect(() => resolveDrawPlacement(model, { x: 10, y: 10 }, stencil, { layerId: 'layer-nope' })).toThrowError(/object-layer-missing/);
    expect(() => resolveDrawPlacement(model, { x: 10, y: 10 }, stencil, { layerId: 'layer-locked' })).toThrowError(/layer-locked/);
  });

  it('inserts the stencil through the canonical shape factory and reports its id', () => {
    const model = buildDrawModel({});
    const result = dropDrawStencil(model, 'draw-core-shapes:decision', { x: 300, y: 200 }, { idSeed: 'drop1' });
    const object = result.model.objects[result.objectId]!;
    expect(object.type).toBe('shape');
    expect(object.vector?.kind).toBe('polygon');
    expect(object.width).toBe(140);
    expect(object.height).toBe(96);
    expect(result.model.pages[0]!.objectIds).toContain(result.objectId);
  });

  it('reads only its own drag payload', () => {
    const store = new Map<string, string>([[DRAW_STENCIL_MIME, 'draw-core-shapes:rect']]);
    expect(readDrawStencilDragPayload((mime) => store.get(mime) ?? '', [DRAW_STENCIL_MIME])).toBe('draw-core-shapes:rect');
    expect(readDrawStencilDragPayload(() => 'x', ['text/plain'])).toBeNull();
    expect(readDrawStencilDragPayload(() => '', [DRAW_STENCIL_MIME])).toBeNull();
  });
});
