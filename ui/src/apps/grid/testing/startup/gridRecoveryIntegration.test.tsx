// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001: Recovery-Integration für einen echten Grid-Render-Crash.
//
// Die bisherigen GR-001-Belege prüfen die Boundary-Klasse und den Diagnose-Serializer
// getrennt. Dieser Test führt die ganze Kette in einem echten DOM aus:
//   Crash → Recovery-Oberfläche → Diagnose-Ringpuffer → „Modul neu starten" → Grid läuft.
//
// Aufbau: `ModuleRecoveryBoundary` um eine Probe-Komponente. Die Probe wirft beim Render,
// solange der Test-Controller `crash` sagt; nach der Recovery setzt der Test den Controller
// auf `false`, klickt „Modul neu starten" und erwartet ein echtes `GridSheet` mit A1.
// Das Dokument trägt den synthetischen Zelltext `GEHEIM-ZELLE-99`; er darf nirgends im
// Diagnose-Trace auftauchen (die Recorder-Signatur bekommt das Dokument nicht).
//
// Befund dieses Laufs (2026-10-18): 4/4 grün.
//   Fall 1: Recovery-Oberfläche `[data-module-recovery="active"]` erscheint, der Text
//           „Modul wurde sicher angehalten“ ist sichtbar, `[role="grid"]` und
//           `[data-vgt-grid-root]` fehlen (kein stillschweigend leeres Grid).
//   Fall 2: `readModuleRecoveryDiagnostics()` enthält genau einen Datensatz (name=Error,
//           message=GRID_RENDER_FAILURE_7f3a, componentStack enthält CrashProbe); weder
//           Einzel-Datensatz noch Serializer enthalten GEHEIM-ZELLE-99.
//   Fall 3: Restart-Button „Modul neu starten“ (`type=button`) klickt; danach Recovery weg,
//           GridSheet gemountet, A1 aktiv; ArrowDown bewegt A1→A2.
//   Fall 4: `[data-module-recovery-diagnostics="true"]` existiert; Serializer trägt
//           `vgt.module-recovery/1` + Crash-Meldung und keinen Zelltext.
//
// Belegt sind damit: kontrolliertes Abfangen (`ModuleRecoveryBoundary.tsx:30-44, 90-107`),
// Neustart (`:82`/`:104`), inhaltsfreier Trace (`ModuleRecoveryBoundary.tsx:39-40` →
// `moduleRecoveryCore.ts:111-127, 132-135, 141-148`) und Diagnose-Export-Knopf (`:103`).
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { ModuleRecoveryBoundary } from '../../../../shell/recovery/ModuleRecoveryBoundary';
import {
  readModuleRecoveryDiagnostics,
  resetModuleRecoveryDiagnostics,
  serializeModuleRecoveryDiagnostics,
} from '../../../../shell/recovery/moduleRecoveryCore';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const SECRET_CELL_TEXT = 'GEHEIM-ZELLE-99';
const CRASH_MESSAGE = 'GRID_RENDER_FAILURE_7f3a';

const BASE: WorkspaceDocument = {
  id: 'grid-recovery-integration',
  title: 'Grid Recovery Integration',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function secretWorkbook(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    cells: { A1: { value: SECRET_CELL_TEXT } },
  }).updatedDocument;
}

interface CrashController {
  crash: boolean;
}

interface HarnessProps {
  readonly workbook: WorkspaceDocument;
  readonly controller: CrashController;
}

/**
 * Wirft, solange `controller.crash` true ist; rendert danach das echte GridSheet.
 * Der Controller bleibt absichtlich bis nach der Recovery true: so ist der erste Render
 * deterministisch ein Throw, und der zweite Render findet erst nach dem Restart-Klick statt.
 */
function CrashProbe({ workbook, controller }: HarnessProps) {
  if (controller.crash) throw new Error(CRASH_MESSAGE);
  return createElement(GridSheet, {
    document: workbook,
    workspaceDocuments: {},
    onUpdateDocument: () => undefined,
    onUpdateWorkspaceDocument: () => undefined,
    onSelectSelectionType: () => undefined,
    onCreateChart: () => undefined,
    networkCapability: 'None',
    keyVaultUnlocked: false,
  });
}

function RecoveryHarness({ workbook, controller }: HarnessProps) {
  return createElement(
    ModuleRecoveryBoundary,
    // `children` belongs to the props contract of the boundary (it renders them when no error
    // is active); passing it inside the props object also satisfies the createElement typing.
    { document: workbook, locale: 'de-DE', children: createElement(CrashProbe, { workbook, controller }) },
  );
}

interface MountedRecovery {
  readonly container: HTMLElement;
  readonly root: Root;
  readonly error: unknown;
  readonly controller: CrashController;
}

let active: MountedRecovery | null = null;

