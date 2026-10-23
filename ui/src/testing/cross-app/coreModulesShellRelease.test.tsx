// @vitest-environment happy-dom
// STATUS: PLATIN — Shell-Kernpfad-Smoke der Beta-Kernmodule Notes und Tasks.
//
// **Warum diese Datei existiert:** Notes und Tasks sind laut Release-Priorisierung **Kernmodule (Beta)**.
// Ein Kernmodul-Versprechen ist nur belastbar, wenn der echte Shell-Pfad beweisbar ist:
//   • `createNewDocument('Notes' | 'Tasks')` → `AppWorkspaceView` (Lazy-Load, Suspense, Recovery-Boundary)
//   • Notes: Schreiben landet im Dokumentmodell; Suche ist über die sichtbare Oberfläche erreichbar.
//   • Tasks: Anlegen landet im Dokumentmodell; Abhaken ändert den Status.
//   • In beiden Fällen: kein Recovery-Screen, kein Render-Throw.
//
// Bewusste Grenze: Hier wird **kein** Datei-/IndexedDB-Speicher geprüft — das ist der Integritäts-Pfad
// (`shell/persistence`, eigener Teammate). Dieser Test beweist die Modul-Kernpfade im Shell-Kontext.
import { act, createElement, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyVaultStatus, WorkspaceDocument } from '../../shared/contracts/workspace';
import { createNewDocument } from '../../app/bootstrap/seedDocDefaultsOpenCore';
import { AppWorkspaceView } from '../../shell/workspace/AppWorkspaceView';
import { ModuleRecoveryBoundary } from '../../shell/recovery/ModuleRecoveryBoundary';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 60_000 });

const VAULT_STATUS: KeyVaultStatus = {
  isLocked: false, hasPin: false, platform: 'test', privacyMode: false, pqcUnlocked: false,
};

let container: HTMLElement | null = null;
let root: Root | null = null;
let latest: WorkspaceDocument | null = null;

async function sleep(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function settle(rounds = 90): Promise<void> {
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

interface Mounted { readonly container: HTMLElement; readonly error: unknown }

async function mount(documentUnderTest: WorkspaceDocument): Promise<Mounted> {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  let error: unknown = null;
  try {
    await act(async () => { root!.render(createElement(ShellHarness, { start: documentUnderTest })); });
    await settle(40);
  } catch (reason) {
    error = reason;
  }
  return { container, error };
}

afterEach(async () => {
  if (root) { await act(async () => { root!.unmount(); }); root = null; }
  container?.remove(); container = null; latest = null;
});

async function waitFor(host: HTMLElement, selector: string, timeoutMs = 20_000): Promise<HTMLElement> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const element = host.querySelector<HTMLElement>(selector);
    if (element) return element;
    await act(async () => { await sleep(25); });
  }
  throw new Error(`${selector} not rendered within timeout`);
}

/** Setzt den Wert eines kontrollierten Eingabefelds so, wie React ihn tatsächlich sieht. */
async function typeInto(element: HTMLTextAreaElement | HTMLInputElement, value: string): Promise<void> {
  const prototype = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('value setter unavailable');
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(40);
  });
}

describe('Beta-Kernmodul Notes im echten Shell-Pfad', () => {
  it('opens without recovery, writes into the document model, and exposes search UI', async () => {
    const created = createNewDocument('Notes' as never) as WorkspaceDocument;
    const mounted = await mount(created);
    expect(mounted.error, 'kein Render-Throw im Shell-Pfad').toBeNull();
    expect(mounted.container.querySelector('[data-module-recovery="active"]'), 'kein Recovery-Screen').toBeNull();

    const appRoot = await waitFor(mounted.container, '[data-vgt-notes-root="true"]');
    const textarea = (await waitFor(appRoot, 'textarea[aria-label="Note body markdown editor"]')) as HTMLTextAreaElement;

    await typeInto(textarea, 'Beta Kernpfad: Notiz schreiben und organisieren.');
    await settle(12);
    expect(textarea.value, 'kontrolliertes Notes-Feld übernimmt den Text').toBe('Beta Kernpfad: Notiz schreiben und organisieren.');
    // Der Commit-Pfad der Notiz kann mehrere Träger aktualisieren (noteData und Page-Objects); geprüft wird
    // deshalb das gesamte Dokumentmodell, nicht nur ein einzelnes Feld.
    expect(JSON.stringify(latest), 'Notiztext landet im Dokumentmodell').toContain('Beta Kernpfad: Notiz schreiben und organisieren.');

    // Suchen ist ein sichtbarer, erreichbarer Kernpfad der Notiz-Oberfläche.
    const findButton = appRoot.querySelector<HTMLButtonElement>('button[aria-label="Find & Replace"]');
    expect(findButton, 'Suchen/Ersetzen ist sichtbar').not.toBeNull();
    const inputsBefore = appRoot.querySelectorAll('input[type="text"]').length;
    await act(async () => { findButton!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(80); });
    await settle(2);
    const inputsAfter = appRoot.querySelectorAll('input[type="text"]').length;
    expect(inputsAfter, 'Suchen-Dialog öffnet mit Eingabefeld').toBeGreaterThan(inputsBefore);
  });
});

describe('Beta-Kernmodul Tasks im echten Shell-Pfad', () => {
  it('opens without recovery, creates a task, and toggles it complete in the document model', async () => {
    const created = createNewDocument('Tasks' as never) as WorkspaceDocument;
    const before = created.workManagementData?.tasks.length ?? 0;
    const mounted = await mount(created);
    expect(mounted.error, 'kein Render-Throw im Shell-Pfad').toBeNull();
    expect(mounted.container.querySelector('[data-module-recovery="active"]'), 'kein Recovery-Screen').toBeNull();

    const appRoot = await waitFor(mounted.container, '[data-vgt-tasks-root="true"]');
    const titleInput = (await waitFor(appRoot, 'input[aria-label="New task title"]')) as HTMLInputElement;
    await typeInto(titleInput, 'Beta-Kernpfad-Aufgabe');

    const addButton = appRoot.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(addButton, 'Anlegen-Button vorhanden').not.toBeNull();
    await act(async () => { addButton!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(80); });
    await settle(6);

    const tasks = latest!.workManagementData?.tasks ?? [];
    expect(tasks.length, 'Aufgabe wurde angelegt').toBe(before + 1);
    const createdTask = tasks.find((entry) => entry.title.includes('Beta-Kernpfad-Aufgabe'));
    expect(createdTask, 'angelegte Aufgabe trägt den eingegebenen Titel').toBeDefined();

    // Abhaken ist der zweite Kernpfad: der Status muss im Dokumentmodell wechseln (ein Task, kein
    // Attrappen-Toast). Welche Zeile zuerst sichtbar ist, hängt von der Sortierung ab — geprüft wird der
    // Statuswechsel eines vorhandenen Tasks.
    const completedBefore = new Map((latest!.workManagementData?.tasks ?? []).map((entry) => [entry.id, Boolean(entry.completed)]));
    const toggle = appRoot.querySelector<HTMLButtonElement>('button[aria-label="Mark complete"]');
    expect(toggle, 'Abhaken-Steuerung sichtbar').not.toBeNull();
    await act(async () => { toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(80); });
    await settle(4);
    const flipped = (latest!.workManagementData?.tasks ?? []).filter(
      (entry) => completedBefore.get(entry.id) === false && entry.completed === true,
    );
    expect(flipped.length, 'genau ein Task wurde als erledigt markiert').toBe(1);
  });
});
