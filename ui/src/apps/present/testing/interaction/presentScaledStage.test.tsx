// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1: scaled/stretched/minimal stage geometry (Round 22)
//
// Every earlier interaction test stubs the stage at 960×540. The real canvas is window/zoom
// dependent, so this matrix measures the *fixed* coordinate chain against different
// `getBoundingClientRect()` values: pointer→percent, drag deltas, resize deltas, a rect that changes
// between gestures and the zero-rect mount state. Document assertions only.
//
// Measured Ist-Zustand (all correct — `toPercent` → `presentPercentFromClientPoint` and the drag/resize
// effects read the live rect on every event; `presentRect.ts:169-178` returns null for width/height
// <= 0, so no division by zero):
//   - 480×270: dblclick (240,135) creates x=50 %, y=50 %; 48 px drag = +10 %; 24 px resize = +5 %;
//   - 1200×540: (600,135) maps to 50 % / 25 %; 120 px/+54 px drag = +10 %/+10 % per axis;
//   - 200×112: creation + drag work, 20 px = +10 %, min sizes clamp (3 % / 2 %), all finite;
//   - rect change 960→480 between gestures: the next gesture uses the new rect (nothing cached);
//   - zero rect: dblclick/pointer gesture write nothing, no throw.
//
// happy-dom has no layout/hit-testing, so a "click at coordinates" cannot hit an element. The
// pointer→percent mapping is therefore measured through the same `toPercent` chain using the
// double-click creation path; drag/resize deltas are measured through real pointer events.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

let stageRect = { width: 960, height: 540 };

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  stageRect = { width: 960, height: 540 };
  Element.prototype.getBoundingClientRect = function stubbedStageRect(): DOMRect {
    return {
      x: 0, y: 0, width: stageRect.width, height: stageRect.height,
      top: 0, left: 0, right: stageRect.width, bottom: stageRect.height,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

function setStageRect(width: number, height: number): void {
  stageRect = { width, height };
}

const textObject = (id: string, xPercent: number, yPercent: number): Record<string, unknown> => ({
  id,
  kind: 'text',
  text: '',
  xPercent,
  yPercent,
  widthPercent: 20,
  heightPercent: 12,
  fontSizePt: 22,
  fontWeight: 'semibold',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  zIndex: 10,
});

function slideWith(sceneObjects: unknown[]): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: sceneObjects as never,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-scaled-stage',
    title: 'Present scaled stage',
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

async function mount(sceneObjects: unknown[] = []): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith(slideWith(sceneObjects)) }));
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

function objectElement(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
}

function sceneObjects(): Array<Record<string, unknown>> {
  return (latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
}

function objectById(id: string): Record<string, unknown> {
  const object = sceneObjects().find((candidate) => candidate.id === id);
  if (!object) throw new Error(`object ${id} missing in the published document`);
  return object;
}

function geometry(id: string): { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number } {
  const object = objectById(id);
  return {
    xPercent: object.xPercent as number,
    yPercent: object.yPercent as number,
    widthPercent: object.widthPercent as number,
    heightPercent: object.heightPercent as number,
  };
}

function pointerEvent(type: string, clientX: number, clientY: number, init: PointerEventInit = {}): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, ...(init as MouseEventInit) });
}

async function doubleClickAt(target: Element, clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY }));
    await settle(60);
  });
}

/** One pointer drag: press on `pressTarget`, move on the window, release. */
async function drag(
  pressTarget: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await act(async () => {
    pressTarget.dispatchEvent(pointerEvent('pointerdown', from.x, from.y));
    await settle(30);
  });
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointermove', to.x, to.y));
    await settle(60);
  });
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointerup', to.x, to.y));
    await settle(60);
  });
}

