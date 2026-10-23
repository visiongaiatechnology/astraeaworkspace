// STATUS: GOLD — Draw session state machine: commit contract, gesture geometry, keyboard coverage.
import { describe, expect, it } from 'vitest';
import {
  NO_DRAW_MODIFIERS,
  type DrawInteractionModifiers,
} from '../../interactions/drawInteractionController';
import {
  createDrawCanvasSession,
  drawSessionCommand,
  drawSessionDoubleClick,
  drawSessionEndText,
  drawSessionKeyDown,
  drawSessionPointerCancel,
  drawSessionPointerDown,
  drawSessionPointerMove,
  drawSessionPointerUp,
  drawSessionSetText,
  type DrawCanvasSessionState,
} from '../../interactions/drawCanvasSession';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import { buildDrawModel, overlappingModel } from './drawInteractionFixtures';
import { drawObjectPlainText } from '../../interactions/drawTextLayout';
import { createDrawConnector } from '../../interactions/drawConnectorEngine';
import { instantiateDrawTemplate } from '../../model/drawTemplateEngine';

const shift: DrawInteractionModifiers = { ...NO_DRAW_MODIFIERS, shift: true };
const alt: DrawInteractionModifiers = { ...NO_DRAW_MODIFIERS, alt: true };
const key = (overrides: Partial<{ key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }>) => ({
  key: ' ', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...overrides,
});
const point = (x: number, y: number) => ({ x, y });

function objectAt(state: DrawCanvasSessionState, id: string) {
  const object = state.model.objects[id];
  if (!object) throw new Error(`missing object ${id}`);
  return object;
}

