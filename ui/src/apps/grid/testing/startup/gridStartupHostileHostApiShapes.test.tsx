// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001: feindliche Formen vorhandener Host-APIs (nicht „fehlt").
//
// Bisher geprüft: API fehlt (undefined) und Tauri-Bridge-Fehler. Neu: Die API existiert,
// verhält sich aber falsch — der realistische WebView2-Fall „Objekt da, Methode kaputt".
// Jede Probe patcht genau eine API vor dem Mounten der echten `GridSheet` (kontrolliert,
// `createRoot` + `act`, `useState`-Dokument), löst danach ggf. ArrowDown/Klick aus und
// restauriert die API im `finally`. Ein Throw wird als Befund mit Stack gepinnt.
//
// Befund dieses Laufs (2026-10-18): 6/6 grün, davon vier mit **gepinntem Throw**.
//   Fall 1 ResizeObserver-Konstruktor wirft → Mount-Throw `Error: ro_init_failed`
//           (`GridFormulaBar.tsx:176`).
//   Fall 2 ResizeObserver.observe wirft     → Mount-Throw `Error: ro_observe_failed`
//           (`GridFormulaBar.tsx:177`).
//   Fall 3 getContext('2d') → {}            → Mount-Throw `TypeError: context.setTransform
//           is not a function` (`highDpiCanvas.ts:32` ← `gridVirtualCanvasRenderer.ts:71`
//           ← `GridVirtualCanvas.tsx:193`).
//   Fall 4 devicePixelRatio-Getter wirft     → im DOM-Mount **nicht gelesen** (kein Throw);
//           im Virtual-Zweig mit erreichbarem Kontext wirft `highDpiCanvas.ts:21`
//           (`Error: dpr_boom`).
//   Fall 5 requestAnimationFrame-Starvation → kein Throw, Mount endlich, A1→A2.
//   Fall 6 NaN-Rects                        → kein Throw, Klick def., A1→A2, kein Endloslayout.
//
// Rot-vor-Fix: Fälle 1-3 (und 4b) pinnen den aktuellen Fehler. Nach einem Quellcode-Fix
// werden sie rot und müssen auf „kein Throw" umgestellt werden; die Quelle wird NICHT hier
// geändert. Realistischster Kandidat für den nativen Crash: Fall 1/2, weil der
// ResizeObserver-Effekt (`GridFormulaBar.tsx:173-183`) bei **jedem** Grid-Mount läuft —
// anders als Canvas/dpr, die den Virtual-Zweig (>250 Zeilen/Flag) voraussetzen.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument, patchSheetInDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-hostile-host-api-shape',
  title: 'Grid hostile host API shape',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function workbook(options?: { virtual?: boolean }): WorkspaceDocument {
  const added = addSheetToDocument(BASE, [], 'Sheet 1', {
    rows: 30,
    cols: 12,
    cells: { A1: { value: 'Start' }, B2: { value: 'B2' } },
  });
  return options?.virtual
    ? patchSheetInDocument(added.updatedDocument, added.newSheetId, { useVirtualCanvas: true })
    : added.updatedDocument;
}

interface MountedGrid {
  readonly container: HTMLElement;
  readonly root: Root;
  readonly error: unknown;
}

let active: MountedGrid | null = null;

function Harness({ initialDocument }: { initialDocument: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(initialDocument);
  return createElement(GridSheet, {
    document,
    workspaceDocuments: {},
    onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
    onUpdateWorkspaceDocument: (next: WorkspaceDocument) => setDocument(next),
    onSelectSelectionType: () => undefined,
    onCreateChart: () => undefined,
    networkCapability: 'None',
    keyVaultUnlocked: false,
  });
}

async function mount(initialDocument: WorkspaceDocument): Promise<MountedGrid> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let error: unknown = null;
  try {
    await act(async () => {
      root.render(createElement(Harness, { initialDocument }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  active = { container, root, error };
  return active;
}

async function unmount(): Promise<void> {
  if (!active) return;
  const { root, container } = active;
  active = null;
  try {
    await act(async () => {
      root.unmount();
    });
  } catch {
    // Nach einem Throw bleibt die Wurzel ggf. unbrauchbar; der Befund zählt.
  } finally {
    container.remove();
  }
}

afterEach(async () => {
  await unmount();
});

function gridRoot(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
}

function virtualSurface(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="grid"][data-render-backend]');
}

function nameBoxValue(container: HTMLElement): string | null {
  return container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value ?? null;
}

function setProperty(target: object, name: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  try {
    Object.defineProperty(target, name, { configurable: true, writable: true, value });
  } catch {
    (target as Record<string, unknown>)[name] = value;
  }
  return () => {
    try {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete (target as Record<string, unknown>)[name];
    } catch {
      // Restauration nur für die Testisolation; der Befund bleibt.
    }
  };
}

function setThrowingGetter(target: object, name: string, message: string): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, {
    configurable: true,
    get() {
      throw new Error(message);
    },
  });
  return () => {
    try {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete (target as Record<string, unknown>)[name];
    } catch {
      // siehe oben
    }
  };
}

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function pressArrowDown(container: HTMLElement): Promise<unknown> {
  const root = gridRoot(container);
  if (!root) return new Error('Grid-Wurzel fehlt');
  let error: unknown = null;
  try {
    await act(async () => {
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await tick();
    });
  } catch (reason) {
    error = reason;
  }
  return error;
}

async function clickSurface(container: HTMLElement, clientX: number, clientY: number): Promise<unknown> {
  const surface = virtualSurface(container);
  if (!surface) return new Error('Virtual-Surface fehlt');
  let error: unknown = null;
  try {
    await act(async () => {
      surface.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
      }));
      await tick();
    });
  } catch (reason) {
    error = reason;
  }
  return error;
}

