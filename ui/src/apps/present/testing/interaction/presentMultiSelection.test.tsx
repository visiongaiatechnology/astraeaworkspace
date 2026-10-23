// @vitest-environment happy-dom
// STATUS: GOLD — Present M1: multi-object selection and manipulation (Round 19)
//
// The marquee, additive selection state, group moves, group delete/undo and group nudge are measured
// here against the real `PresentCanvas` with real pointer/keyboard events. The Ist-Verhalten is
// pinned; only the DOM/document is asserted, never internal component state.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const TEXT_A = {
  id: 'text-a',
  kind: 'text',
  text: 'Object A',
  xPercent: 10,
  yPercent: 10,
  widthPercent: 20,
  heightPercent: 15,
  fontSizePt: 20,
  fontWeight: 'semibold',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  zIndex: 10,
};

const SHAPE_B = {
  id: 'shape-b',
  kind: 'shape',
  shape: 'rectangle',
  xPercent: 40,
  yPercent: 20,
  widthPercent: 20,
  heightPercent: 15,
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  opacity: 1,
  zIndex: 20,
};

const TEXT_C = {
  ...TEXT_A,
  id: 'text-c',
  text: 'Object C',
  xPercent: 70,
  yPercent: 60,
  zIndex: 30,
};

function slideWithObjects(): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [TEXT_A, SHAPE_B, TEXT_C] as never,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-multi-selection',
    title: 'Present multi selection',
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

async function settle(ms = 0): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function stage(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('stage not rendered');
  return element;
}

function objectElement(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`object ${id} not rendered`);
  return element;
}

function sceneObjects(): Array<Record<string, unknown>> {
  return (latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
}

function objectIds(): string[] {
  return sceneObjects().map((object) => object.id as string);
}

function objectX(id: string): number {
  const object = sceneObjects().find((candidate) => candidate.id === id);
  if (!object) throw new Error(`object ${id} missing in the published document`);
  return object.xPercent as number;
}

function selectedIds(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-present-object-id]'))
    .filter((element) => element.getAttribute('data-present-object-selected') === 'true')
    .map((element) => element.dataset.presentObjectId ?? '')
    .sort();
}

function handles(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-present-handle]'));
}

function selectionStatus(host: HTMLElement): string {
  return host.querySelector<HTMLElement>('[data-present-selection-status="true"]')?.textContent?.trim() ?? '';
}

function pointerEvent(type: string, clientX: number, clientY: number, init: PointerEventInit = {}): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true, cancelable: true, clientX, clientY,
    button: 0, ...(init as MouseEventInit),
  });
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

/** Real pointer press on a scene object (down + up), like the browser's selection gesture. */
async function pointerClick(target: Element, clientX: number, clientY: number, init: MouseEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(pointerEvent('pointerdown', clientX, clientY, init));
    await settle(30);
  });
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointerup', clientX, clientY, init));
    await settle(60);
  });
}

/** Marquee drag on the empty stage area. */
async function marquee(host: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await act(async () => {
    stage(host).dispatchEvent(pointerEvent('pointerdown', from.x, from.y));
    await settle(30);
  });
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointermove', to.x, to.y));
    await settle(30);
  });
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointerup', to.x, to.y));
    await settle(60);
  });
}

