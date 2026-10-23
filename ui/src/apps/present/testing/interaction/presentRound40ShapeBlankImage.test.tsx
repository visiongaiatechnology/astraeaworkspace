// @vitest-environment happy-dom
// STATUS: GOLD — Present Round 40: shape drag / blank hint / image-drag performance
//
// Three user findings from the native build:
//   1. Shapes could not be dragged although text could. Root cause: the scene objects are rendered
//      before the `relative z-10` legacy header/body/footer layers, and `createPresentShapeObject`
//      used zIndex 10 as well — natively the later content layer won the hit test, so pointer-down
//      landed on the content and the shape never started a move gesture (text defaults to 20).
//      Fix: content layers are z-0 now and a fresh shape defaults to zIndex 20; the draw tool is
//      single-shot (the overlay only exists while armed) so the next pointer-down starts a MOVE.
//   2. The dashed blank hint stayed forever once anything was inserted. Fix: visibility is coupled
//      to real canvas content (`sceneObjects`/`images`) and the hint never receives pointer events.
//   3. Image dragging committed the document on every animation frame. Fix: the move drag is a
//      local CSS transform preview updated per rAF; the single document/history commit happens on
//      pointer-up. The renderer is memoized. Real latency is IMPLEMENTED_NOT_VERIFIED — this test
//      only measures the update *shape* (0 intermediate commits, 1 commit on release).
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const IMAGE_OBJECT = {
  id: 'image-1',
  kind: 'image',
  name: 'Photo',
  altText: 'A test image',
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  xPercent: 20,
  yPercent: 20,
  widthPercent: 24,
  heightPercent: 18,
  zIndex: 25,
};

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
  document.body.innerHTML = '';
});

function slideWith(sceneObjects: unknown[] = [], images: unknown[] = []): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: sceneObjects as never,
    images: images as never,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-round-40',
    title: 'Present Round 40',
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

function stage(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('stage not rendered');
  return element;
}

function sceneObjects(): Array<Record<string, unknown>> {
  return ((latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as unknown) as Array<Record<string, unknown>>;
}

function images(): Array<Record<string, unknown>> {
  return ((latest?.presentData?.slides?.[0]?.images ?? []) as unknown) as Array<Record<string, unknown>>;
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(60);
  });
}

async function pressKey(init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    await settle(60);
  });
}

interface DragOptions { moveSteps?: number }

/** Press on `pressTarget`, emit one or more window pointermoves (each awaited across a frame), release. */
async function drag(
  pressTarget: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: DragOptions = {},
): Promise<void> {
  const steps = Math.max(1, options.moveSteps ?? 1);
  await act(async () => {
    pressTarget.dispatchEvent(pointerEvent('pointerdown', from.x, from.y));
    await settle(30);
  });
  for (let step = 1; step <= steps; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / steps;
    const y = from.y + ((to.y - from.y) * step) / steps;
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', x, y));
      await settle(30);
    });
  }
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointerup', to.x, to.y));
    await settle(60);
  });
}

