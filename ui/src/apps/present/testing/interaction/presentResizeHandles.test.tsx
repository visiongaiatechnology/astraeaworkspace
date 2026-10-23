// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1 (PR-006): free resize through reachable handles
//
// Before PR-006 a selected object offered exactly one resize handle (20 px, bottom right) and one
// rotate handle; there was no Shift/aspect logic and no edge handles at all. These tests drive the
// real `PresentCanvas` with real pointer events and assert on the **document the editor publishes**
// — not on component internals. The stage is stubbed to 960×540 because happy-dom has no layout
// engine (every `getBoundingClientRect()` is 0×0 and the shipped gesture code correctly refuses to
// resize without a measurable frame); with the stub the *production* gesture arithmetic runs.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import {
  PRESENT_MIN_OBJECT_HEIGHT_PERCENT,
  PRESENT_MIN_OBJECT_WIDTH_PERCENT,
} from '../../canvas/model/presentTransform';

vi.setConfig({ testTimeout: 60_000 });

/** Stubbed slide frame in CSS px: 16:9, the default Present aspect ratio. */
const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;
/** One percent of width/height in the stubbed frame — the test's drag deltas are given in px. */
const PERCENT_WIDTH_PX = STAGE_WIDTH / 100;
const PERCENT_HEIGHT_PX = STAGE_HEIGHT / 100;

const BASE_OBJECT = {
  id: 'obj-1',
  kind: 'shape',
  shape: 'rectangle',
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  xPercent: 10,
  yPercent: 10,
  widthPercent: 30,
  heightPercent: 20,
  zIndex: 1,
};

function slideWith(patch: Partial<typeof BASE_OBJECT> = {}): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [{ ...BASE_OBJECT, ...patch }],
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-m1-resize-handles',
    title: 'Present M1 resize handles',
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

async function mount(slide: PresentSlide): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith(slide) }));
  });
  return container;
}

async function settle(ms = 0): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function objectElement(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-object-id="obj-1"]');
  if (!element) throw new Error('scene object not rendered');
  return element;
}

function handleElement(host: HTMLElement, handle: string): HTMLButtonElement {
  const element = host.querySelector<HTMLButtonElement>(`[data-present-handle="${handle}"]`);
  if (!element) throw new Error(`handle "${handle}" not rendered`);
  return element;
}

function publishedObject(): {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
} {
  const slides = latest?.presentData?.slides ?? [];
  const object = (slides[0]?.sceneObjects ?? []).find((candidate) => candidate.id === 'obj-1');
  if (!object) throw new Error('scene object missing in the published document');
  return object as { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number };
}

/** Selects the object with a real click, which is the user path that renders the handles. */
async function selectObject(host: HTMLElement): Promise<void> {
  await act(async () => {
    objectElement(host).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

function pointerEvent(type: string, clientX: number, clientY: number, shiftKey: boolean): MouseEvent {
  // happy-dom has no `PointerEvent` constructor; a `MouseEvent` with the pointer type carries the
  // same client coordinates and modifier state into React's `onPointerDown`/window listeners.
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, shiftKey });
}

/**
 * One complete pointer sequence on a handle: down on the handle, one move and up on the window.
 * The waits cover the stage's frame-budget coalescing (one bounded document write per frame).
 */
async function dragHandle(
  host: HTMLElement,
  handle: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  modifiers: { shiftKey?: boolean } = {},
): Promise<void> {
  const shiftKey = Boolean(modifiers.shiftKey);
  await act(async () => {
    handleElement(host, handle).dispatchEvent(pointerEvent('pointerdown', from.x, from.y, shiftKey));
    await settle(30);
  });
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointermove', to.x, to.y, shiftKey));
    await settle(60);
  });
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointerup', to.x, to.y, shiftKey));
    await settle(60);
  });
}