describe('Draw canvas session — gesture commit contract', () => {
  it('commits a drag live and exactly once as history on release', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60 }] });
    const session = createDrawCanvasSession(base);
    const down = drawSessionPointerDown(session, { point: point(10, 10), modifiers: NO_DRAW_MODIFIERS });
    expect(down.commit).toBe('none');
    expect(down.state.interaction.kind).toBe('drag');
    expect(down.state.selectedIds).toEqual(['a']);

    const move = drawSessionPointerMove(down.state, { point: point(110, 90), modifiers: NO_DRAW_MODIFIERS });
    expect(move.commit).toBe('live');

    // The controller resolves absolute geometry from the pointer-down origin, so a second move must
    // recompute from the same base and not accumulate on top of the first move.
    const move2 = drawSessionPointerMove(move.state, { point: point(130, 50), modifiers: NO_DRAW_MODIFIERS });
    expect(move2.commit).toBe('live');
    const moved = objectAt(move2.state, 'a');
    expect(moved.x).toBe(120);
    expect(moved.y).toBe(40);

    const up = drawSessionPointerUp(move2.state, { point: point(130, 50), modifiers: NO_DRAW_MODIFIERS });
    expect(up.commit).toBe('history');
    expect(up.state.gestureBase).toBeNull();
    expect(up.state.interaction.kind).toBe('idle');
    // Selection survives the gesture.
    expect(up.state.selectedIds).toEqual(['a']);
  });

  it('does not open a history entry for a click without movement', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60 }] });
    const session = createDrawCanvasSession(base);
    const down = drawSessionPointerDown(session, { point: point(10, 10), modifiers: NO_DRAW_MODIFIERS });
    const up = drawSessionPointerUp(down.state, { point: point(10, 10), modifiers: NO_DRAW_MODIFIERS });
    expect(up.commit).toBe('none');
    expect(up.state.model).toBe(down.state.model);
  });

  it('rolls a cancelled drag back to the pre-gesture model', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60 }] });
    const session = createDrawCanvasSession(base);
    const down = drawSessionPointerDown(session, { point: point(10, 10), modifiers: NO_DRAW_MODIFIERS });
    const move = drawSessionPointerMove(down.state, { point: point(210, 10), modifiers: NO_DRAW_MODIFIERS });
    expect(objectAt(move.state, 'a').x).toBe(200);
    const cancel = drawSessionPointerCancel(move.state);
    expect(cancel.commit).toBe('live');
    expect(objectAt(cancel.state, 'a').x).toBe(0);
    expect(cancel.state.gestureBase).toBeNull();
  });

  it('resolves a lock/resize gesture from the eight grips and keeps the opposite grip fixed', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 100, y: 100, width: 200, height: 100 }] });
    const session = createDrawCanvasSession(base, ['a']);
    // The south-east grip sits at (300, 200); dragging it to (400, 300) grows the box by 100/100.
    const down = drawSessionPointerDown(session, { point: point(300, 200), modifiers: NO_DRAW_MODIFIERS });
    expect(down.state.interaction.kind).toBe('resize');
    const move = drawSessionPointerMove(down.state, { point: point(400, 300), modifiers: NO_DRAW_MODIFIERS });
    expect(move.commit).toBe('live');
    const resized = objectAt(move.state, 'a');
    expect(resized.x).toBe(100);
    expect(resized.y).toBe(100);
    expect(resized.width).toBe(300);
    expect(resized.height).toBe(200);
    expect(drawSessionPointerUp(move.state, { point: point(400, 300), modifiers: NO_DRAW_MODIFIERS }).commit).toBe('history');
  });

  it('keeps the aspect ratio while SHIFT resizes and rotates with ALT', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 200, height: 100 }] });
    const session = createDrawCanvasSession(base, ['a']);
    const down = drawSessionPointerDown(session, { point: point(200, 100), modifiers: shift });
    expect(down.state.interaction.kind).toBe('resize');
    const move = drawSessionPointerMove(down.state, { point: point(400, 120), modifiers: shift });
    const resized = objectAt(move.state, 'a');
    expect(resized.width / resized.height).toBeCloseTo(2, 5);

    const rotateDown = drawSessionPointerDown(createDrawCanvasSession(base, ['a']), { point: point(100, 50), modifiers: alt });
    expect(rotateDown.state.interaction.kind).toBe('rotate');
    const rotated = drawSessionPointerMove(rotateDown.state, { point: point(300, 50), modifiers: alt });
    expect(rotated.commit).toBe('live');
    expect(objectAt(rotated.state, 'a').rotation).toBeGreaterThan(0);
  });

  it('commits a marquee selection without touching the document', () => {
    const session = createDrawCanvasSession(overlappingModel());
    const down = drawSessionPointerDown(session, { point: point(-20, -20), modifiers: NO_DRAW_MODIFIERS });
    expect(down.state.interaction.kind).toBe('marquee');
    const move = drawSessionPointerMove(down.state, { point: point(320, 320), modifiers: NO_DRAW_MODIFIERS });
    expect(move.commit).toBe('none');
    expect(move.state.marqueeRect).toEqual({ x: -20, y: -20, width: 340, height: 340 });
    const up = drawSessionPointerUp(move.state, { point: point(320, 320), modifiers: NO_DRAW_MODIFIERS });
    expect(up.commit).toBe('none');
    // Hidden-layer and locked-layer objects are excluded; the two visible shapes are selected.
    expect(new Set(up.state.selectedIds)).toEqual(new Set(['low', 'high']));
  });

  it('never selects an object on a locked layer or a locked object', () => {
    const session = createDrawCanvasSession(overlappingModel());
    const down = drawSessionPointerDown(session, { point: point(80, 80), modifiers: NO_DRAW_MODIFIERS });
    // (80,80) is inside `high`, `locked-shape` and `hidden-shape`; only `high` is selectable.
    expect(down.state.selectedIds).toEqual(['high']);
  });
});

