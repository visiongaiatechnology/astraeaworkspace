// @vitest-environment happy-dom
// STATUS: GOLD — Present M1: white freeform sheet + working insert menus (Round 35, user finding)
//
// The user tested the native app and reported: (A) Present opens as a blue object with a fixed
// arrangement instead of a white PowerPoint-like sheet, and (B) the toolbar's insert buttons do
// nothing (no dropdown, no settings). This file proves the three acceptance points with the REAL
// creation path (`createNewDocument('Present')`), the real editor and DOM evidence:
//   1. a fresh deck is a white 16:9 blank slide with a freeform scene canvas (no card layout, no
//      "Add Card"), the new-slide default is blank, and text/shape objects can be placed/moved;
//   2. the insert palettes are rendered in a `document.body` portal (position: fixed, high z-index)
//      i.e. NOT inside the clipping toolbar band, and a clicked item really performs its action;
//   3. every visible toolbar button is wired: menu triggers open a palette, all other enabled buttons
//      call a real handler (the native image file picker is the single documented exception).
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';
import { PresentCanvas } from '../../PresentCanvas';
import { PresentTopToolbar } from '../../editor/toolbar/PresentTopToolbar';
import { resolvePresentSlideDesign } from '../../design/presentDesign';
import { PRESENT_TOOLBAR_COPY } from '../../locale/presentToolbarLocale';
import { SHAPE_DEFINITIONS } from '../../contracts/types';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

beforeEach(() => {
  vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined });
});

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

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;

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

async function mount(startDocument: WorkspaceDocument): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: startDocument }));
  });
  return container;
}

async function settle(ms = 0): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function slideOf(document: WorkspaceDocument): PresentSlide {
  return document.presentData!.slides[0]!;
}

function liveSlide(): PresentSlide {
  return latest!.presentData!.slides[0]!;
}

function sceneObjects(): Array<Record<string, unknown>> {
  return (liveSlide().sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
}

function stage(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('stage not rendered');
  return element;
}

function objectElement(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

async function doubleClickStage(host: HTMLElement, clientX = 288, clientY = 162): Promise<void> {
  await act(async () => {
    stage(host).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY }));
    await settle(60);
  });
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(60);
  });
}

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

function isWhiteColor(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return normalized === '#ffffff' || normalized === 'rgb(255,255,255)' || normalized === 'white';
}

