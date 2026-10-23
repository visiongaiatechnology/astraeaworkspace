// @vitest-environment happy-dom
// STATUS: PLATIN — PR-003 (Present M1): objects inserted by the shell are real scene objects
//
// The second-authority audit kept PR-003 at PARTIAL (unit/model only). This witness mounts a
// document whose shape and chart were inserted by the **shell** actions and drives the canvas:
// both are rendered as scene objects, the shape is selectable, it shows the transform handles and
// a pointer drag publishes the new geometry into the document.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { insertChartToDoc, insertShapeToDoc } from '../../../../shared/workspace/operations/documentActions';

vi.setConfig({ testTimeout: 60_000 });

const STAGE = { width: 960, height: 540 };

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;
let originalRect: typeof Element.prototype.getBoundingClientRect;

function blankDocument(): WorkspaceDocument {
  return {
    id: 'present-shell-objects',
    title: 'Shell Objects',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: {
      slides: [{
        id: 'slide-1', title: '', subtitle: '', layout: 'blank', cards: [], speakerNotes: '', sceneObjects: [],
      }],
      theme: 'dark',
      aspectRatio: '16:9',
    },
  } as WorkspaceDocument;
}

/** The document a user gets when both shell insert actions ran on an open presentation. */
function documentWithShellObjects(): WorkspaceDocument {
  const withShape = insertShapeToDoc(blankDocument(), 'rectangle').updatedDoc;
  return insertChartToDoc(withShape).updatedDoc;
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
    root!.render(createElement(ControlledPresenter, { start: documentWithShellObjects() }));
  });
  return container;
}

function objects(): Array<Record<string, unknown>> {
  return ((latest?.presentData?.slides[0]?.sceneObjects ?? []) as unknown) as Array<Record<string, unknown>>;
}

async function flush(ms = 60): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

describe('PR-003 — shell-inserted objects are rendered and operable as scene objects', () => {
  it('renders both the shell shape and the shell chart as scene objects', async () => {
    const host = await mount();
    const elements = host.querySelectorAll('[data-present-object-id]');
    expect(elements, 'beide Shell-Objekte sind echte Szenenobjekte').toHaveLength(2);
    const kinds = objects().map((object) => object.kind);
    expect(kinds).toContain('shape');
    expect(kinds).toContain('chart');
    // The legacy family stays untouched: no card list, no chart layout switch.
    const slide = latest!.presentData!.slides[0] as unknown as Record<string, unknown>;
    expect(slide.layout).toBe('blank');
    expect(slide.chartReferenceId).toBeUndefined();
    expect((slide.cards as unknown[] | undefined) ?? []).toHaveLength(0);
  });

  it('selects the shell shape and offers its transform handles', async () => {
    const host = await mount();
    const shape = Array.from(host.querySelectorAll<HTMLElement>('[data-present-object-id]'))
      .find((element) => objects().find((object) => object.id === element.dataset.presentObjectId)?.kind === 'shape')!;
    await act(async () => {
      shape.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 600, clientY: 300, button: 0 }));
      shape.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 600, clientY: 300, button: 0 }));
    });
    await flush();
    const selected = host.querySelector(`[data-present-object-id="${shape.dataset.presentObjectId}"][data-present-object-selected="true"]`);
    expect(selected, 'die Shell-Form ist selektierbar').not.toBeNull();
    expect(host.querySelector('[data-present-handle="resize-se"]'), 'mit echten Transform-Handles').not.toBeNull();
  });

  it('moves the shell shape with a pointer drag and publishes the geometry', async () => {
    const host = await mount();
    const shape = Array.from(host.querySelectorAll<HTMLElement>('[data-present-object-id]'))
      .find((element) => objects().find((object) => object.id === element.dataset.presentObjectId)?.kind === 'shape')!;
    const shapeId = shape.dataset.presentObjectId!;
    const before = (objects().find((object) => object.id === shapeId)!.xPercent) as number;

    await act(async () => {
      shape.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 500, clientY: 250, button: 0 }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 30); });
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 596, clientY: 250 }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 60); });
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 596, clientY: 250 }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 60); });
    });

    const after = objects().find((object) => object.id === shapeId)!.xPercent as number;
    expect(after, 'die Shell-Form ist frei bewegbar').toBeGreaterThan(before);
  });
});
