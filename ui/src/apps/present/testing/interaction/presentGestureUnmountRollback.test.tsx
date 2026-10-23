// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1 (PR-005): unmount rollback for running gestures
//
// The stage can disappear while a pointer gesture is still running (slide switch, view switch). The
// drag may already have written frames — those must not survive as a half mutation. The effect
// cleanup therefore runs the *same* rollback as `pointercancel`: the gesture-start snapshot is
// restored under the same coalesce key. These tests drive the real `PresentCanvas`, unmount it
// mid-drag and assert on the documents that actually reached `onUpdateDocument`.
//
// happy-dom has no layout engine (0×0 rects), so the 16:9 stage is stubbed to 960×540; the shipped
// gesture arithmetic then runs unchanged.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const TEXT_OBJECT = {
  id: 'obj-1',
  kind: 'text',
  text: 'Drag me',
  xPercent: 20,
  yPercent: 20,
  widthPercent: 30,
  heightPercent: 20,
  fontSizePt: 22,
  fontWeight: 'semibold',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  zIndex: 20,
};

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

function slideWith(patch: Partial<PresentSlide> = {}): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [],
    ...patch,
  } as PresentSlide;
}

const TEXT_SLIDE = slideWith({ sceneObjects: [TEXT_OBJECT] as never });
const IMAGE_SLIDE = slideWith({ images: [IMAGE_OBJECT] });

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-m1-unmount-rollback',
    title: 'Present M1 unmount rollback',
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
/** Every document that reached `onUpdateDocument` — the observable write history. */
let updates: WorkspaceDocument[] = [];
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
  updates = [];
  latest = null;
});

function ControlledPresenter({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  latest = document;
  return createElement(PresentCanvas, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => {
      updates.push(next);
      setDocument(next);
    },
    workspaceDocuments: [],
    networkCapability: 'offline',
    keyVaultUnlocked: false,
    onSelectSelectionType: vi.fn(),
  } as never);
}

async function mount(slide: PresentSlide): Promise<HTMLElement> {
  updates = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith(slide) }));
  });
  return container;
}

async function settle(ms = 60): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

function objectElement(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-object-id="obj-1"]');
  if (!element) throw new Error('scene object not rendered');
  return element;
}

function imageElement(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[aria-label^="Image object"]');
  if (!element) throw new Error('floating image not rendered');
  return element;
}

async function pointerDownOn(target: Element, clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    target.dispatchEvent(pointerEvent('pointerdown', clientX, clientY));
    await settle(30);
  });
}

async function windowPointer(type: 'pointermove' | 'pointerup', clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    window.dispatchEvent(pointerEvent(type, clientX, clientY));
    await settle();
  });
}

async function unmountStage(): Promise<void> {
  await act(async () => { root!.unmount(); });
  root = null;
}

function sceneObjectIn(document: WorkspaceDocument | null | undefined) {
  return (document?.presentData?.slides?.[0]?.sceneObjects ?? []).find(
    (candidate) => candidate.id === 'obj-1',
  ) as { xPercent: number; yPercent: number } | undefined;
}

function imageIn(document: WorkspaceDocument | null | undefined) {
  return (document?.presentData?.slides?.[0]?.images ?? []).find(
    (candidate) => candidate.id === 'img-1',
  ) as { xPercent: number; yPercent: number } | undefined;
}

const START = { x: 300, y: 200 };
const DRAG = { x: 340, y: 200 };

describe('Present M1 — unmount rollback for running gestures (PR-005)', () => {
  it('discards a scene drag preview when the stage unmounts mid-drag (no document write)', async () => {
    const host = await mount(TEXT_SLIDE);
    const startX = sceneObjectIn(latest)!.xPercent;
    expect(updates, 'keine Writes vor der Geste').toHaveLength(0);

    await pointerDownOn(objectElement(host), START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    // Round 41: the scene drag is a local preview; no document write while dragging.
    expect(updates.length, 'der Scene-Drag schreibt nicht pro Frame').toBe(0);
    expect(objectElement(host).style.left, 'lokale Vorschau bewegt das Objekt').not.toBe(`${startX}%`);

    await unmountStage();
    expect(updates.length, 'Unmount einer Vorschau schreibt nichts').toBe(0);
    expect(sceneObjectIn(latest)!.xPercent, 'Dokument bleibt auf der Startposition').toBeCloseTo(startX, 6);

    // The stage is gone, but a leaked window listener must not be able to write anything.
    await windowPointer('pointermove', 700, 300);
    await windowPointer('pointerup', 700, 300);
    expect(updates.length, 'keine Mutation nach dem Unmount').toBe(0);
  });

  it('keeps an image move preview out of the document when the stage unmounts mid-drag', async () => {
    const host = await mount(IMAGE_SLIDE);
    const startX = imageIn(latest)!.xPercent;

    await pointerDownOn(imageElement(host), START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    // Round 40: the move gesture is a local CSS preview; no document write while dragging.
    expect(updates.length, 'der Bild-Move-Drag schreibt nicht pro Frame').toBe(0);
    expect(imageElement(host).style.transform, 'lokale Vorschau aktiv').toContain('translate3d');

    await unmountStage();
    expect(updates.length, 'Unmount einer reinen Move-Vorschau schreibt nichts').toBe(0);
    expect(imageIn(latest)!.xPercent, 'Dokument bleibt auf der Startposition').toBeCloseTo(startX, 6);

    await windowPointer('pointermove', 700, 300);
    await windowPointer('pointerup', 700, 300);
    expect(updates.length, 'keine Mutation nach dem Unmount').toBe(0);
  });

  it('writes nothing when the stage unmounts before the drag threshold (scene and image)', async () => {
    // Scene object: pointer-down only — the 2 px threshold was never crossed.
    const sceneHost = await mount(TEXT_SLIDE);
    await pointerDownOn(objectElement(sceneHost), START.x, START.y);
    await unmountStage();
    expect(updates, 'kein Write beim Unmount vor der Schwelle (Szene)').toHaveLength(0);

    // Floating image: same rule.
    const imageHost = await mount(IMAGE_SLIDE);
    await pointerDownOn(imageElement(imageHost), START.x, START.y);
    await unmountStage();
    expect(updates, 'kein Write beim Unmount vor der Schwelle (Bild)').toHaveLength(0);

    // Late events after the unmount cannot write either.
    await windowPointer('pointermove', 700, 300);
    await windowPointer('pointerup', 700, 300);
    expect(updates).toHaveLength(0);
  });

  it('does not roll back a gesture that finished normally before the unmount', async () => {
    const host = await mount(TEXT_SLIDE);
    const startX = sceneObjectIn(latest)!.xPercent;

    await pointerDownOn(objectElement(host), START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    await windowPointer('pointerup', DRAG.x, DRAG.y);

    const writtenX = sceneObjectIn(updates[updates.length - 1])!.xPercent;
    expect(writtenX, 'abgeschlossener Drag bleibt geschrieben').toBeGreaterThan(startX + 2);
    const writesAfterGesture = updates.length;

    await unmountStage();
    expect(updates.length, 'kein Rollback für eine beendete Geste').toBe(writesAfterGesture);
    expect(sceneObjectIn(updates[updates.length - 1])!.xPercent).toBeCloseTo(writtenX, 6);
  });
});