describe('Present M1 — white freeform sheet (Round 35)', () => {
  it('a fresh deck from the real creation path is a white, blank, freeform 16:9 slide', async () => {
    const created = createNewDocument('Present' as never) as WorkspaceDocument;
    const createdSlide = slideOf(created);
    // The shell factory (documentFactory → seedDocDefaultsOpenCore) writes exactly this.
    expect(createdSlide.layout, 'frisches Deck ist blank').toBe('blank');
    expect(createdSlide.cards ?? [], 'keine Karten im frischen Deck').toEqual([]);
    expect(createdSlide.sceneObjects ?? [], 'keine fested Anordnung im frischen Deck').toEqual([]);

    const host = await mount(created);
    const slideFrame = stage(host);
    expect(isWhiteColor(slideFrame.style.backgroundColor), 'weiße 16:9-Fläche').toBe(true);
    expect(host.querySelector('[data-present-aspect], .aspect-video, [data-present-stage]'), '16:9-Bühne vorhanden').not.toBeNull();

    // No card layout / no "Add Card": the stage renders the freeform blank canvas instead.
    expect(host.querySelector('[data-present-cards-layout]'), 'kein Karten-Layout').toBeNull();
    expect(host.querySelector('[data-present-layout="cards"]'), 'kein Karten-Render').toBeNull();
    expect(host.textContent ?? '', 'kein „Add Card"-Button').not.toContain('Add Card');
    expect(host.querySelector('[data-present-blank-hint="true"]'), 'freies Blank-Canvas').not.toBeNull();

    // Freeform: double-click creates a text box with dark text, and dragging moves it freely.
    await doubleClickStage(host);
    const objects = sceneObjects();
    expect(objects, 'freies Textobjekt erzeugt').toHaveLength(1);
    const textId = objects[0]!.id as string;
    expect(objects[0]!.kind).toBe('text');
    expect(objects[0]!.color, 'dunkler Text auf weißem Blatt').toBe('#1e293b');
    expect(objectElement(host, textId), 'Objekt im freien Canvas sichtbar').not.toBeNull();

    const xBefore = objects[0]!.xPercent as number;
    await drag(objectElement(host, textId)!, { x: 288, y: 162 }, { x: 336, y: 162 });
    expect(sceneObjects()[0]!.xPercent, 'Objekt frei verschiebbar (+5 %)').toBeCloseTo(xBefore + 5, 3);

    // The slide stayed blank/freeform after the interaction (no layout coercion).
    expect(liveSlide().layout).toBe('blank');
    expect(host.querySelector('[data-present-cards-layout]')).toBeNull();
  });

  it('the sidebar defaults a new slide to blank/freeform and the new deck grows as such', async () => {
    const created = createNewDocument('Present' as never) as WorkspaceDocument;
    const host = await mount(created);

    const layoutSelect = host.querySelector<HTMLSelectElement>('[data-present-new-slide-layout="true"]');
    expect(layoutSelect, 'Layout-Wähler sichtbar').not.toBeNull();
    expect(layoutSelect!.value, 'Default „Blank" statt „Title and content"').toBe('blank');

    const newButton = host.querySelector<HTMLButtonElement>('button[data-vgt-app-guide-anchor="Present:first"]');
    expect(newButton, 'New-Slide-Button vorhanden').not.toBeNull();
    await clickElement(newButton!);

    const slides = latest!.presentData!.slides;
    expect(slides, 'zweite Slide erzeugt').toHaveLength(2);
    expect(slides[1]!.layout, 'neue Slide ist blank/freeform').toBe('blank');
    expect(slides[1]!.cards ?? [], 'keine Karten-Platzhalter').toEqual([]);
  });

  it('insert palettes open in a non-clipping body portal and their items really act', async () => {
    const created = createNewDocument('Present' as never) as WorkspaceDocument;
    const host = await mount(created);
    const triggers = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'));
    expect(triggers.length, 'drei Einfüge-Paletten (Shapes/Widgets/Diagrams)').toBe(3);

    // Shapes palette: portal under document.body, position fixed, high z-index, not clipped.
    await clickElement(triggers[0]!);
    const shapeMenu = document.querySelector<HTMLElement>('[data-present-insert-menu="shapes"]');
    expect(shapeMenu, 'Formen-Menü ist gerendert').not.toBeNull();
    expect(shapeMenu!.parentElement, 'Portal hängt an document.body (nicht im Toolbar-Band)').toBe(document.body);
    expect(shapeMenu!.closest('[data-vgt-app-toolbar-band="present"]'), 'nicht im geclippten Toolbar-Band').toBeNull();
    expect(shapeMenu!.style.position, 'Portal nutzt position: fixed').toBe('fixed');
    const zIndex = Number(shapeMenu!.style.zIndex);
    expect(zIndex, 'Portal liegt über der App').toBeGreaterThan(100_000);
    expect(shapeMenu!.querySelectorAll('[role="menuitem"]').length, 'alle Formen gelistet').toBe(SHAPE_DEFINITIONS.length);
    expect(shapeMenu!.offsetParent !== null || shapeMenu!.isConnected, 'Menü ist sichtbar verbunden').toBe(true);

    // Clicking the rectangle item arms the freeform shape tool — the click is not a no-op.
    await clickElement(shapeMenu!.querySelector<HTMLElement>('[data-present-shape-key="rectangle"]')!);
    expect(stage(host).getAttribute('data-present-shape-tool'), 'Formen-Werkzeug ist scharf').toBe('rectangle');
    expect(document.querySelector('[data-present-insert-menu="shapes"]'), 'Menü schließt nach Auswahl').toBeNull();

    // Widgets palette: a clicked widget is committed into the freeform document.
    await clickElement(triggers[1]!);
    const widgetMenu = document.querySelector<HTMLElement>('[data-present-insert-menu="widgets"]');
    expect(widgetMenu, 'Widget-Menü ist gerendert').not.toBeNull();
    const firstWidget = widgetMenu!.querySelector<HTMLElement>('[role="menuitem"]');
    expect(firstWidget, 'Widget-Einträge vorhanden').not.toBeNull();
    const objectsBefore = sceneObjects().length;
    await clickElement(firstWidget!);
    expect(sceneObjects().length, 'Widget landet im Dokument').toBe(objectsBefore + 1);
    expect(sceneObjects().some((object) => object.kind === 'widget'), 'Widget-Objekt').toBe(true);
  });

  it('every visible toolbar button is wired (menu opens or a real handler fires)', async () => {
    const created = createNewDocument('Present' as never) as WorkspaceDocument;
    const slide = slideOf(created);
    const presentData = created.presentData!;
    const copy = PRESENT_TOOLBAR_COPY['en-US'];
    const handlers = {
      onUpdateSlide: vi.fn(),
      onUpdatePresentData: vi.fn(),
      onInsertImageFile: vi.fn(),
      onAddText: vi.fn(),
      onAddShape: vi.fn(),
      onAddWidget: vi.fn(),
      onAddDiagram: vi.fn(),
      onAddCode: vi.fn(),
      onAddChart: vi.fn(),
      onAddTable: vi.fn(),
      onToggleLayers: vi.fn(),
      onToggleAnimations: vi.fn(),
      onToggleNotes: vi.fn(),
      onToggleInspector: vi.fn(),
      onOpenThemeManager: vi.fn(),
      onOpenSections: vi.fn(),
      onOpenRehearsal: vi.fn(),
      onOpenComments: vi.fn(),
      onOpenMediaEmbed: vi.fn(),
      onOpenVideoExport: vi.fn(),
      onOpenSpeakerCoach: vi.fn(),
      onOpenWorkspaceIntegration: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onPreviewTransition: vi.fn(),
      onApplyTransitionToAll: vi.fn(),
      onCommand: vi.fn(),
      onToggleArmedTool: vi.fn(),
      onApplyThemeToDeck: vi.fn(),
    };
    const handlerMocks = Object.values(handlers);
    const totalCalls = () => handlerMocks.reduce((sum, mock) => sum + mock.mock.calls.length, 0);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(PresentTopToolbar, {
        ...handlers,
        slide,
        design: resolvePresentSlideDesign(slide, presentData),
        presentData,
        showLayers: false,
        showAnimations: false,
        showNotes: false,
        showInspector: false,
        canUndo: true,
        canRedo: true,
        selectionSize: 0,
        armedTool: null,
      } as never));
    });

    const buttons = Array.from(container!.querySelectorAll<HTMLButtonElement>('button')).filter((button) => !button.disabled);
    expect(buttons.length, 'sichtbare Toolbar-Buttons').toBeGreaterThan(10);
    const unwired: string[] = [];
    for (const button of buttons) {
      const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '(unnamed)';
      if (button.getAttribute('aria-haspopup') === 'menu') {
        handlerMocks.forEach((mock) => mock.mockClear());
        await clickElement(button);
        const menu = document.querySelector(`[data-present-insert-menu]`);
        if (!menu) unwired.push(`${label}: Menü öffnet nicht`);
        await clickElement(button); // close again
        expect(document.querySelector('[data-present-insert-menu]'), `${label}: Menü schließt`).toBeNull();
        continue;
      }
      if (button.getAttribute('aria-haspopup') === 'dialog') {
        // Round 40: the "More" popover hosts the secondary commands; it must open and close.
        await clickElement(button);
        const moreDialog = document.querySelector('[data-present-more-menu]');
        if (!moreDialog) unwired.push(`${label}: More-Dialog öffnet nicht`);
        const closeButton = moreDialog?.querySelector<HTMLButtonElement>('button[aria-label="Close more commands"]');
        expect(closeButton, 'More-Dialog hat einen Schließen-Button').not.toBeNull();
        await clickElement(closeButton!);
        expect(document.querySelector('[data-present-more-menu]'), 'More-Dialog schließt').toBeNull();
        continue;
      }
      if (programmaticImagePicker(button)) continue;
      handlerMocks.forEach((mock) => mock.mockClear());
      await clickElement(button);
      if (totalCalls() === 0) unwired.push(`${label}: kein Handler`);
    }
    expect(unwired, 'kein sichtbarer Button ohne Wirkung').toEqual([]);
    // The native image picker is the one documented exception: it opens a hidden file input.
    const imageButton = buttons.find((button) => (button.getAttribute('aria-label') ?? '').includes(copy.text.insertImage));
    expect(imageButton, 'Bild-Button vorhanden').toBeDefined();
    expect(container!.querySelector('input[type="file"]'), 'Bild-Button öffnet den Datei-Picker').not.toBeNull();
  });
});

/** The insert-image button opens the hidden native file picker (no JS handler fires in tests). */
function programmaticImagePicker(button: HTMLButtonElement): boolean {
  const label = button.getAttribute('aria-label') ?? '';
  return label.includes(PRESENT_TOOLBAR_COPY['en-US'].text.insertImage);
}
