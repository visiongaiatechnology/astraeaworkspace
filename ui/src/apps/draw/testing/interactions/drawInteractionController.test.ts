// STATUS: GOLD — end-to-end pointer/keyboard sequences against the pure Draw interaction machine.
import { describe, expect, it } from 'vitest';
import { assertDrawDocument } from '../../model/drawDocumentValidation';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import {
  NO_DRAW_MODIFIERS,
  applyDrawKeyboardInteraction,
  beginDrawPointerInteraction,
  beginDrawTextInteraction,
  createDrawInteractionStep,
  drawInteractionCursor,
  endDrawPointerInteraction,
  endDrawTextInteraction,
  isDrawInteracting,
  updateDrawPointerInteraction,
  type DrawInteractionModifiers,
} from '../../interactions/drawInteractionController';
import { buildDrawModel, overlappingModel } from './drawInteractionFixtures';

const mods = (overrides: Partial<DrawInteractionModifiers> = {}): DrawInteractionModifiers => ({
  ...NO_DRAW_MODIFIERS,
  ...overrides,
});

const key = (name: string, overrides: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: name,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...overrides,
});

describe('Draw pointer interaction machine', () => {
  it('selects the topmost object on press and never mutates the model for a click', () => {
    const model = overlappingModel();
    const down = beginDrawPointerInteraction(model, [], { point: { x: 60, y: 60 }, modifiers: mods() });
    expect(down.selectedIds).toEqual(['high']);
    expect(down.state.kind).toBe('drag');
    expect(down.model).toBe(model);
    const up = endDrawPointerInteraction(down.model, down.selectedIds, down.state, { point: { x: 60, y: 60 }, modifiers: mods() });
    expect(up.state.kind).toBe('idle');
    expect(up.selectedIds).toEqual(['high']);
    expect(up.model).toBe(model);
  });

  it('moves the selection while dragging and persists a valid document', () => {
    const model = buildDrawModel({
      viewport: { snapToGrid: false, snapToShapes: false, snapToGuides: false },
      objects: [{ id: 'a', x: 100, y: 100, width: 80, height: 40 }],
    });
    const down = beginDrawPointerInteraction(model, [], { point: { x: 140, y: 120 }, modifiers: mods() });
    expect(down.state.kind).toBe('drag');
    const moved = updateDrawPointerInteraction(model, down.selectedIds, down.state, { point: { x: 190, y: 150 }, modifiers: mods() });
    expect(moved.state.kind).toBe('drag');
    expect(moved.model.objects['a']).toMatchObject({ x: 150, y: 130 });
    assertDrawDocument(moved.model);
    const up = endDrawPointerInteraction(moved.model, moved.selectedIds, moved.state, { point: { x: 190, y: 150 }, modifiers: mods() });
    expect(up.selectedIds).toEqual(['a']);
    expect(up.state.kind).toBe('idle');
    // Releasing without further movement keeps the dragged geometry.
    expect(up.model.objects['a']).toMatchObject({ x: 150, y: 130 });
  });

  it('reports the snapping feedback as alignment guides when the drag locks onto a grid line', () => {
    const model = buildDrawModel({
      viewport: { snapToGrid: true, snapToShapes: false, snapToGuides: false, gridSize: 16, snapTolerance: 8 },
      objects: [{ id: 'a', x: 100, y: 100, width: 80, height: 40 }],
    });
    const down = beginDrawPointerInteraction(model, [], { point: { x: 140, y: 120 }, modifiers: mods() });
    const moved = updateDrawPointerInteraction(model, down.selectedIds, down.state, { point: { x: 143, y: 120 }, modifiers: mods() });
    expect(moved.model.objects['a']!.x % 16).toBe(0);
    expect(moved.guides.length).toBeGreaterThan(0);
    expect(moved.announcement).toBe('snapped');
  });

  it('builds a marquee on empty canvas, previews a count, and commits the contained selection', () => {
    const model = overlappingModel();
    // (850,650) is empty page area; the marquee then fully contains the `outside` shape only.
    const down = beginDrawPointerInteraction(model, [], { point: { x: 850, y: 650 }, modifiers: mods() });
    expect(down.state.kind).toBe('marquee');
    expect(down.selectedIds).toEqual([]);
    const dragged = updateDrawPointerInteraction(model, down.selectedIds, down.state, { point: { x: 1000, y: 780 }, modifiers: mods() });
    expect(dragged.marqueeRect).toEqual({ x: 850, y: 650, width: 150, height: 130 });
    expect(dragged.marqueeCount).toBe(1);
    const up = endDrawPointerInteraction(model, dragged.selectedIds, dragged.state, { point: { x: 1000, y: 780 }, modifiers: mods() });
    expect(up.selectedIds).toEqual(['outside']);
  });

  it('adds marquee hits to the existing selection with shift held', () => {
    const model = overlappingModel();
    const down = beginDrawPointerInteraction(model, ['low'], { point: { x: 850, y: 650 }, modifiers: mods({ shift: true }) });
    expect(down.selectedIds).toEqual(['low']);
    const up = endDrawPointerInteraction(model, down.selectedIds, down.state, { point: { x: 1000, y: 780 }, modifiers: mods({ shift: true }) });
    expect([...up.selectedIds].sort()).toEqual(['low', 'outside']);
  });

  it('toggles a shape out of the selection with shift-click', () => {
    const model = overlappingModel();
    const first = beginDrawPointerInteraction(model, [], { point: { x: 60, y: 60 }, modifiers: mods() });
    const second = beginDrawPointerInteraction(model, first.selectedIds, { point: { x: 10, y: 10 }, modifiers: mods({ shift: true }) });
    expect([...second.selectedIds].sort()).toEqual(['high', 'low']);
    const third = beginDrawPointerInteraction(model, second.selectedIds, { point: { x: 10, y: 10 }, modifiers: mods({ shift: true }) });
    expect(third.selectedIds).toEqual(['high']);
  });

  it('starts a resize from a grip and a rotation from the rotate grip', () => {
    const model = buildDrawModel({
      viewport: { snapToGrid: false, snapToShapes: false, snapToGuides: false },
      objects: [{ id: 'a', x: 100, y: 100, width: 80, height: 40 }],
    });
    const resize = beginDrawPointerInteraction(model, ['a'], { point: { x: 180, y: 140 }, modifiers: mods() });
    expect(resize.state).toMatchObject({ kind: 'resize', handle: 'se', objectId: 'a' });
    const resized = updateDrawPointerInteraction(model, resize.selectedIds, resize.state, { point: { x: 260, y: 220 }, modifiers: mods() });
    expect(resized.model.objects['a']).toMatchObject({ width: 160, height: 120 });
    assertDrawDocument(resized.model);

    const rotate = beginDrawPointerInteraction(model, ['a'], { point: { x: 140, y: 76 }, modifiers: mods() });
    expect(rotate.state).toMatchObject({ kind: 'rotate', objectId: 'a' });
    const rotated = updateDrawPointerInteraction(model, rotate.selectedIds, rotate.state, { point: { x: 300, y: 120 }, modifiers: mods() });
    expect(rotated.model.objects['a']!.rotation).toBeCloseTo(90, 4);
    assertDrawDocument(rotated.model);
  });

  it('rotates from the body when alt is held and honours the 15-degree snap with shift', () => {
    const model = buildDrawModel({ objects: [{ id: 'a', x: 100, y: 100, width: 80, height: 40 }] });
    const down = beginDrawPointerInteraction(model, ['a'], { point: { x: 140, y: 120 }, modifiers: mods({ alt: true }) });
    expect(down.state.kind).toBe('rotate');
    const rotated = updateDrawPointerInteraction(model, down.selectedIds, down.state, {
      point: { x: 240, y: 130 },
      modifiers: mods({ alt: true, shift: true }),
    });
    expect(rotated.model.objects['a']!.rotation % 15).toBe(0);
  });

  it('reports hover without touching the model', () => {
    const model = overlappingModel();
    const idle = createDrawInteractionStep(model, []);
    const hover = updateDrawPointerInteraction(model, [], idle.state, { point: { x: 60, y: 60 }, modifiers: mods() });
    expect(hover.hoverId).toBe('high');
    expect(hover.model).toBe(model);
    const offCanvas = updateDrawPointerInteraction(model, [], idle.state, { point: { x: 1000, y: 100 }, modifiers: mods() });
    expect(offCanvas.hoverId).toBeNull();
  });

  it('describes the cursor and interaction flags for the surface', () => {
    expect(drawInteractionCursor({ kind: 'idle' })).toBe('default');
    expect(drawInteractionCursor({ kind: 'drag', origin: { x: 0, y: 0 }, current: { x: 0, y: 0 }, ids: [], startedAt: 0, moved: false })).toBe('grabbing');
    expect(drawInteractionCursor({ kind: 'marquee', origin: { x: 0, y: 0 }, current: { x: 0, y: 0 }, additive: false, baseSelection: [] })).toBe('crosshair');
    expect(drawInteractionCursor({ kind: 'text', objectId: 'a' })).toBe('text');
    expect(isDrawInteracting({ kind: 'drag', origin: { x: 0, y: 0 }, current: { x: 0, y: 0 }, ids: [], startedAt: 0, moved: false })).toBe(true);
    expect(isDrawInteracting({ kind: 'text', objectId: 'a' })).toBe(false);
    expect(isDrawInteracting({ kind: 'idle' })).toBe(false);
  });
});

