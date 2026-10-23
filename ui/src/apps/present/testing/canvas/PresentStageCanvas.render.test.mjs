// Contract test: the Present stage canvas must expose the editable-canvas affordances that the
// audit question names — an object selector with a visible selection state, a marquee, snap guides,
// a grid state, resize *and* rotate handles, and a keyboard/screen-reader visible status line.
// Rendered with `renderToStaticMarkup` (headless Node, no jsdom).

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PresentStageCanvas } from '../../canvas/PresentStageCanvas';
import { createPresentWorkspaceDropZone, openPresentWorkspaceDropZone } from '../../integrations/workspace-drop/presentWorkspaceDropZone';

const design = {
  backgroundColor: '#0c1222',
  surfaceColor: '#111827',
  titleColor: '#f8fafc',
  bodyColor: '#cbd5e1',
  accentColor: '#38bdf8',
  fontFamily: 'Inter',
  footerText: 'Deck footer',
  showFooter: true,
};

const shape = (id, patch = {}) => ({
  id,
  kind: 'shape',
  shape: 'rectangle',
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  xPercent: 10,
  yPercent: 10,
  widthPercent: 20,
  heightPercent: 10,
  zIndex: 1,
  ...patch,
});

const slide = (patch = {}) => ({
  id: 'slide-1',
  title: 'Deck title',
  subtitle: 'Deck subtitle',
  layout: 'blank',
  sceneObjects: [],
  images: [],
  ...patch,
});

const render = (overrides = {}) => renderToStaticMarkup(createElement(PresentStageCanvas, {
  slide: slide(),
  design,
  aspectRatio: '16:9',
  onUpdateSlide: vi.fn(),
  selectedSceneObjectIds: [],
  onSelectSceneObject: vi.fn(),
  onSelectSceneObjects: vi.fn(),
  selectedImageId: null,
  onSelectImage: vi.fn(),
  embeddedObjects: [],
  onInsertImageFile: vi.fn(),
  animationPreview: null,
  transitionPreviewProgress: null,
  onPresenceObjectChange: vi.fn(),
  ...overrides,
}));

