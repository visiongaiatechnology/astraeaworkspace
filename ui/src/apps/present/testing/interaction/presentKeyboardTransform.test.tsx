// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1: keyboard transforms (Round 21)
//
// The status line promises "Alt+arrows resize, [ ] rotate". This file measures that promise with real
// keydown events on the window (the single keyboard owner resolves them) and asserts on the
// published document: exact deltas, constraints, group behaviour and the history shape (one step —
// or the documented coalescing key).
//
// Measured Ist-Zustand (komplett vorhanden, kein Fix nötig):
//   Alt+Arrow:  +1 % width (Right) / −1 % (Left), +1 % height (Down) / −1 % (Up), top-left anchored;
//               floors width 3 % (normalizer after the 2 % resize clamp), height 2 %;
//   [ / ]:      ∓5°, Shift coarse 15°; folded into (−180°, 180°] (36 × ] = 180°, the 37th = −175°);
//   Shift+Arrow: +2 % nudge (plain arrow +0.25 %);
//   multi:      resize and rotate apply to the whole selection (pure rules iterate the selection);
//   history:    coalesce keys `keyboard-nudge` / `keyboard-resize` / `keyboard-rotate` — a run of the
//               same key is ONE undo step; a different command type opens a new step.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { presentRotationDegrees } from '../../canvas/model/presentTransform';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const TEXT_OBJECT = {
  id: 'text-1',
  kind: 'text',
  text: 'Transform me',
  xPercent: 20,
  yPercent: 20,
  widthPercent: 30,
  heightPercent: 20,
  fontSizePt: 22,
  fontWeight: 'semibold',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  zIndex: 10,
};

const SHAPE_OBJECT = {
  id: 'shape-1',
  kind: 'shape',
  shape: 'rectangle',
  xPercent: 55,
  yPercent: 55,
  widthPercent: 20,
  heightPercent: 10,
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  opacity: 1,
  zIndex: 20,
};

function slideWithObjects(): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [TEXT_OBJECT, SHAPE_OBJECT] as never,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-keyboard-transform',
    title: 'Present keyboard transform',
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
    root!.render(createElement(ControlledPresenter, { start: documentWith(slideWithObjects()) }));
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

function objectElement(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`object ${id} not rendered`);
  return element;
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

function selectedIds(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-present-object-id]'))
    .filter((element) => element.getAttribute('data-present-object-selected') === 'true')
    .map((element) => element.dataset.presentObjectId ?? '')
    .sort();
}

function selectionStatus(host: HTMLElement): string {
  return host.querySelector<HTMLElement>('[data-present-selection-status="true"]')?.textContent?.trim() ?? '';
}

async function pressKey(target: Element | Window, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await settle();
  });
  return event;
}

async function clickElement(target: Element, init: MouseEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    await settle();
  });
}

async function selectObject(host: HTMLElement, id: string, init: MouseEventInit = {}): Promise<void> {
  await clickElement(objectElement(host, id), init);
}