describe('Draw keyboard interaction machine', () => {
  it('cycles the selection with Tab and moves it with the arrow keys', () => {
    const model = overlappingModel();
    const next = applyDrawKeyboardInteraction(model, [], { kind: 'idle' }, key('Tab'));
    expect(next?.selectedIds).toEqual(['high']);
    const previous = applyDrawKeyboardInteraction(model, next!.selectedIds, next!.state, key('Tab', { shiftKey: true }));
    expect(previous?.selectedIds).toEqual(['low']);
    // Snapping is on in this fixture, so the arrow step equals the 16-unit grid size.
    const moved = applyDrawKeyboardInteraction(model, ['high'], { kind: 'idle' }, key('ArrowRight'));
    expect(moved?.model.objects['high']!.x).toBe(66);
    expect(moved?.announcement).toBe('moving');
    const movedBack = applyDrawKeyboardInteraction(model, ['high'], { kind: 'idle' }, key('ArrowLeft'));
    expect(movedBack?.model.objects['high']!.x).toBe(34);
    const bigStep = applyDrawKeyboardInteraction(model, ['high'], { kind: 'idle' }, key('ArrowDown', { shiftKey: true }));
    expect(bigStep?.model.objects['high']!.y).toBe(50 + 160);
  });

  it('deletes, groups, ungroups and restacks from the keyboard', () => {
    const model = overlappingModel();
    const deleted = applyDrawKeyboardInteraction(model, ['high'], { kind: 'idle' }, key('Delete'));
    expect(deleted?.model.objects['high']).toBeUndefined();
    expect(deleted?.selectedIds).toEqual([]);
    expect(deleted?.announcement).toBe('deleted');

    const grouped = applyDrawKeyboardInteraction(model, ['high', 'low'], { kind: 'idle' }, key('g', { ctrlKey: true }));
    const groupId = grouped!.selectedIds[0]!;
    expect(grouped!.model.objects[groupId]!.type).toBe('group');
    expect(grouped!.model.objects[groupId]!.childIds?.sort()).toEqual(['high', 'low']);
    assertDrawDocument(grouped!.model);

    const ungrouped = applyDrawKeyboardInteraction(grouped!.model, [groupId], { kind: 'idle' }, key('g', { ctrlKey: true, shiftKey: true }));
    expect(ungrouped!.model.objects[groupId]).toBeUndefined();
    expect([...ungrouped!.selectedIds].sort()).toEqual(['high', 'low']);
    assertDrawDocument(ungrouped!.model);

    const front = applyDrawKeyboardInteraction(model, ['low'], { kind: 'idle' }, key(']', { ctrlKey: true, shiftKey: true }));
    expect(front?.model.objects['low']!.zIndex).toBeGreaterThan(front!.model.objects['high']!.zIndex);
  });

  it('selects everything visible and clears on Escape', () => {
    const model = overlappingModel();
    const all = applyDrawKeyboardInteraction(model, [], { kind: 'idle' }, key('a', { ctrlKey: true }));
    const scene = projectDrawScene(model, 'page-1');
    expect([...all!.selectedIds].sort()).toEqual(scene.entries.filter((entry) => entry.visible).map((entry) => entry.object.id).sort());
    const cleared = applyDrawKeyboardInteraction(model, all!.selectedIds, { kind: 'idle' }, key('Escape'));
    expect(cleared?.selectedIds).toEqual([]);
  });

  it('enters and leaves direct text editing with F2 and Escape', () => {
    const model = overlappingModel();
    const editing = applyDrawKeyboardInteraction(model, ['high'], { kind: 'idle' }, key('F2'));
    expect(editing?.state).toEqual({ kind: 'text', objectId: 'high' });
    const arrowWhileEditing = applyDrawKeyboardInteraction(model, ['high'], editing!.state, key('ArrowRight'));
    expect(arrowWhileEditing).toEqual(null);
    const cancelled = applyDrawKeyboardInteraction(model, ['high'], editing!.state, key('Escape'));
    expect(cancelled?.state.kind).toBe('idle');
    expect(beginDrawTextInteraction(model, [], 'high').state).toEqual({ kind: 'text', objectId: 'high' });
    expect(() => beginDrawTextInteraction(model, [], 'ghost')).toThrowError();
    expect(endDrawTextInteraction(model, ['high']).state.kind).toBe('idle');
  });

  it('toggles grid snapping from the keyboard and returns null for keys it does not own', () => {
    const model = overlappingModel();
    const off = applyDrawKeyboardInteraction(model, [], { kind: 'idle' }, key('S', { ctrlKey: true, shiftKey: true }));
    expect(off?.model.viewport.snapToGrid).toBe(!model.viewport.snapToGrid);
    expect(off?.announcement).toBe(model.viewport.snapToGrid ? 'snap-off' : 'snap-on');
    expect(applyDrawKeyboardInteraction(model, [], { kind: 'idle' }, key('Enter'))).toBeNull();
    expect(applyDrawKeyboardInteraction(model, [], { kind: 'idle' }, key('z', { ctrlKey: true }))).toBeNull();
  });

  it('does nothing harmful when movement or deletion is requested with an empty selection', () => {
    const model = overlappingModel();
    const moved = applyDrawKeyboardInteraction(model, [], { kind: 'idle' }, key('ArrowRight'));
    expect(moved?.model).toBe(model);
    const deleted = applyDrawKeyboardInteraction(model, [], { kind: 'idle' }, key('Delete'));
    expect(deleted?.model).toBe(model);
  });

  it('refuses to move a locked object through the keyboard and keeps the error typed', () => {
    const model = buildDrawModel({
      layers: [{ id: 'layer-main' }, { id: 'layer-locked', locked: true }],
      objects: [{ id: 'pinned', layerId: 'layer-locked', x: 0, y: 0, width: 10, height: 10 }],
    });
    expect(() => applyDrawKeyboardInteraction(model, ['pinned'], { kind: 'idle' }, key('ArrowRight'))).toThrowError(/object-locked/u);
  });
});
