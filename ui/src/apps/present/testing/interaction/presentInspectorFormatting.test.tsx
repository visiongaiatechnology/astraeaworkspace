// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1: inspector formatting persistence + undo (Round 20)
//
// The inspector is the only formatting surface for scene objects. This file drives its real
// controls (input/change events on the rendered DOM), asserts on the published document, proves one
// history step per change and runs the canonical save/reopen pair over the changed payload.
//
// Measured Ist-Zustand (no gap needed a production fix):
//   - text: fontSizePt (`Pt:` number input), fontWeight ("Font weight"), textAlign ("Text alignment")
//     and color ("Text colour") all write through the pure `applyPresentTextFormat` rule;
//   - shape: fill/stroke/strokeWidth write through `onPatchObject` (primary object only);
//   - each change is exactly one history entry (undo/redo step by step);
//   - the canonical writer/reader keeps all format values;
//   - multi-selection: text formatting applies to **every selected text object** (the rule iterates
//     the selection), while shape formatting addresses the primary object only (documented asymmetry).
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';

vi.setConfig({ testTimeout: 60_000 });

const TEXT_OBJECT = {
  id: 'text-1',
  kind: 'text',
  text: 'Formatted text',
  xPercent: 10,
  yPercent: 10,
  widthPercent: 30,
  heightPercent: 18,
  fontSizePt: 22,
  fontWeight: 'normal',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  zIndex: 10,
};

const SECOND_TEXT_OBJECT = {
  ...TEXT_OBJECT,
  id: 'text-2',
  text: 'Second text',
  xPercent: 55,
  yPercent: 10,
  zIndex: 20,
};

const SHAPE_OBJECT = {
  id: 'shape-1',
  kind: 'shape',
  shape: 'rectangle',
  xPercent: 15,
  yPercent: 55,
  widthPercent: 25,
  heightPercent: 18,
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  opacity: 1,
  zIndex: 30,
};

function slideWith(sceneObjects: unknown[]): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: sceneObjects as never,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-inspector-formatting',
    title: 'Present inspector formatting',
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

async function mount(sceneObjects: unknown[] = [TEXT_OBJECT, SHAPE_OBJECT]): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith(slideWith(sceneObjects)) }));
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

function objectElement(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`object ${id} not rendered`);
  return element;
}

function sceneObjects(): Array<Record<string, unknown>> {
  return (latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
}

function objectById(id: string): Record<string, unknown> {
  const object = sceneObjects().find((candidate) => candidate.id === id);
  if (!object) throw new Error(`object ${id} missing in the published document`);
  return object;
}

async function clickElement(target: Element, init: MouseEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    await settle();
  });
}

async function pressKey(target: Element | Window, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    await settle();
  });
}

/** Inputs/selects of the open inspector, located by their visible label text or aria-label. */
function numberInputByLabel(host: HTMLElement, labelText: string): HTMLInputElement {
  const input = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="number"]')).find((candidate) =>
    (candidate.closest('label')?.textContent ?? '').includes(labelText),
  );
  if (!input) throw new Error(`number input "${labelText}" not rendered`);
  return input;
}

function colorInputByLabel(host: HTMLElement, labelText: string): HTMLInputElement {
  const input = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="color"]')).find((candidate) =>
    (candidate.closest('label')?.textContent ?? '').includes(labelText),
  );
  if (!input) throw new Error(`colour input "${labelText}" not rendered`);
  return input;
}

function selectByAriaLabel(host: HTMLElement, ariaLabel: string): HTMLSelectElement {
  const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${ariaLabel}"]`);
  if (!select) throw new Error(`select "${ariaLabel}" not rendered`);
  return select;
}

async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  });
}

async function setSelectValue(select: HTMLSelectElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  });
}

/** Selects one object and opens the inspector (the click handler sets showInspector). */
async function selectObject(host: HTMLElement, id: string, init: MouseEventInit = {}): Promise<void> {
  await clickElement(objectElement(host, id), init);
}

