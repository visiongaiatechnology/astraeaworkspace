// @vitest-environment happy-dom
// STATUS: PLATIN — Present malformed entries: write-back data integrity (Round 25)
//
// Round 24 made the readers filter `sceneObjects`; this matrix proves the WRITE paths put the
// filtered result back into the raw list without losing the hostile entries. The stage/inspector
// transforms run on the filtered view, the central merge helper (`mergePresentSceneObjects`)
// reinstates every raw non-object entry at its position, and the document keeps it byte-identically.
//
// Helper-Vertrag (pure):
//   - non-object / id-less raw entries keep their slot and their original relative position;
//   - raw objects whose id appears in `nextEntries` are replaced by the updated version and follow
//     the nextEntries order (delete by id, reorder honoured, duplicate ids preserved occurrence-wise);
//   - genuinely new ids are appended at the end in nextEntries order;
//   - identity writes return the raw list byte-identically.
// Central write point: `PresentCanvas.handleUpdateActiveSlide` (Stage/editor/toolbar all funnel
// through it); the editor's write computations filter the entries first so the merge gets valid ids.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const TEXT_OBJECT = {
  id: 'text-1',
  kind: 'text',
  text: 'Keep me',
  xPercent: 20,
  yPercent: 20,
  widthPercent: 30,
  heightPercent: 20,
  fontSizePt: 22,
  fontWeight: 'semibold',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  zIndex: 10,
};

const MALFORMED_SCENE_OBJECTS = [null, TEXT_OBJECT, {}] as unknown[];

function slideWithMalformedEntries(): PresentSlide {
  return {
    id: 'slide-1',
    title: 'Malformed entries',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: MALFORMED_SCENE_OBJECTS as never,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-malformed-writeback',
    title: 'Present malformed write-back',
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

async function mount(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith(slideWithMalformedEntries()) }));
  });
  return container;
}

async function settle(ms = 0): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function stage(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('stage not rendered');
  return element;
}

function objectElement(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`object ${id} not rendered`);
  return element;
}

/** The RAW sceneObjects array of the published document (including null/{} entries). */
function rawSceneObjects(): unknown[] {
  return (latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as unknown[];
}

function rawSlotJson(): string[] {
  return rawSceneObjects().map((entry) => JSON.stringify(entry));
}

function objectEntry(id: string): Record<string, unknown> | undefined {
  return rawSceneObjects().find(
    (entry) => typeof entry === 'object' && entry !== null && (entry as { id?: string }).id === id,
  ) as Record<string, unknown> | undefined;
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(30);
  });
}

async function doubleClickStage(host: HTMLElement, clientX = 288, clientY = 162): Promise<void> {
  await act(async () => {
    stage(host).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY }));
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

async function pressKey(target: Element | Window, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    await settle(60);
  });
}

async function setNumberInputValue(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(60);
  });
}

function numberInputByLabel(host: HTMLElement, labelText: string): HTMLInputElement {
  const input = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]')).find((candidate) =>
    (candidate.closest('label')?.textContent ?? '').includes(labelText),
  );
  if (!input) throw new Error(`number input "${labelText}" not rendered`);
  return input;
}

