// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001: Grid-Startup bei defekter Tauri-/WebView2-Bridge.
//
// Der native Crash tritt nur in Tauri/WebView2 auf. Bisher geprüft: Host-APIs, kaputte
// Dokumente, Layout-Rects, Recovery. Ungetestet war der **Bridge-Zustand**: `window.__TAURI__`
// existiert, aber `core.invoke` wirft synchron, liefert ein rejected Promise oder hängt; oder
// `event.listen` wirft; oder `__TAURI_INTERNALS__` ist gesetzt, `__TAURI__` fehlt.
//
// Diese Datei setzt den jeweiligen Bridge-Zustand vor dem Mounten, mountet die echte
// `GridSheet` kontrolliert (`createRoot` + `act`, `useState`-Dokument) und löst danach eine
// ArrowDown-Tastaturinteraktion aus. Der Bridge-Zustand wird immer im `finally` restauriert.
//
// Befund dieses Laufs (2026-10-18): 5/5 grün, **kein Render-Throw**.
//   Fall 1 sync throw     → Mount OK, Raster steht, ArrowDown A1→A2, kein Throw.
//   Fall 2 rejected       → Mount OK, Raster steht, A1→A2, kein Throw.
//   Fall 3 nie auflösend  → Mount endlich fertig (gemessen ~0,7–1,0 s; Testschwelle 5 s),
//                           kein Hänger, A1→A2.
//   Fall 4 mixed internals→ Mount OK, A1→A2, kein Throw.
//   Fall 5 event.listen   → Mount OK, A1→A2, kein Throw.
//
// Warum: Der Grid-Startup ruft die Bridge beim Mounten nicht auf. `isNativeDesktop()` prüft
// nur die Funktionspräsenz (`nativeBridge.ts:143-152`); `useGridCollaboration` berechnet
// `available`, invokiert aber erst bei `start` (oder beim Unmount-Cleanup, dort mit `.catch`).
// `formula.ts:275-288` nutzt `invokeNative` erst bei einer Formelauswertung und fängt Fehler
// in `#CALC!/#VALUE!` ab. Damit sind die fünf Bridge-Zustände als Ursache für einen
// **Render-/Startup-Throw** des Grids ausgeschlossen; spätere Feature-Pfade bleiben separat.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-native-bridge-failure',
  title: 'Grid native bridge failure',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function workbook(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', { cells: { A1: { value: 'Start' } } }).updatedDocument;
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
    // Eine geworfene Wurzel bleibt unbrauchbar; der ursprüngliche Befund zählt.
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

function gridRole(container: HTMLElement): Element | null {
  return container.querySelector('[role="grid"]');
}

function nameBoxValue(container: HTMLElement): string | null {
  return container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value ?? null;
}

interface WindowWithTauri {
  __TAURI__?: { core?: { invoke?: (command: string, args?: unknown) => unknown }; event?: { listen?: (...args: unknown[]) => unknown } };
  __TAURI_INTERNALS__?: unknown;
}

/** Setzt eine Window-Eigenschaft und liefert die exakte Restore-Funktion. */
function setWindowField(name: string, value: unknown): () => void {
  const target = window as unknown as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  try {
    Object.defineProperty(target, name, { configurable: true, writable: true, value });
  } catch {
    target[name] = value;
  }
  return () => {
    try {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    } catch {
      // Eine misslungene Restauration hinterlässt nur den Testzustand, nicht den Befund.
    }
  };
}

async function pressArrowDown(container: HTMLElement): Promise<unknown> {
  const root = gridRoot(container);
  if (!root) return new Error('Grid-Wurzel fehlt');
  let error: unknown = null;
  try {
    await act(async () => {
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  return error;
}

describe('GR-001 — Grid-Startup bei defekter Tauri-Bridge', () => {
  it('Fall 1: core.invoke wirft synchron', async () => {
    const restore = setWindowField('__TAURI__', {
      core: { invoke: () => { throw new Error('ipc_denied'); } },
      event: { listen: async () => () => undefined },
    });
    try {
      expect(typeof (window as unknown as WindowWithTauri).__TAURI__?.core?.invoke).toBe('function');
      const mounted = await mount(workbook());
      expect(mounted.error).toBeNull();
      expect(gridRole(mounted.container)).not.toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');

      const interactionError = await pressArrowDown(mounted.container);
      expect(interactionError).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 2: core.invoke liefert ein rejected Promise', async () => {
    const restore = setWindowField('__TAURI__', {
      core: { invoke: () => Promise.reject(new Error('ipc_rejected')) },
      event: { listen: async () => () => undefined },
    });
    try {
      const mounted = await mount(workbook());
      expect(mounted.error).toBeNull();
      expect(gridRole(mounted.container)).not.toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');

      const interactionError = await pressArrowDown(mounted.container);
      expect(interactionError).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 3: core.invoke liefert ein nie auflösendes Promise (Timeout)', async () => {
    const restore = setWindowField('__TAURI__', {
      core: { invoke: () => new Promise(() => undefined) },
      event: { listen: async () => () => undefined },
    });
    try {
      const started = Date.now();
      const mounted = await mount(workbook());
      const elapsed = Date.now() - started;

      // Kein Hänger: Mount und Effekte müssen in endlicher Zeit fertig werden.
      expect(elapsed, 'der Mount darf bei hängendem invoke nicht hängen').toBeLessThan(5_000);
      expect(mounted.error).toBeNull();
      expect(gridRole(mounted.container)).not.toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');

      const interactionError = await pressArrowDown(mounted.container);
      expect(interactionError).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 4: __TAURI_INTERNALS__ gesetzt, __TAURI__ fehlt', async () => {
    const restoreInternals = setWindowField('__TAURI_INTERNALS__', {});
    const restoreTauri = setWindowField('__TAURI__', undefined);
    try {
      const bridge = window as unknown as WindowWithTauri;
      expect(bridge.__TAURI__).toBeUndefined();
      expect(bridge.__TAURI_INTERNALS__).toEqual({});

      const mounted = await mount(workbook());
      expect(mounted.error).toBeNull();
      expect(gridRole(mounted.container)).not.toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');

      const interactionError = await pressArrowDown(mounted.container);
      expect(interactionError).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A2');
    } finally {
      restoreTauri();
      restoreInternals();
    }
  });

  it('Fall 5: __TAURI__.event.listen wirft', async () => {
    const restore = setWindowField('__TAURI__', {
      core: { invoke: () => Promise.resolve({} as never) },
      event: { listen: () => { throw new Error('listen_denied'); } },
    });
    try {
      expect(typeof (window as unknown as WindowWithTauri).__TAURI__?.event?.listen).toBe('function');
      const mounted = await mount(workbook());
      expect(mounted.error).toBeNull();
      expect(gridRole(mounted.container)).not.toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');

      const interactionError = await pressArrowDown(mounted.container);
      expect(interactionError).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A2');
    } finally {
      restore();
    }
  });
});
