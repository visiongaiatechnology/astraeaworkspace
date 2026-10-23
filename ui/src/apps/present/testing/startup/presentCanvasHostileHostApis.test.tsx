// @vitest-environment happy-dom
// STATUS: PLATIN — Present module: hostile host-API matrix (Round 11)
//
// Same dimension that found three real crash paths in Grid (ResizeObserver ctor/observe, partial 2D
// context, throwing devicePixelRatio getter). Present has its own mount path, so every case is
// probed here with a real `PresentCanvas` mount **plus one interaction** (double-click → text box,
// which exercises the shipped pointer→model→publish chain). Result of this matrix:
//
//   Fall 1 ResizeObserver-Konstruktor wirft     → KEIN Throw; der Present-Mount-Pfad konstruiert
//                                                 keinen ResizeObserver (0 Konstruktionen).
//   Fall 2 ResizeObserver.observe wirft         → KEIN Throw (ctor wird nie erreicht, 0 Konstruktionen).
//   Fall 3 getContext('2d') liefert {}          → KEIN Throw; Present erzeugt beim Mount/Interagieren
//                                                 kein <canvas> (0 canvases, 0 getContext-Aufrufe).
//                                                 Der 2D-Pfad existiert nur in den Lazy-Exporten
//                                                 (interchange/render/presentExport.ts:277, …).
//   Fall 4 devicePixelRatio-Getter wirft        → KEIN Throw; 0 Reads im Mount-/Interaktionspfad.
//   Fall 5a window.matchMedia fehlt             → KEIN Throw; 0 Aufrufe.
//   Fall 5b matchMedia ohne addEventListener    → KEIN Throw; 0 Aufrufe.
//   Fall 6 localStorage-Getter wirft            → KEIN Throw; `browserShellStorage()`
//                                                 (shell/platform/workspaceShellPlatformStorage.ts:19-25)
//                                                 fängt den Zugriff, `useWorkspaceLocale` fällt auf den
//                                                 Default zurück.
//
// Zwei verwandte Host-APIs SIND im Present-Mount-Pfad und wurden als echte Crash-Pfade gefunden
// (Befund unten gepinnt): `useWorkspaceUiScale` (shared/accessibility/workspaceUiScale.ts) liest
// `getComputedStyle` im Render-Pfad (`:65`) und konstruiert einen `MutationObserver` im Effekt
// (`:108`), aufgerufen in `PresentCanvas.tsx:113`. Beide Dateien liegen in `shared/**` und sind in
// diesem Paket ausdrücklich NICHT Ownership → Fix nur gemeldet (STOPP), nicht implementiert.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const BLANK_SLIDE: PresentSlide = {
  id: 'slide-1',
  title: '',
  subtitle: '',
  layout: 'blank',
  cards: [],
  speakerNotes: '',
  sceneObjects: [],
} as PresentSlide;

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-hostile-host-apis',
    title: 'Present hostile host APIs',
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

let latest: WorkspaceDocument | null = null;
let mounted: { root: ReturnType<typeof createRoot>; container: HTMLDivElement } | null = null;

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
  if (mounted) {
    const { root, container } = mounted;
    try {
      await act(async () => { root.unmount(); });
    } catch {
      // A mount that threw before React committed has nothing to unmount.
    }
    container.remove();
    mounted = null;
  }
  latest = null;
});

function ControlledPresenter() {
  const [document, setDocument] = useState<WorkspaceDocument>(documentWith(BLANK_SLIDE));
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

interface MountResult {
  container: HTMLDivElement;
  error: Error | null;
}

async function mountPresent(): Promise<MountResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let error: Error | null = null;
  try {
    await act(async () => { root.render(createElement(ControlledPresenter)); });
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }
  mounted = { root, container };
  return { container, error };
}

/** The interaction every case has to survive: double-click the free canvas → one text object. */
async function doubleClickCanvas(container: HTMLDivElement): Promise<void> {
  const stage = container.querySelector<HTMLElement>('[data-present-stage="true"]');
  expect(stage, 'die Bühne muss gerendert sein').not.toBeNull();
  await act(async () => {
    stage!.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: 288, clientY: 162,
    }));
    await new Promise<void>((resolve) => { setTimeout(resolve, 30); });
  });
}

function sceneObjects(): unknown[] {
  return (latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as unknown[];
}

/** Patches one own property on `window` and returns a restore function. */
function patchWindow(key: string, descriptor: PropertyDescriptor): () => void {
  const previous = Object.getOwnPropertyDescriptor(window, key);
  Object.defineProperty(window, key, { configurable: true, ...descriptor });
  return () => {
    if (previous) Object.defineProperty(window, key, previous);
    else delete (window as unknown as Record<string, unknown>)[key];
  };
}

/** Patches one global constructor/object and returns a restore function. */
function patchGlobal(key: string, value: unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return () => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete (globalThis as unknown as Record<string, unknown>)[key];
  };
}

/** Asserts the happy path for one hostile-host-API case: no throw + the interaction still lands. */
async function expectRobustMount(label: string): Promise<void> {
  const { container, error } = await mountPresent();
  expect(error, `${label}: Mount darf nicht werfen`).toBeNull();
  await doubleClickCanvas(container);
  expect(sceneObjects(), `${label}: Interaktion schreibt genau ein Objekt`).toHaveLength(1);
}