describe('Present Round 40 — shape drag + blank hint (P0)', () => {
  it('inserts a circle as a single shot and then MOVES it by pointer drag (no second circle)', async () => {
    const host = await mount(slideWith());
    expect(host.querySelector('[data-present-blank-hint="true"]'), 'leere Blank zeigt den Hinweis').not.toBeNull();

    // Insert an ellipse through the real toolbar palette + a stage click.
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    expect(trigger, 'Formen-Menü-Trigger').not.toBeNull();
    await clickElement(trigger!);
    const ellipseItem = document.querySelector<HTMLElement>('[data-present-shape-key="ellipse"]');
    expect(ellipseItem, 'Kreis-Option im Portal').not.toBeNull();
    await clickElement(ellipseItem!);
    expect(stage(host).getAttribute('data-present-shape-tool'), 'Werkzeug scharf').toBe('ellipse');

    await act(async () => {
      stage(host).dispatchEvent(pointerEvent('pointerdown', 300, 200));
      await settle(30);
      window.dispatchEvent(pointerEvent('pointerup', 300, 200));
      await settle(60);
    });
    expect(sceneObjects(), 'genau ein Kreis').toHaveLength(1);
    expect(sceneObjects()[0]!.kind).toBe('shape');
    // Single-shot: the tool is disarmed, the overlay is gone and the hint disappears with content.
    expect(stage(host).getAttribute('data-present-shape-tool'), 'Werkzeug nach dem Zeichnen deaktiviert').toBeNull();
    expect(host.querySelector('[data-present-blank-hint="true"]'), 'Hinweis nach dem ersten Objekt weg').toBeNull();
    expect(document.querySelector('[data-present-shape-draft="true"]'), 'kein Overlay mehr').toBeNull();

    // The newly drawn shape must be draggable exactly like a text box.
    const shape = host.querySelector<HTMLElement>('[data-present-object-id]')!;
    const before = { xPercent: sceneObjects()[0]!.xPercent as number, yPercent: sceneObjects()[0]!.yPercent as number };
    await drag(shape, { x: 300, y: 200 }, { x: 348, y: 224 });
    const after = sceneObjects()[0]!;
    expect(after.xPercent, 'Shape bewegt sich mit dem Drag').toBeCloseTo(before.xPercent + 5, 3);
    expect(after.yPercent, 'Shape bewegt sich auch vertikal').toBeCloseTo(before.yPercent + (24 / STAGE_HEIGHT) * 100, 3);
    // No second shape was created by the drag and the tool stayed disarmed.
    expect(sceneObjects(), 'kein zweiter Kreis durch den Drag').toHaveLength(1);
    expect(stage(host).getAttribute('data-present-shape-tool')).toBeNull();

    // Resize handle of the shape works too (same affordances as text).
    const handle = host.querySelector<HTMLElement>('[data-present-object-id] [data-present-handle="resize-se"]');
    expect(handle, 'Resize-Handle am Shape').not.toBeNull();
    const widthBefore = sceneObjects()[0]!.widthPercent as number;
    await drag(handle!, { x: 360, y: 240 }, { x: 384, y: 240 });
    expect(sceneObjects()[0]!.widthPercent, 'Shape resizebar').toBeCloseTo(widthBefore + 2.5, 3);
  });

  it('blank hint visibility follows real content (scene objects and images)', async () => {
    const host = await mount(slideWith());
    expect(host.querySelector('[data-present-blank-hint="true"]')).not.toBeNull();

    // An image alone is canvas content — the hint must not claim the slide is empty.
    const imageHost = await (async () => {
      await act(async () => { root!.unmount(); });
      root = null;
      container?.remove();
      return mount(slideWith([], [IMAGE_OBJECT]));
    })();
    expect(images(), 'Bild im Dokument').toHaveLength(1);
    expect(imageHost.querySelector('[data-present-blank-hint="true"]'), 'Bild zählt als Inhalt').toBeNull();

    // No canvas content again → the hint returns (same document, image removed by the renderer path).
    await act(async () => { root!.unmount(); });
    root = null;
    container?.remove();
    const emptyHost = await mount(slideWith());
    expect(emptyHost.querySelector('[data-present-blank-hint="true"]')).not.toBeNull();
  });

  it('image move drag commits the document exactly once on pointer-up (local rAF preview)', async () => {
    const host = await mount(slideWith([], [IMAGE_OBJECT]));
    const image = host.querySelector<HTMLElement>('[data-present-object="true"]');
    expect(image, 'Bild gerendert').not.toBeNull();
    const documentBefore = latest;
    const xBefore = images()[0]!.xPercent as number;

    // Press on the image, then move across several animation frames.
    await act(async () => {
      image!.dispatchEvent(pointerEvent('pointerdown', 200, 130));
      await settle(30);
    });
    const intermediateDocuments: unknown[] = [];
    const transforms: string[] = [];
    for (let step = 1; step <= 5; step += 1) {
      await act(async () => {
        window.dispatchEvent(pointerEvent('pointermove', 200 + step * 9.6, 130 + step * 10.8));
        await settle(30);
      });
      intermediateDocuments.push(latest);
      // rAF-coalesced local preview: the image transform changes while the document does not.
      transforms.push(image!.style.transform);
    }
    expect(intermediateDocuments.every((document) => document === documentBefore), 'kein Zwischen-Commit pro Frame').toBe(true);
    expect(images()[0]!.xPercent, 'Dokument während des Drags unverändert').toBe(xBefore);
    expect(transforms.some((transform) => transform.includes('translate3d')), 'lokale CSS-Transform-Vorschau aktiv').toBe(true);

    // Release: exactly one document write with the final geometry.
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointerup', 248, 184));
      await settle(60);
    });
    expect(latest, 'ein Dokument-Commit bei pointerup').not.toBe(documentBefore);
    const xAfter = images()[0]!.xPercent as number;
    expect(xAfter).toBeCloseTo(xBefore + (48 / STAGE_WIDTH) * 100, 3);
    expect(images()[0]!.yPercent as number).toBeCloseTo(20 + (54 / STAGE_HEIGHT) * 100, 3);
    expect(image!.style.transform, 'Preview-Transform nach dem Commit weg').not.toContain('translate3d');

    // One undo step reverts the whole drag (single history commit).
    await pressKey({ key: 'z', ctrlKey: true });
    expect(images()[0]!.xPercent, 'ein Undo stellt die Startposition wieder her').toBeCloseTo(xBefore, 6);
  });
});