describe('GR-001 — Grid-Startup bei feindlichen Host-API-Formen', () => {
  it('Fall 1: ResizeObserver-Konstruktor wirft — Grid mountet trotzdem (GR-001-Fix)', async () => {
    class ThrowingResizeObserver {
      constructor(_callback: ResizeObserverCallback) {
        throw new Error('ro_init_failed');
      }
    }
    const restore = setProperty(globalThis, 'ResizeObserver', ThrowingResizeObserver);
    try {
      const mounted = await mount(workbook());
      // Vor dem Fix warf der FormulaBar-Effekt bei jedem Grid-Mount; jetzt ist der Observer
      // optional und das Raster startet normal.
      expect(mounted.error, 'ein defekter ResizeObserver darf den Mount nicht töten').toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');
      expect(await pressArrowDown(mounted.container)).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 2: ResizeObserver.observe wirft — Grid mountet trotzdem (GR-001-Fix)', async () => {
    class ThrowingObserveResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}
      observe(): void {
        throw new Error('ro_observe_failed');
      }
      disconnect(): void {}
      unobserve(): void {}
    }
    const restore = setProperty(globalThis, 'ResizeObserver', ThrowingObserveResizeObserver);
    try {
      const mounted = await mount(workbook());
      expect(mounted.error, 'ein werfendes observe darf den Mount nicht töten').toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');
    } finally {
      restore();
    }
  });

  it('Fall 3: canvas.getContext("2d") liefert {} — Virtual-Zweig bleibt nutzbar (GR-001-Fix)', async () => {
    let getContextCalls = 0;
    const restore = setProperty(HTMLCanvasElement.prototype, 'getContext', () => {
      getContextCalls += 1;
      return {};
    });
    try {
      const mounted = await mount(workbook({ virtual: true }));
      expect(getContextCalls, 'der 2D-Kontextpfad muss ausgeführt worden sein').toBeGreaterThan(0);
      // Vor dem Fix: TypeError context.setTransform is not a function. Jetzt wird das Skalieren
      // übersprungen, statt die ganze Folie zu verlieren.
      expect(mounted.error, 'ein unvollständiger 2D-Kontext darf nicht werfen').toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
    } finally {
      restore();
    }
  });

  it('Fall 4: devicePixelRatio-Getter wirft — auch der Virtual-Zweig bleibt nutzbar (GR-001-Fix)', async () => {
    // 4a: normaler DOM-Mount (30 Zeilen) liest devicePixelRatio nicht.
    const restoreDpr = setThrowingGetter(window, 'devicePixelRatio', 'dpr_boom');
    let restoreContext: (() => void) | null = null;
    try {
      const dom = await mount(workbook());
      expect(dom.error, 'DOM-Mount darf devicePixelRatio nicht lesen').toBeNull();
      expect(gridRoot(dom.container)).not.toBeNull();
      expect(nameBoxValue(dom.container)).toBe('A1');
      const interactionError = await pressArrowDown(dom.container);
      expect(interactionError).toBeNull();
      expect(nameBoxValue(dom.container)).toBe('A2');
      await unmount();

      // 4b: Virtual-Zweig mit erreichbarem Kontext; der dpr-Getter wird im Draw-Effekt gelesen.
      // Vor dem Fix warf der Default-Parameter; jetzt fällt der Scale auf 1 zurück.
      restoreContext = setProperty(HTMLCanvasElement.prototype, 'getContext', () => ({}));
      const virtual = await mount(workbook({ virtual: true }));
      expect(virtual.error, 'ein werfender dpr-Getter darf den Draw-Effekt nicht töten').toBeNull();
      expect(gridRoot(virtual.container)).not.toBeNull();
    } finally {
      restoreContext?.();
      restoreDpr();
    }
  });

  it('Fall 5: requestAnimationFrame ruft den Callback nie auf', async () => {
    const restore = setProperty(globalThis, 'requestAnimationFrame', () => 0);
    try {
      const started = Date.now();
      const mounted = await mount(workbook());
      const elapsed = Date.now() - started;
      expect(elapsed, 'rAF-Starvation darf den Mount nicht hängen lassen').toBeLessThan(5_000);
      expect(mounted.error).toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');
      const interactionError = await pressArrowDown(mounted.container);
      expect(interactionError).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 6: getBoundingClientRect liefert NaN-Felder', async () => {
    const restore = setProperty(Element.prototype, 'getBoundingClientRect', () => ({
      x: Number.NaN,
      y: Number.NaN,
      left: Number.NaN,
      top: Number.NaN,
      width: Number.NaN,
      height: Number.NaN,
      right: Number.NaN,
      bottom: Number.NaN,
      toJSON: () => ({}),
    }));
    try {
      const started = Date.now();
      const mounted = await mount(workbook({ virtual: true }));
      expect(Date.now() - started, 'NaN-Rects dürfen kein Endloslayout auslösen').toBeLessThan(5_000);
      expect(mounted.error).toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      const clickError = await clickSurface(mounted.container, 200, 100);
      expect(clickError).toBeNull();
      expect(nameBoxValue(mounted.container), 'NaN-Rect-Klick fällt definiert auf A1 zurück').toBe('A1');
      const interactionError = await pressArrowDown(mounted.container);
      expect(interactionError).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A2');
    } finally {
      restore();
    }
  });
});
