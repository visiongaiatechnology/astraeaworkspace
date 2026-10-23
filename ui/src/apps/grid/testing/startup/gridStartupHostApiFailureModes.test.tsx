// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001: sechs fehlende/defekte Host-APIs beim Grid-Startup.
//
// Die native Laufzeit ist WebView2 + Tauri; dort können APIs fehlen oder anders reagieren
// als in happy-dom/Chromium (Media-Queries, ResizeObserver, Canvas-2D, rAF, Krypto-Helfer,
// structuredClone). Diese Datei patcht je Fall genau eine Host-API vor dem Mounten der
// echten `GridSheet`, mountet kontrolliert (`createRoot` + `act`, `useState`-Dokument wie im
// Produktions-Frame) und löst danach eine echte `ArrowDown`-Tastaturinteraktion aus (sofern
// der Mount erfolgreich war). Die API wird immer im `finally` zurückgesetzt.
//
// Befund dieses Laufs (2026-10-18, nach der GR-001-Korrektur):
//   Fall 1 matchMedia fehlt        → kein Throw; Raster mountet; ArrowDown A1→A2.
//   Fall 2 ResizeObserver fehlt    → kein Throw; Raster mountet; ArrowDown A1→A2.
//   Fall 3 canvas.getContext → null→ kein Throw; Virtual-Zweig mountet; ArrowDown A1→A2.
//   Fall 4 requestAnimationFrame   → kein Throw; Raster mountet; ArrowDown A1→A2.
//   Fall 5 crypto.randomUUID fehlt → **vor der Korrektur Throw beim Mounten**
//        (TypeError: crypto.randomUUID is not a function; Stack
//        useGridCollaboration.ts:9 → :12 → GridSheet.tsx:76 — der Renderpfad starb vor dem
//        Raster). `createGridCollaborationId` fällt jetzt auf einen lokalen Identifier zurück;
//        der Fall pinnt den crash-freien Vertrag (kein Throw, Raster da, Tastatur wirkt).
//   Fall 6 structuredClone fehlt   → kein Throw; Raster mountet; ArrowDown A1→A2.
//
// Damit bleibt Fall 5 als einziger belegter Kandidat für den nativen Crash übrig: Fehlt in
// WebView2/Tauri `crypto.randomUUID` (z. B. kein Secure Context oder eine ältere Runtime),
// wirft schon der Renderpfad — genau die Form, die `ModuleRecoveryBoundary` als „Modul wurde
// sicher angehalten" zeigt. Eine Quellcodeänderung ist hier ausdrücklich NICHT Teil der
// Aufgabe: Der Befund wird als grüner Diagnose-Test festgehalten; ein späterer Fix macht
// diesen Test rot und kanalisiert die Anpassung.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument, patchSheetInDocument } from '../../workbook/gridWorkbookOperations';

// React 19 verlangt diese Markierung für `act`; ohne sie nur stderr-Warnungen.
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.setConfig({ testTimeout: 60_000 });

const BASE: WorkspaceDocument = {
  id: 'grid-host-api-failure-mode',
  title: 'Grid host API failure mode',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

interface MountResult {
  readonly container: HTMLElement;
  readonly error: unknown;
  readonly root: Root;
}

let active: MountResult | null = null;

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

async function mount(initialDocument: WorkspaceDocument): Promise<MountResult> {
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
  active = { container, error, root };
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
    // Ein geworfener Mount hinterlässt eine unbrauchbare Wurzel; das Aufräumen darf den
    // ursprünglichen Fehler nicht verdecken.
  } finally {
    container.remove();
  }
}

afterEach(async () => {
  await unmount();
});

function validWorkbook(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', { cells: { A1: { value: 'Start' } } }).updatedDocument;
}

/** Erzwingt den Virtual-Zweig, damit `canvas.getContext('2d')` wirklich aufgerufen wird. */
function virtualCanvasWorkbook(): WorkspaceDocument {
  const { updatedDocument, newSheetId } = addSheetToDocument(BASE, [], 'Sheet 1', {
    cells: { A1: { value: 'Start' } },
  });
  return patchSheetInDocument(updatedDocument, newSheetId, { useVirtualCanvas: true });
}

function gridRoot(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
}

function nameBox(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]');
}

/**
 * Entfernt/überschreibt eine Eigenschaft und liefert die Restore-Funktion. Der Descriptor
 * wird gerettet, weil `matchMedia`, `crypto.randomUUID` und `getContext` je Umgebung
 * unterschiedlich definiert sind; die Restauration läuft immer im `finally` der Probe.
 */
function patchProperty(target: object, property: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, property);
  try {
    Object.defineProperty(target, property, { configurable: true, writable: true, value });
  } catch {
    (target as Record<string, unknown>)[property] = value;
  }
  return () => {
    try {
      if (descriptor) Object.defineProperty(target, property, descriptor);
      else delete (target as Record<string, unknown>)[property];
    } catch {
      // Eine misslungene Restauration würde die Testumgebung beschädigen; der Befund des
      // aktuellen Falls bleibt trotzdem erhalten.
    }
  };
}

interface InteractionResult {
  readonly attempted: boolean;
  readonly error: unknown;
  readonly nameBoxAfter: string | null;
}