describe('Draw canvas session — keyboard coverage', () => {
  const base = () => buildDrawModel({
    objects: [
      { id: 'a', x: 0, y: 0, width: 100, height: 60 },
      { id: 'b', x: 300, y: 0, width: 100, height: 60 },
    ],
  });

  it('selects next and previous with Tab and Shift+Tab', () => {
    const session = createDrawCanvasSession(base());
    const first = drawSessionKeyDown(session, key({ key: 'Tab' }));
    expect(first?.commit).toBe('none');
    expect(first?.state.selectedIds).toEqual(['b']);
    const second = drawSessionKeyDown(first!.state, key({ key: 'Tab', shiftKey: true }));
    expect(second?.state.selectedIds).toEqual(['a']);
  });

  it('moves the selection by one grid step per arrow key', () => {
    const session = createDrawCanvasSession(base(), ['a']);
    const step = drawSessionKeyDown(session, key({ key: 'ArrowRight' }));
    expect(step?.commit).toBe('history');
    // gridSize is 16 in the canonical default viewport; a naive 1px nudge fails here.
    expect(objectAt(step!.state, 'a').x).toBe(16);
    const shifted = drawSessionKeyDown(step!.state, key({ key: 'ArrowDown', shiftKey: true }));
    expect(objectAt(shifted!.state, 'a').y).toBe(160);
  });

  it('deletes, groups, ungroups and reorders through the keyboard', () => {
    const session = createDrawCanvasSession(base());
    const all = drawSessionKeyDown(session, key({ key: 'a', ctrlKey: true }));
    expect(all?.state.selectedIds.length).toBe(2);

    const grouped = drawSessionKeyDown(all!.state, key({ key: 'g', ctrlKey: true }));
    expect(grouped?.commit).toBe('history');
    const groupedScene = projectDrawScene(grouped!.state.model);
    const group = groupedScene.entries.find((entry) => entry.object.type === 'group');
    expect(group).toBeDefined();
    expect(grouped!.state.selectedIds).toEqual([group!.object.id]);

    const ungrouped = drawSessionKeyDown(grouped!.state, key({ key: 'g', ctrlKey: true, shiftKey: true }));
    expect(ungrouped?.commit).toBe('history');
    expect(projectDrawScene(ungrouped!.state.model).entries.some((entry) => entry.object.type === 'group')).toBe(false);

    const forward = drawSessionKeyDown(ungrouped!.state, key({ key: ']', ctrlKey: true }));
    expect(forward?.commit).toBe('history');

    const cleared = drawSessionKeyDown(forward!.state, key({ key: 'Escape' }));
    expect(cleared?.state.selectedIds).toEqual([]);
    const deleted = drawSessionKeyDown(cleared!.state, key({ key: 'Delete' }));
    expect(deleted?.commit).toBe('none');

    const deletedOne = drawSessionKeyDown(createDrawCanvasSession(base(), ['a']), key({ key: 'Delete' }));
    expect(deletedOne?.commit).toBe('history');
    expect(deletedOne!.state.model.objects.a).toBeUndefined();
  });

  it('toggles snapping with Ctrl+Shift+S and returns null for foreign keys', () => {
    const session = createDrawCanvasSession(base());
    expect(drawSessionKeyDown(session, key({ key: 'q' }))).toBeNull();
    const toggled = drawSessionKeyDown(session, key({ key: 's', ctrlKey: true, shiftKey: true }));
    expect(toggled?.commit).toBe('history');
    expect(toggled?.state.model.viewport.snapToGrid).toBe(false);
  });

  it('enters text editing with F2 without touching the document', () => {
    const session = createDrawCanvasSession(base(), ['a']);
    const editing = drawSessionKeyDown(session, key({ key: 'F2' }));
    expect(editing?.commit).toBe('none');
    expect(editing?.state.interaction.kind).toBe('text');
    expect(editing?.state.gestureBase).not.toBeNull();
  });
});

describe('Draw canvas session — direct text editing', () => {
  it('writes live while typing and closes with one history commit', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 200, height: 100, text: 'before' }] });
    const session = createDrawCanvasSession(base);
    const opened = drawSessionDoubleClick(session, point(50, 50));
    expect(opened.commit).toBe('none');
    expect(opened.state.interaction).toEqual({ kind: 'text', objectId: 'a' });
    expect(opened.state.selectedIds).toEqual(['a']);

    const typed = drawSessionSetText(opened.state, 'Wrapped label text');
    expect(typed.commit).toBe('live');
    expect(drawObjectPlainText(objectAt(typed.state, 'a'))).toBe('Wrapped label text');

    const closed = drawSessionEndText(typed.state);
    expect(closed.commit).toBe('history');
    expect(closed.state.interaction.kind).toBe('idle');
    expect(closed.state.gestureBase).toBeNull();
  });

  it('ignores a double click that hits nothing', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 10, height: 10 }] });
    const opened = drawSessionDoubleClick(createDrawCanvasSession(base), point(900, 900));
    expect(opened.state.interaction.kind).toBe('idle');
    expect(opened.commit).toBe('none');
  });
});

