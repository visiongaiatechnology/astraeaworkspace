// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1 (PR-005 rest-2): image gesture hardening
//
// The floating-image gesture gets exactly the same semantics as the scene-object gesture:
//   1. a click is not a drag — nothing is written until the pointer travelled past the shared
//      2 px threshold (`PRESENT_GESTURE_DRAG_THRESHOLD_PX`, imported, not re-declared);
//   2. `pointercancel` and window `blur` cancel the frame, remove the listeners and roll an
//      already-written gesture back to its start snapshot under the same coalesce key;
//   3. late move/up events after a cancel mutate nothing (no listener leak).
//
// happy-dom has no layout engine (0×0 rects), so the 16:9 stage is stubbed to 960×540 like the
// other interaction tests; the shipped gesture arithmetic then runs unchanged.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { PRESENT_GESTURE_DRAG_THRESHOLD_PX } from '../../canvas/PresentStageCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const IMAGE_OBJECT = {
  id: 'img-1',
  name: 'diagram.png',
  altText: 'Test image',
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  xPercent: 20,
  yPercent: 20,
  widthPercent: 30,
  heightPercent: 20,
  opacity: 1,
  zIndex: 25,
};

const IMAGE_SLIDE: PresentSlide = {
  id: 'slide-1',
  title: '',
  subtitle: '',
  layout: 'blank',
  cards: [],
  speakerNotes: '',
  sceneObjects: [],
  images: [IMAGE_OBJECT],
} as PresentSlide;

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-m1-image-hardening',
    title: 'Present M1 image gesture hardening',
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
    root!.render(createElement(ControlledPresenter, { start: documentWith(IMAGE_SLIDE) }));
  });
  return container;
}

async function settle(ms = 60): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function imageElement(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[aria-label^="Image object"]');
  if (!element) throw new Error('floating image not rendered');
  return element;
}

function imageResizeHandle(host: HTMLElement): HTMLButtonElement {
  const handle = host.querySelector<HTMLButtonElement>('button[data-vgt-theme-selection-handle="true"]');
  if (!handle) throw new Error('image resize handle not rendered');
  return handle;
}

function imageGeometry(): { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number } {
  const slides = latest?.presentData?.slides ?? [];
  const image = (slides[0]?.images ?? []).find((candidate) => candidate.id === 'img-1');
  if (!image) throw new Error('image missing in the published document');
  return image as { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number };
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  // happy-dom has no `PointerEvent`; a `MouseEvent` with the pointer type carries the coordinates
  // into React's pointer handlers and the window listeners.
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

async function pointerDownOn(target: Element, clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    target.dispatchEvent(pointerEvent('pointerdown', clientX, clientY));
    await settle(30);
  });
}

async function windowPointer(type: 'pointermove' | 'pointerup' | 'pointercancel', clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    window.dispatchEvent(pointerEvent(type, clientX, clientY));
    await settle();
  });
}

async function blurWindow(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    await settle();
  });
}

// Stage points: the image sits at 20 % / 20 % with a 30 % × 20 % box on the 960×540 stub.
const START = { x: 300, y: 150 };
const DRAG = { x: 340, y: 150 }; // 40 px → 4.1666 % of the stage width
const DRAG_X_PERCENT = ((DRAG.x - START.x) / STAGE_WIDTH) * 100;

