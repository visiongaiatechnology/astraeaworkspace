// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1: Shell-Envelope-Smoke (Runde 36, Nutzerbefund).
//
// Der Nutzer sah in der nativen App eine dunkelblaue Karten-/Two-Column-Fläche statt eines weißen
// freien Blattes. Diese Datei prüft den **Produktionspfad** (nicht nur `PresentCanvas` direkt):
// `AppWorkspaceView` + `ModuleRecoveryBoundary` mit einem echten `createNewDocument('Present')`.
//
// Bewiesen:
//   1. ein frisches Deck erscheint als **weiße, blanke Freeform-Fläche** (kein Karten-Layout,
//      kein „Add Card", Blank-Hinweis sichtbar), Doppelklick erzeugt dunklen Text, Drag verschiebt frei;
//   2. ein Legacy-Karten-Deck rendert weiterhin seine Kartenansicht (keine Regression);
//   3. kein Recovery-Screen in beiden Fällen.
import { act, createElement, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyVaultStatus, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';
import { AppWorkspaceView } from '../../../../shell/workspace/AppWorkspaceView';
import { ModuleRecoveryBoundary } from '../../../../shell/recovery/ModuleRecoveryBoundary';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 60_000 });

const STAGE = { width: 960, height: 540 };
const VAULT_STATUS: KeyVaultStatus = {
  isLocked: false, hasPin: false, platform: 'test', privacyMode: false, pqcUnlocked: false,
};

let container: HTMLElement | null = null;
let root: Root | null = null;
let latest: WorkspaceDocument | null = null;
let originalRect: typeof Element.prototype.getBoundingClientRect;

interface Mounted { readonly container: HTMLElement; readonly error: unknown }

async function sleep(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function settle(rounds = 120): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await sleep(20); });
  }
}

function ShellHarness({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  latest = document;
  const gridFormatActionRef = useRef<((format: 'currency' | 'percent' | 'number') => void) | null>(null);
  const documents = { [document.id]: document };
  const view = createElement(AppWorkspaceView, {
    saveStatus: 'saved',
    saveFailure: null,
    activeDoc: document,
    gridFormatActionRef,
    documents,
    storedWorkspaceDocuments: [],
    loadStoredWorkspaceDocument: async () => null,
    onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
    onSelectSelectionType: () => undefined,
    onCreateDerivedDocument: () => undefined,
    onInsertChart: () => undefined,
    onOpenDocument: () => undefined,
    onOpenExternalUrl: async () => undefined,
    allowBrowserManagedSpeech: false,
    vaultStatus: VAULT_STATUS,
    activeDocumentPin: null,
    networkCapability: 'None',
  } as never);
  return createElement(ModuleRecoveryBoundary, { document, locale: 'en-US', children: view });
}

async function mount(documentUnderTest: WorkspaceDocument): Promise<Mounted> {
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0, y: 0, width: STAGE.width, height: STAGE.height,
      top: 0, left: 0, right: STAGE.width, bottom: STAGE.height,
      toJSON: () => ({}),
    } as DOMRect;
  };
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  let error: unknown = null;
  try {
    await act(async () => { root!.render(createElement(ShellHarness, { start: documentUnderTest })); });
    await settle();
  } catch (reason) {
    error = reason;
  }
  return { container, error };
}

afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalRect;
  if (root) { await act(async () => { root!.unmount(); }); root = null; }
  container?.remove(); container = null; latest = null;
});

function liveSlide(): PresentSlide {
  return latest!.presentData!.slides[0]!;
}

function sceneObjects(): Array<Record<string, unknown>> {
  return (liveSlide().sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
}

async function waitForStage(host: HTMLElement, timeoutMs = 15_000): Promise<HTMLElement> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
    if (element) return element;
    await act(async () => { await sleep(25); });
  }
  throw new Error('stage not rendered within timeout');
}

function stage(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('stage not rendered');
  return element;
}

function isWhiteColor(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return normalized === '#ffffff' || normalized === 'rgb(255,255,255)' || normalized === 'white';
}

function legacyCardsDeck(): WorkspaceDocument {
  const documentUnderTest = createNewDocument('Present' as never) as WorkspaceDocument;
  documentUnderTest.presentData!.slides = [{
    id: 'legacy-slide-1', title: 'Legacy', subtitle: '', layout: 'cards', speakerNotes: '',
    cards: [{ id: 'card-1', title: 'Karte 1', description: 'Beschreibung' }],
  } as PresentSlide];
  return documentUnderTest;
}

