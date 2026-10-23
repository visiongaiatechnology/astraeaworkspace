// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001 (nativ): Shell-Envelope-Smoke nach identifizierter Ursache.
//
// **Ursache (native Diagnoseprotokoll, 2026-10-18):** `ReferenceError: Cannot access 'g'
// before initialization` im Bundle-Chunk `vaultIntegrity-*.js`, verursacht durch den
// Import-Zyklus `vaultIntegrity → vaultFileSystemEngine → vaultNames → vaultIntegrity`
// (Rollup/TDZ). In happy-dom ist dieser Bundle-Init-Fehler unsichtbar; die dauerhafte
// Reproduktion leistet jetzt `ui/scripts/bundle-init-smoke.mjs`.
//
// Diese Datei bleibt als **Shell-Envelope-Smoke** (kein Throw mehr erwartet) und prüft:
//   * `ModuleRecoveryBoundary` + `AppWorkspaceView` mit `createNewDocument('Grid')` (exakte
//     Shell-Props aus `shell/workspace/AppWorkspaceView.tsx:166-177`) → Raster, A1, keine
//     Recovery-Oberfläche;
//   * denselben Pfad ohne Boundary → kein roher Render-Throw;
//   * produktionsnahe Host-Stubs (Rect, echte rgb()-Theme-Werte, vollständiger 2D-Kontext,
//     devicePixelRatio=1.5, ResizeObserver, matchMedia, Tauri-`__TAURI_INTERNALS__`);
//   * `timeZone=""` mit **echtem** Intl: V8 wirft bei direkter leerer Zone, die App-Guards
//     (`createIntlZoneOffsetLookup`, `createGridFormulaTimeContext`, Assistant) nicht.
//   * einen **synthetischen** Host-Shim-Guard: `crypto.randomUUID` vorhanden, wirft; die
//     Recovery-Oberfläche fängt das. Das ist **nicht** die gefundene Ursache, sondern die
//     verbleibende Host-API-Klasse (Fallback deckt nur „fehlt", nicht „wirft").
import { act, createElement, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyVaultStatus, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';
import { AppWorkspaceView } from '../../../../shell/workspace/AppWorkspaceView';
import { ModuleRecoveryBoundary } from '../../../../shell/recovery/ModuleRecoveryBoundary';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import {
  createGridFormulaTimeContext,
  createIntlZoneOffsetLookup,
} from '../../formulas/gridFormulaTimeContext';
import { describeGridFormulaDateContext } from '../../formulas/gridFormulaAssist';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.setConfig({ testTimeout: 60_000 });

const VAULT_STATUS: KeyVaultStatus = {
  isLocked: false,
  hasPin: false,
  platform: 'test',
  privacyMode: false,
  pqcUnlocked: false,
};

interface MountedShell {
  readonly container: HTMLElement;
  readonly error: unknown;
  readonly root: Root;
  readonly document: () => WorkspaceDocument;
}

let active: MountedShell | null = null;

function ShellHarness({ initialDocument, withBoundary }: { initialDocument: WorkspaceDocument; withBoundary: boolean }) {
  const [document, setDocument] = useState<WorkspaceDocument>(initialDocument);
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
  });
  if (!withBoundary) return view;
  return createElement(ModuleRecoveryBoundary, { document, locale: 'en-US', children: view });
}

async function sleep(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function settle(): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    await act(async () => {
      await sleep(5);
    });
  }
}

async function mountShell(initialDocument: WorkspaceDocument, withBoundary = true): Promise<MountedShell> {
  let latest = initialDocument;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let error: unknown = null;
  try {
    await act(async () => {
      root.render(createElement(ShellHarness, {
        initialDocument,
        withBoundary,
      }));
    });
    await settle();
  } catch (reason) {
    error = reason;
  }
  active = { container, error, root, document: () => latest };
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
    // Ein geworfener Mount hinterlässt eine unbrauchbare Wurzel.
  } finally {
    container.remove();
  }
}

afterEach(async () => {
  await unmount();
});

function recoveryActive(container: HTMLElement): boolean {
  return container.querySelector('[data-module-recovery="active"]') !== null;
}

function gridElement(container: HTMLElement): Element | null {
  return container.querySelector('[role="grid"]');
}

function nameBoxValue(container: HTMLElement): string | null {
  return container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value ?? null;
}

