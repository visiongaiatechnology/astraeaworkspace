// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1 (PR-002 rest + PR-005 rest): legacy-header gate and gesture hardening
//
// Two behaviours are proven here against the real `PresentCanvas`:
//   A) PR-002 — a new blank slide shows **no** empty legacy header inputs (category/title/subtitle);
//      the header appears exactly when the document really stores legacy content. Nothing is
//      deleted or migrated, and the blank surface keeps its restrained hint.
//   B) PR-005 — an object drag only starts after the 2 px threshold (a click never writes), and a
//      cancelled pointer / Escape / window blur leaves exactly one clean end state: the start
//      snapshot is restored and no listener keeps writing afterwards.
//
// happy-dom has no layout engine (all rects are 0×0), so the 16:9 stage is stubbed to 960×540 — the
// shipped gesture arithmetic then runs unchanged (same harness as `presentTextEditAndDrag.test.tsx`).
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { PRESENT_GESTURE_DRAG_THRESHOLD_PX } from '../../canvas/PresentStageCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const SHAPE_OBJECT = {
  id: 'obj-1',
  kind: 'shape',
  shape: 'rectangle',
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  xPercent: 20,
  yPercent: 20,
  widthPercent: 20,
  heightPercent: 10,
  zIndex: 1,
};

const BLANK_SLIDE: PresentSlide = {
  id: 'slide-1',
  title: '',
  subtitle: '',
  layout: 'blank',
  cards: [],
  speakerNotes: '',
  sceneObjects: [],
} as PresentSlide;

function slideWith(patch: Partial<PresentSlide> = {}): PresentSlide {
  return { ...BLANK_SLIDE, ...patch } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-m1-hardening',
    title: 'Present M1 hardening',
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

async function settle(ms = 60): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function objectElement(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-object-id="obj-1"]');
  if (!element) throw new Error('scene object not rendered');
  return element;
}

function objectGeometry(): { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number } {
  const slides = latest?.presentData?.slides ?? [];
  const object = (slides[0]?.sceneObjects ?? []).find((candidate) => candidate.id === 'obj-1');
  if (!object) throw new Error('scene object missing in the published document');
  return object as { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number };
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  // happy-dom has no `PointerEvent` constructor; a `MouseEvent` with the pointer type carries the
  // same client coordinates into React's pointer handlers and the window listeners.
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

async function selectObject(host: HTMLElement): Promise<void> {
  await act(async () => {
    objectElement(host).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(0);
  });
}

async function pointerDownOnObject(host: HTMLElement, clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    objectElement(host).dispatchEvent(pointerEvent('pointerdown', clientX, clientY));
    await settle(30);
  });
}

async function windowPointer(type: 'pointermove' | 'pointerup' | 'pointercancel', clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    window.dispatchEvent(pointerEvent(type, clientX, clientY));
    await settle();
  });
}

async function pressEscape(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
  });
}

async function blurWindow(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    await settle();
  });
}

