// @vitest-environment happy-dom
// STATUS: PLATIN — Present insert palettes: keyboard menu navigation (Round 12)
//
// The insert palettes (`role="menu"` + native `<button role="menuitem">`) are real keyboard menus:
// ArrowDown on a trigger opens and focuses the first item, ArrowDown/ArrowUp cycle (wrap),
// Home/End jump, Escape closes and returns focus to the trigger. Every navigation key is consumed
// in the menu with preventDefault + stopPropagation, so the global Present canvas resolver
// (arrows = nudge, Home/End = slide navigation) must NOT fire in parallel — that negative case is
// asserted against the published document, not against internal state.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSceneObject, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const TEXT_OBJECT = {
  id: 'obj-1',
  kind: 'text',
  text: 'Keyboard menu',
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

function slideWith(sceneObjects: PresentSceneObject[] = []): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-insert-dropdown-keyboard',
    title: 'Present insert dropdown keyboard',
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

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

function menuTriggers(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'));
}

function shapeTrigger(host: HTMLElement): HTMLButtonElement {
  const trigger = menuTriggers(host)[0];
  if (!trigger) throw new Error('shape menu trigger not rendered');
  return trigger;
}

function widgetTrigger(host: HTMLElement): HTMLButtonElement {
  const trigger = menuTriggers(host)[1];
  if (!trigger) throw new Error('widget menu trigger not rendered');
  return trigger;
}

function diagramTrigger(host: HTMLElement): HTMLButtonElement {
  const trigger = menuTriggers(host)[2];
  if (!trigger) throw new Error('diagram menu trigger not rendered');
  return trigger;
}

function menuItems(_host: HTMLElement, menu: 'shapes' | 'widgets' | 'diagrams'): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(`[data-present-insert-menu="${menu}"] [role="menuitem"]`),
  );
}

async function pressKey(target: Element | Window, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await settle();
  });
  return event;
}

function focusedLabel(): string | null {
  const element = document.activeElement as HTMLElement | null;
  return element?.getAttribute('aria-label') ?? element?.textContent?.trim() ?? null;
}

function selectedIds(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-present-object-selected="true"]'))
    .map((element) => element.dataset.presentObjectId ?? '')
    .filter(Boolean);
}

async function selectObject(host: HTMLElement): Promise<void> {
  const object = host.querySelector<HTMLElement>('[data-present-object-id="obj-1"]');
  if (!object) throw new Error('scene object not rendered');
  object.focus();
  await pressKey(object, { key: 'Enter' });
}

function objectX(): number {
  const object = (latest?.presentData?.slides?.[0]?.sceneObjects ?? []).find(
    (candidate) => candidate.id === 'obj-1',
  ) as { xPercent: number } | undefined;
  if (!object) throw new Error('scene object missing in the published document');
  return object.xPercent;
}