describe('Present M1 — multi-object selection (Round 19)', () => {
  it('Fall 1: marquee over two objects selects both; handles/status follow the grouped state', async () => {
    const host = await mount();
    const documentBefore = latest;

    // Empty-space drag from above-left of A to inside B's row: covers A and B, not C.
    await marquee(host, { x: 60, y: 40 }, { x: 430, y: 260 });

    expect(selectedIds(host), 'Marquee wählt A und B').toEqual(['shape-b', 'text-a']);
    expect(objectElement(host, 'text-a').getAttribute('data-present-object-selected')).toBe('true');
    expect(objectElement(host, 'shape-b').getAttribute('data-present-object-selected')).toBe('true');
    expect(objectElement(host, 'text-c').getAttribute('data-present-object-selected')).toBeNull();
    // Ist-Verhalten: the renderer draws the transform handles on EVERY selected object (9 each).
    expect(handles(host), 'Handles an beiden selektierten Objekten').toHaveLength(18);
    expect(selectionStatus(host), 'Statuszeile nennt die Gruppe').toContain('2 objects selected');
    expect(latest, 'Marquee schreibt kein Dokument').toBe(documentBefore);
  });

  it('Fall 2: additively selecting a second object — measured Ist-Verhalten of Shift/Ctrl+click', async () => {
    const host = await mount();

    // First object: a real pointer press + click (browser sequence).
    await pointerClick(objectElement(host, 'text-a'), 150, 80);
    await clickElement(objectElement(host, 'text-a'));
    expect(selectedIds(host)).toEqual(['text-a']);

    // Additive selection with Shift (same realistic sequence: press, release, click).
    // Ist-Verhalten (vor Round 19 gemessen): pointer-down added B and the following click toggled it
    // out again — a Shift+click produced no change at all. Fix: pointer-down no longer commits the
    // additive toggle (the click does exactly once).
    await pointerClick(objectElement(host, 'shape-b'), 400, 140, { shiftKey: true });
    await clickElement(objectElement(host, 'shape-b'), { shiftKey: true });
    expect(selectedIds(host), 'Shift+Klick fügt B genau einmal hinzu').toEqual(['shape-b', 'text-a']);

    // Ctrl behaves like Shift.
    await pointerClick(objectElement(host, 'text-a'), 150, 80, { ctrlKey: true });
    await clickElement(objectElement(host, 'text-a'), { ctrlKey: true });
    expect(selectedIds(host), 'Ctrl+Klick entfernt A wieder (Toggle)').toEqual(['shape-b']);
  });

  it('Fall 3: dragging one selected object moves the whole selection by the same delta', async () => {
    const host = await mount();
    await marquee(host, { x: 60, y: 40 }, { x: 430, y: 260 });
    expect(selectedIds(host)).toEqual(['shape-b', 'text-a']);
    const aBefore = objectX('text-a');
    const bBefore = objectX('shape-b');
    const cBefore = objectX('text-c');

    // Drag A by +48 px (= 5 % of the 960 px stage) — the move gesture carries the whole selection.
    // Ist-Verhalten vor Round 19: the pointer-down re-selected A non-additively, so the selection
    // collapsed while the group was already moving. Fix: a plain press on an already selected object
    // keeps the selection for the drag; only a plain *click* collapses it afterwards.
    await act(async () => {
      objectElement(host, 'text-a').dispatchEvent(pointerEvent('pointerdown', 150, 80));
      await settle(30);
    });
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', 198, 80));
      await settle(60);
    });
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointerup', 198, 80));
      await settle(60);
    });

    expect(objectX('text-a') - aBefore, 'A bewegt').toBeCloseTo(5, 4);
    expect(objectX('shape-b') - bBefore, 'B bewegt sich um denselben Delta').toBeCloseTo(5, 4);
    expect(objectX('text-c'), 'C bleibt unberührt').toBeCloseTo(cBefore, 6);
    expect(selectedIds(host), 'Auswahl bleibt bestehen').toEqual(['shape-b', 'text-a']);
  });

  it('Fall 4: Delete removes every selected object in one undo step; one undo restores all', async () => {
    const host = await mount();
    await marquee(host, { x: 60, y: 40 }, { x: 430, y: 260 });
    expect(selectedIds(host)).toEqual(['shape-b', 'text-a']);

    await pressKey(window, { key: 'Delete' });
    expect(objectIds(), 'beide ausgewählten Objekte gelöscht').toEqual(['text-c']);
    expect(handles(host), 'keine Handles mehr').toHaveLength(0);

    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(objectIds().sort(), 'ein Undo stellt beide wieder her').toEqual(['shape-b', 'text-a', 'text-c']);
    expect(objectX('text-a'), 'Positionen unverändert').toBeCloseTo(TEXT_A.xPercent, 6);
    expect(objectX('shape-b')).toBeCloseTo(SHAPE_B.xPercent, 6);
  });

  it('Fall 5: arrow keys nudge every selected object by the same step', async () => {
    const host = await mount();
    await marquee(host, { x: 60, y: 40 }, { x: 430, y: 260 });
    const aBefore = objectX('text-a');
    const bBefore = objectX('shape-b');
    const cBefore = objectX('text-c');

    await pressKey(window, { key: 'ArrowRight' });
    expect(objectX('text-a') - aBefore, 'A nudged').toBeCloseTo(0.25, 6);
    expect(objectX('shape-b') - bBefore, 'B nudged gleichzeitig').toBeCloseTo(0.25, 6);
    expect(objectX('text-c'), 'C unberührt').toBeCloseTo(cBefore, 6);

    await pressKey(window, { key: 'ArrowDown', shiftKey: true });
    const aAfter = sceneObjects().find((object) => object.id === 'text-a')!.yPercent as number;
    expect(aAfter - TEXT_A.yPercent, 'Shift+Pfeil nudged die Gruppe um 2 %').toBeCloseTo(2, 6);
  });
});
