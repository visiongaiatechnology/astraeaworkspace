// @vitest-environment happy-dom
// STATUS: GOLD — Present Round 41: unified multi-object gesture preview (P0 performance contract)
//
// The native build lagged when a deck had text + widget + image and the user dragged a text/widget.
// Root cause part 1: the scene gesture committed the document (and one history entry) on every
// animation frame; only images had the local preview. Root cause part 2: the stage rebuilt the
// filtered object list on every render and passed fresh callbacks/style objects, so the memoized
// renderer could not skip unaffected objects.
//
// Contract proven here for move/resize/rotate on scene objects (text/widget/shape):
//   - during the gesture: only the LOCAL preview changes, `onUpdateDocument` receives 0 commits,
//   - on pointer-up: exactly ONE commit with the final geometry,
//   - one undo step reverts the whole gesture,
//   - cancel (pointercancel/blur/Escape) drops the preview with 0 commits.
// Real frame latency in the native WebView is NOT_TESTED here (happy-dom has no compositor); the
// measured thing is the commit/update shape, which is what caused the jank.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;

const TEXT_OBJECT = {
  id: 'text-1', kind: 'text', text: 'Drag me', xPercent: 20, yPercent: 20,
  widthPercent: 25, heightPercent: 12, fontSizePt: 22, fontWeight: 'semibold',
  color: '#0f172a', textAlign: 'left', opacity: 1, zIndex: 20,
};

const WIDGET_OBJECT = {
  id: 'widget-1', kind: 'widget', widgetType: 'quote', label: 'Quote', value: 'Stay focused',
  accentColor: '#2563eb', xPercent: 55, yPercent: 20, widthPercent: 25, heightPercent: 22,
  opacity: 1, zIndex: 21,
};

const IMAGE_OBJECT = {
  id: 'image-1', kind: 'image', name: 'Photo', altText: 'Photo',
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  xPercent: 20, yPercent: 55, widthPercent: 24, heightPercent: 16, zIndex: 25,
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;
let updates: WorkspaceDocument[] = [];

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function stubbedStageRect(): DOMRect {
    return {
      x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT,
      top: 0, left: 0, right: STAGE_WIDTH, bottom: STAGE_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  };
  updates = [];
  latest = null;
});

afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

function slideWithObjects(): PresentSlide {
  return {
    id: 'slide-1', title: '', subtitle: '', layout: 'blank', cards: [], speakerNotes: '',
    sceneObjects: [TEXT_OBJECT, WIDGET_OBJECT] as never,
    images: [IMAGE_OBJECT] as never,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-round-41', title: 'Present Round 41', kind: 'Present',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default',
    root_object_ids: [], objects: {},
    presentData: { slides: [slide], theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
}

function ControlledPresenter({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  latest = document;
  return createElement(PresentCanvas, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => {
      updates.push(next);
      setDocument(next);
    },
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
    root!.render(createElement(ControlledPresenter, { start: documentWith(slideWithObjects()) }));
  });
  return container;
}

async function settle(ms = 0): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function objectElement(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`object ${id} not rendered`);
  return element;
}

function objectEntry(id: string): Record<string, unknown> {
  const objects = (latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
  const object = objects.find((candidate) => candidate.id === id);
  if (!object) throw new Error(`object ${id} missing in the document`);
  return object;
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

/** Press, then N rAF-spaced moves, and finally release. Returns the update count after each frame. */
async function dragAcrossFrames(
  target: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  frames = 5,
): Promise<{ updatesPerFrame: number[]; leftPerFrame: string[] }> {
  await act(async () => {
    target.dispatchEvent(pointerEvent('pointerdown', from.x, from.y));
    await settle(30);
  });
  const updatesPerFrame: number[] = [];
  const leftPerFrame: string[] = [];
  for (let frame = 1; frame <= frames; frame += 1) {
    const x = from.x + ((to.x - from.x) * frame) / frames;
    const y = from.y + ((to.y - from.y) * frame) / frames;
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', x, y));
      await settle(30);
    });
    updatesPerFrame.push(updates.length);
    leftPerFrame.push((target as HTMLElement).style.left);
  }
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointerup', to.x, to.y));
    await settle(60);
  });
  return { updatesPerFrame, leftPerFrame };
}