describe('Present M1 — resize/rotate handles (PR-006)', () => {
  it('shows four corners, four edges and the rotate handle on the selected object', async () => {
    const host = await mount(slideWith());
    await selectObject(host);

    const handles = Array.from(host.querySelectorAll<HTMLElement>('[data-present-handle]'));
    expect(handles, '4 Ecken + 4 Kanten + Rotation').toHaveLength(9);
    expect(handles.map((handle) => handle.dataset.presentHandle).sort()).toEqual(
      [
        'resize-nw', 'resize-n', 'resize-ne', 'resize-e',
        'resize-se', 'resize-s', 'resize-sw', 'resize-w', 'rotate',
      ].sort(),
    );
    for (const handle of handles) {
      const name = handle.dataset.presentHandle;
      expect(parseFloat(handle.style.width), `${name}: Hitbox-Breite >= 24 px`).toBeGreaterThanOrEqual(24);
      expect(parseFloat(handle.style.height), `${name}: Hitbox-Höhe >= 24 px`).toBeGreaterThanOrEqual(24);
    }
  });

  it('grows width and height when dragging the se handle and publishes both into the document', async () => {
    const host = await mount(slideWith({ xPercent: 10, yPercent: 10, widthPercent: 30, heightPercent: 20 }));
    await selectObject(host);

    // +96 px = +10 % width, +54 px = +10 % height in the stubbed 960×540 frame.
    await dragHandle(
      host,
      'resize-se',
      { x: 300, y: 200 },
      { x: 300 + 10 * PERCENT_WIDTH_PX, y: 200 + 10 * PERCENT_HEIGHT_PX },
    );

    const object = publishedObject();
    expect(object.widthPercent, 'Breite +10 %').toBeCloseTo(40, 5);
    expect(object.heightPercent, 'Höhe +10 %').toBeCloseTo(30, 5);
    // The dragged corner is bottom-right, so the top-left anchor must not move.
    expect(object.xPercent).toBeCloseTo(10, 5);
    expect(object.yPercent).toBeCloseTo(10, 5);
  });

  it('moves position and size together when dragging the nw handle (opposite corner stays put)', async () => {
    const host = await mount(slideWith({ xPercent: 30, yPercent: 30, widthPercent: 30, heightPercent: 20 }));
    await selectObject(host);

    // -96 px = -10 % width, -54 px = -10 % height: the top-left edge moves up/left.
    await dragHandle(
      host,
      'resize-nw',
      { x: 300, y: 200 },
      { x: 300 - 10 * PERCENT_WIDTH_PX, y: 200 - 10 * PERCENT_HEIGHT_PX },
    );

    const object = publishedObject();
    // Right edge stays at 60 %, bottom edge at 50 %: x/y shrink by the same 10 % the size grows.
    expect(object.widthPercent, 'Breite +10 %').toBeCloseTo(40, 5);
    expect(object.heightPercent, 'Höhe +10 %').toBeCloseTo(30, 5);
    expect(object.xPercent, 'linke Kante wandert um -10 %').toBeCloseTo(20, 5);
    expect(object.yPercent, 'obere Kante wandert um -10 %').toBeCloseTo(20, 5);
    // The opposite corner (60 % / 50 %) is exactly where it was.
    expect(object.xPercent + object.widthPercent).toBeCloseTo(60, 5);
    expect(object.yPercent + object.heightPercent).toBeCloseTo(50, 5);
  });

  it('keeps the aspect ratio on a Shift corner drag (tolerance 0.02)', async () => {
    const host = await mount(slideWith({ xPercent: 20, yPercent: 20, widthPercent: 30, heightPercent: 20 }));
    await selectObject(host);

    const startRatio = 30 / 20;
    // Same +10 % / +10 % drag as the se test, with Shift held at pointer-down.
    await dragHandle(
      host,
      'resize-se',
      { x: 400, y: 300 },
      { x: 400 + 10 * PERCENT_WIDTH_PX, y: 300 + 10 * PERCENT_HEIGHT_PX },
      { shiftKey: true },
    );

    const object = publishedObject();
    expect(object.widthPercent, 'das Objekt ist größer geworden').toBeGreaterThan(30);
    expect(object.heightPercent, 'die Höhe wächst mit, statt nur einer Achse').toBeGreaterThan(20);
    expect(
      Math.abs(object.widthPercent / object.heightPercent - startRatio),
      'Seitenverhältnis bleibt erhalten (Toleranz 0.02)',
    ).toBeLessThanOrEqual(0.02);
    // The anchor of a bottom-right drag is the top-left corner.
    expect(object.xPercent).toBeCloseTo(20, 5);
    expect(object.yPercent).toBeCloseTo(20, 5);
    // Shift is the aspect-lock modifier here, not an additive-selection modifier: the object whose
    // handle is being dragged must stay selected afterwards (otherwise its handles would vanish).
    expect(host.querySelector('[data-present-handle="rotate"]'), 'Auswahl bleibt bestehen').not.toBeNull();
  });

  it('never shrinks below the minimum object size', async () => {
    const host = await mount(slideWith({ xPercent: 30, yPercent: 30, widthPercent: 30, heightPercent: 20 }));
    await selectObject(host);

    // Drag far past the opposite edge: both axes would become negative without clamping.
    await dragHandle(host, 'resize-se', { x: 400, y: 300 }, { x: 0, y: 0 });

    const object = publishedObject();
    expect(object.widthPercent).toBeGreaterThanOrEqual(PRESENT_MIN_OBJECT_WIDTH_PERCENT);
    expect(object.heightPercent).toBeGreaterThanOrEqual(PRESENT_MIN_OBJECT_HEIGHT_PERCENT);
    // The height minimum (2 %) survives the geometry normaliser unchanged — the exact floor is hit.
    expect(object.heightPercent).toBeCloseTo(PRESENT_MIN_OBJECT_HEIGHT_PERCENT, 5);
    // The object cannot have collapsed to nothing.
    expect(object.widthPercent).toBeLessThan(10);
    expect(object.heightPercent).toBeLessThan(10);
  });

  it('renders no handles while the object is not selected', async () => {
    const host = await mount(slideWith());
    expect(objectElement(host), 'das Objekt ist gerendert').not.toBeNull();
    expect(host.querySelectorAll('[data-present-handle]'), 'keine Handles ohne Auswahl').toHaveLength(0);
  });
});