describe('Present M1 — scaled stage geometry (Round 22)', () => {
  it('Fall 1: half-size stage (480×270) — creation, drag and resize use the real rect', async () => {
    setStageRect(480, 270);
    const host = await mount([]);

    // (240,135) of 480×270 is the centre → the created text box starts at 50 % / 50 %.
    await doubleClickAt(stage(host), 240, 135);
    expect(sceneObjects(), 'Doppelklick erzeugt ein Textobjekt').toHaveLength(1);
    const created = sceneObjects()[0];
    expect(created.xPercent, 'x = 240/480').toBeCloseTo(50, 4);
    expect(created.yPercent, 'y = 135/270').toBeCloseTo(50, 4);
    const createdId = created.id as string;

    // Drag by 48 px of 480 = 10 % (960 would be 5 %).
    await drag(objectElement(host, createdId)!, { x: 240, y: 135 }, { x: 288, y: 135 });
    expect(geometry(createdId).xPercent, '48 px Draggen = +10 % (nicht +5 %)').toBeCloseTo(60, 3);
    expect(geometry(createdId).yPercent).toBeCloseTo(50, 3);

    // Resize handle drag: 24 px of 480 = 5 % width (se handle grows width/height).
    const handle = host.querySelector<HTMLElement>(`[data-present-object-id="${createdId}"] [data-present-handle="resize-se"]`);
    expect(handle, 'se-Resize-Handle gerendert').not.toBeNull();
    await drag(handle!, { x: 300, y: 160 }, { x: 324, y: 160 });
    expect(geometry(createdId).widthPercent, '24 px Handle-Drag = +5 % Breite').toBeCloseTo(39, 3);
  });

  it('Fall 2: stretched stage (1200×540) — pointer→percent maps per axis without distortion', async () => {
    setStageRect(1200, 540);
    const host = await mount([]);

    // happy-dom has no layout/hit-testing, so the pointer→percent mapping is measured through the
    // creation path (the same `toPercent` chain): (600,135) of 1200×540 = 50 % / 25 %. A square or
    // 960-based normalisation would produce different numbers.
    await doubleClickAt(stage(host), 600, 135);
    expect(sceneObjects(), 'Doppelklick erzeugt ein Objekt').toHaveLength(1);
    const created = sceneObjects()[0];
    expect(created.xPercent, '600/1200 = 50 %').toBeCloseTo(50, 4);
    expect(created.yPercent, '135/540 = 25 % (nicht 25 % von 1200)').toBeCloseTo(25, 4);
    const createdId = created.id as string;

    // Drag by 120 px x and 54 px y: both are exactly +10 % of their own axis (no distortion).
    await drag(objectElement(host, createdId)!, { x: 600, y: 135 }, { x: 720, y: 189 });
    expect(geometry(createdId).xPercent, '120/1200 = +10 %').toBeCloseTo(60, 3);
    expect(geometry(createdId).yPercent, '54/540 = +10 %').toBeCloseTo(35, 3);
  });

  it('Fall 3: very small stage (200×112) — creation/drag work, minimum sizes clamp, no div-by-zero', async () => {
    setStageRect(200, 112);
    const host = await mount([]);

    await doubleClickAt(stage(host), 100, 56);
    expect(sceneObjects(), 'Doppelklick erzeugt ein Objekt').toHaveLength(1);
    const created = sceneObjects()[0];
    expect(created.xPercent as number).toBeCloseTo(50, 4);
    expect(created.yPercent as number).toBeCloseTo(50, 4);
    const createdId = created.id as string;

    await drag(objectElement(host, createdId)!, { x: 100, y: 56 }, { x: 120, y: 56 });
    expect(geometry(createdId).xPercent, '20 px von 200 = +10 %').toBeCloseTo(60, 3);
    for (const value of Object.values(geometry(createdId))) {
      expect(Number.isFinite(value), 'keine NaN/Infinity-Geometrie').toBe(true);
    }

    // Shrink far beyond the minimum via the se handle: width floors at 3 %, height at 2 %.
    const handle = host.querySelector<HTMLElement>(`[data-present-object-id="${createdId}"] [data-present-handle="resize-se"]`);
    await drag(handle!, { x: 140, y: 62 }, { x: 40, y: 12 });
    expect(geometry(createdId).widthPercent, 'Mindestbreite 3 %').toBe(3);
    expect(geometry(createdId).heightPercent, 'Mindesthöhe 2 %').toBe(2);
  });

  it('Fall 4: a rect change between gestures is picked up — nothing is cached', async () => {
    setStageRect(960, 540);
    // A far-away neighbour only keeps the scene non-empty; it must not snap into the measured drag.
    const host = await mount([textObject('far-1', 80, 80)]);

    // The rect changes between the gestures (layout resize). The next pointer event must use it:
    // (240,135) of 480×270 is 50 % / 50 %, a cached 960 rect would produce 25 % / 25 %.
    setStageRect(480, 270);
    await doubleClickAt(stage(host), 240, 135);
    expect(sceneObjects(), 'zweites Objekt erzeugt').toHaveLength(2);
    const created = sceneObjects()[1];
    expect(created.xPercent, 'neue Rect: 240/480 = 50 %').toBeCloseTo(50, 4);
    expect(created.yPercent, 'neue Rect: 135/270 = 50 %').toBeCloseTo(50, 4);
    const createdId = created.id as string;

    // And the drag after the change uses the new width: 48 px of 480 = +10 % (960 would be +5 %).
    await drag(objectElement(host, createdId)!, { x: 240, y: 135 }, { x: 288, y: 135 });
    expect(geometry(createdId).xPercent, '48 px von 480 = +10 %').toBeCloseTo(60, 3);
  });

  it('Fall 5: zero rect — dblclick and pointer gestures write nothing and never throw', async () => {
    setStageRect(0, 0);
    const host = await mount([textObject('zero-1', 40, 40)]);
    const emptyBefore = JSON.stringify(sceneObjects());

    // A double click cannot be mapped onto the slide → no object is created.
    await doubleClickAt(stage(host), 100, 100);
    expect(sceneObjects(), 'Zero-Rect: Doppelklick erzeugt nichts').toHaveLength(1);

    // A pointer drag cannot be measured → the document is untouched (gesture starts, then early-returns).
    await drag(objectElement(host, 'zero-1')!, { x: 100, y: 100 }, { x: 148, y: 100 });
    expect(JSON.stringify(sceneObjects()), 'Zero-Rect: Drag schreibt nichts').toBe(emptyBefore);
    expect(geometry('zero-1').xPercent).toBe(40);
    expect(Number.isFinite(geometry('zero-1').xPercent), 'kein NaN/Infinity').toBe(true);
  });
});