// ---------------------------------------------------------------------------------------------
// A) PR-002 rest — the legacy header is only rendered when legacy content is really stored.
// ---------------------------------------------------------------------------------------------
describe('Present M1 — legacy header only for stored legacy content (PR-002 rest)', () => {
  it('renders no legacy header inputs for a blank slide, but keeps the blank hint', async () => {
    const host = await mount(slideWith());
    expect(host.querySelector('[data-present-legacy-header="true"]'), 'kein Legacy-Header').toBeNull();
    expect(host.querySelector('input[placeholder="Slide Title..."]')).toBeNull();
    expect(host.querySelector('input[placeholder="Slide Subtitle..."]')).toBeNull();
    expect(host.querySelector('input[placeholder="Category tag..."]')).toBeNull();
    // ...and the empty surface still explains itself, restrained.
    expect(host.querySelector('[data-present-blank-hint="true"]'), 'Blank-Hinweis sichtbar').not.toBeNull();
  });

  it('renders the legacy header inputs when a title is stored', async () => {
    const host = await mount(slideWith({ title: 'Stored legacy title' }));
    expect(host.querySelector('[data-present-legacy-header="true"]'), 'Legacy-Header sichtbar').not.toBeNull();
    const title = host.querySelector<HTMLInputElement>('input[placeholder="Slide Title..."]');
    expect(title, 'Titel-Input sichtbar').not.toBeNull();
    expect(title!.value).toBe('Stored legacy title');
    expect(host.querySelector('input[placeholder="Slide Subtitle..."]')).not.toBeNull();
    expect(host.querySelector('input[placeholder="Category tag..."]')).not.toBeNull();
    // A slide with stored content is not a blank canvas.
    expect(host.querySelector('[data-present-blank-hint="true"]')).toBeNull();
  });

  it('renders the legacy header when stored cards exist (cards are legacy content too)', async () => {
    const host = await mount(slideWith({
      layout: 'cards',
      cards: [{ id: 'card-1', title: 'Stored card', description: 'Stored body' }],
    }));
    expect(host.querySelector('[data-present-legacy-header="true"]'), 'Legacy-Header bei Karten').not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// B) PR-005 rest — click threshold, pointercancel, Escape and blur leave a clean end state.
// ---------------------------------------------------------------------------------------------
describe('Present M1 — gesture hardening (PR-005 rest)', () => {
  const START = { x: 300, y: 140 };
  const DRAG = { x: 340, y: 140 }; // 40 px → 4.1666 % of the stubbed 960 px stage
  const DRAG_X_PERCENT = ((DRAG.x - START.x) / STAGE_WIDTH) * 100;

  async function mountSlideWithShape(): Promise<HTMLElement> {
    const host = await mount(slideWith({ sceneObjects: [SHAPE_OBJECT] as never }));
    await selectObject(host);
    return host;
  }

  it('does not write the document for a click below the 2 px threshold', async () => {
    const host = await mountSlideWithShape();
    const start = objectGeometry();
    const documentBefore = latest;

    await pointerDownOnObject(host, START.x, START.y);
    // 1 px is below the threshold constant and must not produce a geometry write.
    await windowPointer('pointermove', START.x + PRESENT_GESTURE_DRAG_THRESHOLD_PX - 1, START.y);
    await windowPointer('pointerup', START.x + PRESENT_GESTURE_DRAG_THRESHOLD_PX - 1, START.y);

    expect(latest, 'kein Dokument-Write bei einem bloßen Klick').toBe(documentBefore);
    expect(objectGeometry().xPercent).toBeCloseTo(start.xPercent, 6);
    expect(objectGeometry().yPercent).toBeCloseTo(start.yPercent, 6);

    // A click must not leave a running gesture: a later pointer move writes nothing.
    await windowPointer('pointermove', 500, 300);
    expect(latest, 'kein hängender Gesten-Listener').toBe(documentBefore);
  });

  it('writes only once the threshold is crossed and ends cleanly on pointer-up', async () => {
    const host = await mountSlideWithShape();
    const start = objectGeometry();
    const documentBefore = latest;

    await pointerDownOnObject(host, START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    // Round 41: during the drag only the local preview moves; the document is untouched.
    expect(latest, 'während des Drags kein Zwischen-Commit').toBe(documentBefore);
    expect(objectElement(host).style.left, 'lokale Vorschau bewegt das Objekt').not.toBe(`${start.xPercent}%`);
    await windowPointer('pointerup', DRAG.x, DRAG.y);

    expect(objectGeometry().xPercent, 'Drag jenseits der Schwelle schreibt bei pointerup').toBeCloseTo(
      start.xPercent + DRAG_X_PERCENT,
      4,
    );
    const afterDrag = latest;
    await windowPointer('pointermove', 600, 300);
    expect(latest, 'nach PointerUp läuft keine Geste weiter').toBe(afterDrag);
  });

  it('cancels the local preview on pointercancel without a document write and leaves no dangling listener', async () => {
    const host = await mountSlideWithShape();
    const start = objectGeometry();
    const documentBefore = latest;

    await pointerDownOnObject(host, START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    expect(latest, 'während des Drags kein Zwischen-Commit').toBe(documentBefore);

    await windowPointer('pointercancel', DRAG.x, DRAG.y);
    expect(latest, 'pointercancel verwirft die Vorschau ohne Dokument-Write').toBe(documentBefore);
    expect(objectGeometry().xPercent, 'Dokument bleibt auf der Startposition').toBeCloseTo(start.xPercent, 6);
    expect(objectGeometry().yPercent).toBeCloseTo(start.yPercent, 6);

    // Late events of the cancelled gesture must not resurrect it.
    await windowPointer('pointermove', 600, 300);
    await windowPointer('pointerup', 600, 300);
    expect(latest, 'kein Listener-Leck nach pointercancel').toBe(documentBefore);
    expect(objectGeometry().xPercent).toBeCloseTo(start.xPercent, 6);
  });

  it('cancels the local preview on Escape and ignores the late pointer-up', async () => {
    const host = await mountSlideWithShape();
    const start = objectGeometry();
    const documentBefore = latest;

    await pointerDownOnObject(host, START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    expect(latest, 'während des Drags kein Zwischen-Commit').toBe(documentBefore);

    await pressEscape();
    expect(latest, 'Escape verwirft die Vorschau ohne Dokument-Write').toBe(documentBefore);
    expect(objectGeometry().xPercent, 'Dokument bleibt auf der Startposition').toBeCloseTo(start.xPercent, 6);

    await windowPointer('pointermove', 600, 300);
    await windowPointer('pointerup', 600, 300);
    expect(latest, 'keine Mutation nach dem Abbruch').toBe(documentBefore);
    expect(objectGeometry().xPercent).toBeCloseTo(start.xPercent, 6);
  });

  it('cancels the local preview when the window loses focus (blur)', async () => {
    const host = await mountSlideWithShape();
    const start = objectGeometry();
    const documentBefore = latest;

    await pointerDownOnObject(host, START.x, START.y);
    await windowPointer('pointermove', DRAG.x, DRAG.y);
    expect(latest, 'während des Drags kein Zwischen-Commit').toBe(documentBefore);

    await blurWindow();
    expect(latest, 'Blur verwirft die Vorschau ohne Dokument-Write').toBe(documentBefore);
    expect(objectGeometry().xPercent, 'Dokument bleibt auf der Startposition').toBeCloseTo(start.xPercent, 6);

    await windowPointer('pointermove', 600, 300);
    await windowPointer('pointerup', 600, 300);
    expect(latest, 'keine Mutation nach Blur').toBe(documentBefore);
  });
});