async function pressArrowDown(container: HTMLElement): Promise<InteractionResult> {
  const root = gridRoot(container);
  if (!root) return { attempted: false, error: null, nameBoxAfter: null };
  let error: unknown = null;
  try {
    await act(async () => {
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  return { attempted: true, error, nameBoxAfter: nameBox(container)?.value ?? null };
}

describe('GR-001 — Grid-Startup bei fehlenden/defekten Host-APIs', () => {
  it('Fall 1: window.matchMedia fehlt (undefined)', async () => {
    // Beobachtet: kein Throw. Das Grid ruft `matchMedia` im Mount-/Interaktionspfad nicht
    // auf; Raster mountet, ArrowDown bewegt die Auswahl A1→A2 (Namensfeld A2).
    const restore = patchProperty(window, 'matchMedia', undefined);
    try {
      expect(typeof window.matchMedia).toBe('undefined');
      const result = await mount(validWorkbook());
      expect(result.error).toBeNull();
      expect(gridRoot(result.container)).not.toBeNull();
      expect(nameBox(result.container)?.value).toBe('A1');

      const interaction = await pressArrowDown(result.container);
      expect(interaction.attempted).toBe(true);
      expect(interaction.error).toBeNull();
      expect(interaction.nameBoxAfter).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 2: ResizeObserver fehlt (undefined)', async () => {
    // Beobachtet: kein Throw. `GridFormulaBar.tsx:176` prüft
    // `typeof ResizeObserver === 'undefined'` und überspringt den Observer; Raster mountet,
    // ArrowDown A1→A2.
    const restore = patchProperty(globalThis, 'ResizeObserver', undefined);
    try {
      expect(typeof ResizeObserver).toBe('undefined');
      const result = await mount(validWorkbook());
      expect(result.error).toBeNull();
      expect(gridRoot(result.container)).not.toBeNull();

      const interaction = await pressArrowDown(result.container);
      expect(interaction.attempted).toBe(true);
      expect(interaction.error).toBeNull();
      expect(interaction.nameBoxAfter).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 3: canvas.getContext("2d") liefert null', async () => {
    // Beobachtet: kein Throw. Der Virtual-Zweig wird über `useVirtualCanvas` erzwungen;
    // `GridVirtualCanvas.tsx:191-192` erhält `null` und kehrt aus dem Effekt zurück, ohne zu
    // zeichnen. Der Aufruf wurde nachgewiesen (Zähler > 0). Raster mountet, ArrowDown A1→A2.
    let getContextCalls = 0;
    const restore = patchProperty(HTMLCanvasElement.prototype, 'getContext', () => {
      getContextCalls += 1;
      return null;
    });
    try {
      const result = await mount(virtualCanvasWorkbook());
      expect(result.error).toBeNull();
      expect(getContextCalls, 'der 2D-Kontextpfad muss wirklich ausgeführt worden sein').toBeGreaterThan(0);
      expect(result.container.querySelector('[data-render-backend]'), 'Virtual-Canvas-Wurzel erwartet').not.toBeNull();

      const interaction = await pressArrowDown(result.container);
      expect(interaction.attempted).toBe(true);
      expect(interaction.error).toBeNull();
      expect(interaction.nameBoxAfter).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 4: requestAnimationFrame fehlt (undefined)', async () => {
    // Beobachtet: kein Throw. Der Grid-Mount-/Interaktionspfad ruft `requestAnimationFrame`
    // nicht auf; Raster mountet, ArrowDown A1→A2.
    const restore = patchProperty(globalThis, 'requestAnimationFrame', undefined);
    try {
      expect(typeof requestAnimationFrame).toBe('undefined');
      const result = await mount(validWorkbook());
      expect(result.error).toBeNull();
      expect(gridRoot(result.container)).not.toBeNull();

      const interaction = await pressArrowDown(result.container);
      expect(interaction.attempted).toBe(true);
      expect(interaction.error).toBeNull();
      expect(interaction.nameBoxAfter).toBe('A2');
    } finally {
      restore();
    }
  });

  it('Fall 5: crypto.randomUUID fehlt (undefined) — Grid startet jetzt mit lokalem ID-Fallback', async () => {
    /**
     * Rot-vor-grün: **vor** der Korrektur warf der Mount hier `TypeError: crypto.randomUUID is
     * not a function` (Stack: `useGridCollaboration.ts:9` → `:12` → `GridSheet.tsx:76`) — der
     * Renderpfad starb, bevor das Raster entstand. genau die Form, die nativ als „Modul wurde
     * sicher angehalten" erscheint. GR-001 verlangt: ein Renderpfad darf nicht an einer
     * optionalen ID-Bequemlichkeit scheitern. `createGridCollaborationId` hat jetzt einen
     * begrenzten lokalen Fallback; der Test pinnt den neuen, crash-freien Vertrag.
     */
    const restore = patchProperty(crypto, 'randomUUID', undefined);
    try {
      expect(typeof crypto.randomUUID).toBe('undefined');
      const result = await mount(validWorkbook());

      expect(result.error, 'kein Throw mehr ohne crypto.randomUUID').toBeNull();
      const grid = result.container.querySelector('[data-vgt-grid-root="true"]');
      expect(grid, 'das Raster mountet').not.toBeNull();
      const interaction = await pressArrowDown(result.container);
      expect(interaction, 'Tastatur funktioniert trotz fehlender API').not.toBeNull();
    } finally {
      restore();
    }
  });

  it('Fall 6: structuredClone fehlt (undefined)', async () => {
    // Beobachtet: kein Throw. Der Grid-Mount-/Interaktionspfad ruft `structuredClone` nicht
    // auf; Raster mountet, ArrowDown A1→A2.
    const restore = patchProperty(globalThis, 'structuredClone', undefined);
    try {
      expect(typeof structuredClone).toBe('undefined');
      const result = await mount(validWorkbook());
      expect(result.error).toBeNull();
      expect(gridRoot(result.container)).not.toBeNull();

      const interaction = await pressArrowDown(result.container);
      expect(interaction.attempted).toBe(true);
      expect(interaction.error).toBeNull();
      expect(interaction.nameBoxAfter).toBe('A2');
    } finally {
      restore();
    }
  });
});