describe('GR-001 — Shell-Envelope und Host-API-Kandidaten für den Native-Crash', () => {
  it('Shell: createNewDocument(Grid) über ModuleRecoveryBoundary + AppWorkspaceView rendert das Raster', async () => {
    const fresh = createNewDocument('Grid');
    expect(fresh.kind).toBe('Grid');
    expect(fresh.gridData?.sheets).toHaveLength(2);
    expect(fresh.root_object_ids).toHaveLength(2);

    const mounted = await mountShell(fresh, true);
    const grid = gridElement(mounted.container);
    expect(mounted.error).toBeNull();
    expect(recoveryActive(mounted.container), 'die Recovery-Surface darf beim frischen Grid nicht erscheinen').toBe(false);
    expect(grid, 'das Grid-Raster muss im Shell-Pfad erscheinen').not.toBeNull();
    expect(nameBoxValue(mounted.container)).toBe('A1');
  });

  it('Shell ohne Boundary: derselbe Pfad wirft keinen rohen Render-Throw', async () => {
    const mounted = await mountShell(createNewDocument('Grid'), false);
    expect(mounted.error).toBeNull();
    expect(gridElement(mounted.container)).not.toBeNull();
  });

  it('Produktionsnahe Host-Stubs: Shell- und Virtual-Mount werfen nicht', async () => {
    const restores: Array<() => void> = [];
    try {
      // 1) Nicht-null Layout, damit der DOM-/Recovery-Pfad nicht an 0×0-Rects hängt.
      const originalRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function layoutStub(this: Element): DOMRect {
        return {
          x: 100,
          y: 50,
          left: 100,
          top: 50,
          width: 960,
          height: 540,
          right: 1060,
          bottom: 590,
          toJSON: () => ({ x: 100, y: 50, left: 100, top: 50, width: 960, height: 540, right: 1060, bottom: 590 }),
        } as DOMRect;
      };
      restores.push(() => { Element.prototype.getBoundingClientRect = originalRect; });

      // 2) getComputedStyle mit echten Theme-Werten (inkl. rgb()).
      const originalComputed = window.getComputedStyle.bind(window);
      const computedValues: Record<string, string> = {
        '--vgt-module-panel-surface': 'rgb(10, 13, 20)',
        '--vgt-module-control-surface': 'rgb(15, 23, 42)',
        '--vgt-control-text': 'rgb(203, 213, 225)',
        '--vgt-control-muted': 'rgb(148, 163, 184)',
        '--vgt-control-border': 'rgba(255, 255, 255, 0.12)',
        '--vgt-selection': 'rgba(59, 130, 246, 0.1)',
        '--vgt-selection-border': 'rgb(59, 130, 246)',
      };
      window.getComputedStyle = ((element: Element) => {
        const real = originalComputed(element);
        return new Proxy(real, {
          get(target, property) {
            if (property === 'getPropertyValue') {
              return (name: string) => computedValues[name] ?? target.getPropertyValue(name);
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      }) as typeof window.getComputedStyle;
      restores.push(() => { window.getComputedStyle = originalComputed; });

      // 3) Nicht-null Viewport-Maße für den Virtual-Zweig (happy-dom meldet sonst 0×0).
      const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
      const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 960 });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 540 });
      restores.push(() => {
        if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
        if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
      });

      // 4) Vollständiger 2D-Kontext + devicePixelRatio 1.5.
      const originalContext = HTMLCanvasElement.prototype.getContext;
      const noop = () => undefined;
      const context2d = new Proxy({
        measureText: () => ({ width: 0 }),
        createLinearGradient: () => ({ addColorStop: noop }),
        createPattern: () => ({}),
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      } as Record<string, unknown>, {
        get(target, property) {
          if (property in target) return target[property as string];
          return noop;
        },
        set() { return true; },
      });
      HTMLCanvasElement.prototype.getContext = function getContextStub(this: HTMLCanvasElement, contextId: string) {
        if (contextId === '2d') return context2d as unknown as CanvasRenderingContext2D;
        return originalContext.call(this, contextId as never);
      } as typeof HTMLCanvasElement.prototype.getContext;
      restores.push(() => { HTMLCanvasElement.prototype.getContext = originalContext; });
      const originalDpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
      Object.defineProperty(window, 'devicePixelRatio', { value: 1.5, configurable: true });
      restores.push(() => {
        if (originalDpr) Object.defineProperty(window, 'devicePixelRatio', originalDpr);
        else delete (window as unknown as Record<string, unknown>).devicePixelRatio;
      });

      // 5) ResizeObserver-/matchMedia-/Tauri-Umgebung wie im WebView2-Host.
      const OriginalResizeObserver = globalThis.ResizeObserver;
      class ProductionResizeObserver {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element): void {
          this.callback([{ target, contentRect: { width: 960, height: 540 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        unobserve(): void {}
        disconnect(): void {}
      }
      globalThis.ResizeObserver = ProductionResizeObserver as unknown as typeof ResizeObserver;
      restores.push(() => { globalThis.ResizeObserver = OriginalResizeObserver; });
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: noop,
        removeListener: noop,
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      restores.push(() => { window.matchMedia = originalMatchMedia; });
      // Tauri v2 stellt die Internals bereit; `__TAURI__` existiert nur mit withGlobalTauri.
      // Realistisch ist daher: Internals vorhanden, kein globales `__TAURI__`.
      const tauriWindow = window as unknown as Record<string, unknown>;
      const hadInternals = '__TAURI_INTERNALS__' in tauriWindow;
      tauriWindow.__TAURI_INTERNALS__ = {};
      restores.push(() => {
        if (!hadInternals) delete tauriWindow.__TAURI_INTERNALS__;
      });

      const fresh = createNewDocument('Grid');
      const shell = await mountShell(fresh, true);
      expect(shell.error).toBeNull();
      expect(recoveryActive(shell.container)).toBe(false);
      expect(gridElement(shell.container)).not.toBeNull();
      await unmount();

      // Virtual-Zweig: 300 Zeilen + vollständiger Kontext + dpr 1.5.
      const big = addSheetToDocument(
        { ...fresh, gridData: undefined, objects: {}, root_object_ids: [] },
        [],
        'Virtual',
        { rows: 300, cols: 12, cells: { A1: { value: 'virtual' } } },
      ).updatedDocument;
      let virtualError: unknown = null;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      try {
        await act(async () => {
          root.render(createElement(GridSheet, {
            document: big,
            workspaceDocuments: {},
            onUpdateDocument: () => undefined,
            onUpdateWorkspaceDocument: () => undefined,
            onSelectSelectionType: () => undefined,
            onCreateChart: () => undefined,
            networkCapability: 'None',
            keyVaultUnlocked: false,
          }));
        });
        await settle();
      } catch (reason) {
        virtualError = reason;
      }
      const virtualSurface = container.querySelector('[role="grid"][data-render-backend]');
      const canvas = container.querySelector('canvas');
      expect(virtualError).toBeNull();
      expect(virtualSurface).not.toBeNull();
      expect(canvas instanceof HTMLCanvasElement).toBe(true);
      expect((canvas as HTMLCanvasElement).width).toBeGreaterThan(960);
      await act(async () => { root.unmount(); });
      container.remove();
    } finally {
      for (const restore of restores.reverse()) restore();
    }
  });

  it('Kandidat crypto.randomUUID: vorhandene, aber werfende Funktion reißt den Shell-Mount', async () => {
    const cryptoObject = globalThis.crypto as Crypto;
    const descriptor = Object.getOwnPropertyDescriptor(cryptoObject, 'randomUUID');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(cryptoObject, 'randomUUID', {
      configurable: true,
      value: () => { throw new Error('crypto_uuid_boom'); },
    });
    try {
      const withBoundary = await mountShell(createNewDocument('Grid'), true);
      // Befund: die Recovery-Oberfläche erscheint, das Raster nicht — genau das native Symptom.
      expect(withBoundary.error).toBeNull();
      expect(recoveryActive(withBoundary.container)).toBe(true);
      expect(gridElement(withBoundary.container)).toBeNull();
      await unmount();

      const raw = await mountShell(createNewDocument('Grid'), false);
      expect(raw.error).toBeInstanceOf(Error);
      expect((raw.error as Error).message).toContain('crypto_uuid_boom');
      expect(gridElement(raw.container)).toBeNull();
    } finally {
      consoleError.mockRestore();
      if (descriptor) Object.defineProperty(cryptoObject, 'randomUUID', descriptor);
      else delete (cryptoObject as unknown as Record<string, unknown>).randomUUID;
    }
  });

  it('timeZone="": echtes Intl wirft bei leerer Zone, die App-Guards neutralisieren es', async () => {
    // Rohes V8-Verhalten: genau der Crash-Kandidat, falls ein Pfad die leere Zone ungeschützt
    // an Intl gibt.
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: '' })).toThrow(RangeError);

    const now = Date.now();
    const lookup = createIntlZoneOffsetLookup();
    expect(() => lookup('', now), 'Lookup mit leerer Zone darf nicht werfen').not.toThrow();
    expect(lookup('', now)).toBeNull();
    expect(() => createGridFormulaTimeContext(now, '', lookup)).not.toThrow();
    expect(createGridFormulaTimeContext(now, '', lookup)?.source).toBe('host');
    expect(() => describeGridFormulaDateContext('', 'en-US')).not.toThrow();
    expect(describeGridFormulaDateContext('', 'en-US').context?.source).toBe('host');

    // Mount + Assistant öffnen: GridSheet übergibt timeZone="" an die Formelleiste;
    // der Assistant baut daraus erst beim Öffnen einen Datums-Kontext.
    const fresh = createNewDocument('Grid');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let error: unknown = null;
    try {
      await act(async () => {
        root.render(createElement(GridSheet, {
          document: fresh,
          workspaceDocuments: {},
          onUpdateDocument: () => undefined,
          onUpdateWorkspaceDocument: () => undefined,
          onSelectSelectionType: () => undefined,
          onCreateChart: () => undefined,
          networkCapability: 'None',
          keyVaultUnlocked: false,
        }));
      });
      await settle();
      const formulaInput = container.querySelector<HTMLInputElement>('.vgt-grid-formula-input');
      expect(formulaInput).not.toBeNull();
      if (formulaInput) {
        await act(async () => {
          formulaInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }));
          await sleep(0);
        });
      }
    } catch (reason) {
      error = reason;
    }
    const assistant = document.body.querySelector('[data-grid-formula-assistant="true"]');
    expect(error).toBeNull();
    expect(assistant, 'der Assistant muss mit timeZone="" öffnen').not.toBeNull();
    await act(async () => { root.unmount(); });
    container.remove();
  });
});