describe('Present M1 — image gesture hardening (PR-005 rest-2)', () => {
  it('does not write the document for an image click below the threshold', async () => {
    const host = await mount();
    const documentBefore = latest;

    await pointerDownOn(imageElement(host), START.x, START.y);
    // 1 px is below the shared threshold and must not mutate the image.
    await windowPointer('pointermove', START.x + PRESENT_GESTURE_DRAG_THRESHOLD_PX - 1, START.y);
    await windowPointer('pointerup', START.x + PRESENT_GESTURE_DRAG_THRESHOLD_PX - 1, START.y);

    expect(latest, 'kein Dokument-Write bei einem Klick auf das Bild').toBe(documentBefore);
    expect(imageGeometry().xPercent).toBeCloseTo(20, 6);
    expect(imageGeometry().yPercent).toBeCloseTo(20, 6);

    // No dangling gesture: a later pointer move writes nothing.
    await windowPointer('pointermove', 600, 300);
    expect(latest, 'kein Listener-Leck nach Klick').toBe(documentBefore);
  });

  it('moves the image once the threshold is crossed and ends cleanly on pointer-up', async () => {
    const host = await mount();
    const start = imageGeometry();

    await pointerDownOn(imageElement(host), START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    await windowPointer('pointerup', DRAG.x, DRAG.y);

    expect(imageGeometry().xPercent, 'Drag jenseits der Schwelle schreibt').toBeCloseTo(
      start.xPercent + DRAG_X_PERCENT,
      4,
    );
    expect(imageGeometry().yPercent).toBeCloseTo(start.yPercent, 6);
    const afterDrag = latest;
    await windowPointer('pointermove', 700, 300);
    expect(latest, 'nach PointerUp läuft keine Bildgeste weiter').toBe(afterDrag);
  });

  it('cancels the local image preview on pointercancel and ignores late events', async () => {
    const host = await mount();
    const start = imageGeometry();
    // Round 40: a move gesture only previews locally; the document is written on pointer-up.
    const documentBefore = latest;

    await pointerDownOn(imageElement(host), START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    expect(latest, 'Move-Drag schreibt das Dokument nicht').toBe(documentBefore);
    expect(imageElement(host).style.transform, 'lokale CSS-Vorschau aktiv').toContain('translate3d');

    await windowPointer('pointercancel', DRAG.x, DRAG.y);
    expect(latest, 'pointercancel verwirft die Vorschau ohne Rollback-Write').toBe(documentBefore);
    expect(imageElement(host).style.transform, 'Vorschau-Transform entfernt').not.toContain('translate3d');
    expect(imageGeometry().xPercent, 'Dokument bleibt auf der Startposition').toBeCloseTo(start.xPercent, 6);
    expect(imageGeometry().yPercent).toBeCloseTo(start.yPercent, 6);

    await windowPointer('pointermove', 700, 300);
    await windowPointer('pointerup', 700, 300);
    expect(latest, 'kein Listener-Leck nach pointercancel').toBe(documentBefore);
    expect(imageGeometry().xPercent).toBeCloseTo(start.xPercent, 6);
  });

  it('cancels the local image preview when the window loses focus (blur)', async () => {
    const host = await mount();
    const start = imageGeometry();
    const documentBefore = latest;

    await pointerDownOn(imageElement(host), START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    expect(latest, 'Move-Drag schreibt das Dokument nicht').toBe(documentBefore);
    expect(imageElement(host).style.transform).toContain('translate3d');

    await blurWindow();
    expect(latest, 'Blur verwirft die Vorschau ohne Dokument-Write').toBe(documentBefore);
    expect(imageElement(host).style.transform, 'Vorschau-Transform entfernt').not.toContain('translate3d');

    await windowPointer('pointermove', 700, 300);
    await windowPointer('pointerup', 700, 300);
    expect(latest, 'keine Mutation nach Blur').toBe(documentBefore);
    expect(imageGeometry().xPercent).toBeCloseTo(start.xPercent, 6);
  });

  it('cancels the local image preview on Escape through the shared single-owner cancel token', async () => {
    const host = await mount();
    const start = imageGeometry();
    const documentBefore = latest;

    await pointerDownOn(imageElement(host), START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    expect(latest, 'Move-Drag schreibt das Dokument nicht').toBe(documentBefore);
    expect(imageElement(host).style.transform).toContain('translate3d');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
    });
    expect(latest, 'Escape verwirft die Vorschau ohne Dokument-Write').toBe(documentBefore);
    expect(imageElement(host).style.transform, 'Vorschau-Transform entfernt').not.toContain('translate3d');

    await windowPointer('pointermove', 700, 300);
    await windowPointer('pointerup', 700, 300);
    expect(latest, 'keine Mutation nach Escape').toBe(documentBefore);
    expect(imageGeometry().xPercent).toBeCloseTo(start.xPercent, 6);
  });

  it('does not resize the image for a handle click below the threshold', async () => {
    const host = await mount();
    const documentBefore = latest;
    const handle = imageResizeHandle(host);

    await pointerDownOn(handle, 480, 250);
    await windowPointer('pointermove', 480 + PRESENT_GESTURE_DRAG_THRESHOLD_PX - 1, 250);
    await windowPointer('pointerup', 480 + PRESENT_GESTURE_DRAG_THRESHOLD_PX - 1, 250);

    expect(latest, 'kein Resize-Write unter der Schwelle').toBe(documentBefore);
    expect(imageGeometry().widthPercent).toBeCloseTo(30, 6);
  });

  it('resizes the image beyond the threshold and rolls it back on pointercancel', async () => {
    const host = await mount();
    const start = imageGeometry();
    const handle = imageResizeHandle(host);

    await pointerDownOn(handle, 480, 250);
    await windowPointer('pointermove', 520, 250);
    expect(imageGeometry().widthPercent, 'Resize jenseits der Schwelle schreibt').toBeGreaterThan(
      start.widthPercent + 1,
    );

    await windowPointer('pointercancel', 520, 250);
    expect(imageGeometry().widthPercent, 'Resize-Rollback auf Startgröße').toBeCloseTo(start.widthPercent, 6);
    expect(imageGeometry().heightPercent).toBeCloseTo(start.heightPercent, 6);
  });
});