describe('Present M1 — keyboard transforms (Round 21)', () => {
  it('Fall 1: Alt+Arrow resizes by +1 % per press with the anchored top-left edge and documented floors', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    const start = geometry('text-1');
    expect(selectionStatus(host), 'Statuszeile verspricht Alt+arrows resize').toContain('Alt+arrows resize');

    const right = await pressKey(window, { key: 'ArrowRight', altKey: true });
    expect(right.defaultPrevented, 'Alt+ArrowRight ist ein Present-Command').toBe(true);
    expect(geometry('text-1')).toEqual({
      xPercent: start.xPercent,
      yPercent: start.yPercent,
      widthPercent: start.widthPercent + 1,
      heightPercent: start.heightPercent,
    });

    await pressKey(window, { key: 'ArrowDown', altKey: true });
    expect(geometry('text-1').heightPercent, 'Alt+ArrowDown +1 % Höhe').toBe(start.heightPercent + 1);
    await pressKey(window, { key: 'ArrowLeft', altKey: true });
    expect(geometry('text-1').widthPercent, 'Alt+ArrowLeft −1 % Breite').toBe(start.widthPercent);
    await pressKey(window, { key: 'ArrowUp', altKey: true });
    expect(geometry('text-1').heightPercent).toBe(start.heightPercent);

    // Floors: shrink far beyond the minimum; width normalises to 3 %, height to 2 %.
    for (let index = 0; index < 40; index += 1) await pressKey(window, { key: 'ArrowLeft', altKey: true });
    for (let index = 0; index < 40; index += 1) await pressKey(window, { key: 'ArrowUp', altKey: true });
    expect(geometry('text-1').widthPercent, 'Mindestbreite (Normalizer 3 %)').toBe(3);
    expect(geometry('text-1').heightPercent, 'Mindesthöhe (2 %)').toBe(2);
    // The anchored top-left corner never moved.
    expect(geometry('text-1').xPercent).toBe(start.xPercent);
    expect(geometry('text-1').yPercent).toBe(start.yPercent);
  });

  it('Fall 2: [ / ] rotate the selection by 5° (15° with Shift), folding into (−180°, 180°]', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    expect(selectionStatus(host), 'Statuszeile verspricht [ ] rotate').toContain('[ ] rotate');
    expect(presentRotationDegrees(objectById('text-1').rotation as number | undefined)).toBe(0);

    await pressKey(window, { key: ']' });
    expect(presentRotationDegrees(objectById('text-1').rotation as number), '] : +5°').toBe(5);
    await pressKey(window, { key: ']' });
    expect(presentRotationDegrees(objectById('text-1').rotation as number)).toBe(10);
    await pressKey(window, { key: ']', shiftKey: true });
    expect(presentRotationDegrees(objectById('text-1').rotation as number), 'Shift+] : +15°').toBe(25);
    await pressKey(window, { key: '[' });
    expect(presentRotationDegrees(objectById('text-1').rotation as number), '[ : −5°').toBe(20);

    // Fold at 180°: 36 presses = 180°, the 37th wraps to −175° (never stuck at a clamp).
    let rotation = presentRotationDegrees(objectById('text-1').rotation as number);
    for (let index = 0; index < 32; index += 1) {
      await pressKey(window, { key: ']' });
      rotation = presentRotationDegrees(objectById('text-1').rotation as number);
    }
    expect(rotation, '36 Pressen ≡ 180°').toBe(180);
    await pressKey(window, { key: ']' });
    expect(presentRotationDegrees(objectById('text-1').rotation as number), '37. Presse faltet auf −175°').toBe(-175);
  });

  it('Fall 3: Shift+Arrow keeps the coarse +2 % nudge (counter-check to the keyboard contract)', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    const x0 = geometry('text-1').xPercent;
    const y0 = geometry('text-1').yPercent;

    await pressKey(window, { key: 'ArrowRight' });
    expect(geometry('text-1').xPercent, 'plain Pfeil = +0.25 %').toBeCloseTo(x0 + 0.25, 6);
    await pressKey(window, { key: 'ArrowRight', shiftKey: true });
    expect(geometry('text-1').xPercent, 'Shift+Pfeil = +2 %').toBeCloseTo(x0 + 2.25, 6);
    await pressKey(window, { key: 'ArrowDown', shiftKey: true });
    expect(geometry('text-1').yPercent, 'Shift+Pfeil unten = +2 %').toBeCloseTo(y0 + 2, 6);
  });

  it('Fall 4: keyboard transforms apply to the whole multi-selection', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    await selectObject(host, 'shape-1', { shiftKey: true });
    expect(selectedIds(host), 'beide Objekte ausgewählt').toEqual(['shape-1', 'text-1']);

    const textStart = geometry('text-1');
    const shapeStart = geometry('shape-1');
    await pressKey(window, { key: 'ArrowRight', altKey: true });
    expect(geometry('text-1').widthPercent, 'text-1 resized').toBe(textStart.widthPercent + 1);
    expect(geometry('shape-1').widthPercent, 'shape-1 resized gleichzeitig').toBe(shapeStart.widthPercent + 1);

    await pressKey(window, { key: ']' });
    expect(presentRotationDegrees(objectById('text-1').rotation as number), 'text-1 rotiert').toBe(5);
    expect(presentRotationDegrees(objectById('shape-1').rotation as number), 'shape-1 rotiert').toBe(5);
  });

  it('Fall 5: history — one same-key run coalesces into one step; different command types are separate steps', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    const start = geometry('text-1');

    // Three plain nudges share the coalesce key "keyboard-nudge" → one history entry.
    await pressKey(window, { key: 'ArrowRight' });
    await pressKey(window, { key: 'ArrowRight' });
    await pressKey(window, { key: 'ArrowRight' });
    expect(geometry('text-1').xPercent).toBeCloseTo(start.xPercent + 0.75, 6);

    // A resize opens its own entry ("keyboard-resize").
    await pressKey(window, { key: 'ArrowRight', altKey: true });
    expect(geometry('text-1').widthPercent).toBe(start.widthPercent + 1);

    // Undo 1 reverts only the resize; the nudged run is still applied.
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(geometry('text-1').widthPercent, 'Undo 1: Resize zurück').toBe(start.widthPercent);
    expect(geometry('text-1').xPercent, 'Nudge-Run bleibt').toBeCloseTo(start.xPercent + 0.75, 6);

    // Undo 2 reverts the whole coalesced nudge run in ONE step (documented coalescing).
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(geometry('text-1').xPercent, 'Undo 2: Nudge-Run als ein Schritt').toBeCloseTo(start.xPercent, 6);

    // Redo restores the run (one step) and then the resize.
    await pressKey(window, { key: 'y', ctrlKey: true });
    expect(geometry('text-1').xPercent).toBeCloseTo(start.xPercent + 0.75, 6);
    await pressKey(window, { key: 'y', ctrlKey: true });
    expect(geometry('text-1').widthPercent).toBe(start.widthPercent + 1);

    // A rotation is its own key: undo it separately from the resize.
    const rotationBefore = presentRotationDegrees(objectById('text-1').rotation as number | undefined);
    await pressKey(window, { key: ']' });
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(presentRotationDegrees(objectById('text-1').rotation as number), 'Rotation undo').toBe(rotationBefore);
    expect(geometry('text-1').widthPercent, 'Resize bleibt erhalten').toBe(start.widthPercent + 1);
  });
});
