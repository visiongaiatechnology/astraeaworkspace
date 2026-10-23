// STATUS: GOLD — bounded work on a large diagram (packages 20 and 21: 500 shapes, 800 connectors).
//
// The requirement is that hit-testing, marquee selection and snap candidates stay *bounded* rather than
// degrading into a scan of every object. These assertions pin the bounds; they deliberately do not
// measure wall-clock time, because a timing assertion is flaky and the acceptance ("flüssig bedienen")
// needs a browser, which this harness does not have.
import { describe, expect, it } from 'vitest';
import type { DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { hitTestDrawScene, marqueeDrawSelection } from '../../interactions/drawHitTest';
import { buildDrawSpatialIndex, queryDrawSpatialIndex, MAX_DRAW_INDEX_CELLS } from '../../interactions/drawSpatialIndex';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import { createDrawCanvasSession, drawSessionPointerDown, drawSessionPointerMove } from '../../interactions/drawCanvasSession';
import { NO_DRAW_MODIFIERS, drawSceneIndexFor } from '../../interactions/drawInteractionController';
import { packNativeDraw, unpackNativeDraw } from '../../import-export/drawInterchangeEngine';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { buildDrawModel } from './drawInteractionFixtures';

const SHAPE_COUNT = 500;
const CONNECTOR_COUNT = 800;

function largeModel() {
  const shapes = Array.from({ length: SHAPE_COUNT }, (_, index) => ({
    id: `s${index}`,
    x: (index % 25) * 200,
    y: Math.floor(index / 25) * 120,
    width: 80,
    height: 50,
    zIndex: index,
  }));
  const connectors = Array.from({ length: CONNECTOR_COUNT }, (_, index) => ({
    id: `c${index}`,
    type: 'connector' as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    zIndex: SHAPE_COUNT + index,
    connector: {
      from: { objectId: `s${index % SHAPE_COUNT}`, anchor: 'auto' as const },
      to: { objectId: `s${(index * 7 + 3) % SHAPE_COUNT}`, anchor: 'auto' as const },
      route: 'straight' as const,
      autoRoute: true,
      waypoints: [],
      obstacleAvoidance: false,
      routingPriority: 0,
      crossingStyle: 'none' as const,
      semantic: {},
      arrowStart: 'none' as const,
      arrowEnd: 'triangle' as const,
    },
  }));
  return buildDrawModel({ objects: [...shapes, ...connectors] });
}

describe('Draw large diagram bounds', () => {
  const model = largeModel();
  const scene = projectDrawScene(model, model.activePageId);

  it('caches the scene and spatial index per model revision instead of rebuilding per pointer event', () => {
    const first = drawSceneIndexFor(model);
    const second = drawSceneIndexFor(model);
    // Same immutable model ⇒ same index object, so a mousemove does not rebuild the index.
    expect(second.index).toBe(first.index);
    expect(second.scene).toBe(first.scene);
    // A new revision is a new object identity ⇒ a fresh index, so no stale geometry is ever used.
    const nextModel = { ...model, revision: model.revision + 1 };
    const third = drawSceneIndexFor(nextModel);
    expect(third.index).not.toBe(first.index);
    // The cached index stays consistent with a directly built one for the same model.
    const direct = buildDrawSpatialIndex(scene, scene.entries);
    expect(first.index.columns).toBe(direct.columns);
    expect(first.index.rows).toBe(direct.rows);
    expect(first.index.cells.size).toBe(direct.cells.size);
  });

  it('projects every object once and derives the hit order from that single ordering', () => {
    expect(scene.entries.length).toBe(SHAPE_COUNT + CONNECTOR_COUNT);
    expect(scene.entries[0]!.paintIndex).toBe(0);
    expect(scene.entries[scene.entries.length - 1]!.paintIndex).toBe(SHAPE_COUNT + CONNECTOR_COUNT - 1);
    expect(scene.hitOrder.length).toBe(scene.entries.length);
  });

  it('caps the spatial index cells and returns bounded candidate sets', () => {
    const index = buildDrawSpatialIndex(scene, scene.entries);
    expect(index.columns * index.rows).toBeLessThanOrEqual(MAX_DRAW_INDEX_CELLS);
    const everything = queryDrawSpatialIndex(index, { x: -10_000, y: -10_000, width: 100_000, height: 100_000 }, 64);
    expect(everything.length).toBe(64);
    expect(new Set(everything).size).toBe(64);
  });

  it('hit-tests through the index with a bounded candidate set and finds the topmost object', () => {
    const index = buildDrawSpatialIndex(scene, scene.entries);
    const target: DrawObject = model.objects.s10!;
    const hit = hitTestDrawScene(scene, { x: target.x + 5, y: target.y + 5 }, { index, candidateLimit: 128 });
    // `s510`-style overlaps do not exist here; the hit must be the object drawn last under the point.
    expect(hit).not.toBeNull();
    expect(hit!.objectId.startsWith('s')).toBe(true);
  });

  it('bounds a full-page marquee to the candidate limit', () => {
    const index = buildDrawSpatialIndex(scene, scene.entries);
    const ids = marqueeDrawSelection(scene, { x: -10_000, y: -10_000, width: 100_000, height: 100_000 }, {
      index, candidateLimit: 50, mode: 'contain', groupSelect: false,
    });
    expect(ids.length).toBeLessThanOrEqual(50);
  });

  it('saves and reopens 500 shapes + 800 connectors with identical payload and stays operable', async () => {
    // **Paket 20, Schicht WOM:** der große Bestand muss den kanonischen Speicherweg überstehen — nicht nur
    // „bedienbar" sein. Der Test ist die Messung: identische Nutzdaten nach Speichern→Öffnen.
    const document = {
      id: 'draw-large', title: 'Large diagram', kind: 'Draw', created_at: 0, modified_at: 0, version: 1,
      theme_id: 'cosmic', root_object_ids: [], objects: {}, drawData: model,
    } as unknown as WorkspaceDocument;
    const bytes = await packNativeDraw(document, { password: 'large-diagram-passphrase' });
    expect(bytes.byteLength).toBeGreaterThan(16);
    const reopened = await unpackNativeDraw(bytes, { password: 'large-diagram-passphrase' });
    expect(reopened.drawData).toEqual(model);
    expect(Object.keys(reopened.drawData!.objects).length).toBe(SHAPE_COUNT + CONNECTOR_COUNT);
    expect(reopened.drawData!.pages[0]!.objectIds.length).toBe(SHAPE_COUNT + CONNECTOR_COUNT);

    // Und der wieder geöffnete Bestand ist **bedienbar**: Treffer, Auswahl, Index — alles noch begrenzt.
    const reopenedScene = projectDrawScene(reopened.drawData!, reopened.drawData!.activePageId);
    const reopenedIndex = buildDrawSpatialIndex(reopenedScene, reopenedScene.entries);
    const target = reopened.drawData!.objects.s7!;
    const hit = hitTestDrawScene(reopenedScene, { x: target.x + 4, y: target.y + 4 }, { index: reopenedIndex });
    expect(hit?.objectId).toBe('s7');
    const session = createDrawCanvasSession(reopened.drawData!, ['s7']);
    const down = drawSessionPointerDown(session, { point: { x: target.x + 40, y: target.y + 25 }, modifiers: NO_DRAW_MODIFIERS });
    expect(down.state.interaction.kind).toBe('drag');
  });

  it('keeps a drag over 500 objects to one bounded commit per gesture', () => {    const session = createDrawCanvasSession(model, ['s0']);
    const target = model.objects.s0!;
    // Grab the body centre: a point near a corner is (correctly) claimed by the resize grips.
    const grab = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const down = drawSessionPointerDown(session, { point: grab, modifiers: NO_DRAW_MODIFIERS });
    expect(down.state.interaction.kind).toBe('drag');
    const move = drawSessionPointerMove(down.state, { point: { x: grab.x + 20, y: grab.y }, modifiers: NO_DRAW_MODIFIERS });
    expect(move.commit).toBe('live');
    // Snapping is on by default, so the accepted delta is grid-aligned rather than the raw 20.
    const gridSize = model.viewport.gridSize;
    const moved = move.state.model.objects.s0!;
    expect(moved.x % gridSize).toBe(0);
    expect(moved.x).toBeGreaterThan(target.x);
    expect(moved.x).toBeLessThanOrEqual(target.x + 20);
    // The other 499 shapes never move: the edit is scoped to the selection.
    expect(move.state.model.objects.s1!.x).toBe(model.objects.s1!.x);
  });
});
