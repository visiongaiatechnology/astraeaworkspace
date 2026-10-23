// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1 USER PATH: create → type → move → resize → save → reopen
//
// This is the integration witness for the M1 goal: "eine Folie mit frei beweglichen,
// skalierbaren und editierbaren Text- und Formobjekten erstellen, speichern und wieder öffnen".
// It drives the real `PresentCanvas` and asserts on the **published document** after every step,
// then sends that document through the shipped canonical save/read pair.
//
// The native Windows probe remains PR-010 (`NATIVE_UNVERIFIED`); this test proves the browser
// contract, not the desktop one.
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

const STAGE = { width: 960, height: 540 };

const BLANK_SLIDE: PresentSlide = {
  id: 'slide-m1',
  title: '',
  subtitle: '',
  layout: 'blank',
  cards: [],
  speakerNotes: '',
  sceneObjects: [],
} as PresentSlide;

function documentWithScene(): WorkspaceDocument {
  return {
    id: 'present-m1-user-path',
    title: 'M1 User Path',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides: [BLANK_SLIDE], theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;
let originalRect: typeof Element.prototype.getBoundingClientRect;

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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWithScene() }));
  });
  return container;
}

/** 16:9 stage geometry for the shipped gesture math (happy-dom reports 0×0 rects). */
function stubStageGeometry(): void {
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0, y: 0, width: STAGE.width, height: STAGE.height,
      top: 0, left: 0, right: STAGE.width, bottom: STAGE.height,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

function sceneObjects(): Array<Record<string, unknown>> {
  const objects = (latest?.presentData?.slides[0]?.sceneObjects ?? []) as unknown;
  return objects as Array<Record<string, unknown>>;
}

async function flush(ms = 60): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

async function dispatchPointer(
  target: Element | Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
  });
  await flush();
}

describe('Present M1 user path — create, edit, move, resize, save/reopen', () => {
  it('runs the whole M1 goal through the real UI and the canonical document path', async () => {
    stubStageGeometry();
    const host = await mount();

    // 1. Create: double click on the free canvas creates exactly one text box at the point.
    const stage = host.querySelector<HTMLElement>('[data-present-stage="true"]');
    expect(stage, 'die Folienfläche muss gerendert sein').not.toBeNull();
    await act(async () => {
      stage!.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true, cancelable: true, clientX: 288, clientY: 162,
      }));
    });
    await flush();
    expect(sceneObjects(), 'genau ein Textobjekt nach dem Doppelklick').toHaveLength(1);
    const created = sceneObjects()[0]!;
    expect(created.kind).toBe('text');
    // 288/960 = 30 %, 162/540 = 30 % — the box is created where the user clicked.
    expect(created.xPercent as number).toBeCloseTo(30, 0);
    expect(created.yPercent as number).toBeCloseTo(30, 0);

    // 2. Edit: the creation enters the edit mode, typing writes into the document.
    const editor = host.querySelector<HTMLTextAreaElement>('[data-present-object-id] textarea');
    expect(editor, 'die neue Textbox hat den Caret').not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(editor, 'M1 Text');
      editor!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(sceneObjects()[0]!.text).toBe('M1 Text');
    await act(async () => {
      editor!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await flush();
    expect(host.querySelector('[data-present-object-id] textarea'), 'Escape beendet die Eingabe').toBeNull();

    // 3. Move: drag the object by 10 % of the stage in both axes.
    const box = host.querySelector<HTMLElement>('[data-present-object-id]')!;
    const startX = sceneObjects()[0]!.xPercent as number;
    const startY = sceneObjects()[0]!.yPercent as number;
    await dispatchPointer(box, 'pointerdown', 300, 180);
    await dispatchPointer(window, 'pointermove', 396, 234);
    await dispatchPointer(window, 'pointerup', 396, 234);
    expect(sceneObjects()[0]!.xPercent as number, 'um 10 % nach rechts').toBeGreaterThan(startX + 5);
    expect(sceneObjects()[0]!.yPercent as number, 'um 10 % nach unten').toBeGreaterThan(startY + 5);

    // 4. Resize: the selected object exposes the corner handles; drag se grows the box.
    const widthBefore = sceneObjects()[0]!.widthPercent as number;
    const handle = host.querySelector<HTMLElement>('[data-present-handle="resize-se"]');
    expect(handle, 'das se-Handle muss am selektierten Objekt existieren').not.toBeNull();
    await dispatchPointer(handle!, 'pointerdown', 500, 300);
    await dispatchPointer(window, 'pointermove', 596, 354);
    await dispatchPointer(window, 'pointerup', 596, 354);
    expect(sceneObjects()[0]!.widthPercent as number, 'die Breite wächst').toBeGreaterThan(widthBefore);

    // 5. Save/reopen: the canonical writer/reader keeps every property the user just set.
    const saved = serializeWorkspaceDocumentCanonical(latest!);
    const reopened = deserializeWorkspaceDocumentCanonical(saved);
    const reopenedObjects = (reopened.presentData?.slides[0]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
    expect(reopenedObjects).toHaveLength(1);
    expect(reopenedObjects[0]!.text).toBe('M1 Text');
    expect(reopenedObjects[0]!.xPercent).toBe(sceneObjects()[0]!.xPercent);
    expect(reopenedObjects[0]!.yPercent).toBe(sceneObjects()[0]!.yPercent);
    expect(reopenedObjects[0]!.widthPercent).toBe(sceneObjects()[0]!.widthPercent);
  });
});
