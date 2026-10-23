// STATUS: GOLD — render contract for the interactive Draw surface (real SVG nodes, adorners, states).
//
// These assertions are the reachability evidence that the main viewport is no longer a static picture:
// the markup must contain real per-object nodes, the eight resize grips, the hover/marquee/guide
// adorners and the direct text editor.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DrawInteractiveSurface } from '../../canvas/DrawInteractiveSurface';
import { buildDrawModel } from '../interactions/drawInteractionFixtures';
import { createDrawCanvasSession } from '../../interactions/drawCanvasSession';
import { projectDrawScene } from '../../interactions/drawSceneProjection';

const noop = (): void => undefined;
const handlers = {
  onPointerDown: noop, onPointerMove: noop, onPointerUp: noop, onPointerCancel: noop,
  onDoubleClick: noop, onTextChange: noop, onTextCommit: noop, onDropStencil: noop,
};

function surface(
  model: ReturnType<typeof buildDrawModel>,
  session: ReturnType<typeof createDrawCanvasSession>,
) {
  const page = model.pages.find((candidate) => candidate.id === model.activePageId)!;
  return renderToStaticMarkup(
    <DrawInteractiveSurface model={model} page={page} session={session} locale="en-US" handlers={handlers} />,
  );
}

const twoShapes = () => buildDrawModel({
  objects: [
    { id: 'a', x: 100, y: 100, width: 200, height: 100, text: 'Alpha' },
    { id: 'b', x: 400, y: 300, width: 120, height: 60, text: 'Beta' },
  ],
});

describe('Draw interactive surface render contract', () => {
  it('renders an interactive, focusable application surface instead of an image', () => {
    const model = twoShapes();
    const markup = surface(model, createDrawCanvasSession(model));
    expect(markup).toContain('data-vgt-interactive-canvas="true"');
    expect(markup).toContain('role="application"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('data-vgt-draw-surface="true"');
    expect(markup).toContain('aria-describedby="draw-surface-instructions"');
    // Every object is a real node carrying its canonical id, type and interaction state.
    expect(markup).toContain('data-vgt-id="a"');
    expect(markup).toContain('data-vgt-id="b"');
    expect(markup).toContain('data-vgt-type="rectangle"');
    expect(markup).toContain('data-vgt-state="idle"');
    expect(markup).toContain('data-vgt-paint-order="canonical"');
    // No data-URL image and no <img> element may remain in the main viewport.
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('data:image/svg+xml');
  });

  it('adorns the single selection with eight grips, the rotation grip and a state badge', () => {
    const model = twoShapes();
    const markup = surface(model, createDrawCanvasSession(model, ['a']));
    expect(markup).toContain('data-vgt-state="selected"');
    expect(markup).toContain('data-vgt-outline="selected"');
    expect(markup).toContain('data-vgt-state-badge="selected"');
    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate']) {
      expect(markup, handle).toContain(`data-vgt-handle="${handle}"`);
    }
  });

  it('renders hover, focus, dragging and locked states distinctly without colour', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'a', x: 100, y: 100, width: 200, height: 100 },
        { id: 'b', x: 400, y: 300, width: 120, height: 60 },
        { id: 'locked', x: 600, y: 400, width: 80, height: 40, locked: true },
      ],
    });
    const hovered = { ...createDrawCanvasSession(model, ['a']), hoverId: 'b' };
    const hoverMarkup = surface(model, hovered);
    expect(hoverMarkup).toContain('data-vgt-state="hover"');
    expect(hoverMarkup).toContain('data-vgt-hover="true"');
    expect(hoverMarkup).toContain('stroke-dasharray="2 4"');

    const dragging = { ...createDrawCanvasSession(model, ['a']), interaction: { kind: 'drag' as const, origin: { x: 0, y: 0 }, current: { x: 10, y: 10 }, ids: ['a'], startedAt: 0, moved: true } };
    const dragMarkup = surface(model, dragging);
    expect(dragMarkup).toContain('data-vgt-state="dragging"');
    expect(dragMarkup).toContain('data-vgt-interaction="drag"');

    const lockedSelection = createDrawCanvasSession(model, ['locked']);
    const lockedMarkup = surface(model, lockedSelection);
    expect(lockedMarkup).toContain('data-vgt-state="disabled"');
    expect(lockedMarkup).toContain('data-vgt-state-badge="disabled"');
    // A locked selection has no grips at all — the disabled state is not pointer-editable.
    expect(lockedMarkup).not.toContain('data-vgt-handle="nw"');
  });

  it('renders the marquee rectangle, the multi-selection frame and alignment guides', () => {
    const model = twoShapes();
    const marquee = {
      ...createDrawCanvasSession(model, ['a', 'b']),
      interaction: { kind: 'marquee' as const, origin: { x: 50, y: 50 }, current: { x: 300, y: 300 }, additive: false, baseSelection: [] },
      marqueeRect: { x: 50, y: 50, width: 250, height: 250 },
      guides: [{ axis: 'x' as const, position: 120 }, { axis: 'y' as const, position: 240 }],
    };
    const markup = surface(model, marquee);
    expect(markup).toContain('data-vgt-marquee="true"');
    expect(markup).toContain('data-vgt-adorners="multi"');
    expect(markup).toContain('data-vgt-adorner="a"');
    expect(markup).toContain('data-vgt-adorner="b"');
    expect(markup).toContain('data-vgt-guide="x"');
    expect(markup).toContain('data-vgt-guide="y"');
  });

  it('renders the direct text editor with a wrapped line count', () => {
    const model = buildDrawModel({ objects: [{ id: 'a', x: 100, y: 100, width: 200, height: 100, text: 'Alpha label' }] });
    const session = { ...createDrawCanvasSession(model, ['a']), interaction: { kind: 'text' as const, objectId: 'a' } };
    const markup = surface(model, session);
    expect(markup).toContain('data-vgt-text-editor="true"');
    expect(markup).toContain('data-vgt-text-input="true"');
    expect(markup).toContain('Alpha label');
    expect(markup).toContain('data-vgt-text-lines="true"');
    expect(markup).toContain('1 lines');
    expect(markup).toContain('Shape text');
  });

  it('draws connectors as routed paths, not as boxes', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 400, y: 0, width: 100, height: 60 },
        {
          id: 'c1', type: 'connector', x: 100, y: 0, width: 300, height: 60,
          connector: {
            from: { objectId: 'a', anchor: 'auto' }, to: { objectId: 'b', anchor: 'auto' },
            route: 'orthogonal', autoRoute: true, waypoints: [], obstacleAvoidance: true,
            routingPriority: 0, crossingStyle: 'none', semantic: { label: 'feeds' },
            arrowStart: 'none', arrowEnd: 'triangle',
          },
        },
      ],
    });
    const markup = surface(model, createDrawCanvasSession(model));
    expect(markup).toContain('data-vgt-type="connector"');
    expect(markup).toContain('data-vgt-connector="true"');
    expect(markup).toContain('d="M ');
    expect(markup).toContain('feeds');
  });

  it('keeps hidden-layer objects out of the painted and hit-testable scene', () => {
    const model = buildDrawModel({
      layers: [{ id: 'layer-main' }, { id: 'layer-hidden', visible: false }],
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'h', layerId: 'layer-hidden', x: 200, y: 0, width: 100, height: 60 },
      ],
    });
    const scene = projectDrawScene(model, model.activePageId);
    expect(scene.byId.get('h')?.visible).toBe(false);
    const markup = surface(model, createDrawCanvasSession(model));
    expect(markup).toContain('data-vgt-id="a"');
    expect(markup).not.toContain('data-vgt-id="h"');
  });
});
