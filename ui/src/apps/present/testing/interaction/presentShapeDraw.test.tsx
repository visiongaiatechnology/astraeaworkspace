// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1 (PR-007): freeform shapes drawn from start to end point
//
// Before PR-007 a shape was inserted at a hard-coded 48 % / 32 % position and there was no draw
// mode, no preview overlay and no pointer-up commit. These tests arm the real shape tool through the
// shipped toolbar menu, draw with real pointer events and assert on the **document the editor
// publishes** — not on component internals. happy-dom has no layout engine, so the stage frame is
// stubbed to 960×540 (same contract as `presentTextEditAndDrag.test.tsx`). One percent of width is
// 9.6 px, one percent of height is 5.4 px on that frame.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSceneObject, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const BLANK_SLIDE: PresentSlide = {
  id: 'slide-1',
  title: '',
  subtitle: '',
  layout: 'blank',
  cards: [],
  speakerNotes: '',
  sceneObjects: [],
} as PresentSlide;

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-m1-shape-draw',
    title: 'Present M1 shape draw',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides: [slide], theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function stubbedStageRect(): DOMRect {
    return {
      x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT,
      top: 0, left: 0, right: STAGE_WIDTH, bottom: STAGE_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  latest = null;
});

function ControlledPresenter({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  latest = document;
  return createElement(PresentCanvas, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
    workspaceDocuments: [],
    networkCapability: 'offline',
    keyVaultUnlocked: false,
    onSelectSelectionType: vi.fn(),
  } as never);
}

async function mount(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith(BLANK_SLIDE) }));
  });
  return container;
}

async function settle(ms = 0): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function stageElement(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('present stage not rendered');
  return element;
}

function publishedObjects(): PresentSceneObject[] {
  const slides = latest?.presentData?.slides ?? [];
  return (slides[0]?.sceneObjects ?? []) as PresentSceneObject[];
}

function pointerEvent(type: string, clientX: number, clientY: number, shiftKey: boolean): MouseEvent {
  // happy-dom has no `PointerEvent`; a `MouseEvent` with the pointer type carries the same client
  // coordinates and modifier state into React's pointer handlers and the window listeners.
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, shiftKey });
}

/**
 * Arms the shipped shape tool: open the toolbar's shape menu and choose the shape. This exercises
 * the real user path (the menu button is the only way to arm a shape), not a private test hook.
 */
async function armShapeTool(host: HTMLElement, shapeKey: string): Promise<void> {
  const menuButtons = host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]');
  const shapeMenuButton = menuButtons[0];
  if (!shapeMenuButton) throw new Error('shape menu button not rendered');
  await act(async () => {
    shapeMenuButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
  const item = document.querySelector<HTMLButtonElement>(`[data-present-shape-key="${shapeKey}"]`);
  if (!item) throw new Error(`shape menu item "${shapeKey}" not rendered`);
  await act(async () => {
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function pointerDownOnStage(host: HTMLElement, clientX: number, clientY: number, shiftKey = false): Promise<void> {
  await act(async () => {
    stageElement(host).dispatchEvent(pointerEvent('pointerdown', clientX, clientY, shiftKey));
    await settle(30);
  });
}

async function pointerMove(clientX: number, clientY: number, shiftKey = false): Promise<void> {
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointermove', clientX, clientY, shiftKey));
    await settle(30);
  });
}

async function pointerUp(clientX: number, clientY: number, shiftKey = false): Promise<void> {
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointerup', clientX, clientY, shiftKey));
    await settle(60);
  });
}

/** One complete draw: arm, press, drag, release. */
async function drawShape(
  host: HTMLElement,
  shapeKey: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { shiftKey?: boolean } = {},
): Promise<void> {
  await armShapeTool(host, shapeKey);
  await pointerDownOnStage(host, from.x, from.y, Boolean(options.shiftKey));
  await pointerMove(to.x, to.y, Boolean(options.shiftKey));
  await pointerUp(to.x, to.y, Boolean(options.shiftKey));
}

function shapeObjects(): Array<Extract<PresentSceneObject, { kind: 'shape' }>> {
  return publishedObjects().filter(
    (object): object is Extract<PresentSceneObject, { kind: 'shape' }> => object.kind === 'shape',
  );
}