describe('Present M1 — malformed-entry write-back integrity (Round 25)', () => {
  it('Fall 1: drag/resize keep the raw null and {} entries byte-identically', async () => {
    const host = await mount();
    expect(rawSlotJson(), 'Start: null, text-1, {}').toEqual([
      'null',
      JSON.stringify(TEXT_OBJECT),
      '{}',
    ]);

    await drag(objectElement(host, 'text-1'), { x: 200, y: 150 }, { x: 248, y: 150 });
    let slots = rawSlotJson();
    expect(slots, 'drei Einträge nach dem Drag').toHaveLength(3);
    expect(slots[0], 'null bleibt an Position 0').toBe('null');
    expect(slots[2], '{} bleibt an Position 2').toBe('{}');
    expect(objectEntry('text-1')!.xPercent, 'text-1 bewegt').toBeCloseTo(25, 3);

    const handle = host.querySelector<HTMLElement>('[data-present-object-id="text-1"] [data-present-handle="resize-se"]');
    expect(handle, 'se-Handle gerendert').not.toBeNull();
    await drag(handle!, { x: 260, y: 200 }, { x: 284, y: 200 });
    slots = rawSlotJson();
    expect(slots[0], 'null nach Resize').toBe('null');
    expect(slots[2], '{} nach Resize').toBe('{}');
    expect(objectEntry('text-1')!.widthPercent, 'Resize geschrieben').toBeCloseTo(32.5, 3);
  });

  it('Fall 2: nudge keeps the raw entries; Delete removes only text-1', async () => {
    const host = await mount();
    await clickElement(objectElement(host, 'text-1'));
    await pressKey(window, { key: 'ArrowRight' });
    let slots = rawSlotJson();
    expect(slots).toHaveLength(3);
    expect(slots[0]).toBe('null');
    expect(slots[2]).toBe('{}');
    expect(objectEntry('text-1')!.xPercent).toBeCloseTo(20.25, 6);

    await pressKey(window, { key: 'Delete' });
    slots = rawSlotJson();
    expect(slots, 'nur text-1 gelöscht, rohe Einträge bleiben').toHaveLength(2);
    expect(slots[0]).toBe('null');
    expect(slots[1]).toBe('{}');
    expect(objectEntry('text-1'), 'text-1 ist weg').toBeUndefined();
  });

  it('Fall 3: a new double-click text box is appended after the raw entries', async () => {
    const host = await mount();
    await doubleClickStage(host);
    const slots = rawSlotJson();
    expect(slots, 'vier Einträge: null, text-1, {}, neu').toHaveLength(4);
    expect(slots[0], 'null an Position 0').toBe('null');
    expect((JSON.parse(slots[1]) as { id: string }).id, 'text-1 an Position 1').toBe('text-1');
    expect(slots[2], '{} an Position 2').toBe('{}');
    const created = JSON.parse(slots[3]) as { kind: string; id: string };
    expect(created.kind, 'neues Textobjekt am Ende').toBe('text');
    expect(created.id).not.toBe('text-1');
  });

  it('Fall 4: inspector font-size patch keeps the raw entries', async () => {
    const host = await mount();
    await clickElement(objectElement(host, 'text-1'));
    await setNumberInputValue(numberInputByLabel(host, 'Pt:'), '34');
    const slots = rawSlotJson();
    expect(slots, 'drei Einträge nach dem Patch').toHaveLength(3);
    expect(slots[0]).toBe('null');
    expect(slots[2]).toBe('{}');
    expect(objectEntry('text-1')!.fontSizePt, 'Format-Patch geschrieben').toBe(34);
  });

  it('Fall 5: canonical save/reopen preserves the raw entries', async () => {
    const host = await mount();
    await drag(objectElement(host, 'text-1'), { x: 200, y: 150 }, { x: 248, y: 150 });
    await clickElement(objectElement(host, 'text-1'));
    await setNumberInputValue(numberInputByLabel(host, 'Pt:'), '34');

    const saved = serializeWorkspaceDocumentCanonical(latest!);
    const reopened = deserializeWorkspaceDocumentCanonical(saved);
    const reopenedObjects = (reopened.presentData?.slides[0]?.sceneObjects ?? []) as unknown[];
    expect(reopenedObjects, 'Save/Reopen erhält alle Einträge').toHaveLength(3);
    expect(reopenedObjects[0], 'null bleibt null').toBeNull();
    expect(reopenedObjects[2], '{} bleibt {}').toEqual({});
    const text = reopenedObjects[1] as Record<string, unknown>;
    expect(text.id).toBe('text-1');
    expect(text.xPercent, 'Drag überlebt Save/Reopen').toBeCloseTo(25, 3);
    expect(text.fontSizePt, 'Formatierung überlebt Save/Reopen').toBe(34);
  });
});
