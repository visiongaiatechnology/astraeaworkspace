// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1: multi-slide data integrity + duplicate-slide ID uniqueness (Round 15)
//
// The document is the only persistence owner; the active slide must never leak edits into its
// neighbours. This matrix drives the real `PresentCanvas` (double-click/typing/keyboard navigation/
// duplicate/delete/undo) and asserts on the **published document**. It also pins that a duplicated
// slide gets fresh scene-object ids — otherwise selection, drag and z-order would be ambiguous
// across slides (the duplicate would address the original objects).
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { reusePresentSlides } from '../../productivity/presentProductivity';
import { buildPresentSlideSvg } from '../../interchange/render/presentExport';

vi.setConfig({ testTimeout: 60_000 });

const TEXT_OBJECT = (id: string, text: string): Record<string, unknown> => ({
  id,
  kind: 'text',
  text,
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
});

const SHAPE_OBJECT = (id: string): Record<string, unknown> => ({
  id,
  kind: 'shape',
  shape: 'rectangle',
  xPercent: 55,
  yPercent: 55,
  widthPercent: 20,
  heightPercent: 16,
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  opacity: 1,
  zIndex: 20,
});

function slideWith(id: string, sceneObjects: unknown[] = []): PresentSlide {
  return {
    id,
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: sceneObjects as never,
  } as PresentSlide;
}

function documentWith(slides: PresentSlide[]): WorkspaceDocument {
  return {
    id: 'present-multi-slide-integrity',
    title: 'Present multi-slide integrity',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides, theme: 'dark', aspectRatio: '16:9' },
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

interface MountOutcome {
  host: HTMLElement;
  error: Error | null;
}

async function mount(slides: PresentSlide[]): Promise<MountOutcome> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let error: Error | null = null;
  try {
    await act(async () => {
      root!.render(createElement(ControlledPresenter, { start: documentWith(slides) }));
    });
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }
  return { host: container, error };
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

async function pressKey(target: Element | Window, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await settle();
  });
  return event;
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function doubleClickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await settle();
  });
}

function slides(): PresentSlide[] {
  return (latest?.presentData?.slides ?? []) as PresentSlide[];
}

function slideTitleJson(index: number): string {
  return JSON.stringify(slides()[index]);
}

function objectById(slideIndex: number, objectId: string): Record<string, unknown> {
  const object = (slides()[slideIndex]?.sceneObjects ?? []).find(
    (candidate) => (candidate as { id?: string }).id === objectId,
  ) as Record<string, unknown> | undefined;
  if (!object) throw new Error(`object ${objectId} missing on slide ${slideIndex + 1}`);
  return object;
}

function objectElement(host: HTMLElement, objectId: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${objectId}"]`);
  if (!element) throw new Error(`object ${objectId} not rendered`);
  return element;
}

async function typeIntoEditor(host: HTMLElement, value: string): Promise<HTMLTextAreaElement> {
  const editor = host.querySelector<HTMLTextAreaElement>('[data-present-object-id] textarea');
  if (!editor) throw new Error('text editor not open');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(editor, value);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  });
  return editor;
}

function duplicateButtonFor(host: HTMLElement, thumbnail: number): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(
    `[data-present-slide-thumbnail="${thumbnail}"] button[aria-label="Duplicate Slide"]`,
  );
  if (!button) throw new Error('duplicate slide button not rendered');
  return button;
}

function deleteButtonFor(host: HTMLElement, thumbnail: number): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(
    `[data-present-slide-thumbnail="${thumbnail}"] button[aria-label="Delete Slide"]`,
  );
  if (!button) throw new Error('delete slide button not rendered');
  return button;
}

function sceneObjectIdsOf(slideIndex: number): string[] {
  return (slides()[slideIndex]?.sceneObjects ?? []).map((object) => (object as { id?: string }).id ?? '');
}