describe('PresentStageCanvas rendering contract', () => {
  it('renders the stage, the collapsed grid state and a text selection status', () => {
    const html = render();
    expect(html).toContain('data-present-stage="true"');
    expect(html).toContain('data-present-grid-toggle="off"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-present-selection-status="true"');
    expect(html).toContain('No object selected');
    // The grid pattern itself must only exist while the grid is switched on.
    expect(html).not.toContain('data-present-grid="true"');
  });

  it('marks exactly the selected objects and gives the primary one the transform handles', () => {
    const html = render({
      slide: slide({ sceneObjects: [shape('a'), shape('b', { zIndex: 2 })] }),
      selectedSceneObjectIds: ['a', 'b'],
    });
    expect((html.match(/data-present-object-selected="true"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('data-present-selection-badge="true"');
    expect(html).toContain('2 selected');
    // PR-006 (M1): eight resize affordances + one rotation handle. The old single
    // `data-present-handle="resize"` is replaced by corner/edge names, so the contract
    // asserts the family instead of one exact value.
    expect(html).toContain('data-present-handle="resize-se"');
    expect(html).toContain('data-present-handle="resize-nw"');
    expect((html.match(/data-present-handle="resize-/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(html).toContain('data-present-handle="rotate"');
    expect(html).toContain('2 objects selected');
  });

  it('keeps a locked object selectable but never offers transform handles for it', () => {
    const html = render({
      slide: slide({ sceneObjects: [shape('locked', { locked: true })] }),
      selectedSceneObjectIds: ['locked'],
    });
    expect(html).toContain('data-present-object-selected="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('data-present-handle="resize-');
    expect(html).not.toContain('data-present-handle="rotate"');
  });

  it('hides hidden objects from the canvas entirely', () => {
    const html = render({ slide: slide({ sceneObjects: [shape('gone', { hidden: true }), shape('kept')] }) });
    expect(html).not.toContain('data-present-object-id="gone"');
    expect(html).toContain('data-present-object-id="kept"');
  });

  it('shows a group badge so grouping is readable without colour', () => {
    const html = render({
      slide: slide({ sceneObjects: [shape('a', { groupId: 'present-group-0' }), shape('b', { groupId: 'present-group-0' })] }),
    });
    expect(html).toContain('data-present-object-group="present-group-0"');
    expect((html.match(/data-present-group-badge="true"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('Group · #0');
  });

  it('renders the two-content layout with two labelled columns and both card halves', () => {
    const html = render({
      slide: slide({
        layout: 'split',
        cards: [
          { id: 'c1', title: 'Left card', description: 'left body' },
          { id: 'c2', title: 'Right card', description: 'right body' },
          { id: 'c3', title: 'Extra card', description: 'extra body' },
        ],
      }),
    });
    expect(html).toContain('data-present-layout="split"');
    expect(html).toContain('Column 1');
    expect(html).toContain('Column 2');
    // splitPresentTwoColumn puts the extra card in the left column (reader order).
    expect(html).toContain('Left card');
    expect(html).toContain('Extra card');
    expect(html).toContain('Right card');
    expect(html).not.toContain('Empty column');
  });

  it('reports an empty column of the two-content layout as empty instead of blank space', () => {
    const html = render({ slide: slide({ layout: 'split', cards: [{ id: 'c1', title: 'Only', description: 'x' }] }) });
    expect(html).toContain('Empty column');
  });

  it('renders the mirror state of an object (flip was previously dropped by the renderer)', () => {
    const html = render({
      slide: slide({ sceneObjects: [shape('a', { rotation: 90, flipX: true }), shape('b', { flipY: true })] }),
    });
    expect(html).toContain('rotate(90deg) scaleX(-1)');
    expect(html).toContain('scaleY(-1)');
  });

  it('renders an empty deck slide without inventing content', () => {
    const html = render({ slide: slide({ layout: 'blank', title: '', subtitle: '' }) });
    expect(html).toContain('Blank Canvas');
    // An empty slide must not fabricate cards or bullets.
    expect(html).not.toContain('Point 1');
  });

  it('mounts the Paket-10 drop zone INSIDE the slide frame, so its percentages are the slide percentages', () => {
    // Der Zustand kommt aus dem **reinen Modul** und ist genau der, den ein echtes `dragover` heute
    // erzeugt: während `dragover` ist der Träger **nicht** lesbar (nur `dataTransfer.types`), also ist
    // die Fläche `open` — sichtbar und angesagt, ohne ein Urteil zu erfinden.
    const state = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), {
      targetDocumentId: 'present-doc', documents: {}, payload: null,
    }).state;
    expect(state.phase).toBe('open');

    const noop = vi.fn();
    const wiring = {
      state, onDragSession: noop, onDragOver: noop, onDragLeave: noop, onDrop: noop, onKeyDown: noop,
      onConfirm: noop, onDismiss: noop, onChooseIntent: noop,
    };
    const html = render({ slide: slide({ sceneObjects: [shape('a')] }), workspaceDropZone: wiring });

    const stageAt = html.indexOf('data-present-stage="true"');
    const zoneAt = html.indexOf('data-present-drop-zone="true"');
    const objectAt = html.indexOf('data-present-object-id="a"');
    expect(stageAt).toBeGreaterThanOrEqual(0);
    expect(objectAt, 'ein Element, das nachweislich IM Folienrahmen liegt, ist der Bezugspunkt').toBeGreaterThan(stageAt);
    // **Eingeschlossen:** Öffnung des Folienrahmens < Ablagefläche < ein Element, das innen liegt.
    expect(zoneAt, 'sonst waeren die Prozente der Platzierung die Prozente des Editors').toBeGreaterThan(stageAt);
    expect(zoneAt).toBeLessThan(objectAt);

    expect(html).toContain('data-present-drop-phase="open"');
    expect(html).toContain('data-present-drop-verdict="none"');
    expect(html).toContain('data-present-drop-touch-action="manipulation"');
    expect(html).toContain('Workspace-Objekt hier ablegen');
    expect(html).toContain('data-present-drop-placement="true"');
    expect(html).toContain('left:71%');
    expect(html).toContain('data-present-drop-confirm="true"');
    expect(html).toContain('data-present-drop-dismiss="true"');

    // Und ohne Verdrahtung rendert die Buehne **keine** Ablagefläche.
    expect(render()).not.toContain('data-present-drop-zone');
  });
});
