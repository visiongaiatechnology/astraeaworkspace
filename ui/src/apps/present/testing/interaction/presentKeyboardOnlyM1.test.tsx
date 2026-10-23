// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1 keyboard-only workflow (Round 10)
//
// This file proves the M1 goal **without a mouse**: arm an insert tool from the toolbar, place a
// text box with Enter on the focused slide, type into the caret, leave with Escape, nudge, delete,
// undo and redo. It also proves the two focus rules that make it possible:
//   - Tab stays the browser's focus traversal outside the slide (toolbar/menus) and remains the
//     selection cycle inside the slide;
//   - F2 opens the caret of the selected text object — keyboard parity for double-click.
//
// Environment boundary: happy-dom 21 does not implement the HTML activation behaviour of native
// buttons (Enter/Space on a focused `<button>` does not synthesize a `click`). Real browsers do.
// `keyboardActivate` models that browser default action explicitly (keydown → activation click)
// while the tests assert the native `<button>` semantics that make it work in a real browser.
// Native browser verification itself stays PR-010.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSceneObject, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const TEXT_OBJECT = {
  id: 'obj-1',
  kind: 'text',
  text: 'Keyboard text',
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

const SECOND_TEXT_OBJECT = {
  ...TEXT_OBJECT,
  id: 'obj-2',
  text: 'Second text',
  xPercent: 60,
  yPercent: 55,
  zIndex: 21,
};

const THIRD_TEXT_OBJECT = {
  ...TEXT_OBJECT,
  id: 'obj-3',
  text: 'Third text',
  xPercent: 40,
  yPercent: 75,
  zIndex: 22,
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

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-m1-keyboard-only',
    title: 'Present M1 keyboard only',
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

function stageElement(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('present stage not rendered');
  return element;
}

/** The text-edit caret belongs to the object container — not to any other panel textarea. */
function objectTextEditor(host: HTMLElement, objectId = 'obj-1'): HTMLTextAreaElement | null {
  return host.querySelector<HTMLTextAreaElement>(`[data-present-object-id="${objectId}"] textarea`);
}

/** The toolbar's text tool button, located by its accessible name (English default locale). */
function textToolButton(host: HTMLElement): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
    /insert free-positioned text box|freies textfeld einfügen/i.test(candidate.getAttribute('aria-label') ?? ''),
  );
  if (!button) throw new Error('text tool button not rendered');
  return button;
}

function shapeMenuButton(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  if (!button) throw new Error('shape menu button not rendered');
  return button;
}

function shapeMenuItem(_host: HTMLElement, shapeKey = 'rectangle'): HTMLButtonElement {
  const item = document.querySelector<HTMLButtonElement>(`[data-present-shape-key="${shapeKey}"]`);
  if (!item) throw new Error(`shape menu item "${shapeKey}" not rendered`);
  return item;
}

function sceneObjects(): PresentSceneObject[] {
  return (latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as PresentSceneObject[];
}

function sceneObjectById(id: string): PresentSceneObject | undefined {
  return sceneObjects().find((candidate) => candidate.id === id);
}

function selectedIds(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-present-object-selected="true"]'))
    .map((element) => element.dataset.presentObjectId ?? '')
    .filter(Boolean);
}

async function pressKey(target: Element | Window, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await settle();
  });
  return event;
}

/**
 * Models the browser's default action for Enter/Space on a native `<button>`: a `click`.
 * happy-dom does not implement that activation behaviour, so the native button semantics are
 * asserted separately and then the click the browser would produce is dispatched.
 */
async function keyboardActivate(button: HTMLButtonElement, key: 'Enter' | ' ' = 'Enter'): Promise<void> {
  expect(button.tagName, 'native button semantics').toBe('BUTTON');
  expect(button.type).toBe('button');
  button.focus();
  expect(document.activeElement, 'Button ist per Tastatur fokussierbar').toBe(button);
  const down = await pressKey(button, { key });
  expect(down.defaultPrevented, 'die App blockiert die native Button-Aktivierung nicht').toBe(false);
  await act(async () => { button.click(); await settle(); });
}