describe('Present M1 im echten Shell-Pfad (Nutzerbefund Runde 36)', () => {
  it('fresh deck from the shell factory is a white blank freeform sheet without recovery', async () => {
    const created = createNewDocument('Present' as never) as WorkspaceDocument;
    const mounted = await mount(created);
    expect(mounted.error, 'kein Render-Throw im Shell-Pfad').toBeNull();
    expect(mounted.container.querySelector('[data-module-recovery="active"]'), 'kein Recovery-Screen').toBeNull();
    await waitForStage(mounted.container);
    expect(stage(mounted.container).style.backgroundColor, 'weiße 16:9-Fläche').toBeTruthy();
    expect(isWhiteColor(stage(mounted.container).style.backgroundColor), 'Weiß als Fläche').toBe(true);
    expect(mounted.container.querySelector('[data-present-layout="cards"]'), 'kein Karten-Layout').toBeNull();
    expect(mounted.container.textContent ?? '', 'kein „Add Card"').not.toContain('Add Card');
    expect(mounted.container.querySelector('[data-present-blank-hint="true"]'), 'Blank-Hinweis sichtbar').not.toBeNull();
    expect(liveSlide().layout).toBe('blank');
  });

  it('double click in the shell creates a dark-text object and drags it freely', async () => {
    const created = createNewDocument('Present' as never) as WorkspaceDocument;
    const mounted = await mount(created);
    expect(mounted.error).toBeNull();
    await waitForStage(mounted.container);

    await act(async () => {
      stage(mounted.container).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 288, clientY: 162 }));
      await sleep(60);
    });
    await settle(12);
    const objects = sceneObjects();
    expect(objects, 'genau ein Textobjekt').toHaveLength(1);
    expect(objects[0]!.kind).toBe('text');
    expect(objects[0]!.color, 'dunkler Text auf weißem Blatt').toBe('#1e293b');
    expect(objects[0]!.xPercent as number).toBeCloseTo(30, 0);

    const before = objects[0]!.xPercent as number;
    const element = mounted.container.querySelector<HTMLElement>(`[data-present-object-id="${objects[0]!.id as string}"]`)!;
    await act(async () => {
      element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 288, clientY: 162, button: 0 }));
      await sleep(40);
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 336, clientY: 162 }));
      await sleep(60);
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 336, clientY: 162 }));
      await sleep(60);
    });
    expect(sceneObjects()[0]!.xPercent, 'frei verschiebbar').toBeCloseTo(before + 5, 1);
    expect(liveSlide().layout, 'Layout bleibt blank').toBe('blank');
  });

  it('legacy cards deck still renders its cards layout (no regression)', async () => {
    const mounted = await mount(legacyCardsDeck());
    expect(mounted.error).toBeNull();
    expect(mounted.container.querySelector('[data-module-recovery="active"]')).toBeNull();
    expect(mounted.container.querySelector('[data-present-layout="cards"]'), 'Karten-Layout rendert').not.toBeNull();
    // Karten sind Eingabefelder (Wert, nicht textContent) — geprüft wird die gerenderte Karte selbst.
    const cardFields = mounted.container.querySelectorAll('[data-present-layout="cards"] input');
    expect(cardFields.length, 'mindestens ein Kartenfeld gerendert').toBeGreaterThan(0);
    const cardValue = Array.from(cardFields).some((field) => (field as HTMLInputElement).value === 'Karte 1');
    expect(cardValue, 'Legacy-Karte trägt ihren Titel').toBe(true);
  });
  it('insert menus open as a visible body portal in the production shell path', async () => {
    const created = createNewDocument('Present' as never) as WorkspaceDocument;
    const mounted = await mount(created);
    expect(mounted.error).toBeNull();

    const triggers = mounted.container.querySelectorAll<HTMLButtonElement>(
      '[data-present-insert-dropdowns] button[aria-haspopup="menu"]',
    );
    expect(triggers.length, 'Shapes/Widgets/Diagrams-Trigger vorhanden').toBeGreaterThanOrEqual(3);

    // Shapes: Klick oeffnet das Menue als Portal am body, nicht im (geclippten) Toolbar-Band.
    await act(async () => {
      triggers[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(40);
    });
    await settle(6);
    const portal = window.document.querySelector<HTMLElement>('[data-present-insert-menu-portal="true"]');
    expect(portal, 'Menue haengt am document.body (kein Clipping)').not.toBeNull();
    expect(portal!.parentElement, 'Portal-Wurzel ist der body').toBe(window.document.body);
    expect(portal!.style.position, 'fixed positioniert').toBe('fixed');
    expect(Number(portal!.style.zIndex), 'z-index ueber Toolbar').toBeGreaterThan(100000);
    expect(portal!.querySelectorAll('[role="menuitem"]').length, 'sichtbare Eintraege').toBeGreaterThan(0);
    expect(
      mounted.container.querySelector('[data-present-insert-menu-portal="true"]'),
      'das Menue liegt NICHT im Shell-Baum',
    ).toBeNull();

    // Auswahl armiert das Formwerkzeug wirklich (kein toter Button).
    const firstShape = portal!.querySelector<HTMLButtonElement>('[data-present-shape-key]')!;
    await act(async () => {
      firstShape.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(40);
    });
    await settle(6);
    expect(window.document.querySelector('[data-present-shape-tool-status="armed"]'), 'Formwerkzeug armiert').not.toBeNull();
    expect(window.document.querySelector('[data-present-insert-menu-portal="true"]'), 'Menue schliesst nach Auswahl').toBeNull();

    // Widgets: Auswahl fuegt sofort ein Objekt ins Dokument ein.
    const objectsBefore = sceneObjects().length;
    const widgetTrigger = mounted.container.querySelectorAll<HTMLButtonElement>(
      '[data-present-insert-dropdowns] button[aria-haspopup="menu"]',
    )[1]!;
    await act(async () => {
      widgetTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(40);
    });
    await settle(6);
    const widgetPortal = window.document.querySelector<HTMLElement>('[data-present-insert-menu-portal="true"]');
    expect(widgetPortal, 'Widget-Menue als Portal').not.toBeNull();
    const firstWidget = widgetPortal!.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    await act(async () => {
      firstWidget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(60);
    });
    await settle(8);
    expect(sceneObjects().length, 'Widget landet als Szenenobjekt im Dokument').toBeGreaterThan(objectsBefore);
  });
});