describe('Present M1 — inspector formatting persistence/undo (Round 20)', () => {
  it('Fall 1: text formatting writes fontSize/fontWeight/textAlign/color into the document', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');

    const geometryBefore = {
      xPercent: objectById('text-1').xPercent,
      yPercent: objectById('text-1').yPercent,
      widthPercent: objectById('text-1').widthPercent,
      heightPercent: objectById('text-1').heightPercent,
    };
    const textBefore = objectById('text-1').text;

    await setInputValue(numberInputByLabel(host, 'Pt:'), '34');
    expect(objectById('text-1').fontSizePt, 'Schriftgröße im Dokument').toBe(34);

    await setSelectValue(selectByAriaLabel(host, 'Font weight'), 'bold');
    expect(objectById('text-1').fontWeight).toBe('bold');

    await setSelectValue(selectByAriaLabel(host, 'Text alignment'), 'center');
    expect(objectById('text-1').textAlign).toBe('center');

    await setInputValue(host.querySelector<HTMLInputElement>('input[aria-label="Text colour"]')!, '#ff0000');
    expect(objectById('text-1').color).toBe('#ff0000');

    // Untouched by formatting: geometry and the text itself.
    expect({
      xPercent: objectById('text-1').xPercent,
      yPercent: objectById('text-1').yPercent,
      widthPercent: objectById('text-1').widthPercent,
      heightPercent: objectById('text-1').heightPercent,
    }).toEqual(geometryBefore);
    expect(objectById('text-1').text).toBe(textBefore);
    // The other object stays untouched.
    expect(objectById('shape-1').fillColor).toBe(SHAPE_OBJECT.fillColor);
  });

  it('Fall 2: every formatting change is exactly one undo step; redo re-applies it', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');

    await setInputValue(numberInputByLabel(host, 'Pt:'), '34');
    await setSelectValue(selectByAriaLabel(host, 'Font weight'), 'bold');
    expect(objectById('text-1').fontSizePt).toBe(34);
    expect(objectById('text-1').fontWeight).toBe('bold');

    // First undo reverts the last change (font weight), the second reverts the font size.
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(objectById('text-1').fontWeight, 'Undo 1: fontWeight zurück').toBe('normal');
    expect(objectById('text-1').fontSizePt, 'fontSize noch geändert').toBe(34);
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(objectById('text-1').fontSizePt, 'Undo 2: fontSize zurück').toBe(22);

    // Redo re-applies the two steps in order.
    await pressKey(window, { key: 'y', ctrlKey: true });
    expect(objectById('text-1').fontSizePt, 'Redo 1: fontSize').toBe(34);
    await pressKey(window, { key: 'y', ctrlKey: true });
    expect(objectById('text-1').fontWeight, 'Redo 2: fontWeight').toBe('bold');
  });

  it('Fall 3: shape formatting writes fill/stroke/strokeWidth and never touches the text object', async () => {
    const host = await mount();
    await selectObject(host, 'shape-1');
    const textBefore = JSON.stringify(objectById('text-1'));

    await setInputValue(colorInputByLabel(host, 'Fill Color'), '#123456');
    expect(objectById('shape-1').fillColor).toBe('#123456');
    await setInputValue(colorInputByLabel(host, 'Stroke Color'), '#abcdef');
    expect(objectById('shape-1').strokeColor).toBe('#abcdef');
    await setInputValue(numberInputByLabel(host, 'Stroke (px)'), '5');
    expect(objectById('shape-1').strokeWidth).toBe(5);

    expect(JSON.stringify(objectById('text-1')), 'Textobjekt unberührt').toBe(textBefore);
    // One undo reverts the last shape change.
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(objectById('shape-1').strokeWidth, 'Shape-Änderung ist undo-fähig').toBe(2);
  });

  it('Fall 4: changed format values survive the canonical save/reopen pair', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    await setInputValue(numberInputByLabel(host, 'Pt:'), '34');
    await setSelectValue(selectByAriaLabel(host, 'Font weight'), 'bold');
    await setSelectValue(selectByAriaLabel(host, 'Text alignment'), 'center');
    await setInputValue(host.querySelector<HTMLInputElement>('input[aria-label="Text colour"]')!, '#ff0000');

    await selectObject(host, 'shape-1');
    await setInputValue(colorInputByLabel(host, 'Fill Color'), '#123456');
    await setInputValue(colorInputByLabel(host, 'Stroke Color'), '#abcdef');
    await setInputValue(numberInputByLabel(host, 'Stroke (px)'), '5');

    const saved = serializeWorkspaceDocumentCanonical(latest!);
    const reopened = deserializeWorkspaceDocumentCanonical(saved);
    const reopenedObjects = (reopened.presentData?.slides[0]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
    const reopenedText = reopenedObjects.find((object) => object.id === 'text-1')!;
    const reopenedShape = reopenedObjects.find((object) => object.id === 'shape-1')!;
    expect(reopenedText.fontSizePt).toBe(34);
    expect(reopenedText.fontWeight).toBe('bold');
    expect(reopenedText.textAlign).toBe('center');
    expect(reopenedText.color).toBe('#ff0000');
    expect(reopenedShape.fillColor).toBe('#123456');
    expect(reopenedShape.strokeColor).toBe('#abcdef');
    expect(reopenedShape.strokeWidth).toBe(5);
    expect(reopenedText.text, 'Text bleibt unverändert').toBe(TEXT_OBJECT.text);
  });

  it('Fall 5: multi-selection text formatting — measured Ist-Verhalten (applies to all selected text objects)', async () => {
    const host = await mount([TEXT_OBJECT, SECOND_TEXT_OBJECT]);
    // Click the first, Shift+click the second (click-only additive toggle).
    await selectObject(host, 'text-1');
    await selectObject(host, 'text-2', { shiftKey: true });
    const selected = Array.from(host.querySelectorAll<HTMLElement>('[data-present-object-selected="true"]'))
      .map((element) => element.dataset.presentObjectId ?? '');
    expect(selected.sort(), 'beide Textobjekte ausgewählt').toEqual(['text-1', 'text-2']);

    await setInputValue(numberInputByLabel(host, 'Pt:'), '40');
    // Measured: the inspector applies the pure `applyPresentTextFormat` rule to the whole selection.
    expect(objectById('text-1').fontSizePt, 'text-1 formatiert').toBe(40);
    expect(objectById('text-2').fontSizePt, 'text-2 ebenfalls formatiert').toBe(40);
  });
});