describe('Present M1 — multi-slide integrity (Round 15)', () => {
  it('Fall 1: isolate the edit on slide 1 — slides 2/3 stay deeply unchanged', async () => {
    const outcome = await mount([
      slideWith('slide-1', [TEXT_OBJECT('text-1', 'Slide one')]),
      slideWith('slide-2', [TEXT_OBJECT('text-2', 'Slide two')]),
      slideWith('slide-3', [TEXT_OBJECT('text-3', 'Slide three')]),
    ]);
    expect(outcome.error).toBeNull();
    const host = outcome.host;
    const neighboursBefore = JSON.stringify([slides()[1], slides()[2]]);
    const xBefore = objectById(0, 'text-1').xPercent as number;

    // Edit on slide 1: double click opens the caret, typing goes through onUpdateSlide.
    await doubleClickElement(objectElement(host, 'text-1'));
    const editor = await typeIntoEditor(host, 'Slide one edited');
    expect(objectById(0, 'text-1').text).toBe('Slide one edited');
    await pressKey(editor, { key: 'Escape' });

    // Move the still-selected object (keyboard nudge → geometry write).
    await pressKey(window, { key: 'ArrowRight' });
    expect(objectById(0, 'text-1').xPercent as number).toBeGreaterThan(xBefore);

    // The neighbouring slides must be byte-identical to the baseline.
    expect(JSON.stringify([slides()[1], slides()[2]]), 'Slides 2/3 tief unverändert').toBe(neighboursBefore);

    // Navigate away (PageDown) and back (PageUp): the slide-1 edit survives.
    await pressKey(window, { key: 'PageDown' });
    expect(sceneObjectIdsOf(0)).toBeDefined();
    expect(objectElement(host, 'text-2'), 'Slide 2 ist aktiv').not.toBeNull();
    await pressKey(window, { key: 'PageUp' });
    expect(objectElement(host, 'text-1'), 'zurück auf Slide 1').not.toBeNull();
    expect(objectById(0, 'text-1').text).toBe('Slide one edited');
    expect(objectById(0, 'text-1').xPercent as number).toBeGreaterThan(xBefore);
    expect(JSON.stringify([slides()[1], slides()[2]])).toBe(neighboursBefore);
  });

  it('Fall 2: undo after a slide switch reverts the last slide-1 edit and leaves slide 2 untouched', async () => {
    const outcome = await mount([
      slideWith('slide-1', [TEXT_OBJECT('text-1', 'Slide one')]),
      slideWith('slide-2', [TEXT_OBJECT('text-2', 'Slide two')]),
    ]);
    expect(outcome.error).toBeNull();
    const host = outcome.host;
    const slideTwoBefore = slideTitleJson(1);
    const xBefore = objectById(0, 'text-1').xPercent as number;

    // Select + move on slide 1 (one document commit).
    const object = objectElement(host, 'text-1');
    object.focus();
    await pressKey(object, { key: 'Enter' });
    await pressKey(window, { key: 'ArrowRight' });
    expect(objectById(0, 'text-1').xPercent as number).toBeGreaterThan(xBefore);

    // Switch to slide 2 and back.
    await pressKey(window, { key: 'PageDown' });
    expect(objectElement(host, 'text-2')).not.toBeNull();
    await pressKey(window, { key: 'PageUp' });
    expect(objectElement(host, 'text-1')).not.toBeNull();

    // Undo reverts the last document edit (the slide-1 nudge); slide 2 is untouched.
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(objectById(0, 'text-1').xPercent, 'Nudge auf Slide 1 rückgängig').toBeCloseTo(xBefore, 6);
    expect(slideTitleJson(1), 'Slide 2 unberührt').toBe(slideTwoBefore);
  });

  it('Fall 3: duplicating a slide regenerates unique scene-object ids', async () => {
    const outcome = await mount([
      slideWith('slide-1', [TEXT_OBJECT('text-1', 'Original'), SHAPE_OBJECT('shape-1')]),
    ]);
    expect(outcome.error).toBeNull();
    const host = outcome.host;

    await clickElement(duplicateButtonFor(host, 1));
    expect(slides(), 'Original + Duplikat').toHaveLength(2);
    const copyIds = sceneObjectIdsOf(1);
    expect(copyIds, 'kein Duplikat erbt die Original-IDs').not.toContain('text-1');
    expect(copyIds).not.toContain('shape-1');
    // IDs are unique across the whole deck — otherwise selection/drag/z-order is ambiguous.
    const allIds = slides().flatMap((_, index) => sceneObjectIdsOf(index));
    expect(new Set(allIds).size, 'alle Szenenobjekt-IDs deckweit eindeutig').toBe(allIds.length);
    // Content/kind survive the duplication.
    expect((slides()[1].sceneObjects ?? []).map((object) => (object as { kind?: string }).kind).sort()).toEqual(['shape', 'text']);
    expect((slides()[1].sceneObjects ?? []).map((object) => (object as { text?: string }).text)).toContain('Original');

    // The related productivity reuse path applies the same rule.
    const reused = reusePresentSlides(
      [slideWith('source', [TEXT_OBJECT('text-1', 'Original'), SHAPE_OBJECT('shape-1')])],
      new Set(['existing-slide']),
    );
    const reusedIds = (reused[0].sceneObjects ?? []).map((object) => object.id);
    expect(reusedIds).not.toContain('text-1');
    expect(reusedIds).not.toContain('shape-1');
    expect(new Set([...reusedIds, 'text-1', 'shape-1']).size).toBe(reusedIds.length + 2);
  });

  it('Fall 4: deleting a slide and undoing restores the slide and its objects exactly', async () => {
    const outcome = await mount([
      slideWith('slide-1', [TEXT_OBJECT('text-1', 'Slide one'), SHAPE_OBJECT('shape-1')]),
      slideWith('slide-2', [TEXT_OBJECT('text-2', 'Slide two')]),
    ]);
    expect(outcome.error).toBeNull();
    const host = outcome.host;
    const slideOneBefore = slideTitleJson(0);

    await clickElement(deleteButtonFor(host, 1));
    expect(slides()).toHaveLength(1);
    expect(slides()[0].id).toBe('slide-2');

    await pressKey(window, { key: 'z', ctrlKey: true });
    const restored = slides();
    expect(restored, 'beide Slides wieder da').toHaveLength(2);
    expect(restored.map((slide) => slide.id)).toEqual(['slide-1', 'slide-2']);
    expect(JSON.stringify(restored[0]), 'Slide und Objekte exakt wiederhergestellt').toBe(slideOneBefore);
    expect(host.querySelector('[data-present-object-id="text-1"]'), 'Objekte wieder gerendert').not.toBeNull();
  });

  it('Fall 5: 10 000-character Unicode text mounts, edits and exports without throwing', async () => {
    const piece = '🎉 Zeile mit Ümlauten & Emoji ✅\n';
    const longText = piece.repeat(Math.ceil(10_000 / piece.length) + 1);
    expect(longText.length).toBeGreaterThan(10_000);
    expect(longText).toContain('🎉');
    expect(longText).toContain('\n');

    const outcome = await mount([slideWith('slide-1', [TEXT_OBJECT('text-long', longText)])]);
    expect(outcome.error, 'Mount mit 10k-Unicode-Text ohne Throw').toBeNull();
    const host = outcome.host;

    // Stable DOM: two settling rounds agree (no endless render on the huge text).
    await settle();
    const firstSnapshot = host.innerHTML;
    await settle();
    expect(host.innerHTML, 'DOM stabil').toBe(firstSnapshot);
    expect(objectById(0, 'text-long').text, 'Text unverändert gespeichert').toBe(longText);

    // The export preview (mounted with the canvas) and a direct export render must not throw.
    const model = latest?.presentData;
    expect(model, 'presentData vorhanden').toBeTruthy();
    expect(() => buildPresentSlideSvg(slides()[0], model as never), 'Export-Preview ohne Throw').not.toThrow();

    // Editing the 10k text still works and keeps the payload intact.
    const object = objectElement(host, 'text-long');
    await doubleClickElement(object);
    const editor = host.querySelector<HTMLTextAreaElement>('[data-present-object-id="text-long"] textarea');
    expect(editor, 'Caret öffnet sich für den großen Text').not.toBeNull();
    expect(editor!.value.length).toBe(longText.length);
    await pressKey(editor!, { key: 'Escape' });
    expect(objectById(0, 'text-long').text).toBe(longText);
  });
});