describe('Present M1 — keyboard-only workflow (Round 10)', () => {
  it('arms and disarms the text tool through the focused toolbar button', async () => {
    const host = await mount(slideWith());
    const button = textToolButton(host);

    await keyboardActivate(button);
    expect(stageElement(host).dataset.presentArmedTool, 'Text-Werkzeug bewaffnet').toBe('text');

    await keyboardActivate(button);
    expect(stageElement(host).dataset.presentArmedTool, 'zweite Aktivierung entschärft').toBeUndefined();
  });

  it('keeps Tab as browser focus traversal outside the slide', async () => {
    const host = await mount(slideWith({ sceneObjects: [TEXT_OBJECT] as never }));

    // Toolbar / page: Tab must remain the browser's focus traversal (no preventDefault).
    const button = textToolButton(host);
    button.focus();
    expect((await pressKey(button, { key: 'Tab' })).defaultPrevented, 'Toolbar-Tab bleibt Browser-Traversal').toBe(false);
    expect((await pressKey(button, { key: 'Tab', shiftKey: true })).defaultPrevented, 'Toolbar-Shift+Tab ebenso').toBe(false);
    expect((await pressKey(document.body, { key: 'Tab' })).defaultPrevented, 'Body-Tab bleibt Browser-Traversal').toBe(false);

    // The stage itself is focusable (it is the surface Enter/Space placement listens on).
    const stage = stageElement(host);
    stage.focus();
    expect(document.activeElement, 'Bühne ist per Tastatur fokussierbar').toBe(stage);
  });

  it('repairs the keyboard trap: Tab/Shift+Tab cycle inside the stage and leave it at the ends', async () => {
    const host = await mount(slideWith({
      sceneObjects: [TEXT_OBJECT, SECOND_TEXT_OBJECT, THIRD_TEXT_OBJECT] as never,
    }));
    const stage = stageElement(host);

    // (4) No selection on the focused stage: both directions are browser traversal (WCAG 2.1.2).
    stage.focus();
    expect((await pressKey(stage, { key: 'Tab' })).defaultPrevented, 'Tab ohne Auswahl verlässt die Bühne').toBe(false);
    expect(
      (await pressKey(stage, { key: 'Tab', shiftKey: true })).defaultPrevented,
      'Shift+Tab ohne Auswahl ebenso',
    ).toBe(false);
    expect(selectedIds(host), 'ohne Auswahl wird nicht cyclt').toHaveLength(0);

    // Keyboard selection: focus the first object and press Enter (its own keyboard contract).
    const firstObject = host.querySelector<HTMLElement>('[data-present-object-id="obj-1"]')!;
    firstObject.focus();
    await pressKey(firstObject, { key: 'Enter' });
    expect(selectedIds(host)).toEqual(['obj-1']);
    stage.focus();

    // (1) Shift+Tab on the first object leaves the stage (browser traverses backwards).
    expect(
      (await pressKey(stage, { key: 'Tab', shiftKey: true })).defaultPrevented,
      'Shift+Tab am ersten Objekt verlässt die Bühne',
    ).toBe(false);

    // (3) Tab between the ends keeps the cycle and advances the selection.
    expect((await pressKey(stage, { key: 'Tab' })).defaultPrevented, 'Tab zwischen den Enden cyclt').toBe(true);
    expect(selectedIds(host), 'erster Cycle-Schritt obj-1 → obj-2').toEqual(['obj-2']);
    expect((await pressKey(stage, { key: 'Tab' })).defaultPrevented).toBe(true);
    expect(selectedIds(host), 'zweiter Cycle-Schritt obj-2 → obj-3').toEqual(['obj-3']);

    // (2) Tab on the last object leaves the stage (browser traverses forwards).
    expect(
      (await pressKey(stage, { key: 'Tab' })).defaultPrevented,
      'Tab am letzten Objekt verlässt die Bühne',
    ).toBe(false);
    expect(selectedIds(host), 'am Ende wird nicht weitergecyclt').toEqual(['obj-3']);

    // Shift+Tab between the ends keeps the backward cycle.
    expect(
      (await pressKey(stage, { key: 'Tab', shiftKey: true })).defaultPrevented,
      'Shift+Tab zwischen den Enden cyclt',
    ).toBe(true);
    expect(selectedIds(host), 'Rückwärts-Cycle obj-3 → obj-2').toEqual(['obj-2']);
  });

  it('places a text box with caret from the keyboard (armed tool + Enter/Space on the focused slide)', async () => {
    const host = await mount(slideWith());
    // The aria-label changes while the tool is armed, so keep the element reference.
    const textButton = textToolButton(host);

    await keyboardActivate(textButton);
    expect(stageElement(host).dataset.presentArmedTool).toBe('text');
    // In the browser Tab now moves from the toolbar to the (focusable) stage: not prevented.
    expect((await pressKey(textButton, { key: 'Tab' })).defaultPrevented).toBe(false);

    stageElement(host).focus();
    await pressKey(stageElement(host), { key: 'Enter' });

    const objects = sceneObjects();
    expect(objects, 'genau eine Textbox').toHaveLength(1);
    expect(objects[0]!.kind).toBe('text');
    // Same documented default point as the pointer path without a point (12 % / 28 %).
    expect(objects[0]!.xPercent).toBeCloseTo(12, 0);
    expect(objects[0]!.yPercent).toBeCloseTo(28, 0);
    expect(stageElement(host).dataset.presentArmedTool, 'Werkzeug nach dem Platzieren entschärft').toBeUndefined();

    const editor = objectTextEditor(host, objects[0]!.id);
    expect(editor, 'Caret: der Editiermodus ist offen').not.toBeNull();
    expect(document.activeElement, 'Caret hat den Fokus').toBe(editor);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(editor, 'Typed without a mouse');
      editor!.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    });
    expect((sceneObjects()[0] as Extract<PresentSceneObject, { kind: 'text' }>).text).toBe('Typed without a mouse');

    // Escape closes the caret.
    await pressKey(editor!, { key: 'Escape' });
    expect(objectTextEditor(host, objects[0]!.id), 'Escape verlässt den Editiermodus').toBeNull();

    // Space is the second documented activation key: arm again and place a second box.
    await keyboardActivate(textToolButton(host));
    stageElement(host).focus();
    await pressKey(stageElement(host), { key: ' ' });
    expect(sceneObjects(), 'Space platziert ebenfalls').toHaveLength(2);

    // Escape disarms the text tool without creating a third box (existing dismiss semantics).
    await keyboardActivate(textToolButton(host));
    expect(stageElement(host).dataset.presentArmedTool).toBe('text');
    stageElement(host).focus();
    await pressKey(stageElement(host), { key: 'Escape' });
    expect(stageElement(host).dataset.presentArmedTool, 'Escape entschärft das Text-Werkzeug').toBeUndefined();
    expect(sceneObjects(), 'Escape erzeugt keine dritte Textbox').toHaveLength(2);
  });

  it('opens the caret with F2 for the selected text, then nudge/delete/undo/redo work', async () => {
    const host = await mount(slideWith({ sceneObjects: [TEXT_OBJECT] as never }));
    const stage = stageElement(host);

    // Keyboard selection: the focusable object answers Enter (its own contract); F2 then opens the
    // caret — the keyboard parity of double-click.
    const object = host.querySelector<HTMLElement>('[data-present-object-id="obj-1"]')!;
    object.focus();
    await pressKey(object, { key: 'Enter' });
    expect(selectedIds(host)).toEqual(['obj-1']);
    stage.focus();
    await pressKey(stage, { key: 'F2' });
    expect(objectTextEditor(host), 'F2 öffnet den Edit-Modus').not.toBeNull();

    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(objectTextEditor(host), 'Edited with F2');
      objectTextEditor(host)!.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    });
    expect((sceneObjectById('obj-1') as Extract<PresentSceneObject, { kind: 'text' }>).text).toBe('Edited with F2');

    await pressKey(objectTextEditor(host)!, { key: 'Escape' });
    expect(objectTextEditor(host), 'Escape verlässt den Edit-Modus').toBeNull();

    const beforeX = sceneObjectById('obj-1')!.xPercent;
    await pressKey(window, { key: 'ArrowRight' });
    expect(sceneObjectById('obj-1')!.xPercent, 'Pfeiltaste nudgt das Objekt').toBeGreaterThan(beforeX);

    await pressKey(window, { key: 'Delete' });
    expect(sceneObjects(), 'Entf löscht').toHaveLength(0);
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(sceneObjects(), 'Strg+Z stellt wieder her').toHaveLength(1);
    await pressKey(window, { key: 'y', ctrlKey: true });
    expect(sceneObjects(), 'Strg+Y löscht erneut').toHaveLength(0);
  });

  it('places the default shape from the keyboard and Escape disarms the tool', async () => {
    const host = await mount(slideWith());

    // Enter on the native menu button opens the shape menu (browser default action, modelled).
    await keyboardActivate(shapeMenuButton(host));
    expect(document.querySelector('[data-present-insert-menu="shapes"]'), 'Enter öffnet das Formen-Menü').not.toBeNull();
    // Tab passes outside the slide (browser focus order); ArrowDown is consumed by the menu
    // navigation (Round 12) and moves the focus onto the first menu item — never a canvas nudge.
    expect((await pressKey(shapeMenuButton(host), { key: 'Tab' })).defaultPrevented).toBe(false);
    expect(
      (await pressKey(shapeMenuButton(host), { key: 'ArrowDown' })).defaultPrevented,
      'ArrowDown wird vom Menü konsumiert',
    ).toBe(true);
    expect(document.activeElement, 'ArrowDown fokussiert den ersten Menüpunkt').toBe(shapeMenuItem(host));

    // Activate the focused first item (browser activation modelled as keydown + click).
    const item = shapeMenuItem(host);
    item.focus();
    await keyboardActivate(item);
    const stage = stageElement(host);
    expect(stage.dataset.presentShapeTool, 'Form-Werkzeug bewaffnet').toBe('rectangle');

    // Enter on the focused stage creates the click-without-drag default shape at the documented
    // keyboard default (slide centre 50 %/50 % → 20 × 16 rect at 40 %/42 %).
    stage.focus();
    await pressKey(stage, { key: 'Enter' });
    const shapes = sceneObjects();
    expect(shapes, 'genau eine Form').toHaveLength(1);
    expect(shapes[0]!.kind).toBe('shape');
    const shape = shapes[0] as Extract<PresentSceneObject, { kind: 'shape' }>;
    expect(shape.shape).toBe('rectangle');
    expect(shape.xPercent).toBeCloseTo(40, 3);
    expect(shape.yPercent).toBeCloseTo(42, 3);
    expect(shape.widthPercent).toBeCloseTo(20, 3);
    expect(shape.heightPercent).toBeCloseTo(16, 3);
    expect(stageElement(host).dataset.presentShapeTool, 'Werkzeug nach dem Platzieren entschärft').toBeUndefined();

    // Escape disarms a re-armed tool without creating another object.
    await keyboardActivate(shapeMenuButton(host));
    const secondItem = shapeMenuItem(host);
    secondItem.focus();
    await keyboardActivate(secondItem);
    expect(stageElement(host).dataset.presentShapeTool).toBe('rectangle');
    stageElement(host).focus();
    await pressKey(stageElement(host), { key: 'Escape' });
    expect(stageElement(host).dataset.presentShapeTool, 'Escape entschärft das Form-Werkzeug').toBeUndefined();
    expect(sceneObjects(), 'Escape erzeugt keine Form').toHaveLength(1);
  });
});
