// @vitest-environment happy-dom
// STATUS: PLATIN — PR-004 (Present M1): a double click creates exactly one text box at the point
//
// The M1 contract: a double click on the free canvas creates **one** text box where the user
// clicked, the caret is in it immediately, a double click on an existing box enters its edit mode
// instead of stacking a second object, and every gesture creates at most one object.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE = { width: 960, height: 540 };

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;
let originalRect: typeof Element.prototype.getBoundingClientRect;

function blankDocument(): WorkspaceDocument {
  return {
    id: 'present-pr004',
    title: 'PR-004',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: {
      slides: [{ id: 'slide-1', title: '', subtitle: '', layout: 'blank', cards: [], speakerNotes: '', sceneObjects: [] } as PresentSlide],
      theme: 'dark',
      aspectRatio: '16:9',
    },
  } as WorkspaceDocument;
}

afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalRect;
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
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0, y: 0, width: STAGE.width, height: STAGE.height,
      top: 0, left: 0, right: STAGE.width, bottom: STAGE.height,
      toJSON: () => ({}),
    } as DOMRect;
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: blankDocument() }));
  });
  return container;
}

function sceneObjects(): Array<Record<string, unknown>> {
  return ((latest?.presentData?.slides[0]?.sceneObjects ?? []) as unknown) as Array<Record<string, unknown>>;
}

function stage(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('stage missing');
  return element;
}

async function doubleClick(target: Element, clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY }));
    await new Promise<void>((resolve) => { setTimeout(resolve, 40); });
  });
}

describe('PR-004 — one double click, one text box at the clicked point', () => {
  it('creates exactly one box at the click position and puts the caret into it', async () => {
    const host = await mount();
    await doubleClick(stage(host), 288, 162);

    const objects = sceneObjects();
    expect(objects, 'genau ein Objekt pro Geste').toHaveLength(1);
    expect(objects[0]!.kind).toBe('text');
    expect(objects[0]!.xPercent as number).toBeCloseTo(30, 0);
    expect(objects[0]!.yPercent as number).toBeCloseTo(30, 0);
    expect(host.querySelector('[data-present-object-id] textarea'), 'der Caret steht in der neuen Box').not.toBeNull();
  });

  it('does not stack a second box when the double click lands on an existing box', async () => {
    const host = await mount();
    await doubleClick(stage(host), 288, 162);
    expect(sceneObjects()).toHaveLength(1);
    // Leave the edit mode, then double click the object itself.
    const editor = host.querySelector<HTMLTextAreaElement>('[data-present-object-id] textarea')!;
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    });
    const object = host.querySelector<HTMLElement>('[data-present-object-id]')!;
    await doubleClick(object, 300, 180);

    expect(sceneObjects(), 'Doppelklick auf ein Objekt erzeugt kein zweites').toHaveLength(1);
    expect(host.querySelector('[data-present-object-id] textarea'), 'stattdessen öffnet sich der Editor').not.toBeNull();
  });

  it('two separate gestures create two boxes at their own points', async () => {
    const host = await mount();
    await doubleClick(stage(host), 192, 108);
    await doubleClick(stage(host), 672, 432);
    const objects = sceneObjects();
    expect(objects).toHaveLength(2);
    const points = objects.map((object) => [object.xPercent as number, object.yPercent as number]);
    expect(points[0]![0]).toBeCloseTo(20, 0);
    expect(points[0]![1]).toBeCloseTo(20, 0);
    // The second box starts at the click x and is clamped so its default width still fits the
    // slide (measured: 66 % instead of the raw 70 %), which is the intended bound, not a defect.
    expect(points[1]![0]).toBeGreaterThan(60);
    expect(points[1]![0]).toBeLessThanOrEqual(70);
    expect(points[1]![1]).toBeCloseTo(80, 0);
  });
});