// Stage points used by the drag tests: (200,150) → (440,330) is a +25 % / +33.33 % drag on the
// stubbed 960×540 frame.
const DRAG_FROM = { x: 200, y: 150 };
const DRAG_TO = { x: 440, y: 330 };
const DRAG_FROM_PERCENT = {
  xPercent: (DRAG_FROM.x / STAGE_WIDTH) * 100,
  yPercent: (DRAG_FROM.y / STAGE_HEIGHT) * 100,
};
const DRAG_TO_PERCENT = {
  xPercent: (DRAG_TO.x / STAGE_WIDTH) * 100,
  yPercent: (DRAG_TO.y / STAGE_HEIGHT) * 100,
};

describe('Present M1 — freeform shape drawing (PR-007)', () => {
  it('creates exactly one shape with the dragged percent geometry', async () => {
    const host = await mount();
    await drawShape(host, 'rectangle', DRAG_FROM, DRAG_TO);

    const shapes = shapeObjects();
    expect(shapes, 'genau ein Objekt, kein zweiter Write während des Ziehens').toHaveLength(1);
    expect(shapes[0].shape).toBe('rectangle');
    // The drag defines the rect: start is one corner, the release point the opposite one.
    expect(shapes[0].xPercent).toBeCloseTo(DRAG_FROM_PERCENT.xPercent, 3);
    expect(shapes[0].yPercent).toBeCloseTo(DRAG_FROM_PERCENT.yPercent, 3);
    expect(shapes[0].widthPercent).toBeCloseTo(DRAG_TO_PERCENT.xPercent - DRAG_FROM_PERCENT.xPercent, 3);
    expect(shapes[0].heightPercent).toBeCloseTo(DRAG_TO_PERCENT.yPercent - DRAG_FROM_PERCENT.yPercent, 3);
  });

  it('shows the preview overlay while drawing and removes it after pointer-up', async () => {
    const host = await mount();
    await armShapeTool(host, 'rectangle');
    await pointerDownOnStage(host, DRAG_FROM.x, DRAG_FROM.y);
    await pointerMove(DRAG_TO.x, DRAG_TO.y);

    const draft = host.querySelector<HTMLElement>('[data-present-shape-draft="true"]');
    expect(draft, 'Vorschau-Overlay während des Ziehens').not.toBeNull();
    expect(draft!.dataset.presentShapeDraftKind).toBe('rectangle');
    // The preview is a live outline: its geometry is the drag rect, not a fixed 48/32 placeholder.
    expect(parseFloat(draft!.style.width)).toBeCloseTo(
      DRAG_TO_PERCENT.xPercent - DRAG_FROM_PERCENT.xPercent,
      3,
    );
    expect(parseFloat(draft!.style.height)).toBeCloseTo(
      DRAG_TO_PERCENT.yPercent - DRAG_FROM_PERCENT.yPercent,
      3,
    );
    // Still nothing written to the document before pointer-up.
    expect(publishedObjects(), 'Commit erst bei PointerUp').toHaveLength(0);

    await pointerUp(DRAG_TO.x, DRAG_TO.y);
    expect(host.querySelector('[data-present-shape-draft="true"]'), 'Overlay nach PointerUp entfernt').toBeNull();
    expect(publishedObjects()).toHaveLength(1);
  });

  it('places the documented default size at the click point on a click without drag', async () => {
    const host = await mount();
    await armShapeTool(host, 'ellipse');
    const click = { x: 480, y: 270 }; // exactly 50 % / 50 % of the stubbed frame
    await pointerDownOnStage(host, click.x, click.y);
    await pointerUp(click.x, click.y);

    const shapes = shapeObjects();
    expect(shapes).toHaveLength(1);
    expect(shapes[0].shape).toBe('ellipse');
    // Documented default ellipse footprint is 20 % × 16 %, centred on the click point.
    expect(shapes[0].widthPercent).toBeCloseTo(20, 3);
    expect(shapes[0].heightPercent).toBeCloseTo(16, 3);
    expect(shapes[0].xPercent).toBeCloseTo(50 - 20 / 2, 3);
    expect(shapes[0].yPercent).toBeCloseTo(50 - 16 / 2, 3);
  });

  it('keeps a corner-drawn shape 1:1 on Shift (physically square, tolerance 0.02)', async () => {
    const host = await mount();
    await drawShape(host, 'rectangle', DRAG_FROM, DRAG_TO, { shiftKey: true });

    const shapes = shapeObjects();
    expect(shapes).toHaveLength(1);
    const { widthPercent, heightPercent } = shapes[0];
    // Percent space is anisotropic: 1:1 means equal *physical* side lengths on the 16:9 slide.
    const physicalRatio = (widthPercent * STAGE_WIDTH) / (heightPercent * STAGE_HEIGHT);
    expect(Math.abs(physicalRatio - 1), 'Shift erzwingt 1:1 (Toleranz 0.02)').toBeLessThanOrEqual(0.02);
    // The longer physical drag axis drives the square (dominant-axis rule).
    expect(widthPercent).toBeCloseTo(25, 3);
    expect(heightPercent).toBeCloseTo((25 * STAGE_WIDTH) / STAGE_HEIGHT, 3);
  });

  it('cancels the gesture on Escape during the drag without creating an object', async () => {
    const host = await mount();
    await armShapeTool(host, 'rectangle');
    await pointerDownOnStage(host, DRAG_FROM.x, DRAG_FROM.y);
    await pointerMove(DRAG_TO.x, DRAG_TO.y);
    expect(host.querySelector('[data-present-shape-draft="true"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle(30);
    });
    expect(host.querySelector('[data-present-shape-draft="true"]'), 'Overlay verschwindet bei Escape').toBeNull();
    expect(host.querySelector('[data-present-shape-tool-status="armed"]'), 'Werkzeug ist entschärft').toBeNull();

    // The delayed pointer-up must not resurrect the cancelled gesture.
    await pointerUp(DRAG_TO.x, DRAG_TO.y);
    expect(publishedObjects(), 'kein Objekt nach Escape').toHaveLength(0);
  });

  it('aborts on pointercancel without writing an object', async () => {
    const host = await mount();
    await armShapeTool(host, 'rectangle');
    await pointerDownOnStage(host, DRAG_FROM.x, DRAG_FROM.y);
    await pointerMove(DRAG_TO.x, DRAG_TO.y);
    expect(host.querySelector('[data-present-shape-draft="true"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true, cancelable: true }));
      await settle(30);
    });
    expect(host.querySelector('[data-present-shape-draft="true"]'), 'Overlay verschwindet bei pointercancel').toBeNull();

    // A late pointer-up must not commit the cancelled draft.
    await pointerUp(DRAG_TO.x, DRAG_TO.y);
    expect(publishedObjects(), 'kein Objekt nach pointercancel').toHaveLength(0);
  });

  it('writes the shape into the document and keeps legacy cards empty', async () => {
    const host = await mount();
    await drawShape(host, 'rectangle', DRAG_FROM, DRAG_TO);

    const published = latest?.presentData?.slides?.[0];
    expect(published?.sceneObjects, 'Objekt landet über onUpdateSlide im Dokument').toHaveLength(1);
    const object = published!.sceneObjects![0];
    expect(object.kind).toBe('shape');
    // Model IDs are UUIDs, never `Date.now()` (two shapes in the same ms would collide).
    expect(object.id, 'ID per crypto.randomUUID()').toMatch(/^present-shape-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(published?.cards ?? [], 'keine Legacy-Karten').toEqual([]);
    expect(published?.layout).toBe('blank');
  });

  it('uses the real start/end coordinates for a line (centre, length and angle)', async () => {
    const host = await mount();
    await drawShape(host, 'line', DRAG_FROM, DRAG_TO);

    const shapes = shapeObjects();
    expect(shapes).toHaveLength(1);
    expect(shapes[0].shape).toBe('line');
    const dxPhysical = (DRAG_TO_PERCENT.xPercent - DRAG_FROM_PERCENT.xPercent) * (STAGE_WIDTH / STAGE_HEIGHT);
    const dyPhysical = DRAG_TO_PERCENT.yPercent - DRAG_FROM_PERCENT.yPercent;
    const lengthPhysical = Math.hypot(dxPhysical, dyPhysical);
    const expectedRotation = (Math.atan2(dyPhysical, dxPhysical) * 180) / Math.PI;
    // The bar frame is centred on the drag centre and rotated by the real point-to-point angle.
    expect(shapes[0].rotation).toBeCloseTo(expectedRotation, 3);
    expect(shapes[0].widthPercent).toBeCloseTo(lengthPhysical / (STAGE_WIDTH / STAGE_HEIGHT), 3);
    expect(shapes[0].xPercent + shapes[0].widthPercent / 2).toBeCloseTo(
      (DRAG_FROM_PERCENT.xPercent + DRAG_TO_PERCENT.xPercent) / 2,
      3,
    );
    expect(shapes[0].yPercent + shapes[0].heightPercent / 2).toBeCloseTo(
      (DRAG_FROM_PERCENT.yPercent + DRAG_TO_PERCENT.yPercent) / 2,
      3,
    );
  });
});