async function mount(workbook: WorkspaceDocument): Promise<MountedRecovery> {
  const controller: CrashController = { crash: true };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let error: unknown = null;
  try {
    await act(async () => {
      root.render(createElement(RecoveryHarness, { workbook, controller }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  active = { container, root, error, controller };
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
    // Nach einem geworfenen Mount bleibt die Wurzel unbrauchbar; der Befund bleibt erhalten.
  } finally {
    container.remove();
  }
}

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

beforeEach(() => {
  resetModuleRecoveryDiagnostics();
});

afterEach(async () => {
  await unmount();
  consoleErrorSpy.mockClear();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

const recoverySurface = (container: HTMLElement): Element | null =>
  container.querySelector('[data-module-recovery="active"]');

const gridSurface = (container: HTMLElement): Element | null =>
  container.querySelector('[data-vgt-grid-root="true"]');

const gridRole = (container: HTMLElement): Element | null =>
  container.querySelector('[role="grid"]');

const nameBoxValue = (container: HTMLElement): string | null =>
  container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value ?? null;

const buttonByText = (container: HTMLElement, label: string): HTMLButtonElement | null =>
  (Array.from(container.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim().includes(label),
  ) as HTMLButtonElement | undefined) ?? null;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await tick();
    await tick();
  });
}

async function pressArrowDown(container: HTMLElement): Promise<void> {
  const root = gridSurface(container);
  if (!root) return;
  await act(async () => {
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
  });
}

function diagnosticsJson(): string {
  return serializeModuleRecoveryDiagnostics();
}

describe('GR-001 — Recovery-Integration im echten DOM', () => {
  it('Fall 1: Crash → Recovery-Oberfläche, kein stillschweigend leeres Grid', async () => {
    const mounted = await mount(secretWorkbook());
    expect(mounted.error, 'die Boundary darf den Render-Fehler kontrolliert abfangen').toBeNull();
    expect(recoverySurface(mounted.container), 'Recovery-Oberfläche muss erscheinen').not.toBeNull();
    expect(mounted.container.textContent).toContain('Modul wurde sicher angehalten');
    expect(mounted.container.textContent).toContain('Vorfall');
    expect(gridRole(mounted.container), 'das Grid darf nicht stillschweigend leer im DOM stehen').toBeNull();
    expect(gridSurface(mounted.container)).toBeNull();
  });

  it('Fall 2: Diagnose enthält genau einen inhaltsfreien Trace', async () => {
    const mounted = await mount(secretWorkbook());
    expect(mounted.error).toBeNull();

    const records = readModuleRecoveryDiagnostics();
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.name).toBe('Error');
    expect(record.message).toBe(CRASH_MESSAGE);
    expect(record.componentStack.length, 'React componentStack muss erhalten bleiben').toBeGreaterThan(0);
    expect(record.componentStack.join('\n')).toContain('CrashProbe');

    const serialized = diagnosticsJson();
    expect(serialized).toContain(CRASH_MESSAGE);
    expect(serialized, 'kein Dokumentinhalt im Trace').not.toContain(SECRET_CELL_TEXT);
    expect(JSON.stringify(record), 'auch der Einzel-Datensatz bleibt inhaltsfrei').not.toContain(SECRET_CELL_TEXT);
  });

  it('Fall 3: „Modul neu starten“ mountet das echte Grid; ArrowDown A1→A2', async () => {
    const mounted = await mount(secretWorkbook());
    expect(mounted.error).toBeNull();
    expect(recoverySurface(mounted.container)).not.toBeNull();

    const restart = buttonByText(mounted.container, 'Modul neu starten');
    expect(restart, 'Restart-Button mit sichtbarem Text muss existieren').not.toBeNull();
    expect(restart!.type).toBe('button');

    mounted.controller.crash = false;
    await clickButton(restart!);

    expect(recoverySurface(mounted.container), 'Recovery-Oberfläche muss nach Neustart verschwinden').toBeNull();
    expect(gridSurface(mounted.container), 'GridSheet muss gemountet sein').not.toBeNull();
    expect(gridRole(mounted.container), 'die Rasterfläche muss da sein').not.toBeNull();
    expect(nameBoxValue(mounted.container)).toBe('A1');

    await pressArrowDown(mounted.container);
    expect(nameBoxValue(mounted.container)).toBe('A2');
  });

  it('Fall 4: Diagnose-Export-Button existiert; Serializer enthält nur den Trace', async () => {
    const mounted = await mount(secretWorkbook());
    expect(mounted.error).toBeNull();
    const exportButton = mounted.container.querySelector('[data-module-recovery-diagnostics="true"]');
    expect(exportButton, 'Diagnose-Export-Button muss auf der Recovery-Oberfläche stehen').not.toBeNull();

    const serialized = diagnosticsJson();
    expect(serialized).toContain('"schema": "vgt.module-recovery/1"');
    expect(serialized).toContain(CRASH_MESSAGE);
    expect(serialized).not.toContain(SECRET_CELL_TEXT);
  });
});
