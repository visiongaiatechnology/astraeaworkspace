// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1 (PR-001/002/004/005/008): the text box is draggable AND editable
//
// Before this file: a text object rendered a permanently focused `<textarea>` whose
// `onPointerDown` called `stopPropagation`, so the surrounding move gesture never started —
// a text box could not be dragged with the mouse at all (PR-005, the reported defect). There was
// also no edit mode: the caret existed all the time and Enter only selected.
//
// The tests drive the real `PresentCanvas` with real pointer/keyboard/input events and assert on
// the **document** the editor publishes — not on internal component state.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';

vi.setConfig({ testTimeout: 60_000 });

const SLIDE: PresentSlide = {
  id: 'slide-1',
  title: '',
  subtitle: '',
  layout: 'blank',
  cards: [],
  speakerNotes: '',
  sceneObjects: [{
    id: 'obj-1',
    kind: 'text',
    xPercent: 10,
    yPercent: 10,
    widthPercent: 30,
    heightPercent: 20,
    text: 'Hallo',
    color: '#ffffff',
    fontSizePt: 24,
    fontWeight: 'normal',
    textAlign: 'left',
    opacity: 1,
    zIndex: 20,
  }],
} as PresentSlide;

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-m1-interaction',
    title: 'Present M1',
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

async function mount(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith(SLIDE) }));
  });
  return container;
}

function objectElement(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-object-id="obj-1"]');
  if (!element) throw new Error('text object not rendered');
  return element;
}

function textObject(): { xPercent: number; text: string } {
  const slides = latest?.presentData?.slides ?? [];
  const object = (slides[0]?.sceneObjects ?? []).find((candidate) => candidate.id === 'obj-1') as
    | { xPercent: number; text: string }
    | undefined;
  if (!object) throw new Error('text object missing in the published document');
  return object;
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

describe('Present M1 — text object drag (PR-005)', () => {
  it('renders a preview instead of a permanently focused textarea', async () => {
    const host = await mount();
    expect(objectElement(host)).not.toBeNull();
    expect(host.querySelector('[data-present-text-preview="true"]'), 'Vorschau statt Dauer-Caret').not.toBeNull();
    expect(host.querySelector('textarea'), 'kein Editor ohne Editiermodus').toBeNull();
  });

  it('moves a text object with a pointer drag and publishes the new position', async () => {
    const host = await mount();
    const object = objectElement(host);
    const before = textObject().xPercent;

    /**
     * happy-dom has no layout engine: every `getBoundingClientRect()` returns 0×0, and the gesture
     * math correctly refuses to move anything without a canvas size (`rect.width <= 0`). The stage
     * is stubbed with a real 16:9 size so the *shipped* gesture code runs its real arithmetic.
     */
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (): DOMRect {
      return {
        x: 0, y: 0, width: 960, height: 540, top: 0, left: 0, right: 960, bottom: 540,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      await act(async () => {
        object.dispatchEvent(new MouseEvent('pointerdown', {
          bubbles: true, cancelable: true, clientX: 100, clientY: 100, button: 0,
        }));
        await new Promise<void>((resolve) => { setTimeout(resolve, 30); });
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('pointermove', {
          bubbles: true, cancelable: true, clientX: 292, clientY: 100,
        }));
        // The stage coalesces pointer storms to one bounded update per frame.
        await new Promise<void>((resolve) => { setTimeout(resolve, 60); });
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('pointerup', {
          bubbles: true, cancelable: true, clientX: 292, clientY: 100,
        }));
        await new Promise<void>((resolve) => { setTimeout(resolve, 60); });
      });
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }

    expect(textObject().xPercent, 'die Position wurde verschoben').toBeGreaterThan(before);
  });
});

describe('Present M1 — text editing (PR-004/PR-005)', () => {
  it('enters the edit mode on a double click and shows the object text', async () => {
    const host = await mount();
    const object = objectElement(host);
    await act(async () => {
      object.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await settle();
    });
    const editor = host.querySelector<HTMLTextAreaElement>('[data-present-object-id="obj-1"] textarea');
    expect(editor, 'Doppelklick öffnet den Editor').not.toBeNull();
    expect(editor!.value).toBe('Hallo');
  });

  it('writes typed text into the document and leaves the mode on Escape', async () => {
    const host = await mount();
    await act(async () => {
      objectElement(host).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await settle();
    });
    const editor = host.querySelector<HTMLTextAreaElement>('[data-present-object-id="obj-1"] textarea')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(editor, 'Hallo Welt');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    });
    expect(textObject().text, 'der Text geht über enUpdateSlide ins Dokument').toBe('Hallo Welt');

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
    });
    expect(host.querySelector('[data-present-object-id="obj-1"] textarea'), 'Escape verlässt den Modus').toBeNull();
    expect(host.querySelector('[data-present-text-preview="true"]')).not.toBeNull();
  });
});

describe('Present M1 — a new deck starts blank (PR-002)', () => {
  it('creates exactly one empty 16:9 slide without demo cards', () => {
    const fresh = createNewDocument('Present' as never) as WorkspaceDocument;
    const slides = fresh.presentData?.slides ?? [];
    expect(slides, 'eine Folie').toHaveLength(1);
    expect(slides[0]!.layout).toBe('blank');
    expect(slides[0]!.title).toBe('');
    expect(slides[0]!.subtitle).toBe('');
    expect(slides[0]!.cards ?? [], 'keine gespeicherten Beispielkarten').toEqual([]);
    expect(slides[0]!.speakerNotes ?? '').toBe('');
  });
});