describe('Present Round 41 — unified scene-object gesture preview (P0)', () => {
  it('text drag: 0 intermediate commits, local preview moves, exactly 1 commit on release + 1 undo step', async () => {
    const host = await mount();
    const startX = objectEntry('text-1').xPercent as number;
    const text = objectElement(host, 'text-1');

    const { updatesPerFrame, leftPerFrame } = await dragAcrossFrames(
      text,
      { x: 240, y: 140 },
      { x: 336, y: 140 },
    );
    expect(updatesPerFrame, 'keine Zwischen-Commits über die rAF-Frames').toEqual([0, 0, 0, 0, 0]);
    expect(leftPerFrame.filter((left, index) => index === 0 || left !== leftPerFrame[index - 1]).length, 'Preview bewegt sich pro Frame').toBeGreaterThan(1);
    expect(updates, 'genau ein Commit bei pointerup').toHaveLength(1);
    const dragDelta = ((336 - 240) / STAGE_WIDTH) * 100;
    expect(objectEntry('text-1').xPercent, 'finale Geometrie').toBeCloseTo(startX + dragDelta, 3);

    // One undo step reverts the whole gesture.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await settle(60);
    });
    expect(objectEntry('text-1').xPercent, 'ein Undo stellt die Startposition wieder her').toBeCloseTo(startX, 6);
  });

  it('widget drag: same local-preview contract with mixed text/widget/image content', async () => {
    const host = await mount();
    const startX = objectEntry('widget-1').xPercent as number;
    const widget = objectElement(host, 'widget-1');

    const { updatesPerFrame } = await dragAcrossFrames(
      widget,
      { x: 600, y: 160 },
      { x: 648, y: 160 },
    );
    expect(updatesPerFrame, 'keine Zwischen-Commits (Widget)').toEqual([0, 0, 0, 0, 0]);
    expect(updates, 'ein Commit bei pointerup (Widget)').toHaveLength(1);
    expect(objectEntry('widget-1').xPercent).toBeCloseTo(startX + (48 / STAGE_WIDTH) * 100, 3);
    // The other objects were not touched by the widget drag.
    expect(objectEntry('text-1').xPercent).toBe(20);
    expect((latest?.presentData?.slides?.[0]?.images?.[0] as { xPercent: number }).xPercent).toBe(20);
  });

  it('resize handle: 0 intermediate commits, 1 commit on release', async () => {
    const host = await mount();
    const text = objectElement(host, 'text-1');
    await act(async () => {
      text.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await settle(30);
    });
    const widthBefore = objectEntry('text-1').widthPercent as number;
    const handle = host.querySelector<HTMLElement>('[data-present-object-id="text-1"] [data-present-handle="resize-se"]');
    expect(handle, 'resize handle rendered').not.toBeNull();

    const { updatesPerFrame } = await dragAcrossFrames(handle!, { x: 400, y: 200 }, { x: 430, y: 200 });
    expect(updatesPerFrame, 'keine Zwischen-Commits beim Resize').toEqual([0, 0, 0, 0, 0]);
    expect(updates, 'ein Commit beim Resize-Release').toHaveLength(1);
    expect(objectEntry('text-1').widthPercent as number).toBeGreaterThan(widthBefore);
  });

  it('rotate handle: 0 intermediate commits, 1 commit on release', async () => {
    const host = await mount();
    const text = objectElement(host, 'text-1');
    await act(async () => {
      text.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await settle(30);
    });
    const handle = host.querySelector<HTMLElement>('[data-present-object-id="text-1"] [data-present-handle="rotate"]');
    expect(handle, 'rotate handle rendered').not.toBeNull();

    const { updatesPerFrame } = await dragAcrossFrames(handle!, { x: 300, y: 90 }, { x: 360, y: 120 });
    expect(updatesPerFrame, 'keine Zwischen-Commits beim Rotate').toEqual([0, 0, 0, 0, 0]);
    expect(updates, 'ein Commit beim Rotate-Release').toHaveLength(1);
    expect(Math.abs(objectEntry('text-1').rotation as number)).toBeGreaterThan(1);
  });

  it('pointercancel during a scene drag drops the preview without any commit', async () => {
    const host = await mount();
    const startX = objectEntry('text-1').xPercent as number;
    const text = objectElement(host, 'text-1');

    await act(async () => {
      text.dispatchEvent(pointerEvent('pointerdown', 240, 140));
      await settle(30);
    });
    for (let frame = 1; frame <= 4; frame += 1) {
      await act(async () => {
        window.dispatchEvent(pointerEvent('pointermove', 240 + frame * 20, 140));
        await settle(30);
      });
    }
    expect(updates, 'kein Commit während des Drags').toHaveLength(0);
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointercancel', 320, 140));
      await settle(60);
    });
    expect(updates, 'pointercancel schreibt nichts').toHaveLength(0);
    expect(objectEntry('text-1').xPercent, 'Dokument auf Startposition').toBeCloseTo(startX, 6);
    expect(text.style.left, 'Preview verworfen').toBe(`${startX}%`);
  });
});