describe('Draw canvas session — panel commands', () => {
  it('inserts a stencil inside the page and selects it', () => {    const base = buildDrawModel({});
    const step = drawSessionCommand(createDrawCanvasSession(base), {
      kind: 'insert-stencil', stencilId: 'draw-core-shapes:process', point: point(5000, 5000),
    });
    expect(step.commit).toBe('history');
    expect(step.state.selectedIds.length).toBe(1);
    const created = objectAt(step.state, step.state.selectedIds[0]!);
    expect(created.x + created.width).toBeLessThanOrEqual(1122);
    expect(created.y + created.height).toBeLessThanOrEqual(793);
  });

  it('adopts the new object into a container it was dropped onto', () => {
    const base = buildDrawModel({
      objects: [
        { id: 'g1', type: 'group', x: 100, y: 100, width: 400, height: 300, childIds: [] },
      ],
    });
    const step = drawSessionCommand(createDrawCanvasSession(base), {
      kind: 'insert-stencil', stencilId: 'draw-core-shapes:process', point: { x: 250, y: 220 },
    });
    expect(step.commit).toBe('history');
    const created = step.state.selectedIds[0]!;
    expect(step.state.model.objects[created]?.parentGroupId).toBe('g1');
    expect(step.state.model.objects.g1?.childIds).toContain(created);
    // A drop outside every container stays at page level.
    const outside = drawSessionCommand(createDrawCanvasSession(base), {
      kind: 'insert-stencil', stencilId: 'draw-core-shapes:process', point: { x: 900, y: 700 },
    });
    expect(outside.state.model.objects[outside.state.selectedIds[0]!]?.parentGroupId).toBeUndefined();
  });

  it('fails closed when the target layer is locked', () => {
    const base = buildDrawModel({ layers: [{ id: 'layer-main' }, { id: 'layer-locked', locked: true }] });
    expect(() => drawSessionCommand(createDrawCanvasSession(base), {
      kind: 'insert-stencil', stencilId: 'draw-core-shapes:process', point: point(100, 100), layerId: 'layer-locked',
    })).toThrowError(/layer-locked/);
  });

  it('connects two shapes, moves them to a layer and keeps the link stable', () => {
    const base = buildDrawModel({
      layers: [{ id: 'layer-main' }, { id: 'layer-other' }],
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 300, y: 0, width: 100, height: 60 },
      ],
    });
    let session = drawSessionCommand(createDrawCanvasSession(base), { kind: 'select', ids: ['a', 'b'] });
    const connected = drawSessionCommand(session.state, { kind: 'connect' });
    expect(connected.commit).toBe('history');
    const connectorId = connected.state.selectedIds[0]!;
    expect(connected.state.model.objects[connectorId]?.type).toBe('connector');

    session = drawSessionCommand(connected.state, { kind: 'select', ids: ['a'] });
    const movedLayer = drawSessionCommand(session.state, { kind: 'move-to-layer', layerId: 'layer-other' });
    expect(movedLayer.state.model.objects.a?.layerId).toBe('layer-other');
    expect(movedLayer.state.model.objects[connectorId]?.connector?.from.objectId).toBe('a');
  });

  it('locks and unlocks the selection and clears it when it becomes unwritable', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60 }] });
    const locked = drawSessionCommand(createDrawCanvasSession(base, ['a']), { kind: 'set-locked', locked: true });
    expect(locked.commit).toBe('history');
    expect(locked.state.model.objects.a?.locked).toBe(true);
    expect(locked.state.selectedIds).toEqual([]);
    const unlocked = drawSessionCommand({ ...locked.state, selectedIds: ['a'] }, { kind: 'set-locked', locked: false });
    expect(unlocked.state.model.objects.a?.locked).toBe(false);
  });

  it('rejects a style write on a locked object instead of silently ignoring it', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60, locked: true }] });
    expect(() => drawSessionCommand(createDrawCanvasSession(base, ['a']), {
      kind: 'style', patch: { fill: '#ef4444' },
    })).toThrowError(/object-locked/);
  });

  it('applies typography and shadow through the canonical writers', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 200, height: 100, text: 'x' }] });
    const typography = drawSessionCommand(createDrawCanvasSession(base, ['a']), {
      kind: 'typography', patch: { bold: true, fontSize: 24 },
    });
    expect(typography.state.model.objects.a?.richText?.runs[0]?.bold).toBe(true);
    expect(typography.state.model.objects.a?.richText?.runs[0]?.fontSize).toBe(24);

    const shadowed = drawSessionCommand(typography.state, {
      kind: 'shadow', shadow: { x: 2, y: 2, blur: 4, color: '#000000', opacity: 0.5 },
    });
    expect(shadowed.state.model.objects.a?.vector?.style.shadow?.blur).toBe(4);
    const cleared = drawSessionCommand(shadowed.state, { kind: 'shadow', shadow: undefined });
    expect(cleared.state.model.objects.a?.vector?.style.shadow).toBeUndefined();
  });

  it('applies a vector style patch through the canonical style writer', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60 }] });
    const styled = drawSessionCommand(createDrawCanvasSession(base, ['a']), {
      kind: 'style', patch: { strokeWidth: 6 },
    });
    expect(styled.commit).toBe('history');
    expect(styled.state.model.objects.a?.vector?.style.strokeWidth).toBe(6);
  });
});