describe('Present module — hostile host APIs do not crash the mount path', () => {
  it('Fall 1: ResizeObserver-Konstruktor wirft', async () => {
    let constructed = 0;
    const restore = patchGlobal('ResizeObserver', class ThrowingResizeObserver {
      constructor(_callback: ResizeObserverCallback) {
        constructed += 1;
        throw new Error('ro_init_failed');
      }
    });
    try {
      await expectRobustMount('ResizeObserver ctor');
      expect(constructed, 'Present mountet ohne ResizeObserver').toBe(0);
    } finally {
      restore();
    }
  });

  it('Fall 2: ResizeObserver.observe wirft', async () => {
    let constructed = 0;
    const restore = patchGlobal('ResizeObserver', class ThrowingObserveResizeObserver {
      constructor(_callback: ResizeObserverCallback) { constructed += 1; }
      observe(): void { throw new Error('ro_observe_failed'); }
      unobserve(): void {}
      disconnect(): void {}
    });
    try {
      await expectRobustMount('ResizeObserver.observe');
      expect(constructed, 'observe wird gar nicht erreicht').toBe(0);
    } finally {
      restore();
    }
  });

  it('Fall 3: canvas.getContext("2d") liefert {} — Present nutzt beim Mount kein Canvas', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let getContextCalls = 0;
    HTMLCanvasElement.prototype.getContext = function partialContext(): unknown {
      getContextCalls += 1;
      return {};
    } as typeof HTMLCanvasElement.prototype.getContext;
    try {
      const { container, error } = await mountPresent();
      expect(error, 'ein partieller 2D-Kontext darf den Mount nicht berühren').toBeNull();
      await doubleClickCanvas(container);
      expect(sceneObjects()).toHaveLength(1);
      expect(container.querySelectorAll('canvas'), 'kein <canvas> im Mount-/Interaktionspfad').toHaveLength(0);
      expect(getContextCalls, 'getContext wird hier nie aufgerufen').toBe(0);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  it('Fall 4: devicePixelRatio-Getter wirft', async () => {
    let reads = 0;
    const restore = patchWindow('devicePixelRatio', {
      get() {
        reads += 1;
        throw new Error('dpr_boom');
      },
    });
    try {
      await expectRobustMount('devicePixelRatio getter');
      expect(reads, 'devicePixelRatio wird im Mount-/Interaktionspfad nicht gelesen').toBe(0);
    } finally {
      restore();
    }
  });

  it('Fall 5a: window.matchMedia fehlt (undefined)', async () => {
    const restore = patchWindow('matchMedia', { value: undefined, writable: true });
    try {
      await expectRobustMount('matchMedia missing');
      expect(typeof window.matchMedia, 'Host ohne matchMedia').toBe('undefined');
    } finally {
      restore();
    }
  });

  it('Fall 5b: matchMedia liefert minimales Objekt ohne addEventListener', async () => {
    let calls = 0;
    const restore = patchWindow('matchMedia', {
      value: () => {
        calls += 1;
        return { matches: false, media: '', onchange: null, addListener: () => undefined, removeListener: () => undefined };
      },
      writable: true,
    });
    try {
      await expectRobustMount('matchMedia without addEventListener');
      expect(calls, 'Present konsultiert matchMedia im Mount-/Interaktionspfad nicht').toBe(0);
    } finally {
      restore();
    }
  });

  it('Fall 6: localStorage-Getter wirft', async () => {
    const restore = patchWindow('localStorage', {
      get() { throw new Error('storage_boom'); },
    });
    try {
      // `browserShellStorage()` catches the throwing getter and returns null → locale falls back.
      await expectRobustMount('localStorage getter');
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// FIXED (Round 11) — `useWorkspaceUiScale` is called by `PresentCanvas.tsx:113` and was a real
// module-loss crash path for every module root. The shared guards now make the scale an
// enhancement: a throwing MutationObserver leaves the scale static, a throwing
// getComputedStyle falls back to 100 %. These cases were red before the fix and pin the new
// contract; a regression that removes the guards makes them fail again.
// ---------------------------------------------------------------------------------------------
describe('useWorkspaceUiScale ist kein Host-Crash-Pfad mehr (shared/, Round 11)', () => {
  it('Befund A (behoben): wirft der MutationObserver-Konstruktor, rendert das Modul trotzdem', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const restore = patchGlobal('MutationObserver', class ThrowingMutationObserver {
      constructor() { throw new Error('mo_init_failed'); }
    });
    try {
      const { container, error } = await mountPresent();
      // shared/accessibility/workspaceUiScale.ts — `new MutationObserver(sync)` ist jetzt best-effort.
      expect(error, 'ein defekter MutationObserver darf den Modulbaum nicht verlieren').toBeNull();
      expect(container.querySelector('[data-present-stage="true"]'), 'die Bühne ist gerendert').not.toBeNull();
    } finally {
      restore();
      errorSpy.mockRestore();
    }
  });

  it('Befund B (behoben): wirft getComputedStyle, rendert das Modul mit Skala 100 %', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const restore = patchWindow('getComputedStyle', {
      value: () => { throw new Error('gcs_boom'); },
      writable: true,
    });
    try {
      const { container, error } = await mountPresent();
      // shared/accessibility/workspaceUiScale.ts — der Font-Size-Fallback fällt auf 100 % zurück.
      expect(error, 'ein werfendes getComputedStyle darf den Render-Pfad nicht töten').toBeNull();
      expect(container.querySelector('[data-present-stage="true"]'), 'die Bühne ist gerendert').not.toBeNull();
    } finally {
      restore();
      errorSpy.mockRestore();
    }
  });
});