describe('Present insert dropdowns — keyboard menu navigation (Round 12)', () => {
  it('opens the shape menu with ArrowDown on the trigger and focuses the first item', async () => {
    const host = await mount(slideWith());
    const trigger = shapeTrigger(host);
    trigger.focus();

    const down = await pressKey(trigger, { key: 'ArrowDown' });
    expect(down.defaultPrevented, 'Trigger-ArrowDown ist konsumiert (kein Canvas-Nudge)').toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = menuItems(host, 'shapes');
    expect(items.length).toBeGreaterThan(1);
    expect(document.activeElement, 'erster Menüpunkt hat den Fokus').toBe(items[0]);

    // An already open menu: ArrowDown on the trigger jumps back to the first item.
    items[2]!.focus();
    await pressKey(trigger, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('moves focus with ArrowDown/ArrowUp (wrap) and Home/End', async () => {
    const host = await mount(slideWith());
    const trigger = shapeTrigger(host);
    trigger.focus();
    await pressKey(trigger, { key: 'ArrowDown' });
    const items = menuItems(host, 'shapes');
    const last = items.length - 1;

    await pressKey(items[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    await pressKey(items[1]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
    // Wrap around in both directions.
    await pressKey(items[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[last]);
    await pressKey(items[last]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    // Home / End jump to the ends.
    await pressKey(items[0]!, { key: 'End' });
    expect(document.activeElement).toBe(items[last]);
    await pressKey(items[last]!, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
    expect(focusedLabel(), 'der Fokus liegt auf einem Menüpunkt').not.toBeNull();
  });

  it('closes on Escape, returns focus to the trigger and does not fire the global dismiss', async () => {
    const host = await mount(slideWith([TEXT_OBJECT as unknown as PresentSceneObject]));
    await selectObject(host);
    expect(selectedIds(host)).toEqual(['obj-1']);

    const trigger = shapeTrigger(host);
    trigger.focus();
    await pressKey(trigger, { key: 'ArrowDown' });
    const firstItem = menuItems(host, 'shapes')[0]!;

    const escape = await pressKey(firstItem, { key: 'Escape' });
    expect(escape.defaultPrevented, 'Escape ist hier Menü-Schließen').toBe(true);
    expect(document.querySelector('[data-present-insert-menu="shapes"]'), 'Menü ist geschlossen').toBeNull();
    expect(document.activeElement, 'Fokus zurück am Trigger').toBe(trigger);
    // The global Escape/dismiss would clear the selection — the menu must have stopped the event.
    expect(selectedIds(host), 'globale Dismiss-Semantik feuert nicht parallel').toEqual(['obj-1']);
  });

  it('does not nudge the selected object while the menu is navigated', async () => {
    const host = await mount(slideWith([TEXT_OBJECT as unknown as PresentSceneObject]));
    await selectObject(host);
    const documentBefore = latest;
    const xBefore = objectX();

    const trigger = shapeTrigger(host);
    trigger.focus();
    await pressKey(trigger, { key: 'ArrowDown' });
    const items = menuItems(host, 'shapes');
    await pressKey(items[0]!, { key: 'ArrowDown' });
    await pressKey(items[1]!, { key: 'ArrowUp' });
    await pressKey(items[0]!, { key: 'End' });
    await pressKey(items[items.length - 1]!, { key: 'Home' });

    expect(latest, 'kein Dokument-Write durch Menü-Navigation (kein Nudge)').toBe(documentBefore);
    expect(objectX(), 'Objektposition unverändert').toBe(xBefore);
    expect(selectedIds(host), 'Auswahl unverändert').toEqual(['obj-1']);
    expect(document.querySelector('[data-present-insert-menu="shapes"]'), 'Menü bleibt offen').not.toBeNull();
  });

  it('applies the same navigation to the widgets and diagrams menus', async () => {
    const host = await mount(slideWith());

    // Widgets menu.
    const widgetButton = widgetTrigger(host);
    widgetButton.focus();
    await pressKey(widgetButton, { key: 'ArrowDown' });
    const widgetItems = menuItems(host, 'widgets');
    expect(widgetItems.length).toBeGreaterThan(1);
    expect(document.activeElement).toBe(widgetItems[0]);
    await pressKey(widgetItems[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(widgetItems[1]);
    await pressKey(widgetItems[1]!, { key: 'Escape' });
    expect(document.querySelector('[data-present-insert-menu="widgets"]')).toBeNull();
    expect(document.activeElement).toBe(widgetButton);

    // Diagrams menu.
    const diagramButton = diagramTrigger(host);
    diagramButton.focus();
    await pressKey(diagramButton, { key: 'ArrowDown' });
    const diagramItems = menuItems(host, 'diagrams');
    expect(document.activeElement).toBe(diagramItems[0]);
    await pressKey(diagramItems[0]!, { key: 'End' });
    expect(document.activeElement).toBe(diagramItems[diagramItems.length - 1]);
    await pressKey(diagramItems[diagramItems.length - 1]!, { key: 'Escape' });
    expect(document.querySelector('[data-present-insert-menu="diagrams"]')).toBeNull();
    expect(document.activeElement).toBe(diagramButton);
  });
});