describe('Draw canvas session — guides', () => {
  it('adds, moves and removes a guide through the canonical guide writer', () => {
    const base = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60 }] });
    const added = drawSessionCommand(createDrawCanvasSession(base), { kind: 'guide-add', axis: 'x', position: 300 });
    expect(added.commit).toBe('history');
    expect(added.state.model.viewport.guides.length).toBe(1);
    const guide = added.state.model.viewport.guides[0]!;
    expect(guide.axis).toBe('x');
    expect(guide.position).toBe(300);

    const moved = drawSessionCommand(added.state, { kind: 'guide-move', guideId: guide.id, position: 420 });
    expect(moved.state.model.viewport.guides[0]?.position).toBe(420);

    const removed = drawSessionCommand(moved.state, { kind: 'guide-remove', guideId: guide.id });
    expect(removed.state.model.viewport.guides).toEqual([]);
  });

  it('snaps a dragged object to a guide instead of the grid', () => {
    const base = buildDrawModel({
      objects: [{ id: 'a', x: 100, y: 100, width: 100, height: 60 }],
      guides: [{ id: 'guide-x-1', axis: 'x', position: 137 }],
      viewport: { snapToGrid: false, snapToShapes: false, snapToGuides: true },
    });
    const session = createDrawCanvasSession(base, ['a']);
    const down = drawSessionPointerDown(session, { point: point(150, 130), modifiers: NO_DRAW_MODIFIERS });
    // The pointer asks for +40 (→ 140), but the guide at 137 wins, so the accepted delta differs and the
    // session must report the snap. (Engineering the numbers so the guide equals the requested delta
    // would make `snapped` correctly false — measured while writing this test.)
    const moved = drawSessionPointerMove(down.state, { point: point(190, 130), modifiers: NO_DRAW_MODIFIERS });
    expect(moved.state.model.objects.a?.x).toBe(137);
    expect(moved.state.announcement).toBe('snapped');
    expect(moved.state.guides.some((guide) => guide.axis === 'x' && guide.position === 137)).toBe(true);
  });

  it('fails closed for an unknown guide id and an invalid axis', () => {
    const base = buildDrawModel({});
    expect(() => drawSessionCommand(createDrawCanvasSession(base), { kind: 'guide-remove', guideId: 'nope' }))
      .toThrowError(/guide-missing/);
    expect(() => drawSessionCommand(createDrawCanvasSession(base), { kind: 'guide-add', axis: 'z' as 'x', position: 10 }))
      .toThrowError(/guide-axis-invalid/);
  });
});

describe('Draw canvas session — swimlane acceptance', () => {
  it('moves a lane together with its nodes and keeps the connectors attached', () => {
    // The cross-functional swimlane template now creates real lane containers (see drawTemplateEngine).
    const base = instantiateDrawTemplate(
      buildDrawModel({}),
      'swimlane-cross-functional',
      'page-1',
      'layer-main',
      'sw',
    );
    // Connect the two steps, then move Lane A: the node inside it must travel with the lane.
    const withConnector = createDrawConnector(base, 'sw-p1', 'sw-p2', { idSeed: 'laneLink' });
    const lane = withConnector.objects['sw-lane1']!;
    const member = withConnector.objects['sw-p1']!;
    expect(lane.type).toBe('group');
    expect(member.parentGroupId).toBe('sw-lane1');

    const session = createDrawCanvasSession(withConnector, ['sw-lane1']);
    // Press on a *member*: the container is reached through its children (a group has no painted body),
    // and the resolved selection root plus descendant expansion must move lane and node together.
    const grab = { x: member.x + member.width / 2, y: member.y + member.height / 2 };
    const down = drawSessionPointerDown(session, { point: grab, modifiers: NO_DRAW_MODIFIERS });
    expect(down.state.interaction.kind).toBe('drag');
    expect(new Set(down.state.selectedIds)).toEqual(new Set(['sw-lane1', 'sw-p1']));
    const moved = drawSessionPointerMove(down.state, {
      point: point(grab.x + 16, grab.y),
      modifiers: NO_DRAW_MODIFIERS,
    });
    expect(moved.commit).toBe('live');
    expect(moved.state.model.objects['sw-lane1']!.x).toBe(lane.x + 16);
    expect(moved.state.model.objects['sw-p1']!.x).toBe(member.x + 16);
    // The connector endpoints are ids, so the channel still links the same two nodes.
    const connector = Object.values(moved.state.model.objects).find((object) => object.type === 'connector')!;
    expect(connector.connector?.from.objectId).toBe('sw-p1');
    expect(connector.connector?.to.objectId).toBe('sw-p2');
    expect(drawSessionPointerUp(moved.state, {
      point: point(grab.x + 16, grab.y),
      modifiers: NO_DRAW_MODIFIERS,
    }).commit).toBe('history');
  });
});

describe('Draw canvas session — connectors', () => {
  const connected = () => {
    const base = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 400, y: 0, width: 100, height: 60 },
      ],
    });
    const selected = drawSessionCommand(createDrawCanvasSession(base), { kind: 'select', ids: ['a', 'b'] });
    return drawSessionCommand(selected.state, { kind: 'connect' });
  };

  it('creates a connector from the keyboard, not only from the button', () => {
    const base = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 400, y: 0, width: 100, height: 60 },
      ],
    });
    const selected = drawSessionCommand(createDrawCanvasSession(base), { kind: 'select', ids: ['a', 'b'] });
    const step = drawSessionKeyDown(selected.state, key({ key: 'C', ctrlKey: true, shiftKey: true }));
    expect(step?.commit).toBe('history');
    expect(Object.values(step!.state.model.objects).some((object) => object.type === 'connector')).toBe(true);
    // With fewer than two objects selected the shortcut fails closed instead of guessing.
    expect(() => drawSessionKeyDown(createDrawCanvasSession(base, ['a']), key({ key: 'c', ctrlKey: true, shiftKey: true })))
      .toThrowError(/connect-needs-two-objects/);
  });

  it('adds a routing waypoint on Alt+click while a connector is selected', () => {
    const session = connected();
    const connectorId = session.state.selectedIds[0]!;
    const step = drawSessionPointerDown(session.state, { point: point(250, 40), modifiers: alt });
    expect(step.commit).toBe('history');
    expect(step.state.model.objects[connectorId]?.connector?.waypoints).toEqual([{ x: 250, y: 40 }]);
    expect(step.state.model.objects[connectorId]?.connector?.autoRoute).toBe(false);
    // Alt over a shape still rotates: the waypoint path only applies to a selected connector.
    const shapeSession = drawSessionCommand(createDrawCanvasSession(step.state.model), { kind: 'select', ids: ['a'] });
    expect(drawSessionPointerDown(shapeSession.state, { point: point(50, 30), modifiers: alt }).state.interaction.kind).toBe('rotate');
  });

  it('routes the connector differently after a node moved through the session', () => {
    const session = connected();
    const connectorId = session.state.selectedIds[0]!;
    const before = session.state.model.objects[connectorId]!;
    const selected = drawSessionCommand(session.state, { kind: 'select', ids: ['b'] });
    const moved = drawSessionCommand(selected.state, { kind: 'nudge', delta: { x: 0, y: 300 } });
    const after = moved.state.model.objects[connectorId]!;
    expect(after.type).toBe('connector');
    expect({ x: after.x, y: after.y, width: after.width, height: after.height })
      .not.toEqual({ x: before.x, y: before.y, width: before.width, height: before.height });
  });
});
